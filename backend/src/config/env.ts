import path from "path";

// 로컬 개발(Express)에서만 루트 .env를 로드한다. Vercel(process.env.VERCEL === "1")에서는
// 대시보드에서 주입한 환경변수를 그대로 쓰므로 .env 파일을 찾을 필요가 없다 — 애초에 배포물에
// 포함되지도 않는다(.gitignore). dotenv는 정적으로 import하지 않고 이 블록 안에서만 동적으로
// require한다: Vercel의 Express 번들링 과정에서 정적 import된 dotenv가 최종 함수 번들에서
// 누락되어 "Cannot find module 'dotenv'"로 배포가 죽는 문제가 있었다(2026-09-18 확인).
// try/catch까지 둬서 혹시 모듈을 못 찾아도 로컬 편의 기능 하나만 조용히 꺼지고 서버는 죽지 않는다.
// env.ts는 항상 다른 모듈보다 먼저 require되므로 이 시점 이후에는 process.env가 채워져 있음이 보장된다.
if (!process.env.VERCEL) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const dotenv = require("dotenv");
    dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
  } catch (err) {
    console.warn("[config] dotenv 로드 실패 — 로컬 .env 없이 계속 진행합니다:", err instanceof Error ? err.message : err);
  }
}

export const ENV = {
  kmaApiKey: process.env.KMA_API_KEY ?? "",
  // 기상청 초단기실황(data.go.kr) 일일 호출 한도는 10,000건. 이 프로세스가 하루에 쓸 수 있는 호출 수의 상한(여유를 두고 9,000).
  // 인스턴스가 여러 개면 인스턴스마다 따로 센다 — 어디까지나 폭주 방지용 안전장치다.
  kmaDailyCallLimit: Number(process.env.KMA_DAILY_CALL_LIMIT ?? 9000),
  forestFireApiKey: process.env.FOREST_FIRE_API_KEY ?? "",
  // apihub.kma.go.kr 자체 인증키 (data.go.kr 공용키인 KMA_API_KEY와 다른 키 체계)
  kmaHubApiKey: process.env.KMA_HUB_API_KEY ?? "",
  // Vercel이 서비스에 주입하는 표준 PORT를 최우선으로 쓰고, 로컬 개발에서는 BACKEND_PORT,
  // 둘 다 없으면 4000으로 폴백한다.
  port: Number(process.env.PORT ?? process.env.BACKEND_PORT ?? 4000),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
};

if (!ENV.kmaApiKey || !ENV.forestFireApiKey) {
  console.warn("[config] KMA_API_KEY 또는 FOREST_FIRE_API_KEY가 설정되어 있지 않습니다.");
}
