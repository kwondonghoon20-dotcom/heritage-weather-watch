import { useCallback, useEffect, useState } from "react";
import type { HeritageSite } from "../types";

export type CatalogStatus = "loading" | "ready" | "error";

export interface SiteCatalogState {
  status: CatalogStatus;
  sites: HeritageSite[];
  error: string | null;
}

interface SitesApiResponse {
  count: number;
  sites: HeritageSite[];
}

// 유산 목록(GET /api/sites)은 배포 단위로만 바뀌는 정적 데이터라 앱 시작 시 한 번만 받아 재사용한다.
// 진행 중이거나 성공한 요청은 모듈 변수로 공유해서, 컴포넌트가 다시 마운트돼도 중복 호출하지 않는다.
// 실패하면 요청을 비워서 retry() 나 다음 마운트 때 다시 시도할 수 있게 한다.
let inflight: Promise<HeritageSite[]> | null = null;

// 카탈로그 응답은 브라우저·CDN에 오래 캐시된다(max-age=300, stale-while-revalidate=86400 — 옛 값을 먼저 주고 뒤에서 갱신). 응답 모양이 바뀌면
// 이 버전을 올려 캐시를 분리할 것: 안 그러면 재방문자가 옛 카탈로그(예: v2 이전에는 유산의 grid 필드가 없음)로 새 화면을 그려 실시간 값이 전부 "데이터 없음"이 된다.
const SITES_URL = "/api/sites?v=2";

export function loadSiteCatalog(): Promise<HeritageSite[]> {
  if (!inflight) {
    inflight = fetch(SITES_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<SitesApiResponse>;
      })
      .then((json) => {
        if (!Array.isArray(json?.sites)) throw new Error("응답 형식이 올바르지 않습니다");
        return json.sites;
      })
      .catch((err) => {
        inflight = null;
        throw err;
      });
  }
  return inflight;
}

export function useSiteCatalog(): SiteCatalogState & { retry: () => void } {
  const [state, setState] = useState<SiteCatalogState>({ status: "loading", sites: [], error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadSiteCatalog()
      .then((sites) => {
        if (!cancelled) setState({ status: "ready", sites, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: "error", sites: [], error: err instanceof Error ? err.message : "알 수 없는 오류" });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading", sites: [], error: null });
    setAttempt((a) => a + 1);
  }, []);

  return { ...state, retry };
}
