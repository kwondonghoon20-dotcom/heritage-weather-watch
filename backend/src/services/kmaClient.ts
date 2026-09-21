import { ENV } from "../config/env";
import type { GridPoint } from "../domain/grid";
import { TtlCache } from "../cache/ttlCache";

export interface LiveWeather {
  rain: number;
  wind: number;
  temp: number;
  humidity: number;
}

const KMA_BASE_URL = "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst";
// 초단기실황은 시간 단위(매시 발표)라 같은 발표 시각 안에서는 값이 바뀌지 않는다. 그래서 캐시 키에 발표 시각(base_date+base_time)을
// 넣고 최대 1시간 유지한다 — 시각이 바뀌면 키가 달라져 자연스럽게 새로 조회한다. 실패한 조회는 잠깐만 기억해 곧 재시도한다.
const SUCCESS_TTL = 60 * 60 * 1000;
const FAILURE_TTL = 2 * 60 * 1000;
const cache = new TtlCache<LiveWeather | null>(SUCCESS_TTL);

// 하루 호출 예산(KST 날짜 기준). 상한에 닿으면 더 부르지 않고 "데이터 없음"으로 처리해 일일 한도를 넘기지 않는다.
let budgetDay = "";
let callsToday = 0;
let budgetWarned = false;
function kstDay(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function spendBudget(): boolean {
  const day = kstDay();
  if (day !== budgetDay) {
    budgetDay = day;
    callsToday = 0;
    budgetWarned = false;
  }
  if (callsToday >= ENV.kmaDailyCallLimit) {
    if (!budgetWarned) {
      console.error(`[kmaClient] 일일 호출 상한(${ENV.kmaDailyCallLimit}건)에 도달 — 오늘은 더 조회하지 않습니다.`);
      budgetWarned = true;
    }
    return false;
  }
  callsToday += 1;
  return true;
}
export function getKmaCallStats(): { day: string; calls: number; limit: number } {
  return { day: budgetDay || kstDay(), calls: budgetDay === kstDay() ? callsToday : 0, limit: ENV.kmaDailyCallLimit };
}

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

async function fetchOnce(grid: GridPoint, baseDate: string, baseTime: string): Promise<LiveWeather> {
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

  const res = await fetch(`${KMA_BASE_URL}?${params.toString()}`, { signal: AbortSignal.timeout(8000) });
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
  // 관측값이 없는 격자는 -999·-998.9 같은 결측 표시로 내려온다(2026-09-21 인천 영종구 대표 격자에서 확인). 이를 실제 값으로 계산에 넣으면
  // 영하 999도로 점수가 왜곡되므로 "데이터 없음"으로 다룬다.
  if (Object.values(weather).some((v) => v < -900)) throw new MissingObservationError();
  return weather;
}

class MissingObservationError extends Error {
  constructor() {
    super("관측값 결측");
  }
}

// 일시적 실패(타임아웃·5xx 등)에 대비해 한 번만 다시 시도한다. 시도마다 호출 예산을 쓴다.
async function fetchGridWeather(grid: GridPoint, baseDate: string, baseTime: string): Promise<LiveWeather | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (!spendBudget()) return null;
    try {
      return await fetchOnce(grid, baseDate, baseTime);
    } catch (err) {
      if (err instanceof MissingObservationError) return null; // 결측은 다시 물어도 같으므로 재시도하지 않는다
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === 2) {
        console.error(`[kmaClient] 격자(${grid.nx},${grid.ny}) 조회 실패:`, msg);
        return null;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  return null;
}

export async function getWeatherForGrid(grid: GridPoint): Promise<LiveWeather | null> {
  const { baseDate, baseTime } = computeBaseDateTime(new Date());
  const key = `${grid.nx},${grid.ny}@${baseDate}${baseTime}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const result = await fetchGridWeather(grid, baseDate, baseTime);
  cache.set(key, result, result ? SUCCESS_TTL : FAILURE_TTL);
  return result;
}
