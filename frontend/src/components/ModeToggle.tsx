import type { ViewMode } from "../types";

interface Props {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ModeToggle({ mode, onChange }: Props) {
  return (
    <div className="mode-toggle" role="group" aria-label="관측 모드 선택">
      <button type="button" className="mode-btn" aria-pressed={mode === "scenario"} onClick={() => onChange("scenario")}>
        ⛅ 시나리오 시뮬레이션
      </button>
      <button type="button" className="mode-btn" aria-pressed={mode === "live"} onClick={() => onChange("live")}>
        📡 실시간 관측
      </button>
    </div>
  );
}
