import { MapContainer, TileLayer } from "react-leaflet";
import type { LivePhase, ScoredSite } from "../types";
import { HeritageMarker } from "./HeritageMarker";
import { SummaryPanel } from "./SummaryPanel";

const KOREA_CENTER: [number, number] = [36.2, 127.8];

interface Props {
  scored: ScoredSite[];
  selectedId: string | null;
  phase: LivePhase;
  onSelect: (id: string) => void;
}

export function MapView({ scored, selectedId, phase, onSelect }: Props) {
  return (
    <div className="map-shell">
      <MapContainer center={KOREA_CENTER} zoom={7} minZoom={6} maxZoom={14} className="map-container">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {scored.map((s) => (
          <HeritageMarker key={s.site.id} scored={s} selected={s.site.id === selectedId} phase={phase} onSelect={onSelect} />
        ))}
      </MapContainer>
      <SummaryPanel scored={scored} phase={phase} />
    </div>
  );
}
