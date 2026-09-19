import { SITES } from "./data/sites";
import { SITE_SIGUNGU } from "./data/siteAdminMap";
import { latLonToGrid, type GridPoint } from "./domain/grid";
import { getWeatherForGrid } from "./services/kmaClient";
import { getFireIndexBySigungu, bucketFireIdx } from "./services/forestFireClient";
import { getWarningsByKeyword, regionKeyword, type ActiveWarning } from "./services/warningClient";

export interface LiveSiteWeather {
  rain: number;
  wind: number;
  temp: number;
  fireIdx: number;
  humidity: number;
  // 현재 발효 중인 기상특보. 특보 조회 실패 시에도 빈 배열 — 특보는 보조 정보라 유산을 "데이터 없음"으로 만들지 않는다.
  warnings: ActiveWarning[];
}

export interface LiveDataResponse {
  updatedAt: string;
  sites: Record<string, LiveSiteWeather | null>;
}

// Express(로컬 개발)와 Vercel 서버리스 함수(api/live.ts)가 공유하는 오케스트레이션 로직.
// 두 진입점 모두 이 함수 하나만 호출한다 — 로직은 한 곳에서만 관리.
export async function getLiveData(): Promise<LiveDataResponse> {
  const gridBySiteId = new Map<string, GridPoint>(SITES.map((s) => [s.id, latLonToGrid(s.lat, s.lng)]));

  // 동일 격자를 쓰는 유산(예: 경주 3곳)은 한 번만 호출하도록 중복 제거.
  const uniqueGrids = new Map<string, GridPoint>();
  gridBySiteId.forEach((g) => uniqueGrids.set(`${g.nx},${g.ny}`, g));

  const sigunguCodes = [...new Set(Object.values(SITE_SIGUNGU).map((a) => a.code))];

  const warningKeywords = [...new Set(Object.values(SITE_SIGUNGU).map((a) => regionKeyword(a.name)))];

  const [gridWeatherEntries, fireIndexBySigungu, warningsByKeyword] = await Promise.all([
    Promise.all([...uniqueGrids.entries()].map(async ([key, grid]) => [key, await getWeatherForGrid(grid)] as const)),
    getFireIndexBySigungu(sigunguCodes),
    getWarningsByKeyword(warningKeywords),
  ]);
  const weatherByGridKey = new Map(gridWeatherEntries);

  const sites: Record<string, LiveSiteWeather | null> = {};

  for (const site of SITES) {
    const grid = gridBySiteId.get(site.id)!;
    const weather = weatherByGridKey.get(`${grid.nx},${grid.ny}`);
    const admin = SITE_SIGUNGU[site.id];
    const meanavg = admin ? fireIndexBySigungu.get(admin.code) : undefined;

    // 기상 또는 산불위험 데이터 중 하나라도 없으면 해당 유산만 "데이터 없음"으로 표시하고
    // 나머지 유산의 응답에는 영향을 주지 않는다. 원본 API 키/URL은 응답에 포함하지 않는다.
    if (!weather || meanavg === undefined) {
      sites[site.id] = null;
      continue;
    }

    sites[site.id] = {
      rain: weather.rain,
      wind: weather.wind,
      temp: weather.temp,
      humidity: weather.humidity,
      fireIdx: bucketFireIdx(meanavg),
      warnings: (admin && warningsByKeyword?.get(regionKeyword(admin.name))) || [],
    };
  }

  return { updatedAt: new Date().toISOString(), sites };
}
