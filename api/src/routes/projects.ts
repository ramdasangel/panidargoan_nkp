import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const projectsRouter = Router();

projectsRouter.use(requireAuth);

projectsRouter.get("/", async (_req, res) => {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string; code: string; name: string; status: string;
      sponsor: string | null; start_date: Date | null; end_date: Date | null;
      budget_inr: string | null; planned_total: string | null; actual_total: string | null;
      task_count: bigint; tasks_done: bigint;
    }>
  >(
    `SELECT p.id, p.code, p.name, p.status::text AS status, p.sponsor,
            p."startDate" AS start_date, p."endDate" AS end_date,
            p."budgetInr" AS budget_inr,
            COALESCE((SELECT SUM(t."plannedCostInr") FROM "Task" t WHERE t."projectId" = p.id), 0) AS planned_total,
            COALESCE((SELECT SUM(c."amountInr") FROM "CostEntry" c JOIN "Task" t ON t.id = c."taskId" WHERE t."projectId" = p.id), 0) AS actual_total,
            (SELECT COUNT(*) FROM "Task" t WHERE t."projectId" = p.id) AS task_count,
            (SELECT COUNT(*) FROM "Task" t WHERE t."projectId" = p.id AND t.status = 'completed') AS tasks_done
       FROM "Project" p
       ORDER BY p.name`
  );

  res.json(rows.map((r) => ({
    id: r.id, code: r.code, name: r.name, status: r.status, sponsor: r.sponsor,
    startDate: r.start_date, endDate: r.end_date,
    budgetInr: r.budget_inr ? Number(r.budget_inr) : null,
    plannedTotalInr: Number(r.planned_total ?? 0),
    actualTotalInr: Number(r.actual_total ?? 0),
    taskCount: Number(r.task_count),
    tasksDone: Number(r.tasks_done),
  })));
});

projectsRouter.get("/:id", async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    select: {
      id: true, code: true, name: true, description: true, status: true,
      startDate: true, endDate: true, actualStart: true, actualEnd: true,
      sponsor: true, budgetInr: true, createdAt: true,
    },
  });
  if (!project) return res.status(404).json({ error: "Project not found" });

  const tasks = await prisma.task.findMany({
    where: { projectId: project.id },
    select: {
      id: true, code: true, name: true, status: true,
      startDate: true, endDate: true, actualStart: true, actualEnd: true,
      plannedCostInr: true,
      geoLinks: {
        select: {
          id: true, targetType: true,
          village:     { select: { id: true, name: true, code: true } },
          waterSource: { select: { id: true, name: true, code: true, type: true } },
          watershed:   { select: { id: true, name: true, code: true, kind: true } },
        },
      },
      costEntries: { select: { amountInr: true } },
      allocations: {
        select: {
          id: true, plannedQuantity: true, plannedUnitRateInr: true,
          resource: { select: { code: true, name: true, unit: true } },
        },
      },
    },
    orderBy: { code: "asc" },
  });

  res.json({
    ...project,
    budgetInr: project.budgetInr ? Number(project.budgetInr) : null,
    tasks: tasks.map((t) => ({
      ...t,
      plannedCostInr: t.plannedCostInr ? Number(t.plannedCostInr) : null,
      actualCostInr: t.costEntries.reduce((s, c) => s + Number(c.amountInr), 0),
      costEntries: undefined,
      allocations: t.allocations.map((a) => ({
        ...a,
        plannedQuantity: Number(a.plannedQuantity),
        plannedUnitRateInr: Number(a.plannedUnitRateInr),
        plannedCostInr: Number(a.plannedQuantity) * Number(a.plannedUnitRateInr),
      })),
    })),
  });
});

projectsRouter.get("/:id/tasks/:taskId/costs", async (req, res) => {
  const entries = await prisma.costEntry.findMany({
    where: { taskId: req.params.taskId },
    select: {
      id: true, entryDate: true, amountInr: true, category: true, vendor: true,
      quantity: true, unitRateInr: true,
      resource: { select: { code: true, name: true, unit: true } },
    },
    orderBy: { entryDate: "asc" },
  });
  res.json(entries.map((e) => ({
    ...e,
    amountInr: Number(e.amountInr),
    quantity: e.quantity ? Number(e.quantity) : null,
    unitRateInr: e.unitRateInr ? Number(e.unitRateInr) : null,
  })));
});
