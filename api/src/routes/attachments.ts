import { Router } from "express";
import multer from "multer";
import crypto from "node:crypto";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { putObject, deleteObject } from "../storage.js";

// Document mime types accepted as attachments. Images are accepted via the
// "image/*" prefix check below — covers JPEG, PNG, WebP, GIF, HEIC, HEIF,
// TIFF, BMP, AVIF, SVG, etc.
const ALLOWED_DOC_MIME = new Set([
  // PDF
  "application/pdf",
  // Microsoft Office
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // OpenDocument
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  // Plain / structured text
  "text/plain", "text/csv", "text/tab-separated-values",
  "text/rtf", "application/rtf",
  "text/xml", "application/xml",
  "application/json",
  "text/markdown", "text/html",
  // Archives (sometimes used to bundle multiple docs)
  "application/zip", "application/x-zip-compressed",
  // Geo formats
  "application/vnd.google-earth.kml+xml", "application/vnd.google-earth.kmz",
  "application/geo+json",
]);

function isAllowedMime(mime: string): boolean {
  return mime.startsWith("image/") || ALLOWED_DOC_MIME.has(mime);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (isAllowedMime(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

export const attachmentsRouter = Router({ mergeParams: true });
attachmentsRouter.use(requireAuth);

attachmentsRouter.post(
  "/",
  requireRole("admin", "project_manager", "field_user"),
  (req, res, next) => {
    upload.array("files", 10)(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message ?? String(err) });
      next();
    });
  },
  async (req, res) => {
    const logId = (req.params as { logId: string }).logId;
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) return res.status(400).json({ error: "No files uploaded" });

    const log = await prisma.waterSourceLog.findUnique({ where: { id: logId }, select: { id: true } });
    if (!log) return res.status(404).json({ error: "Log not found" });

    const created = [];
    for (const f of files) {
      const id = crypto.randomBytes(6).toString("hex");
      const safe = f.originalname.replace(/[^\w.\-]/g, "_").slice(-80);
      const key = `logs/${logId}/${id}-${safe}`;
      try {
        await putObject(key, f.buffer, f.mimetype);
      } catch (e) {
        console.error("[attachments] upload failed:", e);
        return res.status(500).json({ error: "Storage upload failed" });
      }
      const row = await prisma.waterSourceLogAttachment.create({
        data: {
          logId,
          url: `/api/uploads/${key}`,
          filename: f.originalname,
          mimeType: f.mimetype,
          sizeBytes: f.size,
          uploadedById: req.user!.sub,
        },
      });
      created.push(row);
    }
    res.status(201).json(created);
  }
);

attachmentsRouter.delete(
  "/:attachmentId",
  requireRole("admin", "project_manager", "field_user"),
  async (req, res) => {
    const attId = (req.params as { attachmentId: string }).attachmentId;
    const att = await prisma.waterSourceLogAttachment.findUnique({ where: { id: attId } });
    if (!att) return res.status(404).json({ error: "Attachment not found" });

    if (req.user!.role !== "admin" && req.user!.role !== "project_manager"
        && att.uploadedById !== req.user!.sub) {
      return res.status(403).json({ error: "Not allowed" });
    }

    await prisma.waterSourceLogAttachment.delete({ where: { id: attId } });

    try {
      const key = att.url.replace(/^\/api\/uploads\//, "");
      await deleteObject(key);
    } catch { /* best effort */ }

    res.status(204).end();
  }
);
