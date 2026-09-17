import { ENV } from "./config/env";
import express from "express";
import cors from "cors";
import { liveRouter } from "./routes/live";

const app = express();
app.use(cors({ origin: ENV.frontendOrigin }));
app.use("/api", liveRouter);

app.listen(ENV.port, () => {
  console.log(`[backend] listening on http://localhost:${ENV.port}`);
});
