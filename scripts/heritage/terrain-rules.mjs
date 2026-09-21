// 지형 분류 규칙(자동 추정). 표고(elevation-cache.json)와 VWorld 하천·해안(water-cache.json)으로 유산의 regionTag·elevationProfile 을 어림한다.
// ★ 자동 추정이며 100% 정확하지 않다 — 큐레이션한 16곳 기준으로 elevationProfile 14/16(87.5%), regionTag 16/16 이었다(README "지형 분류" 참고).
//   16곳은 옛 mock 의 주관적 지정값이라 정답이 아니며, 특히 구릉/능선 경계는 검증할 표본이 부족해 판단값이다.
//
// 입력
//   z      표고 9점 [중심, 북, 북동, 동, 남동, 남, 남서, 서, 북서] — 중심 + 반경 500m 8방향, 미터 (Open-Meteo, Copernicus GLO-90 90m)
//   region, sigungu  카탈로그 값
//   river  가까운(반경 400m) 국가하천 이름 또는 null (VWorld LT_C_WKMSTRM)
//   coast  반경 4km 안 해안 근거 또는 null (VWorld 해안선 LT_L_TOISDEPCNTAH ∪ 연안해역 LT_C_WGISPL2*)
//
// 규칙
//   국소 고저차 relief = 9점의 (최댓값 − 최솟값)
//   regionTag        산악(중심 고도 ≥ 200m) → 해안(4km 안 바다) → 도심(대도시 목록) → 하천(400m 안 국가하천) → 평지 (앞에서부터 처음 맞는 것)
//   elevationProfile relief < 90m  → 국가하천 400m 안이면 저지대(flood-prone), 아니면 평지(plain)
//                    relief ≥ 90m  → 중심 고도 ≥ 450m 면 능선(ridge), 아니면 구릉(hillside)
export const TERRAIN_RULES = {
  mountainMinElevation: 200, // 큐레이션 16곳에서 산악은 최저 246m(불국사), 그 외는 최고 93m — 그 사이면 같은 결과. 중간쯤인 200m
  plainMaxRelief: 90, // 평지 지정의 고저차 최댓값 86m(창덕궁) vs 구릉·능선 지정(강화 제외)의 최솟값 101m(공산성) — 경계 여유가 얇다
  ridgeMinElevation: 450, // 구릉/능선 경계는 16곳으로 정해지지 않는다(246~452m 어디든 같은 결과) — 판단값
};

// 도심: 서울 전 구, 광역시의 "구"(군 제외), 그리고 아래 대도시. 시군구명은 카탈로그의 sigungu 그대로.
const METRO_REGIONS = new Set(["부산", "대구", "인천", "대전", "울산", "전남광주"]);
const URBAN_CITIES = new Set(["수원시", "성남시", "고양시", "용인시", "창원시", "청주시", "전주시", "천안시", "부천시", "안산시", "안양시"]);
export function isUrban(region, sigungu) {
  if (region === "서울") return true;
  if (!sigungu) return false;
  if (METRO_REGIONS.has(region) && /구$/.test(sigungu)) return true;
  return URBAN_CITIES.has(sigungu);
}

export function terrainFeatures(z) {
  return { elevation: z[0], relief: Math.max(...z) - Math.min(...z) };
}

export function classifyTerrain({ z, region, sigungu, river, coast }) {
  const { elevation, relief } = terrainFeatures(z);
  const R = TERRAIN_RULES;
  const regionTag = elevation >= R.mountainMinElevation ? "mountain" : coast ? "coast" : isUrban(region, sigungu) ? "urban" : river ? "river" : "plain";
  const elevationProfile = relief < R.plainMaxRelief ? (river ? "flood-prone" : "plain") : elevation >= R.ridgeMinElevation ? "ridge" : "hillside";
  return { regionTag, elevationProfile, elevation, relief };
}
