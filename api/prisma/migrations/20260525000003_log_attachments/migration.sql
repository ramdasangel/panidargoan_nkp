-- Attachments (photos, PDFs, images) for water source log entries.
-- The DB stores only the URL + metadata; the file itself lives on disk.
CREATE TABLE "WaterSourceLogAttachment" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "logId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WaterSourceLogAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WaterSourceLogAttachment_logId_idx" ON "WaterSourceLogAttachment"("logId");

ALTER TABLE "WaterSourceLogAttachment" ADD CONSTRAINT "WaterSourceLogAttachment_logId_fkey"
    FOREIGN KEY ("logId") REFERENCES "WaterSourceLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaterSourceLogAttachment" ADD CONSTRAINT "WaterSourceLogAttachment_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
