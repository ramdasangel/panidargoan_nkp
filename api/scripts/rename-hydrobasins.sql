-- Auto-rename HydroBASINS watersheds + sub-basins to human-friendly names.
--
-- Naming rules (first match wins):
--   1. Sub-basin (lev 2):
--        a. overlapping taluka  -> "<Taluka> sub-basin (<area> km²)"
--        b. dominant village    -> "Sub-basin near <Village> (<area> km²)"
--        c. fallback            -> "Sub-basin <area> km² (<HB-id>)"
--
--   2. Watershed (lev 3):
--        a. named OSM river passing through (Vel/Velu/Ghod/Bhima)
--           -> "<River> reach near <nearest village> (<area> km²)"
--        b. nearest village within 8 km
--           -> "<Village> watershed (<area> km²)"
--        c. fallback
--           -> "Watershed <area> km² (<HB-id>)"
--
-- The HydroBASINS code (HB-...) is preserved — only the display name changes.
-- Re-runnable: applies a CASE based purely on the code and the spatial joins.

BEGIN;

-- 1. Sub-basins ------------------------------------------------------------
UPDATE "Watershed" w
   SET name = COALESCE(
     -- a. dominant overlapping taluka
     (SELECT t.name || ' sub-basin (' || ROUND(w."areaKm2"::numeric)::text || ' km²)'
        FROM "Taluka" t
       WHERE ST_Intersects(t.boundary, w.boundary)
       ORDER BY ST_Area(ST_Intersection(t.boundary::geometry, w.boundary::geometry)) DESC
       LIMIT 1),
     -- b. nearest village within 10 km
     (SELECT 'Sub-basin near ' || v.name || ' (' || ROUND(w."areaKm2"::numeric)::text || ' km²)'
        FROM "Village" v
       WHERE ST_DWithin(v.boundary, w.boundary, 10000)
       ORDER BY ST_Distance(v.boundary, w.boundary)
       LIMIT 1),
     -- c. fallback with just area + code
     'Sub-basin ' || ROUND(w."areaKm2"::numeric)::text || ' km² (' || w.code || ')'
   )
 WHERE w.code LIKE 'HB-%'
   AND w.kind = 'sub_basin';

-- 2. Watersheds -----------------------------------------------------------
UPDATE "Watershed" w
   SET name = COALESCE(
     -- a. named river passing through (longest intersection wins)
     (SELECT
        -- Normalise 'Velu' -> 'Vel' since they're mapper variants of the same waterway
        CASE WHEN ws.name = 'Velu' THEN 'Vel' ELSE ws.name END
        || ' reach near ' || COALESCE(
            (SELECT v.name FROM "Village" v
              WHERE ST_DWithin(v.boundary, w.boundary, 15000)
              ORDER BY ST_Distance(v.boundary, w.boundary)
              LIMIT 1),
            'Pune')
        || ' (' || ROUND(w."areaKm2"::numeric)::text || ' km²)'
        FROM "WaterSource" ws
       WHERE ws.source IN ('osm', 'imported')
         AND ws.name IN ('Vel', 'Velu', 'Ghod', 'Bhima')
         AND ST_Intersects(ws.geom, w.boundary)
       ORDER BY ST_Length(ST_Intersection(ws.geom::geometry, w.boundary::geometry)::geography) DESC
       LIMIT 1),
     -- b. nearest village
     (SELECT v.name || ' watershed (' || ROUND(w."areaKm2"::numeric)::text || ' km²)'
        FROM "Village" v
       WHERE ST_DWithin(v.boundary, w.boundary, 8000)
       ORDER BY ST_Distance(v.boundary, w.boundary)
       LIMIT 1),
     -- c. fallback
     'Watershed ' || ROUND(w."areaKm2"::numeric)::text || ' km² (' || w.code || ')'
   )
 WHERE w.code LIKE 'HB-%'
   AND w.kind = 'watershed';

COMMIT;
