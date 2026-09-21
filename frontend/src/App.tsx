import { useEffect, useMemo, useState } from "react";
import { MapView } from "./components/MapView";
import { SidePanel } from "./components/SidePanel";
import { ScenarioControls } from "./components/ScenarioControls";
import { ModeToggle } from "./components/ModeToggle";
import { LiveStatusBar } from "./components/LiveStatusBar";
import { MaterialFilter } from "./components/MaterialFilter";
import { SCENARIOS } from "./domain/constants";
import { isMaterialFilterValue, type MaterialFilterValue } from "./domain/materialFilter";
import { scoreSite } from "./domain/scoring";
import { useHeritageData } from "./hooks/useHeritageData";
import { resolveLiveSite, useLiveWeather } from "./hooks/useLiveWeather";
import type { LivePhase, MaterialKey, ScoredSite, ViewMode, WeatherState } from "./types";

const STORAGE_KEY = "heritageWeatherMap:v1";

interface PersistedState {
  mode: ViewMode;
  weather: WeatherState;
  scenarioKey: string;
  selectedId: string | null;
  materialFilter: MaterialFilterValue;
}

function loadState(): PersistedState {
  const fallback: PersistedState = {
    mode: "scenario",
    weather: { rain: SCENARIOS[0].rain, wind: SCENARIOS[0].wind, temp: SCENARIOS[0].temp, fireIdx: SCENARIOS[0].fireIdx, humidity: SCENARIOS[0].humidity },
    scenarioKey: SCENARIOS[0].key,
    selectedId: null,
    materialFilter: "all",
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    // 저장된 필터 값이 지금 없는 재질이거나 이상한 값이면 전체로 되돌린다.
    if (saved) return { ...fallback, ...saved, materialFilter: isMaterialFilterValue(saved.materialFilter) ? saved.materialFilter : "all" };
  } catch {
    // 저장된 값이 손상된 경우 기본값 사용
  }
  return fallback;
}

export default function App() {
  const { sites: allSites, status: catalogStatus, retry: retryCatalog } = useHeritageData();
  const [{ mode, weather, scenarioKey, selectedId, materialFilter }, setState] = useState<PersistedState>(loadState);
  const live = useLiveWeather(mode === "live");

  // 시나리오·실시간 모드 모두 같은 유산 목록(카탈로그)을 쓰고, 재질 필터는 두 모드에 똑같이 적용된다.
  const sites = useMemo(() => (materialFilter === "all" ? allSites : allSites.filter((s) => s.material === materialFilter)), [allSites, materialFilter]);
  const materialCounts = useMemo(() => {
    const counts: Partial<Record<MaterialKey, number>> = {};
    for (const s of allSites) counts[s.material] = (counts[s.material] ?? 0) + 1;
    return counts;
  }, [allSites]);

  // 저장돼 있던 선택 유산이 지금 목록에 없으면(예: 예전 id 형식, 재질 필터로 가려짐) 오류 없이 선택을 비운다.
  // 화면 표시와 저장 모두 이 파생값을 쓰므로, 유효하지 않은 id 는 다음 저장 때 자연스럽게 null 로 바뀐다.
  // 목록을 받는 중이거나 받지 못한 상태(loading/error)에서는 판단하지 않아, 일시적인 실패가 저장된 선택을 지우지 않게 한다.
  const validSelectedId = catalogStatus !== "ready" || !selectedId || sites.some((s) => s.id === selectedId) ? selectedId : null;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, weather, scenarioKey, selectedId: validSelectedId, materialFilter }));
    } catch {
      // 저장소를 사용할 수 없는 환경에서는 조용히 무시
    }
  }, [mode, weather, scenarioKey, validSelectedId, materialFilter]);

  const scored: ScoredSite[] = useMemo(() => {
    if (mode === "live") {
      return sites.map((site) => {
        // 날씨는 유산이 속한 격자별, 산불위험·특보는 시군구별로 내려온다. 어느 한쪽이라도 없으면 "데이터 없음".
        const liveWeather = resolveLiveSite(site, live.data);
        return { site, score: liveWeather ? scoreSite(site, liveWeather, liveWeather.warnings) : null };
      });
    }
    return sites.map((site) => ({ site, score: scoreSite(site, weather) }));
  }, [sites, mode, weather, live.data]);

  const selectedScored = scored.find((s) => s.site.id === validSelectedId) ?? null;

  const livePhase: LivePhase = mode === "live" ? (live.loading ? (live.data ? "refreshing" : "initial-loading") : "ready") : "ready";

  // 초기 로딩 중에는 전 유산이 아직 score:null 상태라, 이를 "데이터 없음"으로 잘못 세지 않도록 제외한다.
  const missingCount = mode === "live" && livePhase !== "initial-loading" ? scored.filter((s) => !s.score).length : 0;

  const catalogNotice = catalogStatus === "loading" ? "유산 목록을 불러오는 중…" : catalogStatus === "error" ? "유산 목록을 불러오지 못했습니다." : null;

  function handleModeChange(next: ViewMode) {
    setState((prev) => ({ ...prev, mode: next }));
  }

  function handleScenarioSelect(key: string) {
    const sc = SCENARIOS.find((s) => s.key === key);
    if (!sc) return;
    setState((prev) => ({ ...prev, scenarioKey: key, weather: { rain: sc.rain, wind: sc.wind, temp: sc.temp, fireIdx: sc.fireIdx, humidity: sc.humidity } }));
  }

  function handleWeatherChange(patch: Partial<WeatherState>) {
    setState((prev) => ({ ...prev, scenarioKey: "custom", weather: { ...prev.weather, ...patch } }));
  }

  function handleMaterialFilterChange(next: MaterialFilterValue) {
    setState((prev) => ({ ...prev, materialFilter: next }));
  }

  function handleSelect(id: string) {
    setState((prev) => ({ ...prev, selectedId: id }));
  }

  return (
    <div className="wrap">
      <header className="site-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            🏛
          </span>
          <div>
            <h1>국가유산 기상관측판</h1>
            <p className="brand-sub">비를 맞고 바람을 맞는 유산들의 오늘 — 지도 기반 관측</p>
          </div>
        </div>
        <span className="badge-proto">
          {mode === "live" ? "실시간 관측 · 기상청/국립산림과학원 API" : `시뮬레이션 · 국가지정 야외유산 ${allSites.length.toLocaleString()}건`}
        </span>
      </header>

      <ModeToggle mode={mode} onChange={handleModeChange} />

      {mode === "scenario" ? (
        <ScenarioControls weather={weather} scenarioKey={scenarioKey} onScenarioSelect={handleScenarioSelect} onWeatherChange={handleWeatherChange} />
      ) : (
        <LiveStatusBar
          updatedAt={live.data?.updatedAt ?? null}
          weatherAsOf={live.data?.weatherAsOf ?? null}
          refreshHours={live.data?.refreshHours ?? null}
          pendingGrids={live.data && !live.data.complete ? live.data.pendingGrids : 0}
          loading={live.loading}
          error={live.error}
          missingCount={missingCount}
        />
      )}

      <div className="legend-row">
        <p className="legend-note">경보 4단계 — 관심(파랑) · 주의(노랑) · 경계(주황) · 심각(빨강)</p>
        <MaterialFilter
          value={materialFilter}
          counts={materialCounts}
          total={allSites.length}
          shown={sites.length}
          disabled={catalogStatus !== "ready"}
          onChange={handleMaterialFilterChange}
        />
      </div>

      <div className="layout">
        <MapView scored={scored} selectedId={validSelectedId} phase={livePhase} onSelect={handleSelect} notice={catalogNotice} onRetry={catalogStatus === "error" ? retryCatalog : undefined} />
        <SidePanel scored={selectedScored} phase={livePhase} />
      </div>

      <footer className="site-footer">
        <p>
          시나리오 모드의 위험 점수는 재질별 취약도와 가상 기상값을 곱해 계산한 단순 규칙 기반 지표입니다.
          실시간 모드는 기상청 초단기실황·국립산림과학원 산불위험예보의 실제 관측값을 같은 계산식에 대입합니다.
        </p>
      </footer>
    </div>
  );
}
