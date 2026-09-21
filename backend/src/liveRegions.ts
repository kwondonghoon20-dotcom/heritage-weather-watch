import { HERITAGE_SITES } from "./data/heritageSites.generated";

// 시군구 단위로만 값을 주는 데이터(산불위험예보·기상특보)를 위한 시군구 목록. 날씨는 유산별 격자로 조회하며 siteGrids.ts 를 본다.
export interface LiveRegion {
  code: string; // 시군구 5자리 코드 (카탈로그의 sigunguCode)
  name: string; // 시군구명
  region: string; // 시도 축약형 (특보 구역 매칭에 쓴다)
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

function buildRegions(): LiveRegion[] {
  const groups = new Map<string, LiveRegion>();
  for (const s of HERITAGE_SITES) {
    if (!s.sigunguCode || !s.sigungu) continue;
    const g = groups.get(s.sigunguCode);
    if (g) g.siteCount += 1;
    else
      groups.set(s.sigunguCode, {
        code: s.sigunguCode,
        name: s.sigungu,
        region: s.region,
        fireCode: FIRE_CODE_ALIAS[s.sigunguCode] ?? s.sigunguCode,
        siteCount: 1,
      });
  }
  return [...groups.values()].sort((a, b) => (a.code < b.code ? -1 : 1));
}

export const LIVE_REGIONS: LiveRegion[] = buildRegions();
