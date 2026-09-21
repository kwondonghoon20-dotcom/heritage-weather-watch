import { test } from "node:test";
import assert from "node:assert/strict";
import { matchRegionWarnings, parseWarnings } from "./warningClient";

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
