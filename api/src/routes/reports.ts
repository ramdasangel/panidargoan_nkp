import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { cached } from "../cache.js";

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

const REPORT_TTL = 60;

// Cost rollup for a watershed: aggregates spend across all tasks whose
// geo links target THIS watershed (or any descendant), a water source
// inside any of those watersheds, or (spatial) a village overlapping them.
reportsRouter.get("/watershed/:id/cost-rollup", async (req, res) => {
  const id = req.params.id;
  const payload = await cached(`reports:watershed:${id}:rollup`, REPORT_TTL, async () => {
  const watershed = await prisma.watershed.findUnique({
    where: { id },
    select: { id: true, name: true, code: true, kind: true, level: true },
  });
  if (!watershed) return null;

  // 1. All watershed IDs in the subtree.
  const subtree = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `WITH RECURSIVE tree AS (
       SELECT id FROM "Watershed" WHERE id = $1
       UNION ALL
       SELECT w.id FROM "Watershed" w JOIN tree t ON w."parentId" = t.id
     )
     SELECT id FROM tree`,
    id
  );
  const watershedIds = subtree.map((r) => r.id);

  // 2. All tasks linked, plus their planned + actual cost. A single task can
  //    have multiple geo links; we apportion by allocationPercent and dedupe
  //    so a single task doesn't double-count if linked to multiple targets
  //    within the same subtree.
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      project_id: string; project_code: string; project_name: string;
      task_id: string; task_code: string; task_name: string;
      planned_cost: string | null; actual_cost: string | null;
      link_kind: "direct_watershed" | "water_source_in_subtree" | "village_overlap";
      allocation_percent: number;
    }>
  >(
    `WITH subtree AS (
       SELECT unnest($1::text[]) AS ws_id
     ),
     direct_ws AS (
       SELECT DISTINCT l."taskId" AS task_id, l."allocationPercent" AS pct, 'direct_watershed'::text AS link_kind
       FROM "TaskGeoLink" l
       WHERE l."watershedId" IN (SELECT ws_id FROM subtree)
     ),
     source_in AS (
       SELECT DISTINCT l."taskId" AS task_id, l."allocationPercent" AS pct, 'water_source_in_subtree'::text AS link_kind
       FROM "TaskGeoLink" l
       JOIN "WaterSource" s ON s.id = l."waterSourceId"
       WHERE s."watershedId" IN (SELECT ws_id FROM subtree)
     ),
     village_overlap AS (
       SELECT DISTINCT l."taskId" AS task_id, l."allocationPercent" AS pct, 'village_overlap'::text AS link_kind
       FROM "TaskGeoLink" l
       JOIN "Village" v ON v.id = l."villageId"
       JOIN "Watershed" w ON w.id IN (SELECT ws_id FROM subtree)
       WHERE v.boundary IS NOT NULL AND w.boundary IS NOT NULL
         AND ST_Intersects(v.boundary, w.boundary)
     ),
     unioned AS (
       SELECT * FROM direct_ws
       UNION ALL
       SELECT s.* FROM source_in s
         WHERE NOT EXISTS (SELECT 1 FROM direct_ws d WHERE d.task_id = s.task_id)
       UNION ALL
       SELECT v.* FROM village_overlap v
         WHERE NOT EXISTS (SELECT 1 FROM direct_ws d WHERE d.task_id = v.task_id)
           AND NOT EXISTS (SELECT 1 FROM source_in s WHERE s.task_id = v.task_id)
     )
     SELECT p.id AS project_id, p.code AS project_code, p.name AS project_name,
            t.id AS task_id, t.code AS task_code, t.name AS task_name,
            t."plannedCostInr" AS planned_cost,
            COALESCE((SELECT SUM(c."amountInr") FROM "CostEntry" c WHERE c."taskId" = t.id), 0) AS actual_cost,
            u.link_kind, u.pct AS allocation_percent
       FROM unioned u
       JOIN "Task" t ON t.id = u.task_id
       JOIN "Project" p ON p.id = t."projectId"
       ORDER BY p.name, t.code`,
    watershedIds
  );

  let totalPlanned = 0;
  let totalActual = 0;
  const byProject = new Map<string, { id: string; code: string; name: string; plannedInr: number; actualInr: number; taskCount: number }>();
  const tasks = rows.map((r) => {
    const pct = r.allocation_percent / 100;
    const planned = Number(r.planned_cost ?? 0) * pct;
    const actual = Number(r.actual_cost ?? 0) * pct;
    totalPlanned += planned;
    totalActual += actual;
    const pb = byProject.get(r.project_id) ?? { id: r.project_id, code: r.project_code, name: r.project_name, plannedInr: 0, actualInr: 0, taskCount: 0 };
    pb.plannedInr += planned;
    pb.actualInr += actual;
    pb.taskCount += 1;
    byProject.set(r.project_id, pb);
    return {
      projectId: r.project_id, projectCode: r.project_code, projectName: r.project_name,
      taskId: r.task_id, taskCode: r.task_code, taskName: r.task_name,
      linkKind: r.link_kind, allocationPercent: r.allocation_percent,
      plannedInr: planned, actualInr: actual,
    };
  });

  return {
    watershed,
    descendantCount: watershedIds.length - 1,
    totalPlannedInr: totalPlanned,
    totalActualInr: totalActual,
    projects: Array.from(byProject.values()).sort((a, b) => b.actualInr - a.actualInr),
    tasks,
  };
  });
  if (payload === null) return res.status(404).json({ error: "Watershed not found" });
  res.json(payload);
});

// Lightweight per-watershed totals so the sidebar can show a badge per node
// without N round-trips. Sums planned + actual cost rolled up to each
// watershed in the tree (including descendant + water source + village links).
reportsRouter.get("/watersheds/cost-summary", async (_req, res) => {
  const payload = await cached("reports:watersheds:cost-summary", REPORT_TTL, async () => {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ watershed_id: string; planned: string | null; actual: string | null; task_count: bigint }>
  >(
    `WITH RECURSIVE tree AS (
       SELECT id, id AS root_id FROM "Watershed"
       UNION ALL
       SELECT w.id, t.root_id FROM "Watershed" w JOIN tree t ON w."parentId" = t.id
     ),
     subtree AS (
       SELECT root_id, id AS ws_id FROM tree
     ),
     task_link AS (
       SELECT DISTINCT s.root_id, l."taskId" AS task_id
         FROM "TaskGeoLink" l JOIN subtree s ON l."watershedId" = s.ws_id
       UNION
       SELECT DISTINCT s.root_id, l."taskId"
         FROM "TaskGeoLink" l
         JOIN "WaterSource" ws ON ws.id = l."waterSourceId"
         JOIN subtree s ON ws."watershedId" = s.ws_id
     )
     SELECT tl.root_id AS watershed_id,
            COALESCE(SUM(t."plannedCostInr"), 0) AS planned,
            COALESCE(SUM((SELECT COALESCE(SUM(c."amountInr"), 0) FROM "CostEntry" c WHERE c."taskId" = t.id)), 0) AS actual,
            COUNT(DISTINCT t.id) AS task_count
       FROM task_link tl JOIN "Task" t ON t.id = tl.task_id
       GROUP BY tl.root_id`
  );

  return rows.map((r) => ({
    watershedId: r.watershed_id,
    plannedInr: Number(r.planned ?? 0),
    actualInr: Number(r.actual ?? 0),
    taskCount: Number(r.task_count),
  }));
  });
  res.json(payload);
});
