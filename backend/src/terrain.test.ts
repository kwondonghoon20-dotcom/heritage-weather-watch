import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { HERITAGE_SITES } from "./data/heritageSites.generated";

// 지형 분류 규칙은 scripts/heritage 의 ESM(.mjs)이다. 타입 선언이 없으므로 경로를 변수로 두고 동적으로 불러온다.
const HERITAGE_SCRIPTS = path.resolve(__dirname, "../../scripts/heritage");
const load = async (file: string): Promise<any> => import(pathToFileURL(path.join(HERITAGE_SCRIPTS, file)).href);

// 큐레이션 16곳: 옛 mock 의 지정값(정답 아님)과 캐시에서 얻은 값(중심 고도 z0, 반경 500m 9점의 고저차, 400m 안 국가하천, 4km 안 해안).
// 2026-09-22 실제 조회 결과(Open-Meteo 표고 + VWorld 하천망·해안선·연안해역). 규칙은 z0 와 고저차만 쓰므로 z 는 그 둘을 반영한 합성 9점이다.
const CURATED: Array<{ name: string; region: string; sigungu: string; tag: string; prof: string; z0: number; relief: number; river: string | null; coast: string | null }> = [
  { name: "경주 불국사", region: "경북", sigungu: "경주시", tag: "mountain", prof: "hillside", z0: 246, relief: 132, river: null, coast: null },
  { name: "경주 석굴암 석굴", region: "경북", sigungu: "경주시", tag: "mountain", prof: "ridge", z0: 559, relief: 220, river: null, coast: null },
  { name: "경주 첨성대", region: "경북", sigungu: "경주시", tag: "plain", prof: "plain", z0: 45, relief: 17, river: null, coast: null },
  { name: "영주 부석사 무량수전", region: "경북", sigungu: "영주시", tag: "mountain", prof: "hillside", z0: 507, relief: 299, river: null, coast: null },
  { name: "안동 하회마을", region: "경북", sigungu: "안동시", tag: "river", prof: "flood-prone", z0: 75, relief: 44, river: "낙동강", coast: null },
  { name: "합천 해인사 장경판전", region: "경남", sigungu: "합천군", tag: "mountain", prof: "ridge", z0: 651, relief: 181, river: null, coast: null },
  { name: "남한산성", region: "경기", sigungu: "광주시", tag: "mountain", prof: "ridge", z0: 452, relief: 163, river: null, coast: null },
  { name: "수원 화성", region: "경기", sigungu: "수원시", tag: "urban", prof: "plain", z0: 76, relief: 28, river: null, coast: null },
  { name: "종묘 정전", region: "서울", sigungu: "종로구", tag: "urban", prof: "plain", z0: 47, relief: 24, river: null, coast: null },
  { name: "창덕궁", region: "서울", sigungu: "종로구", tag: "urban", prof: "plain", z0: 93, relief: 86, river: null, coast: null },
  { name: "공주 공산성", region: "충남", sigungu: "공주시", tag: "river", prof: "hillside", z0: 42, relief: 101, river: "금강", coast: null },
  { name: "공주 무령왕릉과 왕릉원", region: "충남", sigungu: "공주시", tag: "plain", prof: "plain", z0: 80, relief: 60, river: null, coast: null },
  { name: "부여 정림사지 오층석탑", region: "충남", sigungu: "부여군", tag: "plain", prof: "plain", z0: 15, relief: 22, river: null, coast: null },
  { name: "익산 미륵사지 석탑", region: "전북", sigungu: "익산시", tag: "plain", prof: "plain", z0: 47, relief: 57, river: null, coast: null },
  { name: "화순 효산리와 대신리 지석묘군", region: "전남광주", sigungu: "화순군", tag: "plain", prof: "hillside", z0: 92, relief: 134, river: null, coast: null },
  { name: "강화 부근리 지석묘", region: "인천", sigungu: "강화군", tag: "coast", prof: "hillside", z0: 10, relief: 17, river: null, coast: "연안해역:CON" },
];
const synth = (z0: number, relief: number) => [z0, z0 + relief, z0, z0, z0, z0, z0, z0, z0];

test("큐레이션 16곳: regionTag 16/16, elevationProfile 14/16 — 틀리는 곳은 부석사(구릉→능선)와 강화 부근리(구릉→평지)뿐", async () => {
  const { classifyTerrain } = await load("terrain-rules.mjs");
  const misses: string[] = [];
  let tagOk = 0;
  for (const c of CURATED) {
    const r = classifyTerrain({ z: synth(c.z0, c.relief), region: c.region, sigungu: c.sigungu, river: c.river, coast: c.coast });
    tagOk += r.regionTag === c.tag ? 1 : 0;
    if (r.elevationProfile !== c.prof) misses.push(`${c.name}: ${c.prof}→${r.elevationProfile}`);
  }
  assert.equal(tagOk, 16);
  assert.deepEqual(misses, ["영주 부석사 무량수전: hillside→ridge", "강화 부근리 지석묘: hillside→plain"]);
});

test("경계값: 고저차 90m 미만은 평지·저지대, 90m 이상은 구릉·능선 / 고도 450m 이상은 능선 / 200m 이상은 산악", async () => {
  const { classifyTerrain } = await load("terrain-rules.mjs");
  const c = (z0: number, relief: number, extra: object = {}) => classifyTerrain({ z: synth(z0, relief), region: "경북", sigungu: "경주시", river: null, coast: null, ...extra });
  assert.equal(c(50, 89.9).elevationProfile, "plain");
  assert.equal(c(50, 90).elevationProfile, "hillside");
  assert.equal(c(449.9, 200).elevationProfile, "hillside");
  assert.equal(c(450, 200).elevationProfile, "ridge");
  assert.equal(c(50, 30, { river: "낙동강" }).elevationProfile, "flood-prone"); // 낮은 기복 + 국가하천
  assert.equal(c(50, 200, { river: "낙동강" }).elevationProfile, "hillside"); // 하천이 가까워도 기복이 크면 구릉
  assert.equal(c(199.9, 10).regionTag, "plain");
  assert.equal(c(200, 10).regionTag, "mountain");
});

test("regionTag 우선순위: 산악 > 해안 > 도심 > 하천 > 평지", async () => {
  const { classifyTerrain } = await load("terrain-rules.mjs");
  const z = synth(50, 10);
  const t = (over: object) => classifyTerrain({ z, region: "서울", sigungu: "종로구", river: "한강", coast: "해안선", ...over }).regionTag;
  assert.equal(t({ z: synth(300, 10) }), "mountain");
  assert.equal(t({}), "coast");
  assert.equal(t({ coast: null }), "urban");
  assert.equal(t({ coast: null, region: "경북", sigungu: "경주시" }), "river");
  assert.equal(t({ coast: null, river: null, region: "경북", sigungu: "경주시" }), "plain");
});

test("도심 판정: 서울 전 구, 광역시의 구(군 제외), 대도시 목록", async () => {
  const { isUrban } = await load("terrain-rules.mjs");
  for (const [region, sg] of [["서울", "종로구"], ["서울", "강남구"], ["부산", "금정구"], ["대구", "동구"], ["인천", "제물포구"], ["전남광주", "광산구"], ["경기", "수원시"], ["충북", "청주시"]] as const) assert.equal(isUrban(region, sg), true, `${region} ${sg}`);
  for (const [region, sg] of [["부산", "기장군"], ["울산", "울주군"], ["인천", "강화군"], ["대구", "달성군"], ["경북", "경주시"], ["세종", "세종특별자치시"], ["전남광주", "담양군"]] as const) assert.equal(isUrban(region, sg), false, `${region} ${sg}`);
});

test("캐시가 카탈로그 좌표와 어긋나지 않는다(좌표를 고치고 표고·하천·해안을 다시 받지 않은 경우를 잡는다)", () => {
  const byId = new Map(HERITAGE_SITES.map((s) => [s.id, s]));
  for (const file of ["elevation-cache.json", "water-cache.json"]) {
    const p = path.join(HERITAGE_SCRIPTS, file);
    if (!fs.existsSync(p)) continue;
    const cache = JSON.parse(fs.readFileSync(p, "utf8")).sites as Record<string, { lat: number; lng: number }>;
    for (const [id, c] of Object.entries(cache)) {
      const s = byId.get(id);
      assert.ok(s, `${file}: 카탈로그에 없는 유산 ${id}`);
      assert.deepEqual({ lat: c.lat, lng: c.lng }, { lat: s.lat, lng: s.lng }, `${file}: ${s.name} 좌표가 카탈로그와 다름 — fetch 스크립트를 다시 실행하세요`);
    }
  }
});

test("점-폴리곤 포함 판정은 구멍(안쪽 링)을 반영한다 — 성벽 띠 안쪽 성 내부는 '안'이 아니다(북한산성 오탐 사례)", async () => {
  const { pointInPolygon } = await load("lib/common.mjs");
  // 경도 0~10, 위도 0~10 정사각형에서 경도 3~7, 위도 3~7 구멍을 뺀 고리(성벽 띠 모양)
  const ring = { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]]] };
  assert.equal(pointInPolygon(1, 1, ring), true); // 띠 위
  assert.equal(pointInPolygon(5, 5, ring), false); // 구멍(성 내부)
  assert.equal(pointInPolygon(20, 20, ring), false); // 바깥
  const multi = { type: "MultiPolygon", coordinates: [ring.coordinates, [[[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]]]] };
  assert.equal(pointInPolygon(25, 25, multi), true);
  assert.equal(pointInPolygon(5, 5, multi), false);
});
