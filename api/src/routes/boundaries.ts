import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { cached } from "../cache.js";

const BOUNDARY_TTL = 3600;

export const boundariesRouter = Router();

boundariesRouter.use(requireAuth);

type GeoJsonFeature = {
  type: "Feature";
  geometry: unknown;
  properties: Record<string, unknown>;
};

function toFeatureCollection(features: GeoJsonFeature[]) {
  return { type: "FeatureCollection", features };
}

boundariesRouter.get("/villages", async (req, res) => {
  const talukaId = typeof req.query.talukaId === "string" ? req.query.talukaId : null;
  const payload = await cached(`boundaries:villages:${talukaId ?? "all"}`, BOUNDARY_TTL, async () => {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      code: string;
      name: string;
      taluka_id: string;
      population: number | null;
      cattle_count: number | null;
      sheep_goat_count: number | null;
      other_livestock_count: number | null;
      avg_slope_percent: number | null;
      geom: string | null;
    }>
  >(
    `SELECT id, code, name, "talukaId" AS taluka_id,
            population, "cattleCount" AS cattle_count,
            "sheepGoatCount" AS sheep_goat_count,
            "otherLivestockCount" AS other_livestock_count,
            "avgSlopePercent" AS avg_slope_percent,
            ST_AsGeoJSON(boundary)::text AS geom
       FROM "Village"
       WHERE ($1::text IS NULL OR "talukaId" = $1)
         AND boundary IS NOT NULL`,
    talukaId
  );

  const features: GeoJsonFeature[] = rows.map((r) => ({
    type: "Feature",
    geometry: r.geom ? JSON.parse(r.geom) : null,
    properties: {
      id: r.id,
      code: r.code,
      name: r.name,
      talukaId: r.taluka_id,
      population: r.population,
      cattleCount: r.cattle_count,
      sheepGoatCount: r.sheep_goat_count,
      otherLivestockCount: r.other_livestock_count,
      avgSlopePercent: r.avg_slope_percent,
    },
  }));

  return toFeatureCollection(features);
  });
  res.json(payload);
});

boundariesRouter.get("/talukas", async (req, res) => {
  const districtId = typeof req.query.districtId === "string" ? req.query.districtId : null;
  const payload = await cached(`boundaries:talukas:${districtId ?? "all"}`, BOUNDARY_TTL, async () => {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: string; code: string; name: string; district_id: string; geom: string | null }>
  >(
    `SELECT id, code, name, "districtId" AS district_id,
            ST_AsGeoJSON(boundary)::text AS geom
       FROM "Taluka"
       WHERE ($1::text IS NULL OR "districtId" = $1)
         AND boundary IS NOT NULL`,
    districtId
  );

  const features: GeoJsonFeature[] = rows.map((r) => ({
    type: "Feature",
    geometry: r.geom ? JSON.parse(r.geom) : null,
    properties: { id: r.id, code: r.code, name: r.name, districtId: r.district_id },
  }));

  return toFeatureCollection(features);
  });
  res.json(payload);
});

boundariesRouter.get("/watersheds", async (req, res) => {
  const level = typeof req.query.level === "string" ? Number(req.query.level) : null;
  const parentId = typeof req.query.parentId === "string" ? req.query.parentId : null;
  const payload = await cached(`boundaries:watersheds:${level ?? "all"}:${parentId ?? "all"}`, BOUNDARY_TTL, async () => {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string; code: string; name: string; kind: string; level: number;
      parent_id: string | null; area_km2: number | null; geom: string | null;
    }>
  >(
    `SELECT id, code, name, kind, level, "parentId" AS parent_id,
            "areaKm2" AS area_km2, ST_AsGeoJSON(boundary)::text AS geom
       FROM "Watershed"
       WHERE ($1::int IS NULL OR level = $1)
         AND ($2::text IS NULL OR "parentId" = $2)
         AND boundary IS NOT NULL`,
    level && !Number.isNaN(level) ? level : null,
    parentId
  );

  const features: GeoJsonFeature[] = rows.map((r) => ({
    type: "Feature",
    geometry: r.geom ? JSON.parse(r.geom) : null,
    properties: {
      id: r.id, code: r.code, name: r.name, kind: r.kind, level: r.level,
      parentId: r.parent_id, areaKm2: r.area_km2,
    },
  }));

  return toFeatureCollection(features);
  });
  res.json(payload);
});

boundariesRouter.get("/water-sources", async (req, res) => {
  const watershedId = typeof req.query.watershedId === "string" ? req.query.watershedId : null;
  const payload = await cached(`boundaries:water-sources:${watershedId ?? "all"}`, BOUNDARY_TTL, async () => {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string; code: string; name: string; type: string; watershed_id: string | null;
      capacity_m3: number | null; depth_m: number | null; condition: string | null; geom: string;
    }>
  >(
    `SELECT id, code, name, type::text AS type, "watershedId" AS watershed_id,
            "capacityM3" AS capacity_m3, "depthM" AS depth_m, condition,
            ST_AsGeoJSON(geom)::text AS geom
       FROM "WaterSource"
       WHERE ($1::text IS NULL OR "watershedId" = $1)`,
    watershedId
  );

  const features: GeoJsonFeature[] = rows.map((r) => ({
    type: "Feature",
    geometry: JSON.parse(r.geom),
    properties: {
      id: r.id, code: r.code, name: r.name, type: r.type,
      watershedId: r.watershed_id, capacityM3: r.capacity_m3,
      depthM: r.depth_m, condition: r.condition,
    },
  }));

  return toFeatureCollection(features);
  });
  res.json(payload);
});
