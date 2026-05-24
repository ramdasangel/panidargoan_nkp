import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { cacheStatus } from "./cache.js";
import { authRouter } from "./routes/auth.js";
import { adminRouter } from "./routes/admin.js";
import { boundariesRouter } from "./routes/boundaries.js";
import { watershedsRouter } from "./routes/watersheds.js";
import { waterSourcesRouter } from "./routes/waterSources.js";
import { projectsRouter } from "./routes/projects.js";
import { reportsRouter } from "./routes/reports.js";

const app = express();

app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, authMode: config.authMode, cache: cacheStatus() }));

app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/boundaries", boundariesRouter);
app.use("/api/watersheds", watershedsRouter);
app.use("/api/water-sources", waterSourcesRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/reports", reportsRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port} (authMode=${config.authMode})`);
});
