import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const searchRouter = Router();
searchRouter.use(requireAuth);

// Replaces external Nominatim with a local lookup against project geo data.
// Queries Village + Taluka + Watershed by case-insensitive name fragment.
// Returns each result with lat/lng centroid (and bbox if available) so the
// LocationSearch UI can fly the map there.

interface Hit {
  type: "village" | "taluka" | "watershed";
  id: string;
  name: string;
  context?: string;            // e.g., "Ambegaon, Pune" — secondary line for the suggestion
  lat: number;
  lng: number;
  bbox?: [number, number, number, number]; // [south, west, north, east]
}

searchRouter.get("/", async (req, res) => {
  const qRaw = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (qRaw.length < 2) return res.json([]);
  const q = `%${qRaw}%`;
  const limit = Math.min(Number(req.query.limit) || 12, 30);

  // Run all three queries in parallel
  const [villages, talukas, watersheds] = await Promise.all([
    prisma.$queryRawUnsafe<
      Array<{
        id: string; name: string; taluka: string;
        lat: number; lng: number;
        minx: number | null; miny: number | null; maxx: number | null; maxy: number | null;
      }>
    >(
      `SELECT v.id, v.name, t.name AS taluka,
              ST_Y(ST_Centroid(v.boundary::geometry)) AS lat,
              ST_X(ST_Centroid(v.boundary::geometry)) AS lng,
              ST_XMin(v.boundary::geometry) AS minx,
              ST_YMin(v.boundary::geometry) AS miny,
              ST_XMax(v.boundary::geometry) AS maxx,
              ST_YMax(v.boundary::geometry) AS maxy
         FROM "Village" v JOIN "Taluka" t ON t.id = v."talukaId"
        WHERE v.name ILIKE $1
        ORDER BY POSITION(LOWER($2) IN LOWER(v.name)), v.name
        LIMIT $3`,
      q, qRaw, limit
    ),
    prisma.$queryRawUnsafe<
      Array<{
        id: string; name: string; district: string;
        lat: number; lng: number;
        minx: number | null; miny: number | null; maxx: number | null; maxy: number | null;
      }>
    >(
      `SELECT t.id, t.name, d.name AS district,
              ST_Y(ST_Centroid(t.boundary::geometry)) AS lat,
              ST_X(ST_Centroid(t.boundary::geometry)) AS lng,
              ST_XMin(t.boundary::geometry) AS minx,
              ST_YMin(t.boundary::geometry) AS miny,
              ST_XMax(t.boundary::geometry) AS maxx,
              ST_YMax(t.boundary::geometry) AS maxy
         FROM "Taluka" t JOIN "District" d ON d.id = t."districtId"
        WHERE t.name ILIKE $1
        ORDER BY POSITION(LOWER($2) IN LOWER(t.name)), t.name
        LIMIT $3`,
      q, qRaw, limit
    ),
    prisma.$queryRawUnsafe<
      Array<{
        id: string; name: string; kind: string;
        lat: number | null; lng: number | null;
        minx: number | null; miny: number | null; maxx: number | null; maxy: number | null;
      }>
    >(
      `SELECT w.id, w.name, w.kind,
              ST_Y(ST_Centroid(w.boundary::geometry)) AS lat,
              ST_X(ST_Centroid(w.boundary::geometry)) AS lng,
              ST_XMin(w.boundary::geometry) AS minx,
              ST_YMin(w.boundary::geometry) AS miny,
              ST_XMax(w.boundary::geometry) AS maxx,
              ST_YMax(w.boundary::geometry) AS maxy
         FROM "Watershed" w
        WHERE w.name ILIKE $1
          AND w.boundary IS NOT NULL
        ORDER BY POSITION(LOWER($2) IN LOWER(w.name)), w.name
        LIMIT $3`,
      q, qRaw, limit
    ),
  ]);

  const toBbox = (r: { minx: number | null; miny: number | null; maxx: number | null; maxy: number | null }):
    Hit["bbox"] | undefined =>
    r.minx != null && r.miny != null && r.maxx != null && r.maxy != null
      ? [r.miny, r.minx, r.maxy, r.maxx]
      : undefined;

  const hits: Hit[] = [
    ...villages.map((r) => ({
      type: "village" as const,
      id: r.id, name: r.name, context: `${r.taluka}, Pune`,
      lat: r.lat, lng: r.lng, bbox: toBbox(r),
    })),
    ...talukas.map((r) => ({
      type: "taluka" as const,
      id: r.id, name: r.name, context: `${r.district}, Maharashtra`,
      lat: r.lat, lng: r.lng, bbox: toBbox(r),
    })),
    ...watersheds.filter((r) => r.lat != null && r.lng != null).map((r) => ({
      type: "watershed" as const,
      id: r.id, name: r.name, context: r.kind,
      lat: r.lat!, lng: r.lng!, bbox: toBbox(r),
    })),
  ];

  // Order: prefix-match villages first, then talukas, then watersheds.
  // Each list is already sorted by best-match within its type by POSITION.
  res.json(hits.slice(0, limit));
});
