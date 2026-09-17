import { useEffect, useRef, useState } from "react";
import type { LiveApiResponse } from "../types";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 백엔드 캐시(10분)보다 짧게 폴링해 갱신을 놓치지 않되 과도한 호출은 피함

interface LiveWeatherState {
  data: LiveApiResponse | null;
  loading: boolean;
  error: string | null;
}

// 실시간 모드에서만 폴링한다. 백엔드가 API 키를 들고 있으므로 프런트는 /api/live만 호출한다.
export function useLiveWeather(enabled: boolean): LiveWeatherState {
  const [state, setState] = useState<LiveWeatherState>({ data: null, loading: false, error: null });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    let cancelled = false;

    async function fetchLive() {
      setState((prev) => ({ ...prev, loading: true }));
      try {
        const res = await fetch("/api/live");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: LiveApiResponse = await res.json();
        if (!cancelled) setState({ data: json, loading: false, error: null });
      } catch (err) {
        if (!cancelled) {
          setState((prev) => ({ ...prev, loading: false, error: err instanceof Error ? err.message : "알 수 없는 오류" }));
        }
      }
    }

    fetchLive();
    timerRef.current = setInterval(fetchLive, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled]);

  return state;
}
