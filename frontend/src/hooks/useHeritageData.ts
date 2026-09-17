import { SITES } from "../data/sites.mock";
import type { HeritageSite } from "../types";

interface HeritageDataResult {
  sites: HeritageSite[];
  source: "mock" | "api";
}

// Phase 1: mock 데이터를 반환. Phase 3에서 백엔드(/api/heritage) 연동으로 교체될 지점.
export function useHeritageData(): HeritageDataResult {
  return { sites: SITES, source: "mock" };
}
