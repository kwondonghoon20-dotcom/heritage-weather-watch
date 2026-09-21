// site(유적지)·modern(근대건축)은 heritage-classified.geojson 의 _material 값과 같은 키를 쓴다.
export type MaterialKey = "wood" | "stone" | "wall" | "mound" | "dolmen" | "site" | "modern";
export type RegionTag = "mountain" | "coast" | "river" | "urban" | "plain";
// 지형 위치에 따른 강수 피해 취약도: 침수 위험 저지대 / 평지 / 산기슭·구릉 / 능선·고지
export type ElevationProfile = "flood-prone" | "plain" | "hillside" | "ridge";
export type FactorKey = "rain" | "wind" | "freeze" | "fire" | "humidity";
export type LevelKey = "blue" | "yellow" | "orange" | "red";

export interface HeritageSite {
  id: string;
  name: string;
  lat: number;
  lng: number;
  region: string;
  sigungu?: string; // /api/sites 에서 온 시군구명
  sigunguCode?: string; // 시군구 5자리 코드 — 실시간 응답(시군구별)에서 이 유산의 산불위험·특보를 찾는 키
  grid?: string; // 이 유산이 속한 기상청 5km 격자 "nx,ny" — 실시간 응답(격자별)에서 이 유산의 날씨를 찾는 키(/api/sites 가 붙여 준다)
  regionTag: RegionTag;
  elevationProfile: ElevationProfile;
  era?: string; // 선택: 없으면 UI에서 해당 항목을 그리지 않는다
  material: MaterialKey;
  heritageType: string;
  desc?: string; // 선택: 없으면 UI에서 설명 줄을 그리지 않는다
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

// 격자(5km) 단위 날씨. 산불위험·특보는 시군구 단위로만 값이 나오므로 따로 내려온다(합치는 곳: hooks/useLiveWeather.ts 의 resolveLiveSite).
export type LiveGridWeather = Omit<WeatherState, "fireIdx">;

export interface LiveRegionData {
  fireIdx: number;
  warnings: ActiveWarning[];
}

export interface LiveApiResponse {
  updatedAt: string;
  // 응답에 쓰인 격자 값 중 가장 오래전에 조회한 시각. 캐시 때문에 updatedAt 보다 몇 시간 앞설 수 있다.
  weatherAsOf: string | null;
  refreshHours: number; // 격자 날씨를 다시 조회하는 주기(시간)
  // false 면 서버가 이번 구간 값을 아직 다 채우지 못한 것 — 못 채운 격자는 직전 값이거나 null 이고, 곧 다시 요청하면 더 채워진다.
  complete: boolean;
  pendingGrids: number;
  // 키는 유산의 grid("nx,ny"). 같은 격자의 유산들이 값을 공유한다. null이면 그 격자는 "데이터 없음".
  grids: Record<string, LiveGridWeather | null>;
  // 키는 시군구 5자리 코드(유산의 sigunguCode). null이면 그 시군구는 산불위험 데이터가 없다.
  regions: Record<string, LiveRegionData | null>;
}
