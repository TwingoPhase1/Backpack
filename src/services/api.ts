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
  MoodleAssignment,
  NextcloudItem,
  NextcloudStatus,
  MailMessage,
  MailDetail,
  MailSendPayload,
  AuthorizedSender,
  User,
  AuthResponse,
  TwoFactorMethod,
  TwoFactorConfig,
  AdminUserSummary,
  StickyNote,
  LessonItem,
  LessonReminder,
  AIProvider,
  AIUserConfig,
  AIMessage,
  AIProactiveInsight,
  CrousMenuResponse,
  SlideDeckItem,
  TDExerciseGenerationParams,
  QCMQuiz,
  QCMGenerationParams,
} from "../types";

const API_BASE = "/api";

let currentToken = typeof window !== "undefined" ? localStorage.getItem("cartable_token") || "" : "";

export function setApiToken(token: string | null) {
  if (token) {
    currentToken = token;
    if (typeof window !== "undefined") {
      localStorage.setItem("cartable_token", token);
      document.cookie = `cartable_token=${encodeURIComponent(token)}; path=/; max-age=2592000; SameSite=Lax`;
    }
  } else {
    currentToken = "";
    if (typeof window !== "undefined") {
      localStorage.removeItem("cartable_token");
      document.cookie = "cartable_token=; path=/; max-age=0; SameSite=Lax";
    }
  }
}

export function getApiToken(): string {
  if (!currentToken && typeof window !== "undefined") {
    currentToken = localStorage.getItem("cartable_token") || "";
    if (!currentToken && document.cookie) {
      const match = document.cookie.match(/(?:^|;\s*)cartable_token=([^;]+)/);
      if (match) {
        currentToken = decodeURIComponent(match[1]);
        localStorage.setItem("cartable_token", currentToken);
      }
    }
  }
  return currentToken;
}

function appendTokenToUrl(url: string): string {
  const token = getApiToken();
  if (!token) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  const token = getApiToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const updatedInit: RequestInit = {
    ...init,
    headers,
    credentials: "include",
  };
  const res = await fetch(input, updatedInit);
  if (res.status === 401) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("cartable:unauthorized"));
    }
  }
  return res;
}

export const api = {
  // Authentication & Session
  async login(
    username: string,
    password: string,
    options?: { otpCode?: string; preferredMethod?: TwoFactorMethod; totpSecret?: string; grid?: any; save2FA?: boolean }
  ): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, ...options }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Identifiants invalides");
    }
    if (data.token) {
      setApiToken(data.token);
    }
    return data;
  },

  async verify2FA(payload: {
    challengeId: string;
    method: TwoFactorMethod;
    code?: string;
    totpSecret?: string;
    grid?: any;
    save2FA?: boolean;
  }): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/auth/verify-2fa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Code 2FA invalide");
    }
    if (data.token) {
      setApiToken(data.token);
    }
    return data;
  },

  async get2FAConfig(): Promise<TwoFactorConfig> {
    const res = await authFetch(`${API_BASE}/auth/2fa/config`);
    if (!res.ok) throw new Error("Impossible de charger la configuration 2FA");
    return res.json();
  },

  async update2FAConfig(payload: {
    preferredMethod?: TwoFactorMethod;
    totpSecret?: string;
    grid?: any;
    clearTotp?: boolean;
    clearGrid?: boolean;
  }): Promise<{ success: boolean; user: User }> {
    const res = await authFetch(`${API_BASE}/auth/2fa/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur sauvegarde 2FA");
    return data;
  },

  async getMe(): Promise<User> {
    const res = await authFetch(`${API_BASE}/auth/me`);
    if (!res.ok) throw new Error("Non connecté");
    const data = await res.json();
    return data.user || data;
  },

  async logout(): Promise<void> {
    try {
      await authFetch(`${API_BASE}/auth/logout`, { method: "POST" });
    } finally {
      setApiToken(null);
    }
  },

  async getAdminUsers(): Promise<{ users: AdminUserSummary[]; total: number }> {
    const res = await authFetch(`${API_BASE}/auth/admin/users`);
    if (!res.ok) throw new Error("Accès refusé ou réservé à l'administrateur");
    return res.json();
  },

  async acceptTerms(version = "1.0"): Promise<{ success: boolean; user: User }> {
    const res = await authFetch(`${API_BASE}/auth/accept-terms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Erreur acceptation des conditions");
    }
    return data;
  },

  // Resources
  async getResources(): Promise<Resource[]> {
    const res = await authFetch(`${API_BASE}/resources`);
    if (!res.ok) throw new Error("Erreur chargement ressources");
    return res.json();
  },

  async getResource(id: string): Promise<Resource> {
    const res = await authFetch(`${API_BASE}/resources/${id}`);
    if (!res.ok) throw new Error("Ressource introuvable");
    return res.json();
  },

  async createResource(data: Partial<Resource>): Promise<Resource> {
    const res = await authFetch(`${API_BASE}/resources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Erreur création ressource");
    return res.json();
  },

  async updateResource(id: string, data: Partial<Resource>): Promise<Resource> {
    const res = await authFetch(`${API_BASE}/resources/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Erreur mise à jour ressource");
    return res.json();
  },

  async deleteResource(id: string): Promise<void> {
    const res = await authFetch(`${API_BASE}/resources/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Erreur suppression ressource");
  },

  // Notes
  async getNotes(resourceId?: string, type?: "CM" | "TD" | "TP"): Promise<Note[]> {
    const params = new URLSearchParams();
    if (resourceId) params.append("resourceId", resourceId);
    if (type) params.append("type", type);
    const res = await authFetch(`${API_BASE}/notes?${params.toString()}`);
    if (!res.ok) throw new Error("Erreur chargement notes");
    return res.json();
  },

  async getNote(id: string): Promise<Note & { assets: Asset[] }> {
    const res = await authFetch(`${API_BASE}/notes/${id}`);
    if (!res.ok) throw new Error("Note introuvable");
    return res.json();
  },

  async createNote(data: Partial<Note>): Promise<Note> {
    const res = await authFetch(`${API_BASE}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Erreur création note");
    return res.json();
  },

  async updateNote(id: string, data: Partial<Note>): Promise<Note> {
    const res = await authFetch(`${API_BASE}/notes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Erreur mise à jour note");
    return res.json();
  },

  async deleteNote(id: string): Promise<void> {
    const res = await authFetch(`${API_BASE}/notes/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Erreur suppression note");
  },

  // Images / Assets
  async uploadImage(noteId: string, file: File): Promise<Asset> {
    const formData = new FormData();
    formData.append("image", file);
    const res = await authFetch(`${API_BASE}/images/upload/${noteId}`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error("Erreur téléversement image");
    return res.json();
  },

  async renameImage(id: string, name: string): Promise<Asset> {
    const res = await authFetch(`${API_BASE}/images/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error("Erreur renommage image");
    return res.json();
  },

  async deleteImage(id: string): Promise<void> {
    const res = await authFetch(`${API_BASE}/images/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Erreur suppression image");
  },

  getImageUrl(id: string): string {
    return appendTokenToUrl(`${API_BASE}/images/${id}`);
  },

  // Schedule
  async getSchedule(start?: string, end?: string, code?: string): Promise<ScheduleEvent[]> {
    const params = new URLSearchParams();
    if (start) params.append("start", start);
    if (end) params.append("end", end);
    if (code) params.append("code", code);
    const res = await authFetch(`${API_BASE}/schedule?${params.toString()}`);
    if (!res.ok) throw new Error("Erreur chargement emploi du temps");
    return res.json();
  },

  async syncSchedule(live = false): Promise<{ message: string; count: number }> {
    const res = await authFetch(`${API_BASE}/schedule/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ live }),
    });
    if (!res.ok) throw new Error("Erreur synchronisation emploi du temps");
    return res.json();
  },

  async getScheduleChanges(): Promise<{ changes: ScheduleChangeNotification[]; unreadCount: number }> {
    const res = await authFetch(`${API_BASE}/schedule/changes`);
    if (!res.ok) throw new Error("Erreur chargement alertes emploi du temps");
    return res.json();
  },

  async markScheduleChangeAsRead(
    id?: string
  ): Promise<{ success: boolean; changes: ScheduleChangeNotification[]; unreadCount: number }> {
    const res = await authFetch(`${API_BASE}/schedule/changes/mark-read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error("Erreur marquage alerte lue");
    return res.json();
  },

  // Export URLs
  getExportMarkdownUrl(noteId: string, mode: "url" | "relative" = "url"): string {
    return appendTokenToUrl(`${API_BASE}/export/note/${noteId}/markdown?mode=${mode}`);
  },

  getExportZipUrl(noteId: string): string {
    return appendTokenToUrl(`${API_BASE}/export/note/${noteId}/zip`);
  },

  // Grades / Webnotes
  async getGrades(): Promise<SemesterReport[]> {
    const res = await authFetch(`${API_BASE}/grades`);
    if (!res.ok) throw new Error("Erreur chargement relevé de notes");
    return res.json();
  },

  async getGradesByResource(code: string): Promise<{ semester: 1 | 2; resourceGrade?: ResourceGrade }[]> {
    const res = await authFetch(`${API_BASE}/grades/resource/${code}`);
    if (!res.ok) throw new Error("Erreur chargement notes de la matière");
    return res.json();
  },

  async syncWebnotes(creds: { username?: string; password?: string; sessionCookie?: string }): Promise<any> {
    const res = await authFetch(`${API_BASE}/grades/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creds),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur de synchronisation Webnotes");
    return data;
  },

  async getRecentGrades(): Promise<{ recentGrades: DetectedNewGrade[]; syncStatus: SyncStatus }> {
    const res = await authFetch(`${API_BASE}/grades/recent`);
    if (!res.ok) throw new Error("Erreur chargement dernières notes");
    return res.json();
  },

  async markGradeAsRead(
    id?: string
  ): Promise<{ success: boolean; syncStatus: SyncStatus; recentGrades: DetectedNewGrade[] }> {
    const res = await authFetch(`${API_BASE}/grades/mark-read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error("Erreur marquage note lue");
    return res.json();
  },

  async syncGradesNow(): Promise<{
    success: boolean;
    message: string;
    newlyDetected: DetectedNewGrade[];
    recentGrades: DetectedNewGrade[];
    syncStatus: SyncStatus;
  }> {
    const res = await authFetch(`${API_BASE}/grades/sync-now`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur de synchronisation Webnotes");
    return data;
  },

  // Moodle (ecampus-vert)
  async getMoodleCourses(): Promise<{ courses: MoodleCourse[]; status: MoodleSyncStatus }> {
    const res = await authFetch(`${API_BASE}/moodle/courses`);
    if (!res.ok) throw new Error("Erreur chargement cours Moodle");
    return res.json();
  },

  async getMoodleCourse(code: string): Promise<MoodleCourse> {
    const res = await authFetch(`${API_BASE}/moodle/courses/${encodeURIComponent(code)}`);
    if (!res.ok) throw new Error(`Cours Moodle introuvable pour ${code}`);
    return res.json();
  },

  async getMoodleAssignments(): Promise<{ assignments: MoodleAssignment[]; total: number }> {
    const res = await authFetch(`${API_BASE}/moodle/assignments`);
    if (!res.ok) throw new Error("Erreur chargement devoirs eCampus Moodle");
    return res.json();
  },

  async getMoodleStatus(): Promise<MoodleSyncStatus> {
    const res = await authFetch(`${API_BASE}/moodle/status`);
    if (!res.ok) throw new Error("Erreur statut Moodle");
    return res.json();
  },

  async syncMoodle(forceLogin = false): Promise<{ status: MoodleSyncStatus; courses: MoodleCourse[] }> {
    const res = await authFetch(`${API_BASE}/moodle/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forceLogin }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur synchronisation Moodle");
    return data;
  },

  getMoodleDownloadUrl(fileUrl: string): string {
    return appendTokenToUrl(`${API_BASE}/moodle/download?url=${encodeURIComponent(fileUrl)}`);
  },

  getMoodlePreviewUrl(fileUrl: string): string {
    return appendTokenToUrl(`${API_BASE}/moodle/download?url=${encodeURIComponent(fileUrl)}&inline=1`);
  },

  async getMoodleActivity(url: string, type = "autre"): Promise<{
    type: string;
    title: string;
    url?: string;
    externalUrl?: string;
    bbbJoinEndpoint?: string;
    html: string;
    files: { name: string; url: string }[];
    assignInfo?: {
      cmid?: string;
      submissionStatus?: string;
      gradingStatus?: string;
      dueDate?: string;
      timeRemaining?: string;
      canSubmit?: boolean;
    };
  }> {
    const params = new URLSearchParams({ url, type });
    const res = await authFetch(`${API_BASE}/moodle/activity?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur chargement activité Moodle");
    return data;
  },

  async resolveMoodleBbbJoin(url: string): Promise<string> {
    const res = await authFetch(`${API_BASE}/moodle/bbb/join?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Impossible de rejoindre la visio");
    return data.joinUrl;
  },

  async submitMoodleAssignment(url: string, file: File): Promise<{ success: boolean; message: string }> {
    const form = new FormData();
    form.append("url", url);
    form.append("file", file);
    const res = await authFetch(`${API_BASE}/moodle/assign/submit`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur dépôt devoir Moodle");
    return data;
  },

  async getMoodleQuizInfo(url: string): Promise<{
    title: string;
    url: string;
    introHtml: string;
    canStart: boolean;
    inProgressAttemptUrl?: string;
    buttonLabel: string;
  }> {
    const res = await authFetch(`${API_BASE}/moodle/quiz/info?url=${encodeURIComponent(url)}`);
    const text = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Réponse invalide du serveur (HTTP ${res.status})`);
    }
    if (!res.ok) throw new Error(data.error || "Erreur chargement questionnaire Moodle");
    return data;
  },

  async startMoodleQuiz(url: string): Promise<{
    attemptUrl: string;
    processUrl: string;
    hiddenFields: Record<string, string>;
    questions: Array<{
      id: string;
      number: string;
      textHtml: string;
      flagField?: { name: string; checked: boolean };
      inputs: Array<{
        kind: "radio" | "checkbox" | "text" | "textarea" | "select";
        name: string;
        value?: string;
        labelHtml?: string;
        checked?: boolean;
        placeholder?: string;
        options?: Array<{ value: string; label: string; selected?: boolean }>;
      }>;
    }>;
    hasNextPage: boolean;
    hasPrevPage: boolean;
    allQuestions?: Array<{
      id: string;
      number: string;
      textHtml: string;
      flagField?: { name: string; checked: boolean };
      inputs: Array<{
        kind: "radio" | "checkbox" | "text" | "textarea" | "select";
        name: string;
        value?: string;
        labelHtml?: string;
        checked?: boolean;
        placeholder?: string;
        options?: Array<{ value: string; label: string; selected?: boolean }>;
      }>;
    }>;
  }> {
    const res = await authFetch(`${API_BASE}/moodle/quiz/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const text = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Réponse invalide du serveur (HTTP ${res.status})`);
    }
    if (!res.ok) throw new Error(data.error || "Erreur démarrage questionnaire Moodle");
    return data;
  },

  async submitMoodleQuiz(payload: {
    processUrl: string;
    hiddenFields: Record<string, string>;
    answers: Record<string, string | string[]>;
    action: "next" | "prev" | "finish";
  }): Promise<any> {
    const res = await authFetch(`${API_BASE}/moodle/quiz/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur envoi réponses questionnaire");
    return data;
  },

  async getMoodleQuizAIHelp(payload: {
    questionText: string;
    choicesText: string[];
  }): Promise<{
    answer: string;
    sources: Array<{ title: string; url: string }>;
    provider: string;
    webSearchUsed: boolean;
  }> {
    const res = await authFetch(`${API_BASE}/moodle/quiz/ai-help`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur assistance IA");
    return data;
  },

  async getMoodleQuizAIHelpBatch(questions: Array<{ id: string; questionText: string; choicesText: string[] }>): Promise<{
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
    const res = await authFetch(`${API_BASE}/moodle/quiz/ai-help-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questions }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur pré-analyse IA batch");
    return data;
  },

  // Nextcloud (UniCloud IUT Unicaen)
  async getNextcloudStatus(): Promise<NextcloudStatus> {
    const res = await authFetch(`${API_BASE}/nextcloud/status`);
    if (!res.ok) throw new Error("Erreur statut UniCloud");
    return res.json();
  },

  async getNextcloudFiles(remotePath = "/", refresh = false): Promise<{ path: string; items: NextcloudItem[] }> {
    const params = new URLSearchParams({ path: remotePath });
    if (refresh) params.append("refresh", "true");
    const res = await authFetch(`${API_BASE}/nextcloud/files?${params.toString()}`);
    if (!res.ok) throw new Error("Erreur chargement fichiers UniCloud");
    return res.json();
  },

  async getNextcloudFilesForResource(code: string): Promise<NextcloudItem[]> {
    const res = await authFetch(`${API_BASE}/nextcloud/resource/${encodeURIComponent(code)}`);
    if (!res.ok) return [];
    return res.json();
  },

  getNextcloudDownloadUrl(remotePath: string): string {
    return appendTokenToUrl(`${API_BASE}/nextcloud/download?path=${encodeURIComponent(remotePath)}`);
  },

  async importNextcloudNote(data: {
    remotePath: string;
    resourceId: string;
    type: "CM" | "TP";
    title?: string;
  }): Promise<Note> {
    const res = await authFetch(`${API_BASE}/nextcloud/import-note`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur importation note depuis UniCloud");
    return json;
  },

  async exportNoteToNextcloud(data: {
    noteId: string;
    remoteDir?: string;
  }): Promise<{ success: boolean; message: string; path: string }> {
    const res = await authFetch(`${API_BASE}/nextcloud/export-note`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur export note vers UniCloud");
    return json;
  },

  // Zimbra Webmail Unicaen
  async getMailMessages(
    limit = 30,
    offset = 0,
    refresh = false,
    folder = "INBOX"
  ): Promise<{ folder?: string; totalCount: number; unreadCount: number; messages: MailMessage[] }> {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      folder,
    });
    if (refresh) params.append("refresh", "true");
    const res = await authFetch(`${API_BASE}/mail/messages?${params.toString()}`);
    if (!res.ok) throw new Error("Erreur chargement messagerie Zimbra");
    return res.json();
  },

  async getMailMessage(id: string, folder = "INBOX"): Promise<MailDetail> {
    const res = await authFetch(`${API_BASE}/mail/messages/${encodeURIComponent(id)}?folder=${encodeURIComponent(folder)}`);
    if (!res.ok) throw new Error("Erreur chargement e-mail");
    return res.json();
  },

  async getMailUnreadCount(): Promise<number> {
    const res = await authFetch(`${API_BASE}/mail/unread-count`);
    if (!res.ok) return 0;
    const json = await res.json();
    return json.unreadCount || 0;
  },

  getMailAttachmentUrl(id: string, partIndex: number, folder = "INBOX"): string {
    return appendTokenToUrl(
      `${API_BASE}/mail/messages/${encodeURIComponent(id)}/attachments/${partIndex}?folder=${encodeURIComponent(folder)}`
    );
  },

  async markMailRead(id: string, read: boolean, folder = "INBOX"): Promise<{ success: boolean; isUnread: boolean }> {
    const res = await authFetch(`${API_BASE}/mail/messages/${encodeURIComponent(id)}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read, folder }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur mise à jour lecture");
    return json;
  },

  async deleteMailMessage(id: string, folder = "INBOX"): Promise<{ success: boolean }> {
    const res = await authFetch(
      `${API_BASE}/mail/messages/${encodeURIComponent(id)}?folder=${encodeURIComponent(folder)}`,
      { method: "DELETE" }
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur suppression e-mail");
    return json;
  },

  async sendMail(payload: MailSendPayload): Promise<{ success: boolean; messageId: string }> {
    const res = await authFetch(`${API_BASE}/mail/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur d'envoi SMTP");
    return json;
  },

  async saveMailDraft(payload: MailSendPayload): Promise<{ success: boolean; messageId: string }> {
    const res = await authFetch(`${API_BASE}/mail/drafts/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur sauvegarde brouillon");
    return json;
  },

  async triageMail(
    messages: Array<{ id: string; messageId?: string; subject: string; from: string; date: string }>,
    folder = "INBOX"
  ): Promise<{ success: boolean; triaged: Record<string, any> }> {
    const res = await authFetch(`${API_BASE}/mail/triage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, folder }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur triage IA");
    return json;
  },

  async aiComposeMail(payload: {
    instruction: string;
    mode: "new" | "reply" | "refine";
    currentHtml?: string;
    incomingMail?: { from: string; subject: string; bodyText: string };
    contacts?: Array<{ name: string; email: string }>;
  }): Promise<{ success: boolean; to?: string; subject?: string; bodyHtml: string }> {
    const res = await authFetch(`${API_BASE}/mail/ai-compose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur rédaction IA");
    return json;
  },

  async getAuthorizedStaff(): Promise<{ senders: AuthorizedSender[] }> {
    const res = await authFetch(`${API_BASE}/mail/staff`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur lecture répertoire staff");
    return json;
  },

  async syncTeachersFromZimbra(): Promise<{ success: boolean; resolvedCount: number; senders: AuthorizedSender[] }> {
    const res = await authFetch(`${API_BASE}/mail/staff/sync-teachers`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur synchronisation professeurs");
    return json;
  },

  async addStaffSender(
    email: string,
    name?: string,
    mailId?: string,
    folder?: string
  ): Promise<{ success: boolean; sender: AuthorizedSender; senders: AuthorizedSender[]; actions?: any[] }> {
    const res = await authFetch(`${API_BASE}/mail/staff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, mailId, folder }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur ajout staff");
    return json;
  },

  async removeStaffSender(email: string): Promise<{ success: boolean; senders: AuthorizedSender[] }> {
    const res = await authFetch(`${API_BASE}/mail/staff`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur suppression staff");
    return json;
  },

  // Planner : Pense-bêtes / Post-it
  async getStickyNotes(resourceCode?: string): Promise<{ stickyNotes: StickyNote[] }> {
    const params = new URLSearchParams();
    if (resourceCode && resourceCode !== "ALL") params.append("resourceCode", resourceCode);
    const res = await authFetch(`${API_BASE}/planner/sticky-notes?${params.toString()}`);
    if (!res.ok) throw new Error("Erreur chargement des pense-bêtes");
    return res.json();
  },

  async createStickyNote(data: Partial<StickyNote>): Promise<{ stickyNote: StickyNote }> {
    const res = await authFetch(`${API_BASE}/planner/sticky-notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur création du pense-bête");
    return json;
  },

  async updateStickyNote(id: string, data: Partial<StickyNote>): Promise<{ stickyNote: StickyNote }> {
    const res = await authFetch(`${API_BASE}/planner/sticky-notes/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur mise à jour du pense-bête");
    return json;
  },

  async deleteStickyNote(id: string): Promise<{ success: boolean }> {
    const res = await authFetch(`${API_BASE}/planner/sticky-notes/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur suppression du pense-bête");
    return json;
  },

  // Planner : Cahier de texte & Leçons
  async getLessons(resourceCode?: string): Promise<{ lessons: LessonItem[] }> {
    const params = new URLSearchParams();
    if (resourceCode && resourceCode !== "ALL") params.append("resourceCode", resourceCode);
    const res = await authFetch(`${API_BASE}/planner/lessons?${params.toString()}`);
    if (!res.ok) throw new Error("Erreur chargement des leçons");
    return res.json();
  },

  async createLesson(data: Partial<LessonItem>): Promise<{ lesson: LessonItem }> {
    const res = await authFetch(`${API_BASE}/planner/lessons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur enregistrement de la leçon");
    return json;
  },

  async updateLesson(id: string, data: Partial<LessonItem>): Promise<{ lesson: LessonItem }> {
    const res = await authFetch(`${API_BASE}/planner/lessons/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur mise à jour de la leçon");
    return json;
  },

  async deleteLesson(id: string): Promise<{ success: boolean }> {
    const res = await authFetch(`${API_BASE}/planner/lessons/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur suppression de la leçon");
    return json;
  },

  async toggleLesson(id: string): Promise<{ lesson: LessonItem }> {
    const res = await authFetch(`${API_BASE}/planner/lessons/${encodeURIComponent(id)}/toggle`, {
      method: "POST",
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur bascule statut leçon");
    return json;
  },

  async getLessonReminders(): Promise<{ reminders: LessonReminder[]; count: number }> {
    const res = await authFetch(`${API_BASE}/planner/reminders`);
    if (!res.ok) throw new Error("Erreur calcul des rappels de révision");
    return res.json();
  },

  // Backup, Restauration & Suppression des données / compte
  getBackupDownloadUrl(): string {
    const token = getApiToken();
    return `${API_BASE}/backup/export?token=${encodeURIComponent(token || "")}`;
  },

  async downloadBackupDirectly(): Promise<void> {
    const res = await authFetch(`${API_BASE}/backup/export`);
    if (!res.ok) throw new Error("Erreur téléchargement de la sauvegarde");
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup-cartable-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  async importBackup(data: { backupData: any; mode?: "replace" | "merge" }): Promise<{
    success: boolean;
    message: string;
    imported: { notesCount: number; stickyNotesCount: number; lessonsCount: number };
  }> {
    const res = await authFetch(`${API_BASE}/backup/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur importation de la sauvegarde");
    return json;
  },

  async resetUserData(): Promise<{ success: boolean; message: string }> {
    const res = await authFetch(`${API_BASE}/backup/reset`, {
      method: "POST",
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur réinitialisation des données");
    return json;
  },

  async deleteAccount(confirmUsername: string): Promise<{ success: boolean; message: string }> {
    const res = await authFetch(`${API_BASE}/backup/account`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmUsername }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur suppression du compte");
    return json;
  },

  // --- Intelligence Artificielle & Copilot ---
  async getAIConfig(): Promise<AIUserConfig> {
    const res = await authFetch(`${API_BASE}/ai/config`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur récupération config IA");
    return json;
  },

  async saveAIConfig(config: Partial<AIUserConfig>): Promise<{ success: boolean; message: string; config: AIUserConfig }> {
    const res = await authFetch(`${API_BASE}/ai/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur enregistrement config IA");
    return json;
  },

  async testAIConnection(
    provider: AIProvider,
    config: { apiKey?: string; baseUrl?: string; model?: string },
    profileId?: string
  ): Promise<{ success: boolean; message: string; model?: string }> {
    const res = await authFetch(`${API_BASE}/ai/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, config, profileId }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || json.message || "Erreur test de connexion IA");
    return json;
  },

  async getAIModels(
    provider: AIProvider,
    config?: { apiKey?: string; baseUrl?: string }
  ): Promise<{ models: string[]; source: "api" | "fallback"; error?: string }> {
    const res = await authFetch(`${API_BASE}/ai/models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, config }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur chargement des modèles IA");
    return json;
  },

  async chatAI(
    messages: AIMessage[],
    context?: { resourceCode?: string; currentNoteTitle?: string }
  ): Promise<{ success: boolean; message: AIMessage; toolsExecuted: Array<{ name: string; args: any; result: any }> }> {
    const res = await authFetch(`${API_BASE}/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, context }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur de traitement IA");
    return json;
  },

  async getAIProactiveInsights(): Promise<{ enabled: boolean; insights: AIProactiveInsight[] }> {
    const res = await authFetch(`${API_BASE}/ai/proactive-insights`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur récupération insights IA");
    return json;
  },

  async documentAssistAI(
    action: "continue" | "explain" | "summarize" | "quiz" | "fix_markdown",
    text: string,
    resourceCode?: string,
    noteTitle?: string
  ): Promise<{ success: boolean; action: string; result: string }> {
    const res = await authFetch(`${API_BASE}/ai/document-assist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, text, resourceCode, noteTitle }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur assistance document IA");
    return json;
  },

  async draftEmailAI(params: {
    type: "reply_ack" | "reply_question" | "absence" | "meeting" | "custom";
    recipient?: string;
    subject?: string;
    incomingEmailBody?: string;
    customPrompt?: string;
    studentName?: string;
  }): Promise<{ success: boolean; draft: string }> {
    const res = await authFetch(`${API_BASE}/ai/draft-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur rédaction courriel IA");
    return json;
  },

  // Restaurant Universitaire CROUS Normandie (Campus 3 Ifs)
  async getCrousMenu(refresh = false): Promise<CrousMenuResponse> {
    const res = await authFetch(`${API_BASE}/crous/menu${refresh ? "?refresh=true" : ""}`);
    const json = await res.json();
    if (!res.ok && !json.restaurantName) {
      throw new Error(json.error || "Erreur récupération menu CROUS");
    }
    return json;
  },

  // Diaporama — Bento Slides
  async getSlideDecks(resourceCode?: string): Promise<SlideDeckItem[]> {
    const query = resourceCode ? `?resourceCode=${encodeURIComponent(resourceCode)}` : "";
    const res = await authFetch(`${API_BASE}/slides${query}`);
    if (!res.ok) throw new Error("Erreur récupération des diaporamas");
    return res.json();
  },

  async getSlideDeck(id: string): Promise<SlideDeckItem> {
    const res = await authFetch(`${API_BASE}/slides/${id}`);
    if (!res.ok) throw new Error("Erreur récupération du diaporama");
    return res.json();
  },

  async createSlideDeck(data: Partial<SlideDeckItem>): Promise<SlideDeckItem> {
    const res = await authFetch(`${API_BASE}/slides`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur création du diaporama");
    return json;
  },

  async updateSlideDeck(id: string, data: Partial<SlideDeckItem>): Promise<SlideDeckItem> {
    const res = await authFetch(`${API_BASE}/slides/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur sauvegarde du diaporama");
    return json;
  },

  async deleteSlideDeck(id: string): Promise<void> {
    const res = await authFetch(`${API_BASE}/slides/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Erreur suppression du diaporama");
  },

  getSlideDownloadUrl(id: string): string {
    return appendTokenToUrl(`${API_BASE}/slides/${id}/download`);
  },

  async generateTDExercises(
    params: TDExerciseGenerationParams
  ): Promise<{ success: boolean; title: string; content: string; estimatedTime: string }> {
    const res = await authFetch(`${API_BASE}/ai/generate-td-exercises`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Erreur lors de la génération des exercices de TD");
    }
    return data;
  },

  // QCM API
  async getQCMs(resourceCode?: string): Promise<QCMQuiz[]> {
    const url = resourceCode
      ? `${API_BASE}/qcms?resourceCode=${encodeURIComponent(resourceCode)}`
      : `${API_BASE}/qcms`;
    const res = await authFetch(url);
    if (!res.ok) throw new Error("Erreur chargement des QCMs");
    return res.json();
  },

  async getQCM(id: string): Promise<QCMQuiz> {
    const res = await authFetch(`${API_BASE}/qcms/${id}`);
    if (!res.ok) throw new Error("QCM introuvable");
    return res.json();
  },

  async createQCM(qcm: Partial<QCMQuiz>): Promise<QCMQuiz> {
    const res = await authFetch(`${API_BASE}/qcms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(qcm),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur création du QCM");
    return json;
  },

  async updateQCM(id: string, update: Partial<QCMQuiz>): Promise<QCMQuiz> {
    const res = await authFetch(`${API_BASE}/qcms/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur mise à jour du QCM");
    return json;
  },

  async deleteQCM(id: string): Promise<void> {
    const res = await authFetch(`${API_BASE}/qcms/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Erreur suppression du QCM");
  },

  async submitQCMAttempt(id: string, score: number, totalPoints?: number): Promise<QCMQuiz> {
    const res = await authFetch(`${API_BASE}/qcms/${id}/attempt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score, totalPoints }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur enregistrement de la note du QCM");
    return json;
  },

  async generateQCM(
    params: QCMGenerationParams
  ): Promise<{ success: boolean; quiz: QCMQuiz }> {
    const res = await authFetch(`${API_BASE}/ai/generate-qcm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Erreur lors de la génération du QCM");
    }
    return data;
  },
};


