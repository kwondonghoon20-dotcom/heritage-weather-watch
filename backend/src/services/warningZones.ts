// 광역시 안에서 특보구역이 여러 개로 나뉘는 곳의 "구·군 → 특보구역 ID" 소속표.
//
// 출처와 확인일 (2026-09-21):
//  · 소속: 기상청 날씨누리 「특보구역」 표 — 서울·인천 https://www.weather.go.kr/w/forecast/guide/wrn-area.do?stn=109
//    · 부산·울산 …?stn=159 · 광주 …?stn=156. 구역 ID·이름만 있는 특보구역코드 CSV(공공데이터포털 15043573)에는 소속 정보가 없어서 이 표를 쓴다.
//    · 서울 4권역은 같은 시기 뉴스 기사(폭염경보 발표문)의 구 목록과도 일치한다.
//  · 구역 ID: 특보구역코드 CSV와 실제 wrn_now_data 응답(tm=202607291200, 202608030900)을 대조해 확인했다. 응답의 REG_ID가 이 ID 그대로 내려온다.
//    이름은 CSV와 API가 다르므로(예: CSV "달성북부", API "달성군북부") 이름이 아니라 ID로 매칭한다.
//
// 여기 없는 시군구는 warningClient.ts 의 기존 규칙(이름·시도 기준)을 그대로 쓴다. 의도적으로 비워 둔 곳:
//  · 인천: 새 구 이름(서해구·제물포구·영종구…)이 기상청 표의 옛 이름(서구·중구·동구)과 달라 소속을 추정하지 않는다. 인천의 구는 도시 전체 구역
//    (영종·남부·북부)의 합집합을 쓰고, 강화군·옹진군은 자체 구역으로 맞춘다(기존 동작).
//  · 대구 달성군·세종: 북부/남부가 읍·면·동 단위로 갈려 시군구만으로는 정할 수 없다 → 합집합(기존 동작). 대구의 구 7곳은 "대구중부" 하나뿐이라 표가 필요 없다.
//  · 광역시 밖 시·군 안의 분할(경주동부/남부/서부, 안동북부/서부 등)도 읍·면·동 단위라 이 표로 풀 수 없다(GIS 경계 데이터가 필요한 별도 과제).

export interface MetroZones {
  province: string; // warningClient.ts 의 PROVINCE_BY_UPID 시도 이름 (구역 ID가 표에 없는 새 구역인지 감시할 때 쓴다)
  cityWide: string[]; // 도시 전체를 가리키는 구역 — 여기에 특보가 걸리면 모든 하위 구역에 적용된다
  zones: Record<string, string[]>; // 특보구역 ID → 소속 구·군
}

export const METRO_ZONES: Record<string, MetroZones> = {
  서울: {
    province: "서울",
    cityWide: ["L1100000"],
    zones: {
      L1100100: ["강동구", "송파구", "강남구", "서초구"], // 서울동남권
      L1100200: ["도봉구", "노원구", "강북구", "성북구", "동대문구", "중랑구", "성동구", "광진구"], // 서울동북권
      L1100300: ["강서구", "양천구", "구로구", "영등포구", "동작구", "관악구", "금천구"], // 서울서남권
      L1100400: ["은평구", "종로구", "마포구", "서대문구", "중구", "용산구"], // 서울서북권
    },
  },
  부산: {
    province: "부산",
    cityWide: ["L1150000"],
    zones: {
      L1082500: ["기장군", "해운대구", "수영구", "남구"], // 부산동부
      L1082600: ["금정구", "북구", "동래구", "연제구", "부산진구", "사상구"], // 부산중부
      L1082700: ["강서구", "사하구", "영도구", "서구", "동구", "중구"], // 부산서부
    },
  },
  울산: {
    province: "울산",
    cityWide: ["L1160000"],
    zones: {
      L1082800: ["북구", "동구", "중구", "남구"], // 울산동부
      L1082900: ["울주군"], // 울산서부
    },
  },
  // 카탈로그의 region 은 "전남광주"(전남광주통합특별시)이고, 표의 구 이름(동구·서구·남구·북구·광산구)은 모두 광주광역시 안의 구다.
  전남광주: {
    province: "광주",
    cityWide: ["L1130000", "L1130100"],
    zones: {
      L1130110: ["광산구"], // 광주서부
      L1130120: ["동구", "서구", "남구", "북구"], // 광주동부
    },
  },
};

// 이 (시도, 시군구)가 소속된 특보구역 ID(+도시 전체 구역). 표에 없으면 null → 호출하는 쪽이 기존 규칙을 쓴다.
export function metroZoneIds(region: string, sigungu: string): Set<string> | null {
  const metro = METRO_ZONES[region];
  if (!metro) return null;
  for (const [zoneId, members] of Object.entries(metro.zones)) {
    if (members.includes(sigungu)) return new Set([zoneId, ...metro.cityWide]);
  }
  return null;
}

// 표에 있는 시도(서울·부산·울산·광주)의 응답 행 중 표에 없는 구역 ID. 기상청이 구역을 다시 나누면 여기에 나타난다.
const KNOWN_IDS_BY_PROVINCE = new Map<string, Set<string>>(
  Object.values(METRO_ZONES).map((m) => [m.province, new Set([...m.cityWide, ...Object.keys(m.zones)])]),
);
export function unknownMetroZoneIds(rows: Array<{ regId: string; province: string | undefined }>): string[] {
  const unknown = new Set<string>();
  for (const r of rows) {
    const known = r.province ? KNOWN_IDS_BY_PROVINCE.get(r.province) : undefined;
    if (known && !known.has(r.regId)) unknown.add(r.regId);
  }
  return [...unknown];
}
