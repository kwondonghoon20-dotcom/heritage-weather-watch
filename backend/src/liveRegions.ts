import { HERITAGE_SITES } from "./data/heritageSites.generated";
import { latLonToGrid, type GridPoint } from "./domain/grid";

// 실시간 날씨는 "시군구 단위"로 조회한다. 유산 1,617곳이 쓰는 기상청 5km 격자는 741개인데, 초단기실황의 일일 호출 한도(10,000건)로는
// 시간당 741건을 감당할 수 없어(741×24=17,784건/일) 시군구마다 대표 격자 1개(191개)만 조회하고 그 시군구의 유산들이 값을 공유한다.
export interface LiveRegion {
  code: string; // 시군구 5자리 코드 (카탈로그의 sigunguCode)
  name: string; // 시군구명
  region: string; // 시도 축약형 (특보 구역 매칭에 쓴다)
  grid: GridPoint; // 대표 격자
  // 대표 격자에 관측값이 없을 때 차례로 시도할 격자: 같은 시군구 유산이 속한 다른 격자 → 대표 격자의 상하좌우·대각 이웃 격자
  fallbackGrids: GridPoint[];
  fireCode: string; // 산불위험예보 API에서 쓰는 코드
  siteCount: number;
}

// 카탈로그의 시군구코드와 산불위험예보 API 코드가 다른 4곳(2026-09-21, 코드 목록으로 직접 조회해 이름까지 확인).
// 이 밖의 187개는 두 코드가 같다.
const FIRE_CODE_ALIAS: Record<string, string> = {
  "41730": "41670", // 여주시
  "43710": "43110", // 청주시
  "44830": "44270", // 당진시
  "48110": "48120", // 창원시
};

const rad = Math.PI / 180;
function distKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const h = Math.sin(((bLat - aLat) * rad) / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(((bLng - aLng) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// 대표 격자 = 그 시군구 유산이 가장 많이 속한 격자(가장 많은 유산이 자기 격자의 값을 그대로 받도록). 동률이면 시군구 유산들의 평균 위치에 가까운 쪽.
function buildRegions(): LiveRegion[] {
  const groups = new Map<string, typeof HERITAGE_SITES>();
  for (const s of HERITAGE_SITES) {
    if (!s.sigunguCode || !s.sigungu) continue;
    const g = groups.get(s.sigunguCode);
    if (g) g.push(s);
    else groups.set(s.sigunguCode, [s]);
  }

  const regions: LiveRegion[] = [];
  for (const [code, sites] of groups) {
    const cLat = sites.reduce((a, s) => a + s.lat, 0) / sites.length;
    const cLng = sites.reduce((a, s) => a + s.lng, 0) / sites.length;
    const byGrid = new Map<string, { grid: GridPoint; lat: number; lng: number; n: number }>();
    for (const s of sites) {
      const grid = latLonToGrid(s.lat, s.lng);
      const k = `${grid.nx},${grid.ny}`;
      const e = byGrid.get(k) ?? { grid, lat: 0, lng: 0, n: 0 };
      e.lat += s.lat;
      e.lng += s.lng;
      e.n += 1;
      byGrid.set(k, e);
    }
    const best = [...byGrid.values()].sort(
      (a, b) => b.n - a.n || distKm(a.lat / a.n, a.lng / a.n, cLat, cLng) - distKm(b.lat / b.n, b.lng / b.n, cLat, cLng),
    )[0];
    const others = [...byGrid.values()].filter((e) => e !== best).sort((a, b) => b.n - a.n).map((e) => e.grid);
    const ring: GridPoint[] = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) ring.push({ nx: best.grid.nx + dx, ny: best.grid.ny + dy });
    regions.push({
      code,
      name: sites[0].sigungu!,
      region: sites[0].region,
      grid: best.grid,
      fallbackGrids: [...others, ...ring],
      fireCode: FIRE_CODE_ALIAS[code] ?? code,
      siteCount: sites.length,
    });
  }
  return regions.sort((a, b) => (a.code < b.code ? -1 : 1));
}

export const LIVE_REGIONS: LiveRegion[] = buildRegions();
