import { Router } from "express";
import { getObjectStream } from "../storage.js";

export const uploadsRouter = Router();

// Stream the object from MinIO back to the client.
// Anyone with a valid URL can download; authentication is enforced at upload time.
uploadsRouter.get(/.+/, async (req, res) => {
  // req.path will be "/logs/<id>/<file>" — strip leading slash to get the key.
  const key = req.path.replace(/^\//, "");
  if (!key) return res.status(400).end();
  try {
    const { body, contentType, contentLength } = await getObjectStream(key);
    if (contentType)   res.setHeader("Content-Type", contentType);
    if (contentLength) res.setHeader("Content-Length", contentLength.toString());
    res.setHeader("Cache-Control", "public, max-age=3600");
    body.pipe(res);
    body.on("error", (e) => {
      console.error("[uploads] stream error:", e);
      if (!res.headersSent) res.status(500).end();
    });
  } catch (e) {
    const code = (e as { name?: string; Code?: string }).Code ?? (e as { name?: string }).name;
    if (code === "NoSuchKey" || code === "NotFound") return res.status(404).end();
    console.error("[uploads] error:", e);
    res.status(500).end();
  }
});
