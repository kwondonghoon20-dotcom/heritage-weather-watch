import { MATERIAL_LABEL } from "../domain/constants";
import { MATERIAL_KEYS, type MaterialFilterValue } from "../domain/materialFilter";
import type { MaterialKey } from "../types";

interface Props {
  value: MaterialFilterValue;
  counts: Partial<Record<MaterialKey, number>>; // 재질별 유산 수(전체 목록 기준)
  total: number;
  shown: number; // 지금 지도에 표시 중인 유산 수
  disabled: boolean;
  onChange: (value: MaterialFilterValue) => void;
}

export function MaterialFilter({ value, counts, total, shown, disabled, onChange }: Props) {
  return (
    <div className="material-filter">
      <label htmlFor="material-filter">재질 필터</label>
      <select id="material-filter" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as MaterialFilterValue)}>
        <option value="all">전체 재질 ({total.toLocaleString()})</option>
        {MATERIAL_KEYS.map((key) => (
          <option key={key} value={key}>
            {MATERIAL_LABEL[key]} ({(counts[key] ?? 0).toLocaleString()})
          </option>
        ))}
      </select>
      {value !== "all" && !disabled && (
        <span className="material-filter-note">
          {shown.toLocaleString()}곳 표시 중 ·{" "}
          <button type="button" className="link-btn" onClick={() => onChange("all")}>
            필터 해제
          </button>
        </span>
      )}
    </div>
  );
}
