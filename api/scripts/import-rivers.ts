/**
 * Pulls real river / stream / canal lines from OpenStreetMap (Overpass API)
 * for the bounding boxes of Ambegaon + Shirur talukas, and inserts them as
 * WaterSource rows in PostGIS.
 *
 * After cleanup-dummies you can run this to repopulate the map with real
 * waterways from OSM. Re-runnable — uses upsert by code.
 *
 * Source: OpenStreetMap. Comparable alternatives (HydroSHEDS / US Army Corps,
 * ISRO Bhuvan, NHD) need account / license setup; OSM is freely re-usable
 * under ODbL.
 */
import { PrismaClient, WaterSourceType } from "@prisma/client";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const prisma = new PrismaClient();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(__dirname, "../.cache/overpass");

const OVERPASS = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "PaniDarGoan-demo/0.1 (river import; contact via repo)";

interface OsmWay {
  type: "way";
  id: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
}

async function overpassQuery(query: string, cacheKey: string): Promise<{ elements: OsmWay[] }> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
  try {
    return JSON.parse(await fs.readFile(cachePath, "utf8"));
  } catch {
    // miss
  }
  const res = await fetch(OVERPASS, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: "data=" + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}: ${await res.text().catch(() => "")}`);
  const data = (await res.json()) as { elements: OsmWay[] };
  await fs.writeFile(cachePath, JSON.stringify(data, null, 2));
  return data;
}

function osmTagToType(tag: string): WaterSourceType {
  if (tag === "canal") return WaterSourceType.canal;
  if (tag === "stream") return WaterSourceType.stream;
  return WaterSourceType.river;
}

async function getTalukaBbox(talukaCode: string): Promise<[number, number, number, number] | null> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ minx: number; miny: number; maxx: number; maxy: number }>
  >(
    `SELECT ST_XMin(b) AS minx, ST_YMin(b) AS miny, ST_XMax(b) AS maxx, ST_YMax(b) AS maxy
       FROM (SELECT t.boundary::geometry AS b FROM "Taluka" t WHERE t.code = $1) x`,
    talukaCode
  );
  if (!rows[0]) return null;
  return [rows[0].miny, rows[0].minx, rows[0].maxy, rows[0].maxx];
}

async function findContainingWatershed(): Promise<string | null> {
  const ghod = await prisma.watershed.findUnique({ where: { code: "WS-BHIMA-GHOD" } });
  return ghod?.id ?? null;
}

async function importForTaluka(talukaCode: string) {
  console.log(`→ Importing waterways for ${talukaCode}`);
  const bbox = await getTalukaBbox(talukaCode);
  if (!bbox) { console.warn("  ! no taluka bbox"); return; }
  const [s, w, n, e] = bbox;

  const q = `[out:json][timeout:60];
(
  way["waterway"="river"](${s},${w},${n},${e});
  way["waterway"="stream"](${s},${w},${n},${e});
  way["waterway"="canal"](${s},${w},${n},${e});
);
out geom;`;

  const data = await overpassQuery(q, `${talukaCode}-waterways`);
  const ghodId = await findContainingWatershed();

  // Clip to the actual taluka polygon so we don't pull in tails of rivers that
  // extend past the bbox into neighboring talukas.
  let imported = 0;
  let skipped = 0;
  for (const way of data.elements ?? []) {
    if (way.type !== "way" || !way.geometry || way.geometry.length < 2) {
      skipped++;
      continue;
    }
    const name = way.tags?.name ?? way.tags?.["name:en"] ?? `OSM way ${way.id}`;
    const waterway = way.tags?.waterway ?? "river";
    const type = osmTagToType(waterway);
    const lineWkt = "LINESTRING(" + way.geometry.map((p) => `${p.lon} ${p.lat}`).join(", ") + ")";
    const code = `OSM-${way.id}`;

    // Clip the line to the taluka boundary
    const result = await prisma.$queryRawUnsafe<Array<{ wkt: string | null; len: number | null }>>(
      `WITH src AS (SELECT ST_GeomFromText($1, 4326) AS g),
            tk  AS (SELECT boundary::geometry AS g FROM "Taluka" WHERE code = $2)
       SELECT ST_AsText(ST_Intersection(src.g, tk.g)) AS wkt,
              ST_Length(ST_Intersection(src.g, tk.g)::geography) AS len
         FROM src, tk`,
      lineWkt, talukaCode
    );

    const wkt = result[0]?.wkt;
    const lenM = result[0]?.len ?? 0;
    if (!wkt || wkt === "GEOMETRYCOLLECTION EMPTY" || lenM < 100) {
      skipped++;
      continue;
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO "WaterSource" (code, name, type, source, "watershedId", condition, notes, geom)
       VALUES ($1, $2, $3::"WaterSourceType", 'osm'::"WaterSourceOrigin", $4, $5, $6, ST_GeogFromText($7))
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name,
         type = EXCLUDED.type,
         source = EXCLUDED.source,
         "watershedId" = EXCLUDED."watershedId",
         condition = EXCLUDED.condition,
         notes = EXCLUDED.notes,
         geom = EXCLUDED.geom`,
      code, name, type, ghodId,
      "imported_from_osm",
      `OSM way ${way.id}; tags=${JSON.stringify(way.tags ?? {})}`,
      `SRID=4326;${wkt}`
    );
    imported++;
  }
  console.log(`  ✓ imported ${imported} waterways (skipped ${skipped} empty/short)`);
}

async function main() {
  console.log("Importing real waterways from OSM Overpass\n");
  await importForTaluka("MH-PUN-AMB");
  await importForTaluka("MH-PUN-SHR");

  try {
    const cache = await import("../src/cache.js");
    await cache.invalidate("boundaries:water-sources:*");
    await cache.invalidate("reports:*");
    await cache.disconnect();
    console.log("\n  ✓ cache invalidated");
  } catch {
    // no-op
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
