import { Router } from "express";
import { getLiveData } from "../liveData";

export const liveRouter = Router();

liveRouter.get("/live", async (_req, res) => {
  const data = await getLiveData();
  res.json(data);
});
