import type { IncomingMessage, ServerResponse } from "http";
import { getLiveData } from "../backend/src/liveData";
import { getSitesJson, SITES_CACHE_CONTROL } from "../backend/src/sitesData";

// Vercel 서버리스 함수. services 런타임은 backend 서비스에 진입점(entrypoint) 하나만 두므로, 이 함수가
// /live 와 /sites 를 경로로 나눠 처리한다(rewrite: /api/:path* → 백엔드의 /:path*). 그 외 경로는 기존 동작(=live)을 유지한다.
// backend/src 의 로직을 그대로 재사용한다(로컬 Express 라우트와 동일한 함수 호출 — 로직 중복 없음).
// services 런타임에서는 @vercel/node의 res.status()/res.json() 헬퍼가 자동으로 붙지 않아
// 순수 Node http.ServerResponse API를 직접 쓴다 (2026-09-18 확인: res.status is not a function).
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  if (/\/sites\/?$/.test(pathname)) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", SITES_CACHE_CONTROL);
    res.statusCode = 200;
    res.end(getSitesJson());
    return;
  }
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
