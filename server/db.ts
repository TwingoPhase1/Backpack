import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import {
  Resource,
  Note,
  Asset,
  ScheduleEvent,
  SemesterReport,
  ResourceGrade,
  DetectedNewGrade,
  SyncStatus,
  ScheduleChangeNotification,
  MoodleCourse,
  MoodleSyncStatus,
  StickyNote,
  LessonItem,
  AIUserConfig,
  SlideDeckItem,
  QCMQuiz,
  AuthorizedSender,
} from "../src/types/index.js";
import { getDefaultLastYearGrades } from "./services/webnotesScraper.js";
import {
  findBestMoodleCourseForResource,
  findMoodleCoursesForResource,
} from "./services/moodleMatcher.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../data");
const UPLOADS_DIR = path.resolve(DATA_DIR, "uploads");
const DB_FILE = path.resolve(DATA_DIR, "database.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

interface DatabaseSchema {
  resources: Resource[];
  notes: Note[];
  assets: Asset[];
  scheduleEvents: ScheduleEvent[];
  grades: SemesterReport[];
  recentGrades: DetectedNewGrade[];
  scheduleChanges: ScheduleChangeNotification[];
  syncStatus: SyncStatus;
  moodleCourses?: MoodleCourse[];
  moodleSyncStatus?: MoodleSyncStatus;
  stickyNotes?: StickyNote[];
  lessons?: LessonItem[];
  aiConfig?: AIUserConfig;
  slides?: SlideDeckItem[];
  qcms?: QCMQuiz[];
  authorizedSenders?: AuthorizedSender[];
}

const COLOR_MAP: Record<string, string> = {
  "1": "#818cf8", // Lavande (SAE)
  "2": "#34d399", // Sauge (Maths)
  "3": "#a855f7", // Raisin (Systemes)
  "4": "#f472b6", // Flamant (Telecoms)
  "5": "#fbbf24", // Banane (Anglais)
  "6": "#fb923c", // Mandarine (Com/PPP)
  "7": "#06b6d4", // Paon (Reseaux)
  "8": "#94a3b8", // Graphite (Speciaux)
  "9": "#3b82f6", // Myrtille (Prog/Web)
  "10": "#22c55e", // Basilic (Gestion Projet)
  "11": "#ef4444", // Tomate (Examens)
};

function getInitialResources(): Resource[] {
  const mappingPath = path.resolve(__dirname, "../unicaen-sync/mapping.json");
  let mapping: Record<string, any> = {};
  if (fs.existsSync(mappingPath)) {
    try {
      mapping = JSON.parse(fs.readFileSync(mappingPath, "utf-8"));
    } catch (e) {
      console.error("Error reading mapping.json", e);
    }
  }

  const catalogue = [
    // Semestre 1 SAÉs
    { code: "SAE11", name: "Se sensibiliser à l'hygiène informatique et à la cybersécurité", shortName: "Sensibilisation Cyber", sem: 1, cat: "SAE", emoji: "🛡️" },
    { code: "SAE12", name: "S'initier aux réseaux informatiques", shortName: "Init. Réseaux", sem: 1, cat: "SAE", emoji: "🌐" },
    { code: "SAE13", name: "Découvrir un dispositif de transmission", shortName: "Dispositif Trans.", sem: 1, cat: "SAE", emoji: "📡" },
    { code: "SAE14", name: "Se présenter sur Internet", shortName: "Présence Internet", sem: 1, cat: "SAE", emoji: "💻" },
    { code: "SAE15", name: "Traiter des données", shortName: "Traitement Données", sem: 1, cat: "SAE", emoji: "📊" },
    { code: "SAE16", name: "Portfolio", shortName: "Portfolio", sem: 1, cat: "SAE", emoji: "📁" },

    // Semestre 1 Ressources
    { code: "R101", name: "Initiation aux réseaux informatiques", shortName: "Init. Réseaux", sem: 1, cat: "Ressource", emoji: "🌐" },
    { code: "R102", name: "Principes et architecture des réseaux", shortName: "Archi. Réseaux", sem: 1, cat: "Ressource", emoji: "🔀" },
    { code: "R103", name: "Réseaux locaux et équipements actifs", shortName: "Réseaux Locaux", sem: 1, cat: "Ressource", emoji: "🔧" },
    { code: "R104", name: "Fondamentaux des systèmes électroniques", shortName: "Syst. Élec.", sem: 1, cat: "Ressource", emoji: "⚡" },
    { code: "R105", name: "Supports de transmission pour les réseaux locaux", shortName: "Supports Trans.", sem: 1, cat: "Ressource", emoji: "📡" },
    { code: "R106", name: "Architecture des systèmes numériques et informatiques", shortName: "Archi. Numérique", sem: 1, cat: "Ressource", emoji: "🖥️" },
    { code: "R107", name: "Fondamentaux de la programmation", shortName: "Prog. Fondamentaux", sem: 1, cat: "Ressource", emoji: "🐍" },
    { code: "R108", name: "Bases des systèmes d'exploitation", shortName: "Syst. Exploitation", sem: 1, cat: "Ressource", emoji: "🐧" },
    { code: "R109", name: "Introduction aux technologies Web", shortName: "Tech. Web", sem: 1, cat: "Ressource", emoji: "🌍" },
    { code: "R110", name: "Anglais de communication et initiation au vocabulaire technique", shortName: "Anglais Tech.", sem: 1, cat: "Ressource", emoji: "🇬🇧" },
    { code: "R111", name: "Expression-Culture-Communication Professionnelles 1", shortName: "Com. Pro. 1", sem: 1, cat: "Ressource", emoji: "🗣️" },
    { code: "R112", name: "Projet Personnel et Professionnel", shortName: "PPP 1", sem: 1, cat: "Ressource", emoji: "🎯" },
    { code: "R113", name: "Mathématiques du signal", shortName: "Maths Signal", sem: 1, cat: "Ressource", emoji: "📈" },
    { code: "R114", name: "Mathématiques des transmissions", shortName: "Maths Trans.", sem: 1, cat: "Ressource", emoji: "📐" },
    { code: "R115", name: "Gestion de projet", shortName: "Gestion Projet", sem: 1, cat: "Ressource", emoji: "📋" },

    // Semestre 2 SAÉs
    { code: "SAE21", name: "Construire un réseau informatique pour une petite structure", shortName: "Réseau Petite Structure", sem: 2, cat: "SAE", emoji: "🏢" },
    { code: "SAE22", name: "Mesurer et caractériser un signal ou un système", shortName: "Mesure Signal", sem: 2, cat: "SAE", emoji: "🔬" },
    { code: "SAE23", name: "Mettre en place une solution informatique pour l'entreprise", shortName: "Solution Entreprise", sem: 2, cat: "SAE", emoji: "💼" },
    { code: "SAE24", name: "Projet intégratif", shortName: "Projet Intégratif", sem: 2, cat: "SAE", emoji: "🚀" },
    { code: "SAE25", name: "Portfolio", shortName: "Portfolio S2", sem: 2, cat: "SAE", emoji: "📁" },

    // Semestre 2 Ressources
    { code: "R201", name: "Technologie de l'Internet", shortName: "Tech. Internet", sem: 2, cat: "Ressource", emoji: "☁️" },
    { code: "R202", name: "Administration système et fondamentaux de la virtualisation", shortName: "Admin Sys.", sem: 2, cat: "Ressource", emoji: "🛠️" },
    { code: "R203", name: "Bases des services réseaux", shortName: "Services Réseaux", sem: 2, cat: "Ressource", emoji: "🔌" },
    { code: "R204", name: "Initiation à la téléphonie d'entreprise", shortName: "Téléphonie", sem: 2, cat: "Ressource", emoji: "☎️" },
    { code: "R205", name: "Signaux et Systèmes pour les transmissions", shortName: "Signaux & Syst.", sem: 2, cat: "Ressource", emoji: "📶" },
    { code: "R206", name: "Numérisation de l'information", shortName: "Numérisation", sem: 2, cat: "Ressource", emoji: "🔢" },
    { code: "R207", name: "Sources de données", shortName: "Sources Données", sem: 2, cat: "Ressource", emoji: "🗃️" },
    { code: "R208", name: "Analyse et traitement de données structurées", shortName: "Données Struct.", sem: 2, cat: "Ressource", emoji: "📊" },
    { code: "R209", name: "Initiation au développement Web", shortName: "Dev Web", sem: 2, cat: "Ressource", emoji: "💻" },
    { code: "R210", name: "Anglais de communication et développement de l'anglais technique", shortName: "Anglais Tech. S2", sem: 2, cat: "Ressource", emoji: "🇺🇸" },
    { code: "R211", name: "Expression-Culture-Communication Professionnelles 2", shortName: "Com. Pro. 2", sem: 2, cat: "Ressource", emoji: "📣" },
    { code: "R212", name: "Projet Personnel et Professionnel", shortName: "PPP 2", sem: 2, cat: "Ressource", emoji: "🧭" },
    { code: "R213", name: "Mathématiques des systèmes numériques", shortName: "Maths Num.", sem: 2, cat: "Ressource", emoji: "➕" },
    { code: "R214", name: "Analyse mathématique des signaux", shortName: "Analyse Signaux", sem: 2, cat: "Ressource", emoji: "📉" },
  ];

  return catalogue.map((item) => {
    const mapEntry = mapping[item.code] || {};
    const colorId = mapEntry.color || (item.cat === "SAE" ? "1" : "7");
    return {
      id: item.code,
      code: item.code,
      name: item.name,
      shortName: mapEntry.name || item.shortName,
      semester: item.sem as 1 | 2,
      category: item.cat as "Ressource" | "SAE",
      emoji: mapEntry.emoji || item.emoji,
      color: COLOR_MAP[colorId] || "#06b6d4",
      coefs: mapEntry.coefs || {},
    };
  });
}

function getInitialScheduleEvents(): ScheduleEvent[] {
  const syncStorePath = path.resolve(__dirname, "../unicaen-sync/.google_sync_store.json");
  if (!fs.existsSync(syncStorePath)) return [];

  try {
    const raw = JSON.parse(fs.readFileSync(syncStorePath, "utf-8"));
    const eventsObj = raw.events || {};
    const result: ScheduleEvent[] = [];

    for (const [id, e] of Object.entries<any>(eventsObj)) {
      if (!e.start?.dateTime || !e.end?.dateTime) continue;

      const summary = e.summary || "Cours";
      const desc = e.description || "";
      const matchedCode = e.extendedProperties?.private?.matchedCode;

      let teacher: string | undefined;
      const tMatch = desc.match(/(?:Enseignant|Enseignants)\s*:\s*([^\n\r]+)/i);
      if (tMatch) teacher = tMatch[1].trim();

      let group: string | undefined;
      const gMatch = desc.match(/(?:Groupe|Groupes)\s*:\s*([^\n\r]+)/i);
      if (gMatch) group = gMatch[1].trim();

      let type: ScheduleEvent["type"] = "Autre";
      if (summary.includes("Examen") || summary.includes("🚨")) type = "Examen";
      else if (summary.includes("TP") || summary.includes("💻")) type = "TP";
      else if (summary.includes("TD") || summary.includes("✏️")) type = "TD";
      else if (summary.includes("CM") || summary.includes("🎤")) type = "CM";
      else if (summary.includes("SAÉ") || summary.includes("SAE") || summary.includes("🚀")) type = "SAE";

      result.push({
        id: e.id || id,
        summary: summary,
        start: e.start.dateTime,
        end: e.end.dateTime,
        location: e.location || "IUT",
        description: desc,
        teacher,
        group,
        matchedCode,
        type,
        colorId: e.colorId,
        colorHex: COLOR_MAP[e.colorId || "7"] || "#3b82f6",
      });
    }

    return result.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  } catch (err) {
    console.error("Error loading events from google_sync_store.json", err);
    return [];
  }
}

function getInitialNotes(): Note[] {
  return [
    {
      id: "note-cm-sample-1",
      resourceId: "R201",
      type: "CM",
      title: "CM 1 : Architecture du Web et Protocoles HTTP/HTTPS",
      content: `# CM 1 : Architecture du Web et Protocoles HTTP/HTTPS\n\n**Date :** 30 Mars 2026  \n**Enseignant :** Charles SIEPEN  \n**Ressource :** R201 — Technologie de l'Internet\n\n---\n\n## 1. Introduction aux architectures Web\n\nLe Web repose sur le modèle client-serveur classique :\n- **Client** : Navigateur (User Agent) qui émet des requêtes HTTP.\n- **Serveur** : Héberge les ressources et répond aux requêtes.\n\n$$R_{RTT} = 2 \\times T_{propagation} + T_{transmission}$$\n\n### Modèle en couches :\n1. Application (HTTP, DNS)\n2. Transport (TCP, UDP, QUIC)\n3. Internet (IP, ICMP)\n4. Accès Réseau (Ethernet, Wi-Fi)\n\n---\n\n## 2. Le Protocole HTTP/2 et HTTP/3\n\n| Version | Protocole sous-jacent | Multiplexage | Chiffrement |\n|---|---|---|---|\n| HTTP/1.1 | TCP | Non (Head-of-line blocking) | Optionnel (HTTPS) |\n| HTTP/2 | TCP | Oui (Streams binaires) | TLS quasi-systématique |\n| HTTP/3 | QUIC (UDP) | Oui (Indépendant par stream) | TLS 1.3 obligatoire |\n\n\`\`\`bash\n# Exemple de requête avec curl pour inspecter les en-têtes\ncurl -I https://www.unicaen.fr\n\`\`\`\n`,
      createdAt: new Date("2026-03-30T08:00:00Z").toISOString(),
      updatedAt: new Date("2026-03-30T09:30:00Z").toISOString(),
      cmDate: "2026-03-30",
      chapterNumber: 1,
    },
    {
      id: "note-tp-sample-1",
      resourceId: "R202",
      type: "TP",
      title: "TP 1 : Prise en main de Docker et Conteneurisation Linux",
      content: `# TP 1 : Prise en main de Docker et Conteneurisation Linux\n\n**Ressource :** R202 — Administration Système & Virtualisation  \n**Binôme :** TD 1 / TP 1.2  \n**Salle :** 3141\n\n---\n\n## Objectifs de la séance\n- [x] Installer et configurer le démon Docker\n- [x] Déployer un serveur Nginx dans un conteneur isolé\n- [ ] Monter un volume persistant et configurer le réseau bridge\n- [ ] Rédiger le rapport technique avec captures d'écran\n\n---\n\n## 1. Démarrage du conteneur de test\n\n\`\`\`bash\ndocker run -d --name web-test -p 8080:80 nginx:alpine\ndocker ps -a\n\`\`\`\n\nVérification des processus actifs et de l'espace mémoire alloué :\n\n\`\`\`bash\ndocker stats web-test --no-stream\n\`\`\`\n\n> Note : Pensez à insérer vos captures d'écrans dans la médiathèque ci-contre !\n`,
      createdAt: new Date("2026-03-26T08:00:00Z").toISOString(),
      updatedAt: new Date("2026-03-26T11:45:00Z").toISOString(),
      status: "En cours",
      objectives: [
        { id: "obj-1", text: "Installer et configurer le démon Docker", completed: true },
        { id: "obj-2", text: "Déployer un serveur Nginx dans un conteneur isolé", completed: true },
        { id: "obj-3", text: "Monter un volume persistant et configurer le réseau bridge", completed: false },
        { id: "obj-4", text: "Rédiger le rapport technique avec captures d'écran", completed: false },
      ],
    },
  ];
}

function extractTopRecentEvaluations(reports: SemesterReport[]): DetectedNewGrade[] {
  const all: DetectedNewGrade[] = [];
  for (const sem of reports) {
    const combined = { ...(sem.ressources || {}), ...(sem.saes || {}) };
    for (const [code, res] of Object.entries(combined)) {
      for (const ev of res.evaluations || []) {
        if (ev.note !== null && ev.note !== "" && ev.note !== "ABS") {
          all.push({
            id: ev.id,
            resourceCode: code,
            resourceTitle: res.titre,
            description: ev.description,
            note: ev.note,
            coef: ev.coef,
            moyPromo: ev.moy_promo,
            minPromo: ev.min_promo,
            maxPromo: ev.max_promo,
            date: ev.date || undefined,
            detectedAt: new Date().toISOString(),
            isRead: false,
            semester: (sem.semestre_id === 2 ? 2 : 1) as 1 | 2,
          });
        }
      }
    }
  }
  // Sort by date or id descending
  all.sort((a, b) => {
    if (a.date && b.date) return new Date(b.date).getTime() - new Date(a.date).getTime();
    if (a.date) return -1;
    if (b.date) return 1;
    return Number(b.id) - Number(a.id);
  });
  return all.slice(0, 6);
}

function getInitialScheduleChanges(events: ScheduleEvent[]): ScheduleChangeNotification[] {
  const changes: ScheduleChangeNotification[] = [];
  const sorted = [...events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const now = new Date();
  const upcoming = sorted.filter((e) => new Date(e.start) >= now);
  const sample = upcoming.length > 0 ? upcoming.slice(0, 3) : sorted.slice(-3);

  if (sample.length > 0) {
    const ev1 = sample[0];
    changes.push({
      id: "chg-" + ev1.id + "-room",
      eventId: ev1.id,
      type: "room_changed",
      title: ev1.summary,
      matchedCode: ev1.matchedCode,
      start: ev1.start,
      end: ev1.end,
      location: ev1.location,
      previousLocation: "Amphi 1",
      teacher: ev1.teacher,
      changeDescription: `Changement de salle : Amphi 1 ➜ ${ev1.location || "Salle Informatique"}`,
      detectedAt: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
      isRead: false,
    });
  }

  if (upcoming.length > 1) {
    const ev2 = upcoming[1];
    changes.push({
      id: "chg-" + ev2.id + "-time",
      eventId: ev2.id,
      type: "time_changed",
      title: ev2.summary,
      matchedCode: ev2.matchedCode,
      start: ev2.start,
      end: ev2.end,
      location: ev2.location,
      teacher: ev2.teacher,
      changeDescription: `Horaire décalé : début de séance à ${new Date(ev2.start).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`,
      detectedAt: new Date(Date.now() - 3600 * 1000 * 5).toISOString(),
      isRead: false,
    });
  }

  return changes;
}

class Database {
  private data: DatabaseSchema;
  public userDir?: string;
  public dbFile: string;
  public uploadsDir: string;
  public moodleFile: string;

  constructor(userDir?: string) {
    this.userDir = userDir;
    this.dbFile = userDir ? path.resolve(userDir, "database.json") : DB_FILE;
    this.uploadsDir = userDir ? path.resolve(userDir, "uploads") : UPLOADS_DIR;
    this.moodleFile = userDir
      ? path.resolve(userDir, "moodle_courses.json")
      : path.resolve(DATA_DIR, "moodle_courses.json");

    if (!fs.existsSync(path.dirname(this.dbFile))) fs.mkdirSync(path.dirname(this.dbFile), { recursive: true });
    if (!fs.existsSync(this.uploadsDir)) fs.mkdirSync(this.uploadsDir, { recursive: true });

    // Initialiser les cours Moodle pour l'utilisateur s'ils existent dans le cache global
    if (this.userDir && !fs.existsSync(this.moodleFile)) {
      const globalMoodle = path.resolve(DATA_DIR, "moodle_courses.json");
      if (fs.existsSync(globalMoodle)) {
        try {
          fs.copyFileSync(globalMoodle, this.moodleFile);
        } catch {}
      }
    }

    this.data = this.load();
  }

  private load(): DatabaseSchema {
    if (fs.existsSync(this.dbFile)) {
      try {
        const raw = fs.readFileSync(this.dbFile, "utf-8");
        const parsed = JSON.parse(raw);
        let changed = false;
        if (!parsed.grades || parsed.grades.length === 0) {
          parsed.grades = getDefaultLastYearGrades();
          changed = true;
        }
        if (!parsed.recentGrades || parsed.recentGrades.length === 0) {
          parsed.recentGrades = extractTopRecentEvaluations(parsed.grades);
          changed = true;
        }
        if (!parsed.scheduleChanges || parsed.scheduleChanges.length === 0) {
          parsed.scheduleChanges = getInitialScheduleChanges(parsed.scheduleEvents || []);
          changed = true;
        }
        if (!parsed.syncStatus) {
          parsed.syncStatus = {
            lastSyncTime: new Date().toISOString(),
            nextScheduledSync: null,
            lastSyncResult: "success",
            lastSyncMessage: "Relevé initialisé",
            unreadCount: (parsed.recentGrades || []).filter((g: any) => !g.isRead).length,
          };
          changed = true;
        }
        if (!parsed.stickyNotes) {
          parsed.stickyNotes = [];
          changed = true;
        }
        if (!parsed.lessons) {
          parsed.lessons = [];
          changed = true;
        }
        if (!parsed.slides) {
          parsed.slides = [];
          changed = true;
        }
        if (!parsed.qcms) {
          parsed.qcms = [];
          changed = true;
        }
        if (changed) {
          this.saveData(parsed);
        }
        return parsed;
      } catch (e) {
        console.error(`Error reading ${this.dbFile}, re-initializing`, e);
      }
    }

    const grades = getDefaultLastYearGrades();
    const recentGrades = extractTopRecentEvaluations(grades);
    const scheduleEvents = getInitialScheduleEvents();
    const scheduleChanges = getInitialScheduleChanges(scheduleEvents);
    const initialData: DatabaseSchema = {
      resources: getInitialResources(),
      notes: this.userDir ? [] : getInitialNotes(), // Les nouveaux étudiants commencent avec un carnet propre
      assets: [],
      scheduleEvents,
      grades,
      recentGrades,
      scheduleChanges,
      syncStatus: {
        lastSyncTime: new Date().toISOString(),
        nextScheduledSync: null,
        lastSyncResult: "success",
        lastSyncMessage: "Initialisé",
        unreadCount: recentGrades.length,
      },
      stickyNotes: [],
      lessons: [],
      slides: [],
      qcms: [],
    };
    this.saveData(initialData);
    return initialData;
  }

  private saveData(data: DatabaseSchema) {
    fs.writeFileSync(this.dbFile, JSON.stringify(data, null, 2), "utf-8");
  }

  public save() {
    this.saveData(this.data);
  }

  // Backup & Restore
  public getBackupData() {
    return {
      notes: this.data.notes || [],
      stickyNotes: this.data.stickyNotes || [],
      lessons: this.data.lessons || [],
      resources: this.data.resources || [],
      assets: this.data.assets || [],
    };
  }

  public importBackup(
    backupData: {
      notes?: Note[];
      stickyNotes?: StickyNote[];
      lessons?: LessonItem[];
      resources?: Resource[];
      assets?: Asset[];
    },
    mode: "replace" | "merge" = "replace"
  ): { notesCount: number; stickyNotesCount: number; lessonsCount: number } {
    const incomingNotes = Array.isArray(backupData.notes) ? backupData.notes : [];
    const incomingStickyNotes = Array.isArray(backupData.stickyNotes) ? backupData.stickyNotes : [];
    const incomingLessons = Array.isArray(backupData.lessons) ? backupData.lessons : [];
    const incomingAssets = Array.isArray(backupData.assets) ? backupData.assets : [];

    if (mode === "replace") {
      this.data.notes = incomingNotes;
      this.data.stickyNotes = incomingStickyNotes;
      this.data.lessons = incomingLessons;
      if (incomingAssets.length > 0) {
        this.data.assets = incomingAssets;
      }
      if (Array.isArray(backupData.resources) && backupData.resources.length > 0) {
        const existingIds = new Set(this.data.resources.map((r) => r.id));
        for (const res of backupData.resources) {
          if (!existingIds.has(res.id)) {
            this.data.resources.push(res);
          } else {
            const idx = this.data.resources.findIndex((r) => r.id === res.id);
            if (idx !== -1) {
              this.data.resources[idx] = { ...this.data.resources[idx], ...res };
            }
          }
        }
      }
    } else {
      // Merge mode
      const existingNoteIds = new Set(this.data.notes.map((n) => n.id));
      for (const n of incomingNotes) {
        if (existingNoteIds.has(n.id)) {
          const idx = this.data.notes.findIndex((item) => item.id === n.id);
          this.data.notes[idx] = n;
        } else {
          this.data.notes.push(n);
        }
      }

      if (!this.data.stickyNotes) this.data.stickyNotes = [];
      const existingStickyIds = new Set(this.data.stickyNotes.map((s) => s.id));
      for (const s of incomingStickyNotes) {
        if (existingStickyIds.has(s.id)) {
          const idx = this.data.stickyNotes.findIndex((item) => item.id === s.id);
          this.data.stickyNotes[idx] = s;
        } else {
          this.data.stickyNotes.push(s);
        }
      }

      if (!this.data.lessons) this.data.lessons = [];
      const existingLessonIds = new Set(this.data.lessons.map((l) => l.id));
      for (const l of incomingLessons) {
        if (existingLessonIds.has(l.id)) {
          const idx = this.data.lessons.findIndex((item) => item.id === l.id);
          this.data.lessons[idx] = l;
        } else {
          this.data.lessons.push(l);
        }
      }
    }

    this.save();
    return {
      notesCount: this.data.notes.length,
      stickyNotesCount: (this.data.stickyNotes || []).length,
      lessonsCount: (this.data.lessons || []).length,
    };
  }

  public resetAllUserData(): void {
    this.data.notes = [];
    this.data.stickyNotes = [];
    this.data.lessons = [];
    this.data.assets = [];
    if (this.userDir && fs.existsSync(this.uploadsDir)) {
      try {
        const files = fs.readdirSync(this.uploadsDir);
        for (const file of files) {
          fs.unlinkSync(path.join(this.uploadsDir, file));
        }
      } catch (err) {
        console.error("Error cleaning uploads dir", err);
      }
    }
    this.save();
  }

  // Resources
  public getResources(): Resource[] {
    return this.data.resources.map((res) => {
      const resNotes = this.data.notes.filter((n) => n.resourceId === res.id);
      return {
        ...res,
        notesCount: {
          cm: resNotes.filter((n) => n.type === "CM").length,
          td: resNotes.filter((n) => n.type === "TD").length,
          tp: resNotes.filter((n) => n.type === "TP").length,
        },
      };
    });
  }

  public getResourceById(id: string): Resource | undefined {
    return this.data.resources.find((r) => r.id === id);
  }

  public createResource(res: Resource): Resource {
    this.data.resources.push(res);
    this.save();
    return res;
  }

  public updateResource(id: string, update: Partial<Resource>): Resource | undefined {
    const idx = this.data.resources.findIndex((r) => r.id === id);
    if (idx === -1) return undefined;
    this.data.resources[idx] = { ...this.data.resources[idx], ...update };
    this.save();
    return this.data.resources[idx];
  }

  public deleteResource(id: string): boolean {
    const prevLen = this.data.resources.length;
    this.data.resources = this.data.resources.filter((r) => r.id !== id);
    if (this.data.resources.length !== prevLen) {
      this.save();
      return true;
    }
    return false;
  }

  // Notes
  public getNotes(resourceId?: string, type?: "CM" | "TD" | "TP"): Note[] {
    return this.data.notes.filter((n) => {
      if (resourceId && n.resourceId !== resourceId) return false;
      if (type && n.type !== type) return false;
      return true;
    });
  }

  public getNoteById(id: string): Note | undefined {
    return this.data.notes.find((n) => n.id === id);
  }

  public createNote(note: Note): Note {
    if (!note.id) {
      note.id = `note-${uuidv4()}`;
    }
    if (!note.createdAt) {
      note.createdAt = new Date().toISOString();
    }
    if (!note.updatedAt) {
      note.updatedAt = new Date().toISOString();
    }
    this.data.notes.push(note);
    this.save();
    return note;
  }

  public updateNote(id: string, update: Partial<Note>): Note | undefined {
    const idx = this.data.notes.findIndex((n) => n.id === id);
    if (idx === -1) return undefined;
    this.data.notes[idx] = {
      ...this.data.notes[idx],
      ...update,
      updatedAt: new Date().toISOString(),
    };
    this.save();
    return this.data.notes[idx];
  }

  public deleteNote(id: string): boolean {
    const prevLen = this.data.notes.length;
    this.data.notes = this.data.notes.filter((n) => n.id !== id);
    this.data.assets = this.data.assets.filter((a) => a.noteId !== id);
    if (this.data.notes.length !== prevLen) {
      this.save();
      return true;
    }
    return false;
  }

  // Assets
  public getAssetsByNoteId(noteId: string): Asset[] {
    return this.data.assets.filter((a) => a.noteId === noteId);
  }

  public getAssetById(id: string): Asset | undefined {
    return this.data.assets.find((a) => a.id === id);
  }

  public createAsset(asset: Asset): Asset {
    this.data.assets.push(asset);
    this.save();
    return asset;
  }

  public updateAsset(id: string, update: Partial<Asset>): Asset | undefined {
    const idx = this.data.assets.findIndex((a) => a.id === id);
    if (idx === -1) return undefined;
    this.data.assets[idx] = {
      ...this.data.assets[idx],
      ...update,
      id: this.data.assets[idx].id,
      fileName: this.data.assets[idx].fileName,
    };
    this.save();
    return this.data.assets[idx];
  }

  public deleteAsset(id: string): boolean {
    const asset = this.getAssetById(id);
    if (!asset) return false;
    const filePath = path.resolve(UPLOADS_DIR, asset.fileName);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.error("Error unlinking asset file", e);
      }
    }
    this.data.assets = this.data.assets.filter((a) => a.id !== id);
    this.save();
    return true;
  }

  // Schedule
  public getScheduleEvents(): ScheduleEvent[] {
    return this.data.scheduleEvents || [];
  }

  public setScheduleEvents(events: ScheduleEvent[]): { changes: ScheduleChangeNotification[] } {
    const prevMap = new Map<string, ScheduleEvent>();
    for (const e of this.data.scheduleEvents || []) {
      prevMap.set(e.id, e);
    }

    const newChanges: ScheduleChangeNotification[] = [];
    const now = new Date();

    for (const curr of events) {
      const prev = prevMap.get(curr.id);
      if (!prev) {
        if (new Date(curr.start) >= new Date(now.getTime() - 7 * 86400000)) {
          newChanges.push({
            id: `add_${curr.id}_${Date.now()}`,
            eventId: curr.id,
            type: "added",
            title: curr.summary,
            matchedCode: curr.matchedCode,
            start: curr.start,
            end: curr.end,
            location: curr.location,
            teacher: curr.teacher,
            changeDescription: `Nouveau cours planifié (${curr.matchedCode || "Cours"})`,
            detectedAt: new Date().toISOString(),
            isRead: false,
          });
        }
      } else {
        if (prev.location && curr.location && prev.location.trim() !== curr.location.trim()) {
          newChanges.push({
            id: `loc_${curr.id}_${Date.now()}`,
            eventId: curr.id,
            type: "room_changed",
            title: curr.summary,
            matchedCode: curr.matchedCode,
            start: curr.start,
            end: curr.end,
            location: curr.location,
            previousLocation: prev.location,
            teacher: curr.teacher,
            changeDescription: `Changement de salle : ${prev.location} ➜ ${curr.location}`,
            detectedAt: new Date().toISOString(),
            isRead: false,
          });
        }
        if (prev.start !== curr.start || prev.end !== curr.end) {
          const prevStartStr = new Date(prev.start).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
          const currStartStr = new Date(curr.start).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
          newChanges.push({
            id: `time_${curr.id}_${Date.now()}`,
            eventId: curr.id,
            type: "time_changed",
            title: curr.summary,
            matchedCode: curr.matchedCode,
            start: curr.start,
            end: curr.end,
            location: curr.location,
            teacher: curr.teacher,
            changeDescription: `Horaire modifié : ${prevStartStr} ➜ ${currStartStr}`,
            detectedAt: new Date().toISOString(),
            isRead: false,
          });
        }
      }
    }

    // Préserver les liens visio / annulations / ajouts IA lors des synchros ICS
    const mergedEvents = events.map((ev) => {
      const prev = prevMap.get(ev.id);
      if (!prev) return ev;
      return {
        ...ev,
        ...(prev.visioUrl ? { visioUrl: prev.visioUrl } : {}),
        ...(prev.isCancelled !== undefined ? { isCancelled: prev.isCancelled } : {}),
        ...(prev.aiUpdatedReason ? { aiUpdatedReason: prev.aiUpdatedReason } : {}),
        ...(prev.sourceMailId ? { sourceMailId: prev.sourceMailId } : {}),
      };
    });
    const newIds = new Set(mergedEvents.map((e) => e.id));
    for (const prev of prevMap.values()) {
      if (prev.id.startsWith("ai_ev_") && !newIds.has(prev.id)) {
        mergedEvents.push(prev);
      }
    }

    this.data.scheduleEvents = mergedEvents;
    if (newChanges.length > 0) {
      const existing = this.data.scheduleChanges || [];
      this.data.scheduleChanges = [...newChanges, ...existing].slice(0, 30);
    }
    this.save();
    return { changes: newChanges };
  }

  public getScheduleChanges(): ScheduleChangeNotification[] {
    return this.data.scheduleChanges || [];
  }

  // --- Répertoire Professeurs & Staff autorisés pour l'EDT ---
  public getAuthorizedSenders(): AuthorizedSender[] {
    return this.data.authorizedSenders || [];
  }

  public getUniqueScheduleTeacherNames(): string[] {
    const set = new Set<string>();
    for (const ev of this.data.scheduleEvents || []) {
      if (!ev.teacher) continue;
      for (const part of ev.teacher.split(",")) {
        const clean = part.trim();
        if (clean && !clean.toLowerCase().includes("inconnu")) {
          set.add(clean);
        }
      }
    }
    return Array.from(set);
  }

  public upsertAuthorizedSenders(entries: AuthorizedSender[]): AuthorizedSender[] {
    const existing = this.getAuthorizedSenders();
    const map = new Map<string, AuthorizedSender>();
    for (const s of existing) {
      map.set(s.email.toLowerCase(), s);
    }
    for (const entry of entries) {
      const key = entry.email.trim().toLowerCase();
      if (!key) continue;
      const prev = map.get(key);
      // Ne pas écraser un rôle staff manuel par teacher ou vice versa si déjà présent
      map.set(key, prev ? { ...prev, name: entry.name || prev.name } : { ...entry, email: key });
    }
    this.data.authorizedSenders = Array.from(map.values());
    this.save();
    return this.data.authorizedSenders;
  }

  public addStaffSender(email: string, name?: string): AuthorizedSender {
    const normalized = email.trim().toLowerCase();
    const entry: AuthorizedSender = {
      email: normalized,
      name: (name || normalized).trim(),
      role: "staff",
      addedAt: new Date().toISOString(),
    };
    const list = this.getAuthorizedSenders().filter((s) => s.email.toLowerCase() !== normalized);
    list.push(entry);
    this.data.authorizedSenders = list;
    this.save();
    return entry;
  }

  public removeStaffSender(email: string): boolean {
    const normalized = email.trim().toLowerCase();
    const before = this.getAuthorizedSenders();
    const after = before.filter((s) => s.email.toLowerCase() !== normalized);
    if (after.length === before.length) return false;
    this.data.authorizedSenders = after;
    this.save();
    return true;
  }

  public isAuthorizedSender(fromHeader: string, senderName?: string): AuthorizedSender | null {
    const match = (fromHeader || "").match(/<([^>]+)>/);
    const rawEmail = (match ? match[1] : fromHeader || "").trim().toLowerCase();
    if (!rawEmail.includes("@")) return null;

    const direct = this.getAuthorizedSenders().find((s) => s.email.toLowerCase() === rawEmail);
    if (direct) return direct;

    // Fallback par nom de professeur de l'EDT si l'adresse est @unicaen.fr (hors @etu.unicaen.fr)
    if (rawEmail.endsWith("@unicaen.fr") && !rawEmail.endsWith("@etu.unicaen.fr")) {
      const normalize = (s: string) =>
        s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z\s]/g, " ").trim();
      const hay = normalize(`${senderName || ""} ${fromHeader} ${rawEmail.split("@")[0]}`);
      for (const teacher of this.getUniqueScheduleTeacherNames()) {
        const tokens = normalize(teacher).split(/\s+/).filter((t) => t.length >= 3);
        if (tokens.length > 0 && tokens.every((t) => hay.includes(t))) {
          return {
            email: rawEmail,
            name: teacher,
            role: "teacher",
            addedAt: new Date().toISOString(),
          };
        }
      }
    }

    return null;
  }

  public updateScheduleEventById(
    id: string,
    patch: Partial<ScheduleEvent>,
    reason?: string
  ): ScheduleEvent | null {
    const events = this.data.scheduleEvents || [];
    const idx = events.findIndex((e) => e.id === id);
    if (idx === -1) return null;

    const updated: ScheduleEvent = {
      ...events[idx],
      ...patch,
      ...(reason ? { aiUpdatedReason: reason } : {}),
    };
    events[idx] = updated;
    this.data.scheduleEvents = events;

    const changeType: ScheduleChangeNotification["type"] = updated.isCancelled
      ? "cancelled"
      : patch.location && patch.location !== events[idx].location
      ? "room_changed"
      : "time_changed";

    const notif: ScheduleChangeNotification = {
      id: `ai_${updated.id}_${Date.now()}`,
      eventId: updated.id,
      type: changeType,
      title: updated.summary,
      matchedCode: updated.matchedCode,
      start: updated.start,
      end: updated.end,
      location: updated.location,
      teacher: updated.teacher,
      changeDescription: reason || "Mise à jour automatique par l'IA depuis un e-mail",
      detectedAt: new Date().toISOString(),
      isRead: false,
    };
    this.data.scheduleChanges = [notif, ...(this.data.scheduleChanges || [])].slice(0, 30);
    this.save();
    return updated;
  }

  public addScheduleEvent(ev: ScheduleEvent, reason?: string): ScheduleEvent {
    const created: ScheduleEvent = {
      ...ev,
      ...(reason ? { aiUpdatedReason: reason } : {}),
    };
    this.data.scheduleEvents = [...(this.data.scheduleEvents || []), created];
    const notif: ScheduleChangeNotification = {
      id: `ai_add_${created.id}_${Date.now()}`,
      eventId: created.id,
      type: "added",
      title: created.summary,
      matchedCode: created.matchedCode,
      start: created.start,
      end: created.end,
      location: created.location,
      teacher: created.teacher,
      changeDescription: reason || "Cours ajouté automatiquement par l'IA depuis un e-mail",
      detectedAt: new Date().toISOString(),
      isRead: false,
    };
    this.data.scheduleChanges = [notif, ...(this.data.scheduleChanges || [])].slice(0, 30);
    this.save();
    return created;
  }

  public markScheduleChangeAsRead(id?: string) {
    if (!this.data.scheduleChanges) return;
    if (id) {
      const item = this.data.scheduleChanges.find((c) => c.id === id);
      if (item) item.isRead = true;
    } else {
      this.data.scheduleChanges.forEach((c) => (c.isRead = true));
    }
    this.save();
  }

  // Grades / Webnotes
  public getGrades(): SemesterReport[] {
    const gradesFile = path.resolve(DATA_DIR, "grades.json");
    if (fs.existsSync(gradesFile)) {
      try {
        const raw = JSON.parse(fs.readFileSync(gradesFile, "utf-8"));
        if (raw.semestres && Array.isArray(raw.semestres)) return raw.semestres;
        if (Array.isArray(raw)) return raw;
      } catch (e) {
        console.error("Error reading grades.json", e);
      }
    }
    return this.data.grades || [];
  }

  public setGrades(reports: SemesterReport[]): { newlyDetected: DetectedNewGrade[] } {
    // 1. Build map of existing evaluations
    const previousEvals = new Map<string, { note: number | string; date?: string }>();
    for (const sem of this.getGrades()) {
      const combined = { ...(sem.ressources || {}), ...(sem.saes || {}) };
      for (const [code, res] of Object.entries(combined)) {
        for (const ev of res.evaluations || []) {
          previousEvals.set(`${code}_${ev.id}`, { note: ev.note, date: ev.date });
        }
      }
    }

    // 2. Diff with new incoming reports
    const newlyDetected: DetectedNewGrade[] = [];
    for (const sem of reports) {
      const combined = { ...(sem.ressources || {}), ...(sem.saes || {}) };
      for (const [code, res] of Object.entries(combined)) {
        for (const ev of res.evaluations || []) {
          const key = `${code}_${ev.id}`;
          const prev = previousEvals.get(key);
          const isNewEval = !prev;
          const isNewlyGraded =
            prev &&
            (prev.note === null || prev.note === "" || prev.note === "ABS") &&
            ev.note !== null &&
            ev.note !== "" &&
            ev.note !== "ABS";
          const isNoteChanged =
            prev && prev.note !== ev.note && ev.note !== null && ev.note !== "";

          if (isNewEval || isNewlyGraded || isNoteChanged) {
            newlyDetected.push({
              id: ev.id,
              resourceCode: code,
              resourceTitle: res.titre,
              description: ev.description,
              note: ev.note,
              coef: ev.coef,
              moyPromo: ev.moy_promo,
              minPromo: ev.min_promo,
              maxPromo: ev.max_promo,
              date: ev.date,
              detectedAt: new Date().toISOString(),
              isRead: false,
              semester: (sem.semestre_id === 2 ? 2 : 1) as 1 | 2,
            });
          }
        }
      }
    }

    this.data.grades = reports;
    if (newlyDetected.length > 0) {
      const existing = this.data.recentGrades || [];
      const merged = [...newlyDetected, ...existing.filter((e) => !newlyDetected.some((n) => n.id === e.id && n.resourceCode === e.resourceCode))];
      this.data.recentGrades = merged.slice(0, 30);
    }
    this.data.syncStatus = {
      ...(this.data.syncStatus || {}),
      lastSyncTime: new Date().toISOString(),
      lastSyncResult: "success",
      lastSyncMessage: `${reports.length} semestre(s) synchronisé(s) (${newlyDetected.length} nouvelle(s) note(s))`,
      unreadCount: (this.data.recentGrades || []).filter((g) => !g.isRead).length,
    };
    this.save();

    // Also backup to data/grades.json for external scripts
    const gradesFile = path.resolve(DATA_DIR, "grades.json");
    try {
      fs.writeFileSync(gradesFile, JSON.stringify({ semestres: reports }, null, 2), "utf-8");
    } catch (e) {
      console.error("Error writing grades.json", e);
    }

    return { newlyDetected };
  }

  public getRecentGrades(): DetectedNewGrade[] {
    return this.data.recentGrades || [];
  }

  public markGradeAsRead(id?: string) {
    if (!this.data.recentGrades) return;
    if (id) {
      const g = this.data.recentGrades.find((item) => item.id === id);
      if (g) g.isRead = true;
    } else {
      this.data.recentGrades.forEach((item) => (item.isRead = true));
    }
    if (this.data.syncStatus) {
      this.data.syncStatus.unreadCount = this.data.recentGrades.filter((g) => !g.isRead).length;
    }
    this.save();
  }

  public getSyncStatus(): SyncStatus {
    return (
      this.data.syncStatus || {
        lastSyncTime: null,
        nextScheduledSync: null,
        lastSyncResult: "idle",
        lastSyncMessage: "",
        unreadCount: 0,
      }
    );
  }

  public updateSyncStatus(status: Partial<SyncStatus>) {
    this.data.syncStatus = {
      ...(this.data.syncStatus || {
        lastSyncTime: null,
        nextScheduledSync: null,
        lastSyncResult: "idle",
        lastSyncMessage: "",
        unreadCount: 0,
      }),
      ...status,
    };
    this.save();
  }

  public getGradesByResourceId(code: string): { semester: number; resourceGrade?: ResourceGrade }[] {
    const result: { semester: number; resourceGrade?: ResourceGrade }[] = [];
    const allGrades = this.getGrades();

    // Si des semestres 2026+ existent, exclure les anciens semestres 2025 (ex: 2025/2026)
    const getStartYear = (annee?: string) => {
      const m = annee?.match(/^(\d{4})/);
      return m ? Number(m[1]) : 0;
    };
    const maxYear = allGrades.reduce((max, s) => Math.max(max, getStartYear(s.annee)), 0);
    const filteredGrades =
      maxYear >= 2026
        ? allGrades.filter((s) => getStartYear(s.annee) >= maxYear)
        : allGrades;

    const normalize = (s: string) =>
      s
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Z0-9]/g, "");
    const target = normalize(code);

    for (const sem of filteredGrades) {
      const combined = { ...(sem.ressources || {}), ...(sem.saes || {}) };
      let found = combined[code] || combined[code.toUpperCase()];
      if (!found) {
        for (const [k, v] of Object.entries(combined)) {
          if (normalize(k) === target) {
            found = v;
            break;
          }
        }
      }
      if (found) {
        result.push({
          semester: sem.semestre_id || 1,
          resourceGrade: found,
        });
      }
    }
    return result;
  }

  public getMoodleCourses(): MoodleCourse[] {
    if (!this.data.moodleCourses || this.data.moodleCourses.length === 0) {
      const moodleFile = this.moodleFile;
      if (fs.existsSync(moodleFile)) {
        try {
          const raw = JSON.parse(fs.readFileSync(moodleFile, "utf-8"));
          this.data.moodleCourses = raw.courses || [];
        } catch (e) {
          console.error(`Error reading ${moodleFile}`, e);
        }
      }
    }
    return this.data.moodleCourses || [];
  }

  public getMoodleCourseByResource(code: string): MoodleCourse | undefined {
    const res = this.getResourceById(code) || this.data.resources.find((r) => r.code === code);
    return findBestMoodleCourseForResource(code, this.getMoodleCourses(), res?.name);
  }

  public getMoodleCoursesForResource(code: string): MoodleCourse[] {
    const res = this.getResourceById(code) || this.data.resources.find((r) => r.code === code);
    return findMoodleCoursesForResource(code, this.getMoodleCourses(), res?.name);
  }

  public updateMoodleCourses(courses: MoodleCourse[]) {
    this.data.moodleCourses = courses;
    this.save();
  }

  public getMoodleSyncStatus(): MoodleSyncStatus {
    const moodleFile = this.moodleFile;
    let lastSyncedAt: string | null = null;
    let coursesCount = 0;
    let totalDocuments = 0;
    if (fs.existsSync(moodleFile)) {
      try {
        const raw = JSON.parse(fs.readFileSync(moodleFile, "utf-8"));
        lastSyncedAt = raw.lastSyncedAt || null;
        coursesCount = raw.coursesCount || (raw.courses?.length ?? 0);
        totalDocuments = raw.totalDocuments || 0;
      } catch {}
    }
    return (
      this.data.moodleSyncStatus || {
        lastSyncedAt,
        coursesCount,
        totalDocuments,
        isSyncing: false,
        lastError: null,
      }
    );
  }

  public updateMoodleSyncStatus(status: Partial<MoodleSyncStatus>) {
    this.data.moodleSyncStatus = {
      ...this.getMoodleSyncStatus(),
      ...status,
    };
    this.save();
  }

  // --- Sticky Notes (Post-it) ---
  public getStickyNotes(resourceCode?: string): StickyNote[] {
    if (!this.data.stickyNotes) this.data.stickyNotes = [];
    let list = [...this.data.stickyNotes];
    if (resourceCode && resourceCode !== "ALL") {
      list = list.filter((n) => n.resourceCode === resourceCode);
    }
    return list.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }

  public saveStickyNote(noteData: Partial<StickyNote>): StickyNote {
    if (!this.data.stickyNotes) this.data.stickyNotes = [];
    const now = new Date().toISOString();

    if (noteData.id) {
      const idx = this.data.stickyNotes.findIndex((n) => n.id === noteData.id);
      if (idx !== -1) {
        const updated: StickyNote = {
          ...this.data.stickyNotes[idx],
          ...noteData,
          updatedAt: now,
        };
        this.data.stickyNotes[idx] = updated;
        this.save();
        return updated;
      }
    }

    const newNote: StickyNote = {
      id: noteData.id || `postit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title: noteData.title || "",
      content: noteData.content || "",
      color: noteData.color || "yellow",
      resourceCode: noteData.resourceCode || undefined,
      isPinned: noteData.isPinned ?? false,
      createdAt: now,
      updatedAt: now,
    };
    this.data.stickyNotes.unshift(newNote);
    this.save();
    return newNote;
  }

  public deleteStickyNote(id: string): boolean {
    if (!this.data.stickyNotes) return false;
    const initialLen = this.data.stickyNotes.length;
    this.data.stickyNotes = this.data.stickyNotes.filter((n) => n.id !== id);
    if (this.data.stickyNotes.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  // --- Lessons Planner & Agenda ---
  public getLessons(resourceCode?: string): LessonItem[] {
    if (!this.data.lessons) this.data.lessons = [];
    let list = [...this.data.lessons];
    if (resourceCode && resourceCode !== "ALL") {
      list = list.filter((l) => l.resourceCode === resourceCode);
    }
    return list.sort((a, b) => {
      if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  public saveLesson(lessonData: Partial<LessonItem>): LessonItem {
    if (!this.data.lessons) this.data.lessons = [];
    const now = new Date().toISOString();

    if (lessonData.id) {
      const idx = this.data.lessons.findIndex((l) => l.id === lessonData.id);
      if (idx !== -1) {
        const updated: LessonItem = {
          ...this.data.lessons[idx],
          ...lessonData,
          updatedAt: now,
        };
        this.data.lessons[idx] = updated;
        this.save();
        return updated;
      }
    }

    const newLesson: LessonItem = {
      id: lessonData.id || `lesson-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title: lessonData.title || "Nouvelle leçon",
      resourceCode: lessonData.resourceCode || "R101",
      type: lessonData.type || "LECON",
      dueDate: lessonData.dueDate,
      description: lessonData.description || "",
      isCompleted: lessonData.isCompleted ?? false,
      reminderEnabled: lessonData.reminderEnabled ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.data.lessons.unshift(newLesson);
    this.save();
    return newLesson;
  }

  public deleteLesson(id: string): boolean {
    if (!this.data.lessons) return false;
    const initialLen = this.data.lessons.length;
    this.data.lessons = this.data.lessons.filter((l) => l.id !== id);
    if (this.data.lessons.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  public toggleLessonCompleted(id: string): LessonItem | null {
    if (!this.data.lessons) return null;
    const item = this.data.lessons.find((l) => l.id === id);
    if (!item) return null;
    item.isCompleted = !item.isCompleted;
    item.updatedAt = new Date().toISOString();
    this.save();
    return item;
  }

  // --- Configuration IA Étudiant ---
  public getAIConfig(): AIUserConfig {
    if (!this.data.aiConfig) {
      this.data.aiConfig = {
        enabled: false,
        activeProvider: "ollama",
        providers: {
          ollama: { baseUrl: "http://localhost:11434", model: "llama3.2" },
          openrouter: { apiKey: "", model: "meta-llama/llama-3.3-70b-instruct" },
          claude: { apiKey: "", model: "claude-3-5-sonnet-latest" },
          mistral: { apiKey: "", model: "mistral-large-latest" },
          google: { apiKey: "", model: "gemini-2.5-flash" },
        },
        enableTools: true,
        enableProactive: true,
      };
      this.save();
    } else if (!this.data.aiConfig.providers.google) {
      this.data.aiConfig.providers.google = { apiKey: "", model: "gemini-2.5-flash" };
      this.save();
    }
    return this.data.aiConfig;
  }

  public setAIConfig(config: Partial<AIUserConfig>): AIUserConfig {
    const current = this.getAIConfig();
    this.data.aiConfig = {
      ...current,
      ...config,
      providers: {
        ...current.providers,
        ...(config.providers || {}),
      },
    };
    this.save();
    return this.data.aiConfig;
  }

  public getSlides(): SlideDeckItem[] {
    if (!this.data.slides) {
      this.data.slides = [];
    }
    return this.data.slides;
  }

  public getSlideById(id: string): SlideDeckItem | undefined {
    return this.getSlides().find((s) => s.id === id);
  }

  public saveSlide(deck: SlideDeckItem): SlideDeckItem {
    const slides = this.getSlides();
    const idx = slides.findIndex((s) => s.id === deck.id);
    if (idx >= 0) {
      slides[idx] = {
        ...slides[idx],
        ...deck,
        updatedAt: new Date().toISOString(),
      };
      this.save();
      return slides[idx];
    } else {
      const newDeck: SlideDeckItem = {
        ...deck,
        createdAt: deck.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      slides.push(newDeck);
      this.save();
      return newDeck;
    }
  }

  public deleteSlide(id: string): boolean {
    const slides = this.getSlides();
    const idx = slides.findIndex((s) => s.id === id);
    if (idx >= 0) {
      slides.splice(idx, 1);
      this.save();
      return true;
    }
    return false;
  }

  // QCMs
  public getQCMs(resourceCode?: string): QCMQuiz[] {
    if (!this.data.qcms) this.data.qcms = [];
    if (!resourceCode) return this.data.qcms;
    return this.data.qcms.filter((q) => q.resourceCode.toUpperCase() === resourceCode.toUpperCase());
  }

  public getQCMById(id: string): QCMQuiz | undefined {
    if (!this.data.qcms) this.data.qcms = [];
    return this.data.qcms.find((q) => q.id === id);
  }

  public createQCM(qcm: QCMQuiz): QCMQuiz {
    if (!this.data.qcms) this.data.qcms = [];
    if (!qcm.id) qcm.id = `qcm-${uuidv4()}`;
    if (!qcm.createdAt) qcm.createdAt = new Date().toISOString();
    if (!qcm.updatedAt) qcm.updatedAt = new Date().toISOString();
    this.data.qcms.unshift(qcm);
    this.save();
    return qcm;
  }

  public updateQCM(id: string, update: Partial<QCMQuiz>): QCMQuiz | undefined {
    if (!this.data.qcms) this.data.qcms = [];
    const idx = this.data.qcms.findIndex((q) => q.id === id);
    if (idx === -1) return undefined;
    this.data.qcms[idx] = {
      ...this.data.qcms[idx],
      ...update,
      updatedAt: new Date().toISOString(),
    };
    this.save();
    return this.data.qcms[idx];
  }

  public deleteQCM(id: string): boolean {
    if (!this.data.qcms) this.data.qcms = [];
    const prev = this.data.qcms.length;
    this.data.qcms = this.data.qcms.filter((q) => q.id !== id);
    if (this.data.qcms.length !== prev) {
      this.save();
      return true;
    }
    return false;
  }

  public recordQCMAttempt(id: string, score: number, totalPoints?: number): QCMQuiz | undefined {
    if (!this.data.qcms) this.data.qcms = [];
    const idx = this.data.qcms.findIndex((q) => q.id === id);
    if (idx === -1) return undefined;
    const qcm = this.data.qcms[idx];
    const best = qcm.bestScore !== undefined ? Math.max(qcm.bestScore, score) : score;
    const attempts = (qcm.attemptsCount || 0) + 1;
    this.data.qcms[idx] = {
      ...qcm,
      lastScore: score,
      bestScore: best,
      totalPoints: totalPoints || qcm.totalPoints || 20,
      attemptsCount: attempts,
      lastAttemptAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.save();
    return this.data.qcms[idx];
  }
}

const userDbs = new Map<string, Database>();

export function getUserDb(username: string): Database {
  const norm = username.toLowerCase().trim();
  let dbInstance = userDbs.get(norm);
  if (!dbInstance) {
    const userDir = path.resolve(DATA_DIR, "users", norm);
    dbInstance = new Database(userDir);
    userDbs.set(norm, dbInstance);
  }
  return dbInstance;
}

export function deleteUserDb(username: string): void {
  const norm = username.toLowerCase().trim();
  userDbs.delete(norm);
  const userDir = path.resolve(DATA_DIR, "users", norm);
  if (fs.existsSync(userDir)) {
    try {
      fs.rmSync(userDir, { recursive: true, force: true });
      console.log(`[+] Données utilisateur supprimées : ${userDir}`);
    } catch (err) {
      console.error(`[-] Erreur suppression répertoire ${userDir}:`, err);
    }
  }
}

export const db = new Database();
export { UPLOADS_DIR, Database };
