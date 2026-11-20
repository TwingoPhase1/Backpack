import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import resourcesRouter from "./routes/resources.js";
import notesRouter from "./routes/notes.js";
import imagesRouter from "./routes/images.js";
import exportRouter from "./routes/export.js";
import scheduleRouter from "./routes/schedule.js";
import gradesRouter from "./routes/grades.js";
import moodleRouter from "./routes/moodle.js";
import nextcloudRouter from "./routes/nextcloud.js";
import mailRouter from "./routes/mail.js";
import authRouter from "./routes/auth.js";
import plannerRouter from "./routes/planner.js";
import backupRouter from "./routes/backup.js";
import aiRouter from "./routes/ai.js";
import crousRouter from "./routes/crous.js";
import slidesRouter from "./routes/slides.js";
import qcmsRouter from "./routes/qcms.js";
import { requireAuth } from "./middleware/auth.js";
import { startGradeScheduler } from "./services/scheduler.js";
import { PORT } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Route d'authentification publique
app.use("/api/auth", authRouter);

// Routes protégées par authentification (isolation par étudiant)
app.use("/api/resources", requireAuth, resourcesRouter);
app.use("/api/notes", requireAuth, notesRouter);
app.use("/api/images", imagesRouter); // accessible avec token ou pour les assets publics
app.use("/api/export", requireAuth, exportRouter);
app.use("/api/schedule", requireAuth, scheduleRouter);
app.use("/api/grades", requireAuth, gradesRouter);
app.use("/api/moodle", requireAuth, moodleRouter);
app.use("/api/nextcloud", requireAuth, nextcloudRouter);
app.use("/api/mail", requireAuth, mailRouter);
app.use("/api/planner", requireAuth, plannerRouter);
app.use("/api/backup", requireAuth, backupRouter);
app.use("/api/ai", requireAuth, aiRouter);
app.use("/api/crous", requireAuth, crousRouter);
app.use("/api/slides", requireAuth, slidesRouter);
app.use("/api/qcms", requireAuth, qcmsRouter);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// En production ou dans Docker, servir le frontend compilé
const distDir = path.resolve(__dirname, "../dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.resolve(distDir, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`🚀 Serveur Cartable Numérique démarré sur http://localhost:${PORT}`);
  // Start automatic 2x/day Webnotes scraper
  startGradeScheduler();
});
