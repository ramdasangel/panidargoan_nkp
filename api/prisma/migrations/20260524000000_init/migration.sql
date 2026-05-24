-- Extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enums
CREATE TYPE "Role" AS ENUM ('admin', 'project_manager', 'field_user', 'viewer');

-- User
CREATE TABLE "User" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "googleSub" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");

-- Country
CREATE TABLE "Country" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "boundary" geography(MultiPolygon, 4326),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Country_code_key" ON "Country"("code");
CREATE INDEX "Country_boundary_idx" ON "Country" USING GIST ("boundary");

-- State
CREATE TABLE "State" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "boundary" geography(MultiPolygon, 4326),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "State_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "State_code_key" ON "State"("code");
CREATE INDEX "State_boundary_idx" ON "State" USING GIST ("boundary");
ALTER TABLE "State" ADD CONSTRAINT "State_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- District
CREATE TABLE "District" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stateId" TEXT NOT NULL,
    "boundary" geography(MultiPolygon, 4326),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "District_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "District_code_key" ON "District"("code");
CREATE INDEX "District_boundary_idx" ON "District" USING GIST ("boundary");
ALTER TABLE "District" ADD CONSTRAINT "District_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "State"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Taluka
CREATE TABLE "Taluka" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "boundary" geography(MultiPolygon, 4326),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Taluka_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Taluka_code_key" ON "Taluka"("code");
CREATE INDEX "Taluka_boundary_idx" ON "Taluka" USING GIST ("boundary");
ALTER TABLE "Taluka" ADD CONSTRAINT "Taluka_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Village
CREATE TABLE "Village" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "talukaId" TEXT NOT NULL,
    "population" INTEGER,
    "cattleCount" INTEGER,
    "sheepGoatCount" INTEGER,
    "otherLivestockCount" INTEGER,
    "avgSlopePercent" DOUBLE PRECISION,
    "boundary" geography(MultiPolygon, 4326),
    "contours" geometry(MultiLineStringZ, 4326),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Village_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Village_code_key" ON "Village"("code");
CREATE INDEX "Village_boundary_idx" ON "Village" USING GIST ("boundary");
ALTER TABLE "Village" ADD CONSTRAINT "Village_talukaId_fkey" FOREIGN KEY ("talukaId") REFERENCES "Taluka"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
