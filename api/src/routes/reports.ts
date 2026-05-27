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

// -----------------------------------------------------------------------------
// Water availability aggregation
// -----------------------------------------------------------------------------
//
// Aggregates manual water sources + their latest log entries across either
// Taluka or Watershed groupings. Returns one row per group with:
//   sourceCount        — number of manual water sources in this group
//   sourceCountByType  — JSON map of type -> count (well, borewell, etc.)
//   loggedSourceCount  — sources that have at least one log
//   totalFlowM3PerDay  — sum of latest flow across all sources
//   avgWaterLevelCm    — average of latest water level across sources
//   avgPh              — average of latest pH
//   latestObservationAt — most recent log timestamp in this group
//
// groupBy=taluka  → spatial join WaterSource.geom WITHIN Taluka.boundary
// groupBy=watershed → join on WaterSource.watershedId
//
// Only counts source='manual' rows; OSM/imported lines are excluded since
// they aren't field-observed.

reportsRouter.get("/water-availability", async (req, res) => {
  const groupBy = req.query.groupBy === "watershed" ? "watershed" : "taluka";
  const key = `reports:water-availability:${groupBy}`;

  type AggRow = {
    group_id: string;
    group_name: string;
    group_kind: string | null;
    source_count: bigint;
    source_count_by_type: Record<string, number> | string;
    logged_source_count: bigint;
    total_flow_m3_per_day: number | string | null;
    avg_water_level_cm: number | string | null;
    avg_ph: number | string | null;
    latest_observation_at: Date | null;
  };

  const payload = await cached(key, REPORT_TTL, async () => {
    const rows = groupBy === "taluka"
      ? await prisma.$queryRawUnsafe<AggRow[]>(`
          WITH latest AS (
            SELECT DISTINCT ON ("waterSourceId")
              "waterSourceId", "loggedAt", "flowM3PerDay", "waterLevelCm", "phLevel"
            FROM "WaterSourceLog"
            ORDER BY "waterSourceId", "loggedAt" DESC
          ),
          src AS (
            SELECT ws.id, ws.type::text AS type, ws.geom,
                   l."loggedAt", l."flowM3PerDay", l."waterLevelCm", l."phLevel"
              FROM "WaterSource" ws
              LEFT JOIN latest l ON l."waterSourceId" = ws.id
             WHERE ws.source = 'manual'
          )
          SELECT t.id  AS group_id,
                 t.name AS group_name,
                 'taluka' AS group_kind,
                 COUNT(src.id)::bigint AS source_count,
                 COALESCE(
                   jsonb_object_agg(src.type, type_count) FILTER (WHERE src.type IS NOT NULL),
                   '{}'::jsonb
                 ) AS source_count_by_type,
                 COUNT(src."loggedAt")::bigint AS logged_source_count,
                 SUM(src."flowM3PerDay")            AS total_flow_m3_per_day,
                 AVG(src."waterLevelCm")            AS avg_water_level_cm,
                 AVG(src."phLevel")                 AS avg_ph,
                 MAX(src."loggedAt")                AS latest_observation_at
            FROM "Taluka" t
            LEFT JOIN LATERAL (
              SELECT s.id, s.type, s."loggedAt", s."flowM3PerDay", s."waterLevelCm", s."phLevel",
                     COUNT(*) OVER (PARTITION BY s.type) AS type_count
                FROM src s
               WHERE ST_Within(s.geom::geometry, t.boundary::geometry)
            ) src ON true
           GROUP BY t.id, t.name
           ORDER BY t.name`)
      : await prisma.$queryRawUnsafe<AggRow[]>(`
          WITH latest AS (
            SELECT DISTINCT ON ("waterSourceId")
              "waterSourceId", "loggedAt", "flowM3PerDay", "waterLevelCm", "phLevel"
            FROM "WaterSourceLog"
            ORDER BY "waterSourceId", "loggedAt" DESC
          ),
          src AS (
            SELECT ws.id, ws.type::text AS type, ws."watershedId",
                   l."loggedAt", l."flowM3PerDay", l."waterLevelCm", l."phLevel",
                   COUNT(*) OVER (PARTITION BY ws."watershedId", ws.type) AS type_count
              FROM "WaterSource" ws
              LEFT JOIN latest l ON l."waterSourceId" = ws.id
             WHERE ws.source = 'manual'
          )
          SELECT w.id  AS group_id,
                 w.name AS group_name,
                 w.kind AS group_kind,
                 COUNT(src.id)::bigint AS source_count,
                 COALESCE(
                   jsonb_object_agg(src.type, src.type_count) FILTER (WHERE src.type IS NOT NULL),
                   '{}'::jsonb
                 ) AS source_count_by_type,
                 COUNT(src."loggedAt")::bigint AS logged_source_count,
                 SUM(src."flowM3PerDay")            AS total_flow_m3_per_day,
                 AVG(src."waterLevelCm")            AS avg_water_level_cm,
                 AVG(src."phLevel")                 AS avg_ph,
                 MAX(src."loggedAt")                AS latest_observation_at
            FROM "Watershed" w
            LEFT JOIN src ON src."watershedId" = w.id
           WHERE w.kind IN ('river_basin', 'sub_basin', 'watershed')
           GROUP BY w.id, w.name, w.kind
          HAVING COUNT(src.id) > 0
           ORDER BY COUNT(src.id) DESC, w.name`);

    return rows.map((r) => ({
      groupId:   r.group_id,
      groupName: r.group_name,
      groupKind: r.group_kind,
      sourceCount:       Number(r.source_count),
      sourceCountByType: typeof r.source_count_by_type === "string"
        ? JSON.parse(r.source_count_by_type) : r.source_count_by_type,
      loggedSourceCount: Number(r.logged_source_count),
      totalFlowM3PerDay: r.total_flow_m3_per_day == null ? null : Number(r.total_flow_m3_per_day),
      avgWaterLevelCm:   r.avg_water_level_cm   == null ? null : Number(r.avg_water_level_cm),
      avgPh:             r.avg_ph               == null ? null : Number(r.avg_ph),
      latestObservationAt: r.latest_observation_at,
    }));
  });

  res.json(payload);
});
