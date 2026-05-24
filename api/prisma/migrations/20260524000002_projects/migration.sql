-- Enums
CREATE TYPE "ProjectStatus" AS ENUM ('planning', 'active', 'on_hold', 'completed', 'cancelled');
CREATE TYPE "TaskStatus" AS ENUM ('not_started', 'in_progress', 'blocked', 'completed');
CREATE TYPE "ResourceType" AS ENUM ('person', 'equipment', 'material', 'labor_crew');
CREATE TYPE "CostCategory" AS ENUM ('labor', 'materials', 'equipment', 'transport', 'overhead', 'other');
CREATE TYPE "GeoTargetType" AS ENUM ('village', 'water_source', 'watershed', 'custom_point', 'custom_polygon');

-- Project
CREATE TABLE "Project" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'planning',
    "startDate" DATE,
    "endDate" DATE,
    "actualStart" DATE,
    "actualEnd" DATE,
    "sponsor" TEXT,
    "budgetInr" NUMERIC(14, 2),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Task (allows subtasks via parentTaskId)
CREATE TABLE "Task" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "projectId" TEXT NOT NULL,
    "parentTaskId" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'not_started',
    "startDate" DATE,
    "endDate" DATE,
    "actualStart" DATE,
    "actualEnd" DATE,
    "plannedCostInr" NUMERIC(14, 2),
    "assigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Task_code_key" ON "Task"("code");
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");
CREATE INDEX "Task_parentTaskId_idx" ON "Task"("parentTaskId");
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentTaskId_fkey"
    FOREIGN KEY ("parentTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey"
    FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Resource (reusable catalog)
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ResourceType" NOT NULL,
    "unit" TEXT NOT NULL,
    "rateInr" NUMERIC(10, 2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Resource_code_key" ON "Resource"("code");

-- TaskResourceAllocation (planned)
CREATE TABLE "TaskResourceAllocation" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "taskId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "plannedQuantity" NUMERIC(12, 2) NOT NULL,
    "plannedUnitRateInr" NUMERIC(10, 2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskResourceAllocation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TaskResourceAllocation_taskId_idx" ON "TaskResourceAllocation"("taskId");
CREATE INDEX "TaskResourceAllocation_resourceId_idx" ON "TaskResourceAllocation"("resourceId");
ALTER TABLE "TaskResourceAllocation" ADD CONSTRAINT "TaskResourceAllocation_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskResourceAllocation" ADD CONSTRAINT "TaskResourceAllocation_resourceId_fkey"
    FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CostEntry (actuals — single source of truth)
CREATE TABLE "CostEntry" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "taskId" TEXT NOT NULL,
    "resourceId" TEXT,
    "entryDate" DATE NOT NULL,
    "quantity" NUMERIC(12, 2),
    "unitRateInr" NUMERIC(10, 2),
    "amountInr" NUMERIC(14, 2) NOT NULL,
    "category" "CostCategory" NOT NULL,
    "vendor" TEXT,
    "invoiceRef" TEXT,
    "notes" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CostEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CostEntry_taskId_idx" ON "CostEntry"("taskId");
CREATE INDEX "CostEntry_entryDate_idx" ON "CostEntry"("entryDate");
ALTER TABLE "CostEntry" ADD CONSTRAINT "CostEntry_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CostEntry" ADD CONSTRAINT "CostEntry_resourceId_fkey"
    FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CostEntry" ADD CONSTRAINT "CostEntry_recordedById_fkey"
    FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- TaskGeoLink: ties a task to one geo target. Exactly one of village/waterSource/watershed/customGeom is set.
CREATE TABLE "TaskGeoLink" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "taskId" TEXT NOT NULL,
    "targetType" "GeoTargetType" NOT NULL,
    "villageId" TEXT,
    "waterSourceId" TEXT,
    "watershedId" TEXT,
    "customGeom" geography(Geometry, 4326),
    "allocationPercent" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskGeoLink_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TaskGeoLink_exactly_one_target" CHECK (
        (CASE WHEN "villageId"     IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN "waterSourceId" IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN "watershedId"   IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN "customGeom"    IS NOT NULL THEN 1 ELSE 0 END) = 1
    )
);
CREATE INDEX "TaskGeoLink_taskId_idx" ON "TaskGeoLink"("taskId");
CREATE INDEX "TaskGeoLink_villageId_idx" ON "TaskGeoLink"("villageId");
CREATE INDEX "TaskGeoLink_waterSourceId_idx" ON "TaskGeoLink"("waterSourceId");
CREATE INDEX "TaskGeoLink_watershedId_idx" ON "TaskGeoLink"("watershedId");
CREATE INDEX "TaskGeoLink_customGeom_idx" ON "TaskGeoLink" USING GIST ("customGeom");
ALTER TABLE "TaskGeoLink" ADD CONSTRAINT "TaskGeoLink_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskGeoLink" ADD CONSTRAINT "TaskGeoLink_villageId_fkey"
    FOREIGN KEY ("villageId") REFERENCES "Village"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskGeoLink" ADD CONSTRAINT "TaskGeoLink_waterSourceId_fkey"
    FOREIGN KEY ("waterSourceId") REFERENCES "WaterSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskGeoLink" ADD CONSTRAINT "TaskGeoLink_watershedId_fkey"
    FOREIGN KEY ("watershedId") REFERENCES "Watershed"("id") ON DELETE CASCADE ON UPDATE CASCADE;
