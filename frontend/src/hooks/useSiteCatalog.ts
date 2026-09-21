import { useEffect, useState } from "react";
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
// 실패하면 요청을 비워서 다음 마운트 때 다시 시도할 수 있게 한다.
let inflight: Promise<HeritageSite[]> | null = null;

export function loadSiteCatalog(): Promise<HeritageSite[]> {
  if (!inflight) {
    inflight = fetch("/api/sites")
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

export function useSiteCatalog(): SiteCatalogState {
  const [state, setState] = useState<SiteCatalogState>({ status: "loading", sites: [], error: null });

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
  }, []);

  return state;
}
