import L from "leaflet";
import { LEVELS } from "../domain/constants";
import type { LivePhase, ScoredSite, WarningLevel } from "../types";

export const NO_DATA_COLOR = "#8a8578";

export type MarkerStatus = "skeleton" | "nodata" | "refreshing" | "normal";

export interface MarkerAppearance {
  status: MarkerStatus;
  color: string;
  label: string;
  warningLevel: WarningLevel | null;
  warningText: string;
  // LEVELS 배열 인덱스(0=관심 … 3=심각). 점수가 없는 상태(로딩/데이터 없음)는 -1 — 클러스터 색을 정할 때 쓴다.
  levelRank: number;
}

// 유산 1곳의 마커 상태(로딩 스켈레톤 / 데이터 없음 / 갱신 중 / 정상)와 표시 문구를 정한다.
export function appearanceOf(scored: ScoredSite, phase: LivePhase): MarkerAppearance {
  const { score } = scored;
  let status: MarkerStatus;
  let color: string;
  let label: string;
  let levelRank = -1;

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
    levelRank = LEVELS.findIndex((l) => l.key === score.level.key);
  }

  // 초기 로딩 중에는 score가 없어 특보도 없다. 가장 높은 등급(경보 > 주의보)을 표식에 쓴다.
  const warnings = status === "skeleton" ? [] : score?.warnings ?? [];
  const warningLevel: WarningLevel | null = warnings.length === 0 ? null : warnings.some((w) => w.level === "경보") ? "경보" : "주의보";
  const warningText = warnings.length > 0 ? ` · ${warnings.map((w) => `${w.wrn}${w.level}`).join(", ")}` : "";
  return { status, color, label, warningLevel, warningText, levelRank };
}

// 마커 아이콘은 (상태, 색, 선택 여부, 특보) 조합이 몇 가지뿐이라 캐시해 둔다 — 슬라이더를 움직여도 아이콘 객체를 새로 만들지 않는다.
const iconCache = new Map<string, L.DivIcon>();

export function iconKeyOf(app: MarkerAppearance, selected: boolean): string {
  return `${app.status}|${app.color}|${selected ? 1 : 0}|${app.warningLevel ?? "-"}`;
}

export function iconFor(app: MarkerAppearance, selected: boolean): L.DivIcon {
  const key = iconKeyOf(app, selected);
  let icon = iconCache.get(key);
  if (icon) return icon;

  const size = selected ? 26 : 18;
  const statusClass = app.status === "skeleton" ? "marker-skeleton" : app.status === "refreshing" ? "marker-refreshing" : "";
  const glyph = app.status === "nodata" ? '<span class="marker-glyph">?</span>' : "";
  const selectedRing = selected ? `box-shadow:0 0 0 4px rgba(0,0,0,0.12), 0 0 0 2px ${app.color};` : "";
  // 발효 중 특보가 있으면 마커 우상단에 경고 표식을 단다 (경보=빨강, 주의보=주황).
  const warned = app.warningLevel ? `<span class="marker-warning ${app.warningLevel === "경보" ? "is-alert" : "is-advisory"}">!</span>` : "";
  icon = L.divIcon({
    className: "heritage-marker",
    html: `<span class="heritage-marker-dot ${statusClass}" style="width:${size}px;height:${size}px;background:${app.color};${selectedRing}">${glyph}${warned}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  iconCache.set(key, icon);
  return icon;
}
