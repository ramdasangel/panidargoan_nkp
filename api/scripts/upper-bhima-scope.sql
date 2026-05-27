-- Define the Upper Bhima as the project's high-level watershed scope.
--
-- Hydrologically, "Upper Bhima" runs from the Western-Ghat source of the Bhima
-- down to the Ujjani Dam, covering Pune district + parts of Ahmednagar and
-- Solapur. CWC's authoritative figure is ~10,789 km^2.
--
-- We pick the project area as bbox (S 17.4, W 73.3, N 19.5, E 75.7) and compute
-- the actual polygon as ST_Union of HB sub-basins whose centroid falls inside
-- that bbox. This produces a real hydrologically-aligned boundary, not a naked
-- rectangle.
--
-- After running:
--   * WS-UPPER-BHIMA is inserted as a sub_basin (level 1, parent = WS-BHIMA)
--   * Every HB-* sub_basin (lev08) inside the bbox is reparented to WS-UPPER-BHIMA
--   * WS-BHIMA-GHOD is reparented to WS-UPPER-BHIMA so the seeded Ghod tree
--     hangs under the project scope
--
-- HB-* sub_basins OUTSIDE the bbox (e.g. Godavari headwaters that crept in
-- when we imported with a Pune-buffer ROI) remain parented to WS-BHIMA and
-- will be hidden by the API tree filter (root=WS-UPPER-BHIMA).
--
-- Re-runnable: uses NOT EXISTS guard on insert and matches by bbox each time.

BEGIN;

-- 1. Compute the union polygon + total area + insert/refresh WS-UPPER-BHIMA
WITH bbox AS (
  SELECT ST_MakeEnvelope(73.3, 17.4, 75.7, 19.5, 4326) AS g
),
members AS (
  SELECT w.id, w.boundary, w."areaKm2"
    FROM "Watershed" w, bbox
   WHERE w.code LIKE 'HB-%'
     AND w.kind  = 'sub_basin'
     AND ST_Within(ST_Centroid(w.boundary::geometry), bbox.g)
),
agg AS (
  SELECT ST_Multi(ST_Union(m.boundary::geometry))::geography AS poly,
         SUM(m."areaKm2") AS area_sum
    FROM members m
)
INSERT INTO "Watershed" (id, code, name, kind, level, "parentId", "areaKm2", boundary)
SELECT gen_random_uuid(),
       'WS-UPPER-BHIMA',
       'Upper Bhima',
       'sub_basin',
       1,
       (SELECT id FROM "Watershed" WHERE code = 'WS-BHIMA'),
       agg.area_sum,
       agg.poly
  FROM agg
ON CONFLICT (code) DO UPDATE
   SET name      = EXCLUDED.name,
       kind      = EXCLUDED.kind,
       level     = EXCLUDED.level,
       "parentId" = EXCLUDED."parentId",
       "areaKm2" = EXCLUDED."areaKm2",
       boundary  = EXCLUDED.boundary;

-- 2. Reparent contained HB sub_basins to WS-UPPER-BHIMA
WITH bbox AS (
  SELECT ST_MakeEnvelope(73.3, 17.4, 75.7, 19.5, 4326) AS g
),
ub AS (SELECT id FROM "Watershed" WHERE code = 'WS-UPPER-BHIMA')
UPDATE "Watershed" w
   SET "parentId" = (SELECT id FROM ub)
  FROM bbox
 WHERE w.code LIKE 'HB-%'
   AND w.kind  = 'sub_basin'
   AND ST_Within(ST_Centroid(w.boundary::geometry), bbox.g);

-- 3. Reparent the seeded Ghod Sub-basin so it lives under Upper Bhima
UPDATE "Watershed"
   SET "parentId" = (SELECT id FROM "Watershed" WHERE code = 'WS-UPPER-BHIMA')
 WHERE code = 'WS-BHIMA-GHOD';

COMMIT;

-- Summary (informational)
SELECT
  (SELECT COUNT(*) FROM "Watershed" w, (SELECT id FROM "Watershed" WHERE code='WS-UPPER-BHIMA') ub
    WHERE w."parentId" = ub.id) AS direct_children_of_upper_bhima,
  (SELECT ROUND("areaKm2") FROM "Watershed" WHERE code = 'WS-UPPER-BHIMA') AS upper_bhima_km2;
