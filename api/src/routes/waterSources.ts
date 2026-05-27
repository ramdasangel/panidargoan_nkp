import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { invalidate } from "../cache.js";

export const waterSourcesRouter = Router();

waterSourcesRouter.use(requireAuth);

const WATER_SOURCE_TYPES = [
  "river", "stream", "canal", "pond", "lake", "well", "borewell",
  "check_dam", "bandhara", "kt_weir", "percolation_tank", "farm_pond",
  "spring", "other",
] as const;

const geometrySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("Point"),
    coordinates: z.tuple([z.number(), z.number()]),
  }),
  z.object({
    type: z.literal("LineString"),
    coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
  }),
  z.object({
    type: z.literal("Polygon"),
    coordinates: z.array(z.array(z.tuple([z.number(), z.number()])).min(4)).min(1),
  }),
]);

const createSchema = z.object({
  code: z.string().min(1).max(64).optional(),
  name: z.string().min(1).max(200),
  type: z.enum(WATER_SOURCE_TYPES),
  watershedId: z.string().uuid().optional().nullable(),
  capacityM3: z.number().nonnegative().optional().nullable(),
  depthM: z.number().nonnegative().optional().nullable(),
  condition: z.string().max(80).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  geometry: geometrySchema,
  kml: z.string().max(200000).optional().nullable(),
});

async function findContainingWatershedId(geomGeoJson: object): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM "Watershed"
       WHERE boundary IS NOT NULL
         AND ST_Intersects(boundary, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography)
       ORDER BY level DESC
       LIMIT 1`,
    JSON.stringify(geomGeoJson)
  );
  return rows[0]?.id ?? null;
}

waterSourcesRouter.get("/", async (req, res) => {
  const watershedId = typeof req.query.watershedId === "string" ? req.query.watershedId : undefined;
  const items = await prisma.waterSource.findMany({
    where: watershedId ? { watershedId } : undefined,
    select: {
      id: true, code: true, name: true, type: true, source: true, watershedId: true,
      capacityM3: true, depthM: true, condition: true, notes: true,
    },
    orderBy: { name: "asc" },
  });
  res.json(items);
});

waterSourcesRouter.get("/:id", async (req, res) => {
  const item = await prisma.waterSource.findUnique({
    where: { id: req.params.id },
    select: {
      id: true, code: true, name: true, type: true, source: true, watershedId: true,
      capacityM3: true, depthM: true, condition: true, notes: true, kml: true,
    },
  });
  if (!item) return res.status(404).json({ error: "Water source not found" });
  res.json(item);
});

waterSourcesRouter.post("/", requireRole("admin", "project_manager", "field_user"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
  const p = parsed.data;

  const watershedId = p.watershedId ?? (await findContainingWatershedId(p.geometry));
  const code = p.code ?? `USR-${Date.now().toString(36).toUpperCase()}`;
  const kml = p.kml ?? geometryToKml(p.geometry, p.name);

  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `INSERT INTO "WaterSource" (code, name, type, source, "watershedId", "capacityM3", "depthM", condition, notes, geom, kml)
     VALUES ($1, $2, $3::"WaterSourceType", 'manual'::"WaterSourceOrigin", $4, $5, $6, $7, $8,
             ST_SetSRID(ST_GeomFromGeoJSON($9), 4326)::geography, $10)
     RETURNING id`,
    code, p.name, p.type, watershedId,
    p.capacityM3 ?? null, p.depthM ?? null, p.condition ?? null, p.notes ?? null,
    JSON.stringify(p.geometry), kml
  );

  await invalidate("boundaries:water-sources:*");
  await invalidate("reports:*");

  res.status(201).json({ id: rows[0]?.id, code, watershedId });
});

// Build a minimal KML from a GeoJSON geometry. Used server-side when the
// client didn't supply one (i.e., the user drew points instead of pasting KML).
function geometryToKml(g: z.infer<typeof geometrySchema>, name: string): string {
  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
  const coordStr = (pts: Array<[number, number]>) =>
    pts.map(([lng, lat]) => `${lng},${lat},0`).join(" ");
  let inner: string;
  if (g.type === "Point") {
    inner = `<Point><coordinates>${g.coordinates[0]},${g.coordinates[1]},0</coordinates></Point>`;
  } else if (g.type === "LineString") {
    inner = `<LineString><coordinates>${coordStr(g.coordinates)}</coordinates></LineString>`;
  } else {
    const ring = g.coordinates[0];
    inner = `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordStr(ring)}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Placemark><name>${esc(name)}</name>${inner}</Placemark>
</kml>`;
}

const updateSchema = createSchema.partial().extend({ geometry: geometrySchema.optional() });

waterSourcesRouter.put("/:id", requireRole("admin", "project_manager", "field_user"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
  const p = parsed.data;

  const existing = await prisma.waterSource.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!existing) return res.status(404).json({ error: "Water source not found" });

  // Non-spatial fields via Prisma
  await prisma.waterSource.update({
    where: { id: req.params.id },
    data: {
      ...(p.name !== undefined ? { name: p.name } : {}),
      ...(p.type !== undefined ? { type: p.type } : {}),
      ...(p.watershedId !== undefined ? { watershedId: p.watershedId } : {}),
      ...(p.capacityM3 !== undefined ? { capacityM3: p.capacityM3 } : {}),
      ...(p.depthM !== undefined ? { depthM: p.depthM } : {}),
      ...(p.condition !== undefined ? { condition: p.condition } : {}),
      ...(p.notes !== undefined ? { notes: p.notes } : {}),
      ...(p.kml !== undefined ? { kml: p.kml } : {}),
    },
  });

  if (p.geometry) {
    await prisma.$executeRawUnsafe(
      `UPDATE "WaterSource"
          SET geom = ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography
        WHERE id = $2`,
      JSON.stringify(p.geometry),
      req.params.id
    );
  }

  await invalidate("boundaries:water-sources:*");
  await invalidate("reports:*");
  res.json({ id: req.params.id });
});

waterSourcesRouter.delete("/:id", requireRole("admin", "project_manager"), async (req, res) => {
  const existing = await prisma.waterSource.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!existing) return res.status(404).json({ error: "Water source not found" });
  await prisma.waterSource.delete({ where: { id: req.params.id } });
  await invalidate("boundaries:water-sources:*");
  await invalidate("reports:*");
  res.status(204).end();
});
