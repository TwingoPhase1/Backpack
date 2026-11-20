import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { nextcloudService } from "../services/nextcloudService.js";
import { db } from "../db.js";

const router = Router();

// GET /api/nextcloud/status
router.get("/status", async (req, res) => {
  try {
    const creds = (req as any).credentials;
    const status = await nextcloudService.getStatus(creds);
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/nextcloud/files?path=...&refresh=...
router.get("/files", async (req, res) => {
  try {
    const remotePath = (req.query.path as string) || "/";
    const forceRefresh = req.query.refresh === "true";
    const creds = (req as any).credentials;
    const items = await nextcloudService.listFiles(remotePath, forceRefresh, creds);
    res.json({ path: remotePath, items });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/nextcloud/download?path=...
router.get("/download", async (req, res) => {
  try {
    const remotePath = req.query.path as string;
    if (!remotePath) {
      return res.status(400).json({ error: "Paramètre path requis" });
    }

    const creds = (req as any).credentials;
    const { buffer, contentType, filename } = await nextcloudService.getFileBuffer(remotePath, creds);

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/nextcloud/resource/:code
router.get("/resource/:code", async (req, res) => {
  try {
    const code = req.params.code;
    const creds = (req as any).credentials;
    const items = await nextcloudService.getFilesForResource(code, creds);
    res.json(items);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/nextcloud/import-note
router.post("/import-note", async (req, res) => {
  try {
    const { remotePath, resourceId, type, title } = req.body;
    if (!remotePath || !resourceId || !type) {
      return res.status(400).json({ error: "remotePath, resourceId et type (CM|TP) requis" });
    }

    const creds = (req as any).credentials;
    const userDb = (req as any).userDb || db;
    const text = await nextcloudService.getFileText(remotePath, creds);
    const filename = remotePath.split("/").pop() || "Note importée";
    const cleanTitle = title || filename.replace(/\.(md|markdown|txt)$/i, "");

    const newNote = userDb.createNote({
      id: `note-${uuidv4()}`,
      resourceId,
      type,
      title: cleanTitle,
      content: text,
      status: type === "TP" ? "En cours" : undefined,
      objectives: [],
      cmDate: new Date().toISOString().split("T")[0],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    res.status(201).json(newNote);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/nextcloud/export-note
router.post("/export-note", async (req, res) => {
  try {
    const { noteId, remoteDir } = req.body;
    if (!noteId) {
      return res.status(400).json({ error: "noteId requis" });
    }

    const creds = (req as any).credentials;
    const userDb = (req as any).userDb || db;
    const note = userDb.getNoteById(noteId);
    if (!note) {
      return res.status(404).json({ error: "Note introuvable" });
    }

    const targetDir = remoteDir || "/COURS_2026-2027";
    const safeTitle = note.title.replace(/[\/\\?%*:|"<>]/g, "-").trim() || "Note";
    const targetPath = `${targetDir.replace(/\/+$/, "")}/${safeTitle}.md`;

    await nextcloudService.uploadFile(targetPath, note.content, "text/markdown; charset=utf-8", creds);

    res.json({
      success: true,
      message: `Note exportée avec succès vers UniCloud : ${targetPath}`,
      path: targetPath,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
