// data/heritage-full.geojson 에서 "국가지정 ↔ 시도지정 중복 등록" 24쌍의 시도지정 레코드를 제거해 data/heritage-merged.geojson 을 만든다.
// 입력 heritage-full.geojson 은 건드리지 않는다 (재현·복구용 원본).
//
// 적용 대상 (find-duplicates.mjs 의 보고서 data/raw/heritage/duplicates-report.json 기준):
//   A (17쌍) 이름 동일 + 대표점 거리 ≤200m + 도형 IoU ≥ 0.5         → 제거
//   B ( 7쌍) 이름은 다르고 도형 IoU ≥ 0.8                            → 제거 (7쌍 전부 사용자가 눈으로 확인해 "같은 유산"으로 판정)
//   C ( 3쌍) 이름 동일·가깝지만 도형이 거의 안 겹침(IoU < 0.5)        → 둘 다 유지
// 제거되는 쪽은 항상 시도지정유산이며, 남는 국가지정유산 레코드에 _alsoRegisteredAs 로 제거된 레코드의 코드·이름·종목을 남긴다.
// 제거된 레코드 전체와 쌍 목록은 data/raw/heritage/merge-log.json 에 보관한다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const IN_FILE = path.join(ROOT, "data/heritage-full.geojson");
const OUT_FILE = path.join(ROOT, "data/heritage-merged.geojson");
const REPORT = path.join(ROOT, "data/raw/heritage/duplicates-report.json");
const LOG = path.join(ROOT, "data/raw/heritage/merge-log.json");

const EXPECT = { A: 17, B: 7, C: 3 };
const KEEP_LAYER = "국가지정유산";
const DROP_LAYER = "시도지정유산";

const report = JSON.parse(fs.readFileSync(REPORT, "utf8"));
const fc = JSON.parse(fs.readFileSync(IN_FILE, "utf8"));
const byCode = new Map(fc.features.map((f) => [f.properties.유산코드, f]));
const pairId = (x, y) => [x, y].sort().join("|");

// ---- 쌍 분류 ----
const A = report.nameSameNear.filter((r) => r.distM <= 200 && r.iou !== null && r.iou >= 0.5);
const C = report.nameSameNear.filter((r) => !(r.distM <= 200 && r.iou !== null && r.iou >= 0.5));
const nameSame = new Set(report.nameSamePairs.map((r) => pairId(r.a.code, r.b.code)));
const B = report.shapeSimilarPairs.filter((r) => !nameSame.has(pairId(r.a.code, r.b.code)));

const counts = { A: A.length, B: B.length, C: C.length };
for (const k of Object.keys(EXPECT)) {
  if (counts[k] !== EXPECT[k]) throw new Error(`쌍 개수 불일치: ${k} = ${counts[k]} (기대 ${EXPECT[k]}) — 보고서/기준이 바뀌었는지 확인하세요`);
}

// ---- 제거/유지 결정 ----
const drops = new Map(); // 제거할 시도지정 코드 → { kept, dropped, group }
const problems = [];
for (const [group, rows] of [["A", A], ["B", B]]) {
  for (const r of rows) {
    const fa = byCode.get(r.a.code), fb = byCode.get(r.b.code);
    if (!fa || !fb) { problems.push(`${group}: 레코드 없음 ${r.a.code} / ${r.b.code}`); continue; }
    const kept = [fa, fb].find((f) => f.properties._layer === KEEP_LAYER);
    const dropped = [fa, fb].find((f) => f.properties._layer === DROP_LAYER);
    if (!kept || !dropped) { problems.push(`${group}: 국가지정×시도지정 쌍이 아님 ${fa.properties.국가유산명} / ${fb.properties.국가유산명}`); continue; }
    if (drops.has(dropped.properties.유산코드)) problems.push(`${group}: 시도지정 레코드가 여러 쌍에 걸침 ${dropped.properties.국가유산명}`);
    drops.set(dropped.properties.유산코드, { kept, dropped, group });
  }
}
// C 쌍은 절대 제거 대상이면 안 된다
for (const r of C) for (const c of [r.a.code, r.b.code]) if (drops.has(c)) problems.push(`C 쌍의 레코드가 제거 대상에 포함됨: ${c}`);
// 제거로 남는 국가지정 쪽이 다른 제거 대상이 되면 안 된다 (연쇄 방지)
for (const { kept } of drops.values()) if (drops.has(kept.properties.유산코드)) problems.push(`남기려는 레코드가 제거 대상: ${kept.properties.국가유산명}`);
if (problems.length) throw new Error("병합 중단:\n - " + problems.join("\n - "));
if (drops.size !== EXPECT.A + EXPECT.B) throw new Error(`제거 대상 ${drops.size}건 (기대 ${EXPECT.A + EXPECT.B})`);

// ---- 병합 ----
const alsoBy = new Map(); // 남기는 국가지정 코드 → [{...}]
for (const { kept, dropped } of drops.values()) {
  const p = dropped.properties;
  const arr = alsoBy.get(kept.properties.유산코드) ?? [];
  arr.push({ 유산코드: p.유산코드, 국가유산명: p.국가유산명, 종목명: p.종목명 });
  alsoBy.set(kept.properties.유산코드, arr);
}
const outFeatures = [];
for (const f of fc.features) {
  if (drops.has(f.properties.유산코드)) continue;
  const extra = alsoBy.get(f.properties.유산코드);
  outFeatures.push(extra ? { ...f, properties: { ...f.properties, _alsoRegisteredAs: extra } } : f);
}

const tmp = OUT_FILE + ".part";
fs.writeFileSync(tmp, '{"type":"FeatureCollection","features":[\n' + outFeatures.map((f) => JSON.stringify(f)).join(",\n") + "\n]}\n");
fs.renameSync(tmp, OUT_FILE);

const slim = (f) => ({ 유산코드: f.properties.유산코드, 국가유산명: f.properties.국가유산명, 종목명: f.properties.종목명, 레이어: f.properties._layer, 시도명: f.properties.시도명, 시군구명: f.properties.시군구명 });
fs.writeFileSync(
  LOG,
  JSON.stringify(
    {
      note: "heritage-full.geojson → heritage-merged.geojson 병합 기록. removed 는 제거된 시도지정 레코드 전체(복구용), C 는 유지된 쌍.",
      counts: { before: fc.features.length, after: outFeatures.length, removed: drops.size, ...counts },
      pairs: [...drops.values()].map(({ kept, dropped, group }) => ({ group, kept: slim(kept), removed: slim(dropped) })),
      keptBoth: C.map((r) => ({ a: r.a, b: r.b, distM: r.distM, iou: r.iou })),
      removed: [...drops.values()].map(({ dropped }) => dropped),
    },
    null,
    1,
  ),
);
console.log(`병합 완료: ${fc.features.length} → ${outFeatures.length} (제거 ${drops.size}건: A ${A.length} + B ${B.length}, C ${C.length}쌍은 유지)`);
console.log(`출력: ${OUT_FILE}\n기록: ${LOG}`);
