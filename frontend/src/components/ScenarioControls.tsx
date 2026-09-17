import { SCENARIOS, SLIDERS } from "../domain/constants";
import type { WeatherState } from "../types";

interface Props {
  weather: WeatherState;
  scenarioKey: string;
  onScenarioSelect: (scenarioKey: string) => void;
  onWeatherChange: (patch: Partial<WeatherState>) => void;
}

export function ScenarioControls({ weather, scenarioKey, onScenarioSelect, onWeatherChange }: Props) {
  return (
    <section className="control-bar" aria-label="기상 시나리오 설정">
      <h2>오늘의 기상 시나리오</h2>
      <div className="scenario-row" role="group" aria-label="시나리오 프리셋">
        {SCENARIOS.map((sc) => (
          <button
            key={sc.key}
            type="button"
            className="scenario-btn"
            aria-pressed={scenarioKey === sc.key}
            onClick={() => onScenarioSelect(sc.key)}
          >
            {sc.label}
          </button>
        ))}
      </div>

      <h2>세부 조정</h2>
      <div className="sliders">
        {SLIDERS.map((s) => (
          <div className="slider-field" key={s.key}>
            <label htmlFor={`slider-${s.key}`}>
              <span>{s.label}</span>
              <output>{s.display ? s.display(weather[s.key]) : `${weather[s.key]}${s.unit}`}</output>
            </label>
            <input
              id={`slider-${s.key}`}
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={weather[s.key]}
              onChange={(e) => onWeatherChange({ [s.key]: Number(e.target.value) } as Partial<WeatherState>)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
