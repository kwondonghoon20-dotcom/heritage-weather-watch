// 지형 분류 스크립트들이 공유하는 유틸: 카탈로그 읽기, .env 읽기, 지리 계산, 캐시 파일 입출력.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CATALOG_FILE = path.join(ROOT, "backend/src/data/heritageSites.generated.ts");
export const GEOJSON_FILE = path.join(ROOT, "data/heritage-classified.geojson"); // 커밋되지 않는 로컬 파일 — 면적 등 참고용
export const ELEVATION_CACHE = path.join(HERE, "elevation-cache.json");
export const WATER_CACHE = path.join(HERE, "water-cache.json");

// 생성된 카탈로그(한 줄에 레코드 하나인 JSON)를 읽는다. 배포되는 백엔드가 보는 것과 같은 값이다(불국사 좌표 보정 등 반영).
export function loadCatalog() {
  return fs
    .readFileSync(CATALOG_FILE, "utf8")
    .split(/\r?\n/) // 이 저장소는 체크아웃 시 CRLF 로 바뀔 수 있다(git autocrlf)
    .filter((l) => l.startsWith("{"))
    .map((l) => JSON.parse(l.replace(/,\s*$/, "")));
}

// 루트 .env 에서 키를 읽는다(값은 출력하지 않는다). dotenv 의존성을 두지 않으려고 직접 파싱.
export function readEnv(name) {
  if (process.env[name]) return process.env[name];
  try {
    for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && m[1] === name) return m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env 없음
  }
  return "";
}

// 반경 m(미터)의 정사각형 BOX 반쪽 크기를 도 단위로 (위도·경도 방향 각각)
export function boxHalfDegrees(lat, meters) {
  return { dLat: meters / 110540, dLng: meters / (111320 * Math.cos((lat * Math.PI) / 180)) };
}

// 중심에서 dist(m) 떨어진 방위각 bearing(도) 방향의 지점
export function offsetPoint(lat, lng, dist, bearing) {
  const R = 6371000;
  const rad = Math.PI / 180;
  return {
    lat: lat + (dist * Math.cos(bearing * rad)) / R / rad,
    lng: lng + (dist * Math.sin(bearing * rad)) / (R * Math.cos(lat * rad)) / rad,
  };
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

// 중간에 끊겨도 파일이 깨지지 않게 임시 파일에 쓴 뒤 바꿔치기
export function writeJsonAtomic(file, value) {
  const tmp = file + ".part";
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 표고 표본 배치: 중심 + 반경 500m 8방향 = 9점 (순서: 중심, 북, 북동, 동, 남동, 남, 남서, 서, 북서)
export const RING_METERS = 500;
export const BEARINGS = [0, 45, 90, 135, 180, 225, 270, 315];
export const POINTS_PER_SITE = 1 + BEARINGS.length;
export function samplePoints(lat, lng) {
  return [{ lat, lng }, ...BEARINGS.map((b) => offsetPoint(lat, lng, RING_METERS, b))];
}
