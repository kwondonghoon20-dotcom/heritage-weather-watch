import { useMemo } from "react";
import { SITES as MOCK_SITES } from "../data/sites.mock";
import type { HeritageSite } from "../types";
import { useSiteCatalog } from "./useSiteCatalog";

export interface HeritageDataResult {
  sites: HeritageSite[];
  // api: 백엔드 카탈로그(/api/sites) / mock: 카탈로그를 못 받아 예시 16곳으로 대체
  source: "api" | "mock";
  status: "loading" | "ready" | "error";
}

const EMPTY: HeritageSite[] = [];

// 유산 목록의 유일한 진입점. 앱 시작 시 받아 둔 카탈로그를 시나리오·실시간 모드가 함께 쓴다.
// 카탈로그 요청이 실패하면 예시 16곳(sites.mock.ts)으로 대체해 앱이 빈 화면이 되지 않게 한다.
export function useHeritageData(): HeritageDataResult {
  const catalog = useSiteCatalog();
  return useMemo(() => {
    if (catalog.status === "ready") return { sites: catalog.sites, source: "api", status: "ready" };
    if (catalog.status === "error") return { sites: MOCK_SITES, source: "mock", status: "error" };
    return { sites: EMPTY, source: "api", status: "loading" };
  }, [catalog]);
}
