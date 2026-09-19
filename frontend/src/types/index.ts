export type MaterialKey = "wood" | "stone" | "wall" | "mound" | "dolmen";
export type RegionTag = "mountain" | "coast" | "river" | "urban" | "plain";
export type FactorKey = "rain" | "wind" | "freeze" | "fire" | "humidity";
export type LevelKey = "blue" | "yellow" | "orange" | "red";

export interface HeritageSite {
  id: string;
  name: string;
  lat: number;
  lng: number;
  region: string;
  regionTag: RegionTag;
  era: string;
  material: MaterialKey;
  heritageType: string;
  desc: string;
}

export interface WeatherState {
  rain: number;
  wind: number;
  temp: number;
  fireIdx: number;
  humidity: number;
}

export interface ScenarioPreset extends WeatherState {
  key: string;
  label: string;
}

export interface Level {
  key: LevelKey;
  label: string;
  min: number;
  color: string;
  tint: string;
}

export type FactorScores = Record<FactorKey, number>;

export type WarningLevel = "주의보" | "경보";

// 기상청 특보. wrn은 특보종류를 한글 그대로(호우/강풍/한파/폭염/대설/태풍/건조 등) 담는다.
export interface ActiveWarning {
  wrn: string;
  level: WarningLevel;
}

export interface ScoreResult {
  raw: FactorScores;
  total: number;
  topFactor: FactorKey;
  level: Level;
  // 점수 계산에 반영된 발효 중 특보 (시나리오 모드/특보 없음이면 빈 배열)
  warnings: ActiveWarning[];
}

export interface ScoredSite {
  site: HeritageSite;
  // 실시간 모드에서 해당 유산의 기상/산불 데이터를 가져오지 못하면 null ("데이터 없음").
  score: ScoreResult | null;
}

export type ViewMode = "scenario" | "live";

// initial-loading: 최초 데이터가 아예 없는 상태(스켈레톤) · refreshing: 기존 데이터 유지한 채 갱신 중(펄스)
// · ready: 갱신 완료(개별 유산 실패는 score:null로 별도 표시)
export type LivePhase = "initial-loading" | "refreshing" | "ready";

export interface LiveSiteData extends WeatherState {
  warnings: ActiveWarning[];
}

export interface LiveApiResponse {
  updatedAt: string;
  sites: Record<string, LiveSiteData | null>;
}
