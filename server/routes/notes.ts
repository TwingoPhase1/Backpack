import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db.js";
import { nextcloudService } from "../services/nextcloudService.js";

const router = Router();

function getNoteRemotePath(currentDb: typeof db, note: { resourceId: string; type: "CM" | "TD" | "TP"; title: string; chapterNumber?: number }): string {
  const resource = currentDb
    .getResources()
    .find((r) => r.id === note.resourceId || r.code === note.resourceId);
  return nextcloudService.buildCourseRemotePath({
    semester: resource?.semester,
    resourceCode: resource?.code || note.resourceId,
    category: note.type,
    title: note.title,
    chapterNumber: note.chapterNumber,
    extension: "md",
  });
}

// GET notes with filters
router.get("/", (req, res) => {
  const currentDb = req.userDb || db;
  const { resourceId, type } = req.query;
  const notes = currentDb.getNotes(resourceId as string | undefined, type as "CM" | "TD" | "TP" | undefined);
  res.json(notes);
});

// GET single note with its assets
router.get("/:id", (req, res) => {
  const currentDb = req.userDb || db;
  const note = currentDb.getNoteById(req.params.id);
  if (!note) return res.status(404).json({ error: "Note introuvable" });

  const assets = currentDb.getAssetsByNoteId(note.id);
  res.json({ ...note, assets });
});

// POST create note
router.post("/", async (req, res) => {
  const currentDb = req.userDb || db;
  const { resourceId, type, title, content, status, objectives, cmDate, chapterNumber } = req.body;
  if (!resourceId || !type || !title) {
    return res.status(400).json({ error: "resourceId, type et title requis" });
  }

  const newNote = currentDb.createNote({
    id: `note-${uuidv4()}`,
    resourceId,
    type,
    title,
    content: content || `# ${title}\n\n`,
    status: status || (type === "TP" || type === "TD" ? "En cours" : undefined),
    objectives: objectives || [],
    cmDate: cmDate || new Date().toISOString().split("T")[0],
    chapterNumber,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const remotePath = getNoteRemotePath(currentDb, newNote);
  nextcloudService
    .syncCourseDocumentToNextcloud(remotePath, newNote.content, "text/markdown; charset=utf-8", req.credentials)
    .catch((err) => console.warn("[UniCloud] Sauvegarde note ignorée :", err.message));

  res.status(201).json({ ...newNote, nextcloudPath: remotePath });
});

// PUT update note
router.put("/:id", async (req, res) => {
  const currentDb = req.userDb || db;
  const previous = currentDb.getNoteById(req.params.id);
  const updated = currentDb.updateNote(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: "Note introuvable" });

  const remotePath = getNoteRemotePath(currentDb, updated);
  if (previous && (previous.title !== updated.title || previous.type !== updated.type || previous.chapterNumber !== updated.chapterNumber)) {
    const oldPath = getNoteRemotePath(currentDb, previous);
    if (oldPath !== remotePath) {
      nextcloudService.deleteFile(oldPath, req.credentials).catch(() => {});
    }
  }
  nextcloudService
    .syncCourseDocumentToNextcloud(remotePath, updated.content, "text/markdown; charset=utf-8", req.credentials)
    .catch((err) => console.warn("[UniCloud] Mise à jour note ignorée :", err.message));

  res.json({ ...updated, nextcloudPath: remotePath });
});

// DELETE note
router.delete("/:id", (req, res) => {
  const currentDb = req.userDb || db;
  const existing = currentDb.getNoteById(req.params.id);
  const success = currentDb.deleteNote(req.params.id);
  if (!success) return res.status(404).json({ error: "Note introuvable" });

  if (existing) {
    const remotePath = getNoteRemotePath(currentDb, existing);
    nextcloudService.deleteFile(remotePath, req.credentials).catch(() => {});
  }
  res.json({ success: true });
});

export default router;
