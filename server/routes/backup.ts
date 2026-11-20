import { Router } from "express";
import { db } from "../db.js";
import { authService } from "../services/authService.js";

const router = Router();

// GET /api/backup/export (ou download)
router.get("/export", (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const username = req.user?.username || "etudiant";
    const dateStr = new Date().toISOString().split("T")[0];

    const notes = currentDb.getNotes();
    const stickyNotes = currentDb.getStickyNotes ? currentDb.getStickyNotes() : [];
    const lessons = currentDb.getLessons ? currentDb.getLessons() : [];

    const backupPayload = {
      app: "Cartable Numérique BUT RT",
      format: "cartable-backup",
      version: "1.0",
      exportedAt: new Date().toISOString(),
      user: {
        username: req.user?.username,
        name: req.user?.name,
        role: req.user?.role,
        department: req.user?.department,
      },
      stats: {
        notesCount: notes.length,
        stickyNotesCount: stickyNotes.length,
        lessonsCount: lessons.length,
      },
      data: currentDb.getBackupData(),
    };

    const filename = `backup-cartable-${username}-${dateStr}.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.send(JSON.stringify(backupPayload, null, 2));
  } catch (error: any) {
    console.error("[-] Erreur export backup :", error);
    res.status(500).json({ error: error.message || "Échec de l'exportation de la sauvegarde." });
  }
});

// POST /api/backup/import
router.post("/import", (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const { backupData, mode = "replace" } = req.body;

    if (!backupData) {
      return res.status(400).json({ error: "Aucune donnée de sauvegarde fournie." });
    }

    // Accepter le format standard { format: 'cartable-backup', data: {...} } ou direct {...}
    const targetData = backupData.data ? backupData.data : backupData;

    if (!targetData.notes && !targetData.stickyNotes && !targetData.lessons && !targetData.resources) {
      return res.status(400).json({
        error: "Format de fichier invalide. Aucune donnée Cartable Numérique reconnue.",
      });
    }

    const stats = currentDb.importBackup(targetData, mode === "merge" ? "merge" : "replace");

    res.json({
      success: true,
      message: `Restauration réussie (${stats.notesCount} notes, ${stats.stickyNotesCount} pense-bêtes, ${stats.lessonsCount} leçons).`,
      imported: stats,
    });
  } catch (error: any) {
    console.error("[-] Erreur import backup :", error);
    res.status(500).json({ error: error.message || "Échec de l'importation de la sauvegarde." });
  }
});

// POST /api/backup/reset
router.post("/reset", (req, res) => {
  try {
    const currentDb = req.userDb || db;
    currentDb.resetAllUserData();

    res.json({
      success: true,
      message: "Toutes vos données (cours, notes de TP/CM, pense-bêtes, cahier de texte) ont été réinitialisées.",
    });
  } catch (error: any) {
    console.error("[-] Erreur réinitialisation données :", error);
    res.status(500).json({ error: error.message || "Échec de la réinitialisation des données." });
  }
});

// DELETE /api/backup/account
router.delete("/account", (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Session non authentifiée." });
    }

    const { confirmUsername } = req.body || {};
    if (!confirmUsername || confirmUsername.trim().toLowerCase() !== req.user.username.trim().toLowerCase()) {
      return res.status(400).json({
        error: "Confirmation incorrecte. Veuillez saisir exactement votre identifiant ENT pour confirmer la suppression.",
      });
    }

    const deleted = authService.deleteAccount(req.user.username);
    if (!deleted) {
      return res.status(500).json({ error: "Impossible de supprimer le compte." });
    }

    res.json({
      success: true,
      message: "Votre compte et l'ensemble de vos données ont été définitivement supprimés.",
    });
  } catch (error: any) {
    console.error("[-] Erreur suppression compte :", error);
    res.status(500).json({ error: error.message || "Échec de la suppression du compte." });
  }
});

export default router;
