import { ENV } from "../config/env";
import { TtlCache } from "../cache/ttlCache";

const FIRE_BASE_URL = "http://apis.data.go.kr/1400377/forestPointV2/forestPointListSigunguSearchV2";
const THIRTY_MINUTES = 30 * 60 * 1000;
const cache = new TtlCache<Map<string, number>>(THIRTY_MINUTES);

// 국립산림과학원 산불위험지수(0~100) 등급 기준: 낮음 ≤50 / 다소높음 51~65 / 높음 66~85 / 매우높음 86~
// 실제 API 응답으로 확인(2026-09-17): { sigucode, sigun, meanavg, ... } 형태.
export function bucketFireIdx(meanavg: number): number {
  if (meanavg > 85) return 4;
  if (meanavg > 65) return 3;
  if (meanavg > 50) return 2;
  return 1;
}

async function fetchSigunguMeanIndices(codes: string[]): Promise<Map<string, number>> {
  if (codes.length === 0) return new Map();

  const params = new URLSearchParams({
    ServiceKey: ENV.forestFireApiKey,
    pageNo: "1",
    numOfRows: String(codes.length),
    _type: "json",
    localAreas: codes.join(","),
    excludeForecast: "1",
  });

  try {
    const res = await fetch(`${FIRE_BASE_URL}?${params.toString()}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();
    if (json?.response?.header?.resultCode !== "00") {
      throw new Error(json?.response?.header?.resultMsg ?? "알 수 없는 응답 코드");
    }

    const rawItems = json?.response?.body?.items;
    if (!rawItems) return new Map();
    const items = Array.isArray(rawItems.item) ? rawItems.item : [rawItems.item];

    const map = new Map<string, number>();
    for (const item of items) {
      const code = String(item?.sigucode ?? "");
      const meanavg = Number(item?.meanavg);
      if (code && Number.isFinite(meanavg)) map.set(code, meanavg);
    }
    return map;
  } catch (err) {
    console.error("[forestFireClient] 산불위험지수 조회 실패:", err instanceof Error ? err.message : err);
    return new Map();
  }
}

export async function getFireIndexBySigungu(codes: string[]): Promise<Map<string, number>> {
  const uniqueSorted = [...new Set(codes)].sort();
  const key = uniqueSorted.join(",");
  const cached = cache.get(key);
  if (cached) return cached;

  const result = await fetchSigunguMeanIndices(uniqueSorted);
  cache.set(key, result);
  return result;
}
