import { Router } from "express";
import { db } from "../db.js";
import { scrapeWebnotes } from "../services/webnotesScraper.js";
import { runWebnotesSync } from "../services/scheduler.js";
import { authService } from "../services/authService.js";

const router = Router();

// GET all grades / semester reports
router.get("/", (req, res) => {
  const currentDb = req.userDb || db;
  const grades = currentDb.getGrades();
  res.json(grades);
});

// GET recent & newly detected grades + sync status (for Dashboard)
router.get("/recent", (req, res) => {
  const currentDb = req.userDb || db;
  const recentGrades = currentDb.getRecentGrades();
  const syncStatus = currentDb.getSyncStatus();
  res.json({
    recentGrades,
    syncStatus,
  });
});

// POST mark grades as read
router.post("/mark-read", (req, res) => {
  const currentDb = req.userDb || db;
  const { id } = req.body;
  currentDb.markGradeAsRead(id);
  res.json({
    success: true,
    syncStatus: currentDb.getSyncStatus(),
    recentGrades: currentDb.getRecentGrades(),
  });
});

// POST trigger immediate automated 2x/day style sync (uses active session + 2FA first)
router.post("/sync-now", async (req, res) => {
  const currentDb = req.userDb || db;
  const sessionCreds = req.credentials;

  if (sessionCreds?.username && sessionCreds?.password) {
    try {
      const secrets = authService.getUser2FASecrets(sessionCreds.username);
      const reports = await scrapeWebnotes({
        username: sessionCreds.username,
        password: sessionCreds.password,
        totpSecret: secrets?.totpSecret,
        grid: secrets?.grid,
        preferredMethod: secrets?.preferredMethod,
      });

      if (reports.length > 0) {
        const { newlyDetected } = currentDb.setGrades(reports);
        currentDb.updateSyncStatus({
          lastSyncTime: new Date().toISOString(),
          lastSyncResult: "success",
          lastSyncMessage: `Succès : ${reports.length} semestre(s) synchronisé(s), ${newlyDetected.length} nouvelle(s) note(s)`,
        });
        return res.json({
          success: true,
          message: `Synchronisation réussie : ${reports.length} semestre(s), ${newlyDetected.length} nouvelle(s) note(s)`,
          newlyDetected,
          recentGrades: currentDb.getRecentGrades(),
          syncStatus: currentDb.getSyncStatus(),
        });
      }
    } catch (err: any) {
      currentDb.updateSyncStatus({
        lastSyncTime: new Date().toISOString(),
        lastSyncResult: "error",
        lastSyncMessage: err.message,
      });
      return res.status(500).json({
        success: false,
        error: err.message || "Erreur lors de la synchronisation Webnotes",
        syncStatus: currentDb.getSyncStatus(),
      });
    }
  }

  const result = await runWebnotesSync();
  if (result.success) {
    res.json({
      success: true,
      message: `Synchronisation réussie : ${result.reportsCount} semestre(s), ${result.newlyDetected.length} nouvelle(s) note(s)`,
      newlyDetected: result.newlyDetected,
      recentGrades: currentDb.getRecentGrades(),
      syncStatus: currentDb.getSyncStatus(),
    });
  } else {
    res.status(500).json({
      success: false,
      error: result.error || "Erreur lors de la synchronisation",
      syncStatus: currentDb.getSyncStatus(),
    });
  }
});

// GET grades for a specific resource (e.g. R101, R107, R201...)
router.get("/resource/:code", (req, res) => {
  const currentDb = req.userDb || db;
  const code = req.params.code.toUpperCase();
  const grades = currentDb.getGradesByResourceId(code);
  res.json(grades);
});

// POST trigger live scrape from webnotes.unicaen.fr with session or custom credentials
router.post("/sync", async (req, res) => {
  const currentDb = req.userDb || db;
  const { username, password, sessionCookie } = req.body || {};
  const sessionCreds = req.credentials;

  const entUser = username || sessionCreds?.username;
  const entPass = password || sessionCreds?.password;
  const sess = sessionCookie;

  if (!sess && (!entUser || !entPass || entUser === "22xxxxx")) {
    return res.status(400).json({
      error: "Veuillez renseigner votre identifiant/mot de passe ENT ou votre cookie PHPSESSID",
    });
  }

  try {
    const secrets = entUser ? authService.getUser2FASecrets(entUser) : undefined;
    const reports = await scrapeWebnotes({
      username: entUser,
      password: entPass,
      sessionCookie: sess,
      totpSecret: secrets?.totpSecret,
      grid: secrets?.grid,
      preferredMethod: secrets?.preferredMethod,
    });

    if (reports.length > 0) {
      const { newlyDetected } = currentDb.setGrades(reports);
      return res.json({
        success: true,
        message: `Synchronisation réussie : ${reports.length} semestre(s) importé(s)`,
        newlyDetected,
        reports,
      });
    } else {
      return res.status(404).json({ error: "Aucun semestre trouvé sur Webnotes" });
    }
  } catch (err: any) {
    console.error("Erreur scrapeWebnotes:", err);
    return res.status(500).json({
      error: `Erreur lors de la synchronisation Webnotes : ${err.message}`,
    });
  }
});

export default router;
