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

// 양의 정수 환경변수를 읽는다. 비었거나 형식이 틀리면 기본값을 쓰고 경고한다(잘못된 값으로 조용히 호출량이 폭증하는 것을 막는다).
function intEnv(name: string, fallback: number, { min, max }: { min: number; max: number }): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    console.warn(`[config] ${name}="${raw}" 는 ${min}~${max} 사이 정수여야 합니다 — 기본값 ${fallback}을 씁니다.`);
    return fallback;
  }
  return n;
}

export const ENV = {
  kmaApiKey: process.env.KMA_API_KEY ?? "",
  // 기상청 초단기실황(data.go.kr) 일일 호출 한도는 10,000건. 이 프로세스가 하루에 쓸 수 있는 호출 수의 상한(여유를 두고 8,000).
  // 741격자를 3시간마다 갱신하면 하루 5,928건이다. 인스턴스가 여러 개면 인스턴스마다 따로 센다 — 어디까지나 폭주 방지용 안전장치다.
  kmaDailyCallLimit: intEnv("KMA_DAILY_CALL_LIMIT", 8000, { min: 1, max: 1_000_000 }),
  // 격자 날씨를 다시 조회하는 주기(시간). 시계 기준 구간(KST 0시부터 N시간 단위)으로 나눠 구간마다 격자당 최대 1번만 조회한다.
  // 하루 호출량 = 격자 수 × (24 ÷ N). 24의 약수(1,2,3,4,6,8,12,24)를 쓰면 구간이 하루에 딱 맞아떨어진다.
  kmaCacheHours: intEnv("KMA_CACHE_HOURS", 3, { min: 1, max: 24 }),
  // /api/live 한 번의 응답에서 기상청 격자 조회에 쓸 수 있는 시간(ms). 넘으면 못 채운 격자는 직전 값(없으면 "값 없음")으로 응답하고
  // 다음 요청이 이어서 채운다. 서버리스 함수 제한 시간(10초)을 넘기지 않으려는 장치. 0이면 제한 없음(전부 기다린다).
  kmaLiveDeadlineMs: intEnv("KMA_LIVE_DEADLINE_MS", 7000, { min: 0, max: 600_000 }),
  // 개발 서버(tsx watch)는 파일을 저장할 때마다 재시작해 메모리 캐시와 호출 카운터가 사라진다 — 그때마다 741건이 다시 나가지 않도록
  // 격자 캐시와 오늘 호출 수를 .cache/ 파일에 저장한다. Vercel(파일시스템이 인스턴스별·임시)에서는 끄고, KMA_DISK_CACHE=0 으로도 끌 수 있다.
  kmaDiskCache: !process.env.VERCEL && process.env.KMA_DISK_CACHE !== "0",
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
