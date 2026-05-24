-- Enums
CREATE TYPE "WaterSourceType" AS ENUM (
    'river',
    'stream',
    'canal',
    'pond',
    'lake',
    'well',
    'borewell',
    'check_dam',
    'bandhara',
    'kt_weir',
    'percolation_tank',
    'farm_pond',
    'spring',
    'other'
);

-- Watershed (self-referencing tree). Level 1 = macro (river basin); higher = finer subdivisions.
CREATE TABLE "Watershed" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "parentId" TEXT,
    "areaKm2" DOUBLE PRECISION,
    "boundary" geography(MultiPolygon, 4326),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Watershed_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Watershed_code_key" ON "Watershed"("code");
CREATE INDEX "Watershed_parentId_idx" ON "Watershed"("parentId");
CREATE INDEX "Watershed_level_idx" ON "Watershed"("level");
CREATE INDEX "Watershed_boundary_idx" ON "Watershed" USING GIST ("boundary");
ALTER TABLE "Watershed" ADD CONSTRAINT "Watershed_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "Watershed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Water source. Geometry can be point/line/polygon depending on type.
CREATE TABLE "WaterSource" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WaterSourceType" NOT NULL,
    "watershedId" TEXT,
    "capacityM3" DOUBLE PRECISION,
    "depthM" DOUBLE PRECISION,
    "condition" TEXT,
    "notes" TEXT,
    "geom" geography(Geometry, 4326) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WaterSource_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WaterSource_code_key" ON "WaterSource"("code");
CREATE INDEX "WaterSource_watershedId_idx" ON "WaterSource"("watershedId");
CREATE INDEX "WaterSource_type_idx" ON "WaterSource"("type");
CREATE INDEX "WaterSource_geom_idx" ON "WaterSource" USING GIST ("geom");
ALTER TABLE "WaterSource" ADD CONSTRAINT "WaterSource_watershedId_fkey"
    FOREIGN KEY ("watershedId") REFERENCES "Watershed"("id") ON DELETE SET NULL ON UPDATE CASCADE;
