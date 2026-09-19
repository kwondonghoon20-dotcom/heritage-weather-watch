import type { ActiveWarning, FactorKey, FactorScores, HeritageSite, ScoreResult, WeatherState } from "../types";
import { ELEVATION_RAIN_MULTIPLIER, MATERIAL_WEIGHTS, REGION_MOD, WARNING_BOOST, WRN_TO_FACTOR, levelFor } from "./constants";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

// 원본 프로토타입의 rawScores(): 슬라이더 원시값을 0~100 위험 점수로 정규화.
export function rawScores(weather: WeatherState): FactorScores {
  return {
    rain: clamp(weather.rain / 2.2, 0, 100),
    wind: clamp(((weather.wind - 3) / 27) * 100, 0, 100),
    freeze: clamp(100 - Math.abs(weather.temp) * 6, 0, 100),
    fire: clamp(((weather.fireIdx - 1) / 3) * 100, 0, 100),
    humidity: clamp(((weather.humidity - 35) / 55) * 100, 0, 100),
  };
}

// 발효 중 특보를 요인별 가산치로 변환한다. 같은 요인에 여러 특보가 걸리면(예: 강풍경보+태풍경보 → wind)
// 합산하지 않고 그중 최댓값 하나만 쓴다.
function warningBoosts(warnings: ActiveWarning[]): Partial<Record<FactorKey, number>> {
  const boosts: Partial<Record<FactorKey, number>> = {};
  for (const w of warnings) {
    const factor = WRN_TO_FACTOR[w.wrn];
    if (!factor) continue;
    boosts[factor] = Math.max(boosts[factor] ?? 0, WARNING_BOOST[w.level]);
  }
  return boosts;
}

// 원본 프로토타입의 scoreSite(): 지역 보정 + 재질별 가중 평균으로 최종 점수 산출.
// activeWarnings(실시간 모드에서만 전달)는 해당 요인의 raw 점수에 가산될 뿐, 생략하면 기존 수식과 완전히 동일하다.
export function scoreSite(site: HeritageSite, weather: WeatherState, activeWarnings: ActiveWarning[] = []): ScoreResult {
  const base = rawScores(weather);
  const mod = REGION_MOD[site.regionTag] ?? {};
  const boost = warningBoosts(activeWarnings);
  // 지형 배율은 날씨에서 나온 강수 raw 점수에만 곱한다. 지역 보정과 특보 가산은 배율 뒤에 더해져
  // 능선이라도 기상청 특보의 가산치가 깎이지 않는다. 최종 clamp는 아래에서 한 번만 한다.
  const rainScaled = base.rain * ELEVATION_RAIN_MULTIPLIER[site.elevationProfile];
  const r: FactorScores = {
    rain: clamp(rainScaled + (mod.rain ?? 0) + (boost.rain ?? 0), 0, 100),
    wind: clamp(base.wind + (mod.wind ?? 0) + (boost.wind ?? 0), 0, 100),
    freeze: clamp(base.freeze + (mod.freeze ?? 0) + (boost.freeze ?? 0), 0, 100),
    fire: clamp(base.fire + (mod.fire ?? 0) + (boost.fire ?? 0), 0, 100),
    humidity: clamp(base.humidity + (mod.humidity ?? 0), 0, 100),
  };

  const w = MATERIAL_WEIGHTS[site.material];
  const sumW = w.rain + w.wind + w.freeze + w.fire + w.humidity;
  const total = (r.rain * w.rain + r.wind * w.wind + r.freeze * w.freeze + r.fire * w.fire + r.humidity * w.humidity) / sumW;

  const contrib: FactorScores = {
    rain: r.rain * w.rain,
    wind: r.wind * w.wind,
    freeze: r.freeze * w.freeze,
    fire: r.fire * w.fire,
    humidity: r.humidity * w.humidity,
  };
  let topFactor: FactorKey = "rain";
  let topVal = -1;
  (Object.keys(contrib) as FactorKey[]).forEach((k) => {
    if (contrib[k] > topVal) {
      topVal = contrib[k];
      topFactor = k;
    }
  });

  return { raw: r, total, topFactor, level: levelFor(total), warnings: activeWarnings };
}
