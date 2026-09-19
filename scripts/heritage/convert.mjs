// data/raw/heritage/<시도코드>.zip 의 Shapefile(4개 레이어)을 읽어 WGS84 GeoJSON 하나로 합친다 → data/heritage-full.geojson
//
// - .dbf 속성은 CP949("euc-kr")로 디코딩한다.
// - 좌표 변환은 각 레이어의 .prj 정의를 그대로 proj4에 넘긴다 (EPSG 파라미터를 코드에 하드코딩하지 않는다).
// - 도형은 원본 Polygon/MultiPolygon 그대로 유지하고, 대표점은 polylabel(도형 내부에서 경계로부터 가장 먼 점)로
//   계산해 properties._repLng/_repLat 에 넣는다. 계산은 위경도가 아니라 원본 투영좌표(미터)에서 하고(경도·위도 1도의
//   실제 길이가 달라 왜곡되므로), MultiPolygon은 가장 큰 하위 폴리곤을 기준으로 한다. (센트로이드가 도형 밖으로
//   나가는 문제와, 경계 꼭짓점이 대표점이 되는 문제를 모두 피하기 위함)
// - 유산명이 비어 있는 레코드는 데이터셋에서 제외하고 data/excluded-no-name.json 에 원본 그대로 보관한다.
// - 야외 유산 필터링/재질 분류는 하지 않는다. 원본 속성은 그대로 두고 _로 시작하는 보조 속성만 추가한다.
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import * as shapefile from "shapefile";
import proj4 from "proj4";
import polylabel from "polylabel";
import centroid from "@turf/centroid";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { verifyZip } from "./lib/zip.mjs";
import { WANTED_LAYERS } from "./lib/layers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RAW_DIR = path.join(ROOT, "data/raw/heritage");
const OUT_FILE = path.join(ROOT, "data/heritage-full.geojson");
const EXCLUDED_FILE = path.join(ROOT, "data/excluded-no-name.json");
const SUMMARY_FILE = path.join(RAW_DIR, "summary.json");
const POLYLABEL_PRECISION_M = 0.1; // 투영좌표(미터) 기준 허용오차 10cm

const round7 = (v) => Math.round(v * 1e7) / 1e7;
const converters = new Map(); // .prj 문자열 → proj4 변환기
function converterFor(prjWkt) {
  if (!converters.has(prjWkt)) converters.set(prjWkt, proj4(prjWkt)); // 한 인자 proj4(): inverse = 투영좌표 → WGS84(경도,위도)
  return converters.get(prjWkt);
}

function reprojectCoords(coords, inverse) {
  if (typeof coords[0] === "number") {
    const [lng, lat] = inverse([coords[0], coords[1]]);
    return [round7(lng), round7(lat)];
  }
  return coords.map((c) => reprojectCoords(c, inverse));
}

const nameOf = (p) => p["국가유산명"] ?? p["유산명"] ?? p["명칭"] ?? "";

// 투영좌표(미터) 링의 면적(신발끈 공식). 홀(구멍)은 뺀다.
const ringArea = (ring) => {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return Math.abs(s) / 2;
};
const polygonArea = (rings) => ringArea(rings[0]) - rings.slice(1).reduce((a, r) => a + ringArea(r), 0);
// MultiPolygon이면 면적이 가장 큰 하위 폴리곤의 링들을, Polygon이면 그대로 돌려준다.
const largestPolygonRings = (geom) =>
  geom.type === "Polygon" ? geom.coordinates : geom.coordinates.reduce((best, p) => (polygonArea(p) > polygonArea(best) ? p : best));

// dbf가 빈 값을 NUL(0x00)로 채워 둔 경우가 있다(라이브러리는 공백만 제거). 실제 글자는 건드리지 않고
// NUL 패딩만 걷어내며, 걷어낸 뒤 비면 null로 둔다(같은 레코드의 빈 코드값이 이미 null로 나오는 것과 일치).
const NUL = String.fromCharCode(0);
function cleanProps(props, stat) {
  const out = {};
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === "string" && v.includes(NUL)) {
      const s = v.split(NUL).join("").trim();
      out[k] = s === "" ? null : s;
      stat.nulCleaned[k] = (stat.nulCleaned[k] ?? 0) + 1;
    } else out[k] = v;
  }
  return out;
}

function haversineM(lng1, lat1, lng2, lat2) {
  const R = 6371008.8, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function main() {
  const zips = fs.readdirSync(RAW_DIR).filter((f) => /^\d+\.zip$/.test(f)).sort();
  if (zips.length === 0) throw new Error(`${RAW_DIR} 에 zip이 없음 — 먼저 npm run download`);
  if (fs.existsSync(path.join(RAW_DIR, "failed.txt"))) {
    console.warn("⚠ failed.txt 가 있음 — 일부 시도가 빠진 채로 변환합니다:\n" + fs.readFileSync(path.join(RAW_DIR, "failed.txt"), "utf8"));
  }

  const tmp = `${OUT_FILE}.part`;
  const out = fs.createWriteStream(tmp);
  const write = async (s) => { if (!out.write(s)) await once(out, "drain"); };
  await write('{"type":"FeatureCollection","features":[\n');

  const counts = {}; // counts[sidoCd][layer]
  const sidoLabel = {};
  const fieldSets = {}; // layer → Set(필드 조합)
  const index = []; // 검증/샘플용 경량 인덱스
  const stat = { total: 0, excludedNoName: 0, nullGeom: 0, otherGeom: 0, centroidOutside: 0, repNotOnSurface: 0, repBoundaryOnly: 0, repPrecisionFallback: 0, repPolylabelFailed: 0, multiPolygonUsingLargestPart: 0, nulCleaned: {}, mojibake: 0, outsideKorea: 0 };
  const excluded = []; // 이름 없는 레코드 (원본 그대로 별도 보관)
  const dupKey = new Map();
  let first = true;

  for (const zipName of zips) {
    const sidoCd = zipName.replace(".zip", "");
    const entries = verifyZip(fs.readFileSync(path.join(RAW_DIR, zipName)));
    const get = (n) => entries.find((e) => e.name === n);
    counts[sidoCd] = {};

    for (const layer of WANTED_LAYERS) {
      const shp = get(`${layer}.shp`), dbf = get(`${layer}.dbf`), prj = get(`${layer}.prj`);
      if (!shp || !dbf || !prj) throw new Error(`${zipName}: ${layer} 파일 누락`);
      const prjWkt = prj.read().toString("utf8").trim();
      const inverse = converterFor(prjWkt).inverse;
      const fc = await shapefile.read(shp.read(), dbf.read(), { encoding: "euc-kr" });
      counts[sidoCd][layer] = 0;

      for (const [recordIndex, src] of fc.features.entries()) {
        // 유산명이 비어 있으면 데이터셋에서 제외하고 원본 그대로(속성·투영좌표 도형·.prj) 별도 파일에 남긴다.
        const rawName = nameOf(src.properties);
        if (typeof rawName !== "string" || rawName.replaceAll(NUL, "").trim() === "") {
          stat.excludedNoName++;
          excluded.push({
            source: { zip: zipName, layer, recordIndex },
            original: { properties: src.properties, geometry: src.geometry, crsWkt: prjWkt },
            wgs84Geometry: src.geometry ? { type: src.geometry.type, coordinates: reprojectCoords(src.geometry.coordinates, inverse) } : null,
          });
          continue;
        }

        stat.total++;
        (fieldSets[layer] ??= new Set()).add(Object.keys(src.properties).join(","));
        const props = { ...cleanProps(src.properties, stat), _layer: layer, _srcSidoCd: sidoCd };
        sidoLabel[sidoCd] ??= src.properties["시도명"];

        let geometry = null;
        if (!src.geometry) {
          stat.nullGeom++;
        } else if (src.geometry.type !== "Polygon" && src.geometry.type !== "MultiPolygon") {
          stat.otherGeom++;
        } else {
          geometry = { type: src.geometry.type, coordinates: reprojectCoords(src.geometry.coordinates, inverse) };
        }

        let repLng = null, repLat = null, centroidInside = null;
        if (geometry) {
          const feature = { type: "Feature", properties: {}, geometry };
          // 대표점: 원본 투영좌표(미터)에서 polylabel → 위경도로 역변환. MultiPolygon은 가장 큰 하위 폴리곤 기준.
          if (src.geometry.type === "MultiPolygon" && src.geometry.coordinates.length > 1) stat.multiPolygonUsingLargestPart++;
          let lng, lat;
          try {
            const [px, py] = polylabel(largestPolygonRings(src.geometry), POLYLABEL_PRECISION_M);
            [lng, lat] = inverse([px, py]);
          } catch {
            stat.repPolylabelFailed++; // 퇴화 도형 등 — 아래 후보 목록의 첫 꼭짓점 폴백으로 처리
          }
          // 반올림 때문에 아주 가느다란 도형 밖으로 밀려나는 경우가 있어(실제 1건 발생), 도형 위에 있는지
          // 확인하면서 7자리 → 9자리 → 반올림 없음 → 첫 꼭짓점 순으로 후보를 시도한다.
          const onSurface = (x, y) => booleanPointInPolygon({ type: "Point", coordinates: [x, y] }, geometry);
          const firstVertex = (geometry.type === "Polygon" ? geometry.coordinates[0] : geometry.coordinates[0][0])[0];
          const candidates = lng === undefined
            ? [firstVertex, firstVertex, firstVertex, firstVertex]
            : [[round7(lng), round7(lat)], [Math.round(lng * 1e9) / 1e9, Math.round(lat * 1e9) / 1e9], [lng, lat], firstVertex];
          const idx = candidates.findIndex(([x, y]) => onSurface(x, y));
          if (idx > 0) stat.repPrecisionFallback++;
          [repLng, repLat] = candidates[idx === -1 ? 3 : idx];
          // 최종 대표점 검증 (경계 포함 / 경계 제외 = 완전한 내부)
          const rep = { type: "Point", coordinates: [repLng, repLat] };
          if (!booleanPointInPolygon(rep, geometry)) stat.repNotOnSurface++;
          else if (!booleanPointInPolygon(rep, geometry, { ignoreBoundary: true })) stat.repBoundaryOnly++;
          const c = centroid(feature);
          centroidInside = booleanPointInPolygon(c, geometry);
          if (!centroidInside) stat.centroidOutside++;
          if (repLng < 124 || repLng > 132 || repLat < 33 || repLat > 39) stat.outsideKorea++;
        }
        props._repLng = repLng;
        props._repLat = repLat;

        const name = nameOf(src.properties);
        if (name.includes("�")) stat.mojibake++;
        const key = `${layer}|${src.properties["유산코드"]}`;
        dupKey.set(key, (dupKey.get(key) ?? 0) + 1);

        await write((first ? "" : ",\n") + JSON.stringify({ type: "Feature", properties: props, geometry }));
        first = false;
        counts[sidoCd][layer]++;
        index.push({ name, layer, sidoCd, jong: props["종목명"], sigungu: props["시군구명"], lng: repLng, lat: repLat, centroidInside });
      }
    }
    console.log(`변환 ${sidoLabel[sidoCd] ?? sidoCd}(${sidoCd}): ${Object.values(counts[sidoCd]).reduce((a, b) => a + b, 0)}건`);
  }

  await write("\n]}\n");
  out.end();
  await once(out, "finish");
  fs.renameSync(tmp, OUT_FILE);
  fs.writeFileSync(
    EXCLUDED_FILE,
    JSON.stringify({ note: "유산명(국가유산명)이 비어 있어 heritage-full.geojson 에서 제외한 레코드. original 은 원본 그대로(속성·투영좌표 도형·.prj), wgs84Geometry 는 참고용 변환 결과.", criterion: "국가유산명이 null/공백/NUL뿐", count: excluded.length, records: excluded }, null, 2),
  );

  const dups = [...dupKey.values()].filter((n) => n > 1).length;
  const summary = { generatedAt: new Date().toISOString(), sidoCount: zips.length, stat, duplicateLayerCodeGroups: dups, counts, sidoLabel, fieldSets: Object.fromEntries(Object.entries(fieldSets).map(([k, v]) => [k, [...v]])) };
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2));
  return { index, stat, counts, sidoLabel, fieldSets, dups, zips };
}

function report({ index, stat, counts, sidoLabel, fieldSets, dups, zips }) {
  const size = fs.statSync(OUT_FILE).size;
  console.log(`\n=== 결과: ${OUT_FILE} (${(size / 1024 / 1024).toFixed(1)}MB) ===`);
  console.log(`시도 ${zips.length}개, 전체 ${stat.total}건 (유산명 없음으로 제외 ${stat.excludedNoName}건 → ${EXCLUDED_FILE})`);

  console.log("\n## 시도별 건수 (레이어별)");
  console.log("| 시도 | " + WANTED_LAYERS.join(" | ") + " | 합계 |");
  console.log("|---|" + WANTED_LAYERS.map(() => "---").join("|") + "|---|");
  const layerTotals = Object.fromEntries(WANTED_LAYERS.map((l) => [l, 0]));
  for (const cd of Object.keys(counts).sort()) {
    const row = WANTED_LAYERS.map((l) => counts[cd][l]);
    row.forEach((n, i) => (layerTotals[WANTED_LAYERS[i]] += n));
    console.log(`| ${sidoLabel[cd] ?? cd} | ${row.join(" | ")} | ${row.reduce((a, b) => a + b, 0)} |`);
  }
  console.log(`| **합계** | ${WANTED_LAYERS.map((l) => layerTotals[l]).join(" | ")} | **${stat.total}** |`);

  console.log("\n## 검증");
  console.log(`- 도형 없음(null): ${stat.nullGeom}, Polygon/MultiPolygon 이외: ${stat.otherGeom}`);
  console.log(`- 유산명에 깨진 글자(U+FFFD): ${stat.mojibake}건`);
  console.log(`- 대표점이 한반도 범위(경도124~132, 위도33~39) 밖: ${stat.outsideKorea}건`);
  console.log(`- (참고) 센트로이드였다면 도형 밖으로 나갔을 경우: ${stat.centroidOutside}건`);
  console.log(`- MultiPolygon 중 가장 큰 하위 폴리곤을 기준으로 삼은 경우: ${stat.multiPolygonUsingLargestPart}건 / polylabel 계산 실패(첫 꼭짓점 폴백): ${stat.repPolylabelFailed}건`);
  console.log(`- 대표점(polylabel)이 도형 위/안에 없는 경우: ${stat.repNotOnSurface}건 (반올림 정밀도를 높여야 도형 위에 놓인 경우: ${stat.repPrecisionFallback}건)`);
  console.log(`- NUL(0x00) 패딩을 걷어낸 문자열 속성: ${JSON.stringify(stat.nulCleaned)} (전부 값이 NUL뿐 → null)`);
  console.log(`- 대표점이 도형 "경계 위"에만 있는 경우(내부가 아님): ${stat.repBoundaryOnly}건 (${((stat.repBoundaryOnly / stat.total) * 100).toFixed(1)}%)`);
  console.log(`- (레이어, 유산코드) 중복 그룹: ${dups}개 (제거하지 않고 원본 그대로 둠)`);
  for (const [layer, sets] of Object.entries(fieldSets)) console.log(`- 필드[${layer}]: ${[...sets].join("  ||  ")}`);

  const near = (kw, lng, lat) => index.filter((x) => x.lng != null && x.name.includes(kw))
    .map((x) => ({ ...x, d: haversineM(x.lng, x.lat, lng, lat) })).sort((a, b) => a.d - b.d)[0];
  console.log("\n## 좌표 변환 검증: 기존 프로젝트 좌표와 가장 가까운 동명 항목의 대표점 거리");
  const known = [["불국사", 129.332, 35.7898], ["석굴암", 129.3495, 35.7947], ["첨성대", 129.2192, 35.8347], ["부석사", 128.6944, 36.9986],
    ["하회", 128.5165, 36.539], ["해인사", 128.098, 35.8007], ["남한산성", 127.1826, 37.4784], ["수원 화성", 127.0104, 37.285], ["종묘", 126.9945, 37.5745],
    ["창덕궁", 126.9911, 37.5824], ["공산성", 127.1265, 36.4595], ["무령왕릉", 127.1223, 36.4634], ["정림사", 126.9107, 36.2789], ["미륵사", 126.9581, 36.0086]];
  for (const [kw, lng, lat] of known) {
    const m = near(kw, lng, lat);
    console.log(m ? `- ${kw}: "${m.name}" 대표점 (${m.lng}, ${m.lat}) — 기존 좌표와 ${(m.d / 1000).toFixed(2)}km` : `- ${kw}: 일치하는 항목 없음`);
  }

  console.log("\n## 미륵사지 관련 항목 전체 (기존 프로젝트 좌표 126.9581, 36.0086 와의 거리)");
  for (const x of index.filter((i) => i.lng != null && i.name.includes("미륵사지"))) {
    console.log(`- "${x.name}" [${x.layer}] (${x.lng}, ${x.lat}) — ${(haversineM(x.lng, x.lat, 126.9581, 36.0086) / 1000).toFixed(2)}km`);
  }

  const nh = index.filter((x) => x.lng != null && x.name.includes("남한산성"));
  console.log("\n## 남한산성(복잡한 도형) 대표점 확인");
  for (const x of nh) console.log(`- "${x.name}" [${x.layer}] 대표점 (${x.lng}, ${x.lat}), 센트로이드가 도형 안: ${x.centroidInside}`);
}

function samples({ index }) {
  const pick = [];
  const add = (x) => x && !pick.includes(x) && pick.push(x);
  for (const kw of ["종묘", "남한산성", "불국사", "하회", "수원 화성", "석굴암"]) add(index.find((x) => x.lng != null && x.name.includes(kw)));
  const step = Math.floor(index.length / 5);
  for (let i = 0; i < 5; i++) add(index[step * i + 7]);
  console.log("\n## 샘플 (이름 | 대표점 경도,위도 | 원본 종목명 | 레이어 | 위치)");
  for (const x of pick.slice(0, 11)) console.log(`- ${x.name} | ${x.lng}, ${x.lat} | ${x.jong ?? "(종목명 필드 없음)"} | ${x.layer} | ${x.sigungu ?? ""}`);
}

const result = await main();
report(result);
samples(result);
