// data/heritage-full.geojson 의 4개 레이어 사이에 "같은 유산이 중복 등록"된 것이 있는지 찾는다. (보고 전용 — 병합/삭제는 하지 않는다)
//
// 세 가지 독립 기준을 각각 센다:
//   ① 유산코드가 서로 다른 레이어에서 동일
//   ② 이름이 같고(공백·가운뎃점 제거, 앞의 시군구/시도 접두어 제거 버전 포함) 대표점이 가까움
//   ③ 이름과 무관하게 도형 모양이 거의 같음 (폴리곤 IoU ≥ 0.8) — 이름이 바뀐 중복까지 잡기 위함
// 결과 요약은 콘솔에, 전체 목록은 data/raw/heritage/duplicates-report.json 에 저장한다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import area from "@turf/area";
import intersect from "@turf/intersect";
import { featureCollection } from "@turf/helpers";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const IN_FILE = process.argv[2] ?? path.join(ROOT, "data/heritage-full.geojson"); // 인자로 다른 파일(예: 병합본)을 검사할 수 있다
const F = JSON.parse(fs.readFileSync(IN_FILE, "utf8")).features;
const REPORT = process.argv[3] ?? path.join(ROOT, "data/raw/heritage/duplicates-report.json");

const rad = Math.PI / 180;
const hav = (a, b) => {
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(h));
};
const norm = (s) => s.normalize("NFC").replace(/[\s·ㆍ‧,.()\[\]「」『』"'‘’“”\-]/g, "");
const SIDO_SHORT = new Set(["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"]);

function coreName(p) {
  const name = (p.국가유산명 ?? "").trim();
  const tokens = name.split(/\s+/);
  if (tokens.length > 1) {
    const sg = (p.시군구명 ?? "").replace(/(시|군|구)$/, "");
    if (SIDO_SHORT.has(tokens[0]) || (sg && tokens[0].replace(/(시|군|구)$/, "") === sg)) return norm(tokens.slice(1).join(" "));
  }
  return norm(name);
}

const items = F.map((f, i) => {
  const p = f.properties;
  const xs = [], ys = [];
  for (const poly of f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates) for (const [x, y] of poly[0]) { xs.push(x); ys.push(y); }
  return { i, f, p, layer: p._layer, name: p.국가유산명, full: norm(p.국가유산명), core: coreName(p), lng: p._repLng, lat: p._repLat, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], areaM2: null };
});
const areaOf = (it) => (it.areaM2 ??= area(it.f));
const label = (it) => `${it.name} [${it.layer}/${it.p.종목명}] ${it.p.시도명} ${it.p.시군구명 ?? ""}`.trim();

function iou(a, b) {
  try {
    const inter = intersect(featureCollection([a.f, b.f]));
    if (!inter) return 0;
    const ia = area(inter);
    return ia / (areaOf(a) + areaOf(b) - ia);
  } catch {
    return null; // 위상 오류 등 — 계산 불가로 따로 센다
  }
}

// ---------- ① 유산코드 ----------
const byCode = new Map();
for (const it of items) (byCode.get(it.p.유산코드) ?? byCode.set(it.p.유산코드, []).get(it.p.유산코드)).push(it);
const codeDup = [...byCode.values()].filter((g) => new Set(g.map((x) => x.layer)).size > 1);

// ---------- ② 이름 동일 + 근접 ----------
const pairKey = (a, b) => (a.i < b.i ? `${a.i}|${b.i}` : `${b.i}|${a.i}`);
const namePairs = new Map();
for (const kind of ["full", "core"]) {
  const groups = new Map();
  for (const it of items) if (it[kind].length >= 2) (groups.get(it[kind]) ?? groups.set(it[kind], []).get(it[kind])).push(it);
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    for (let x = 0; x < g.length; x++) for (let y = x + 1; y < g.length; y++) {
      const a = g[x], b = g[y];
      if (a.layer === b.layer) continue; // 레이어 "사이"만 본다
      const k = pairKey(a, b);
      const rec = namePairs.get(k) ?? { a, b, dist: hav(a, b), matchedBy: new Set() };
      rec.matchedBy.add(kind);
      namePairs.set(k, rec);
    }
  }
}
const bucket = (d) => (d <= 50 ? "≤50m" : d <= 200 ? "≤200m" : d <= 1000 ? "≤1km" : ">1km");
const nameNear = [...namePairs.values()].filter((r) => r.dist <= 1000);
for (const r of nameNear) r.iou = iou(r.a, r.b);

// ---------- ③ 도형 모양이 거의 같은 쌍 (이름 무관) ----------
const CELL = 0.05; // 격자 인덱스(도)
const grid = new Map();
for (const it of items) {
  for (let cx = Math.floor(it.bbox[0] / CELL); cx <= Math.floor(it.bbox[2] / CELL); cx++)
    for (let cy = Math.floor(it.bbox[1] / CELL); cy <= Math.floor(it.bbox[3] / CELL); cy++) {
      const k = `${cx},${cy}`;
      (grid.get(k) ?? grid.set(k, []).get(k)).push(it);
    }
}
const bboxIoU = (a, b) => {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h, ua = (a[2] - a[0]) * (a[3] - a[1]), ub = (b[2] - b[0]) * (b[3] - b[1]);
  return inter / (ua + ub - inter);
};
const seen = new Set();
const shapePairs = [];
let iouFailures = 0, shapeChecked = 0;
for (const cell of grid.values()) {
  for (let x = 0; x < cell.length; x++) for (let y = x + 1; y < cell.length; y++) {
    const a = cell[x], b = cell[y];
    if (a.layer === b.layer) continue;
    const k = pairKey(a, b);
    if (seen.has(k)) continue;
    seen.add(k);
    if (bboxIoU(a.bbox, b.bbox) < 0.5) continue; // 값싼 사전 필터: 바깥 상자가 많이 다르면 같은 도형일 수 없다
    shapeChecked++;
    const v = namePairs.get(k)?.iou ?? iou(a, b);
    if (v === null) { iouFailures++; continue; }
    if (v >= 0.8) shapePairs.push({ a, b, iou: v, dist: hav(a, b) });
  }
}

// ---------- 보고 ----------
const pairLayers = (a, b) => [a.layer, b.layer].sort().join(" × ");
const tally = (rows, get) => rows.reduce((m, r) => ((m[get(r)] = (m[get(r)] ?? 0) + 1), m), {});
console.log(`전체 ${items.length}건 (이름 없는 6건 제외 후)`);

console.log(`\n## ① 유산코드가 서로 다른 레이어에서 동일: ${codeDup.length}개 코드`);
for (const g of codeDup.slice(0, 5)) console.log("  - " + g.map(label).join("  ==  "));

console.log(`\n## ② 이름이 같고(접두어 제거 포함) 서로 다른 레이어인 쌍: ${namePairs.size}쌍`);
console.log("- 대표점 거리 구간별:", JSON.stringify(tally([...namePairs.values()], (r) => bucket(r.dist))));
console.log("  (1km 초과 = 이름만 같은 서로 다른 유산일 가능성이 높음. 예: 흔한 이름의 보호수/석탑)");
console.log("- 1km 이내 쌍의 레이어 조합:", JSON.stringify(tally(nameNear, (r) => pairLayers(r.a, r.b))));
const nearOverlap = nameNear.filter((r) => r.iou !== null && r.iou >= 0.5);
console.log(`- 1km 이내 쌍 중 도형 IoU ≥ 0.5(실제로 겹침): ${nearOverlap.length}쌍 / IoU 0(겹치지 않음): ${nameNear.filter((r) => r.iou === 0).length}쌍 / 계산 불가: ${nameNear.filter((r) => r.iou === null).length}쌍`);

console.log(`\n## ③ 이름과 무관하게 도형이 거의 같은(IoU ≥ 0.8) 서로 다른 레이어 쌍: ${shapePairs.length}쌍 (bbox 사전필터 통과 ${shapeChecked}쌍 검사, 계산 불가 ${iouFailures}쌍)`);
console.log("- 레이어 조합:", JSON.stringify(tally(shapePairs, (r) => pairLayers(r.a, r.b))));
const nameAlsoMatched = shapePairs.filter((r) => namePairs.has(pairKey(r.a, r.b))).length;
console.log(`- 그중 ②(이름 동일)로도 잡힌 쌍: ${nameAlsoMatched}쌍 / 이름은 다른데 도형만 같은 쌍: ${shapePairs.length - nameAlsoMatched}쌍`);

const ex = (title, rows, fmt, n = 8) => {
  console.log(`\n### ${title}`);
  for (const r of rows.slice(0, n)) console.log("  - " + fmt(r));
};
ex("② 예시: 이름 동일 + 거리 ≤200m + 도형 겹침(IoU≥0.5)", nearOverlap.filter((r) => r.dist <= 200).sort((x, y) => y.iou - x.iou),
  (r) => `${label(r.a)}  ↔  ${label(r.b)} | 거리 ${r.dist.toFixed(0)}m, IoU ${r.iou.toFixed(2)}`);
ex("② 예시: 이름 동일 + 거리 ≤200m 이지만 도형이 겹치지 않음(IoU 0)", nameNear.filter((r) => r.dist <= 200 && r.iou === 0),
  (r) => `${label(r.a)}  ↔  ${label(r.b)} | 거리 ${r.dist.toFixed(0)}m`);
ex("③ 예시: 이름은 다른데 도형이 거의 같은 쌍", shapePairs.filter((r) => !namePairs.has(pairKey(r.a, r.b))).sort((x, y) => y.iou - x.iou),
  (r) => `${label(r.a)}  ↔  ${label(r.b)} | IoU ${r.iou.toFixed(2)}, 거리 ${r.dist.toFixed(0)}m`);

fs.mkdirSync(path.dirname(REPORT), { recursive: true });
const ser = (r) => ({ a: { name: r.a.name, layer: r.a.layer, code: r.a.p.유산코드, 종목명: r.a.p.종목명 }, b: { name: r.b.name, layer: r.b.layer, code: r.b.p.유산코드, 종목명: r.b.p.종목명 }, distM: Math.round(r.dist), iou: r.iou == null ? null : +r.iou.toFixed(3) });
fs.writeFileSync(REPORT, JSON.stringify({ codeDuplicates: codeDup.map((g) => g.map(label)), nameSamePairs: [...namePairs.values()].map(ser), nameSameNear: nameNear.map(ser), shapeSimilarPairs: shapePairs.map(ser) }, null, 1));
console.log(`\n전체 목록: ${REPORT}`);
