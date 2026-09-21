const DEGRAD = Math.PI / 180.0;
const RE = 6371.00877; // 지구 반경(km)
const GRID = 5.0; // 격자 간격(km)
const SLAT1 = 30.0;
const SLAT2 = 60.0; // 표준위도 1, 2
const OLON = 126.0;
const OLAT = 38.0; // 기준점 경도, 위도
const XO = 43;
const YO = 136; // 기준점 X, Y 격자

export interface GridPoint {
  nx: number;
  ny: number;
}

// 격자 캐시·응답에서 쓰는 문자열 키 "nx,ny"
export function gridKey(grid: GridPoint): string {
  return `${grid.nx},${grid.ny}`;
}

// 기상청 공식 LCC(Lambert Conformal Conic) 위경도→격자 변환식.
// 검증: 서울시청(37.5665, 126.9780) → (60, 127) — 기상청이 공개한 예시값과 일치.
export function latLonToGrid(lat: number, lon: number): GridPoint {
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + (lat * DEGRAD) * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}
