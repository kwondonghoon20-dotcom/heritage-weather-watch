import { ENV } from "./config/env";
import { LIVE_REGIONS } from "./liveRegions";
import { SITE_GRIDS, fallbackCandidates } from "./siteGrids";
import {
  bucketEndMs,
  cacheBucket,
  getKmaCallStats,
  isBackingOff,
  isBudgetExhausted,
  readGrid,
  refreshGrid,
  type LiveWeather,
} from "./services/kmaClient";
import { getFireIndexBySigungu, bucketFireIdx } from "./services/forestFireClient";
import { getWarningsForRegions, type ActiveWarning } from "./services/warningClient";

// 격자(5km) 단위 날씨. 키는 "nx,ny" — 유산의 grid 필드(GET /api/sites)로 찾는다. null 이면 그 격자는 "데이터 없음".
export type LiveGridWeather = LiveWeather;

// 시군구 단위 값: 산불위험예보 API 와 기상특보가 시군구 단위로만 값을 주므로 날씨와 따로 내려간다.
export interface LiveRegionInfo {
  fireIdx: number;
  // 현재 발효 중인 기상특보. 특보 조회 실패 시에도 빈 배열 — 특보는 보조 정보라 지역을 "데이터 없음"으로 만들지 않는다.
  warnings: ActiveWarning[];
}

export interface LiveDataResponse {
  updatedAt: string;
  // 응답에 쓰인 격자 값 중 가장 오래전에 조회한 시각. 캐시 덕분에 updatedAt 보다 몇 시간 앞설 수 있다.
  weatherAsOf: string | null;
  refreshHours: number; // 격자 날씨를 다시 조회하는 주기(시간)
  // false 면 응답 제한 시간 안에 이번 구간 값으로 다 채우지 못한 것 — 못 채운 격자는 직전 값이거나(없으면 null) 곧 채워진다. 프런트는 곧 다시 요청한다.
  complete: boolean;
  pendingGrids: number;
  grids: Record<string, LiveGridWeather | null>;
  // 키는 시군구 5자리 코드(유산의 sigunguCode). 값이 null이면 그 시군구는 산불위험 데이터가 없다.
  regions: Record<string, LiveRegionInfo | null>;
}

export interface LiveDataResult {
  data: LiveDataResponse;
  cacheControl: string;
}

// 동시에 나가는 기상청 호출 수 제한 — 격자 741개를 한꺼번에 쏘면 공공데이터포털의 초당 호출 제한에 걸릴 수 있다.
const KMA_CONCURRENCY = 16;
const MAX_FALLBACK_TRIES = 6;
const LIVE_SWR_SECONDS = 3600;

async function mapWithLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

// CDN 캐시 헤더. 응답이 얼마나 "끝난" 상태인지에 따라 다시 물어볼 시점을 정한다.
//  · 값이 아예 없는 격자가 남았다 → 5초 (곧 다시 물어 이어서 채우게 한다. 낡은 빈 응답을 돌려주지 않도록 stale 허용 없음)
//  · 이번 구간 값으로 못 채운 격자가 남았다(직전 값은 있음) → 10초, 그동안 직전 값을 즉시 주고 뒤에서 이어서 채운다
//  · 조회 실패로 쉬는 격자가 있다 → 5분(실패 격자는 백오프 뒤에 다시 시도되며 그 사이 값은 직전 값)
//  · 전부 이번 구간 값 → 이번 캐시 구간이 끝날 때까지(최대 refreshHours 시간). 구간 끝에 맞춰 CDN 이 식으므로 값이 서버 구간보다 더 낡지 않는다.
//    만료 뒤에도 1시간은 직전 값을 즉시 주면서 뒤에서 갱신한다(stale-while-revalidate).
export function liveCacheControl(state: { pending: number; pendingEmpty: number; blocked: number }, nowMs: number, hours: number): string {
  if (state.pendingEmpty > 0) return "public, s-maxage=5";
  if (state.pending > 0) return "public, s-maxage=10, stale-while-revalidate=60";
  if (state.blocked > 0) return "public, s-maxage=300, stale-while-revalidate=600";
  const untilBucketEnd = Math.ceil((bucketEndMs(cacheBucket(nowMs, hours), hours) - nowMs) / 1000);
  const sMaxAge = Math.min(hours * 3600, Math.max(untilBucketEnd, 60));
  return `public, s-maxage=${sMaxAge}, stale-while-revalidate=${LIVE_SWR_SECONDS}`;
}

export interface LiveDataOptions {
  deadlineMs?: number; // 기본값은 ENV.kmaLiveDeadlineMs. 0 이면 제한 없음
}

// Express(로컬 개발)와 Vercel 서버리스 함수(api/live.ts)가 공유하는 오케스트레이션 로직.
// 두 진입점 모두 이 함수 하나만 호출한다 — 로직은 한 곳에서만 관리.
export async function getLiveData(opts: LiveDataOptions = {}): Promise<LiveDataResult> {
  const started = Date.now();
  const deadlineMs = opts.deadlineMs ?? ENV.kmaLiveDeadlineMs;
  const deadlineAt = deadlineMs > 0 ? started + deadlineMs : undefined;
  const pastDeadline = () => deadlineAt !== undefined && Date.now() >= deadlineAt;

  const timings: Record<string, number> = {};
  const timed = async <T>(label: string, p: Promise<T>): Promise<T> => {
    const t = Date.now();
    const v = await p;
    timings[label] = Date.now() - t;
    return v;
  };

  // 이번 캐시 구간 값이 없는 격자를 채운다. 값이 아예 없는 격자를 먼저, 그다음 직전 값을 쓰던 격자를(각 그룹은 유산이 많은 격자부터).
  // 시간 제한이 오면 새 조회를 멈춘다 — 남은 격자는 직전 값으로 응답하고 다음 요청이 이어서 채운다.
  const todo = SITE_GRIDS.filter((g) => !readGrid(g.grid)?.fresh && !isBackingOff(g.grid));
  todo.sort((a, b) => Number(!!readGrid(a.grid)) - Number(!!readGrid(b.grid)));
  let attempted = 0;

  const [, fireIndexByCode, warningsByRegion] = await Promise.all([
    timed(
      "기상",
      mapWithLimit(todo, KMA_CONCURRENCY, async (g) => {
        // 겹친 요청이 이미 채운 격자는 건너뛴다(같은 격자를 두 번 부르지 않는다).
        if (pastDeadline() || readGrid(g.grid)?.fresh) return;
        attempted += 1;
        await refreshGrid(g.grid, deadlineAt);
      }),
    ),
    timed("산불", getFireIndexBySigungu([...new Set(LIVE_REGIONS.map((r) => r.fireCode))])),
    timed("특보", getWarningsForRegions(LIVE_REGIONS.map((r) => ({ code: r.code, region: r.region, name: r.name })))),
  ]);

  // 이번 구간에 조회했더니 관측값이 없던(결측) 격자만 이웃 격자 값을 대신 쓴다. 이미 조회한 유산 격자를 먼저 쓰므로 대부분 추가 호출이 없다.
  const fallbackByGrid = new Map<string, LiveWeather>();
  const missing = SITE_GRIDS.filter((g) => {
    const r = readGrid(g.grid);
    return r?.fresh && r.weather === null;
  });
  await timed(
    "대체격자",
    mapWithLimit(missing, 8, async (g) => {
      for (const cand of fallbackCandidates(g.grid).slice(0, MAX_FALLBACK_TRIES)) {
        let r = readGrid(cand);
        if (!r?.fresh && !pastDeadline() && !isBackingOff(cand)) {
          await refreshGrid(cand, deadlineAt);
          r = readGrid(cand);
        }
        if (r?.fresh && r.weather) {
          fallbackByGrid.set(g.key, r.weather);
          return;
        }
      }
    }),
  );

  const grids: Record<string, LiveGridWeather | null> = {};
  const budgetOut = isBudgetExhausted();
  let freshCount = 0;
  let stale = 0;
  let pending = 0;
  let pendingEmpty = 0;
  let blocked = 0;
  let oldest = Infinity;
  for (const g of SITE_GRIDS) {
    const r = readGrid(g.grid);
    const weather = r?.weather ?? fallbackByGrid.get(g.key) ?? null;
    grids[g.key] = weather ? { rain: weather.rain, wind: weather.wind, temp: weather.temp, humidity: weather.humidity } : null;
    if (r) oldest = Math.min(oldest, r.fetchedAt);
    if (r?.fresh) {
      freshCount += 1;
      continue;
    }
    if (r) stale += 1;
    if (isBackingOff(g.grid) || budgetOut) blocked += 1;
    else {
      pending += 1;
      if (!r) pendingEmpty += 1;
    }
  }

  const regions: Record<string, LiveRegionInfo | null> = {};
  let regionOk = 0;
  for (const r of LIVE_REGIONS) {
    const meanavg = fireIndexByCode.get(r.fireCode);
    // 산불위험 데이터가 없으면 그 시군구만 "데이터 없음"으로 표시하고 나머지 응답에는 영향을 주지 않는다. 원본 API 키/URL은 응답에 포함하지 않는다.
    if (meanavg === undefined) {
      regions[r.code] = null;
      continue;
    }
    regionOk += 1;
    regions[r.code] = { fireIdx: bucketFireIdx(meanavg), warnings: warningsByRegion?.get(r.code) ?? [] };
  }

  const now = Date.now();
  const stats = getKmaCallStats();
  const withWeather = Object.values(grids).filter(Boolean).length;
  console.log(
    `[live] 격자 ${SITE_GRIDS.length}개 중 값 ${withWeather}개(이번 구간 ${freshCount} · 직전 값 ${stale} · 조회 대기 ${pending} · 쉬는 중 ${blocked} · 결측 대체 ${fallbackByGrid.size}), ` +
      `이번 요청 조회 ${attempted}격자, 시군구 ${LIVE_REGIONS.length}곳 중 산불 ${regionOk}곳, ${now - started}ms ` +
      `[${Object.entries(timings).map(([k, v]) => `${k} ${v}ms`).join(" · ")}], 기상청 호출 오늘 ${stats.calls}/${stats.limit}건`,
  );

  return {
    data: {
      updatedAt: new Date(now).toISOString(),
      weatherAsOf: Number.isFinite(oldest) ? new Date(oldest).toISOString() : null,
      refreshHours: ENV.kmaCacheHours,
      complete: pending === 0,
      pendingGrids: pending,
      grids,
      regions,
    },
    cacheControl: liveCacheControl({ pending, pendingEmpty, blocked }, now, ENV.kmaCacheHours),
  };
}
