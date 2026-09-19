import { ENV } from "../config/env";
import { TtlCache } from "../cache/ttlCache";

export type WarningLevel = "주의보" | "경보";

export interface ActiveWarning {
  wrn: string; // 특보종류 (호우/강풍/한파/폭염/대설/태풍/건조 등, 한글 그대로)
  level: WarningLevel;
}

interface ParsedWarning extends ActiveWarning {
  regId: string;
  regKo: string;
  regUpKo: string;
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
    const [, regUpKo, regId, regKo, , , wrn, lvl, cmd] = cols;

    // S로 시작하는 해상 특보구역은 육상 유산과 무관하다. 해제된 특보는 발효 중이 아니다.
    if (!regId.startsWith("L")) continue;
    if (cmd.includes("해제")) continue;

    result.push({ regId, regKo, regUpKo, wrn, level: lvl.includes("경보") ? "경보" : "주의보" });
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

// "경주시" → "경주". 특보구역명(REG_KO)에 접미사가 붙는 방식이 일정하지 않아 핵심 지명으로 포함 매칭한다.
export function regionKeyword(sigunguName: string): string {
  return sigunguName.replace(/(시|군|구)$/, "");
}

// 조회 실패(null)와 "특보 없음"(빈 배열)을 구분해서 돌려준다.
export async function getWarningsByKeyword(keywords: string[]): Promise<Map<string, ActiveWarning[]> | null> {
  const all = await getAllWarnings();
  if (all === null) return null;

  const map = new Map<string, ActiveWarning[]>();
  for (const keyword of keywords) {
    const matched = all.filter((w) => w.regKo.includes(keyword));
    map.set(
      keyword,
      matched.map(({ wrn, level }) => ({ wrn, level })),
    );
  }
  return map;
}
