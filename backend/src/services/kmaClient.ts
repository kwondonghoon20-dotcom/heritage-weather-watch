import { ENV } from "../config/env";
import type { GridPoint } from "../domain/grid";
import { TtlCache } from "../cache/ttlCache";

export interface LiveWeather {
  rain: number;
  wind: number;
  temp: number;
  humidity: number;
}

const KMA_BASE_URL = "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst";
const TEN_MINUTES = 10 * 60 * 1000;
const cache = new TtlCache<LiveWeather | null>(TEN_MINUTES);

// 초단기실황(getUltraSrtNcst)은 매시 40분에 생성되어 배포 지연이 있을 수 있으므로,
// 안전 마진을 두고 45분 이전이면 이전 시각 발표값을 사용한다.
function computeBaseDateTime(now: Date): { baseDate: string; baseTime: string } {
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  let hour = kst.getHours();
  const minute = kst.getMinutes();
  if (minute < 45) hour -= 1;
  if (hour < 0) {
    kst.setDate(kst.getDate() - 1);
    hour = 23;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const baseDate = `${kst.getFullYear()}${pad(kst.getMonth() + 1)}${pad(kst.getDate())}`;
  const baseTime = `${pad(hour)}00`;
  return { baseDate, baseTime };
}

async function fetchGridWeather(grid: GridPoint): Promise<LiveWeather | null> {
  const { baseDate, baseTime } = computeBaseDateTime(new Date());
  const params = new URLSearchParams({
    serviceKey: ENV.kmaApiKey,
    pageNo: "1",
    numOfRows: "20",
    dataType: "JSON",
    base_date: baseDate,
    base_time: baseTime,
    nx: String(grid.nx),
    ny: String(grid.ny),
  });

  try {
    const res = await fetch(`${KMA_BASE_URL}?${params.toString()}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();
    if (json?.response?.header?.resultCode !== "00") {
      throw new Error(json?.response?.header?.resultMsg ?? "알 수 없는 응답 코드");
    }
    const items = json?.response?.body?.items?.item;
    if (!Array.isArray(items)) throw new Error("응답 형식이 예상과 다름 (items.item 배열 아님)");

    const byCategory = new Map<string, string>(items.map((it: any) => [it.category, it.obsrValue]));
    const num = (key: string): number => {
      const v = Number(byCategory.get(key));
      return Number.isFinite(v) ? v : 0;
    };

    return { rain: num("RN1"), wind: num("WSD"), temp: num("T1H"), humidity: num("REH") };
  } catch (err) {
    console.error(`[kmaClient] 격자(${grid.nx},${grid.ny}) 조회 실패:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export async function getWeatherForGrid(grid: GridPoint): Promise<LiveWeather | null> {
  const key = `${grid.nx},${grid.ny}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const result = await fetchGridWeather(grid);
  cache.set(key, result);
  return result;
}
