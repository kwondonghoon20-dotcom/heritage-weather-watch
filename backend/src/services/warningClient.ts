import { ENV } from "../config/env";
import { TtlCache } from "../cache/ttlCache";

export type WarningLevel = "주의보" | "경보";

export interface ActiveWarning {
  wrn: string; // 특보종류 (호우/강풍/한파/폭염/대설/태풍/건조 등, 한글 그대로)
  level: WarningLevel;
}

export interface ParsedWarning extends ActiveWarning {
  regId: string;
  regKo: string;
  regUpKo: string;
  regUpId: string; // 상위 특보구역코드. 앞 4자(L101…L117)가 시도를 가리킨다
}

const WARNING_URL = "https://apihub.kma.go.kr/api/typ01/url/wrn_now_data.php";
const TEN_MINUTES = 10 * 60 * 1000;
const CACHE_KEY = "all";
const cache = new TtlCache<ParsedWarning[] | null>(TEN_MINUTES);

// 응답은 EUC-KR 인코딩의 콤마 구분 텍스트(#로 시작하는 줄은 설명). 실제 호출로 확인(2026-09-19):
// REG_UP, REG_UP_KO, REG_ID, REG_KO, TM_FC, TM_EF, WRN, LVL, CMD, ED_TM
export function parseWarnings(text: string): ParsedWarning[] {
  const result: ParsedWarning[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const cols = line.split(",").map((c) => c.trim());
    if (cols.length < 9) continue;
    const [regUpId, regUpKo, regId, regKo, , , wrn, lvl, cmd] = cols;

    // S로 시작하는 해상 특보구역은 육상 유산과 무관하다. 해제된 특보는 발효 중이 아니다.
    if (!regId.startsWith("L")) continue;
    if (cmd.includes("해제")) continue;

    result.push({ regId, regKo, regUpKo, regUpId, wrn, level: lvl.includes("경보") ? "경보" : "주의보" });
  }
  return result;
}

async function fetchAllWarnings(): Promise<ParsedWarning[] | null> {
  const params = new URLSearchParams({ fe: "f", tm: "", disp: "0", help: "0", authKey: ENV.kmaHubApiKey });

  try {
    const res = await fetch(`${WARNING_URL}?${params.toString()}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const buf = await res.arrayBuffer();
    const text = new TextDecoder("euc-kr").decode(buf);

    // 인증/권한 오류는 JSON({"result":{"status":403,...}})으로 온다.
    if (text.trimStart().startsWith("{")) {
      const json = JSON.parse(text);
      throw new Error(json?.result?.message ?? `status ${json?.result?.status}`);
    }
    return parseWarnings(text);
  } catch (err) {
    console.error("[warningClient] 특보 조회 실패:", err instanceof Error ? err.message : err);
    return null;
  }
}

// 전국 특보를 10분 캐시. 실패(null)도 캐시해 실패 시 API를 반복 호출하지 않는다.
async function getAllWarnings(): Promise<ParsedWarning[] | null> {
  const cached = cache.get(CACHE_KEY);
  if (cached !== undefined) return cached;
  const result = await fetchAllWarnings();
  cache.set(CACHE_KEY, result);
  return result;
}

// 특보 구역(REG_ID)은 시·군 단위가 기본이지만 경주시남부·안동시북부처럼 시 안에서 쪼개지기도 하고, 서울(4개 권역)·광역시는
// 구가 아니라 도시 전체(또는 동부/서부 권역) 단위다. 그래서 유산의 (시도, 시군구명)을 다음 규칙으로 특보 구역에 맞춘다.
//  1) 시도: 구역의 상위코드(REG_UP) 앞 4자로 판별 — 이름 비교보다 정확하다. 실제 응답 228개 구역으로 확인(2026-09-21):
//     L101 경기 · L102 강원 · L103 충남 · L104 충북 · L105 전남 · L106 전북 · L107 경북 · L108 경남 · L109 제주
//     L110 서울 · L111 인천 · L112 대전 · L113 광주 · L114 대구 · L115 부산 · L116 울산 · L117 세종
//     (이름이 같은 강원 고성군/경남 고성군, 경기 광주시/광주광역시가 섞이지 않게 하는 핵심)
//  2) 광역시의 "구"(종로구 등)와 세종: 그 광역시의 구역 전체. 단 대구 달성군·인천 강화군처럼 자기 구역이 있는 "군"은 구역명으로 맞춘다.
//     [알려진 한계] 서울은 특보가 4개 권역(동남·동북·서남·서북)으로 나뉘는데 구→권역 매핑이 없어, 어느 권역의 특보든 서울의 모든 구가
//     받는다. 특보가 일부 권역에만 걸리는 날에는 다른 권역의 구(예: 종로구)에 과다하게 표시될 수 있다. 다른 광역시도 동부/서부 권역이
//     있으면 같은 한계가 있다. (2026-09-21 결정: 이번엔 고치지 않고 한계로 남긴다 — README "알려진 한계" 참고)
//  3) 그 밖의 시·군: 구역명이 "경주"로 시작하는 구역 전부(경주시남부·경주시동부…, 함양중부·보령도서 같은 줄임 표기 포함).
const PROVINCE_BY_UPID: Record<string, string> = {
  L101: "경기", L102: "강원", L103: "충남", L104: "충북", L105: "전남", L106: "전북", L107: "경북", L108: "경남", L109: "제주",
  L110: "서울", L111: "인천", L112: "대전", L113: "광주", L114: "대구", L115: "부산", L116: "울산", L117: "세종",
  L160: "경북", // 울릉도.독도
};
// 카탈로그의 region(시도 축약) → 특보 구역 시도. 전남광주통합특별시는 전남·광주 구역을 모두 가진다.
const PROVINCES_OF_REGION: Record<string, string[]> = {
  서울: ["서울"], 부산: ["부산"], 대구: ["대구"], 인천: ["인천"], 대전: ["대전"], 울산: ["울산"], 세종: ["세종"], 경기: ["경기"], 강원: ["강원"],
  충북: ["충북"], 충남: ["충남"], 전북: ["전북"], 전남광주: ["전남", "광주"], 경북: ["경북"], 경남: ["경남"], 제주: ["제주"],
};
const METRO_PROVINCES = new Set(["서울", "부산", "대구", "인천", "대전", "울산", "세종", "광주"]);

export function matchRegionWarnings(all: ParsedWarning[], region: string, sigungu: string): ActiveWarning[] {
  const provinces = PROVINCES_OF_REGION[region];
  if (!provinces) return [];
  const provinceOf = (w: ParsedWarning) => PROVINCE_BY_UPID[w.regUpId.slice(0, 4)];
  const inProvince = all.filter((w) => provinces.includes(provinceOf(w)));

  // 광역시의 구역 전체(군 단위 구역은 제외). 전남광주는 "구"일 때만 광주 쪽을 본다.
  const metroWide = (metros: string[]) => inProvince.filter((w) => metros.includes(provinceOf(w)) && !/군/.test(w.regKo));

  let zones: ParsedWarning[];
  if (/구$/.test(sigungu) || region === "세종") {
    zones = metroWide(region === "전남광주" ? ["광주"] : provinces);
  } else {
    const core = sigungu.replace(/(시|군)$/, "");
    // "제주도서부·제주도남부…"는 섬 전체 구역이라 "제주"로 시작하지만 제주시·서귀포시 자체 구역(제주시동부 등)이 따로 있으므로 뺀다.
    zones = inProvince.filter((w) => w.regKo.startsWith(core) && !w.regKo.startsWith("제주도"));
    // 울산 울주군처럼 광역시 안의 군인데 자기 구역이 따로 없으면, 그 광역시의 구역 전체를 쓴다.
    if (zones.length === 0 && provinces.length === 1 && METRO_PROVINCES.has(provinces[0])) zones = metroWide(provinces);
  }

  // 같은 (특보종류, 등급)은 한 번만 — 시 안의 여러 구역에 같은 특보가 걸려도 중복으로 쌓지 않는다.
  const seen = new Set<string>();
  const result: ActiveWarning[] = [];
  for (const z of zones) {
    const key = `${z.wrn}|${z.level}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ wrn: z.wrn, level: z.level });
    }
  }
  return result;
}

export interface WarningRegion {
  code: string;
  region: string;
  name: string;
}

// 조회 실패(null)와 "특보 없음"(빈 배열)을 구분해서 돌려준다. 키는 시군구 코드.
export async function getWarningsForRegions(regions: WarningRegion[]): Promise<Map<string, ActiveWarning[]> | null> {
  const all = await getAllWarnings();
  if (all === null) return null;
  return new Map(regions.map((r) => [r.code, matchRegionWarnings(all, r.region, r.name)]));
}
