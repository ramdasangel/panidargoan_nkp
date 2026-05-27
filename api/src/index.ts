import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { cacheStatus } from "./cache.js";
import { authRouter } from "./routes/auth.js";
import { adminRouter } from "./routes/admin.js";
import { boundariesRouter } from "./routes/boundaries.js";
import { watershedsRouter } from "./routes/watersheds.js";
import { waterSourcesRouter } from "./routes/waterSources.js";
import { waterSourceLogsRouter } from "./routes/waterSourceLogs.js";
import { attachmentsRouter } from "./routes/attachments.js";
import { uploadsRouter } from "./routes/uploads.js";
import { ensureBucket } from "./storage.js";
import { projectsRouter } from "./routes/projects.js";
import { reportsRouter } from "./routes/reports.js";
import { searchRouter } from "./routes/search.js";
import { usersRouter } from "./routes/users.js";

const app = express();

app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, authMode: config.authMode, cache: cacheStatus() }));

app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/boundaries", boundariesRouter);
app.use("/api/watersheds", watershedsRouter);
app.use("/api/water-sources", waterSourcesRouter);
app.use("/api/water-sources/:waterSourceId/logs", waterSourceLogsRouter);
app.use("/api/water-sources/:waterSourceId/logs/:logId/attachments", attachmentsRouter);

// Stream files from MinIO. URL format: /api/uploads/logs/<logId>/<filename>
app.use("/api/uploads", uploadsRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/search", searchRouter);
app.use("/api/users", usersRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

// Best-effort bucket init — doesn't block server start.
ensureBucket().catch((e) => console.warn("[storage] bucket init failed:", e));

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port} (authMode=${config.authMode})`);
});
