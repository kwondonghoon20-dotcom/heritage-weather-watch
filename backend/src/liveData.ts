import { LIVE_REGIONS } from "./liveRegions";
import type { GridPoint } from "./domain/grid";
import { getWeatherForGrid, getKmaCallStats, type LiveWeather } from "./services/kmaClient";
import { getFireIndexBySigungu, bucketFireIdx } from "./services/forestFireClient";
import { getWarningsForRegions, type ActiveWarning } from "./services/warningClient";

export interface LiveRegionWeather {
  rain: number;
  wind: number;
  temp: number;
  fireIdx: number;
  humidity: number;
  // 현재 발효 중인 기상특보. 특보 조회 실패 시에도 빈 배열 — 특보는 보조 정보라 지역을 "데이터 없음"으로 만들지 않는다.
  warnings: ActiveWarning[];
}

export interface LiveDataResponse {
  updatedAt: string;
  // 키는 시군구 5자리 코드(카탈로그 유산의 sigunguCode). 값이 null이면 그 시군구는 "데이터 없음".
  regions: Record<string, LiveRegionWeather | null>;
}

// 동시에 나가는 기상청 호출 수 제한 — 191개를 한꺼번에 쏘면 공공데이터포털의 초당 호출 제한에 걸릴 수 있다.
const KMA_CONCURRENCY = 16;
const MAX_FALLBACK_TRIES = 6;

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

// Express(로컬 개발)와 Vercel 서버리스 함수(api/live.ts)가 공유하는 오케스트레이션 로직.
// 두 진입점 모두 이 함수 하나만 호출한다 — 로직은 한 곳에서만 관리.
export async function getLiveData(): Promise<LiveDataResponse> {
  const started = Date.now();

  // 시군구 대표 격자가 겹치면(이웃 시군구가 같은 격자를 대표로 삼는 경우) 한 번만 호출한다.
  const uniqueGrids = new Map<string, GridPoint>();
  for (const r of LIVE_REGIONS) uniqueGrids.set(`${r.grid.nx},${r.grid.ny}`, r.grid);

  const timed = async <T>(label: string, p: Promise<T>): Promise<T> => {
    const t = Date.now();
    const v = await p;
    timings[label] = Date.now() - t;
    return v;
  };
  const timings: Record<string, number> = {};
  const [gridEntries, fireIndexByCode, warningsByRegion] = await Promise.all([
    timed("기상", mapWithLimit([...uniqueGrids.entries()], KMA_CONCURRENCY, async ([key, grid]) => [key, await getWeatherForGrid(grid)] as const)),
    timed("산불", getFireIndexBySigungu([...new Set(LIVE_REGIONS.map((r) => r.fireCode))])),
    timed("특보", getWarningsForRegions(LIVE_REGIONS.map((r) => ({ code: r.code, region: r.region, name: r.name })))),
  ]);
  const weatherByGrid = new Map<string, LiveWeather | null>(gridEntries);

  // 대표 격자에 관측값이 없는(또는 조회에 실패한) 시군구만 대체 격자를 시도한다. 대부분은 해당 없음.
  // 대체 격자는 동시에 물어(최대 MAX_FALLBACK_TRIES개) 가까운 순서대로 처음 값이 있는 것을 쓴다 — 하나씩 물으면 서버리스 함수 제한 시간(10초)에 부담이다.
  const tFallback = Date.now();
  const weatherByRegion = new Map<string, LiveWeather | null>();
  let fallbackUsed = 0;
  await Promise.all(
    LIVE_REGIONS.map(async (r) => {
      let weather = weatherByGrid.get(`${r.grid.nx},${r.grid.ny}`) ?? null;
      if (!weather) {
        const tries = await Promise.all(r.fallbackGrids.slice(0, MAX_FALLBACK_TRIES).map((g) => getWeatherForGrid(g)));
        weather = tries.find((w) => w) ?? null;
        if (weather) fallbackUsed += 1;
      }
      weatherByRegion.set(r.code, weather);
    }),
  );
  timings["대체격자"] = Date.now() - tFallback;

  const regions: Record<string, LiveRegionWeather | null> = {};
  let ok = 0;
  for (const r of LIVE_REGIONS) {
    const weather = weatherByRegion.get(r.code);
    const meanavg = fireIndexByCode.get(r.fireCode);

    // 기상 또는 산불위험 데이터 중 하나라도 없으면 그 시군구만 "데이터 없음"으로 표시하고
    // 나머지 응답에는 영향을 주지 않는다. 원본 API 키/URL은 응답에 포함하지 않는다.
    if (!weather || meanavg === undefined) {
      regions[r.code] = null;
      continue;
    }
    ok += 1;
    regions[r.code] = {
      rain: weather.rain,
      wind: weather.wind,
      temp: weather.temp,
      humidity: weather.humidity,
      fireIdx: bucketFireIdx(meanavg),
      warnings: warningsByRegion?.get(r.code) ?? [],
    };
  }

  const stats = getKmaCallStats();
  console.log(`[live] 시군구 ${LIVE_REGIONS.length}곳 중 ${ok}곳 성공, 격자 ${uniqueGrids.size}개(대체 격자 사용 ${fallbackUsed}곳), ${Date.now() - started}ms [${Object.entries(timings).map(([k, v]) => `${k} ${v}ms`).join(" · ")}], 기상청 호출 오늘 ${stats.calls}/${stats.limit}건`);
  return { updatedAt: new Date().toISOString(), regions };
}
