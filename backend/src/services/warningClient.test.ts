import { test } from "node:test";
import assert from "node:assert/strict";
import { matchRegionWarnings, parseWarnings } from "./warningClient";
import { METRO_ZONES, metroZoneIds, unknownMetroZoneIds } from "./warningZones";

// 컬럼: REG_UP, REG_UP_KO, REG_ID, REG_KO, TM_FC, TM_EF, WRN, LVL, CMD, ED_TM (실제 응답과 같은 형식 — 고정폭 공백과 끝의 "=" 포함)
const row = (regUp: string, regUpKo: string, regId: string, regKo: string, wrn: string, lvl: string, cmd = "발표") =>
  `${regUp}, ${regUpKo}                        , ${regId}, ${regKo}                    , 202609211300, 202609211500, ${wrn}  , ${lvl}    , ${cmd}, ,=`;

// 2026-09-21 15:40 KST에 실제로 내려온 울릉군 행: 강풍 "예비" (발효 예정 17:58, 아직 효력 없음)
const ULLEUNG_PRELIMINARY = "L1600000, 울릉도.독도                    , L1072100, 울릉도.독도                      , 202609201600, 202609211758, 강풍  , 예비    , 발표,  ,=";

test("예비특보(LVL=예비)는 특보로 인정하지 않는다 — 오늘 관찰된 울릉군 사례", () => {
  const parsed = parseWarnings(["#START7777", ULLEUNG_PRELIMINARY].join("\n"));
  assert.equal(parsed.length, 0);
  assert.deepEqual(matchRegionWarnings(parsed, "경북", "울릉군"), []);
});

test("실제 값 주의는 주의보로, 경보는 경보로 인식한다", () => {
  const text = [
    row("L1070000", "경상북도", "L1072500", "경주시", "호우", "주의"),
    row("L1070000", "경상북도", "L1071500", "안동시", "강풍", "경보"),
  ].join("\n");
  const parsed = parseWarnings(text);
  assert.deepEqual(matchRegionWarnings(parsed, "경북", "경주시"), [{ wrn: "호우", level: "주의보" }]);
  assert.deepEqual(matchRegionWarnings(parsed, "경북", "안동시"), [{ wrn: "강풍", level: "경보" }]);
});

test("중대경보는 경보로 취급한다(경보보다 높은 등급을 버리지 않는다)", () => {
  const parsed = parseWarnings(row("L1070000", "경상북도", "L1072500", "경주시", "폭염", "중대경보", "변경"));
  assert.deepEqual(matchRegionWarnings(parsed, "경북", "경주시"), [{ wrn: "폭염", level: "경보" }]);
});

test("화이트리스트에 없는 값은 모두 특보 없음: 모르는 수준, 빈 값, 부분 일치", () => {
  const text = [
    row("L1070000", "경상북도", "L1072500", "경주시", "호우", "미확인"),
    row("L1070000", "경상북도", "L1072500", "경주시", "호우", ""),
    row("L1070000", "경상북도", "L1072500", "경주시", "호우", "예비경보"), // "경보"를 포함하지만 정확히 일치하지 않는다
  ].join("\n");
  assert.equal(parseWarnings(text).length, 0);
});

test("해제된 특보와 해상 특보구역은 제외한다", () => {
  const text = [
    row("L1070000", "경상북도", "L1072500", "경주시", "호우", "주의", "해제"),
    row("S1130000", "동해남부전해상", "S1132110", "동해남부남쪽안쪽먼바다", "풍랑", "주의"),
  ].join("\n");
  assert.equal(parseWarnings(text).length, 0);
});

test("같은 시의 여러 구역에 같은 특보가 걸려도 한 번만 나온다", () => {
  const text = [
    row("L1073100", "경주시", "L1073110", "경주시중북부", "호우", "주의"),
    row("L1073100", "경주시", "L1073120", "경주시동부", "호우", "주의"),
    row("L1070000", "경상북도", "L1072500", "경주시", "호우", "주의"),
  ].join("\n");
  assert.deepEqual(matchRegionWarnings(parseWarnings(text), "경북", "경주시"), [{ wrn: "호우", level: "주의보" }]);
});

// ── 광역시 구역 소속표(warningZones.ts) ────────────────────────────────────────────────────────────
// 아래 "실제 응답" 행은 기상청 API허브 wrn_now_data 에서 과거 시점(tm)을 지정해 받은 것을 발췌했다(공백만 정리). 2026-09-21 확인.
const names = (ws: { wrn: string; level: string }[]) => ws.map((w) => `${w.wrn} ${w.level}`).sort();
const rowsOf = (...lines: string[]) => ["#START7777", ...lines].join("\n");

// 실제 응답 tm=202607291200 — 서울: 동남·동북·서남권 폭염경보, 서북권만 폭염주의(뉴스도 "서북권은 주의보 유지"라고 보도한 날)
const SEOUL_20260729 = rowsOf(
  "L1100000, 서울특별시 , L1100300, 서울서남권 , 202607291000, 202607291100, 폭염 , 경보 , 변경, ,=",
  "L1100000, 서울특별시 , L1100100, 서울동남권 , 202607281600, 202607291100, 폭염 , 경보 , 변경, ,=",
  "L1100000, 서울특별시 , L1100200, 서울동북권 , 202607281600, 202607291100, 폭염 , 경보 , 변경, ,=",
  "L1100000, 서울특별시 , L1100400, 서울서북권 , 202607241000, 202607241100, 폭염 , 주의 , 발표, ,=",
  "L1100000, 서울특별시 , L1100200, 서울동북권 , 202607241600, 202607241700, 열대야, 주의 , 발표, ,=",
  "L1100000, 서울특별시 , L1100400, 서울서북권 , 202607241600, 202607241700, 열대야, 주의 , 발표, ,=",
  "L1100000, 서울특별시 , L1100100, 서울동남권 , 202607231600, 202607231800, 열대야, 주의 , 발표, ,=",
  "L1100000, 서울특별시 , L1100300, 서울서남권 , 202607231600, 202607231800, 열대야, 주의 , 발표, ,=",
);

test("실제 2026-07-29 서울: 종로구 등 서북권은 서북권 특보(폭염주의보)만, 나머지 권역은 자기 권역 특보(폭염경보)를 받는다", () => {
  const all = parseWarnings(SEOUL_20260729);
  // 예전에는 서울의 모든 구가 [열대야 주의보, 폭염 경보, 폭염 주의보]를 받았다.
  for (const gu of ["종로구", "중구", "용산구", "서대문구", "마포구", "은평구"]) {
    assert.deepEqual(names(matchRegionWarnings(all, "서울", gu)), ["열대야 주의보", "폭염 주의보"], `${gu}(서북권)`);
  }
  for (const gu of ["강남구", "서초구", "송파구", "강동구"]) assert.deepEqual(names(matchRegionWarnings(all, "서울", gu)), ["열대야 주의보", "폭염 경보"], `${gu}(동남권)`);
  for (const gu of ["노원구", "성북구", "동대문구", "광진구"]) assert.deepEqual(names(matchRegionWarnings(all, "서울", gu)), ["열대야 주의보", "폭염 경보"], `${gu}(동북권)`);
  for (const gu of ["강서구", "관악구", "영등포구", "금천구"]) assert.deepEqual(names(matchRegionWarnings(all, "서울", gu)), ["열대야 주의보", "폭염 경보"], `${gu}(서남권)`);
});

test("서울: 한 권역에만 걸린 특보는 다른 권역의 구에 나타나지 않고, 도시 전체 구역(L1100000)의 특보는 모든 구가 받는다", () => {
  const onlyNorthwest = parseWarnings(rowsOf("L1100000, 서울특별시 , L1100400, 서울서북권 , 202609011000, 202609011100, 호우 , 경보 , 발표, ,="));
  assert.deepEqual(names(matchRegionWarnings(onlyNorthwest, "서울", "종로구")), ["호우 경보"]);
  assert.deepEqual(matchRegionWarnings(onlyNorthwest, "서울", "강남구"), []);
  const cityWide = parseWarnings(rowsOf("L1000000, 전국 , L1100000, 서울특별시 , 202609011000, 202609011100, 태풍 , 경보 , 발표, ,="));
  assert.deepEqual(names(matchRegionWarnings(cityWide, "서울", "종로구")), ["태풍 경보"]);
  assert.deepEqual(names(matchRegionWarnings(cityWide, "서울", "강남구")), ["태풍 경보"]);
});

// 부산·울산: 구역 ID는 실제 응답에서 확인한 값이고, 특보 내용은 소속을 검증하려고 만든 가상 행이다.
test("부산: 동부·중부·서부 구역 특보를 그 구역의 구만 받는다(같은 이름의 서울 중구와 섞이지 않는다)", () => {
  const all = parseWarnings(
    rowsOf(
      "L1150000, 부산광역시 , L1082500, 부산동부 , 202609011000, 202609011100, 폭염 , 경보 , 발표, ,=",
      "L1150000, 부산광역시 , L1082700, 부산서부 , 202609011000, 202609011100, 호우 , 주의 , 발표, ,=",
      "L1100000, 서울특별시 , L1100400, 서울서북권 , 202609011000, 202609011100, 강풍 , 주의 , 발표, ,=",
    ),
  );
  assert.deepEqual(names(matchRegionWarnings(all, "부산", "해운대구")), ["폭염 경보"]);
  assert.deepEqual(names(matchRegionWarnings(all, "부산", "기장군")), ["폭염 경보"]);
  assert.deepEqual(matchRegionWarnings(all, "부산", "동래구"), []); // 중부
  assert.deepEqual(names(matchRegionWarnings(all, "부산", "중구")), ["호우 주의보"]); // 부산 중구는 서부 — 서울 서북권의 강풍은 받지 않는다
  assert.deepEqual(names(matchRegionWarnings(all, "서울", "중구")), ["강풍 주의보"]);
});

test("울산: 울주군은 울산서부, 나머지 구는 울산동부", () => {
  const all = parseWarnings(
    rowsOf(
      "L1160000, 울산광역시 , L1082900, 울산서부 , 202609011000, 202609011100, 폭염 , 경보 , 발표, ,=",
      "L1160000, 울산광역시 , L1082800, 울산동부 , 202609011000, 202609011100, 호우 , 주의 , 발표, ,=",
    ),
  );
  assert.deepEqual(names(matchRegionWarnings(all, "울산", "울주군")), ["폭염 경보"]);
  assert.deepEqual(names(matchRegionWarnings(all, "울산", "남구")), ["호우 주의보"]);
  assert.deepEqual(names(matchRegionWarnings(all, "울산", "중구")), ["호우 주의보"]);
});

// 실제 응답 tm=202608030900 — 광주: 광주동부만 열대야주의보(8/1 발표), 광주서부는 폭염경보 하나
const GWANGJU_20260803 = rowsOf(
  "L1130100, 광주광역시 , L1130120, 광주동부 , 202608021600, 202608031100, 폭염 , 중대경보, 변경, ,=",
  "L1130100, 광주광역시 , L1130110, 광주서부 , 202607221310, 202607221310, 폭염 , 경보 , 변경, ,=",
  "L1130100, 광주광역시 , L1130120, 광주동부 , 202608011600, 202608011800, 열대야, 주의 , 발표, ,=",
);
test("실제 2026-08-03 광주: 광산구는 광주서부, 동·서·남·북구는 광주동부(중대경보는 경보로 취급)", () => {
  const all = parseWarnings(GWANGJU_20260803);
  assert.deepEqual(names(matchRegionWarnings(all, "전남광주", "광산구")), ["폭염 경보"]);
  for (const gu of ["동구", "서구", "남구", "북구"]) assert.deepEqual(names(matchRegionWarnings(all, "전남광주", gu)), ["열대야 주의보", "폭염 경보"], gu);
  // 같은 통합특별시 안의 전남 시군은 광주 구역과 무관하다
  assert.deepEqual(matchRegionWarnings(all, "전남광주", "담양군"), []);
});

// 실제 응답 tm=202607291200 — 인천·대구·세종
const OTHERS_20260729 = rowsOf(
  "L1110100, 인천광역시 , L1110130, 인천북부 , 202607291000, 202607291100, 폭염 , 경보 , 변경, ,=",
  "L1110000, 인천광역시 , L1010900, 강화군 , 202607271600, 202607281100, 폭염 , 주의 , 발표, ,=",
  "L1110000, 인천광역시 , L1013600, 옹진군 , 202607251000, 202607251100, 폭염 , 주의 , 발표, ,=",
  "L1110100, 인천광역시 , L1110110, 인천영종 , 202607241000, 202607241100, 폭염 , 주의 , 발표, ,=",
  "L1110100, 인천광역시 , L1110120, 인천남부 , 202607241000, 202607241100, 폭염 , 주의 , 발표, ,=",
  "L1110000, 인천광역시 , L1010900, 강화군 , 202607271600, 202607271800, 열대야, 주의 , 발표, ,=",
  "L1140000, 대구광역시 , L1140100, 대구중부 , 202607281310, 202607281310, 폭염 , 경보 , 변경, ,=",
  "L1140200, 달성군 , L1140210, 달성군북부 , 202607271830, 202607271830, 폭염 , 경보 , 변경, ,=",
  "L1140200, 달성군 , L1140220, 달성군남부 , 202607211600, 202607211800, 열대야, 주의 , 발표, ,=",
  "L1170100, 세종특별자치시 , L1170120, 세종남부 , 202607241310, 202607241400, 폭염 , 경보 , 변경, ,=",
  "L1170100, 세종특별자치시 , L1170110, 세종북부 , 202607221310, 202607221310, 폭염 , 주의 , 발표, ,=",
);
test("소속표를 두지 않은 곳은 기존 동작 그대로: 인천 구는 도시 전체 구역의 합집합, 강화·옹진군은 자체 구역", () => {
  const all = parseWarnings(OTHERS_20260729);
  assert.deepEqual(names(matchRegionWarnings(all, "인천", "계양구")), ["폭염 경보", "폭염 주의보"]); // 새 구 이름(서해구·제물포구·영종구)도 같다
  assert.deepEqual(names(matchRegionWarnings(all, "인천", "영종구")), ["폭염 경보", "폭염 주의보"]);
  assert.deepEqual(names(matchRegionWarnings(all, "인천", "강화군")), ["열대야 주의보", "폭염 주의보"]);
  assert.deepEqual(names(matchRegionWarnings(all, "인천", "옹진군")), ["폭염 주의보"]);
});

test("소속표를 두지 않은 곳은 기존 동작 그대로: 대구 구는 대구중부만, 달성군·세종은 구역 합집합", () => {
  const all = parseWarnings(OTHERS_20260729);
  assert.deepEqual(names(matchRegionWarnings(all, "대구", "중구")), ["폭염 경보"]); // 달성군남부의 열대야는 받지 않는다
  assert.deepEqual(names(matchRegionWarnings(all, "대구", "달성군")), ["열대야 주의보", "폭염 경보"]);
  assert.deepEqual(names(matchRegionWarnings(all, "세종", "세종특별자치시")), ["폭염 경보", "폭염 주의보"]);
});

test("소속표: 서울 25구·부산 16곳·울산 5곳·광주 5구가 빠짐없이 정확히 한 구역에만 속한다", () => {
  const expectCount = { 서울: 25, 부산: 16, 울산: 5, 전남광주: 5 } as const;
  for (const [region, n] of Object.entries(expectCount)) {
    const members = Object.values(METRO_ZONES[region].zones).flat();
    assert.equal(members.length, n, `${region} 소속 수`);
    assert.equal(new Set(members).size, members.length, `${region}: 한 구가 두 구역에 속함`);
  }
  for (const metro of Object.values(METRO_ZONES)) for (const id of [...metro.cityWide, ...Object.keys(metro.zones)]) assert.match(id, /^L\d{7}$/);
  // 표에 없는 곳은 null → 기존 규칙으로 처리
  assert.equal(metroZoneIds("인천", "계양구"), null);
  assert.equal(metroZoneIds("대구", "달성군"), null);
  assert.equal(metroZoneIds("세종", "세종특별자치시"), null);
  assert.equal(metroZoneIds("경북", "경주시"), null);
  assert.deepEqual([...metroZoneIds("서울", "종로구")!].sort(), ["L1100000", "L1100400"]);
});

test("소속표에 없는 새 광역시 구역 ID를 찾아낸다(기상청이 구역을 다시 나눈 경우), 표 밖 도시는 무시한다", () => {
  assert.deepEqual(
    unknownMetroZoneIds([
      { regId: "L1100100", province: "서울" }, // 알려진 권역
      { regId: "L1100500", province: "서울" }, // 새 권역
      { regId: "L1110130", province: "인천" }, // 인천은 표를 두지 않았으므로 감시 대상이 아님
      { regId: "L1072500", province: "경북" },
    ]),
    ["L1100500"],
  );
});
