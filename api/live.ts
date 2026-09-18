import type { IncomingMessage, ServerResponse } from "http";
import { getLiveData } from "../backend/src/liveData";

// Vercel 서버리스 함수. backend/src/liveData.ts의 오케스트레이션 로직을 그대로 재사용한다
// (로컬 Express 서버의 routes/live.ts와 동일한 함수를 호출 — 로직 중복 없음).
// services 런타임에서는 @vercel/node의 res.status()/res.json() 헬퍼가 자동으로 붙지 않아
// 순수 Node http.ServerResponse API를 직접 쓴다 (2026-09-18 확인: res.status is not a function).
export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  try {
    const data = await getLiveData();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.statusCode = 200;
    res.end(JSON.stringify(data));
  } catch (err) {
    console.error("[api/live] 처리 실패:", err instanceof Error ? err.message : err);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "internal_error" }));
  }
}
