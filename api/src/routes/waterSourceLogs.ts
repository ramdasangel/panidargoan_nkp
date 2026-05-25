import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const waterSourceLogsRouter = Router({ mergeParams: true });
waterSourceLogsRouter.use(requireAuth);

waterSourceLogsRouter.get("/", async (req, res) => {
  const waterSourceId = (req.params as { waterSourceId: string }).waterSourceId;
  const logs = await prisma.waterSourceLog.findMany({
    where: { waterSourceId },
    orderBy: { loggedAt: "desc" },
    take: 200,
    include: {
      loggedBy:    { select: { id: true, email: true, name: true } },
      attachments: { select: { id: true, url: true, filename: true, mimeType: true, sizeBytes: true, createdAt: true } },
    },
  });
  res.json(logs);
});

const logSchema = z.object({
  loggedAt: z.string().datetime().optional(),
  flowM3PerDay: z.number().nonnegative().nullable().optional(),
  waterLevelCm: z.number().nullable().optional(),
  phLevel: z.number().min(0).max(14).nullable().optional(),
  tdsPpm: z.number().nonnegative().nullable().optional(),
  turbidityNtu: z.number().nonnegative().nullable().optional(),
  temperatureC: z.number().nullable().optional(),
  condition: z.string().max(80).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

waterSourceLogsRouter.post(
  "/",
  requireRole("admin", "project_manager", "field_user"),
  async (req, res) => {
    const parsed = logSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });

    const waterSourceId = (req.params as { waterSourceId: string }).waterSourceId;
    const exists = await prisma.waterSource.findUnique({ where: { id: waterSourceId }, select: { id: true } });
    if (!exists) return res.status(404).json({ error: "Water source not found" });

    const log = await prisma.waterSourceLog.create({
      data: {
        waterSourceId,
        loggedById: req.user!.sub,
        loggedAt: parsed.data.loggedAt ? new Date(parsed.data.loggedAt) : new Date(),
        flowM3PerDay: parsed.data.flowM3PerDay ?? null,
        waterLevelCm: parsed.data.waterLevelCm ?? null,
        phLevel: parsed.data.phLevel ?? null,
        tdsPpm: parsed.data.tdsPpm ?? null,
        turbidityNtu: parsed.data.turbidityNtu ?? null,
        temperatureC: parsed.data.temperatureC ?? null,
        condition: parsed.data.condition ?? null,
        notes: parsed.data.notes ?? null,
      },
      include: { loggedBy: { select: { id: true, email: true, name: true } } },
    });
    res.status(201).json(log);
  }
);

waterSourceLogsRouter.delete(
  "/:logId",
  requireRole("admin", "project_manager"),
  async (req, res) => {
    const logId = (req.params as { logId: string }).logId;
    const existing = await prisma.waterSourceLog.findUnique({ where: { id: logId }, select: { id: true } });
    if (!existing) return res.status(404).json({ error: "Log entry not found" });
    await prisma.waterSourceLog.delete({ where: { id: logId } });
    res.status(204).end();
  }
);
