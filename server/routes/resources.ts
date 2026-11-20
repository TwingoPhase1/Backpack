import { Router } from "express";
import { db } from "../db.js";

const router = Router();

// GET all resources
router.get("/", (req, res) => {
  const currentDb = req.userDb || db;
  const resources = currentDb.getResources();
  res.json(resources);
});

// GET single resource
router.get("/:id", (req, res) => {
  const currentDb = req.userDb || db;
  const resource = currentDb.getResourceById(req.params.id);
  if (!resource) return res.status(404).json({ error: "Ressource introuvable" });
  res.json(resource);
});

// POST new resource
router.post("/", (req, res) => {
  const currentDb = req.userDb || db;
  const { code, name, shortName, semester, category, emoji, color, teacher, coefs, description } = req.body;
  if (!code || !name) {
    return res.status(400).json({ error: "Code et nom obligatoires" });
  }

  const newRes = currentDb.createResource({
    id: code.trim(),
    code: code.trim(),
    name: name.trim(),
    shortName: shortName?.trim() || name.trim(),
    semester: semester === 2 ? 2 : 1,
    category: category === "SAE" ? "SAE" : "Ressource",
    emoji: emoji || (category === "SAE" ? "🚀" : "📚"),
    color: color || "#3b82f6",
    teacher,
    coefs: coefs || {},
    description,
  });

  res.status(201).json(newRes);
});

// PUT update resource
router.put("/:id", (req, res) => {
  const currentDb = req.userDb || db;
  const updated = currentDb.updateResource(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: "Ressource introuvable" });
  res.json(updated);
});

// DELETE resource
router.delete("/:id", (req, res) => {
  const currentDb = req.userDb || db;
  const success = currentDb.deleteResource(req.params.id);
  if (!success) return res.status(404).json({ error: "Ressource introuvable" });
  res.json({ success: true });
});

export default router;
