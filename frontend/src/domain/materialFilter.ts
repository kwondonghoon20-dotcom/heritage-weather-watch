import type { MaterialKey } from "../types";
import { MATERIAL_LABEL } from "./constants";

export type MaterialFilterValue = MaterialKey | "all";

// 필터 옵션은 MATERIAL_LABEL 의 재질 목록에서 만든다 — 재질이 추가되면 드롭다운에도 자동으로 들어간다.
export const MATERIAL_KEYS = Object.keys(MATERIAL_LABEL) as MaterialKey[];

export function isMaterialFilterValue(v: unknown): v is MaterialFilterValue {
  return v === "all" || (typeof v === "string" && (MATERIAL_KEYS as string[]).includes(v));
}
