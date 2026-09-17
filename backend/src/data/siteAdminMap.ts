export interface SigunguAdmin {
  code: string; // 산불위험예보 API(forestPointListSigunguSearchV2)의 localAreas 코드
  name: string;
}

// 사용자 확정 매핑표를 기준으로 산불위험예보 API에 실제 조회해 코드를 검증했다(2026-09-17).
// 주의: 전북특별자치도 출범으로 익산시는 45xxx가 아닌 52140으로, 전남·광주 통합에 따라
// 화순군은 46xxx가 아닌 12760으로 코드가 바뀌어 있었다 — 두 값 모두 실제 API 응답으로 재확인함.
export const SITE_SIGUNGU: Record<string, SigunguAdmin> = {
  bulguksa: { code: "47130", name: "경주시" },
  seokguram: { code: "47130", name: "경주시" },
  cheomseongdae: { code: "47130", name: "경주시" },
  buseoksa: { code: "47210", name: "영주시" },
  hahoe: { code: "47170", name: "안동시" },
  haeinsa: { code: "48890", name: "합천군" },
  namhansanseong: { code: "41610", name: "광주시" },
  hwaseong: { code: "41110", name: "수원시" },
  jongmyo: { code: "11110", name: "종로구" },
  huwon: { code: "11110", name: "종로구" },
  gongsanseong: { code: "44150", name: "공주시" },
  muryeongneung: { code: "44150", name: "공주시" },
  jeongnimsaji: { code: "44760", name: "부여군" },
  mireuksaji: { code: "52140", name: "익산시" },
  hwasundolmen: { code: "12760", name: "화순군" },
  ganghwadolmen: { code: "28710", name: "강화군" },
};
