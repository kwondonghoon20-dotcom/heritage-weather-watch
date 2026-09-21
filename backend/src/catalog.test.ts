import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { HERITAGE_SITES } from "./data/heritageSites.generated";
import { latLonToGrid } from "./domain/grid";

const byId = new Map(HERITAGE_SITES.map((s) => [s.id, s]));
const meters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  Math.hypot((a.lat - b.lat) * 110540, (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180));

test("coordinate-fixes.json 의 보정이 카탈로그에 반영돼 있다(카탈로그를 다시 만들지 않았거나 보정이 되돌아간 경우를 잡는다)", () => {
  const fixes = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../scripts/heritage/coordinate-fixes.json"), "utf8")).fixes;
  assert.ok(fixes.length > 0);
  for (const fix of fixes) {
    const rec = byId.get(fix.code);
    assert.ok(rec, `카탈로그에 ${fix.code} 없음`);
    assert.equal(rec.name, fix.name);
    assert.deepEqual({ lat: rec.lat, lng: rec.lng }, { lat: fix.lat, lng: fix.lng }, fix.name);
  }
});

test("경주 불국사(사적) 대표점은 경내에 있다: 석굴암과 멀리 떨어지고, 같은 불국사의 대웅전·다보탑 등과 가깝다", () => {
  const sajeok = byId.get("13000502000000037")!;
  const seokgulam = byId.get("11000024000000037")!; // 경주 석굴암 석굴
  assert.equal(sajeok.name, "경주 불국사");
  assert.ok(meters(sajeok, seokgulam) > 1500, `석굴암과 ${Math.round(meters(sajeok, seokgulam))}m — 산 쪽으로 밀린 예전 좌표(472m)로 되돌아갔다`);
  for (const id of ["12001744000000037", "11000020000000037", "11000021000000037"]) {
    const part = byId.get(id)!; // 대웅전, 다보탑, 삼층석탑
    assert.ok(meters(sajeok, part) < 300, `${part.name}와 ${Math.round(meters(sajeok, part))}m`);
  }
  // 기상청 격자는 좌표에서 계산되며 이 보정 전후로 같다(102,89)
  assert.deepEqual(latLonToGrid(sajeok.lat, sajeok.lng), { nx: 102, ny: 89 });
});
