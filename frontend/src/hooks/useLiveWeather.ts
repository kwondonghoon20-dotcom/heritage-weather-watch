import { useEffect, useState } from "react";
import type { HeritageSite, LiveApiResponse, LiveSiteData } from "../types";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 백엔드/CDN 캐시보다 짧게 폴링해 갱신을 놓치지 않되 과도한 호출은 피함
// 서버가 아직 이번 구간 값을 다 못 채웠을 때(complete:false)는 곧 다시 물어 이어서 채운다.
const CATCH_UP_INTERVAL_MS = 15 * 1000;

interface LiveWeatherState {
  data: LiveApiResponse | null;
  loading: boolean;
  error: string | null;
}

// 날씨는 유산의 격자(grid)로, 산불위험·특보는 시군구(sigunguCode)로 찾아 합친다. 둘 중 하나라도 없으면 "데이터 없음"(null).
// 시군구 정보가 없는 유산은 산불위험을 알 수 없어 데이터 없음이다.
export function resolveLiveSite(site: HeritageSite, data: LiveApiResponse | null): LiveSiteData | null {
  if (!data) return null;
  const grid = site.grid ? data.grids[site.grid] : null;
  const region = site.sigunguCode ? data.regions[site.sigunguCode] : null;
  if (!grid || !region) return null;
  return { rain: grid.rain, wind: grid.wind, temp: grid.temp, humidity: grid.humidity, fireIdx: region.fireIdx, warnings: region.warnings ?? [] };
}

// 실시간 모드에서만 폴링한다. 백엔드가 API 키를 들고 있으므로 프런트는 /api/live만 호출한다.
export function useLiveWeather(enabled: boolean): LiveWeatherState {
  const [state, setState] = useState<LiveWeatherState>({ data: null, loading: false, error: null });

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function fetchLive() {
      setState((prev) => ({ ...prev, loading: true }));
      let next = POLL_INTERVAL_MS;
      try {
        const res = await fetch("/api/live");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: LiveApiResponse = await res.json();
        if (!json || typeof json.grids !== "object" || typeof json.regions !== "object") throw new Error("응답 형식이 올바르지 않습니다");
        if (!json.complete) next = CATCH_UP_INTERVAL_MS;
        if (!cancelled) setState({ data: json, loading: false, error: null });
      } catch (err) {
        if (!cancelled) {
          setState((prev) => ({ ...prev, loading: false, error: err instanceof Error ? err.message : "알 수 없는 오류" }));
        }
      }
      if (!cancelled) timer = setTimeout(fetchLive, next);
    }

    fetchLive();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);

  return state;
}
