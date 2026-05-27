-- Add 'srtm_nasa' to WaterSourceOrigin so DEM-derived streamlines can be
-- distinguished from OSM-imported ones in the auto-sourced layer.
--
-- Postgres requires ALTER TYPE ... ADD VALUE outside a transaction block;
-- Prisma runs each migration in its own implicit transaction. Using
-- IF NOT EXISTS keeps the statement re-runnable on systems where the value
-- was already added manually.
ALTER TYPE "WaterSourceOrigin" ADD VALUE IF NOT EXISTS 'srtm_nasa';
