// data/heritage-classified.geojson → backend/src/data/heritageSites.generated.ts
// /api/sites 가 서빙할 "필요한 필드만 추린" 유산 목록을 만든다. 생성 결과는 커밋 대상이다
// (원본 geojson 은 용량 때문에 커밋하지 않으므로, 배포되는 백엔드는 이 파일만 본다).
//
// 필드: id, name, region, sigungu, sigunguCode, material, heritageType, lat, lng, regionTag, elevationProfile, (era, desc)
//  - id            유산코드(17자리 문자열, 전국 유일)
//  - region        시도명 축약형("경상북도"→"경북")
//  - sigungu       원본 시군구명 그대로 (수동 매핑 없음). 원본에 비어 있는 1건은 생략
//  - sigunguCode   원본 시군구코드(ADD1xxxxx0)에서 뽑은 5자리 — 실시간 API(/api/live)가 시군구별로 응답하므로 유산과 맺어 주는 키.
//                  산불위험예보 API 코드와 같은 체계다(기존 16곳에서 16/16 일치 확인, 예외 4곳은 백엔드 liveRegions.ts 에 별칭)
//  - heritageType  원본 종목명 (국보·보물·사적·국가민속문화유산)
//  - lat, lng      원본 대표점(polylabel) 소수 5자리(≈1m). 단 coordinate-fixes.json 에 적힌 레코드는 그 보정값을 쓴다
//                  (면적이 큰 사적은 폴리곤 한가운데가 실제 건물군과 다를 수 있다 — 예: 불국사)
//  - regionTag / elevationProfile
//                  site-overrides.json 에 적힌 16곳은 거기 적힌 값(era·desc 포함)을 그대로 쓴다.
//                  나머지는 기본값 regionTag "plain" / elevationProfile "plain"(지형 보정 없음) — 단 `--terrain` 으로 실행하면
//                  terrain-rules.mjs 의 자동 추정(표고 + VWorld 하천·해안)을 쓴다. 자동 추정은 100% 정확하지 않다.
//                  `--terrain` 은 fetch-elevation.mjs / fetch-water.mjs 캐시가 전 유산에 대해 채워져 있을 때만 동작한다(일부만 적용하지 않는다).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ELEVATION_CACHE, WATER_CACHE, readJson } from "./lib/common.mjs";
import { classifyTerrain } from "./terrain-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const IN_FILE = path.join(ROOT, "data/heritage-classified.geojson");
const OVERRIDES_FILE = path.join(import.meta.dirname, "site-overrides.json");
const COORD_FIXES_FILE = path.join(import.meta.dirname, "coordinate-fixes.json");
const OUT_FILE = path.join(ROOT, "backend/src/data/heritageSites.generated.ts");

const REGION_SHORT = {
  서울특별시: "서울", 부산광역시: "부산", 대구광역시: "대구", 인천광역시: "인천", 광주광역시: "광주", 대전광역시: "대전", 울산광역시: "울산",
  세종특별자치시: "세종", 경기도: "경기", 강원특별자치도: "강원", 충청북도: "충북", 충청남도: "충남", 전북특별자치도: "전북", 전라남도: "전남",
  전남광주통합특별시: "전남광주", 경상북도: "경북", 경상남도: "경남", 제주특별자치도: "제주",
};

// 큐레이션 값을 가진 16곳(유산코드 → regionTag·elevationProfile·era·desc). 이름은 코드가 맞는 레코드인지 확인하는 용도.
const overrides = JSON.parse(fs.readFileSync(OVERRIDES_FILE, "utf8")).sites;
if (new Set(overrides.map((o) => o.code)).size !== overrides.length) throw new Error("site-overrides.json 에 중복 유산코드가 있음");
const overrideByCode = new Map(overrides.map((o) => [o.code, o]));

// 대표점 수동 보정(유산코드 → lat,lng). 원본 geojson 은 커밋하지 않으므로 보정은 이 파일에 둔다.
const coordFixes = JSON.parse(fs.readFileSync(COORD_FIXES_FILE, "utf8")).fixes;
if (new Set(coordFixes.map((c) => c.code)).size !== coordFixes.length) throw new Error("coordinate-fixes.json 에 중복 유산코드가 있음");
const fixByCode = new Map(coordFixes.map((c) => [c.code, c]));
let appliedFixes = 0;

// 점이 폴리곤(Polygon/MultiPolygon 의 바깥 링) 안에 있는지 — 보정 좌표가 엉뚱한 곳이 아닌지 확인하는 용도
function insidePolygon(lat, lng, geometry) {
  const rings = geometry.type === "Polygon" ? [geometry.coordinates[0]] : geometry.coordinates.map((p) => p[0]);
  return rings.some((ring) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  });
}

const features = JSON.parse(fs.readFileSync(IN_FILE, "utf8")).features;
const round5 = (v) => Math.round(v * 1e5) / 1e5;
const records = [];
const seen = new Set();

for (const f of features) {
  const p = f.properties;
  const region = REGION_SHORT[p.시도명];
  if (!region) throw new Error(`알 수 없는 시도명: ${p.시도명} (${p.국가유산명})`);
  if (seen.has(p.유산코드)) throw new Error(`유산코드 중복: ${p.유산코드}`);
  seen.add(p.유산코드);

  const m = overrideByCode.get(p.유산코드) ?? null;
  if (m && m.name !== p.국가유산명) throw new Error(`site-overrides.json 이름 불일치: ${p.유산코드} → ${p.국가유산명} (기대 ${m.name})`);

  const rec = { id: p.유산코드, name: p.국가유산명, region };
  if (p.시군구명) rec.sigungu = p.시군구명;
  if (p.시군구코드) {
    if (!/^ADD1\d{5}0$/.test(p.시군구코드)) throw new Error(`시군구코드 형식이 예상과 다름: ${p.시군구코드} (${p.국가유산명})`);
    rec.sigunguCode = p.시군구코드.slice(4, 9);
  }
  let lat = round5(p._repLat);
  let lng = round5(p._repLng);
  const fix = fixByCode.get(p.유산코드);
  if (fix) {
    if (fix.name !== p.국가유산명) throw new Error(`coordinate-fixes.json 이름 불일치: ${p.유산코드} → ${p.국가유산명} (기대 ${fix.name})`);
    if (!insidePolygon(fix.lat, fix.lng, f.geometry)) throw new Error(`coordinate-fixes.json 보정 좌표가 폴리곤 밖: ${p.유산코드} ${p.국가유산명} (${fix.lat}, ${fix.lng})`);
    lat = round5(fix.lat);
    lng = round5(fix.lng);
    appliedFixes += 1;
  }
  Object.assign(rec, { material: p._material, heritageType: p.종목명, lat, lng, regionTag: m?.regionTag ?? "plain", elevationProfile: m?.elevationProfile ?? "plain" });
  if (m) { rec.era = m.era; rec.desc = m.desc; }
  records.push(rec);
}
const linked = records.filter((r) => r.era);
if (linked.length !== overrides.length) throw new Error(`site-overrides.json 적용 ${linked.length}건 (기대 ${overrides.length}) — 유산코드가 카탈로그에 없는 항목이 있음`);

if (appliedFixes !== coordFixes.length) throw new Error(`coordinate-fixes.json 적용 ${appliedFixes}건 (기대 ${coordFixes.length}) — 유산코드가 카탈로그에 없는 항목이 있음`);

// ── 지형 자동 추정(--terrain) ──
const APPLY_TERRAIN = process.argv.includes("--terrain");
if (APPLY_TERRAIN) {
  const elevation = readJson(ELEVATION_CACHE, { sites: {} }).sites;
  const water = readJson(WATER_CACHE, { sites: {} }).sites;
  const fresh = (cache, r) => cache[r.id] && cache[r.id].lat === r.lat && cache[r.id].lng === r.lng;
  const targets = records.filter((r) => !overrideByCode.has(r.id));
  const noElevation = targets.filter((r) => !fresh(elevation, r) || !Array.isArray(elevation[r.id].z));
  const noWater = targets.filter((r) => !fresh(water, r));
  if (noElevation.length || noWater.length) {
    throw new Error(`--terrain: 캐시가 부족합니다 — 표고 없음 ${noElevation.length}건, 하천·해안 없음 ${noWater.length}건. fetch-elevation.mjs / fetch-water.mjs 를 끝까지 실행한 뒤 다시 하세요(카탈로그는 바꾸지 않았습니다).`);
  }
  for (const r of targets) {
    const t = classifyTerrain({ z: elevation[r.id].z, region: r.region, sigungu: r.sigungu, river: water[r.id].river, coast: water[r.id].coast });
    r.regionTag = t.regionTag;
    r.elevationProfile = t.elevationProfile;
  }
  console.log(`지형 자동 추정 적용: ${targets.length}건 (큐레이션 ${overrides.length}건은 지정값 유지)`);
}

records.sort((a, b) => (a.id < b.id ? -1 : 1));
const header = `// AUTO-GENERATED by scripts/heritage/build-sites.mjs from data/heritage-classified.geojson — 직접 수정하지 말고 스크립트를 다시 실행할 것.
// ${records.length}건. ${APPLY_TERRAIN ? 'regionTag/elevationProfile 은 site-overrides.json 의 16곳은 지정값, 나머지는 terrain-rules.mjs 의 자동 추정(표고 Open-Meteo + VWorld 하천·해안, 100% 정확하지 않음).' : 'regionTag/elevationProfile 은 site-overrides.json 의 16곳만 실제 값, 나머지는 기본값("plain").'}
import type { SiteRecord } from "./siteRecord";

export const HERITAGE_SITES: SiteRecord[] = [
`;
const tmp = OUT_FILE + ".part";
fs.writeFileSync(tmp, header + records.map((r) => JSON.stringify(r)).join(",\n") + "\n];\n");
fs.renameSync(tmp, OUT_FILE);

const tally = (get) => records.reduce((o, r) => ((o[get(r)] = (o[get(r)] ?? 0) + 1), o), {});
console.log(`생성: ${records.length}건 → ${path.relative(ROOT, OUT_FILE)} (${(fs.statSync(OUT_FILE).size / 1024).toFixed(0)}KB)`);
console.log("재질:", JSON.stringify(tally((r) => r.material)));
console.log("regionTag:", JSON.stringify(tally((r) => r.regionTag)), "| elevationProfile:", JSON.stringify(tally((r) => r.elevationProfile)));
console.log(`sigungu 없음 ${records.filter((r) => !r.sigungu).length}건, site-overrides 적용 ${linked.length}건, 좌표 보정 ${appliedFixes}건`);
