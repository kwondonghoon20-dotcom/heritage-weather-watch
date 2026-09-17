import L from "leaflet";
import { Marker, Tooltip } from "react-leaflet";
import type { LivePhase, ScoredSite } from "../types";

const NO_DATA_COLOR = "#8a8578";

type MarkerStatus = "skeleton" | "nodata" | "refreshing" | "normal";

function makeIcon(status: MarkerStatus, color: string, selected: boolean): L.DivIcon {
  const size = selected ? 26 : 18;
  const statusClass = status === "skeleton" ? "marker-skeleton" : status === "refreshing" ? "marker-refreshing" : "";
  const glyph = status === "nodata" ? '<span class="marker-glyph">?</span>' : "";
  const selectedRing = selected ? `box-shadow:0 0 0 4px rgba(0,0,0,0.12), 0 0 0 2px ${color};` : "";
  return L.divIcon({
    className: "heritage-marker",
    html: `<span class="heritage-marker-dot ${statusClass}" style="width:${size}px;height:${size}px;background:${color};${selectedRing}">${glyph}</span>`,
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

  return (
    <Marker position={[site.lat, site.lng]} icon={makeIcon(status, color, selected)} eventHandlers={{ click: () => onSelect(site.id) }}>
      <Tooltip direction="top" offset={[0, -10]}>
        {site.name} · {label}
      </Tooltip>
    </Marker>
  );
}
