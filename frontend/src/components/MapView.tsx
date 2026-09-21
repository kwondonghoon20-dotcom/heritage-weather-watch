import { MapContainer, TileLayer } from "react-leaflet";
import type { LivePhase, ScoredSite } from "../types";
import { ClusterLayer } from "./ClusterLayer";
import { SummaryPanel } from "./SummaryPanel";

const KOREA_CENTER: [number, number] = [36.2, 127.8];

interface Props {
  scored: ScoredSite[];
  selectedId: string | null;
  phase: LivePhase;
  onSelect: (id: string) => void;
  // 유산 목록을 불러오는 중이거나 대체 데이터를 쓰는 경우 지도 위에 띄우는 안내 문구
  notice?: string | null;
}

export function MapView({ scored, selectedId, phase, onSelect, notice }: Props) {
  return (
    <div className="map-shell">
      <MapContainer center={KOREA_CENTER} zoom={7} minZoom={6} maxZoom={16} className="map-container">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClusterLayer scored={scored} selectedId={selectedId} phase={phase} onSelect={onSelect} />
      </MapContainer>
      {notice && <div className="map-notice">{notice}</div>}
      <SummaryPanel scored={scored} phase={phase} />
    </div>
  );
}
