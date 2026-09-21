import { ENV } from "./config/env";
import express from "express";
import cors from "cors";
import { liveRouter } from "./routes/live";
import { sitesRouter } from "./routes/sites";

const app = express();
app.use(cors({ origin: ENV.frontendOrigin }));
app.use("/api", liveRouter);
app.use("/api", sitesRouter);

app.listen(ENV.port, () => {
  console.log(`[backend] listening on http://localhost:${ENV.port}`);
});
