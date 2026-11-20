export interface Resource {
  id: string; // e.g. "R101"
  code: string; // "R101", "SAE11"
  name: string; // "Initiation aux réseaux informatiques"
  shortName: string; // "Init. Réseaux"
  semester: 1 | 2;
  category: "Ressource" | "SAE";
  emoji: string;
  color: string; // Tailwind color or hex
  coefs?: Record<string, number>;
  description?: string;
  teacher?: string;
  notesCount?: {
    cm: number;
    td?: number;
    tp: number;
  };
}

export interface NoteObjective {
  id: string;
  text: string;
  completed: boolean;
}

export interface Note {
  id: string;
  resourceId: string;
  type: "CM" | "TD" | "TP";
  title: string;
  content: string; // Markdown text with asset://<id>
  createdAt: string;
  updatedAt: string;
  status?: "En cours" | "Terminé" | "À réviser";
  objectives?: NoteObjective[];
  cmDate?: string;
  chapterNumber?: number;
}

export interface Asset {
  id: string; // Unique immutable ID, e.g. "img_1725451234_abc"
  noteId: string;
  name: string; // Editable display name, e.g. "architecture_reseau.png"
  originalName: string;
  fileName: string; // Physical file in uploads/
  mimeType: string;
  size: number;
  url: string; // "/api/images/:id"
  createdAt: string;
}

export interface ScheduleEvent {
  id: string;
  summary: string;
  start: string; // ISO string
  end: string;   // ISO string
  location?: string;
  description?: string;
  teacher?: string;
  group?: string;
  matchedCode?: string; // e.g. "R202"
  type?: "CM" | "TD" | "TP" | "Examen" | "SAE" | "Autre";
  colorId?: string;
  colorHex?: string;
  visioUrl?: string;
  isCancelled?: boolean;
  aiUpdatedReason?: string;
  sourceMailId?: string;
}

export interface AuthorizedSender {
  email: string;
  name: string;
  role: "teacher" | "staff";
  addedAt: string;
}

// Webnotes / Scodoc Grades Types
export interface GradeEvaluation {
  id: string;
  description: string;
  coef: number;
  note: number | string;
  moy_promo?: number;
  max_promo?: number;
  min_promo?: number;
  date?: string;
  remarque?: string;
  poids?: Record<string, number>;
}

export interface ResourceGrade {
  code: string;
  titre: string;
  moyenne: number | string;
  moy_promo?: number;
  max_promo?: number;
  min_promo?: number;
  rang?: number;
  total_etudiants?: number;
  evaluations: GradeEvaluation[];
}

export interface UEGrade {
  code: string; // e.g. "UE1.1"
  titre: string;
  moyenne: number | string;
  rang?: number;
  total?: number;
  ects?: { acquis: number; total: number };
  status?: "Validée" | "Compensée" | "Non validée";
}

export interface SemesterReport {
  id: string;
  titre: string; // "BUT1 S1"
  annee: string; // "2024-2025"
  semestre_id: 1 | 2;
  moyenne_generale?: number | string;
  rang_general?: number;
  total_promo?: number;
  ects_total?: { acquis: number; total: number };
  ues: Record<string, UEGrade>;
  ressources: Record<string, ResourceGrade>;
  saes: Record<string, ResourceGrade>;
  date_sync?: string;
}

export interface DetectedNewGrade {
  id: string;
  resourceCode: string;
  resourceTitle: string;
  description: string;
  note: number | string;
  coef: number;
  moyPromo?: number | string;
  minPromo?: number | string;
  maxPromo?: number | string;
  date?: string;
  detectedAt: string;
  isRead: boolean;
  semester: 1 | 2;
}

export interface SyncStatus {
  lastSyncTime: string | null;
  nextScheduledSync: string | null;
  lastSyncResult: "success" | "error" | "idle";
  lastSyncMessage: string;
  unreadCount: number;
}

export interface ScheduleChangeNotification {
  id: string;
  eventId: string;
  type: "room_changed" | "time_changed" | "added" | "cancelled" | "teacher_changed";
  title: string;
  matchedCode?: string;
  start: string;
  end: string;
  location?: string;
  previousLocation?: string;
  teacher?: string;
  changeDescription: string;
  detectedAt: string;
  isRead: boolean;
}

export interface MoodleFile {
  id: string;
  name: string;
  url: string;
  fileType?: string;
  fileSize?: string;
  localPath?: string;
}

export interface MoodleModule {
  id: string;
  name: string;
  type: "resource" | "assign" | "folder" | "page" | "url" | "forum" | "quiz" | "label" | "autre";
  url: string;
  files: MoodleFile[];
  description?: string;
  html?: string;
  dueDate?: string;
}

export interface MoodleAssignment {
  id: string;
  name: string;
  courseId: number;
  courseTitle: string;
  resourceCode?: string;
  url: string;
  dueDate?: string;
  sectionName?: string;
  description?: string;
}

export interface MoodleSection {
  id: string;
  name: string;
  summaryHtml?: string;
  modules: MoodleModule[];
}

export interface MoodleCourse {
  id: number;
  moodleId: number;
  shortname: string;
  fullname: string;
  resourceCode?: string;
  url: string;
  sections: MoodleSection[];
  lastSyncedAt: string;
}

export interface MoodleSyncStatus {
  lastSyncedAt: string | null;
  coursesCount: number;
  totalDocuments: number;
  isSyncing: boolean;
  lastError: string | null;
}

export interface NextcloudItem {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  contentType?: string;
  lastModified?: string;
  resourceCode?: string;
}

export interface NextcloudStatus {
  connected: boolean;
  user: string;
  quotaUsed?: number;
  quotaAvailable?: number;
  lastError?: string | null;
}

export interface MailAttachment {
  filename: string;
  contentType: string;
  size: number;
  partIndex: number;
}

export interface MailMessage {
  id: string;
  seq: number;
  folder?: string;
  subject: string;
  from: string;
  senderName?: string;
  to?: string;
  cc?: string;
  date: string;
  isUnread: boolean;
  hasAttachments: boolean;
  resourceCode?: string;
  preview?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  threadKey?: string;
  aiSummary?: string;
  aiPriority?: "low" | "normal" | "high" | "urgent";
  aiCategory?: string;
  aiActionRequired?: boolean;
  aiTags?: string[];
  aiScheduleActions?: Array<{ action: string; summary: string; eventId?: string; visioUrl?: string }>;
}

export interface MailDetail extends MailMessage {
  to: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments: MailAttachment[];
}

export interface MailSendPayload {
  to: string;
  cc?: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: {
    filename: string;
    contentBase64: string;
    contentType?: string;
  }[];
}

// Authentification & Utilisateurs
export type TwoFactorMethod = "passcode_grid" | "totp";

export interface TwoFactorConfig {
  preferredMethod: TwoFactorMethod;
  hasGrid: boolean;
  hasTotp: boolean;
}

export interface GridCellChallenge {
  row: string; // "A".."H"
  col: number; // 1..8
  rowIndex: number; // 0..7
  colIndex: number; // 0..7
  label: string; // "E7"
}

export interface User {
  id: string;
  username: string; // e.g. "durel253"
  name: string; // e.g. "Arthur DUREL"
  role: "admin" | "student";
  department: string; // "BUT Réseaux & Télécoms - Campus 3"
  firstLoginAt: string;
  lastLoginAt: string;
  termsAcceptedAt?: string; // Date d'acceptation des CGU & décharge de responsabilité
  termsVersion?: string; // Version acceptée (ex: "1.0")
  twoFactor?: TwoFactorConfig;
}

export interface AuthResponse {
  token?: string;
  user?: User;
  requires2FA?: boolean;
  challengeId?: string;
  methods?: TwoFactorMethod[];
  gridCell?: GridCellChallenge | null;
}

export interface AdminUserSummary {
  id: string;
  username: string;
  name: string;
  role: "admin" | "student";
  firstLoginAt: string;
  lastLoginAt: string;
  notesCount?: number;
  termsAcceptedAt?: string;
}

// Pense-bêtes / Post-it
export type PostItColor = "yellow" | "green" | "blue" | "pink" | "orange" | "purple";

export interface StickyNote {
  id: string;
  title?: string;
  content: string;
  color: PostItColor;
  resourceCode?: string; // optionnel (associé à une ressource comme "R101", ou général si absent)
  isPinned?: boolean;
  createdAt: string;
  updatedAt: string;
}

// Agenda & Cahier de texte des Leçons
export type LessonType = "LECON" | "DEVOIR" | "REVISION" | "TP_PREP";

export interface LessonItem {
  id: string;
  title: string;
  resourceCode: string; // e.g. "R101"
  type: LessonType;
  dueDate?: string; // Format YYYY-MM-DD
  description?: string;
  isCompleted: boolean;
  reminderEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LessonReminder {
  id: string;
  lessonId: string;
  lessonTitle: string;
  resourceCode: string;
  lessonType: LessonType;
  nextCourseDate: string; // ISO date-time of the next session
  nextCourseSummary: string;
  nextCourseLocation?: string;
  nextCourseTeacher?: string;
  isEveningBefore: boolean; // True if current time is the evening before the course (or the day before)
  reminderMessage: string;
}

// Configuration & Types de l'Intelligence Artificielle
export type AIProvider = "ollama" | "openrouter" | "claude" | "mistral" | "google";

export interface AIProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  proactiveModel?: string;
  documentModel?: string;
}

export type AIDefaultRole = "copilot" | "generator" | "agent";

export type AITaskRole =
  | "chat"
  | "mail_compose"
  | "document_assist"
  | "slides"
  | "summary"
  | "td_exercises"
  | "qcm"
  | "mail_triage"
  | "schedule_agent"
  | "quiz_helper";

export interface AIModelProfile {
  id: string;
  name: string;
  provider: AIProvider;
  apiKey?: string;
  baseUrl?: string;
  model: string;
}

export interface AICustomRole {
  id: string;
  name: string;
  description?: string;
  profileId?: string;
}

export interface AIUserConfig {
  enabled: boolean;
  activeProvider: AIProvider;
  providers: Record<AIProvider, AIProviderConfig>;
  profiles?: AIModelProfile[];
  roleAssignments?: Partial<Record<AIDefaultRole, string>>;
  taskAssignments?: Partial<Record<AITaskRole, string>>;
  customRoles?: AICustomRole[];
  enableTools: boolean;
  enableProactive: boolean;
  customSystemPrompt?: string;
}

export interface AIToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface AIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: AIToolCall[];
  toolCallId?: string;
  name?: string;
  images?: string[]; // base64 strings or data URLs
}

export interface TDExerciseGenerationParams {
  resourceCode: string;
  resourceName?: string;
  sourceType: "photo" | "ecampus" | "mixed";
  image?: string; // base64 data URL
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

// QCM & Quiz Types
export interface QCMOption {
  id: string; // "A" | "B" | "C" | "D"
  text: string;
}

export interface QCMQuestion {
  id: string;
  question: string;
  options: QCMOption[];
  correctOptionId: string; // "A" | "B" | "C" | "D"
  explanation: string;
  points?: number;
}

export interface QCMQuiz {
  id: string;
  resourceCode: string;
  resourceName?: string;
  title: string;
  difficulty: "facile" | "moyen" | "difficile";
  sourceType?: "photo" | "ecampus" | "topic";
  documentName?: string;
  questions: QCMQuestion[];
  bestScore?: number;
  lastScore?: number;
  totalPoints?: number;
  attemptsCount?: number;
  lastAttemptAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QCMGenerationParams {
  resourceCode: string;
  resourceName?: string;
  sourceType?: "photo" | "ecampus" | "topic";
  image?: string;
  documentName?: string;
  documentContent?: string;
  topic?: string;
  difficulty?: "facile" | "moyen" | "difficile";
  questionCount?: number;
  additionalInstructions?: string;
}

export interface AIProactiveInsight {
  id: string;
  type: "urgent_homework" | "upcoming_exam" | "grade_alert" | "teacher_email" | "tip";
  title: string;
  description: string;
  resourceCode?: string;
  urgency: "high" | "medium" | "low";
  actionText?: string;
  actionType?: "open_resource" | "open_schedule" | "open_grades" | "open_mail" | "create_lesson";
  actionData?: Record<string, any>;
  createdAt: string;
}

// CROUS Normandie — Restaurant Universitaire (Campus 3 Ifs)
export interface CrousDishCategory {
  name: string; // ex: "Propositions du jour", "Entrées", "Plats"
  dishes: string[];
}

export interface CrousMeal {
  title: string; // "Déjeuner" ou "Dîner"
  categories: CrousDishCategory[];
}

export interface CrousDailyMenu {
  date: string; // "lundi 7 septembre 2026"
  meals: CrousMeal[];
}

export interface CrousRestaurantInfos {
  horaires?: string;
  adresse?: string;
  telephone?: string;
  paiement?: string;
  pratique?: string;
}

export interface CrousMenuResponse {
  success: boolean;
  restaurantName: string;
  sourceUrl: string;
  menus: CrousDailyMenu[];
  todayMenu: CrousDailyMenu | null;
  infos: CrousRestaurantInfos;
  lastFetched: string;
  cached?: boolean;
  error?: string;
}

// Studio Diaporama — Bento Slides
export interface SlideElementStyle {
  fontSize?: number;
  fontWeight?: string;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  textAlign?: "left" | "center" | "right";
  lineHeight?: number;
  padding?: number;
  opacity?: number;
  shadow?: string;
  fontFamily?: string;
  [key: string]: any;
}

export interface SlideElement {
  type: "text" | "shape" | "image" | "chart" | "table" | "media" | "svg";
  id: string;
  morphId?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  content?: string;
  shape?: "rect" | "rounded-rect" | "circle" | "ellipse" | "triangle" | "star" | "line" | "arrow";
  src?: string;
  chartType?: "bar" | "line" | "pie" | "doughnut";
  chartData?: any;
  tableData?: any;
  svg?: string;
  style?: SlideElementStyle;
  [key: string]: any;
}

export interface SlidePage {
  id: string;
  stateOf?: string;
  background?: string;
  transition?: "none" | "fade" | "slide" | "morph";
  notes?: string;
  elements: SlideElement[];
}

export interface BentoDoc {
  format: "bento/slides";
  schema?: "bento/slides";
  version: 1;
  docId?: string;
  title: string;
  aspect?: "16:9" | "4:3";
  size?: { width: number; height: number };
  theme?: {
    font?: string;
    fontFamily?: string;
    background?: string;
    color?: string;
    accent?: string;
  };
  slides: SlidePage[];
  [key: string]: any;
}

export interface SlideDeckItem {
  id: string;
  title: string;
  description?: string;
  resourceCode?: string;
  slideCount: number;
  doc?: BentoDoc;
  createdAt: string;
  updatedAt: string;
}

