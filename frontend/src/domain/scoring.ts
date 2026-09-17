import type { FactorKey, FactorScores, HeritageSite, ScoreResult, WeatherState } from "../types";
import { MATERIAL_WEIGHTS, REGION_MOD, levelFor } from "./constants";

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

// 원본 프로토타입의 scoreSite(): 지역 보정 + 재질별 가중 평균으로 최종 점수 산출.
export function scoreSite(site: HeritageSite, weather: WeatherState): ScoreResult {
  const base = rawScores(weather);
  const mod = REGION_MOD[site.regionTag] ?? {};
  const r: FactorScores = {
    rain: clamp(base.rain + (mod.rain ?? 0), 0, 100),
    wind: clamp(base.wind + (mod.wind ?? 0), 0, 100),
    freeze: clamp(base.freeze + (mod.freeze ?? 0), 0, 100),
    fire: clamp(base.fire + (mod.fire ?? 0), 0, 100),
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

  return { raw: r, total, topFactor, level: levelFor(total) };
}
