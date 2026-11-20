import { Router } from "express";
import { StickyNote, LessonItem, LessonReminder, ScheduleEvent } from "../../src/types/index.js";

const router = Router();

// ==========================================
// STICKY NOTES (Pense-bêtes / Post-it)
// ==========================================

router.get("/sticky-notes", (req, res) => {
  try {
    const userDb = req.userDb!;
    const resourceCode = (req.query.resourceCode as string) || undefined;
    const notes = userDb.getStickyNotes(resourceCode);
    res.json({ stickyNotes: notes });
  } catch (err: any) {
    res.status(500).json({ error: "Erreur lecture pense-bêtes : " + err.message });
  }
});

router.post("/sticky-notes", (req, res) => {
  try {
    const userDb = req.userDb!;
    const noteData: Partial<StickyNote> = req.body;
    if (!noteData.content && !noteData.title) {
      return res.status(400).json({ error: "Le titre ou le contenu du post-it est requis." });
    }
    const created = userDb.saveStickyNote(noteData);
    res.json({ stickyNote: created });
  } catch (err: any) {
    res.status(500).json({ error: "Erreur création post-it : " + err.message });
  }
});

router.put("/sticky-notes/:id", (req, res) => {
  try {
    const userDb = req.userDb!;
    const id = req.params.id;
    const noteData: Partial<StickyNote> = { ...req.body, id };
    const updated = userDb.saveStickyNote(noteData);
    res.json({ stickyNote: updated });
  } catch (err: any) {
    res.status(500).json({ error: "Erreur mise à jour post-it : " + err.message });
  }
});

router.delete("/sticky-notes/:id", (req, res) => {
  try {
    const userDb = req.userDb!;
    const id = req.params.id;
    const success = userDb.deleteStickyNote(id);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ error: "Erreur suppression post-it : " + err.message });
  }
});

// ==========================================
// LESSONS PLANNER (Cahier de Texte / Leçons)
// ==========================================

router.get("/lessons", (req, res) => {
  try {
    const userDb = req.userDb!;
    const resourceCode = (req.query.resourceCode as string) || undefined;
    const lessons = userDb.getLessons(resourceCode);
    res.json({ lessons });
  } catch (err: any) {
    res.status(500).json({ error: "Erreur lecture leçons : " + err.message });
  }
});

router.post("/lessons", (req, res) => {
  try {
    const userDb = req.userDb!;
    const lessonData: Partial<LessonItem> = req.body;
    if (!lessonData.title) {
      return res.status(400).json({ error: "Le titre de la leçon est obligatoire." });
    }
    const created = userDb.saveLesson(lessonData);
    res.json({ lesson: created });
  } catch (err: any) {
    res.status(500).json({ error: "Erreur création leçon : " + err.message });
  }
});

router.put("/lessons/:id", (req, res) => {
  try {
    const userDb = req.userDb!;
    const id = req.params.id;
    const lessonData: Partial<LessonItem> = { ...req.body, id };
    const updated = userDb.saveLesson(lessonData);
    res.json({ lesson: updated });
  } catch (err: any) {
    res.status(500).json({ error: "Erreur mise à jour leçon : " + err.message });
  }
});

router.delete("/lessons/:id", (req, res) => {
  try {
    const userDb = req.userDb!;
    const id = req.params.id;
    const success = userDb.deleteLesson(id);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ error: "Erreur suppression leçon : " + err.message });
  }
});

router.post("/lessons/:id/toggle", (req, res) => {
  try {
    const userDb = req.userDb!;
    const id = req.params.id;
    const toggled = userDb.toggleLessonCompleted(id);
    if (!toggled) {
      return res.status(404).json({ error: "Leçon non trouvée." });
    }
    res.json({ lesson: toggled });
  } catch (err: any) {
    res.status(500).json({ error: "Erreur bascule statut leçon : " + err.message });
  }
});

// ==========================================
// REMINDERS CALCULATION (Veille de Cours)
// ==========================================

router.get("/reminders", (req, res) => {
  try {
    const userDb = req.userDb!;
    const lessons = userDb.getLessons();
    const events = userDb.getScheduleEvents();
    const now = new Date();

    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const reminders: LessonReminder[] = [];

    // On traite uniquement les leçons non terminées avec rappel activé
    const activeLessons = lessons.filter((l) => !l.isCompleted && l.reminderEnabled !== false);

    for (const lesson of activeLessons) {
      // 1. Chercher le prochain cours de cette ressource
      const code = lesson.resourceCode?.trim().toUpperCase();
      const upcomingResourceEvents = events
        .filter((e) => {
          if (!e.start) return false;
          const evTime = new Date(e.start).getTime();
          if (evTime < now.getTime()) return false;
          if (e.matchedCode && e.matchedCode.toUpperCase() === code) return true;
          if (e.summary && e.summary.toUpperCase().includes(code)) return true;
          return false;
        })
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

      let targetDate: Date | null = null;
      let nextEvent: ScheduleEvent | null = null;

      if (upcomingResourceEvents.length > 0) {
        nextEvent = upcomingResourceEvents[0];
        targetDate = new Date(nextEvent.start);
      } else if (lesson.dueDate) {
        // Repli sur l'échéance fixée manuellement
        targetDate = new Date(lesson.dueDate + "T08:00:00");
      }

      if (!targetDate || isNaN(targetDate.getTime())) continue;

      const courseDateOnly = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
      const diffMs = courseDateOnly.getTime() - todayDate.getTime();
      const diffDays = Math.round(diffMs / (1000 * 3600 * 24));

      // La veille du cours : diffDays === 1 (ou le soir/toute la journée précédant le cours)
      // On lève aussi l'alerte le jour même si le cours n'a pas encore eu lieu (diffDays === 0)
      const isEveningBefore = diffDays === 1;
      const isToday = diffDays === 0;

      if (isEveningBefore || isToday) {
        const timeStr = targetDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
        const roomStr = nextEvent?.location ? ` (salle ${nextEvent.location})` : "";

        let message = "";
        if (isEveningBefore) {
          message = `Demain à ${timeStr}${roomStr} : cours de ${lesson.resourceCode}. Pensez à réviser : "${lesson.title}" !`;
        } else {
          message = `Aujourd'hui à ${timeStr}${roomStr} : cours de ${lesson.resourceCode}. Prévoyez : "${lesson.title}"`;
        }

        reminders.push({
          id: `rem-${lesson.id}`,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          resourceCode: lesson.resourceCode,
          lessonType: lesson.type,
          nextCourseDate: targetDate.toISOString(),
          nextCourseSummary: nextEvent?.summary || `Séance ${lesson.resourceCode}`,
          nextCourseLocation: nextEvent?.location,
          nextCourseTeacher: nextEvent?.teacher,
          isEveningBefore,
          reminderMessage: message,
        });
      }
    }

    res.json({ reminders, count: reminders.length });
  } catch (err: any) {
    res.status(500).json({ error: "Erreur calcul rappels : " + err.message });
  }
});

export default router;
