-- Distinguish manually-created water sources from those imported from
-- online resources (OSM today; possibly Bhuvan / USGS / NHD tomorrow).
CREATE TYPE "WaterSourceOrigin" AS ENUM ('manual', 'osm', 'imported');

ALTER TABLE "WaterSource" ADD COLUMN "source" "WaterSourceOrigin" NOT NULL DEFAULT 'manual';

-- Backfill: anything previously imported via import-rivers.ts was tagged with
-- condition='imported_from_osm' OR has an OSM- code prefix.
UPDATE "WaterSource"
   SET "source" = 'osm'
 WHERE "condition" = 'imported_from_osm'
    OR "code" LIKE 'OSM-%';

CREATE INDEX "WaterSource_source_idx" ON "WaterSource"("source");
