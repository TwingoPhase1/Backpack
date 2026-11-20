import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { db, UPLOADS_DIR } from "../db.js";

const router = Router();

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".png";
    const assetId = "img_" + uuidv4().replace(/-/g, "").substring(0, 12);
    cb(null, `${assetId}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
});

// POST upload an image to a note's workspace
router.post("/upload/:noteId", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Aucun fichier image reçu" });
  }

  const noteId = req.params.noteId;
  const fileName = req.file.filename;
  // asset ID is the filename without extension
  const assetId = path.parse(fileName).name;
  const originalName = Buffer.from(req.file.originalname, "latin1").toString("utf8");

  const asset = db.createAsset({
    id: assetId,
    noteId,
    name: originalName,
    originalName: originalName,
    fileName,
    mimeType: req.file.mimetype,
    size: req.file.size,
    url: `/api/images/${assetId}`,
    createdAt: new Date().toISOString(),
  });

  res.status(201).json(asset);
});

// GET serve an image by its unique ID
router.get("/:id", (req, res) => {
  const assetId = req.params.id;
  const asset = db.getAssetById(assetId);

  let fileName = asset ? asset.fileName : null;

  // Fallback: search files in uploads directory starting with assetId
  if (!fileName) {
    const files = fs.readdirSync(UPLOADS_DIR);
    const found = files.find((f) => path.parse(f).name === assetId);
    if (found) fileName = found;
  }

  if (!fileName) {
    return res.status(404).json({ error: "Image introuvable" });
  }

  const filePath = path.resolve(UPLOADS_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Fichier physique introuvable" });
  }

  // Determine Content-Type
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  };
  const contentType = mimeTypes[ext] || "application/octet-stream";

  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "public, max-age=86400");
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});

// PUT rename image display name (Keeps immutable ID)
router.put("/:id", (req, res) => {
  const assetId = req.params.id;
  const { name } = req.body;
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Le nom de l'image est requis" });
  }

  const updated = db.updateAsset(assetId, { name: name.trim() });
  if (!updated) return res.status(404).json({ error: "Image introuvable" });

  res.json(updated);
});

// DELETE image
router.delete("/:id", (req, res) => {
  const success = db.deleteAsset(req.params.id);
  if (!success) return res.status(404).json({ error: "Image introuvable" });
  res.json({ success: true });
});

export default router;
