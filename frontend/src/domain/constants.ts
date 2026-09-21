import type { ElevationProfile, FactorKey, Level, MaterialKey, ScenarioPreset } from "../types";

// 원본 프로토타입(legacy/heritage-weather-watch.html)의 계산 로직을 그대로 이식.
export const MATERIAL_LABEL: Record<MaterialKey, string> = {
  wood: "목조",
  stone: "석조",
  wall: "성곽",
  mound: "봉분(흙)",
  dolmen: "고인돌",
  site: "유적지",
  modern: "근대건축",
};

export const MATERIAL_WEIGHTS: Record<MaterialKey, Record<FactorKey, number>> = {
  wood: { rain: 0.7, wind: 0.55, freeze: 0.15, fire: 0.9, humidity: 0.85 },
  stone: { rain: 0.25, wind: 0.15, freeze: 0.8, fire: 0.05, humidity: 0.15 },
  wall: { rain: 0.75, wind: 0.25, freeze: 0.55, fire: 0.05, humidity: 0.2 },
  mound: { rain: 0.9, wind: 0.2, freeze: 0.4, fire: 0.1, humidity: 0.35 },
  dolmen: { rain: 0.25, wind: 0.1, freeze: 0.8, fire: 0.05, humidity: 0.1 },
  // 유적지: 서 있는 구조물이 없는 터·유구 — 강우 침식에 가장 민감. 근대건축: 벽돌·조적·콘크리트 건물. (초기값, 추후 조정 대상)
  site: { rain: 0.85, wind: 0.05, freeze: 0.45, fire: 0.05, humidity: 0.25 },
  modern: { rain: 0.4, wind: 0.3, freeze: 0.5, fire: 0.2, humidity: 0.3 },
};

export const REGION_MOD: Record<string, Partial<Record<FactorKey, number>>> = {
  mountain: { fire: 10, freeze: 5 },
  coast: { wind: 10 },
  river: { rain: 8 },
  urban: { fire: -5 },
  plain: {},
};

// 지형 위치별 강수 raw 점수 배율. 같은 강수량이어도 저지대는 침수·유실 위험이 크고 능선은 물이 빠져 작다.
export const ELEVATION_RAIN_MULTIPLIER: Record<ElevationProfile, number> = {
  "flood-prone": 1.2,
  plain: 1.0,
  hillside: 0.7,
  ridge: 0.5,
};

export const LEVELS: Level[] = [
  { key: "blue", label: "관심", min: 0, color: "#1D4E89", tint: "rgba(29,78,137,0.13)" },
  { key: "yellow", label: "주의", min: 25, color: "#A9791C", tint: "rgba(169,121,28,0.16)" },
  { key: "orange", label: "경계", min: 50, color: "#BD5A26", tint: "rgba(189,90,38,0.16)" },
  { key: "red", label: "심각", min: 75, color: "#A8332A", tint: "rgba(168,51,42,0.15)" },
];

export function levelFor(score: number): Level {
  let found = LEVELS[0];
  for (const lv of LEVELS) {
    if (score >= lv.min) found = lv;
  }
  return found;
}

export const SCENARIOS: ScenarioPreset[] = [
  { key: "normal", label: "평상시", rain: 5, wind: 6, temp: 16, fireIdx: 1, humidity: 55 },
  { key: "monsoon", label: "장마 · 집중호우", rain: 180, wind: 12, temp: 23, fireIdx: 1, humidity: 88 },
  { key: "heat", label: "한여름 폭염", rain: 0, wind: 4, temp: 34, fireIdx: 2, humidity: 32 },
  { key: "freeze", label: "한파 · 결빙", rain: 3, wind: 9, temp: -1, fireIdx: 1, humidity: 42 },
  { key: "typhoon", label: "태풍 · 강풍", rain: 140, wind: 29, temp: 24, fireIdx: 1, humidity: 82 },
  { key: "wildfire", label: "대형 산불 경보", rain: 0, wind: 13, temp: 19, fireIdx: 4, humidity: 18 },
];

export interface SliderConfig {
  key: keyof ScenarioPreset & ("rain" | "wind" | "temp" | "fireIdx" | "humidity");
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  display?: (v: number) => string;
}

export const SLIDERS: SliderConfig[] = [
  { key: "rain", label: "24시간 누적 강수량", min: 0, max: 250, step: 5, unit: "mm" },
  { key: "wind", label: "순간최대풍속", min: 0, max: 40, step: 1, unit: "m/s" },
  { key: "temp", label: "일 최저기온", min: -20, max: 40, step: 1, unit: "℃" },
  {
    key: "fireIdx",
    label: "산불위험지수",
    min: 1,
    max: 4,
    step: 1,
    unit: "",
    display: (v) => ["낮음", "보통", "높음", "매우높음"][v - 1],
  },
  { key: "humidity", label: "평균 상대습도", min: 10, max: 100, step: 1, unit: "%" },
];

// 기상특보 → 위험요인 매핑. 여기에 없는 특보(안개/황사/지진해일/폭풍해일/열대야 등)는 점수에 반영하지 않는다.
export const WRN_TO_FACTOR: Record<string, FactorKey> = {
  호우: "rain",
  대설: "rain",
  강풍: "wind",
  태풍: "wind",
  풍랑: "wind",
  한파: "freeze",
  폭염: "fire",
  건조: "fire",
};

// 요인 raw 점수(0~100)에 더하는 가산치. 같은 요인에 여러 특보가 걸리면 합산하지 않고 최댓값 하나만 적용한다.
export const WARNING_BOOST = { 주의보: 15, 경보: 30 } as const;

export const FACTOR_LABEL: Record<FactorKey, string> = {
  rain: "강수",
  wind: "바람",
  freeze: "동결 · 융해",
  fire: "산불",
  humidity: "습도",
};
