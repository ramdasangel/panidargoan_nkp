/**
 * Fetches real admin boundaries from OSM Nominatim and applies them to PostGIS.
 * For villages (Indian OSM data has very few village polygons), generates a
 * Voronoi tessellation of the seeded centroids clipped to each taluka boundary.
 *
 * Usage:  npm run import:boundaries
 *
 * The script is safe to re-run: it only updates rows that already exist
 * (created by `npm run seed`) and caches Nominatim responses to disk.
 */
import { PrismaClient } from "@prisma/client";
import { Delaunay } from "d3-delaunay";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const prisma = new PrismaClient();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(__dirname, "../.cache/nominatim");

const NOMINATIM = "https://nominatim.openstreetmap.org";
const USER_AGENT = "PaniDarGoan-demo/0.1 (boundary import; contact via repo)";

interface Feature {
  type: "Feature";
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function nominatimSearch(query: string): Promise<Feature | null> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const cacheKey = query.replace(/[^a-z0-9]/gi, "_").slice(0, 80);
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
  try {
    const cached = await fs.readFile(cachePath, "utf8");
    return JSON.parse(cached) as Feature;
  } catch {
    // miss — fall through
  }

  await sleep(1200); // Nominatim rate limit
  const url = `${NOMINATIM}/search?q=${encodeURIComponent(query)}&format=geojson&polygon_geojson=1&limit=1&addressdetails=1`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    console.warn(`  ! Nominatim ${res.status} for "${query}"`);
    return null;
  }
  const data = (await res.json()) as { features?: Feature[] };
  if (!data.features?.length) return null;
  const feature = data.features[0];
  await fs.writeFile(cachePath, JSON.stringify(feature, null, 2));
  return feature;
}

async function setBoundaryFromGeoJSON(table: string, id: string, geom: object) {
  await prisma.$executeRawUnsafe(
    `UPDATE "${table}" SET boundary = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))::geography WHERE id = $2`,
    JSON.stringify(geom),
    id
  );
}

async function setBoundaryFromWkt(table: string, id: string, wkt: string) {
  await prisma.$executeRawUnsafe(
    `UPDATE "${table}" SET boundary = ST_GeogFromText($1) WHERE id = $2`,
    `SRID=4326;${wkt}`,
    id
  );
}

async function importState() {
  console.log("→ Maharashtra (state)");
  const f = await nominatimSearch("Maharashtra, India");
  if (!f?.geometry) { console.warn("  ! no result"); return; }
  const state = await prisma.state.findUnique({ where: { code: "MH" } });
  if (state) {
    await setBoundaryFromGeoJSON("State", state.id, f.geometry);
    console.log("  ✓ updated");
  }
}

async function importDistrict() {
  console.log("→ Pune (district)");
  const f = await nominatimSearch("Pune District, Maharashtra, India");
  if (!f?.geometry) { console.warn("  ! no result"); return; }
  const district = await prisma.district.findUnique({ where: { code: "MH-PUN" } });
  if (district) {
    await setBoundaryFromGeoJSON("District", district.id, f.geometry);
    console.log("  ✓ updated");
  }
}

async function importTalukas() {
  const talukas = [
    { code: "MH-PUN-AMB", queries: ["Ambegaon Taluka, Pune, Maharashtra, India", "Ambegaon, Pune, Maharashtra, India"] },
    { code: "MH-PUN-SHR", queries: ["Shirur Taluka, Pune, Maharashtra, India", "Shirur, Pune, Maharashtra, India"] },
  ];
  for (const t of talukas) {
    console.log(`→ ${t.code} (taluka)`);
    let f: Feature | null = null;
    for (const q of t.queries) {
      f = await nominatimSearch(q);
      if (f?.geometry && isPolygon(f.geometry.type)) break;
    }
    if (!f?.geometry) { console.warn("  ! no result"); continue; }
    if (!isPolygon(f.geometry.type)) { console.warn(`  ! got ${f.geometry.type}, expected polygon`); continue; }
    const t2 = await prisma.taluka.findUnique({ where: { code: t.code } });
    if (t2) {
      await setBoundaryFromGeoJSON("Taluka", t2.id, f.geometry);
      console.log("  ✓ updated");
    }
  }
}

function isPolygon(type: string) {
  return type === "Polygon" || type === "MultiPolygon";
}

async function getTalukaCentroidsAndBbox(talukaId: string): Promise<{
  villages: Array<{ id: string; name: string; lng: number; lat: number }>;
  bbox: [number, number, number, number] | null;
}> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: string; name: string; lng: number; lat: number }>
  >(
    `SELECT v.id, v.name,
            ST_X(ST_Centroid(v.boundary::geometry)) AS lng,
            ST_Y(ST_Centroid(v.boundary::geometry)) AS lat
       FROM "Village" v
       WHERE v."talukaId" = $1 AND v.boundary IS NOT NULL`,
    talukaId
  );
  const bboxRows = await prisma.$queryRawUnsafe<
    Array<{ minx: number; miny: number; maxx: number; maxy: number }>
  >(
    `SELECT ST_XMin(b) AS minx, ST_YMin(b) AS miny, ST_XMax(b) AS maxx, ST_YMax(b) AS maxy
       FROM (SELECT boundary::geometry AS b FROM "Taluka" WHERE id = $1) t`,
    talukaId
  );
  const bbox = bboxRows[0]
    ? ([bboxRows[0].minx, bboxRows[0].miny, bboxRows[0].maxx, bboxRows[0].maxy] as [number, number, number, number])
    : null;
  return { villages: rows, bbox };
}

function cellToWkt(cell: number[][]): string {
  const ring = cell.map(([x, y]) => `${x} ${y}`).join(", ");
  const closed = cell.length > 0 && (cell[0][0] !== cell[cell.length - 1][0] || cell[0][1] !== cell[cell.length - 1][1])
    ? `, ${cell[0][0]} ${cell[0][1]}` : "";
  return `POLYGON((${ring}${closed}))`;
}

async function assignVoronoiVillages(talukaCode: string) {
  console.log(`→ Voronoi villages for ${talukaCode}`);
  const taluka = await prisma.taluka.findUnique({ where: { code: talukaCode } });
  if (!taluka) return;
  const { villages, bbox } = await getTalukaCentroidsAndBbox(taluka.id);
  if (!villages.length || !bbox) { console.warn("  ! no villages or bbox"); return; }

  // Expand bbox a bit so cells on the edge aren't clipped flat.
  const pad = 0.05;
  const expandedBbox: [number, number, number, number] = [bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad];
  const points: [number, number][] = villages.map((v) => [v.lng, v.lat]);
  const delaunay = Delaunay.from(points);
  const voronoi = delaunay.voronoi(expandedBbox);

  for (let i = 0; i < villages.length; i++) {
    const cell = voronoi.cellPolygon(i);
    if (!cell) {
      console.warn(`  ! no cell for ${villages[i].name}`);
      continue;
    }
    const wkt = cellToWkt(cell as number[][]);
    // Clip the Voronoi cell to the taluka boundary and store as MultiPolygon.
    // PostGIS ST_Multi requires geometry (not geography), so cast through geometry
    // and back to geography at the end.
    await prisma.$executeRawUnsafe(
      `UPDATE "Village"
          SET boundary = ST_Multi(
            ST_Intersection(
              ST_GeomFromText($1, 4326),
              (SELECT boundary::geometry FROM "Taluka" WHERE id = $2)
            )
          )::geography
        WHERE id = $3`,
      wkt,
      taluka.id,
      villages[i].id
    );
    console.log(`  ✓ ${villages[i].name}`);
  }
}

async function main() {
  console.log("Importing real boundaries from OSM Nominatim + Voronoi tessellation\n");
  await importState();
  await importDistrict();
  await importTalukas();
  await assignVoronoiVillages("MH-PUN-AMB");
  await assignVoronoiVillages("MH-PUN-SHR");

  // Update watershed boundaries to match the new taluka outlines for the demo
  console.log("→ Refreshing watershed placeholder boundaries from new talukas");
  const ambMicro = await prisma.watershed.findUnique({ where: { code: "WS-GHOD-MW-001" } });
  const shrMicro = await prisma.watershed.findUnique({ where: { code: "WS-GHOD-MW-002" } });
  const ghod = await prisma.watershed.findUnique({ where: { code: "WS-BHIMA-GHOD" } });
  const bhima = await prisma.watershed.findUnique({ where: { code: "WS-BHIMA" } });
  const amb = await prisma.taluka.findUnique({ where: { code: "MH-PUN-AMB" } });
  const shr = await prisma.taluka.findUnique({ where: { code: "MH-PUN-SHR" } });
  if (ambMicro && amb) {
    await prisma.$executeRawUnsafe(
      `UPDATE "Watershed" SET boundary = (SELECT boundary FROM "Taluka" WHERE id = $1) WHERE id = $2`,
      amb.id, ambMicro.id
    );
  }
  if (shrMicro && shr) {
    await prisma.$executeRawUnsafe(
      `UPDATE "Watershed" SET boundary = (SELECT boundary FROM "Taluka" WHERE id = $1) WHERE id = $2`,
      shr.id, shrMicro.id
    );
  }
  if (ghod && amb && shr) {
    await prisma.$executeRawUnsafe(
      `UPDATE "Watershed" SET boundary = ST_Multi(ST_Union(t1.boundary::geometry, t2.boundary::geometry))::geography
         FROM "Taluka" t1, "Taluka" t2
         WHERE t1.id = $1 AND t2.id = $2 AND "Watershed".id = $3`,
      amb.id, shr.id, ghod.id
    );
  }
  if (bhima && amb && shr) {
    await prisma.$executeRawUnsafe(
      `UPDATE "Watershed" SET boundary = ST_Multi(ST_Union(t1.boundary::geometry, t2.boundary::geometry))::geography
         FROM "Taluka" t1, "Taluka" t2
         WHERE t1.id = $1 AND t2.id = $2 AND "Watershed".id = $3`,
      amb.id, shr.id, bhima.id
    );
  }
  console.log("  ✓ watershed boundaries refreshed");

  // Bust the Redis boundary cache so the next API request returns the new shapes.
  try {
    const cache = await import("../src/cache.js");
    await cache.invalidate("boundaries:*");
    await cache.invalidate("reports:*");
    await cache.disconnect();
    console.log("  ✓ cache invalidated");
  } catch {
    // Cache module may not load in import script; that's fine.
  }

  console.log("\nDone.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
