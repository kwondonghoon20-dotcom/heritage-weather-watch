import path from "path";
import dotenv from "dotenv";

// 로컬 개발(Express)에서만 루트 .env를 로드한다. Vercel(process.env.VERCEL === "1")에서는
// 대시보드에서 주입한 환경변수를 그대로 쓰므로 .env 파일을 찾을 필요가 없다 — 애초에 배포물에
// 포함되지도 않는다(.gitignore). env.ts는 항상 다른 모듈보다 먼저 require되므로
// 이 시점 이후에는 process.env가 채워져 있음이 보장된다.
if (!process.env.VERCEL) {
  dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
}

export const ENV = {
  kmaApiKey: process.env.KMA_API_KEY ?? "",
  forestFireApiKey: process.env.FOREST_FIRE_API_KEY ?? "",
  port: Number(process.env.BACKEND_PORT ?? 4000),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
};

if (!ENV.kmaApiKey || !ENV.forestFireApiKey) {
  console.warn("[config] KMA_API_KEY 또는 FOREST_FIRE_API_KEY가 설정되어 있지 않습니다.");
}
