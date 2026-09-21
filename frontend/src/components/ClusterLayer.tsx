import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "./leafletGlobal"; // leaflet.markercluster 보다 먼저 평가되어야 한다(전역 L 설정)
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import { LEVELS } from "../domain/constants";
import type { LivePhase, ScoredSite } from "../types";
import { appearanceOf, iconFor, iconKeyOf, NO_DATA_COLOR, type MarkerAppearance } from "./markerAppearance";

interface Props {
  scored: ScoredSite[];
  selectedId: string | null;
  phase: LivePhase;
  onSelect: (id: string) => void;
}

interface MarkerData {
  name: string;
  app: MarkerAppearance;
  iconKey: string;
}

// 마커별 최신 상태. 클러스터 아이콘 계산과 툴팁이 여기서 읽는다.
const dataOf = new WeakMap<L.Marker, MarkerData>();

// 수천 곳을 개별 React 컴포넌트로 그리면 슬라이더를 움직일 때마다 전부 다시 그려져 무겁다.
// 그래서 마커는 한 번만 만들어 두고(Leaflet 객체), 점수가 바뀌면 아이콘만 필요한 것만 교체한다.
// 클러스터링(leaflet.markercluster)은 화면에 보이는 것만 실제 DOM으로 그리므로 줌/이동에도 가볍다.
// getAllChildMarkers() 는 호출할 때마다 하위 마커 배열을 새로 만들어 붙이므로(클러스터 수 × 마커 수), 슬라이더를 움직일 때마다
// 그 비용이 그대로 든다. 대신 클러스터 내부 구조(_markers/_childClusters)를 직접 훑어 가장 높은 경보 단계만 구한다.
interface ClusterInternals {
  _markers: L.Marker[];
  _childClusters: ClusterInternals[];
}
function worstRankOf(c: ClusterInternals): number {
  let worst = -1;
  for (const m of c._markers) {
    const r = dataOf.get(m)?.app.levelRank ?? -1;
    if (r > worst) worst = r;
  }
  for (const child of c._childClusters) {
    const r = worstRankOf(child);
    if (r > worst) worst = r;
  }
  return worst;
}

function clusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const worst = worstRankOf(cluster as unknown as ClusterInternals);
  const n = cluster.getChildCount();
  const color = worst >= 0 ? LEVELS[worst].color : NO_DATA_COLOR; // 묶음 안 가장 높은 경보 단계의 색
  const size = n < 10 ? 34 : n < 100 ? 40 : 48;
  return L.divIcon({
    className: "heritage-cluster",
    html: `<span class="heritage-cluster-dot" style="width:${size}px;height:${size}px;background:${color}">${n}</span>`,
    iconSize: [size, size],
  });
}

export function ClusterLayer({ scored, selectedId, phase, onSelect }: Props) {
  const map = useMap();
  const groupRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersRef = useRef(new Map<string, L.Marker>()); // 만들어 둔 모든 마커(id → 마커)
  const membersRef = useRef(new Set<string>()); // 지금 클러스터 그룹에 들어 있는 id
  const revealedIdRef = useRef<string | null>(null); // 이미 화면에 보이도록 이동시킨 선택 id (같은 선택을 반복해서 확대하지 않기 위함)
  const revealRef = useRef<() => void>(() => {}); // 최신 선택 상태로 "선택 마커 보이게 하기"를 실행하는 함수
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect; // 마커 클릭 핸들러는 항상 최신 onSelect 를 부른다
  });

  useEffect(() => {
    const group = L.markerClusterGroup({
      chunkedLoading: true, // 처음 수천 개를 넣을 때 화면이 멈추지 않도록 나눠서 추가
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true, // 같은 자리에 겹친 유산은 최대 확대 시 부채꼴로 펼친다
      iconCreateFunction: clusterIcon,
      // 마커를 나눠서 넣는 중에는 아직 지도에 그려지기 전이라, 마지막 조각이 끝난 직후(다음 틱)에 선택 마커를 보여준다
      chunkProgress: (processed, total) => {
        if (processed >= total) setTimeout(() => revealRef.current(), 0);
      },
    });
    map.addLayer(group);
    groupRef.current = group;
    const markers = markersRef.current;
    const members = membersRef.current;
    return () => {
      map.removeLayer(group);
      groupRef.current = null;
      markers.clear();
      members.clear();
      revealedIdRef.current = null; // 그룹이 새로 만들어지면(개발 모드 StrictMode 재마운트 포함) 선택 마커를 다시 보여줘야 한다
    };
  }, [map]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const markers = markersRef.current;
    const members = membersRef.current;

    // 1) 표시 대상에서 빠진 유산은 그룹에서 제거 (예: 실시간 모드는 일부만 표시)
    const nextIds = new Set(scored.map((s) => s.site.id));
    const toRemove: L.Marker[] = [];
    members.forEach((id) => {
      if (!nextIds.has(id)) {
        const m = markers.get(id);
        if (m) toRemove.push(m);
        members.delete(id);
      }
    });
    if (toRemove.length) group.removeLayers(toRemove);

    // 2) 새로 표시할 유산의 마커를 (없으면) 만들고, 점수·선택 상태가 바뀐 마커만 아이콘을 교체한다(아이콘은 캐시된 객체 재사용)
    const toAdd: L.Marker[] = [];
    const rankChanged: L.Marker[] = []; // 경보 단계가 바뀐 마커 — 이 마커가 속한 클러스터만 다시 계산하면 된다
    for (const s of scored) {
      const app = appearanceOf(s, phase);
      const selected = s.site.id === selectedId;
      let marker = markers.get(s.site.id);
      if (!marker) {
        const id = s.site.id;
        marker = L.marker([s.site.lat, s.site.lng], { icon: iconFor(app, selected) });
        marker.on("click", () => onSelectRef.current(id));
        marker.bindTooltip(
          (layer) => {
            const d = dataOf.get(layer as L.Marker);
            return d ? `${d.name} · ${d.app.label}${d.app.warningText}` : "";
          },
          { direction: "top", offset: [0, -10] },
        );
        markers.set(id, marker);
      }
      const key = iconKeyOf(app, selected);
      const prev = dataOf.get(marker);
      if (prev && prev.iconKey !== key) marker.setIcon(iconFor(app, selected));
      if (prev && prev.app.levelRank !== app.levelRank && members.has(s.site.id)) rankChanged.push(marker);
      dataOf.set(marker, { name: s.site.name, app, iconKey: key });
      if (!members.has(s.site.id)) {
        members.add(s.site.id);
        toAdd.push(marker);
      }
    }

    // 선택된 유산의 마커가 클러스터에 가려져 있거나 화면 밖이면, 보일 때까지 지도를 확대/이동한다.
    // 이미 화면에 보이면 아무것도 하지 않는다(leaflet.markercluster 의 zoomToShowLayer 가 그렇게 동작).
    // 선택이 바뀔 때만 실행하므로 슬라이더로 점수가 바뀌는 동안에는 지도를 건드리지 않는다.
    revealRef.current = () => {
      if (!selectedId) {
        revealedIdRef.current = null;
        return;
      }
      if (revealedIdRef.current === selectedId) return;
      const marker = markers.get(selectedId);
      const g = groupRef.current;
      if (!g || !marker || !members.has(selectedId) || !g.hasLayer(marker)) return; // 아직 그룹에 안 들어감 — 다음 기회(chunkProgress/갱신)에 다시 시도
      revealedIdRef.current = selectedId;
      g.zoomToShowLayer(marker);
    };

    if (toAdd.length) group.addLayers(toAdd);
    if (rankChanged.length) group.refreshClusters(rankChanged); // 바뀐 마커가 속한 클러스터의 색만 다시 계산
    revealRef.current();
  }, [scored, selectedId, phase]);

  return null;
}
