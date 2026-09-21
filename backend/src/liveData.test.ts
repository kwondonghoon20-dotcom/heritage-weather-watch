import { test, before, beforeEach, after, mock } from "node:test";
import assert from "node:assert/strict";

// ENV 는 모듈을 불러올 때 읽으므로 환경변수를 먼저 정하고 동적으로 import 한다. 실제 기상청은 부르지 않는다(fetch 를 스텁으로 바꾼다).
process.env.KMA_API_KEY = "test-key";
process.env.KMA_DISK_CACHE = "0";
process.env.KMA_CACHE_HOURS = "3";

let getLiveData: typeof import("./liveData").getLiveData;
let liveCacheControl: typeof import("./liveData").liveCacheControl;
let SITE_GRIDS: typeof import("./siteGrids").SITE_GRIDS;
let fallbackCandidates: typeof import("./siteGrids").fallbackCandidates;
let cacheBucket: typeof import("./services/kmaClient").cacheBucket;
let bucketEndMs: typeof import("./services/kmaClient").bucketEndMs;
let resetKmaStateForTests: typeof import("./services/kmaClient").resetKmaStateForTests;
let ENV: typeof import("./config/env").ENV;

// 가짜 기상청: 격자 (nx,ny)에는 rain=nx, wind=ny 를 준다. missing 은 결측(-999), failing 은 HTTP 500.
let kmaCalls: string[] = [];
let delayMs = 0;
let missing = new Set<string>();
let failing = new Set<string>();
const realFetch = globalThis.fetch;

function stubWeather(nx: number, ny: number) {
  return { rain: nx, wind: ny, temp: 20, humidity: 50 };
}

before(async () => {
  ({ getLiveData, liveCacheControl } = await import("./liveData"));
  ({ SITE_GRIDS, fallbackCandidates } = await import("./siteGrids"));
  ({ cacheBucket, bucketEndMs, resetKmaStateForTests } = await import("./services/kmaClient"));
  ({ ENV } = await import("./config/env"));
  mock.method(console, "log", () => {});
  mock.method(console, "error", () => {});
  mock.method(console, "warn", () => {});
  globalThis.fetch = (async (input: any) => {
    const url = new URL(String(input));
    if (!url.pathname.endsWith("getUltraSrtNcst")) throw new Error("스텁: 기상청 외 호출은 실패로 처리");
    const nx = Number(url.searchParams.get("nx"));
    const ny = Number(url.searchParams.get("ny"));
    kmaCalls.push(`${nx},${ny}`);
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    if (failing.has(`${nx},${ny}`)) return new Response("boom", { status: 500 });
    const w = missing.has(`${nx},${ny}`) ? { rain: -999, wind: -999, temp: -999, humidity: -999 } : stubWeather(nx, ny);
    const item = [["RN1", w.rain], ["WSD", w.wind], ["T1H", w.temp], ["REH", w.humidity]].map(([category, v]) => ({ category, obsrValue: String(v) }));
    return new Response(JSON.stringify({ response: { header: { resultCode: "00" }, body: { items: { item } } } }), { status: 200 });
  }) as typeof fetch;
});

beforeEach(() => {
  resetKmaStateForTests();
  kmaCalls = [];
  delayMs = 0;
  missing = new Set();
  failing = new Set();
  ENV.kmaDailyCallLimit = 8000;
});

after(() => {
  globalThis.fetch = realFetch;
  mock.restoreAll();
});

test("캐시 구간은 KST 0시부터 N시간 단위로 정렬되고, 구간 끝은 다음 구간 시작과 같다", () => {
  const kstMidnight = Date.parse("2026-09-21T00:00:00+09:00");
  const H = 3600 * 1000;
  assert.equal(cacheBucket(kstMidnight, 3), cacheBucket(kstMidnight + 3 * H - 1, 3));
  assert.equal(cacheBucket(kstMidnight + 3 * H, 3), cacheBucket(kstMidnight, 3) + 1);
  assert.equal(bucketEndMs(cacheBucket(kstMidnight, 3), 3), kstMidnight + 3 * H);
  // 24의 약수면 하루가 정확히 24/N 개 구간이다
  assert.equal(cacheBucket(kstMidnight + 24 * H, 3) - cacheBucket(kstMidnight, 3), 8);
});

test("CDN 캐시 헤더: 채운 정도에 따라 캐시 시간이 달라진다", () => {
  const start = Date.parse("2026-09-21T03:00:00+09:00");
  const done = { pending: 0, pendingEmpty: 0, blocked: 0 };
  // 구간 시작 직후에 다 채웠다 → 3시간(10800초) + stale-while-revalidate
  assert.equal(liveCacheControl(done, start, 3), "public, s-maxage=10800, stale-while-revalidate=3600");
  // 구간 중간(1시간 경과) → 남은 2시간만큼. CDN이 서버 구간보다 오래 낡은 값을 들고 있지 않는다
  assert.equal(liveCacheControl(done, start + 3600 * 1000, 3), "public, s-maxage=7200, stale-while-revalidate=3600");
  // 구간 끝 직전 → 최소 60초
  assert.equal(liveCacheControl(done, start + 3 * 3600 * 1000 - 5000, 3), "public, s-maxage=60, stale-while-revalidate=3600");
  // 못 채운 격자가 있으면 짧게(값이 아예 없는 격자가 있으면 stale 없이 5초)
  assert.equal(liveCacheControl({ pending: 10, pendingEmpty: 10, blocked: 0 }, start, 3), "public, s-maxage=5");
  assert.equal(liveCacheControl({ pending: 10, pendingEmpty: 0, blocked: 0 }, start, 3), "public, s-maxage=10, stale-while-revalidate=60");
  assert.equal(liveCacheControl({ pending: 0, pendingEmpty: 0, blocked: 2 }, start, 3), "public, s-maxage=300, stale-while-revalidate=600");
});

test("유산 격자는 741개, 첫 요청은 격자당 정확히 1번 호출하고 같은 구간의 두 번째 요청은 호출하지 않는다", async () => {
  assert.equal(SITE_GRIDS.length, 741);
  const first = await getLiveData({ deadlineMs: 0 });
  assert.equal(kmaCalls.length, 741);
  assert.equal(new Set(kmaCalls).size, 741);
  assert.equal(first.data.complete, true);
  assert.equal(first.data.pendingGrids, 0);
  assert.equal(Object.values(first.data.grids).filter(Boolean).length, 741);
  assert.equal(first.data.refreshHours, 3);
  const { nx, ny } = SITE_GRIDS[0].grid;
  assert.deepEqual(first.data.grids[SITE_GRIDS[0].key], stubWeather(nx, ny)); // 유산 각자의 격자 값을 받는다(시군구 대표값이 아님)
  assert.match(first.cacheControl, /^public, s-maxage=\d+, stale-while-revalidate=3600$/);
  assert.ok(Number(/s-maxage=(\d+)/.exec(first.cacheControl)![1]) <= 3 * 3600);

  const second = await getLiveData({ deadlineMs: 0 });
  assert.equal(kmaCalls.length, 741, "같은 구간이므로 추가 호출이 없어야 한다");
  assert.deepEqual(second.data.grids, first.data.grids);
});

test("응답 제한 시간이 지나면 일부만 채워 응답하고, 다음 요청이 이어서 채우며 중복 호출은 없다", async () => {
  delayMs = 20;
  const partial = await getLiveData({ deadlineMs: 50 });
  assert.equal(partial.data.complete, false);
  assert.ok(partial.data.pendingGrids > 0);
  assert.ok(kmaCalls.length > 0 && kmaCalls.length < 741, `일부만 조회했어야 한다: ${kmaCalls.length}`);
  assert.equal(partial.cacheControl, "public, s-maxage=5"); // 값이 아예 없는 격자가 있으니 곧 다시 물어야 한다
  const withValue = Object.values(partial.data.grids).filter(Boolean).length;
  assert.equal(withValue, 741 - partial.data.pendingGrids); // 못 채운 격자는 null("아직 값 없음")
  // 유산이 많은 격자부터 채운다
  assert.ok(partial.data.grids[SITE_GRIDS[0].key]);

  delayMs = 0;
  const rest = await getLiveData({ deadlineMs: 0 });
  assert.equal(rest.data.complete, true);
  assert.equal(kmaCalls.length, 741, "이어서 채울 때 이미 조회한 격자를 다시 부르면 안 된다");
  assert.equal(Object.values(rest.data.grids).filter(Boolean).length, 741);
});

test("겹친 요청은 같은 격자를 한 번만 조회한다", async () => {
  delayMs = 5;
  const [a, b] = await Promise.all([getLiveData({ deadlineMs: 0 }), getLiveData({ deadlineMs: 0 })]);
  assert.equal(kmaCalls.length, 741);
  assert.equal(a.data.complete && b.data.complete, true);
});

test("관측 결측 격자는 이웃 유산 격자의 값을 대신 쓴다(추가 호출 없음)", async () => {
  const keys = new Set(SITE_GRIDS.map((g) => g.key));
  const target = SITE_GRIDS.find((g) => {
    const first = fallbackCandidates(g.grid)[0];
    return keys.has(`${first.nx},${first.ny}`);
  })!;
  const neighbor = fallbackCandidates(target.grid)[0];
  missing.add(target.key);
  const { data } = await getLiveData({ deadlineMs: 0 });
  assert.deepEqual(data.grids[target.key], stubWeather(neighbor.nx, neighbor.ny));
  assert.equal(kmaCalls.length, 741, "이웃이 이미 조회하는 유산 격자면 대체에 호출이 늘지 않는다");
  assert.equal(data.complete, true);

  // 결측도 그 구간 동안은 확정이라 다시 묻지 않는다
  await getLiveData({ deadlineMs: 0 });
  assert.equal(kmaCalls.length, 741);
});

test("조회 실패한 격자는 한 번 재시도한 뒤 쉬고(백오프), 그 격자만 값 없음이며 짧게 캐시된다", async () => {
  const bad = SITE_GRIDS[100].key;
  failing.add(bad);
  const first = await getLiveData({ deadlineMs: 0 });
  assert.equal(first.data.grids[bad], null);
  assert.equal(Object.values(first.data.grids).filter(Boolean).length, 740);
  assert.equal(kmaCalls.filter((k) => k === bad).length, 2); // 최초 + 재시도 1번
  assert.equal(first.cacheControl, "public, s-maxage=300, stale-while-revalidate=600");

  await getLiveData({ deadlineMs: 0 });
  assert.equal(kmaCalls.filter((k) => k === bad).length, 2, "백오프 중에는 다시 부르지 않는다");
});

test("실패가 나도 직전 구간 값이 있으면 그 값을 계속 보여준다", async () => {
  const key = SITE_GRIDS[0].key;
  await getLiveData({ deadlineMs: 0 }); // 이번 구간 값 확보
  const before = (await getLiveData({ deadlineMs: 0 })).data.grids[key];
  assert.ok(before);
  // 구간이 바뀐 것처럼: 시계를 3시간 앞으로
  const realNow = Date.now;
  Date.now = () => realNow() + 3 * 3600 * 1000;
  try {
    failing.add(key);
    const after = await getLiveData({ deadlineMs: 0 });
    assert.deepEqual(after.data.grids[key], before, "새 값을 못 받으면 직전 값을 대신 보여준다");
  } finally {
    Date.now = realNow;
  }
});

test("하루 호출 예산이 바닥나면 더 부르지 않고 응답은 끝난 것으로 본다(짧은 캐시)", async () => {
  ENV.kmaDailyCallLimit = 100;
  const { data, cacheControl } = await getLiveData({ deadlineMs: 0 });
  assert.equal(kmaCalls.length, 100);
  assert.equal(Object.values(data.grids).filter(Boolean).length, 100);
  assert.equal(data.complete, true); // 더 기다려도 채울 수 없다 — 프런트가 계속 재요청하지 않게 한다
  assert.equal(cacheControl, "public, s-maxage=300, stale-while-revalidate=600");
});
