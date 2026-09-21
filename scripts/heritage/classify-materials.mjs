// data/heritage-outdoor.geojson 의 각 유산에 재질(_material)과 판정 근거(_materialReason)를 붙여
// data/heritage-classified.geojson 을 만든다. (이름 키워드 규칙: lib/material-rules.mjs)
//  - _material: wood | stone | wall | mound | dolmen | site | modern  (규칙으로 못 정하면 null)
//  - _materialReason: "<규칙 id>:<근거 키워드>"
// 도형·기존 속성은 그대로 둔다. 검수용 전체 목록은 data/raw/heritage/material-review.tsv 에 남긴다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyMaterial, MATERIAL_LABEL } from "./lib/material-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const IN_FILE = path.join(ROOT, "data/heritage-outdoor.geojson");
const OUT_FILE = path.join(ROOT, "data/heritage-classified.geojson");
const REVIEW = path.join(ROOT, "data/raw/heritage/material-review.tsv");

const fc = JSON.parse(fs.readFileSync(IN_FILE, "utf8"));
const out = [];
const rows = [["재질", "종목", "국가유산명", "시도", "시군구", "_materialReason"].join("\t")];
const byMaterial = {}, byRule = {}, unclassified = [];

for (const f of fc.features) {
  const r = classifyMaterial(f.properties);
  const p = { ...f.properties, _material: r.material, _materialReason: `${r.rule}:${r.matched}` };
  out.push({ ...f, properties: p });
  const label = r.material ? `${r.material}(${MATERIAL_LABEL[r.material]})` : "미분류";
  byMaterial[label] = (byMaterial[label] ?? 0) + 1;
  byRule[r.rule] = (byRule[r.rule] ?? 0) + 1;
  if (!r.material) unclassified.push(f.properties.국가유산명);
  rows.push([r.material ?? "", f.properties.종목명, f.properties.국가유산명, f.properties.시도명, f.properties.시군구명 ?? "", p._materialReason].join("\t"));
}

const tmp = OUT_FILE + ".part";
fs.writeFileSync(tmp, '{"type":"FeatureCollection","features":[\n' + out.map((f) => JSON.stringify(f)).join(",\n") + "\n]}\n");
fs.renameSync(tmp, OUT_FILE);
fs.mkdirSync(path.dirname(REVIEW), { recursive: true });
fs.writeFileSync(REVIEW, rows.join("\n") + "\n");

console.log(`입력 ${fc.features.length}건 → 출력 ${out.length}건`);
console.log("재질별:", JSON.stringify(byMaterial));
console.log("규칙별:", JSON.stringify(byRule));
if (unclassified.length) console.log(`미분류 ${unclassified.length}건:`, unclassified.join(" / "));
console.log(`출력: ${OUT_FILE}\n검수 목록: ${REVIEW}`);
