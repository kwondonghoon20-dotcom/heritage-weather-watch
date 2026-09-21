// 카탈로그 유산마다 VWorld 2D 데이터 API로 "가까운 국가하천"과 "가까운 해안"을 조회해 water-cache.json 에 쌓는다.
// 카탈로그를 만들 때 한 번 하는 작업이다. 지형 분류 규칙(terrain-rules.mjs)이 이 값을 쓴다.
//
//   node scripts/heritage/fetch-water.mjs [--limit 50]
//
// · 하천: LT_C_WKMSTRM(하천망)에서 유산 좌표를 중심으로 반경 400m 정사각형 안에 국가하천(cat_nam)이 있는지.
// · 해안: 반경 4km 정사각형 안에 (1) 해안선 LT_L_TOISDEPCNTAH, (2) 연안해역 폴리곤 LT_C_WGISPL2{CON,ABS,USE,SPA}(관리/보전/이용/특수 연안해역)이 있는지.
//   두 레이어는 서로 빈 구간이 있어(해안선은 강화도, 연안해역은 동해 감포·호미곶·서천 장항) 합집합으로 본다 — 2026-09-22 실제 해안 9곳에서 확인.
// · 키(VWORLD_API_KEY)는 등록된 서비스 도메인(VWORLD_DOMAIN, 기본 heritage-weather-watch-five.vercel.app)과 함께 보내야 한다.
//   도메인이 다르면 INCORRECT_KEY. 서버 호출 한도는 문서에서 확인하지 못했다(48요청·평균 49ms에서는 제한 없음) — 동시 4개로 천천히 부른다.
// · 이어받기 가능: 이미 받은 유산(좌표 동일)은 건너뛴다. 예상치 못한 응답이 오면 멈춘다(캐시에는 그때까지 받은 것이 남는다).
import { WATER_CACHE, boxHalfDegrees, loadCatalog, readEnv, readJson, sleep, writeJsonAtomic } from "./lib/common.mjs";
import path from "node:path";
import { HERE } from "./lib/common.mjs";

const KEY = readEnv("VWORLD_API_KEY");
const DOMAIN = readEnv("VWORLD_DOMAIN") || "heritage-weather-watch-five.vercel.app";
if (!KEY) {
  console.error("VWORLD_API_KEY 가 없습니다 (.env 에 채우세요).");
  process.exit(1);
}
const args = process.argv.slice(2);
const LIMIT = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;
const CONCURRENCY = 4;
const RIVER_METERS = 400;
const COAST_METERS = 4000;
const RIVER_LAYER = "LT_C_WKMSTRM";
const COAST_LINE = "LT_L_TOISDEPCNTAH";
const COAST_ZONES = ["LT_C_WGISPL2CON", "LT_C_WGISPL2ABS", "LT_C_WGISPL2USE", "LT_C_WGISPL2SPA"];

const catalog = loadCatalog();
const cache = readJson(WATER_CACHE, null) ?? {
  meta: { source: "VWorld 2D 데이터 API", riverLayer: RIVER_LAYER, riverMeters: RIVER_METERS, coastLayers: [COAST_LINE, ...COAST_ZONES], coastMeters: COAST_METERS },
  sites: {},
};

class Fatal extends Error {}
async function query(layer, lat, lng, meters, size) {
  const { dLat, dLng } = boxHalfDegrees(lat, meters);
  const url = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=${layer}&key=${KEY}&domain=${DOMAIN}&format=json&geometry=false&attribute=true&size=${size}&geomFilter=BOX(${lng - dLng},${lat - dLat},${lng + dLng},${lat + dLat})`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      const body = await res.json();
      const r = body.response;
      if (r?.status === "OK") return r.result?.featureCollection?.features ?? [];
      if (r?.status === "NOT_FOUND") return [];
      // 키·도메인·레이어 이름 오류나 한도 초과 같은 응답은 다시 물어도 소용없다 — 멈추고 알린다
      throw new Fatal(`${layer}: ${r?.status} ${r?.error?.code ?? ""} ${r?.error?.text ?? ""}`.replace(KEY, "<KEY>"));
    } catch (e) {
      if (e instanceof Fatal || attempt === 3) throw e;
      await sleep(1000 * attempt);
    }
  }
}

async function lookup(site) {
  // 하천: 국가하천만 인정(지방하천까지 넣으면 첨성대의 남천, 수원화성의 수원천 같은 작은 하천이 걸린다)
  const river = (await query(RIVER_LAYER, site.lat, site.lng, RIVER_METERS, 100)).find((f) => String(f.properties?.cat_nam ?? "").includes("국가하천"));
  // 해안: 해안선을 먼저, 없으면 연안해역 4종
  let coast = null;
  if ((await query(COAST_LINE, site.lat, site.lng, COAST_METERS, 1)).length) coast = "해안선";
  else for (const layer of COAST_ZONES) if ((await query(layer, site.lat, site.lng, COAST_METERS, 1)).length) { coast = layer.replace("LT_C_WGISPL2", "연안해역:"); break; }
  return { lat: site.lat, lng: site.lng, river: river ? river.properties?.riv_nm || "무명" : null, coast };
}

const curated = new Set(readJson(path.join(HERE, "site-overrides.json"), { sites: [] }).sites.map((s) => s.code));
const todo = catalog
  .filter((s) => { const c = cache.sites[s.id]; return !c || c.lat !== s.lat || c.lng !== s.lng; })
  .sort((a, b) => Number(curated.has(b.id)) - Number(curated.has(a.id)))
  .slice(0, LIMIT);
console.log(`카탈로그 ${catalog.length}곳 중 조회할 곳 ${todo.length}곳 (도메인 ${DOMAIN})`);

let next = 0;
let done = 0;
let fatal = null;
const t0 = Date.now();
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (!fatal && next < todo.length) {
      const s = todo[next++];
      try {
        cache.sites[s.id] = await lookup(s);
        done += 1;
        if (done % 100 === 0) {
          cache.meta.updatedAt = new Date().toISOString();
          writeJsonAtomic(WATER_CACHE, cache);
          console.log(`  ${done}곳 완료 (${((Date.now() - t0) / 1000).toFixed(0)}초)`);
        }
      } catch (e) {
        fatal = e;
      }
    }
  }),
);
cache.meta.updatedAt = new Date().toISOString();
writeJsonAtomic(WATER_CACHE, cache);
if (fatal) console.error("중단:", fatal.message);
const left = catalog.filter((s) => { const c = cache.sites[s.id]; return !c || c.lat !== s.lat || c.lng !== s.lng; }).length;
const rivers = Object.values(cache.sites).filter((c) => c.river).length;
const coasts = Object.values(cache.sites).filter((c) => c.coast).length;
console.log(`\n이번 실행 ${done}곳 · ${((Date.now() - t0) / 1000).toFixed(0)}초 · 남은 곳 ${left}곳 · 캐시 전체 ${Object.keys(cache.sites).length}곳 중 국가하천 ${rivers}곳, 해안 ${coasts}곳`);
