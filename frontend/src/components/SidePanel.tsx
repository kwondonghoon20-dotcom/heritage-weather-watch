import { FACTOR_LABEL, MATERIAL_LABEL } from "../domain/constants";
import { adviceFor } from "../domain/advice";
import type { FactorKey, LivePhase, ScoredSite } from "../types";

const FACTOR_ORDER: FactorKey[] = ["rain", "wind", "freeze", "fire", "humidity"];

interface Props {
  scored: ScoredSite | null;
  phase: LivePhase;
}

export function SidePanel({ scored, phase }: Props) {
  if (!scored) {
    return (
      <aside className="detail-panel">
        <div className="detail-empty">
          <span className="mark" aria-hidden="true">
            ☂
          </span>
          지도에서 마커를 클릭하면
          <br />
          세부 위험 요인과 권장 조치를 볼 수 있어요.
        </div>
      </aside>
    );
  }

  const { site, score } = scored;

  if (!score) {
    if (phase === "initial-loading") {
      return (
        <aside className="detail-panel">
          <h3 className="detail-name">{site.name}</h3>
          <div className="skeleton-block" style={{ width: "60%", height: 12, margin: "0 0 14px" }} />
          <div className="skeleton-block" style={{ width: 110, height: 26, margin: "0 0 16px" }} />
          {FACTOR_ORDER.map((f) => (
            <div className="factor" key={f}>
              <div className="factor-row">
                <span>{FACTOR_LABEL[f]}</span>
              </div>
              <div className="skeleton-block" style={{ width: "100%", height: 8 }} />
            </div>
          ))}
        </aside>
      );
    }
    return (
      <aside className="detail-panel">
        <h3 className="detail-name">{site.name}</h3>
        <div className="detail-meta">
          {site.region} · {site.era} · {site.heritageType} · {MATERIAL_LABEL[site.material]}
        </div>
        <p className="detail-empty">❓ 실시간 기상·산불위험 데이터를 아직 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
        <p className="desc">{site.desc}</p>
      </aside>
    );
  }

  const advice = adviceFor(score.level.key, score.topFactor, site.material);

  return (
    <aside className="detail-panel">
      <h3 className="detail-name">{site.name}</h3>
      <div className="detail-meta">
        {site.region} · {site.era} · {site.heritageType} · {MATERIAL_LABEL[site.material]}
      </div>
      <span className="detail-badge" style={{ background: score.level.tint, color: score.level.color }}>
        {score.level.label} · {score.total.toFixed(0)}점
      </span>
      {phase === "refreshing" && (
        <span className="refreshing-tag" aria-live="polite">
          ⟳ 갱신 중…
        </span>
      )}

      {FACTOR_ORDER.map((f) => {
        const v = score.raw[f];
        return (
          <div className="factor" key={f}>
            <div className="factor-row">
              <span>{FACTOR_LABEL[f]}</span>
              <span className="fv">{v.toFixed(0)}</span>
            </div>
            <div className="factor-track">
              <div className="factor-fill" style={{ width: `${v.toFixed(0)}%`, background: score.level.color }} />
            </div>
          </div>
        );
      })}

      <div className="advice-box">
        <div className="h">권장 조치</div>
        {advice}
      </div>
      <p className="desc">{site.desc}</p>
    </aside>
  );
}
