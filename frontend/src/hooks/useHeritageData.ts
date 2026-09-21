import { useMemo } from "react";
import type { HeritageSite } from "../types";
import { useSiteCatalog } from "./useSiteCatalog";

export interface HeritageDataResult {
  sites: HeritageSite[];
  status: "loading" | "ready" | "error";
  retry: () => void;
}

const EMPTY: HeritageSite[] = [];

// 유산 목록의 유일한 진입점. 백엔드 카탈로그(/api/sites)를 앱 시작 시 1회 받아 시나리오·실시간 모드가 함께 쓴다.
// 대체 데이터는 두지 않는다 — 요청이 실패하면 빈 목록과 error 상태를 돌려주고, 화면이 안내와 다시 시도 버튼을 보여준다.
export function useHeritageData(): HeritageDataResult {
  const catalog = useSiteCatalog();
  return useMemo(
    () => ({ sites: catalog.status === "ready" ? catalog.sites : EMPTY, status: catalog.status, retry: catalog.retry }),
    [catalog.status, catalog.sites, catalog.retry],
  );
}
