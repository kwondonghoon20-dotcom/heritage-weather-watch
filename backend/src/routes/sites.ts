import { Router } from "express";
import { getSitesJson, SITES_CACHE_CONTROL } from "../sitesData";

export const sitesRouter = Router();

sitesRouter.get("/sites", (_req, res) => {
  res.setHeader("Cache-Control", SITES_CACHE_CONTROL);
  res.type("application/json").send(getSitesJson());
});
