// data/heritage-merged.geojson 에서 "야외 노출 국가지정유산"만 골라 data/heritage-outdoor.geojson 을 만든다.
// 이 파일이 다음 단계(재질 자동 분류)의 입력이다.
//
// 범위(결정 사항):
//   - 레이어: 국가지정유산만 (국가등록·시도지정·시도등록은 이번 범위 밖)
//   - 종목: 국보 · 보물 · 사적 · 국가민속문화유산 (자연유산인 천연기념물·명승은 별도 확장 과제로 제외)
//   - 이름 규칙(lib/outdoor-rules.mjs)이 "야외"로 판정한 것만. "실내"·"애매"는 제외(동굴·해저유물 등 예외 포함)
// 각 레코드에 _outdoorReason("<규칙>:<근거>")을 남기고, 제외된 국가지정 레코드는 사유와 함께
// data/raw/heritage/outdoor-filter-log.json 에 기록한다. 도형·기존 속성은 그대로 둔다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classify } from "./lib/outdoor-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const IN_FILE = path.join(ROOT, "data/heritage-merged.geojson");
const OUT_FILE = path.join(ROOT, "data/heritage-outdoor.geojson");
const LOG = path.join(ROOT, "data/raw/heritage/outdoor-filter-log.json");

const SCOPE_LAYER = "국가지정유산";
const SCOPE_KINDS = ["국보", "보물", "사적", "국가민속문화유산"];
const NATURAL_KINDS = new Set(["천연기념물", "명승"]); // 자연유산 — 이번엔 제외

const fc = JSON.parse(fs.readFileSync(IN_FILE, "utf8"));
const kept = [];
const dropped = []; // 국가지정 중 범위에서 빠진 레코드 (사유 포함)
const outLayerCount = {};

for (const f of fc.features) {
  const p = f.properties;
  if (p._layer !== SCOPE_LAYER) { outLayerCount[p._layer] = (outLayerCount[p._layer] ?? 0) + 1; continue; }
  if (NATURAL_KINDS.has(p.종목명)) { dropped.push({ 유산코드: p.유산코드, 국가유산명: p.국가유산명, 종목명: p.종목명, reason: "자연유산(이번 범위 제외)" }); continue; }
  if (!SCOPE_KINDS.includes(p.종목명)) throw new Error(`예상 밖 종목: ${p.종목명} (${p.국가유산명})`);
  const r = classify(p);
  if (r.cls !== "야외") { dropped.push({ 유산코드: p.유산코드, 국가유산명: p.국가유산명, 종목명: p.종목명, reason: `${r.cls}:${r.rule}${r.matched ? ":" + r.matched : ""}` }); continue; }
  kept.push({ ...f, properties: { ...p, _outdoorReason: `${r.rule}:${r.matched}` } });
}

const tmp = OUT_FILE + ".part";
fs.writeFileSync(tmp, '{"type":"FeatureCollection","features":[\n' + kept.map((f) => JSON.stringify(f)).join(",\n") + "\n]}\n");
fs.renameSync(tmp, OUT_FILE);

const tally = (rows, get) => rows.reduce((o, r) => ((o[get(r)] = (o[get(r)] ?? 0) + 1), o), {});
const byKind = tally(kept, (f) => f.properties.종목명);
const byRule = tally(kept, (f) => f.properties._outdoorReason.split(":")[0]);
fs.mkdirSync(path.dirname(LOG), { recursive: true });
fs.writeFileSync(LOG, JSON.stringify({
  note: "heritage-merged.geojson → heritage-outdoor.geojson 필터 기록. dropped 는 국가지정 중 범위에서 빠진 레코드와 사유.",
  scope: { layer: SCOPE_LAYER, kinds: SCOPE_KINDS, excludedNatural: [...NATURAL_KINDS] },
  counts: { input: fc.features.length, kept: kept.length, byKind, byRule, droppedNationalDesignated: dropped.length, outsideLayer: outLayerCount },
  dropped,
}, null, 1));

console.log(`입력 ${fc.features.length}건 → 출력 ${kept.length}건`);
console.log("종목별:", JSON.stringify(byKind));
console.log("근거 규칙별:", JSON.stringify(byRule));
console.log(`범위 밖 레이어: ${JSON.stringify(outLayerCount)}`);
console.log(`국가지정 중 제외: ${dropped.length}건 — ${JSON.stringify(tally(dropped, (d) => d.reason.split(":").slice(0, 2).join(":")))}`);
console.log(`출력: ${OUT_FILE}\n기록: ${LOG}`);
