import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db.js";
import { nextcloudService } from "../services/nextcloudService.js";
import { BentoDoc, SlideDeckItem } from "../../src/types/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATE_PATH = path.resolve(__dirname, "../templates/bento_slides_template.html");
const BLANK_PATH = path.resolve(__dirname, "../templates/bento_slides_blank.html");

const router = Router();

function getSlideRemotePath(currentDb: typeof db, deck: { resourceCode?: string; title: string }): string {
  const resource = deck.resourceCode
    ? currentDb.getResources().find((r) => r.code === deck.resourceCode || r.id === deck.resourceCode)
    : undefined;
  return nextcloudService.buildCourseRemotePath({
    semester: resource?.semester,
    resourceCode: resource?.code || deck.resourceCode,
    category: "DIAPO",
    title: deck.title,
    extension: "json",
  });
}

// Helper to escape < inside JSON script tag
function escapeBentoJson(obj: any): string {
  return JSON.stringify(obj, null, 2).replace(/</g, "\\u003c");
}

// Read template file safely
function getTemplateHtml(): string {
  if (fs.existsSync(TEMPLATE_PATH)) {
    return fs.readFileSync(TEMPLATE_PATH, "utf-8");
  }
  const publicPath = path.resolve(__dirname, "../../public/bento/bento_slides_template.html");
  if (fs.existsSync(publicPath)) {
    return fs.readFileSync(publicPath, "utf-8");
  }
  throw new Error("Modele Bento Slides introuvable sur le serveur");
}

// Create an empty deck for a resource or general use
function createEmptyDeck(resourceCode?: string, title?: string): SlideDeckItem {
  const deckTitle = title?.trim() || (resourceCode ? `Diaporama ${resourceCode}` : "Nouveau Diaporama");
  const emptyDoc: BentoDoc = {
    format: "bento/slides",
    schema: "bento/slides",
    version: 1,
    docId: `doc-${uuidv4()}`,
    title: deckTitle,
    size: { width: 1280, height: 720 },
    theme: {
      font: "Inter",
      fontFamily: "Inter, system-ui, sans-serif",
      background: "#0f172a",
      color: "#f8fafc",
      accent: "#3b82f6",
    },
    aspect: "16:9",
    slides: [
      {
        id: "slide-1",
        background: "#0f172a",
        transition: "fade",
        elements: [],
        notes: "",
      },
    ],
  };

  const now = new Date().toISOString();
  return {
    id: `deck-${uuidv4()}`,
    title: deckTitle,
    description: "",
    resourceCode: resourceCode || undefined,
    slideCount: 1,
    doc: emptyDoc,
    createdAt: now,
    updatedAt: now,
  };
}

// GET /api/slides - List slide decks, optional filter by resourceCode
router.get("/", (req, res) => {
  try {
    const currentDb = (req as any).userDb || db;
    let slides = currentDb.getSlides();
    const { resourceCode } = req.query;

    if (resourceCode && typeof resourceCode === "string") {
      slides = slides.filter((s: SlideDeckItem) => s.resourceCode === resourceCode);
      // If none exist for this specific resource, automatically create one empty deck
      if (slides.length === 0) {
        const empty = createEmptyDeck(resourceCode);
        currentDb.saveSlide(empty);
        slides = [empty];
      }
    }

    res.json(slides);
  } catch (error: any) {
    console.error("[-] Erreur GET /api/slides:", error);
    res.status(500).json({ error: "Erreur lors de la recuperation des diaporamas" });
  }
});

// GET /api/slides/:id - Get deck detail
router.get("/:id", (req, res) => {
  try {
    const currentDb = (req as any).userDb || db;
    const deck = currentDb.getSlideById(req.params.id);
    if (!deck) {
      return res.status(404).json({ error: "Diaporama introuvable" });
    }
    res.json(deck);
  } catch (error: any) {
    console.error(`[-] Erreur GET /api/slides/${req.params.id}:`, error);
    res.status(500).json({ error: "Erreur lors de la recuperation du diaporama" });
  }
});

// POST /api/slides - Create new slide deck (empty by default)
router.post("/", (req, res) => {
  try {
    const currentDb = (req as any).userDb || db;
    const { title, description, resourceCode, doc } = req.body;

    const newDeck = doc ? {
      id: `deck-${uuidv4()}`,
      title: title?.trim() || doc.title || "Nouveau Diaporama",
      description: description || "",
      resourceCode: resourceCode || undefined,
      slideCount: doc.slides?.length || 1,
      doc,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } : createEmptyDeck(resourceCode, title);

    if (description) newDeck.description = description;

    const saved = currentDb.saveSlide(newDeck);
    const remotePath = getSlideRemotePath(currentDb, saved);
    nextcloudService
      .syncCourseDocumentToNextcloud(
        remotePath,
        JSON.stringify(saved.doc, null, 2),
        "application/json; charset=utf-8",
        (req as any).credentials
      )
      .catch((err) => console.warn("[UniCloud] Sauvegarde diapo ignorée :", err.message));

    res.status(201).json({ ...saved, nextcloudPath: remotePath });
  } catch (error: any) {
    console.error("[-] Erreur POST /api/slides:", error);
    res.status(500).json({ error: "Erreur lors de la creation du diaporama" });
  }
});

// PUT /api/slides/:id - Update existing slide deck
router.put("/:id", (req, res) => {
  try {
    const currentDb = (req as any).userDb || db;
    const existing = currentDb.getSlideById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Diaporama introuvable" });
    }

    const { title, description, resourceCode, doc } = req.body;
    const updatedDoc: BentoDoc = doc || existing.doc;

    const updated: SlideDeckItem = {
      ...existing,
      title: title?.trim() || existing.title,
      description: description !== undefined ? description : existing.description,
      resourceCode: resourceCode !== undefined ? resourceCode : existing.resourceCode,
      doc: updatedDoc,
      slideCount: updatedDoc?.slides?.length ?? existing.slideCount,
      updatedAt: new Date().toISOString(),
    };

    const saved = currentDb.saveSlide(updated);
    const remotePath = getSlideRemotePath(currentDb, saved);
    if (existing.title !== saved.title || existing.resourceCode !== saved.resourceCode) {
      const oldPath = getSlideRemotePath(currentDb, existing);
      if (oldPath !== remotePath) {
        nextcloudService.deleteFile(oldPath, (req as any).credentials).catch(() => {});
      }
    }
    nextcloudService
      .syncCourseDocumentToNextcloud(
        remotePath,
        JSON.stringify(saved.doc, null, 2),
        "application/json; charset=utf-8",
        (req as any).credentials
      )
      .catch((err) => console.warn("[UniCloud] Mise à jour diapo ignorée :", err.message));

    res.json({ ...saved, nextcloudPath: remotePath });
  } catch (error: any) {
    console.error(`[-] Erreur PUT /api/slides/${req.params.id}:`, error);
    res.status(500).json({ error: "Erreur lors de la mise a jour du diaporama" });
  }
});

// DELETE /api/slides/:id - Delete a deck
router.delete("/:id", (req, res) => {
  try {
    const currentDb = (req as any).userDb || db;
    const existing = currentDb.getSlideById(req.params.id);
    const deleted = currentDb.deleteSlide(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Diaporama introuvable" });
    }
    if (existing) {
      const remotePath = getSlideRemotePath(currentDb, existing);
      nextcloudService.deleteFile(remotePath, (req as any).credentials).catch(() => {});
    }
    res.json({ success: true, message: "Diaporama supprime avec succes" });
  } catch (error: any) {
    console.error(`[-] Erreur DELETE /api/slides/${req.params.id}:`, error);
    res.status(500).json({ error: "Erreur lors de la suppression du diaporama" });
  }
});

// GET /api/slides/:id/download - Export standalone .bento.html file
router.get("/:id/download", (req, res) => {
  try {
    const currentDb = (req as any).userDb || db;
    const deck = currentDb.getSlideById(req.params.id);
    if (!deck) {
      return res.status(404).json({ error: "Diaporama introuvable" });
    }

    const templateHtml = getTemplateHtml();
    const docJson = escapeBentoJson(deck.doc || {
      schema: "bento/slides",
      version: 1,
      title: deck.title,
      aspect: "16:9",
      slides: [],
    });

    const standaloneHtml = templateHtml.replace(
      /<script type="application\/bento\+json" id="bento-doc">[\s\S]*?<\/script>/,
      `<script type="application/bento+json" id="bento-doc">\n${docJson}\n</script>`
    );

    const safeTitle = deck.title.replace(/[^a-zA-Z0-9_\-\u00C0-\u017F\s]/g, "").trim().replace(/\s+/g, "_") || "diaporama";
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(safeTitle)}.bento.html"`);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(standaloneHtml);
  } catch (error: any) {
    console.error(`[-] Erreur export standalone /api/slides/${req.params.id}/download:`, error);
    res.status(500).json({ error: "Erreur lors de l'export du diaporama" });
  }
});

export default router;
