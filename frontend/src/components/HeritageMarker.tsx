import L from "leaflet";
import { Marker, Tooltip } from "react-leaflet";
import type { LivePhase, ScoredSite, WarningLevel } from "../types";

const NO_DATA_COLOR = "#8a8578";

type MarkerStatus = "skeleton" | "nodata" | "refreshing" | "normal";

function makeIcon(status: MarkerStatus, color: string, selected: boolean, warningLevel: WarningLevel | null): L.DivIcon {
  const size = selected ? 26 : 18;
  const statusClass = status === "skeleton" ? "marker-skeleton" : status === "refreshing" ? "marker-refreshing" : "";
  const glyph = status === "nodata" ? '<span class="marker-glyph">?</span>' : "";
  const selectedRing = selected ? `box-shadow:0 0 0 4px rgba(0,0,0,0.12), 0 0 0 2px ${color};` : "";
  // 발효 중 특보가 있으면 마커 우상단에 경고 표식을 단다 (경보=빨강, 주의보=주황).
  const warned = warningLevel
    ? `<span class="marker-warning ${warningLevel === "경보" ? "is-alert" : "is-advisory"}">!</span>`
    : "";
  return L.divIcon({
    className: "heritage-marker",
    html: `<span class="heritage-marker-dot ${statusClass}" style="width:${size}px;height:${size}px;background:${color};${selectedRing}">${glyph}${warned}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

interface Props {
  scored: ScoredSite;
  selected: boolean;
  phase: LivePhase;
  onSelect: (id: string) => void;
}

export function HeritageMarker({ scored, selected, phase, onSelect }: Props) {
  const { site, score } = scored;

  let status: MarkerStatus;
  let color: string;
  let label: string;

  if (phase === "initial-loading") {
    status = "skeleton";
    color = NO_DATA_COLOR;
    label = "불러오는 중…";
  } else if (!score) {
    status = "nodata";
    color = NO_DATA_COLOR;
    label = "데이터 없음";
  } else {
    status = phase === "refreshing" ? "refreshing" : "normal";
    color = score.level.color;
    label = `${score.level.label} (${score.total.toFixed(0)}점)`;
  }

  // 초기 로딩 중에는 score가 없어 특보도 없다. 가장 높은 등급(경보 > 주의보)을 표식에 쓴다.
  const warnings = status === "skeleton" ? [] : score?.warnings ?? [];
  const warningLevel: WarningLevel | null = warnings.length === 0 ? null : warnings.some((w) => w.level === "경보") ? "경보" : "주의보";
  const warningText = warnings.length > 0 ? ` · ${warnings.map((w) => `${w.wrn}${w.level}`).join(", ")}` : "";

  return (
    <Marker
      position={[site.lat, site.lng]}
      icon={makeIcon(status, color, selected, warningLevel)}
      eventHandlers={{ click: () => onSelect(site.id) }}
    >
      <Tooltip direction="top" offset={[0, -10]}>
        {site.name} · {label}
        {warningText}
      </Tooltip>
    </Marker>
  );
}
