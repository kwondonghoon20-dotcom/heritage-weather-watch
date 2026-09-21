import { HERITAGE_SITES } from "./data/heritageSites.generated";
import { siteGridKey } from "./siteGrids";

// GET /api/sites 응답. 데이터는 빌드 시점에 확정된 정적 목록이라 모듈 로드 때 한 번만 직렬화해 두고 재사용한다.
// Express(로컬 개발)와 Vercel 서버리스 함수(api/live.ts)가 이 모듈을 함께 쓴다.
// 유산마다 자기 기상청 격자 키("nx,ny")를 grid 로 붙인다 — 프런트가 /api/live 의 grids[grid] 에서 이 유산의 날씨를 찾는 키다.
const BODY = JSON.stringify({
  count: HERITAGE_SITES.length,
  sites: HERITAGE_SITES.map((s) => ({ ...s, grid: siteGridKey(s.lat, s.lng) })),
});

// 실시간 값이 아니라 배포 단위로만 바뀌는 데이터 — 브라우저·CDN에서 캐시해도 안전하다.
export const SITES_CACHE_CONTROL = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

export function getSitesJson(): string {
  return BODY;
}
