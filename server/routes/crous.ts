import { Router } from "express";
import { crousService } from "../services/crousService.js";
import { CROUS_MENU_URL } from "../config.js";

const router = Router();

// GET /api/crous/menu
// Récupère le menu du jour du restaurant CROUS d'Ifs
router.get("/menu", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true" || req.query.refresh === "1";
    const data = await crousService.getMenu(forceRefresh);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || "Erreur lors de la récupération du menu CROUS",
      sourceUrl: CROUS_MENU_URL,
    });
  }
});

export default router;
