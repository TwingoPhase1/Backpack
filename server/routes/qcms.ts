import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db.js";
import { QCMQuiz } from "../../src/types/index.js";

const router = Router();

// GET /api/qcms?resourceCode=...
// Récupère la liste des QCMs (filtrée par ressource si spécifié)
router.get("/", (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const { resourceCode } = req.query;
    const qcms = currentDb.getQCMs(resourceCode as string | undefined);
    res.json(qcms);
  } catch (err: any) {
    res.status(500).json({ error: "Erreur lecture QCMs: " + err.message });
  }
});

// GET /api/qcms/:id
// Récupère un QCM complet par son ID
router.get("/:id", (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const qcm = currentDb.getQCMById(req.params.id);
    if (!qcm) {
      return res.status(404).json({ error: "QCM introuvable" });
    }
    res.json(qcm);
  } catch (err: any) {
    res.status(500).json({ error: "Erreur lecture QCM: " + err.message });
  }
});

// POST /api/qcms
// Enregistre un nouveau QCM
router.post("/", (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const incoming = req.body as Partial<QCMQuiz>;

    if (!incoming.resourceCode || !incoming.title || !Array.isArray(incoming.questions)) {
      return res.status(400).json({ error: "resourceCode, title et questions requis" });
    }

    const newQCM: QCMQuiz = {
      id: incoming.id || `qcm-${uuidv4()}`,
      resourceCode: incoming.resourceCode.toUpperCase(),
      resourceName: incoming.resourceName,
      title: incoming.title,
      difficulty: incoming.difficulty || "moyen",
      sourceType: incoming.sourceType || "topic",
      documentName: incoming.documentName,
      questions: incoming.questions,
      bestScore: incoming.bestScore,
      lastScore: incoming.lastScore,
      totalPoints: incoming.totalPoints || incoming.questions.length,
      attemptsCount: incoming.attemptsCount || 0,
      createdAt: incoming.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = currentDb.createQCM(newQCM);
    res.status(201).json(saved);
  } catch (err: any) {
    res.status(500).json({ error: "Erreur création QCM: " + err.message });
  }
});

// PUT /api/qcms/:id
// Met à jour un QCM
router.put("/:id", (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const updated = currentDb.updateQCM(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: "QCM introuvable" });
    }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: "Erreur mise à jour QCM: " + err.message });
  }
});

// POST /api/qcms/:id/attempt
// Enregistre le score d'une tentative sur le QCM
router.post("/:id/attempt", (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const { score, totalPoints } = req.body;

    if (score === undefined || typeof score !== "number") {
      return res.status(400).json({ error: "Score numérique requis" });
    }

    const updated = currentDb.recordQCMAttempt(req.params.id, score, totalPoints);
    if (!updated) {
      return res.status(404).json({ error: "QCM introuvable" });
    }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: "Erreur enregistrement tentative QCM: " + err.message });
  }
});

// DELETE /api/qcms/:id
// Supprime un QCM
router.delete("/:id", (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const deleted = currentDb.deleteQCM(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "QCM introuvable" });
    }
    res.json({ success: true, message: "QCM supprimé avec succès" });
  } catch (err: any) {
    res.status(500).json({ error: "Erreur suppression QCM: " + err.message });
  }
});

export default router;
