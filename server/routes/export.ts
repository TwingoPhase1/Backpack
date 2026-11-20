import { Router } from "express";
import JSZip from "jszip";
import path from "path";
import fs from "fs";
import { db, UPLOADS_DIR } from "../db.js";

const router = Router();

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_").trim();
}

// GET export note as converted Markdown file
router.get("/note/:id/markdown", (req, res) => {
  const note = db.getNoteById(req.params.id);
  if (!note) return res.status(404).json({ error: "Note introuvable" });

  const assets = db.getAssetsByNoteId(note.id);
  const host = req.get("host") || "localhost:5173";
  const protocol = req.protocol || "http";
  const baseUrl = `${protocol}://${host}`;

  // Mode: "url" (replaces with http://.../api/images/:id) or "relative" (replaces with ./images/...)
  const mode = (req.query.mode as string) || "url";

  let converted = note.content;

  // Regex to match asset://<id>
  // e.g. ![Caption](asset://img_abc123)
  converted = converted.replace(/asset:\/\/([a-zA-Z0-9_-]+)/g, (match, assetId) => {
    const asset = assets.find((a) => a.id === assetId);
    if (mode === "relative") {
      const safeName = asset ? sanitizeFilename(asset.name) : `${assetId}.png`;
      return `./images/${safeName}`;
    } else {
      return `${baseUrl}/api/images/${assetId}`;
    }
  });

  const filename = `${sanitizeFilename(note.title)}.md`;
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.send(converted);
});

// GET export note as ZIP archive (Markdown + images folder)
router.get("/note/:id/zip", async (req, res) => {
  const note = db.getNoteById(req.params.id);
  if (!note) return res.status(404).json({ error: "Note introuvable" });

  const assets = db.getAssetsByNoteId(note.id);
  const zip = new JSZip();

  // Mapping from assetId to relative path inside zip
  const assetPathMap: Record<string, string> = {};
  const imagesFolder = zip.folder("images");

  for (const asset of assets) {
    const safeName = sanitizeFilename(asset.name) || `${asset.id}.png`;
    const inZipPath = `images/${safeName}`;
    assetPathMap[asset.id] = `./${inZipPath}`;

    const filePath = path.resolve(UPLOADS_DIR, asset.fileName);
    if (fs.existsSync(filePath)) {
      const fileBuffer = fs.readFileSync(filePath);
      imagesFolder?.file(safeName, fileBuffer);
    }
  }

  // Replace asset:// in markdown content
  let converted = note.content.replace(/asset:\/\/([a-zA-Z0-9_-]+)/g, (match, assetId) => {
    return assetPathMap[assetId] || `./images/${assetId}.png`;
  });

  // Add metadata header to markdown
  const header = `---
title: "${note.title}"
date: "${note.createdAt}"
type: "${note.type}"
resource: "${note.resourceId}"
---

`;

  zip.file(`${sanitizeFilename(note.title)}.md`, header + converted);

  const zipContent = await zip.generateAsync({ type: "nodebuffer" });
  const filename = `${sanitizeFilename(note.title)}_bundle.zip`;

  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
  res.setHeader("Content-Type", "application/zip");
  res.send(zipContent);
});

export default router;
