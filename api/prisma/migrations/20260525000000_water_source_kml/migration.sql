-- Add KML column so we can store the original KML text alongside the parsed
-- PostGIS geometry. Useful for exporting back to Google Earth / round-tripping
-- through tools that prefer KML.
ALTER TABLE "WaterSource" ADD COLUMN "kml" TEXT;
