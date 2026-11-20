import { v4 as uuidv4 } from "uuid";
import { Database } from "../db.js";
import {
  AIProvider,
  AIUserConfig,
  AIMessage,
  AIToolCall,
  AIProactiveInsight,
  AIDefaultRole,
  AITaskRole,
  AIModelProfile,
  ScheduleEvent,
  SlideDeckItem,
  BentoDoc,
  SlidePage,
  SlideElement,
  MoodleCourse,
  QCMQuiz,
  QCMQuestion,
  QCMOption,
  QCMGenerationParams,
} from "../../src/types/index.js";
import { crousService } from "./crousService.js";

// Définitions des outils disponibles pour l'IA
export const AI_TOOLS_DEFINITIONS = [
  {
    name: "get_schedule",
    description: "Consulte l'emploi du temps ADE Unicaen de l'étudiant (cours, TD, TP, DS, salles, horaires, enseignants).",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "Code de la matière (ex: R101, R201, SAE11). Optionnel." },
        start: { type: "string", description: "Date de début au format ISO (ex: 2026-09-07T00:00:00Z). Optionnel." },
        end: { type: "string", description: "Date de fin au format ISO. Optionnel." },
      },
    },
  },
  {
    name: "get_grades",
    description: "Consulte les notes, évaluations Scodoc/Webnotes, moyennes et coefficients de l'étudiant.",
    parameters: {
      type: "object",
      properties: {
        resourceCode: { type: "string", description: "Code de la matière (ex: R201). Optionnel." },
      },
    },
  },
  {
    name: "get_lessons_and_homework",
    description: "Consulte le cahier de texte de l'étudiant : devoirs à faire, leçons à réviser, préparations de TP.",
    parameters: {
      type: "object",
      properties: {
        filter: { type: "string", enum: ["ALL", "TODO", "DONE"], description: "Filtre par statut (défaut: TODO)." },
      },
    },
  },
  {
    name: "get_notes",
    description: "Recherche et consulte les cours et notes pris par l'étudiant en CM et TP.",
    parameters: {
      type: "object",
      properties: {
        resourceCode: { type: "string", description: "Code de la ressource (ex: R101). Optionnel." },
        query: { type: "string", description: "Mots clés de recherche dans le titre ou contenu." },
      },
    },
  },
  {
    name: "get_resources",
    description: "Liste les 40 matières et SAÉs du département BUT Réseaux & Télécoms avec enseignants et coefficients.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_emails",
    description: "Consulte les courriels universitaires Zimbra récents reçus par l'étudiant (enseignants, scolarité, IUT).",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Nombre d'e-mails à récupérer (max 10, défaut 5)." },
        unreadOnly: { type: "boolean", description: "Récupérer uniquement les non lus (défaut true)." },
      },
    },
  },
  {
    name: "add_homework",
    description: "Ajoute un devoir, une révision ou un travail à faire dans le cahier de texte de l'étudiant.",
    parameters: {
      type: "object",
      required: ["resourceCode", "title"],
      properties: {
        resourceCode: { type: "string", description: "Code de la matière (ex: R201)." },
        title: { type: "string", description: "Titre du devoir ou de la leçon." },
        dueDate: { type: "string", description: "Date d'échéance au format YYYY-MM-DD (optionnel)." },
        description: { type: "string", description: "Détails ou consignes (optionnel)." },
      },
    },
  },
  {
    name: "add_sticky_note",
    description: "Colle un pense-bête (post-it) sur le tableau de bord de l'étudiant.",
    parameters: {
      type: "object",
      required: ["content"],
      properties: {
        content: { type: "string", description: "Texte du post-it." },
        color: { type: "string", enum: ["yellow", "green", "blue", "pink", "orange", "purple"], description: "Couleur pastel." },
        resourceCode: { type: "string", description: "Matière liée (optionnel)." },
      },
    },
  },
  {
    name: "create_note",
    description: "Crée une nouvelle prise de note de cours CM ou TP ou une fiche de synthèse / résumé dans la ressource/matière concernée (ex: R101, R201).",
    parameters: {
      type: "object",
      required: ["resourceCode", "title", "content"],
      properties: {
        resourceCode: { type: "string", description: "Code de la matière (ex: R101, R201, SAE11)." },
        title: { type: "string", description: "Titre de la fiche de révision, résumé ou prise de note." },
        type: { type: "string", enum: ["CM", "TP"], description: "Type de séance (CM ou TP, défaut: CM)." },
        content: { type: "string", description: "Contenu complet rédigé en Markdown structuré avec titres, listes, définitions et formules KaTeX si applicable." },
      },
    },
  },
  {
    name: "create_slide_deck",
    description: "Génère et sauvegarde un diaporama interactif Bento (.bento) dans une matière/ressource (ex: R101, R201) pour l'étudiant. Idéal après avoir consulté les cours eCampus avec search_moodle.",
    parameters: {
      type: "object",
      required: ["resourceCode", "title"],
      properties: {
        resourceCode: { type: "string", description: "Code de la matière (ex: R101, R201)." },
        title: { type: "string", description: "Titre du diaporama (ex: 'CM R101 - Modèle OSI et Adressage IP')." },
        description: { type: "string", description: "Courte description ou sommaire du diaporama (optionnel)." },
        slides: {
          type: "array",
          description: "Liste des diapositives (slides) à générer avec leur titre et contenu détaillé.",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Titre de la slide." },
              content: { type: "string", description: "Points clés, puces, explications ou formules de la slide." },
              notes: { type: "string", description: "Notes orales de présentation pour l'étudiant (optionnel)." },
              background: { type: "string", description: "Couleur hex de fond (ex: '#0f172a'). Optionnel." },
            },
          },
        },
      },
    },
  },
  {
    name: "create_td_exercises",
    description: "Crée et enregistre une feuille d'exercices de TD (Travaux Dirigés) avec énoncés, questions numérotées, indices et corrigé pas-à-pas dans la matière de l'étudiant (ex: R101, R201).",
    parameters: {
      type: "object",
      required: ["resourceCode", "title", "content"],
      properties: {
        resourceCode: { type: "string", description: "Code de la matière (ex: R101, R201, SAE11)." },
        title: { type: "string", description: "Titre de la feuille de TD (ex: 'TD 1 - Adressage IPv4 et Calculs de sous-réseaux')." },
        content: { type: "string", description: "Contenu complet en Markdown soigné comprenant les énoncés, les questions et la correction détaillée avec formules KaTeX." },
      },
    },
  },
  {
    name: "generate_qcm",
    description: "Génère un questionnaire à choix multiples (QCM) interactif avec options, corrigé et explications pour réviser une matière ou un thème spécifique (ex: R101, R201).",
    parameters: {
      type: "object",
      required: ["resourceCode"],
      properties: {
        resourceCode: { type: "string", description: "Code de la matière (ex: R101, R201, SAE11)." },
        topic: { type: "string", description: "Thème ou chapitre spécifique du QCM (ex: Routage statique, Adressage IPv6, Modulation)." },
        difficulty: { type: "string", enum: ["facile", "moyen", "difficile"], description: "Niveau de difficulté." },
        questionCount: { type: "number", description: "Nombre de questions du QCM (ex: 5)." },
      },
    },
  },
  {
    name: "search_moodle",
    description: "Recherche des cours, documents, diaporamas (PDFs), devoirs, TPs et consignes déposés par les enseignants sur la plateforme eCampus Moodle Unicaen.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Mot-clé de recherche (ex: routage, TD2, TP3, examen, IPv6)." },
        resourceCode: { type: "string", description: "Code de la matière (ex: R101, R201). Optionnel." },
      },
    },
  },
  {
    name: "search_unicaen",
    description: "Recherche globale dans l'écosystème universitaire Unicaen : fichiers UniCloud (Nextcloud), enseignants et contacts du département, salles du campus 3 d'Ifs, et calendrier académique.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Terme ou nom recherché (ex: nom d'un professeur, numéro de salle, intitulé de fichier cloud)." },
        category: { type: "string", enum: ["all", "cloud", "teachers", "rooms"], description: "Catégorie de recherche (défaut: all)." },
      },
    },
  },
  {
    name: "get_crous_menu",
    description: "Consulte le menu du jour (plats, propositions, repas) et les horaires du restaurant universitaire CROUS Normandie d'Ifs (Campus 3).",
    parameters: {
      type: "object",
      properties: {
        refresh: { type: "boolean", description: "Forcer le rechargement en direct (défaut: false)." },
      },
    },
  },
];

export class AIService {
  /**
   * Exécute un outil en accédant aux données privées de l'étudiant
   */
  public resolveConfigForTask(
    userConfig: AIUserConfig,
    task: "proactive" | "document" | "default"
  ): AIUserConfig {
    if (task === "default") return userConfig;
    const provider = userConfig.activeProvider;
    const pCfg = userConfig.providers?.[provider] || {};
    const targetModel =
      task === "proactive"
        ? pCfg.proactiveModel || pCfg.model
        : pCfg.documentModel || pCfg.model;

    if (!targetModel || targetModel === pCfg.model) return userConfig;
    return {
      ...userConfig,
      providers: {
        ...userConfig.providers,
        [provider]: {
          ...pCfg,
          model: targetModel,
        },
      },
    };
  }

  public async executeTool(
    toolName: string,
    args: Record<string, any>,
    userDb: Database,
    userCredentials?: { username?: string; password?: string }
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      switch (toolName) {
        case "get_schedule": {
          let events = userDb.getScheduleEvents();
          if (args.code) {
            events = events.filter((e) => e.matchedCode?.toUpperCase() === args.code.toUpperCase());
          }
          if (args.start) {
            const st = new Date(args.start).getTime();
            events = events.filter((e) => new Date(e.start).getTime() >= st);
          }
          if (args.end) {
            const et = new Date(args.end).getTime();
            events = events.filter((e) => new Date(e.end).getTime() <= et);
          }
          // Limiter à 15 événements les plus proches
          const sliced = events.slice(0, 15).map((e) => ({
            summary: e.summary,
            start: e.start,
            end: e.end,
            location: e.location,
            teacher: e.teacher,
            group: e.group,
            matchedCode: e.matchedCode,
          }));
          return { success: true, data: { count: events.length, events: sliced } };
        }

        case "get_grades": {
          const reports = userDb.getGrades();
          const recent = userDb.getRecentGrades();
          if (args.resourceCode) {
            const code = args.resourceCode.toUpperCase();
            const gradesForRes = userDb.getGradesByResourceId(code);
            return { success: true, data: gradesForRes };
          }
          // Résumé des semestres
          const summary = reports.map((r) => ({
            semester: r.nomCourt || r.titre,
            average: r.moyenneGenerale,
            rank: r.rang,
            totalStudents: r.totalEtudiants,
          }));
          return { success: true, data: { semestres: summary, dernieresNotes: recent.slice(0, 8) } };
        }

        case "get_lessons_and_homework": {
          let lessons = userDb.getLessons();
          if (args.filter === "TODO") {
            lessons = lessons.filter((l) => !l.isCompleted);
          } else if (args.filter === "DONE") {
            lessons = lessons.filter((l) => l.isCompleted);
          }
          return { success: true, data: lessons };
        }

        case "get_notes": {
          let notes = userDb.getNotes();
          if (args.resourceCode) {
            notes = notes.filter((n) => n.resourceId.toUpperCase() === args.resourceCode.toUpperCase());
          }
          if (args.query) {
            const q = args.query.toLowerCase();
            notes = notes.filter((n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
          }
          const summarized = notes.slice(0, 8).map((n) => ({
            id: n.id,
            resourceId: n.resourceId,
            type: n.type,
            title: n.title,
            updatedAt: n.updatedAt,
            snippet: n.content.substring(0, 300) + (n.content.length > 300 ? "..." : ""),
          }));
          return { success: true, data: summarized };
        }

        case "get_resources": {
          const resources = userDb.getResources();
          return {
            success: true,
            data: resources.map((r) => ({
              code: r.code,
              name: r.name,
              semester: r.semester,
              teacher: r.teacher,
              category: r.category,
            })),
          };
        }

        case "get_emails": {
          try {
            const { mailService } = await import("./mailService.js");
            const limit = Math.min(args.limit || 5, 10);
            const result = await mailService.getMessages(limit, 0, false, userCredentials as any);
            const messages = (result.messages || [])
              .filter((m: any) => (args.unreadOnly !== false ? !m.isRead : true))
              .slice(0, limit)
              .map((m: any) => ({
                from: m.from,
                subject: m.subject,
                date: m.date,
                snippet: m.snippet,
                isRead: m.isRead,
              }));
            return { success: true, data: { unreadCount: result.unreadCount, messages } };
          } catch (e: any) {
            return { success: false, error: "Impossible de relever les e-mails: " + e.message };
          }
        }

        case "add_homework": {
          const item = userDb.addLesson({
            title: args.title,
            resourceCode: args.resourceCode.toUpperCase(),
            type: "DEVOIR",
            dueDate: args.dueDate,
            description: args.description,
            isCompleted: false,
            reminderEnabled: true,
          });
          return { success: true, data: { message: "Devoir ajouté avec succès !", item } };
        }

        case "add_sticky_note": {
          const postIt = userDb.addStickyNote({
            content: args.content,
            color: args.color || "yellow",
            resourceCode: args.resourceCode ? args.resourceCode.toUpperCase() : undefined,
          });
          return { success: true, data: { message: "Pense-bête créé !", postIt } };
        }

        case "create_note": {
          let code = (args.resourceCode || "").toUpperCase().trim();
          let title = (args.title || "").trim();
          if (!code && title) {
            const match = title.match(/\b(R\d{3}|SAE\d{2}|S\d{3})\b/i);
            if (match) code = match[1].toUpperCase();
          }
          if (!code) code = "GENERAL";
          if (!title) title = `Note ${code}`;

          const noteType = (args.type === "TP" ? "TP" : args.type === "TD" ? "TD" : "CM");
          const content = args.content || `# ${title}\n\n`;

          const note = userDb.createNote({
            id: `note-${uuidv4()}`,
            resourceId: code,
            type: noteType,
            title,
            content,
            status: (noteType === "TP" || noteType === "TD") ? "En cours" : undefined,
            objectives: [],
            cmDate: new Date().toISOString().split("T")[0],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          return {
            success: true,
            data: {
              message: `Fiche de note/résumé '${title}' créée avec succès dans la ressource ${code} !`,
              noteId: note.id,
              resourceCode: code,
              type: note.type,
              title: note.title,
            },
          };
        }

        case "create_td_exercises": {
          let code = (args.resourceCode || "").toUpperCase().trim();
          let title = (args.title || "").trim();
          if (!code && title) {
            const match = title.match(/\b(R\d{3}|SAE\d{2}|S\d{3})\b/i);
            if (match) code = match[1].toUpperCase();
          }
          if (!code) code = "GENERAL";
          if (!title) title = `TD ${code} - Exercices d'entraînement`;

          const content = args.content || `# ${title}\n\n`;

          const note = userDb.createNote({
            id: `note-${uuidv4()}`,
            resourceId: code,
            type: "TD",
            title,
            content,
            status: "En cours",
            objectives: [],
            cmDate: new Date().toISOString().split("T")[0],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          return {
            success: true,
            data: {
              message: `Feuille d'exercices de TD '${title}' créée avec succès dans la matière ${code} !`,
              noteId: note.id,
              resourceCode: code,
              type: "TD",
              title: note.title,
            },
          };
        }

        case "generate_qcm": {
          let code = (args.resourceCode || "").toUpperCase().trim();
          if (!code) code = "R101";
          const quiz = await this.generateQCM(userConfig, {
            resourceCode: code,
            topic: args.topic,
            difficulty: args.difficulty || "moyen",
            questionCount: args.questionCount || 5,
          });
          const saved = userDb.createQCM(quiz);
          return {
            success: true,
            data: {
              message: `QCM '${saved.title}' de ${saved.questions.length} questions généré et enregistré dans la matière ${code} !`,
              quizId: saved.id,
              title: saved.title,
              questionsCount: saved.questions.length,
            },
          };
        }

        case "create_slide_deck": {
          let code = (args.resourceCode || "").toUpperCase().trim();
          let title = (args.title || "").trim();
          if (!code && title) {
            const match = title.match(/\b(R\d{3}|SAE\d{2}|S\d{3})\b/i);
            if (match) code = match[1].toUpperCase();
          }
          if (!title) title = code ? `Diaporama ${code}` : "Nouveau Diaporama";
          const description = args.description || `Présentation générée pour la ressource ${code || "BUT R&T"}`;

          let slides: SlidePage[] = [];

          if (Array.isArray(args.slides) && args.slides.length > 0) {
            slides = args.slides.map((s: any, idx: number) => {
              const slideId = s.id || `slide-${idx + 1}`;
              const bg = s.background || "#0f172a";
              const notes = s.notes || "";

              if (Array.isArray(s.elements) && s.elements.length > 0) {
                return {
                  id: slideId,
                  background: bg,
                  transition: s.transition || "fade",
                  notes,
                  elements: s.elements,
                };
              }

              const elements: SlideElement[] = [];
              const slideTitle = s.title || (idx === 0 ? title : `Partie ${idx + 1}`);

              // Titre de slide
              elements.push({
                id: `el-title-${slideId}`,
                type: "text",
                x: 80,
                y: 60,
                w: 1120,
                h: 80,
                content: slideTitle,
                style: {
                  fontSize: 38,
                  fontWeight: "700",
                  color: "#f8fafc",
                  fontFamily: "Inter, system-ui, sans-serif",
                },
              });

              // Contenu principal / bloc carte
              if (s.content) {
                elements.push({
                  id: `el-content-${slideId}`,
                  type: "text",
                  x: 80,
                  y: 160,
                  w: 1120,
                  h: 480,
                  content: s.content,
                  style: {
                    fontSize: 22,
                    fontWeight: "400",
                    color: "#cbd5e1",
                    lineHeight: 1.6,
                    padding: 24,
                    backgroundColor: "#1e293b99",
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: "#334155",
                    fontFamily: "Inter, system-ui, sans-serif",
                  },
                });
              }

              return {
                id: slideId,
                background: bg,
                transition: "fade",
                notes,
                elements,
              };
            });
          } else {
            // Au moins 1 slide d'accueil
            slides = [
              {
                id: "slide-1",
                background: "#0f172a",
                transition: "fade",
                notes: "",
                elements: [
                  {
                    id: "el-title-1",
                    type: "text",
                    x: 80,
                    y: 220,
                    w: 1120,
                    h: 120,
                    content: title,
                    style: {
                      fontSize: 48,
                      fontWeight: "800",
                      color: "#f8fafc",
                      textAlign: "center",
                      fontFamily: "Inter, system-ui, sans-serif",
                    },
                  },
                  {
                    id: "el-sub-1",
                    type: "text",
                    x: 80,
                    y: 360,
                    w: 1120,
                    h: 60,
                    content: code ? `Ressource ${code} — BUT Réseaux & Télécoms` : "Présentation Bento",
                    style: {
                      fontSize: 24,
                      fontWeight: "500",
                      color: "#94a3b8",
                      textAlign: "center",
                      fontFamily: "Inter, system-ui, sans-serif",
                    },
                  },
                ],
              },
            ];
          }

          const doc: BentoDoc = {
            format: "bento/slides",
            schema: "bento/slides",
            version: 1,
            docId: `doc-${uuidv4()}`,
            title,
            size: { width: 1280, height: 720 },
            theme: {
              font: "Inter",
              fontFamily: "Inter, system-ui, sans-serif",
              background: "#0f172a",
              color: "#f8fafc",
              accent: "#3b82f6",
            },
            aspect: "16:9",
            slides,
          };

          const newDeck: SlideDeckItem = {
            id: `deck-${uuidv4()}`,
            title,
            description,
            resourceCode: code || undefined,
            slideCount: slides.length,
            doc,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          const saved = userDb.saveSlide(newDeck);
          return {
            success: true,
            data: {
              message: `Diaporama '${title}' créé avec succès pour la matière ${code || "générale"} avec ${slides.length} slide(s) !`,
              deckId: saved.id,
              resourceCode: saved.resourceCode,
              slideCount: saved.slideCount,
              title: saved.title,
            },
          };
        }

        case "search_moodle": {
          const allCourses = userDb.getMoodleCourses();
          const rawQuery = (args.query || "").toLowerCase().trim();
          let targetCode = (args.resourceCode || "").toUpperCase().trim();

          // Si targetCode n'a pas été passé explicitement, tenter de l'extraire de la query
          if (!targetCode && rawQuery) {
            const match = rawQuery.match(/\b(r\d{3}|sae\d{2}|s\d{3})\b/i);
            if (match) targetCode = match[1].toUpperCase();
          }

          let candidateCourses: MoodleCourse[] = allCourses;
          if (targetCode) {
            const matchedCourses = userDb.getMoodleCoursesForResource(targetCode);
            if (matchedCourses.length > 0) {
              candidateCourses = matchedCourses;
            } else {
              candidateCourses = allCourses.filter(
                (c) =>
                  c.resourceCode?.toUpperCase() === targetCode ||
                  c.shortname.toUpperCase().includes(targetCode) ||
                  c.fullname.toUpperCase().includes(targetCode)
              );
            }
          }

          const stopWords = new Set(["de", "du", "le", "la", "les", "des", "sur", "en", "un", "une", "pour", "et"]);
          const queryTokens = rawQuery
            .split(/\s+/)
            .map((t) => t.trim())
            .filter((t) => t.length > 1 && !stopWords.has(t) && t !== targetCode.toLowerCase());

          const matchedDocs: Array<{
            courseTitle: string;
            resourceCode?: string;
            sectionName: string;
            moduleName: string;
            type: string;
            url: string;
            downloadUrl?: string;
            description?: string;
          }> = [];

          for (const course of candidateCourses) {
            for (const section of course.sections || []) {
              for (const mod of section.modules || []) {
                const text = `${mod.name} ${section.name} ${course.fullname} ${course.shortname} ${mod.description || ""}`.toLowerCase();
                const matches =
                  queryTokens.length === 0 ||
                  queryTokens.some((token) => text.includes(token));

                if (matches) {
                  matchedDocs.push({
                    courseTitle: course.fullname || course.shortname,
                    resourceCode: course.resourceCode || targetCode || undefined,
                    sectionName: section.name,
                    moduleName: mod.name,
                    type: mod.modname || "ressource",
                    url: mod.url,
                    downloadUrl: mod.downloadUrl || (mod.files && mod.files[0]?.fileurl),
                    description: mod.description ? mod.description.slice(0, 200) : undefined,
                  });
                }
              }
            }
          }

          return {
            success: true,
            data: {
              query: args.query,
              resourceCode: targetCode || args.resourceCode,
              count: matchedDocs.length,
              documents: matchedDocs.slice(0, 20),
            },
          };
        }

        case "search_unicaen": {
          const query = (args.query || "").toLowerCase().trim();
          const category = args.category || "all";
          const results: any = {};

          // 1. Enseignants & Contacts Unicaen
          if (category === "all" || category === "teachers") {
            const resources = userDb.getResources();
            const teachersFound = resources
              .filter(
                (r) =>
                  r.teacher &&
                  (r.teacher.toLowerCase().includes(query) ||
                    r.code.toLowerCase().includes(query) ||
                    r.name.toLowerCase().includes(query))
              )
              .map((r) => ({
                name: r.teacher,
                resourceCode: r.code,
                resourceName: r.name,
                role: "Enseignant / Responsable de matière",
              }));
            results.teachers = teachersFound.slice(0, 10);
          }

          // 2. Salles & Emploi du Temps Campus 3 (Ifs)
          if (category === "all" || category === "rooms") {
            const events = userDb.getScheduleEvents();
            const matchingRooms = events
              .filter(
                (e) =>
                  e.location &&
                  (e.location.toLowerCase().includes(query) || e.summary.toLowerCase().includes(query))
              )
              .slice(0, 10)
              .map((e) => ({
                room: e.location,
                course: e.summary,
                code: e.matchedCode,
                teacher: e.teacher,
                date: e.start,
              }));
            results.rooms = matchingRooms;
          }

          // 3. Fichiers UniCloud (Nextcloud WebDAV)
          if ((category === "all" || category === "cloud") && userCredentials?.username) {
            try {
              const { nextcloudService } = await import("./nextcloudService.js");
              const dirItems = await nextcloudService.getDirectory("/", userCredentials as any);
              const matchingFiles = dirItems
                .filter((item) => !query || item.name.toLowerCase().includes(query))
                .slice(0, 10)
                .map((item) => ({
                  name: item.name,
                  path: item.path,
                  isDir: item.isDir,
                  size: item.size,
                  resourceCode: item.resourceCode,
                }));
              results.cloudFiles = matchingFiles;
            } catch (err: any) {
              results.cloudFilesError = "UniCloud indisponible : " + err.message;
            }
          }

          return { success: true, data: results };
        }

        case "get_crous_menu": {
          const menuData = await crousService.getMenu(Boolean(args.refresh));
          return {
            success: menuData.success,
            data: {
              restaurantName: menuData.restaurantName,
              sourceUrl: menuData.sourceUrl,
              date: menuData.todayMenu?.date || "Aujourd'hui",
              meals: menuData.todayMenu?.meals || [],
              horaires: menuData.infos.horaires,
              adresse: menuData.infos.adresse,
              telephone: menuData.infos.telephone,
              paiement: menuData.infos.paiement,
              error: menuData.error,
            },
          };
        }

        default:
          return { success: false, error: `Outil inconnu : ${toolName}` };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Récupère dynamiquement la liste des modèles disponibles depuis l'API du fournisseur
   */
  public async listModels(
    provider: AIProvider,
    config: { apiKey?: string; baseUrl?: string }
  ): Promise<{ models: string[]; source: "api" | "fallback"; error?: string }> {
    const apiKey = config.apiKey?.trim() || "";
    const signal = AbortSignal.timeout(8000);

    try {
      let models: string[] = [];

      switch (provider) {
        case "ollama": {
          const baseUrl = (config.baseUrl || "http://localhost:11434").replace(/\/$/, "");
          const res = await fetch(`${baseUrl}/api/tags`, { signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          models = (data.models || []).map((m: any) => m.name).filter(Boolean);
          break;
        }
        case "openrouter": {
          const headers: Record<string, string> = {};
          if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
          const res = await fetch("https://openrouter.ai/api/v1/models", { headers, signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          models = (data.data || []).map((m: any) => m.id).filter(Boolean);
          break;
        }
        case "mistral": {
          if (!apiKey) return { models: [], source: "fallback", error: "Clé API requise" };
          const res = await fetch("https://api.mistral.ai/v1/models", {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal,
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          models = (data.data || []).map((m: any) => m.id).filter(Boolean);
          break;
        }
        case "claude": {
          if (!apiKey) return { models: [], source: "fallback", error: "Clé API requise" };
          const res = await fetch("https://api.anthropic.com/v1/models", {
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
            },
            signal,
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          models = (data.data || []).map((m: any) => m.id).filter(Boolean);
          break;
        }
        case "google": {
          if (!apiKey) return { models: [], source: "fallback", error: "Clé API requise" };
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
            { signal }
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          models = (data.models || [])
            .filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
            .map((m: any) => String(m.name || "").replace(/^models\//, ""))
            .filter(Boolean);
          break;
        }
        default:
          return { models: [], source: "fallback", error: "Fournisseur non supporté" };
      }

      const uniqueModels = Array.from(new Set(models));
      return { models: uniqueModels, source: uniqueModels.length > 0 ? "api" : "fallback" };
    } catch (e: any) {
      return { models: [], source: "fallback", error: e.message || "Erreur réseau" };
    }
  }

  /**
   * Résout la configuration IA effective pour un rôle ou une tâche granulaire donnée.
   */
  public resolveConfigForRole(
    userConfig: AIUserConfig,
    role: AITaskRole | AIDefaultRole | string
  ): AIUserConfig {
    const profiles = userConfig.profiles || [];
    if (profiles.length === 0) return userConfig;

    const TASK_TO_DEFAULT_ROLE: Record<string, AIDefaultRole> = {
      chat: "copilot",
      mail_compose: "copilot",
      document_assist: "copilot",
      slides: "generator",
      summary: "generator",
      td_exercises: "generator",
      qcm: "generator",
      mail_triage: "agent",
      schedule_agent: "agent",
      quiz_helper: "agent",
    };

    const assignedProfileId =
      (userConfig.taskAssignments as Record<string, string> | undefined)?.[role] ||
      (userConfig.roleAssignments as Record<string, string> | undefined)?.[
        (TASK_TO_DEFAULT_ROLE[role] || role) as AIDefaultRole
      ] ||
      userConfig.customRoles?.find((r) => r.id === role || r.name === role)?.profileId;

    if (!assignedProfileId) return userConfig;
    const profile: AIModelProfile | undefined = profiles.find((p) => p.id === assignedProfileId);
    if (!profile) return userConfig;

    return {
      ...userConfig,
      activeProvider: profile.provider,
      providers: {
        ...userConfig.providers,
        [profile.provider]: {
          ...userConfig.providers?.[profile.provider],
          apiKey: profile.apiKey || userConfig.providers?.[profile.provider]?.apiKey,
          baseUrl: profile.baseUrl || userConfig.providers?.[profile.provider]?.baseUrl,
          model: profile.model,
        },
      },
    };
  }

  /**
   * Teste la connexion à un provider IA
   */
  public async testProvider(
    provider: AIProvider,
    config: { apiKey?: string; baseUrl?: string; model?: string }
  ): Promise<{ success: boolean; message: string; model?: string }> {
    const testMessages: AIMessage[] = [
      { role: "user", content: "Réponds uniquement par le mot 'OK' en un seul mot." },
    ];

    try {
      const response = await this.callProvider(
        provider,
        config,
        testMessages,
        false // pas d'outils pour le test
      );

      if (response && response.content) {
        return {
          success: true,
          message: `Connexion réussie avec ${provider} ! Réponse reçue : "${response.content.trim().slice(0, 50)}"`,
          model: config.model,
        };
      } else {
        return { success: false, message: "Réponse vide reçue du modèle." };
      }
    } catch (e: any) {
      return { success: false, message: `Échec de connexion (${provider}) : ${e.message}` };
    }
  }

  /**
   * Boucle agentique complète : envoie la requête à l'IA, exécute les outils demandés et retourne la réponse finale
   */
  public async chatWithAgent(
    userConfig: AIUserConfig,
    messages: AIMessage[],
    userDb: Database,
    userCredentials?: { username?: string; password?: string }
  ): Promise<{ message: AIMessage; toolsExecuted: Array<{ name: string; args: any; result: any }> }> {
    const effectiveConfig = this.resolveConfigForTask(userConfig, "default");
    const provider = effectiveConfig.activeProvider;
    const providerConfig = effectiveConfig.providers[provider] || {};
    const toolsExecuted: Array<{ name: string; args: any; result: any }> = [];

    // Prompt système de base orienté BUT Réseaux & Télécoms Unicaen
    const systemPrompt =
      userConfig.customSystemPrompt ||
      `Tu es l'assistant d'Intelligence Artificielle intégré au Cartable Numérique de l'étudiant en BUT Réseaux & Télécoms (IUT Grand Ouest Normandie - Campus 3 Ifs / Caen).
Tu es bienveillant, rigoureux, pédagogique et proactif.
Tu as accès à des outils pour interroger en direct le système universitaire et créer des contenus :
- search_moodle : recherche de cours, chapitres, diaporamas (PDFs), devoirs, TPs et documents déposés par les enseignants sur Moodle eCampus Unicaen.
- search_unicaen : recherche d'enseignants, contacts du département, salles du campus 3 d'Ifs et fichiers UniCloud (Nextcloud).
- create_slide_deck : génère un diaporama Bento (.bento) structuré dans une matière/ressource.
- create_note : enregistre une fiche de résumé, révision ou prise de note Markdown dans une matière/ressource.
- create_td_exercises : enregistre une feuille d'exercices de TD avec énoncés, questions, formules KaTeX, indices et corrigés détaillés.
- get_schedule : emploi du temps ADE, salles, horaires et changements de cours.
- get_grades : notes Webnotes, moyennes et coefficients.
- get_lessons_and_homework : cahier de texte et devoirs à rendre.
- get_notes : prises de notes existantes rédigées par l'étudiant.
- get_emails : courriels récents reçus sur Zimbra.
- get_crous_menu : menu du jour du Restaurant Universitaire d'Ifs.

RÈGLES ET FLUX PROACTIF :
1. CRÉATION DE DIAPORAMA (ex: "crée un diapo sur le CM de R101", "fais des slides sur le routage") :
   -> Étape 1 : Appelle impérativement 'search_moodle' avec le resourceCode (ex: R101) pour inspecter les chapitres et documents déposés par le professeur sur eCampus.
   -> Étape 2 : Analyse le contenu trouvé.
   -> Étape 3 : Appelle 'create_slide_deck' en fournissant le resourceCode, un titre clair, et la liste des slides ('slides' avec 'title', 'content' détaillé sous forme de points clés, et 'notes' d'orateur).
   -> Réponds à l'étudiant en lui confirmant que son diaporama est créé et accessible dans l'onglet "Diaporamas" de sa ressource !

2. RÉSUMÉ DE COURS / FICHE DE RÉVISION (ex: "fais un résumé du CM de R101", "synthétise le cours") :
   -> Étape 1 : Appelle impérativement 'search_moodle' (ou 'get_notes') pour récupérer les notions et documents du cours.
   -> Étape 2 : Appelle 'create_note' avec le resourceCode, un titre clair (ex: "Résumé CM 1 - Introduction aux réseaux"), le type ("CM" ou "TP") et le contenu complet en Markdown soigné (avec titres, définitions, formules KaTeX et schémas ASCII si pertinent).
   -> Réponds à l'étudiant en lui confirmant que sa fiche est enregistrée dans l'onglet "Notes" de sa ressource !

3. EXERCICES DE TD / ENTRAÎNEMENT (ex: "crée des exos de TD sur R101", "fais un TD sur les sous-réseaux avec Moodle") :
   -> Étape 1 : Appelle 'search_moodle' avec le resourceCode pour récupérer les énoncés ou cours eCampus pertinents.
   -> Étape 2 : Conçois une série d'exercices progressifs avec énoncés, questions, indices et corrigés détaillés avec KaTeX ($...$).
   -> Étape 3 : Appelle 'create_td_exercises' avec le resourceCode, le titre (ex: "TD - Exercices Sous-réseaux"), et le contenu Markdown complet.
   -> Réponds à l'étudiant en lui confirmant que la feuille de TD est enregistrée dans l'onglet "TD" de sa matière !

Formate toujours tes réponses en Markdown élégant avec du LaTeX ($...$) pour toute formule scientifique ou télécom.`;

    const conversation: AIMessage[] = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    let maxIterations = userConfig.enableTools ? 5 : 1;
    let finalAssistantMessage: AIMessage | null = null;

    while (maxIterations > 0) {
      maxIterations--;
      const assistantReply = await this.callProvider(
        provider,
        providerConfig,
        conversation,
        userConfig.enableTools
      );

      // Si l'assistant demande d'appeler des outils
      if (assistantReply.toolCalls && assistantReply.toolCalls.length > 0 && userConfig.enableTools) {
        conversation.push(assistantReply);

        for (const call of assistantReply.toolCalls) {
          const toolResult = await this.executeTool(call.name, call.arguments, userDb, userCredentials);
          toolsExecuted.push({
            name: call.name,
            args: call.arguments,
            result: toolResult.data || toolResult.error,
          });

          // Ajouter le résultat de l'outil dans l'historique
          conversation.push({
            role: "tool",
            name: call.name,
            toolCallId: call.id,
            content: JSON.stringify(toolResult),
          });
        }
      } else {
        finalAssistantMessage = assistantReply;
        break;
      }
    }

    return {
      message: finalAssistantMessage || {
        role: "assistant",
        content: "Je n'ai pas pu terminer l'analyse. Veuillez réessayer.",
      },
      toolsExecuted,
    };
  }

  /**
   * Appelle l'API du provider sélectionné (Ollama, OpenRouter, Claude, Mistral, Google)
   */
  private async callProvider(
    provider: AIProvider,
    config: { apiKey?: string; baseUrl?: string; model?: string },
    messages: AIMessage[],
    includeTools: boolean,
    customTools?: typeof AI_TOOLS_DEFINITIONS
  ): Promise<AIMessage> {
    switch (provider) {
      case "ollama":
        return this.callOllama(config, messages, includeTools, customTools);
      case "openrouter":
        return this.callOpenRouter(config, messages, includeTools, customTools);
      case "claude":
        return this.callClaude(config, messages, includeTools, customTools);
      case "mistral":
        return this.callMistral(config, messages, includeTools, customTools);
      case "google":
        return this.callGoogle(config, messages, includeTools, customTools);
      default:
        throw new Error(`Fournisseur IA non supporté : ${provider}`);
    }
  }

  // --- 1. OLLAMA ---
  private async callOllama(
    config: { baseUrl?: string; model?: string },
    messages: AIMessage[],
    includeTools: boolean,
    customTools?: typeof AI_TOOLS_DEFINITIONS
  ): Promise<AIMessage> {
    const baseUrl = (config.baseUrl || "http://localhost:11434").replace(/\/$/, "");
    const model = config.model || "llama3.2";

    const ollamaMessages = messages.map((m) => {
      const msgObj: any = {
        role: m.role === "tool" ? "tool" : m.role,
        content: m.content,
        name: m.name,
        tool_call_id: m.toolCallId,
        tool_calls: m.toolCalls
          ? m.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function",
              function: { name: tc.name, arguments: tc.arguments },
            }))
          : undefined,
      };
      if (m.images && m.images.length > 0) {
        msgObj.images = m.images.map((img) =>
          img.replace(/^data:image\/[a-zA-Z0-9.+]+;base64,/, "")
        );
      }
      return msgObj;
    });

    const body: any = {
      model,
      messages: ollamaMessages,
      stream: false,
    };

    if (includeTools) {
      const toolsList = customTools || AI_TOOLS_DEFINITIONS;
      body.tools = toolsList.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Erreur Ollama (${res.status}): ${err}`);
    }

    const data = await res.json();
    const reply = data.message || {};

    const toolCalls: AIToolCall[] = [];
    if (reply.tool_calls && Array.isArray(reply.tool_calls)) {
      for (const tc of reply.tool_calls) {
        toolCalls.push({
          id: tc.id || `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: tc.function?.name || "",
          arguments:
            typeof tc.function?.arguments === "string"
              ? JSON.parse(tc.function.arguments)
              : tc.function?.arguments || {},
        });
      }
    }

    return {
      role: "assistant",
      content: reply.content || "",
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  // --- 2. OPENROUTER ---
  private async callOpenRouter(
    config: { apiKey?: string; model?: string },
    messages: AIMessage[],
    includeTools: boolean,
    customTools?: typeof AI_TOOLS_DEFINITIONS
  ): Promise<AIMessage> {
    if (!config.apiKey) throw new Error("Clé API OpenRouter manquante.");
    const model = config.model || "meta-llama/llama-3.3-70b-instruct";

    const formattedMessages = messages.map((m) => {
      if (m.role === "tool") {
        return {
          role: "tool",
          content: m.content,
          tool_call_id: m.toolCallId,
          name: m.name,
        };
      }
      if (m.toolCalls) {
        return {
          role: "assistant",
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        };
      }
      if (m.images && m.images.length > 0) {
        const parts: any[] = [{ type: "text", text: m.content || "" }];
        for (const img of m.images) {
          const url = img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`;
          parts.push({ type: "image_url", image_url: { url } });
        }
        return { role: m.role, content: parts };
      }
      return { role: m.role, content: m.content };
    });

    const body: any = {
      model,
      messages: formattedMessages,
    };

    if (includeTools) {
      const toolsList = customTools || AI_TOOLS_DEFINITIONS;
      body.tools = toolsList.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.apiKey.trim()}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3001",
        "X-Title": "Cartable Numérique BUT RT",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Erreur OpenRouter (${res.status}): ${err}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0]?.message || {};

    const toolCalls: AIToolCall[] = [];
    if (choice.tool_calls && Array.isArray(choice.tool_calls)) {
      for (const tc of choice.tool_calls) {
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments:
            typeof tc.function.arguments === "string"
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments || {},
        });
      }
    }

    return {
      role: "assistant",
      content: choice.content || "",
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  // --- 3. CLAUDE (ANTHROPIC) ---
  private async callClaude(
    config: { apiKey?: string; model?: string },
    messages: AIMessage[],
    includeTools: boolean,
    customTools?: typeof AI_TOOLS_DEFINITIONS
  ): Promise<AIMessage> {
    if (!config.apiKey) throw new Error("Clé API Anthropic / Claude manquante.");
    const model = config.model || "claude-3-5-sonnet-latest";

    // Extraire le message système s'il y en a un
    let systemText = "";
    const filteredMessages: any[] = [];

    for (const m of messages) {
      if (m.role === "system") {
        systemText += (systemText ? "\n\n" : "") + m.content;
      } else if (m.role === "tool") {
        filteredMessages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: m.toolCallId,
              content: m.content,
            },
          ],
        });
      } else if (m.role === "assistant" && m.toolCalls) {
        const contents: any[] = [];
        if (m.content) contents.push({ type: "text", text: m.content });
        for (const tc of m.toolCalls) {
          contents.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: tc.arguments,
          });
        }
      } else if (m.images && m.images.length > 0) {
        const contents: any[] = [];
        if (m.content) contents.push({ type: "text", text: m.content });
        for (const img of m.images) {
          const mimeMatch = img.match(/^data:(image\/[a-zA-Z0-9.+]+);base64,/);
          const mediaType = (mimeMatch ? mimeMatch[1] : "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
          const base64Data = img.replace(/^data:[a-zA-Z0-9./+]+;base64,/, "");
          contents.push({
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: base64Data,
            },
          });
        }
        filteredMessages.push({ role: m.role, content: contents });
      } else {
        filteredMessages.push({ role: m.role, content: m.content });
      }
    }

    const body: any = {
      model,
      max_tokens: 4096,
      messages: filteredMessages,
    };

    if (systemText) body.system = systemText;

    if (includeTools) {
      const toolsList = customTools || AI_TOOLS_DEFINITIONS;
      body.tools = toolsList.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey.trim(),
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Erreur Claude Anthropic (${res.status}): ${err}`);
    }

    const data = await res.json();
    let textContent = "";
    const toolCalls: AIToolCall[] = [];

    for (const block of data.content || []) {
      if (block.type === "text") {
        textContent += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input || {},
        });
      }
    }

    return {
      role: "assistant",
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  private async callOpenAICompatible(options: {
    providerLabel: string;
    endpoint: string;
    apiKey?: string;
    defaultModel: string;
    model?: string;
    messages: AIMessage[];
    includeTools: boolean;
    customTools?: typeof AI_TOOLS_DEFINITIONS;
    extraHeaders?: Record<string, string>;
  }): Promise<AIMessage> {
    if (!options.apiKey) {
      throw new Error(`Clé API ${options.providerLabel} manquante.`);
    }
    const model = options.model || options.defaultModel;

    const formattedMessages = options.messages.map((m) => {
      if (m.role === "tool") {
        return {
          role: "tool",
          content: m.content,
          tool_call_id: m.toolCallId,
          name: m.name,
        };
      }
      if (m.toolCalls) {
        return {
          role: "assistant",
          content: m.content || "",
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        };
      }
      if (m.images && m.images.length > 0) {
        const parts: any[] = [{ type: "text", text: m.content || "" }];
        for (const img of m.images) {
          const url = img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`;
          parts.push({ type: "image_url", image_url: { url } });
        }
        return { role: m.role, content: parts };
      }
      return { role: m.role, content: m.content };
    });

    const body: any = {
      model,
      messages: formattedMessages,
    };

    if (options.includeTools) {
      const toolsList = options.customTools || AI_TOOLS_DEFINITIONS;
      body.tools = toolsList.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const res = await fetch(options.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey.trim()}`,
        "Content-Type": "application/json",
        ...(options.extraHeaders || {}),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Erreur ${options.providerLabel} (${res.status}): ${err}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0]?.message || {};

    const toolCalls: AIToolCall[] = [];
    if (choice.tool_calls && Array.isArray(choice.tool_calls)) {
      for (const [idx, tc] of choice.tool_calls.entries()) {
        toolCalls.push({
          id: tc.id || `call_${Date.now()}_${idx}`,
          name: tc.function.name,
          arguments:
            typeof tc.function.arguments === "string"
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments || {},
        });
      }
    }

    return {
      role: "assistant",
      content: choice.content || "",
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  // --- 4. MISTRAL AI ---
  private async callMistral(
    config: { apiKey?: string; model?: string },
    messages: AIMessage[],
    includeTools: boolean,
    customTools?: typeof AI_TOOLS_DEFINITIONS
  ): Promise<AIMessage> {
    return this.callOpenAICompatible({
      providerLabel: "Mistral AI",
      endpoint: "https://api.mistral.ai/v1/chat/completions",
      apiKey: config.apiKey,
      defaultModel: "mistral-large-latest",
      model: config.model,
      messages,
      includeTools,
      customTools,
    });
  }

  // --- 5. GOOGLE GEMINI ---
  private async callGoogle(
    config: { apiKey?: string; model?: string },
    messages: AIMessage[],
    includeTools: boolean,
    customTools?: typeof AI_TOOLS_DEFINITIONS
  ): Promise<AIMessage> {
    return this.callOpenAICompatible({
      providerLabel: "Google Gemini",
      endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      apiKey: config.apiKey,
      defaultModel: "gemini-2.5-flash",
      model: config.model,
      messages,
      includeTools,
      customTools,
    });
  }

  /**
   * Analyse un e-mail d'un professeur ou membre du staff autorisé via function calling
   * pour mettre à jour l'emploi du temps ou rattacher un lien de visioconférence à un cours.
   */
  private extractExplicitMailDateIso(text: string, referenceDate?: string): string | null {
  const ref = referenceDate ? new Date(referenceDate) : new Date();
  const refYear = isNaN(ref.getTime()) ? new Date().getFullYear() : ref.getFullYear();

  const numMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (numMatch) {
    const day = Number(numMatch[1]);
    const month = Number(numMatch[2]);
    let year = numMatch[3] ? Number(numMatch[3]) : refYear;
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const monthsMap: Record<string, number> = {
    janvier: 1, janv: 1,
    fevrier: 2, fev: 2,
    mars: 3,
    avril: 4, avr: 4,
    mai: 5,
    juin: 6,
    juillet: 7, juil: 7,
    aout: 8,
    septembre: 9, sept: 9,
    octobre: 10, oct: 10,
    novembre: 11, nov: 11,
    decembre: 12, dec: 12,
  };
  const norm = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const textMatch = norm.match(
    /\b(\d{1,2})\s+(janvier|janv|fevrier|fev|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|octobre|oct|novembre|nov|decembre|dec)(?:\s+(\d{4}))?\b/
  );
  if (textMatch) {
    const day = Number(textMatch[1]);
    const month = monthsMap[textMatch[2]];
    const year = textMatch[3] ? Number(textMatch[3]) : refYear;
    if (month && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return null;
}

  public async processMailForSchedule(
    userConfig: AIUserConfig,
    mail: {
      id: string;
      subject: string;
      from: string;
      senderName?: string;
      date: string;
      bodyText: string;
      resourceCode?: string;
    },
    userDb: Database,
    studentContext?: { name?: string; username?: string }
  ): Promise<{ actions: Array<{ action: string; summary: string; eventId?: string; visioUrl?: string }> }> {
    const actions: Array<{ action: string; summary: string; eventId?: string; visioUrl?: string }> = [];
    if (!userConfig.enabled) return { actions };

    const MAIL_SCHEDULE_TOOLS: typeof AI_TOOLS_DEFINITIONS = [
      {
        name: "find_schedule_events",
        description:
          "Recherche des cours dans l'emploi du temps de l'étudiant par mot-clé, code ressource (ex: R101), enseignant ou date (YYYY-MM-DD) pour obtenir leur eventId exact.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Mot-clé (matière, prof, salle)" },
            resourceCode: { type: "string", description: "Code ressource (ex: R101, SAE12)" },
            date: { type: "string", description: "Date au format YYYY-MM-DD" },
          },
        },
      },
      {
        name: "attach_visio_link",
        description:
          "Rattache directement un lien de visioconférence (BigBlueButton, Teams, Zoom, Meet, Discord...) à un cours existant de l'emploi du temps.",
        parameters: {
          type: "object",
          properties: {
            eventId: { type: "string", description: "ID exact du cours retourné par find_schedule_events" },
            visioUrl: { type: "string", description: "URL complète de la visioconférence" },
            reason: { type: "string", description: "Brève description (ex: Lien visio reçu par mail)" },
          },
          required: ["eventId", "visioUrl"],
        },
      },
      {
        name: "update_schedule_event",
        description:
          "Met à jour un cours existant : annulation, changement de salle, changement d'horaire ou renommage.",
        parameters: {
          type: "object",
          properties: {
            eventId: { type: "string", description: "ID exact du cours" },
            isCancelled: { type: "boolean", description: "true si le cours est annulé" },
            newStart: { type: "string", description: "Nouvelle date/heure de début (ISO 8601)" },
            newEnd: { type: "string", description: "Nouvelle date/heure de fin (ISO 8601)" },
            newLocation: { type: "string", description: "Nouvelle salle / lieu" },
            newSummary: { type: "string", description: "Nouveau titre si précisé" },
            reason: { type: "string", description: "Motif du changement tiré du mail" },
          },
          required: ["eventId", "reason"],
        },
      },
      {
        name: "create_schedule_event",
        description:
          "Ajoute un nouveau créneau de cours, rattrapage, soutenance ou visio ponctuelle à l'emploi du temps s'il n'existe pas encore.",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string", description: "Titre du cours ou événement" },
            start: { type: "string", description: "Début ISO 8601 (ex: 2026-11-19T14:00:00+01:00)" },
            end: { type: "string", description: "Fin ISO 8601" },
            location: { type: "string", description: "Salle ou 'Distanciel / Visio'" },
            teacher: { type: "string", description: "Nom de l'enseignant" },
            matchedCode: { type: "string", description: "Code ressource si connu (ex: R101)" },
            type: { type: "string", enum: ["CM", "TD", "TP", "Examen", "SAE", "Autre"] },
            visioUrl: { type: "string", description: "Lien visio éventuel" },
            reason: { type: "string", description: "Motif de l'ajout" },
          },
          required: ["summary", "start", "end", "reason"],
        },
      },
    ];

    const effectiveConfig = this.resolveConfigForTask(userConfig, "proactive");
    const provider = effectiveConfig.activeProvider;
    const providerConfig = effectiveConfig.providers[provider] || {};
    const nowIso = new Date().toISOString();

    // Extraire les groupes / classes de l'étudiant directement depuis son EDT
    const groupsSet = new Set<string>();
    for (const ev of userDb.getScheduleEvents()) {
      const mGrp = (ev.description || "").match(/Groupe\s*:\s*([^\n\r]+)/i);
      if (mGrp && mGrp[1]) {
        const g = mGrp[1].trim();
        if (g) groupsSet.add(g);
      }
    }
    const studentGroups = Array.from(groupsSet);
    const explicitDateIso = this.extractExplicitMailDateIso(`${mail.subject}\n${mail.bodyText || ""}`, mail.date);

    const conversation: AIMessage[] = [
      {
        role: "system",
        content: `Tu es l'assistant automatique d'emploi du temps du Cartable Numérique.
Date/heure actuelle : ${nowIso}.

Profil de l'étudiant propriétaire de cet EDT :
- Nom / Identifiant : ${studentContext?.name || "Étudiant"}${studentContext?.username ? ` (${studentContext.username})` : ""}
- Classes / Groupes inscrits sur son EDT : ${studentGroups.length > 0 ? studentGroups.join(" | ") : "Non précisés"}

Tu analyses un e-mail envoyé par un PROFESSEUR ou membre du STAFF AUTORISÉ.
Ton rôle :
1. Vérifier si cet e-mail annonce un changement d'emploi du temps (cours annulé, déplacé, nouvelle salle, rattrapage, examen, soutenance) OU contient un lien de visioconférence pour un cours (Zoom, Teams, BigBlueButton, Meet, Jitsi...).
2. RÈGLE CRITIQUE DE CIBLAGE : Vérifie si le message concerne bien CET étudiant ou ses classes/groupes (${studentGroups.join(", ") || "son EDT"}). Si le mail vise explicitement un AUTRE groupe/classe (ex: "TP 1.1" alors que l'étudiant est en "TP 1.2 INIT", ou "BUT 2" alors qu'il est en "BUT 1") ou s'adresse nominativement à un autre étudiant, N'APPELLE AUCUN outil et réponds "AUCUNE_ACTION".
3. RÈGLE IMPÉRATIVE DE DATE : Si l'e-mail mentionne une date précise (ex: "du 18/11/2026", "le 18 novembre"), tu DOIS cibler UNIQUEMENT le cours à cette date exacte (passe \`date: "YYYY-MM-DD"\` à \`find_schedule_events\`). Ne rattache JAMAIS une visio ou une modification à un cours d'une autre date (ex: la semaine suivante) si le cours de la date mentionnée est absent ou déjà passé.
4. Si l'e-mail concerne bien cet étudiant, ses groupes ou toute la promo : appelle d'abord \`find_schedule_events\` pour trouver le cours correspondant, puis utilise \`attach_visio_link\`, \`update_schedule_event\` ou \`create_schedule_event\`.
5. Si l'e-mail ne concerne ni un changement d'EDT ni un lien visio, N'APPELLE AUCUN outil de modification et réponds simplement "AUCUNE_ACTION".`,
      },
      {
        role: "user",
        content: `E-mail reçu le ${mail.date}
De : ${mail.senderName || ""} <${mail.from}>
Code ressource détecté : ${mail.resourceCode || "aucun"}${explicitDateIso ? `\nDate cible détectée dans le mail : ${explicitDateIso}` : ""}
Objet : ${mail.subject}

Contenu :
${(mail.bodyText || "").slice(0, 3500)}`,
      },
    ];

    const executeScheduleTool = (name: string, args: Record<string, any>) => {
      switch (name) {
        case "find_schedule_events": {
          const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
          const q = (args.query || "").toLowerCase().trim();
          const rc = (args.resourceCode || "").toLowerCase().trim();
          const dateFilter = (args.date || "").trim();

          const matches = userDb
            .getScheduleEvents()
            .filter((ev) => new Date(ev.end).getTime() >= cutoff)
            .filter((ev) => {
              if (dateFilter && !ev.start.startsWith(dateFilter)) return false;
              if (rc && !(ev.matchedCode || "").toLowerCase().includes(rc) && !ev.summary.toLowerCase().includes(rc)) {
                return false;
              }
              if (q) {
                const hay = `${ev.summary} ${ev.teacher || ""} ${ev.location || ""} ${ev.matchedCode || ""}`.toLowerCase();
                if (!hay.includes(q)) return false;
              }
              return true;
            })
            .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
            .slice(0, 15)
            .map((ev) => ({
              id: ev.id,
              summary: ev.summary,
              start: ev.start,
              end: ev.end,
              location: ev.location,
              teacher: ev.teacher,
              matchedCode: ev.matchedCode,
              visioUrl: ev.visioUrl,
              isCancelled: ev.isCancelled,
            }));

          return { count: matches.length, events: matches };
        }

        case "attach_visio_link": {
          const updated = userDb.updateScheduleEventById(
            String(args.eventId),
            {
              visioUrl: String(args.visioUrl).trim(),
              sourceMailId: mail.id,
            },
            args.reason || `Lien visio rattaché depuis le mail "${mail.subject}"`
          );
          if (!updated) return { error: `Cours ${args.eventId} introuvable` };
          const evDateLabel = new Date(updated.start).toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "2-digit",
          });
          actions.push({
            action: "visio_attached",
            summary: `Visio rattachée à ${updated.summary} (${evDateLabel})`,
            eventId: updated.id,
            visioUrl: updated.visioUrl,
          });
          return { success: true, event: updated };
        }

        case "update_schedule_event": {
          const patch: any = { sourceMailId: mail.id };
          if (args.isCancelled !== undefined) patch.isCancelled = Boolean(args.isCancelled);
          if (args.newStart) patch.start = String(args.newStart);
          if (args.newEnd) patch.end = String(args.newEnd);
          if (args.newLocation) patch.location = String(args.newLocation);
          if (args.newSummary) patch.summary = String(args.newSummary);

          const updated = userDb.updateScheduleEventById(
            String(args.eventId),
            patch,
            args.reason || `Mise à jour depuis "${mail.subject}"`
          );
          if (!updated) return { error: `Cours ${args.eventId} introuvable` };
          actions.push({
            action: updated.isCancelled ? "cancelled" : "updated",
            summary: `${updated.isCancelled ? "Cours annulé" : "Cours mis à jour"} : ${updated.summary}`,
            eventId: updated.id,
          });
          return { success: true, event: updated };
        }

        case "create_schedule_event": {
          const created = userDb.addScheduleEvent(
            {
              id: `ai_ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              summary: String(args.summary),
              start: String(args.start),
              end: String(args.end),
              location: args.location ? String(args.location) : undefined,
              teacher: args.teacher ? String(args.teacher) : mail.senderName,
              matchedCode: args.matchedCode ? String(args.matchedCode) : mail.resourceCode,
              type: args.type || "Autre",
              visioUrl: args.visioUrl ? String(args.visioUrl).trim() : undefined,
              sourceMailId: mail.id,
            },
            args.reason || `Ajouté depuis "${mail.subject}"`
          );
          actions.push({
            action: "created",
            summary: `Cours ajouté : ${created.summary}`,
            eventId: created.id,
            visioUrl: created.visioUrl,
          });
          return { success: true, event: created };
        }

        default:
          return { error: `Outil inconnu: ${name}` };
      }
    };

    try {
      for (let turn = 0; turn < 4; turn++) {
        const assistantMsg = await this.callProvider(
          provider,
          providerConfig,
          conversation,
          true,
          MAIL_SCHEDULE_TOOLS
        );
        conversation.push(assistantMsg);

        if (!assistantMsg.toolCalls || assistantMsg.toolCalls.length === 0) {
          break;
        }

        for (const tc of assistantMsg.toolCalls) {
          const result = executeScheduleTool(tc.name, tc.arguments || {});
          conversation.push({
            role: "tool",
            toolCallId: tc.id,
            name: tc.name,
            content: JSON.stringify(result),
          });
        }
      }
    } catch (aiErr: any) {
      // Fallback si l'API IA est indisponible / quota dépassé : rattacher un lien visio détecté au cours correspondant
      const fullText = `${mail.subject}\n${mail.bodyText || ""}`;
      const visioMatch = fullText.match(
        /https?:\/\/[^\s<>"']*(?:visio\.unicaen\.fr|teams\.microsoft\.com|zoom\.us|meet\.google\.com|meet\.jit\.si|bbb\.[^\s/]+)[^\s<>"']*/i
      );
      if (visioMatch) {
        const visioUrl = visioMatch[0].replace(/[.,;)]+$/, "");
        const codeMatch = fullText.match(/\b(R\d\.?\d{2}|SAE\s?\d\.?\d{2}|SAÉ\s?\d\.?\d{2})\b/i);
        const normCode = codeMatch ? codeMatch[1].toUpperCase().replace(/[\s.É]/g, (c) => (c === "É" ? "E" : "")) : "";
        const refMs = mail.date && !isNaN(new Date(mail.date).getTime()) ? new Date(mail.date).getTime() : Date.now();
        const nowMs = refMs - 2 * 60 * 60 * 1000;
        const horizonMs = refMs + 7 * 24 * 60 * 60 * 1000;

        const candidates = userDb
          .getScheduleEvents()
          .filter((ev) => {
            if (explicitDateIso) {
              return ev.start.startsWith(explicitDateIso);
            }
            const t = new Date(ev.start).getTime();
            return t >= nowMs && t <= horizonMs;
          })
          .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

        const teacherTokens = (mail.senderName || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .split(/\s+/)
          .filter((t) => t.length >= 3);

        const matched =
          candidates.find((ev) => {
            const evCode = (ev.matchedCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
            const evSum = ev.summary.toUpperCase().replace(/[^A-Z0-9]/g, "");
            return normCode && (evCode.includes(normCode) || evSum.includes(normCode));
          }) ||
          candidates.find((ev) => {
            const evTeacher = (ev.teacher || "")
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase();
            return teacherTokens.length > 0 && teacherTokens.every((t) => evTeacher.includes(t));
          });

        if (matched) {
          executeScheduleTool("attach_visio_link", {
            eventId: matched.id,
            visioUrl,
            reason: `Lien visio rattaché depuis le mail de ${mail.senderName || mail.from}`,
          });
        }
      }
      if (actions.length === 0) {
        throw aiErr;
      }
    }

    return { actions };
  }

  /**
   * Générateur de conseils et alertes proactives pour l'étudiant
   */
  public generateProactiveInsights(userDb: Database): AIProactiveInsight[] {
    const insights: AIProactiveInsight[] = [];
    const now = new Date();
    const next48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    // 1. Détection des devoirs non faits arrivant à échéance
    const lessons = userDb.getLessons();
    const pendingHomework = lessons.filter((l) => !l.isCompleted);

    for (const hw of pendingHomework) {
      if (hw.dueDate) {
        const due = new Date(hw.dueDate);
        const diffHours = (due.getTime() - now.getTime()) / (1000 * 60 * 60);
        if (diffHours >= -24 && diffHours <= 48) {
          insights.push({
            id: `insight_hw_${hw.id}`,
            type: "urgent_homework",
            title: `Devoir imminent : ${hw.title}`,
            description: `Le devoir en ${hw.resourceCode} est prévu pour le ${due.toLocaleDateString("fr-FR")}. Pense à le finaliser !`,
            resourceCode: hw.resourceCode,
            urgency: diffHours <= 24 ? "high" : "medium",
            actionText: "Ouvrir la matière",
            actionType: "open_resource",
            actionData: { resourceCode: hw.resourceCode },
            createdAt: now.toISOString(),
          });
        }
      }
    }

    // 1b. Détection des devoirs & livrables eCampus Moodle avec date limite
    try {
      const moodleCourses = userDb.getMoodleCourses();
      for (const course of moodleCourses) {
        for (const section of course.sections || []) {
          for (const mod of section.modules || []) {
            if (mod.dueDate) {
              const due = new Date(mod.dueDate);
              if (!isNaN(due.getTime())) {
                const diffHours = (due.getTime() - now.getTime()) / (1000 * 60 * 60);
                // Si l'échéance est dans les 7 prochains jours (ou jusqu'à 24h passée)
                if (diffHours >= -24 && diffHours <= 168) {
                  insights.push({
                    id: `insight_moodle_due_${course.id}_${mod.id}`,
                    type: "urgent_homework",
                    title: `Devoir eCampus : ${mod.name}`,
                    description: `Date limite de rendu le ${due.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" })} à ${due.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} (${course.fullname || course.shortname}).`,
                    resourceCode: course.resourceCode,
                    urgency: diffHours <= 36 ? "high" : "medium",
                    actionText: "Consulter sur eCampus",
                    actionType: "open_resource",
                    actionData: { resourceCode: course.resourceCode, url: mod.url },
                    createdAt: now.toISOString(),
                  });
                }
              } else {
                // Échéance textuelle non-ISO
                insights.push({
                  id: `insight_moodle_due_text_${course.id}_${mod.id}`,
                  type: "urgent_homework",
                  title: `Devoir eCampus : ${mod.name}`,
                  description: `Échéance eCampus : ${mod.dueDate} (${course.fullname || course.shortname}).`,
                  resourceCode: course.resourceCode,
                  urgency: "medium",
                  actionText: "Consulter sur eCampus",
                  actionType: "open_resource",
                  actionData: { resourceCode: course.resourceCode, url: mod.url },
                  createdAt: now.toISOString(),
                });
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn("Erreur analyse devoirs Moodle pour insights:", err);
    }

    // 2. Détection de cours de demain croisé avec le cahier de texte
    const schedule = userDb.getScheduleEvents();
    const tomorrowCourses = schedule.filter((e) => {
      const d = new Date(e.start);
      return d > now && d <= next48h;
    });

    for (const course of tomorrowCourses.slice(0, 3)) {
      if (course.matchedCode) {
        const relatedHw = pendingHomework.filter((h) => h.resourceCode === course.matchedCode);
        if (relatedHw.length > 0) {
          insights.push({
            id: `insight_course_hw_${course.id}`,
            type: "urgent_homework",
            title: `Préparation cours : ${course.matchedCode}`,
            description: `Tu as cours de ${course.summary} prochainement en salle ${course.location || "IUT"}. Tu as ${relatedHw.length} tâche(s) en attente sur cette matière.`,
            resourceCode: course.matchedCode,
            urgency: "high",
            actionText: "Réviser le cours",
            actionType: "open_resource",
            actionData: { resourceCode: course.matchedCode },
            createdAt: now.toISOString(),
          });
        }
      }
    }

    // 3. Détection des examens / DS prévus
    const exams = schedule.filter((e) => {
      const d = new Date(e.start);
      return d > now && (e.type === "Examen" || e.summary.toLowerCase().includes("examen") || e.summary.toLowerCase().includes("ds"));
    });

    if (exams.length > 0) {
      const nextExam = exams[0];
      const examDate = new Date(nextExam.start);
      insights.push({
        id: `insight_exam_${nextExam.id}`,
        type: "upcoming_exam",
        title: `Évaluation programmée : ${nextExam.matchedCode || "Examen"}`,
        description: `${nextExam.summary} le ${examDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" })} à ${examDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} en salle ${nextExam.location || "IUT"}.`,
        resourceCode: nextExam.matchedCode,
        urgency: "high",
        actionText: "Voir sur l'EDT",
        actionType: "open_schedule",
        actionData: { date: nextExam.start },
        createdAt: now.toISOString(),
      });
    }

    // 4. Alertes de notes récentes reçues
    const recentGrades = userDb.getRecentGrades().filter((g) => !g.isRead);
    if (recentGrades.length > 0) {
      const lastGrade = recentGrades[0];
      insights.push({
        id: `insight_new_grade_${lastGrade.id}`,
        type: "grade_alert",
        title: `Nouvelle note publiée : ${lastGrade.resourceCode}`,
        description: `Une évaluation "${lastGrade.description || lastGrade.resourceTitle}" a été enregistrée : ${lastGrade.note !== undefined ? lastGrade.note + "/20" : "Non notée"}.`,
        resourceCode: lastGrade.resourceCode,
        urgency: "medium",
        actionText: "Consulter mes notes",
        actionType: "open_grades",
        actionData: { resourceCode: lastGrade.resourceCode },
        createdAt: now.toISOString(),
      });
    }

    // 5. Conseil pédagogique BUT R&T par défaut si peu d'insights
    if (insights.length === 0) {
      insights.push({
        id: "insight_tip_default",
        type: "tip",
        title: "Conseil Révision BUT R&T",
        description: "Pense à relire tes notes de CM le soir même pour fixer les concepts de routage, commutation et signaux.",
        urgency: "low",
        actionText: "Consulter mes cours",
        actionType: "open_resource",
        createdAt: now.toISOString(),
      });
    }

    return insights;
  }

  /**
   * Génère une feuille d'exercices de TD complète avec l'IA
   * à partir d'une photo de feuille et/ou des documents eCampus Moodle.
   */
  public async generateTDExercises(
    userConfig: AIUserConfig,
    params: {
      resourceCode: string;
      resourceName?: string;
      sourceType: "photo" | "ecampus" | "mixed";
      image?: string;
      documentName?: string;
      documentContent?: string;
      topic?: string;
      difficulty?: "facile" | "moyen" | "difficile";
      exerciseCount?: number;
      includeSolution?: boolean;
      includeGrading?: boolean;
      includeHints?: boolean;
      additionalInstructions?: string;
    }
  ): Promise<{ title: string; content: string; estimatedTime: string }> {
    const effectiveConfig = this.resolveConfigForTask(userConfig, "document");
    const provider = effectiveConfig.activeProvider;
    const providerConfig = effectiveConfig.providers[provider] || {};

    const count = Math.min(Math.max(params.exerciseCount || 2, 1), 5);
    const difficultyLabel =
      params.difficulty === "facile"
        ? "Accessible / Entraînement fondamental"
        : params.difficulty === "difficile"
        ? "Avancé / Niveau Examen & DS"
        : "Standard BUT Réseaux & Télécoms";

    let contextDetails = "";
    if (params.sourceType === "photo" || params.image) {
      contextDetails += "\n- SOURCE : Une photo d'une feuille de TD / d'exercices a été fournie par l'étudiant. Analyse attentivement son contenu (questions, schémas, énoncés, calculs) pour retranscrire, résoudre et concevoir des exercices pertinents inspirés de cette feuille.";
    }
    if (params.documentName || params.documentContent) {
      contextDetails += `\n- DOCUMENT ECAMPUS / MOODLE : "${params.documentName || "Support de cours"}".\nContenu/Extrait du document :\n${(params.documentContent || "").slice(0, 4000)}`;
    }
    if (params.topic) {
      contextDetails += `\n- THÈME CIBLÉ : ${params.topic}`;
    }
    if (params.additionalInstructions) {
      contextDetails += `\n- CONSIGNES ÉTUDIANT : ${params.additionalInstructions}`;
    }

    const prompt = `Tu es un enseignant universitaire d'excellence et responsable pédagogique des Travaux Dirigés (TD) en BUT Réseaux & Télécoms (IUT Grand Ouest Normandie - Unicaen).
Conçois une feuille de TD complète, captivante, réaliste et pédagogiquement irréprochable pour la matière "${params.resourceCode}${params.resourceName ? ` - ${params.resourceName}` : ""}".

PARAMÈTRES PÉDAGOGIQUES :
- Nombre d'exercices demandés : ${count} exercice(s)
- Niveau de difficulté : ${difficultyLabel}
${params.includeGrading ? "- Barème de notation : Note totale sur 20 points avec répartition claire des points par question." : ""}
${params.includeHints ? "- Indices progressifs : Fournir pour chaque question une astuce ou formule clé d'aide." : ""}
${params.includeSolution ? "- Corrigé complet et pas-à-pas : Rédiger la correction exhaustive avec toutes les étapes de calculs et justifications." : "- Pas de corrigé (feuille d'entraînement vierge)."}

DONNÉES DU COURS / FEUILLE :
${contextDetails}

CONSIGNES DE RÉDACTION :
1. Titre percutant et professionnel au format Markdown :
# TD - [Titre de la séance adapté au sujet]
2. Un bandeau d'en-tête clair :
> **Matière :** ${params.resourceCode} | **Niveau :** ${difficultyLabel} | **Durée estimée :** [ex: 1h30] ${params.includeGrading ? "| **Barème :** /20 points" : ""}
3. Des énoncés ancrés dans la réalité des Réseaux & Télécoms (architectures réelles, trames Ethernet, adresses IP, calculs de débit binaire, affaiblissement, configuration d'équipements).
4. Rédige les formules mathématiques et unités de mesure avec KaTeX ($...$ ou $$...$$). Ex : $R = \\frac{D}{T}$, $MTU = 1500\\text{ octets}$, $2^{32-26} - 2 = 62\\text{ hôtes}$.
5. Si des schémas de topologie réseau sont nécessaires, utilise du texte ASCII clair (bloc de code \`\`\`).
6. Si le corrigé est demandé (${params.includeSolution ? "OUI" : "NON"}) :
   Pour chaque exercice, place la correction sous :
   ### 📝 Corrigé détaillé & Explications
   Explique chaque étape avec rigueur, les erreurs fréquentes à éviter et le barème.
7. Ne mets pas de balises XML, réponds directement en pur Markdown fluide.`;

    const userMessage: AIMessage = {
      role: "user",
      content: prompt,
      images: params.image ? [params.image] : undefined,
    };

    const reply = await this.callProvider(
      provider,
      providerConfig,
      [
        {
          role: "system",
          content: "Tu es le professeur responsable des Travaux Dirigés (TD) en BUT Réseaux & Télécoms. Rédige des feuilles d'exercices et corrigés en Markdown soigné avec du LaTeX mathématique KaTeX ($...$).",
        },
        userMessage,
      ],
      false
    );

    const rawContent = reply.content || "Erreur lors de la génération du TD.";

    // Détecter ou extraire le titre de la première ligne (# TD ...)
    let title = `TD ${params.resourceCode} - Exercices`;
    const titleMatch = rawContent.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      title = titleMatch[1].trim();
    } else if (params.topic) {
      title = `TD ${params.resourceCode} - ${params.topic}`;
    }

    // Détecter la durée estimée
    let estimatedTime = "1h30";
    const timeMatch = rawContent.match(/Durée estimée\s*:\s*\*?\*?([0-9hmin\s]+)/i);
    if (timeMatch) {
      estimatedTime = timeMatch[1].trim();
    }

    return {
      title,
      content: rawContent,
      estimatedTime,
    };
  }

  public async generateQCM(
    userConfig: AIUserConfig,
    params: QCMGenerationParams
  ): Promise<QCMQuiz> {
    const effectiveConfig = this.resolveConfigForTask(userConfig, "document");
    const provider = effectiveConfig.activeProvider;
    const providerConfig = effectiveConfig.providers[provider] || {};

    const count = Math.min(Math.max(params.questionCount || 5, 2), 20);
    const difficultyLabel =
      params.difficulty === "facile"
        ? "Accessible / Entraînement fondamental"
        : params.difficulty === "difficile"
        ? "Avancé / Niveau Examen & Partiel"
        : "Standard BUT Réseaux & Télécoms";

    let contextDetails = "";
    if (params.sourceType === "photo" || params.image) {
      contextDetails += "\n- SOURCE : Une photo ou scan d'une feuille de cours ou TD a été fournie. Transcris et base tes questions sur les concepts et exercices visibles sur l'image.";
    }
    if (params.documentName || params.documentContent) {
      contextDetails += `\n- DOCUMENT ECAMPUS / MOODLE : "${params.documentName || "Support de cours"}".\nContenu/Extrait du document :\n${(params.documentContent || "").slice(0, 4000)}`;
    }
    if (params.topic) {
      contextDetails += `\n- THÈME CIBLÉ : ${params.topic}`;
    }
    if (params.additionalInstructions) {
      contextDetails += `\n- CONSIGNES COMPLÉMENTAIRES : ${params.additionalInstructions}`;
    }

    const prompt = `Tu es un enseignant universitaire d'excellence en BUT Réseaux & Télécoms (IUT Grand Ouest Normandie - Unicaen).
Conçois un questionnaire à choix multiples (QCM) rigoureux, réaliste et captivant pour la ressource "${params.resourceCode}${params.resourceName ? ` - ${params.resourceName}` : ""}".

PARAMÈTRES :
- Nombre de questions : ${count} questions
- Niveau de difficulté : ${difficultyLabel}
${contextDetails}

RÈGLES STRICTES :
1. Chaque question doit comporter exactement 4 options identifiées par "A", "B", "C", "D".
2. Une seule option est la réponse correcte ("correctOptionId").
3. Fournis une explication pédagogique détaillée ("explanation") expliquant pourquoi cette réponse est vraie et les pièges fréquents.
4. Rédige les formules scientifiques avec KaTeX ($...$ ou $$...$$). Ex : $192.168.1.0/24$, $2^6 - 2 = 62$, $R = \\frac{D}{T}$.
5. Réponds STRICTEMENT avec un objet JSON pur et valide, sans aucun texte autour, selon ce format :
{
  "title": "Titre du QCM adapté au sujet",
  "questions": [
    {
      "id": "q1",
      "question": "Énoncé clair et précis de la question...",
      "options": [
        { "id": "A", "text": "Proposition A" },
        { "id": "B", "text": "Proposition B" },
        { "id": "C", "text": "Proposition C" },
        { "id": "D", "text": "Proposition D" }
      ],
      "correctOptionId": "A",
      "explanation": "Explication claire et didactique démontrant la réponse..."
    }
  ]
}`;

    const userMessage: AIMessage = {
      role: "user",
      content: prompt,
      images: params.image ? [params.image] : undefined,
    };

    let rawReply = "";
    try {
      const reply = await this.callProvider(
        provider,
        providerConfig,
        [
          {
            role: "system",
            content: "Tu es un professeur d'université en Réseaux & Télécoms. Tu génères des QCMs au format JSON pur et valide.",
          },
          userMessage,
        ],
        false
      );
      rawReply = reply.content || "";
    } catch (e: any) {
      console.warn("[-] Appel LLM pour QCM échoué ou offline, utilisation du fallback:", e.message);
    }

    // Extraction du JSON
    let parsed: any = null;
    if (rawReply) {
      try {
        const cleaned = rawReply.replace(/```json\s*|\s*```/g, "").trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        }
      } catch (err) {
        console.warn("[-] Impossible de parser le JSON brut du QCM:", err);
      }
    }

    if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      parsed = this.getDefaultQCM(params.resourceCode, params.topic, count);
    }

    const title = parsed.title || `QCM ${params.resourceCode} - ${params.topic || "Auto-évaluation"}`;
    const formattedQuestions: QCMQuestion[] = parsed.questions.map((q: any, index: number) => ({
      id: q.id || `q-${index + 1}`,
      question: q.question || `Question ${index + 1}`,
      options: Array.isArray(q.options) && q.options.length >= 2
        ? q.options.map((o: any, oIdx: number) => ({
            id: o.id || ["A", "B", "C", "D"][oIdx] || `opt-${oIdx}`,
            text: o.text || String(o),
          }))
        : [
            { id: "A", text: "Option A" },
            { id: "B", text: "Option B" },
            { id: "C", text: "Option C" },
            { id: "D", text: "Option D" },
          ],
      correctOptionId: q.correctOptionId || "A",
      explanation: q.explanation || "Réponse basée sur les concepts clés du cours.",
      points: q.points || 1,
    }));

    const quiz: QCMQuiz = {
      id: `qcm-${uuidv4()}`,
      resourceCode: params.resourceCode.toUpperCase(),
      resourceName: params.resourceName,
      title,
      difficulty: params.difficulty || "moyen",
      sourceType: params.sourceType || "topic",
      documentName: params.documentName,
      questions: formattedQuestions,
      totalPoints: formattedQuestions.length,
      attemptsCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return quiz;
  }

  private getDefaultQCM(resourceCode: string, topic?: string, count = 5): { title: string; questions: any[] } {
    const code = (resourceCode || "R101").toUpperCase();
    const title = `QCM ${code} : ${topic || "Fondamentaux & Notions Clés"}`;
    const samplePool = [
      {
        question: `Dans le modèle OSI et l'architecture TCP/IP, quelle couche est responsable du routage des paquets entre différents sous-réseaux ?`,
        options: [
          { id: "A", text: "Couche Liaison de données (Niveau 2)" },
          { id: "B", text: "Couche Réseau (Niveau 3 - IP)" },
          { id: "C", text: "Couche Transport (Niveau 4 - TCP/UDP)" },
          { id: "D", text: "Couche Physique (Niveau 1)" },
        ],
        correctOptionId: "B",
        explanation: "Le routage s'effectue au niveau 3 (Couche Réseau) via le protocole IP à l'aide des tables de routage des routeurs.",
      },
      {
        question: `Combien d'adresses IPv4 d'hôtes utilisables sont disponibles dans un sous-réseau avec un masque CIDR /26 ?`,
        options: [
          { id: "A", text: "62 hôtes ($2^{32-26} - 2$)" },
          { id: "B", text: "64 hôtes ($2^6$)" },
          { id: "C", text: "126 hôtes" },
          { id: "D", text: "30 hôtes" },
        ],
        correctOptionId: "A",
        explanation: "Un préfixe /26 laisse $32 - 26 = 6$ bits d'hôte. Le nombre d'hôtes utilisables est $2^6 - 2 = 64 - 2 = 62$ (l'adresse réseau et l'adresse de diffusion sont réservées).",
      },
      {
        question: `Quelle est l'adresse MAC de broadcast (diffusion générale) sur un réseau local Ethernet ?`,
        options: [
          { id: "A", text: "00:00:00:00:00:00" },
          { id: "B", text: "127.0.0.1" },
          { id: "C", text: "FF:FF:FF:FF:FF:FF" },
          { id: "D", text: "01:00:5E:00:00:01" },
        ],
        correctOptionId: "C",
        explanation: "La trame Ethernet destinée à l'ensemble des équipements du domaine de diffusion a pour adresse MAC de destination FF:FF:FF:FF:FF:FF (tous les bits à 1).",
      },
      {
        question: `Quel protocole applicatif permet de résoudre automatiquement un nom d'hôte FQDN en adresse IP ?`,
        options: [
          { id: "A", text: "DHCP (Dynamic Host Configuration Protocol)" },
          { id: "B", text: "ARP (Address Resolution Protocol)" },
          { id: "C", text: "DNS (Domain Name System)" },
          { id: "D", text: "NTP (Network Time Protocol)" },
        ],
        correctOptionId: "C",
        explanation: "DNS (port UDP/53) permet la résolution de noms de domaine (ex: unicaen.fr) vers des adresses IP routables.",
      },
      {
        question: `Quelle est la principale différence entre le protocole TCP et UDP au niveau de la couche Transport ?`,
        options: [
          { id: "A", text: "UDP garantit la remise ordonnée des paquets, contrairement à TCP" },
          { id: "B", text: "TCP est orienté connexion avec accusés de réception (ACK), tandis qu'UDP est non orienté connexion et sans contrôle de flux" },
          { id: "C", text: "TCP ne fonctionne qu'en local, UDP sur Internet" },
          { id: "D", text: "UDP chiffre obligatoirement les données avec TLS" },
        ],
        correctOptionId: "B",
        explanation: "TCP établit une connexion (Three-Way Handshake SYN, SYN-ACK, ACK) et garantit la fiabilité et l'ordre des segments. UDP est rapide, léger et sans connexion préalable.",
      },
    ];

    return {
      title,
      questions: samplePool.slice(0, count),
    };
  }

  /**
   * Recherche web légère (Wikipedia FR + DuckDuckGo) utilisée en complément ou fallback
   */
  private async fetchWebSearchContext(query: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
    const results: Array<{ title: string; url: string; snippet: string }> = [];
    try {
      const wikiUrl = `https://fr.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=1&srlimit=3`;
      const wRes = await fetch(wikiUrl, { headers: { "User-Agent": "BackpackStudentApp/1.0" } });
      if (wRes.ok) {
        const wJson: any = await wRes.json();
        for (const item of wJson?.query?.search || []) {
          const title = item.title;
          const snippet = String(item.snippet || "").replace(/<[^>]+>/g, "");
          results.push({
            title: `${title} — Wikipédia`,
            url: `https://fr.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, "_"))}`,
            snippet,
          });
        }
      }
    } catch {
      // Ignorer
    }
    return results;
  }

  /**
   * Répond à une question de quiz Moodle avec recherche Web activée (Google Search / Mistral Web Search) et sources.
   */
  private async runPromptWithWebSearch(
    userConfig: AIUserConfig,
    promptText: string,
    fallbackQuery?: string
  ): Promise<{
    answer: string;
    sources: Array<{ title: string; url: string }>;
    provider: string;
    webSearchUsed: boolean;
  }> {
    const effectiveConfig = this.resolveConfigForTask(userConfig, "proactive");
    const provider = effectiveConfig.activeProvider;
    const providerConfig = effectiveConfig.providers?.[provider] || {};

    // 1. GOOGLE GEMINI avec Google Search Grounding natif
    if (provider === "google" && providerConfig.apiKey) {
      const model = providerConfig.model || "gemini-2.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(providerConfig.apiKey)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: promptText }] }],
          tools: [{ google_search: {} }],
        }),
      });
      const json: any = await res.json().catch(() => ({}));
      if (res.ok && json?.candidates?.[0]) {
        const cand = json.candidates[0];
        const answer = (cand.content?.parts || []).map((p: any) => p.text || "").join("").trim();
        const chunks = cand.groundingMetadata?.groundingChunks || [];
        const sources: Array<{ title: string; url: string }> = [];
        const seen = new Set<string>();
        for (const ch of chunks) {
          const uri = ch?.web?.uri;
          const title = ch?.web?.title || uri;
          if (uri && !seen.has(uri)) {
            seen.add(uri);
            sources.push({ title, url: uri });
          }
        }
        return {
          answer: answer || "Aucune réponse générée.",
          sources,
          provider: `Google (${model})`,
          webSearchUsed: true,
        };
      }
    }

    // 2. MISTRAL AI avec Web Search natif (/v1/conversations)
    if (provider === "mistral" && providerConfig.apiKey) {
      const model = providerConfig.model || "mistral-large-latest";
      try {
        const convRes = await fetch("https://api.mistral.ai/v1/conversations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${providerConfig.apiKey}`,
          },
          body: JSON.stringify({
            model,
            inputs: promptText,
            tools: [{ type: "web_search" }],
          }),
        });
        const convJson: any = await convRes.json().catch(() => ({}));
        if (convRes.ok && Array.isArray(convJson?.outputs)) {
          let answer = "";
          const sources: Array<{ title: string; url: string }> = [];
          const seen = new Set<string>();
          for (const out of convJson.outputs) {
            if (out.type === "message.output") {
              if (typeof out.content === "string") {
                answer += out.content;
              } else if (Array.isArray(out.content)) {
                for (const part of out.content) {
                  if (part.type === "text" && part.text) answer += part.text;
                  if (part.type === "tool_reference" && part.url && !seen.has(part.url)) {
                    seen.add(part.url);
                    sources.push({ title: part.title || part.url, url: part.url });
                  }
                }
              }
            }
          }
          if (answer.trim()) {
            return {
              answer: answer.trim(),
              sources,
              provider: `Mistral (${model})`,
              webSearchUsed: true,
            };
          }
        }
      } catch {
        // Fallback ci-dessous si l'API conversations n'est pas disponible
      }
    }

    // 3. Fallback universel avec contexte Web (Wikipédia) + provider actif
    const webResults = fallbackQuery ? await this.fetchWebSearchContext(fallbackQuery.slice(0, 120)) : [];
    const contextBlock =
      webResults.length > 0
        ? `\n\nRésultats de recherche Web :\n${webResults.map((r, i) => `[${i + 1}] ${r.title} (${r.url})\n${r.snippet}`).join("\n\n")}`
        : "";

    const msg = await this.callProvider(
      provider,
      providerConfig,
      [
        {
          role: "system",
          content: "Tu es un assistant universitaire. Réponds de façon claire, exacte et concise en français en t'appuyant sur les sources fournies.",
        },
        {
          role: "user",
          content: promptText + contextBlock,
        },
      ],
      false
    );

    return {
      answer: msg.content || "Aucune réponse générée.",
      sources: webResults.map((r) => ({ title: r.title, url: r.url })),
      provider: provider,
      webSearchUsed: webResults.length > 0,
    };
  }

  public async answerQuizQuestionWithWebSearch(
    userConfig: AIUserConfig,
    payload: { questionText: string; choicesText: string[] }
  ): Promise<{
    answer: string;
    sources: Array<{ title: string; url: string }>;
    provider: string;
    webSearchUsed: boolean;
  }> {
    const choicesBlock =
      payload.choicesText.length > 0
        ? `\n\nChoix / éléments proposés :\n${payload.choicesText.map((c, i) => `${i + 1}. ${c}`).join("\n")}`
        : "";

    const promptText = `Tu es un assistant pédagogique universitaire. Réponds de manière précise, claire et concise en français à cette question de questionnaire Moodle.${choicesBlock}\n\nQuestion :\n${payload.questionText}\n\nDonne d'abord la réponse exacte (ou l'ordre exact / les bons choix), puis une brève explication factuelle.`;
    return this.runPromptWithWebSearch(userConfig, promptText, payload.questionText);
  }

  /**
   * Pré-analyse toutes les questions d'une page de quiz Moodle en UNE SEULE requête batch
   * pour éviter les limites de débit (free tier) et accélérer l'affichage.
   */
  public async answerQuizQuestionsBatchWithWebSearch(
    userConfig: AIUserConfig,
    questions: Array<{ id: string; questionText: string; choicesText: string[] }>
  ): Promise<{
    results: Record<
      string,
      {
        answer: string;
        sources: Array<{ title: string; url: string }>;
        provider: string;
        webSearchUsed: boolean;
      }
    >;
    provider: string;
    webSearchUsed: boolean;
  }> {
    if (!questions.length) {
      return { results: {}, provider: userConfig.activeProvider, webSearchUsed: false };
    }

    if (questions.length === 1) {
      const q = questions[0];
      const single = await this.answerQuizQuestionWithWebSearch(userConfig, {
        questionText: q.questionText,
        choicesText: q.choicesText,
      });
      return {
        results: { [q.id]: single },
        provider: single.provider,
        webSearchUsed: single.webSearchUsed,
      };
    }

    const questionsBlock = questions
      .map((q, idx) => {
        const choices =
          q.choicesText.length > 0
            ? `\nChoix :\n${q.choicesText.map((c, i) => `  - ${c}`).join("\n")}`
            : "";
        return `### Question ${idx + 1} (id: "${q.id}")\n${q.questionText}${choices}`;
      })
      .join("\n\n");

    const promptText = `Tu es un assistant pédagogique universitaire. Analyse TOUTES les questions de quiz Moodle ci-dessous en UNE SEULE réponse.
Réponds STRICTEMENT avec un tableau JSON valide (sans texte ni bloc markdown autour) où chaque élément correspond à une question :
[
  {
    "id": "id exact de la question",
    "answer": "**Réponse :** <réponse exacte ou texte exact des bons choix>\\n\\n**Explication :** <brève explication factuelle en français (Markdown + LaTeX $...$ autorisé)>"
  }
]

Questions à analyser :
${questionsBlock}`;

    const res = await this.runPromptWithWebSearch(
      userConfig,
      promptText,
      questions[0]?.questionText
    );

    const cleaned = res.answer.replace(/```json\s*|\s*```/g, "").trim();
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    const results: Record<
      string,
      {
        answer: string;
        sources: Array<{ title: string; url: string }>;
        provider: string;
        webSearchUsed: boolean;
      }
    > = {};

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          parsed.forEach((item, idx) => {
            if (!item || !item.answer) return;
            const matchedQ =
              questions.find((q) => q.id === String(item.id)) ||
              (parsed.length === questions.length ? questions[idx] : undefined);
            if (matchedQ) {
              results[matchedQ.id] = {
                answer: String(item.answer),
                sources: res.sources,
                provider: res.provider,
                webSearchUsed: res.webSearchUsed,
              };
            }
          });
        }
      } catch {
        // Fallback ci-dessous si JSON partiel
      }
    }

    // Fallback individuel pour toute question manquante dans le batch
    for (const q of questions) {
      if (!results[q.id]) {
        try {
          results[q.id] = await this.answerQuizQuestionWithWebSearch(userConfig, {
            questionText: q.questionText,
            choicesText: q.choicesText,
          });
        } catch {
          // Ignorer si quota dépassé
        }
      }
    }

    return {
      results,
      provider: res.provider,
      webSearchUsed: res.webSearchUsed,
    };
  }
}

export const aiService = new AIService();
