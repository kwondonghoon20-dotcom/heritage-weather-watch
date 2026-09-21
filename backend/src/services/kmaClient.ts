import fs from "fs";
import path from "path";
import { ENV } from "../config/env";
import { gridKey, type GridPoint } from "../domain/grid";

export interface LiveWeather {
  rain: number;
  wind: number;
  temp: number;
  humidity: number;
}

const KMA_BASE_URL = "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst";
const HOUR_MS = 3600 * 1000;
const KST_OFFSET_MS = 9 * HOUR_MS;
const CALL_TIMEOUT_MS = 8000;
// 응답 제한 시간(deadlineAt)이 지난 뒤에도 이미 나간 호출이 끝나길 기다려 주는 여유. 이 안에 못 끝난 호출은 끊는다.
const DEADLINE_GRACE_MS = 1500;
// 새 값을 못 받은 격자의 직전 값을 이만큼까지는 대신 보여준다(더 오래된 값은 오해를 부르므로 "값 없음").
const MAX_STALE_MS = 12 * HOUR_MS;
// 조회에 실패한 격자는 곧바로 다시 부르지 않는다: 2분 → 4분 → … 최대 1시간(호출량 보호)
const RETRY_BASE_MS = 2 * 60 * 1000;
const RETRY_MAX_MS = 60 * 60 * 1000;

// ── 캐시 구간 ────────────────────────────────────────────────────────────────
// 시계 기준(KST 0시부터 N시간 단위) 구간 번호. 같은 구간에서는 격자당 최대 1번만 조회한다 — 하루 호출량이 격자 수 × (24 ÷ N)으로 고정된다.
export function cacheBucket(nowMs: number, hours: number): number {
  return Math.floor((nowMs + KST_OFFSET_MS) / (hours * HOUR_MS));
}
export function bucketEndMs(bucket: number, hours: number): number {
  return (bucket + 1) * hours * HOUR_MS - KST_OFFSET_MS;
}

// weather 가 null 이면 "그 구간에 조회했더니 관측값이 없던(결측) 격자"다. 결측은 다시 물어도 같으므로 성공과 똑같이 구간 동안 유지한다.
interface GridEntry {
  weather: LiveWeather | null;
  bucket: number;
  fetchedAt: number;
}
const entries = new Map<string, GridEntry>();
const failures = new Map<string, { count: number; retryAt: number }>();
const inflight = new Map<string, Promise<void>>();

export interface GridReading {
  weather: LiveWeather | null;
  fresh: boolean; // 현재 캐시 구간에 조회한 값인가(false 면 직전 구간의 값을 대신 보여주는 중)
  fetchedAt: number;
}

export function readGrid(grid: GridPoint): GridReading | undefined {
  const e = entries.get(gridKey(grid));
  if (!e || Date.now() - e.fetchedAt > MAX_STALE_MS) return undefined;
  return { weather: e.weather, fresh: e.bucket === cacheBucket(Date.now(), ENV.kmaCacheHours), fetchedAt: e.fetchedAt };
}

export function isBackingOff(grid: GridPoint): boolean {
  const f = failures.get(gridKey(grid));
  return !!f && f.retryAt > Date.now();
}

// ── 하루 호출 예산(KST 날짜 기준) ─────────────────────────────────────────────
// 상한에 닿으면 더 부르지 않고 직전 값(없으면 "데이터 없음")으로 처리해 일일 한도를 넘기지 않는다.
let budgetDay = "";
let callsToday = 0;
let budgetWarned = false;
function kstDay(): string {
  return new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);
}
function rollBudgetDay(): void {
  const day = kstDay();
  if (day !== budgetDay) {
    budgetDay = day;
    callsToday = 0;
    budgetWarned = false;
  }
}
function spendBudget(): boolean {
  rollBudgetDay();
  if (callsToday >= ENV.kmaDailyCallLimit) {
    if (!budgetWarned) {
      console.error(`[kmaClient] 일일 호출 상한(${ENV.kmaDailyCallLimit}건)에 도달 — 오늘은 더 조회하지 않습니다.`);
      budgetWarned = true;
    }
    return false;
  }
  callsToday += 1;
  scheduleSave();
  return true;
}
export function isBudgetExhausted(): boolean {
  rollBudgetDay();
  return callsToday >= ENV.kmaDailyCallLimit;
}
export function getKmaCallStats(): { day: string; calls: number; limit: number } {
  return { day: budgetDay || kstDay(), calls: budgetDay === kstDay() ? callsToday : 0, limit: ENV.kmaDailyCallLimit };
}

// ── 기상청 호출 ───────────────────────────────────────────────────────────────
// 초단기실황(getUltraSrtNcst)은 매시 40분에 생성되어 배포 지연이 있을 수 있으므로,
// 안전 마진을 두고 45분 이전이면 이전 시각 발표값을 사용한다.
function computeBaseDateTime(now: Date): { baseDate: string; baseTime: string } {
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  let hour = kst.getHours();
  const minute = kst.getMinutes();
  if (minute < 45) hour -= 1;
  if (hour < 0) {
    kst.setDate(kst.getDate() - 1);
    hour = 23;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const baseDate = `${kst.getFullYear()}${pad(kst.getMonth() + 1)}${pad(kst.getDate())}`;
  const baseTime = `${pad(hour)}00`;
  return { baseDate, baseTime };
}

class MissingObservationError extends Error {
  constructor() {
    super("관측값 결측");
  }
}

async function fetchOnce(grid: GridPoint, baseDate: string, baseTime: string, deadlineAt?: number): Promise<LiveWeather> {
  const params = new URLSearchParams({
    serviceKey: ENV.kmaApiKey,
    pageNo: "1",
    numOfRows: "20",
    dataType: "JSON",
    base_date: baseDate,
    base_time: baseTime,
    nx: String(grid.nx),
    ny: String(grid.ny),
  });

  // 응답 제한 시간이 있으면 그 직후까지만 기다린다(느린 호출 하나가 함수 제한 시간을 넘기게 두지 않는다).
  const timeoutMs = deadlineAt === undefined ? CALL_TIMEOUT_MS : Math.min(CALL_TIMEOUT_MS, Math.max(500, deadlineAt + DEADLINE_GRACE_MS - Date.now()));
  const res = await fetch(`${KMA_BASE_URL}?${params.toString()}`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json: any = await res.json();
  if (json?.response?.header?.resultCode !== "00") {
    throw new Error(json?.response?.header?.resultMsg ?? "알 수 없는 응답 코드");
  }
  const items = json?.response?.body?.items?.item;
  if (!Array.isArray(items)) throw new Error("응답 형식이 예상과 다름 (items.item 배열 아님)");

  const byCategory = new Map<string, string>(items.map((it: any) => [it.category, it.obsrValue]));
  const num = (key: string): number => {
    const v = Number(byCategory.get(key));
    return Number.isFinite(v) ? v : 0;
  };
  const weather = { rain: num("RN1"), wind: num("WSD"), temp: num("T1H"), humidity: num("REH") };
  // 관측값이 없는 격자는 -999·-998.9 같은 결측 표시로 내려온다(2026-09-21 인천 영종구 격자에서 확인). 이를 실제 값으로 계산에 넣으면
  // 영하 999도로 점수가 왜곡되므로 "데이터 없음"으로 다룬다.
  if (Object.values(weather).some((v) => v < -900)) throw new MissingObservationError();
  return weather;
}

type Outcome = { kind: "ok"; weather: LiveWeather } | { kind: "missing" } | { kind: "failed" } | { kind: "skipped" };

// 일시적 실패(타임아웃·5xx 등)에 대비해 한 번만 다시 시도한다. 시도마다 호출 예산을 쓴다.
async function fetchGridWeather(grid: GridPoint, baseDate: string, baseTime: string, deadlineAt?: number): Promise<Outcome> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (!spendBudget()) return { kind: "skipped" };
    try {
      return { kind: "ok", weather: await fetchOnce(grid, baseDate, baseTime, deadlineAt) };
    } catch (err) {
      if (err instanceof MissingObservationError) return { kind: "missing" }; // 결측은 다시 물어도 같으므로 재시도하지 않는다
      const pastDeadline = deadlineAt !== undefined && Date.now() >= deadlineAt;
      if (attempt === 2 || pastDeadline) {
        console.error(`[kmaClient] 격자(${grid.nx},${grid.ny}) 조회 실패:`, err instanceof Error ? err.message : String(err));
        return { kind: "failed" };
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  return { kind: "failed" };
}

// 격자 하나를 새로 조회해 캐시에 넣는다. 같은 격자를 이미 조회 중이면 그 조회를 기다린다(요청이 겹쳐도 호출은 한 번).
// 실패하면 캐시에 직전 값이 그대로 남고, 그 격자는 백오프 시간 동안 다시 조회하지 않는다.
export function refreshGrid(grid: GridPoint, deadlineAt?: number): Promise<void> {
  const key = gridKey(grid);
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = (async () => {
    const bucket = cacheBucket(Date.now(), ENV.kmaCacheHours);
    const { baseDate, baseTime } = computeBaseDateTime(new Date());
    const outcome = await fetchGridWeather(grid, baseDate, baseTime, deadlineAt);
    if (outcome.kind === "ok" || outcome.kind === "missing") {
      entries.set(key, { weather: outcome.kind === "ok" ? outcome.weather : null, bucket, fetchedAt: Date.now() });
      failures.delete(key);
      scheduleSave();
    } else if (outcome.kind === "failed") {
      const count = (failures.get(key)?.count ?? 0) + 1;
      failures.set(key, { count, retryAt: Date.now() + Math.min(RETRY_BASE_MS * 2 ** (count - 1), RETRY_MAX_MS) });
    }
    // skipped(예산 소진)는 아무것도 기록하지 않는다 — isBudgetExhausted() 로 따로 알 수 있다.
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// ── 개발용 디스크 캐시 ────────────────────────────────────────────────────────
// tsx watch 가 재시작해도 이번 구간에 이미 조회한 격자와 오늘 호출 수를 이어받는다. 파일이 없거나 깨져 있으면 조용히 빈 상태로 시작한다.
const DISK_PATH = path.resolve(__dirname, "../../../.cache/kma-grid-cache.json");
interface DiskState {
  v: 1;
  day: string;
  calls: number;
  entries: Array<[string, GridEntry]>;
}

function loadDisk(): void {
  try {
    const state: DiskState = JSON.parse(fs.readFileSync(DISK_PATH, "utf8"));
    if (state?.v !== 1 || !Array.isArray(state.entries)) return;
    const now = Date.now();
    for (const [key, e] of state.entries) {
      if (typeof key === "string" && e && typeof e.fetchedAt === "number" && now - e.fetchedAt <= MAX_STALE_MS) entries.set(key, e);
    }
    if (state.day === kstDay() && Number.isFinite(state.calls)) {
      budgetDay = state.day;
      callsToday = state.calls;
    }
    console.log(`[kmaClient] 디스크 캐시 복원: 격자 ${entries.size}개, 오늘 호출 ${callsToday}건`);
  } catch {
    // 파일 없음·손상 — 빈 상태로 시작
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSave(): void {
  if (!ENV.kmaDiskCache || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    try {
      rollBudgetDay();
      fs.mkdirSync(path.dirname(DISK_PATH), { recursive: true });
      const state: DiskState = { v: 1, day: budgetDay, calls: callsToday, entries: [...entries] };
      fs.writeFileSync(DISK_PATH, JSON.stringify(state));
    } catch (err) {
      console.warn("[kmaClient] 디스크 캐시 저장 실패:", err instanceof Error ? err.message : err);
    }
  }, 300);
  saveTimer.unref?.();
}

if (ENV.kmaDiskCache) loadDisk();

// 테스트에서 캐시·백오프·호출 카운터를 비운다(디스크 파일은 건드리지 않는다).
export function resetKmaStateForTests(): void {
  entries.clear();
  failures.clear();
  inflight.clear();
  budgetDay = "";
  callsToday = 0;
  budgetWarned = false;
}
