import { Router } from "express";
import { getLiveData } from "../liveData";

export const liveRouter = Router();

liveRouter.get("/live", async (_req, res) => {
  const { data, cacheControl } = await getLiveData();
  // 로컬에서는 CDN이 없어 실제로 캐시되진 않지만, 배포 환경(api/live.ts)과 같은 헤더를 내려 동작을 눈으로 확인할 수 있게 한다.
  res.set("Cache-Control", cacheControl);
  res.json(data);
});
