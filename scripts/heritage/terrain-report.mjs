// 지형 분류 점검 도구. 카탈로그를 바꾸지 않고 캐시(elevation-cache.json, water-cache.json)만 읽는다.
//
//   node scripts/heritage/terrain-report.mjs coverage          캐시가 카탈로그를 얼마나 덮는지
//   node scripts/heritage/terrain-report.mjs check16           큐레이션 16곳 지정값과 규칙 결과 비교(정확도)
//   node scripts/heritage/terrain-report.mjs top-relief [N]    면적 10만㎡ 이상 유산 중 국소 고저차가 큰 상위 N건(기본 15) — 대표점이 급경사에 찍혔을 가능성 점검
//   node scripts/heritage/terrain-report.mjs preview           표고가 있는 유산에 규칙을 적용했을 때의 분포(카탈로그는 바꾸지 않음)
import fs from "node:fs";
import path from "node:path";
import { ELEVATION_CACHE, GEOJSON_FILE, HERE, WATER_CACHE, loadCatalog, readJson } from "./lib/common.mjs";
import { TERRAIN_RULES, classifyTerrain, terrainFeatures } from "./terrain-rules.mjs";

const [mode = "check16", arg] = process.argv.slice(2);
const catalog = loadCatalog();
const elevation = readJson(ELEVATION_CACHE, { sites: {} }).sites;
const water = readJson(WATER_CACHE, { sites: {} }).sites;
const curated = new Map(readJson(path.join(HERE, "site-overrides.json"), { sites: [] }).sites.map((s) => [s.code, s]));
const valid = (cache, s) => cache[s.id] && cache[s.id].lat === s.lat && cache[s.id].lng === s.lng;
const input = (s) => ({ z: elevation[s.id].z, region: s.region, sigungu: s.sigungu, river: water[s.id]?.river ?? null, coast: water[s.id]?.coast ?? null });
const pad = (v, n) => String(v).padEnd(n);

if (mode === "coverage") {
  const e = catalog.filter((s) => valid(elevation, s)).length;
  const w = catalog.filter((s) => valid(water, s)).length;
  console.log(`표고 ${e}/${catalog.length}곳 (${((e / catalog.length) * 100).toFixed(1)}%) · 하천·해안 ${w}/${catalog.length}곳`);
}

if (mode === "check16") {
  let okTag = 0, okProf = 0;
  console.log(pad("유산", 22) + pad("지정 tag", 10) + pad("규칙 tag", 12) + pad("지정 profile", 13) + pad("규칙 profile", 16) + "고도 / 고저차");
  for (const [code, c] of curated) {
    const s = catalog.find((x) => x.id === code);
    if (!s || !valid(elevation, s)) { console.log(pad(c.name, 22) + "(표고 없음)"); continue; }
    const r = classifyTerrain(input(s));
    okTag += r.regionTag === c.regionTag;
    okProf += r.elevationProfile === c.elevationProfile;
    console.log(pad(c.name, 20) + pad(c.regionTag, 10) + pad((r.regionTag === c.regionTag ? "✓ " : "✗ ") + r.regionTag, 12) + pad(c.elevationProfile, 13) + pad((r.elevationProfile === c.elevationProfile ? "✓ " : "✗ ") + r.elevationProfile, 16) + `${r.elevation}m / ${Math.round(r.relief)}m`);
  }
  console.log(`\nregionTag ${okTag}/${curated.size}, elevationProfile ${okProf}/${curated.size}   규칙: ${JSON.stringify(TERRAIN_RULES)}`);
}

if (mode === "top-relief") {
  if (!fs.existsSync(GEOJSON_FILE)) throw new Error("원본 geojson(data/heritage-classified.geojson)이 필요합니다(면적·폴리곤 정보).");
  const feats = JSON.parse(fs.readFileSync(GEOJSON_FILE, "utf8")).features;
  const byId = new Map(feats.map((f) => [f.properties.유산코드, f]));
  const N = Number(arg ?? 15);
  const rad = Math.PI / 180;
  const meters = (a, b) => Math.hypot((a.lat - b.lat) * 110540, (a.lng - b.lng) * 111320 * Math.cos(a.lat * rad));
  const insidePoly = (lat, lng, g) => (g.type === "Polygon" ? [g.coordinates[0]] : g.coordinates.map((p) => p[0])).some((ring) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  });
  const large = catalog.filter((s) => (byId.get(s.id)?.properties.면적 ?? 0) >= 100000);
  const withEl = large.filter((s) => valid(elevation, s));
  console.log(`면적 10만㎡ 이상 ${large.length}건 중 표고를 받은 ${withEl.length}건에서 국소 고저차(반경 500m 9점) 상위 ${N}건\n`);
  const rows = withEl
    .map((s) => {
      const f = byId.get(s.id);
      const { elevation: z0, relief } = terrainFeatures(elevation[s.id].z);
      // 이 폴리곤 안에 대표점이 있는 다른 유산들(예: 불국사 사적 안의 대웅전·다보탑)까지의 평균 거리 — 멀면 대표점이 건물군에서 벗어났을 수 있다
      const inner = catalog.filter((o) => o.id !== s.id && insidePoly(o.lat, o.lng, f.geometry));
      const cen = inner.length ? { lat: inner.reduce((a, o) => a + o.lat, 0) / inner.length, lng: inner.reduce((a, o) => a + o.lng, 0) / inner.length } : null;
      return { s, area: f.properties.면적, z0, relief, inner: inner.length, innerDist: cen ? meters(s, cen) : null };
    })
    .sort((a, b) => b.relief - a.relief)
    .slice(0, N);
  console.log(pad("#", 3) + pad("유산", 26) + pad("시군구", 14) + pad("종목", 8) + pad("면적(ha)", 9) + pad("고도", 6) + pad("고저차", 7) + pad("안의 다른 유산", 16) + "좌표(위도, 경도)");
  rows.forEach((r, i) =>
    console.log(pad(i + 1, 3) + pad(r.s.name.slice(0, 24), 26) + pad(`${r.s.region} ${r.s.sigungu ?? "-"}`.slice(0, 12), 14) + pad(r.s.heritageType, 8) + pad((r.area / 10000).toFixed(0), 9) + pad(`${Math.round(r.z0)}m`, 6) + pad(`${Math.round(r.relief)}m`, 7) + pad(r.inner ? `${r.inner}건, 중심까지 ${Math.round(r.innerDist)}m` : "없음", 16) + `${r.s.lat}, ${r.s.lng}`),
  );
}

if (mode === "preview") {
  const withEl = catalog.filter((s) => valid(elevation, s) && !curated.has(s.id));
  const tally = (f) => withEl.reduce((o, s) => { const k = f(classifyTerrain(input(s))); o[k] = (o[k] ?? 0) + 1; return o; }, {});
  console.log(`표고가 있는 큐레이션 외 ${withEl.length}곳에 규칙을 적용했을 때(카탈로그는 바뀌지 않음)`);
  console.log("regionTag:", JSON.stringify(tally((r) => r.regionTag)));
  console.log("elevationProfile:", JSON.stringify(tally((r) => r.elevationProfile)));
}
