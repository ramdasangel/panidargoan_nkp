-- Time-stamped monitoring log for each water source.
-- Schema follows common Indian water-monitoring norms (CGWB, CWC, IS 10500).
CREATE TABLE "WaterSourceLog" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "waterSourceId" TEXT NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loggedById" TEXT,

    -- Quantity
    "flowM3PerDay" DOUBLE PRECISION,
    "waterLevelCm" DOUBLE PRECISION,

    -- Quality
    "phLevel"      DOUBLE PRECISION,
    "tdsPpm"       DOUBLE PRECISION,
    "turbidityNtu" DOUBLE PRECISION,

    -- Physical
    "temperatureC" DOUBLE PRECISION,
    "condition"    TEXT,
    "notes"        TEXT,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WaterSourceLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WaterSourceLog_waterSourceId_idx" ON "WaterSourceLog"("waterSourceId");
CREATE INDEX "WaterSourceLog_loggedAt_idx" ON "WaterSourceLog"("loggedAt" DESC);

ALTER TABLE "WaterSourceLog" ADD CONSTRAINT "WaterSourceLog_waterSourceId_fkey"
    FOREIGN KEY ("waterSourceId") REFERENCES "WaterSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaterSourceLog" ADD CONSTRAINT "WaterSourceLog_loggedById_fkey"
    FOREIGN KEY ("loggedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
