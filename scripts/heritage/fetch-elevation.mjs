// 카탈로그 유산마다 Open-Meteo Elevation API(Copernicus GLO-90, 90m)로 표고를 받아 elevation-cache.json 에 쌓는다.
// 실시간 조회가 아니라 카탈로그를 만들 때 한 번 하는 작업이다. 지형 분류 규칙(terrain-rules.mjs)이 이 값을 쓴다.
//
//   node scripts/heritage/fetch-elevation.mjs [--max-points 7500] [--daily-limit 9000] [--hourly-limit 4500] [--per-minute 540] [--dry-run]
//
// · 유산당 9점(중심 + 반경 500m 8방향) → 1,617곳이면 14,553점. Open-Meteo 무료 한도는 분당 600·시간당 5,000·일 10,000이고,
//   다중 좌표 요청은 **좌표 수만큼** 센다(2026-09-22 실제로 확인: 5,049점을 받자 시간당 한도 429). 그래서 분당 속도를 맞추고 시간당·일일 예산 안에서
//   끊어 받는다(이어받기 가능: 이미 받은 유산은 건너뜀). 전체를 받으려면 최소 이틀이 걸린다.
// · 순서: 큐레이션 16곳 → 면적 10만㎡ 이상 큰 유산(면적 큰 순, 원본 geojson 이 있을 때) → 나머지.
// · 카탈로그 좌표가 바뀐 유산(예: 불국사 보정)은 캐시의 좌표와 달라 자동으로 다시 받는다.
// · 429 를 받으면 1분 기다려 한 번 다시 시도하고, 그래도 막히면 멈춘다. 시간당 한도가 가까우면 언제 다시 실행할지 알리고 멈춘다.
// 라이선스: Open-Meteo 무료 API는 비상업 전용이며 CC BY 4.0 표기가 필요하다(지도 하단 출처 표기, README 참고).
import fs from "node:fs";
import { ELEVATION_CACHE, GEOJSON_FILE, HERE, POINTS_PER_SITE, loadCatalog, readJson, samplePoints, sleep, writeJsonAtomic } from "./lib/common.mjs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const MAX_POINTS = opt("--max-points", 7500);
const DAILY_LIMIT = opt("--daily-limit", 9000);
const HOURLY_LIMIT = opt("--hourly-limit", 4500); // 무료 한도는 시간당 5,000 — 여유를 둔다
const PER_MINUTE = opt("--per-minute", 540); // 무료 한도는 분당 600 — 여유를 둔다
const DRY = args.includes("--dry-run");
const BATCH_POINTS = 99; // 요청당 최대 100좌표 — 유산 단위(9점)로 묶으면 99점(11곳)

const catalog = loadCatalog();
const cache = readJson(ELEVATION_CACHE, null) ?? {
  meta: { source: "Open-Meteo Elevation API (Copernicus DEM GLO-90, 90m)", url: "https://open-meteo.com/en/docs/elevation-api", license: "CC BY 4.0, 비상업", ringMeters: 500, layout: "중심, 북, 북동, 동, 남동, 남, 남서, 서, 북서", usage: {} },
  sites: {},
};

// ── 받을 대상과 순서 ──
const curated = new Set(readJson(path.join(HERE, "site-overrides.json"), { sites: [] }).sites.map((s) => s.code));
const area = new Map();
if (fs.existsSync(GEOJSON_FILE)) for (const f of JSON.parse(fs.readFileSync(GEOJSON_FILE, "utf8")).features) area.set(f.properties.유산코드, f.properties.면적 ?? 0);
const rank = (s) => (curated.has(s.id) ? 0 : (area.get(s.id) ?? 0) >= 100000 ? 1 : 2);
const stale = (s) => {
  const c = cache.sites[s.id];
  return !c || c.lat !== s.lat || c.lng !== s.lng || !Array.isArray(c.z) || c.z.length !== POINTS_PER_SITE;
};
const todo = catalog.filter(stale).sort((a, b) => rank(a) - rank(b) || (area.get(b.id) ?? 0) - (area.get(a.id) ?? 0));

const today = new Date().toISOString().slice(0, 10); // 일 한도 기준일(UTC)
const nextUtcMidnight = () => { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 5); }; // 자정 + 5분
if (cache.meta.blockedUntil && Date.now() < cache.meta.blockedUntil && !DRY) {
  console.log(`한도 때문에 ${new Date(cache.meta.blockedUntil).toISOString()}(UTC)까지 쉬는 중 — ${cache.meta.blockedReason ?? ""}`);
  process.exit(0);
}
const usedToday = cache.meta.usage[today] ?? 0;
const HOUR = 3600 * 1000;
cache.meta.recent = (cache.meta.recent ?? []).filter(([t]) => Date.now() - t < HOUR);
const usedLastHour = () => cache.meta.recent.reduce((n, [, p]) => n + p, 0);
const budget = Math.max(0, Math.min(MAX_POINTS, DAILY_LIMIT - usedToday));
console.log(`카탈로그 ${catalog.length}곳 중 받을 곳 ${todo.length}곳(${todo.length * POINTS_PER_SITE}점) · 이미 받은 곳 ${catalog.length - todo.length}곳`);
console.log(`오늘(UTC ${today}) 이 스크립트로 쓴 점 ${usedToday} / 일일 상한 ${DAILY_LIMIT} → 이번 실행 예산 ${budget}점 (--max-points ${MAX_POINTS}), 최근 1시간 사용 ${usedLastHour()}점 / ${HOURLY_LIMIT}`);
if (DRY || budget < POINTS_PER_SITE || todo.length === 0) {
  console.log(DRY ? "(dry-run: 호출하지 않음)" : todo.length === 0 ? "받을 곳이 없습니다." : "예산이 부족해 호출하지 않습니다.");
  process.exit(0);
}

async function elevations(points) {
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${points.map((p) => p.lat.toFixed(6)).join(",")}&longitude=${points.map((p) => p.lng.toFixed(6)).join(",")}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (res.status === 429) {
        const body = (await res.text()).slice(0, 200);
        // 분당 한도만 1분 뒤 다시 시도한다. 시간당·일일 한도는 기다려 봐야 그 창 안에서는 풀리지 않는다 — 멈추고 언제까지 쉴지 기록한다.
        if (!/minute/i.test(body) || attempt >= 2) throw Object.assign(new Error("429 한도 초과: " + body), { rateLimited: true, body });
        console.log("  429(분당) — 1분 기다렸다가 한 번 더 시도");
        await sleep(65000);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
      const j = await res.json();
      if (!Array.isArray(j.elevation) || j.elevation.length !== points.length) throw new Error("응답 형식이 예상과 다름");
      return j.elevation;
    } catch (e) {
      if (e.rateLimited || attempt === 3) throw e;
      await sleep(2000);
    }
  }
}

let spent = 0;
let done = 0;
const t0 = Date.now();
try {
  for (let i = 0; i < todo.length; ) {
    const group = [];
    while (i < todo.length && (group.length + 1) * POINTS_PER_SITE <= BATCH_POINTS && spent + (group.length + 1) * POINTS_PER_SITE <= budget) group.push(todo[i++]);
    if (group.length === 0) break; // 예산 소진
    const points = group.flatMap((s) => samplePoints(s.lat, s.lng));
    if (usedLastHour() + points.length > HOURLY_LIMIT) {
      const oldest = cache.meta.recent[0]?.[0] ?? Date.now();
      console.log(`시간당 한도(${HOURLY_LIMIT}점) 근접 — 약 ${Math.max(1, Math.ceil((oldest + HOUR - Date.now()) / 60000))}분 뒤 다시 실행하세요.`);
      break;
    }
    const tReq = Date.now();
    const z = await elevations(points);
    group.forEach((s, k) => {
      cache.sites[s.id] = { lat: s.lat, lng: s.lng, z: z.slice(k * POINTS_PER_SITE, (k + 1) * POINTS_PER_SITE).map((v) => Math.round(v * 10) / 10) };
    });
    spent += points.length;
    done += group.length;
    cache.meta.recent.push([Date.now(), points.length]);
    delete cache.meta.blockedUntil;
    delete cache.meta.blockedReason;
    cache.meta.usage[today] = usedToday + spent;
    cache.meta.updatedAt = new Date().toISOString();
    writeJsonAtomic(ELEVATION_CACHE, cache);
    if (done % 110 < group.length) console.log(`  ${done}곳 완료 (${spent}점, ${((Date.now() - t0) / 1000).toFixed(0)}초)`);
    await sleep(Math.max(400, Math.ceil((points.length / PER_MINUTE) * 60000) - (Date.now() - tReq)));
  }
} catch (e) {
  console.error("중단:", e.message);
  if (e.rateLimited) {
    // Daily → 다음 UTC 자정 뒤, Hourly → 35분 뒤, 그 밖 → 10분 뒤
    const until = /daily/i.test(e.body ?? "") ? nextUtcMidnight() : /hour/i.test(e.body ?? "") ? Date.now() + 35 * 60000 : Date.now() + 10 * 60000;
    cache.meta.blockedUntil = until;
    cache.meta.blockedReason = (e.body ?? "").slice(0, 120);
    writeJsonAtomic(ELEVATION_CACHE, cache);
    console.log(`→ ${new Date(until).toISOString()}(UTC) 이후에 다시 실행하세요.`);
  }
}
const left = catalog.filter(stale).length;
console.log(`\n이번 실행: ${done}곳 · ${spent}점 · ${((Date.now() - t0) / 1000).toFixed(0)}초. 남은 곳 ${left}곳(${left * POINTS_PER_SITE}점). 오늘 누계 ${cache.meta.usage[today] ?? 0}점.`);
if (left > 0) console.log("→ 예산이 남는 다음 날(UTC 기준 날짜가 바뀐 뒤) 같은 명령을 다시 실행하면 이어서 받습니다.");
