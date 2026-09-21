// [임시 — 3단계 계획의 2단계(실시간 일반화)에서 삭제]
// 실시간 API(/api/live)는 아직 기존 16곳만 mock id(bulguksa 등)를 키로 응답한다. 카탈로그(/api/sites)의 유산코드를
// 그 키로 바꿔 주는 표이자, "실시간 모드에서 보여줄 유산" 목록이다. mock id 자신도 넣어 두어 카탈로그를 못 받아
// mock 16곳으로 대체된 경우에도 실시간 모드가 동작하게 한다. 코드↔이름은 scripts/heritage/build-sites.mjs 의 MOCK_LINKS 와 같다.
export const LIVE_KEY_BY_SITE_ID: Record<string, string> = {
  "13000502000000037": "bulguksa", // 경주 불국사
  "11000024000000037": "seokguram", // 경주 석굴암 석굴
  "11000031000000037": "cheomseongdae", // 경주 첨성대
  "11000018000000037": "buseoksa", // 영주 부석사 무량수전
  "18000122000000037": "hahoe", // 안동 하회마을
  "11000052000000038": "haeinsa", // 합천 해인사 장경판전
  "13000057000000031": "namhansanseong", // 남한산성
  "13000003000000031": "hwaseong", // 수원 화성
  "11000227000000011": "jongmyo", // 종묘 정전
  "13000122000000011": "huwon", // 창덕궁
  "13000012000000034": "gongsanseong", // 공주 공산성
  "13000013000000034": "muryeongneung", // 공주 무령왕릉과 왕릉원
  "11000009000000034": "jeongnimsaji", // 부여 정림사지 오층석탑
  "11000011000000035": "mireuksaji", // 익산 미륵사지 석탑
  "13000410000000036": "hwasundolmen", // 화순 효산리와 대신리 지석묘군
  "13000137000000023": "ganghwadolmen", // 강화 부근리 지석묘
  bulguksa: "bulguksa",
  seokguram: "seokguram",
  cheomseongdae: "cheomseongdae",
  buseoksa: "buseoksa",
  hahoe: "hahoe",
  haeinsa: "haeinsa",
  namhansanseong: "namhansanseong",
  hwaseong: "hwaseong",
  jongmyo: "jongmyo",
  huwon: "huwon",
  gongsanseong: "gongsanseong",
  muryeongneung: "muryeongneung",
  jeongnimsaji: "jeongnimsaji",
  mireuksaji: "mireuksaji",
  hwasundolmen: "hwasundolmen",
  ganghwadolmen: "ganghwadolmen",
};
