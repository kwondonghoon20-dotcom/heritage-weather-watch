import { HERITAGE_SITES } from "./data/heritageSites.generated";
import { gridKey, latLonToGrid, type GridPoint } from "./domain/grid";

// 실시간 날씨는 유산 각자가 속한 기상청 5km 격자(nx,ny) 단위로 조회한다. 유산 1,617곳은 741개 고유 격자에 놓인다.
// 위경도 → 격자 키. /api/sites 가 유산마다 이 키를 붙여 주면 프런트가 /api/live 의 grids 에서 자기 날씨를 찾는다.
export function siteGridKey(lat: number, lng: number): string {
  return gridKey(latLonToGrid(lat, lng));
}

export interface SiteGrid {
  key: string;
  grid: GridPoint;
  siteCount: number; // 이 격자에 놓인 유산 수
}

function buildSiteGrids(): SiteGrid[] {
  const byKey = new Map<string, SiteGrid>();
  for (const s of HERITAGE_SITES) {
    const grid = latLonToGrid(s.lat, s.lng);
    const key = gridKey(grid);
    const e = byKey.get(key);
    if (e) e.siteCount += 1;
    else byKey.set(key, { key, grid, siteCount: 1 });
  }
  // 유산이 많은 격자부터: 시간 제한 안에 다 못 채우더라도 더 많은 유산이 값을 받는다.
  return [...byKey.values()].sort((a, b) => b.siteCount - a.siteCount || (a.key < b.key ? -1 : 1));
}

export const SITE_GRIDS: SiteGrid[] = buildSiteGrids();
const SITE_GRID_KEYS = new Set(SITE_GRIDS.map((g) => g.key));

// 관측값이 없는(결측) 격자의 값을 대신할 이웃 격자를 가까운 순서로: 상하좌우 → 대각, 그 안에서는 이미 조회하는 유산 격자를 먼저 쓴다
// (이미 조회한 값을 재사용하므로 호출이 늘지 않는다).
const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
export function fallbackCandidates(grid: GridPoint): GridPoint[] {
  const ring = NEIGHBOR_OFFSETS.map(([dx, dy], order) => ({ grid: { nx: grid.nx + dx, ny: grid.ny + dy }, order }));
  const rank = (c: (typeof ring)[number]) => (SITE_GRID_KEYS.has(gridKey(c.grid)) ? 0 : 1);
  return ring.sort((a, b) => rank(a) - rank(b) || a.order - b.order).map((c) => c.grid);
}
