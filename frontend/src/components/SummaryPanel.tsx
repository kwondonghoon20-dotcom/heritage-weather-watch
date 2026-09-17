import type { CSSProperties } from "react";
import { LEVELS } from "../domain/constants";
import type { LevelKey, LivePhase, ScoredSite } from "../types";

interface Props {
  scored: ScoredSite[];
  phase: LivePhase;
}

export function SummaryPanel({ scored, phase }: Props) {
  if (phase === "initial-loading") {
    return (
      <div className="summary-panel" aria-label="경보 단계별 현황 (불러오는 중)">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="summary-stat">
            <div className="skeleton-block" style={{ width: 30, height: 22, marginBottom: 6 }} />
            <div className="skeleton-block" style={{ width: 40, height: 10 }} />
          </div>
        ))}
      </div>
    );
  }

  const counts: Record<LevelKey, number> = { blue: 0, yellow: 0, orange: 0, red: 0 };
  let noData = 0;
  scored.forEach((s) => {
    if (s.score) counts[s.score.level.key] += 1;
    else noData += 1;
  });

  return (
    <div className="summary-panel" aria-label="경보 단계별 현황">
      {LEVELS.map((lv) => (
        <div key={lv.key} className="summary-stat" style={{ "--stat-color": lv.color } as CSSProperties}>
          <div className="n">{counts[lv.key]}</div>
          <div className="lbl">{lv.label}</div>
        </div>
      ))}
      {noData > 0 && (
        <div className="summary-stat" style={{ "--stat-color": "#8a8578" } as CSSProperties}>
          <div className="n">{noData}</div>
          <div className="lbl">데이터 없음</div>
        </div>
      )}
    </div>
  );
}
