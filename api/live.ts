import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getLiveData } from "../backend/src/liveData";

// Vercel 서버리스 함수. backend/src/liveData.ts의 오케스트레이션 로직을 그대로 재사용한다
// (로컬 Express 서버의 routes/live.ts와 동일한 함수를 호출 — 로직 중복 없음).
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const data = await getLiveData();
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(data);
  } catch (err) {
    console.error("[api/live] 처리 실패:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "internal_error" });
  }
}
