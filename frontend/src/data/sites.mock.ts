import type { HeritageSite } from "../types";

// 1단계 mock 데이터. 좌표는 참고용이며 국가유산청 공간정보 API 연동 시(Phase 3) 재검증/교체 예정.
export const SITES: HeritageSite[] = [
  { id: "bulguksa", name: "불국사", lat: 35.7898, lng: 129.332, region: "경북", regionTag: "mountain", elevationProfile: "hillside", era: "통일신라", material: "wood", heritageType: "국보 · 세계유산", desc: "토함산 자락의 목조 전각과 석축 기단이 함께 있는 사찰." },
  { id: "seokguram", name: "석굴암", lat: 35.7947, lng: 129.3495, region: "경북", regionTag: "mountain", elevationProfile: "ridge", era: "통일신라", material: "stone", heritageType: "국보 · 세계유산", desc: "화강암을 쌓아 만든 인공 석굴 법당." },
  { id: "cheomseongdae", name: "첨성대", lat: 35.8347, lng: 129.2192, region: "경북", regionTag: "plain", elevationProfile: "plain", era: "신라", material: "stone", heritageType: "국보", desc: "경주 시내 평지에 노출된 화강암 천문대." },
  { id: "buseoksa", name: "부석사 무량수전", lat: 36.9986, lng: 128.6944, region: "경북", regionTag: "mountain", elevationProfile: "hillside", era: "고려", material: "wood", heritageType: "국보", desc: "봉황산 중턱, 현존 최고(最古)급 목조 건축." },
  { id: "hahoe", name: "하회마을", lat: 36.539, lng: 128.5165, region: "경북", regionTag: "river", elevationProfile: "flood-prone", era: "조선", material: "wood", heritageType: "세계유산", desc: "낙동강이 휘도는 물돌이 지형의 전통 가옥군." },
  { id: "haeinsa", name: "해인사 장경판전", lat: 35.8007, lng: 128.098, region: "경남", regionTag: "mountain", elevationProfile: "ridge", era: "조선", material: "wood", heritageType: "국보 · 세계유산", desc: "가야산 산중, 팔만대장경을 보관하는 목조 판전." },
  { id: "namhansanseong", name: "남한산성", lat: 37.4784, lng: 127.1826, region: "경기", regionTag: "mountain", elevationProfile: "ridge", era: "조선", material: "wall", heritageType: "사적 · 세계유산", desc: "산 능선을 따라 쌓은 석성." },
  { id: "hwaseong", name: "수원화성", lat: 37.285, lng: 127.0104, region: "경기", regionTag: "urban", elevationProfile: "plain", era: "조선", material: "wall", heritageType: "사적 · 세계유산", desc: "도심을 둘러싼 벽돌·석재 혼축 성곽." },
  { id: "jongmyo", name: "종묘", lat: 37.5745, lng: 126.9945, region: "서울", regionTag: "urban", elevationProfile: "plain", era: "조선", material: "wood", heritageType: "국보 · 세계유산", desc: "왕실 제례를 위한 긴 목조 정전." },
  { id: "huwon", name: "창덕궁 후원", lat: 37.5824, lng: 126.9911, region: "서울", regionTag: "urban", elevationProfile: "plain", era: "조선", material: "wood", heritageType: "세계유산", desc: "정자와 연못이 어우러진 궁궐 후원." },
  { id: "gongsanseong", name: "공산성", lat: 36.4595, lng: 127.1265, region: "충남", regionTag: "river", elevationProfile: "hillside", era: "백제", material: "wall", heritageType: "사적 · 세계유산", desc: "금강변 구릉을 두른 토·석 혼축 산성." },
  { id: "muryeongneung", name: "무령왕릉", lat: 36.4637, lng: 127.1151, region: "충남", regionTag: "plain", elevationProfile: "plain", era: "백제", material: "mound", heritageType: "사적 · 세계유산", desc: "흙으로 덮인 백제 왕릉 봉분." },
  { id: "jeongnimsaji", name: "정림사지 오층석탑", lat: 36.2789, lng: 126.9107, region: "충남", regionTag: "plain", elevationProfile: "plain", era: "백제", material: "stone", heritageType: "국보 · 세계유산", desc: "절터에 홀로 남은 백제 석탑." },
  { id: "mireuksaji", name: "미륵사지 석탑", lat: 36.0124, lng: 127.0306, region: "전북", regionTag: "plain", elevationProfile: "plain", era: "백제", material: "stone", heritageType: "국보 · 세계유산", desc: "동양 최대급 규모의 백제 석탑." },
  { id: "hwasundolmen", name: "화순 고인돌 유적", lat: 34.9835, lng: 126.9895, region: "전남", regionTag: "plain", elevationProfile: "hillside", era: "청동기", material: "dolmen", heritageType: "세계유산", desc: "구릉 지대에 노출된 선사시대 거석군." },
  { id: "ganghwadolmen", name: "강화 고인돌 유적", lat: 37.6423, lng: 126.4009, region: "인천", regionTag: "coast", elevationProfile: "hillside", era: "청동기", material: "dolmen", heritageType: "세계유산", desc: "강화도 야산에 자리한 탁자식 고인돌." },
];
