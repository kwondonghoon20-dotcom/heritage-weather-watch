import { useEffect, useMemo, useState } from "react";
import { MapView } from "./components/MapView";
import { SidePanel } from "./components/SidePanel";
import { ScenarioControls } from "./components/ScenarioControls";
import { ModeToggle } from "./components/ModeToggle";
import { LiveStatusBar } from "./components/LiveStatusBar";
import { SCENARIOS } from "./domain/constants";
import { scoreSite } from "./domain/scoring";
import { useHeritageData } from "./hooks/useHeritageData";
import { useLiveWeather } from "./hooks/useLiveWeather";
import type { LivePhase, ScoredSite, ViewMode, WeatherState } from "./types";

const STORAGE_KEY = "heritageWeatherMap:v1";

interface PersistedState {
  mode: ViewMode;
  weather: WeatherState;
  scenarioKey: string;
  selectedId: string | null;
}

function loadState(): PersistedState {
  const fallback: PersistedState = {
    mode: "scenario",
    weather: { rain: SCENARIOS[0].rain, wind: SCENARIOS[0].wind, temp: SCENARIOS[0].temp, fireIdx: SCENARIOS[0].fireIdx, humidity: SCENARIOS[0].humidity },
    scenarioKey: SCENARIOS[0].key,
    selectedId: null,
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (saved) return { ...fallback, ...saved };
  } catch {
    // 저장된 값이 손상된 경우 기본값 사용
  }
  return fallback;
}

export default function App() {
  const { sites } = useHeritageData();
  const [{ mode, weather, scenarioKey, selectedId }, setState] = useState<PersistedState>(loadState);
  const live = useLiveWeather(mode === "live");

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, weather, scenarioKey, selectedId }));
    } catch {
      // 저장소를 사용할 수 없는 환경에서는 조용히 무시
    }
  }, [mode, weather, scenarioKey, selectedId]);

  const scored: ScoredSite[] = useMemo(() => {
    if (mode === "live") {
      return sites.map((site) => {
        const liveWeather = live.data?.sites[site.id] ?? null;
        return { site, score: liveWeather ? scoreSite(site, liveWeather, liveWeather.warnings ?? []) : null };
      });
    }
    return sites.map((site) => ({ site, score: scoreSite(site, weather) }));
  }, [sites, mode, weather, live.data]);

  const selectedScored = scored.find((s) => s.site.id === selectedId) ?? null;

  const livePhase: LivePhase = mode === "live" ? (live.loading ? (live.data ? "refreshing" : "initial-loading") : "ready") : "ready";

  // 초기 로딩 중에는 전 유산이 아직 score:null 상태라, 이를 "데이터 없음"으로 잘못 세지 않도록 제외한다.
  const missingCount = mode === "live" && livePhase !== "initial-loading" ? scored.filter((s) => !s.score).length : 0;

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
        <span className="badge-proto">{mode === "live" ? "실시간 관측 · 기상청/국립산림과학원 API" : "프로토타입 · mock 데이터로 시뮬레이션"}</span>
      </header>

      <ModeToggle mode={mode} onChange={handleModeChange} />

      {mode === "scenario" ? (
        <ScenarioControls weather={weather} scenarioKey={scenarioKey} onScenarioSelect={handleScenarioSelect} onWeatherChange={handleWeatherChange} />
      ) : (
        <LiveStatusBar updatedAt={live.data?.updatedAt ?? null} loading={live.loading} error={live.error} missingCount={missingCount} />
      )}

      <p className="legend-note">경보 4단계 — 관심(파랑) · 주의(노랑) · 경계(주황) · 심각(빨강)</p>

      <div className="layout">
        <MapView scored={scored} selectedId={selectedId} phase={livePhase} onSelect={handleSelect} />
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
