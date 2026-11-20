import React, { useState, useEffect, useMemo } from "react";
import {
  Resource,
  Note,
  ScheduleEvent,
  DetectedNewGrade,
  SyncStatus,
  ScheduleChangeNotification,
  MoodleAssignment,
  MailMessage,
  CrousMenuResponse,
} from "../types";
import { api } from "../services/api";
import {
  Calendar,
  Clock,
  MapPin,
  ArrowRight,
  GraduationCap,
  CheckCheck,
  AlertTriangle,
  Mail,
  Video,
  Plus,
  Check,
  Utensils,
  FileText,
  BookOpen,
} from "lucide-react";
import { EveningReminderBanner } from "./EveningReminderBanner";
import { AICopilotWidget } from "./AICopilotWidget";

interface DashboardProps {
  resources: Resource[];
  notes: Note[];
  events: ScheduleEvent[];
  recentGrades?: DetectedNewGrade[];
  syncStatus?: SyncStatus | null;
  scheduleChanges?: ScheduleChangeNotification[];
  onOpenResource: (
    resourceId: string,
    preferredType?: "CM" | "TD" | "TP" | "GRADES" | "MOODLE",
    noteId?: string
  ) => void;
  onOpenSchedule: () => void;
  onOpenGrades: () => void;
  onOpenMail?: () => void;
  onOpenCopilot?: () => void;
  onOpenAIConfig?: () => void;
  onSyncGrades?: () => Promise<any>;
  onMarkGradeRead?: (id?: string) => void;
  onMarkScheduleChangeRead?: (id?: string) => void;
}

function parseFlexibleDate(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const frMatch = dateStr.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (frMatch) {
    const d = new Date(Number(frMatch[3]), Number(frMatch[2]) - 1, Number(frMatch[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function getAcademicYear(dateStr?: string | null): string | null {
  const d = parseFlexibleDate(dateStr);
  if (!d) return null;
  const year = d.getFullYear();
  const month = d.getMonth();
  return month >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function formatScheduleChangeDate(startStr?: string, endStr?: string): string {
  if (!startStr) return "";
  const start = new Date(startStr);
  if (isNaN(start.getTime())) return "";
  const datePart = start.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const startTime = start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (endStr) {
    const end = new Date(endStr);
    if (!isNaN(end.getTime())) {
      const endTime = end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      return `${datePart} · ${startTime} - ${endTime}`;
    }
  }
  return `${datePart} · ${startTime}`;
}

export const Dashboard: React.FC<DashboardProps> = ({
  resources,
  notes,
  events,
  recentGrades = [],
  scheduleChanges = [],
  onOpenResource,
  onOpenSchedule,
  onOpenGrades,
  onOpenMail,
  onOpenCopilot,
  onOpenAIConfig,
  onMarkGradeRead,
  onMarkScheduleChangeRead,
}) => {
  const [moodleAssignments, setMoodleAssignments] = useState<MoodleAssignment[]>([]);
  const [addingLessonId, setAddingLessonId] = useState<string | null>(null);
  const [lessonAddedIds, setLessonAddedIds] = useState<Record<string, boolean>>({});
  const [recentMails, setRecentMails] = useState<MailMessage[]>([]);
  const [unreadMailCount, setUnreadMailCount] = useState<number>(0);
  const [crousMenu, setCrousMenu] = useState<CrousMenuResponse | null>(null);
  const [loadingCrous, setLoadingCrous] = useState<boolean>(true);

  useEffect(() => {
    api
      .getMoodleAssignments()
      .then((res) => setMoodleAssignments(res.assignments || []))
      .catch(() => {});

    api
      .getMailUnreadCount()
      .then((count) => setUnreadMailCount(count || 0))
      .catch(() => {});

    api
      .getMailMessages(4, 0, false, "INBOX")
      .then((res) => {
        setRecentMails(res.messages || []);
        if (typeof res.unreadCount === "number") setUnreadMailCount(res.unreadCount);
      })
      .catch(() => {});

    api
      .getCrousMenu(false)
      .then((menu) => setCrousMenu(menu))
      .catch(() => {})
      .finally(() => setLoadingCrous(false));
  }, []);

  const now = new Date();
  const currentYear = useMemo(() => {
    const y = now.getFullYear();
    return now.getMonth() >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  }, []);
  const currentSemester: 1 | 2 = now.getMonth() >= 8 || now.getMonth() === 0 ? 1 : 2;

  const currentEvents = useMemo(
    () => events.filter((e) => getAcademicYear(e.start) === currentYear),
    [events, currentYear]
  );

  const todayStr = now.toDateString();

  const todayEvents = useMemo(
    () =>
      currentEvents
        .filter((e) => new Date(e.start).toDateString() === todayStr && !e.isCancelled)
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [currentEvents, todayStr]
  );

  const nextCourse = useMemo(
    () =>
      currentEvents
        .filter((e) => new Date(e.end) > now && !e.isCancelled)
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())[0],
    [currentEvents]
  );

  const currentSemesterGrades = useMemo(() => {
    return recentGrades.filter((g) => {
      const year = getAcademicYear(g.date);
      if (year && year !== currentYear) return false;
      if (g.semester && g.semester !== currentSemester) return false;
      return true;
    });
  }, [recentGrades, currentYear, currentSemester]);

  const displayedRecentGrades = useMemo(
    () => currentSemesterGrades.slice(0, 4),
    [currentSemesterGrades]
  );

  const unreadGradesCount = currentSemesterGrades.filter((g) => !g.isRead).length;
  const unreadScheduleChanges = scheduleChanges.filter((c) => !c.isRead);

  const recentNotes = useMemo(
    () =>
      [...notes]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 4),
    [notes]
  );

  const handleAddAssignmentToLessons = async (assignment: MoodleAssignment) => {
    setAddingLessonId(assignment.id);
    try {
      const formattedDue = assignment.dueDate
        ? new Date(assignment.dueDate).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];
      await api.createLesson({
        title: `Devoir : ${assignment.name}`,
        resourceCode: assignment.resourceCode || "Général",
        dueDate: formattedDue,
        isCompleted: false,
        description: `Rendu eCampus Moodle (${assignment.courseTitle}). Lien : ${assignment.url}`,
      });
      setLessonAddedIds((prev) => ({ ...prev, [assignment.id]: true }));
    } catch {
      // Ignorer
    } finally {
      setAddingLessonId(null);
    }
  };

  const todayLabel = now.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50 p-4 sm:p-6 md:p-8 select-none">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* En-tête épuré + 4 indicateurs clés */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider capitalize">
              {todayLabel}
            </p>
            <h1 className="text-2xl font-extrabold text-slate-900 mt-0.5">Tableau de bord</h1>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <button
              onClick={onOpenSchedule}
              className="bg-white border border-slate-200 hover:border-sky-300 rounded-xl px-3.5 py-2.5 text-left transition-colors cursor-pointer"
            >
              <span className="text-[11px] text-slate-500 font-medium block">Aujourd&apos;hui</span>
              <span className="text-base font-bold text-slate-900">
                {todayEvents.length} cours
              </span>
            </button>

            <button
              onClick={() => onOpenResource(resources[0]?.id || "R101", "MOODLE")}
              className="bg-white border border-slate-200 hover:border-amber-300 rounded-xl px-3.5 py-2.5 text-left transition-colors cursor-pointer"
            >
              <span className="text-[11px] text-slate-500 font-medium block">Devoirs Moodle</span>
              <span className="text-base font-bold text-slate-900">
                {moodleAssignments.length} à rendre
              </span>
            </button>

            <button
              onClick={onOpenGrades}
              className="bg-white border border-slate-200 hover:border-emerald-300 rounded-xl px-3.5 py-2.5 text-left transition-colors cursor-pointer"
            >
              <span className="text-[11px] text-slate-500 font-medium block">Notes</span>
              <span className="text-base font-bold text-slate-900">
                {unreadGradesCount > 0 ? `+${unreadGradesCount} nouvelle(s)` : `${displayedRecentGrades.length} récentes`}
              </span>
            </button>

            <button
              onClick={onOpenMail}
              className="bg-white border border-slate-200 hover:border-indigo-300 rounded-xl px-3.5 py-2.5 text-left transition-colors cursor-pointer"
            >
              <span className="text-[11px] text-slate-500 font-medium block">Messagerie</span>
              <span className="text-base font-bold text-slate-900">
                {unreadMailCount} non lu{unreadMailCount > 1 ? "s" : ""}
              </span>
            </button>
          </div>
        </div>

        {/* Rappel du soir si applicable */}
        <EveningReminderBanner onOpenResource={(code) => onOpenResource(code)} />

        {/* Alertes emploi du temps uniquement si non lues */}
        {unreadScheduleChanges.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-amber-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  {unreadScheduleChanges.length} modification{unreadScheduleChanges.length > 1 ? "s" : ""} d&apos;emploi du temps
                </span>
              </span>
              {onMarkScheduleChangeRead && (
                <button
                  onClick={() => onMarkScheduleChangeRead()}
                  className="text-[11px] font-semibold text-amber-800 hover:text-amber-950 flex items-center gap-1 cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Tout marquer lu</span>
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {unreadScheduleChanges.slice(0, 4).map((chg) => {
                const dateLabel = formatScheduleChangeDate(chg.start, chg.end);
                return (
                  <div
                    key={chg.id}
                    onClick={onOpenSchedule}
                    className="bg-white border border-amber-200 rounded-xl px-3.5 py-2.5 text-xs cursor-pointer hover:bg-amber-50/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-slate-900 truncate">{chg.title}</p>
                      {dateLabel && (
                        <span className="text-[11px] font-semibold text-amber-800 bg-amber-100/70 px-2 py-0.5 rounded-md shrink-0">
                          {dateLabel}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 truncate mt-0.5">
                      {chg.changeDescription}
                      {chg.location ? ` • ${chg.location}` : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Grille principale 2 colonnes */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Colonne gauche (8 cols) : Emploi du temps, Devoirs, Notes */}
          <div className="lg:col-span-8 space-y-6">
            {/* Prochain cours + Programme du jour */}
            <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-sky-600" />
                  <span>Prochain cours &amp; journée</span>
                </h2>
                <button
                  onClick={onOpenSchedule}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                >
                  <span>Planning complet</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {nextCourse ? (
                <div className="bg-sky-50/70 border border-sky-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {nextCourse.matchedCode && (
                        <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-white text-sky-700 border border-sky-200">
                          {nextCourse.matchedCode}
                        </span>
                      )}
                      <span className="text-xs font-semibold text-sky-800 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(nextCourse.start).toLocaleDateString("fr-FR", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}{" "}
                        •{" "}
                        {new Date(nextCourse.start).toLocaleTimeString("fr-FR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        –{" "}
                        {new Date(nextCourse.end).toLocaleTimeString("fr-FR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 truncate">{nextCourse.summary}</h3>
                    <p className="text-xs text-slate-600 flex items-center gap-3 flex-wrap">
                      {nextCourse.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          {nextCourse.location}
                        </span>
                      )}
                      {nextCourse.teacher && <span>{nextCourse.teacher}</span>}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {nextCourse.visioUrl && (
                      <a
                        href={nextCourse.visioUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Visio</span>
                      </a>
                    )}
                    {nextCourse.matchedCode && (
                      <button
                        onClick={() => onOpenResource(nextCourse.matchedCode!, "CM")}
                        className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Ouvrir le cours
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 py-2">Aucun cours à venir prochainement.</p>
              )}

              {todayEvents.length > 0 && (
                <div className="divide-y divide-slate-100 border-t border-slate-100 pt-2">
                  {todayEvents.map((ev) => (
                    <div key={ev.id} className="py-2 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono font-semibold text-slate-500 shrink-0 w-24">
                          {new Date(ev.start).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} –{" "}
                          {new Date(ev.end).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span className="font-semibold text-slate-800 truncate">{ev.summary}</span>
                      </div>
                      <span className="text-[11px] text-slate-500 shrink-0">{ev.location || ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Devoirs à rendre (Moodle) */}
            <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3.5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-amber-600" />
                  <span>Devoirs à rendre ({moodleAssignments.length})</span>
                </h2>
              </div>

              {moodleAssignments.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">Aucun devoir en attente sur eCampus.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {moodleAssignments.slice(0, 5).map((a) => {
                    const added = Boolean(lessonAddedIds[a.id]);
                    return (
                      <div key={a.id} className="py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {a.resourceCode && (
                              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                {a.resourceCode}
                              </span>
                            )}
                            <p className="text-xs font-bold text-slate-900 truncate">{a.name}</p>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                            {a.courseTitle}
                            {a.dueDate ? ` • Échéance : ${new Date(a.dueDate).toLocaleDateString("fr-FR")}` : ""}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleAddAssignmentToLessons(a)}
                            disabled={addingLessonId === a.id || added}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-60"
                            title="Ajouter au cahier de texte"
                          >
                            {added ? <Check className="w-3 h-3 text-emerald-600" /> : <Plus className="w-3 h-3" />}
                            <span>{added ? "Ajouté" : "Cahier"}</span>
                          </button>
                          {a.resourceCode && (
                            <button
                              onClick={() => onOpenResource(a.resourceCode!, "MOODLE")}
                              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[11px] font-semibold cursor-pointer"
                            >
                              Ouvrir
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Dernières notes */}
            <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3.5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-emerald-600" />
                  <span>Dernières notes</span>
                </h2>
                <div className="flex items-center gap-3">
                  {unreadGradesCount > 0 && onMarkGradeRead && (
                    <button
                      onClick={() => onMarkGradeRead()}
                      className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      Tout marquer lu
                    </button>
                  )}
                  <button
                    onClick={onOpenGrades}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                  >
                    <span>Relevé complet</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {displayedRecentGrades.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">Aucune note récente disponible.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {displayedRecentGrades.map((g) => (
                    <div
                      key={g.id}
                      onClick={() => {
                        if (!g.isRead && onMarkGradeRead) onMarkGradeRead(g.id);
                        onOpenResource(g.resourceCode, "GRADES");
                      }}
                      className={`p-3.5 rounded-xl border transition-colors cursor-pointer ${
                        !g.isRead
                          ? "bg-amber-50/60 border-amber-200 hover:bg-amber-50"
                          : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                          {g.resourceCode}
                        </span>
                        <span className="text-base font-extrabold font-mono text-slate-900">{g.note}</span>
                      </div>
                      <p className="text-xs font-semibold text-slate-900 truncate mt-1.5">{g.description || g.resourceTitle}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {g.date || "Récent"}
                        {g.moyPromo ? ` • Promo : ${g.moyPromo}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Colonne droite (4 cols) : Mails, CROUS, Notes récentes, Copilot */}
          <div className="lg:col-span-4 space-y-6">
            {/* Messagerie Unicaen */}
            <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-indigo-600" />
                  <span>Derniers mails</span>
                </h2>
                {onOpenMail && (
                  <button
                    onClick={onOpenMail}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
                  >
                    Ouvrir
                  </button>
                )}
              </div>

              {recentMails.length === 0 ? (
                <p className="text-xs text-slate-500">Aucun message récent.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {recentMails.slice(0, 3).map((m) => (
                    <div
                      key={m.id}
                      onClick={onOpenMail}
                      className="py-2.5 cursor-pointer hover:bg-slate-50 -mx-2 px-2 rounded-lg transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-xs truncate ${m.isUnread ? "font-bold text-slate-900" : "font-medium text-slate-700"}`}>
                          {m.from}
                        </p>
                        {m.isUnread && <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">{m.subject || "(Sans objet)"}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Menu CROUS du jour */}
            <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Utensils className="w-4 h-4 text-orange-600" />
                  <span>Menu CROUS (Ifs)</span>
                </h2>
                {crousMenu?.todayMenu?.date && (
                  <span className="text-[11px] text-slate-400 font-mono">{crousMenu.todayMenu.date}</span>
                )}
              </div>

              {loadingCrous ? (
                <p className="text-xs text-slate-400">Chargement du menu...</p>
              ) : !crousMenu?.todayMenu || !crousMenu.todayMenu.meals?.[0]?.categories?.length ? (
                <p className="text-xs text-slate-500">Menu non publié pour aujourd&apos;hui.</p>
              ) : (
                <div className="space-y-2.5">
                  {crousMenu.todayMenu.meals[0].categories.slice(0, 3).map((cat, idx) => (
                    <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                      <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">{cat.name}</p>
                      <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                        {cat.dishes.slice(0, 3).map((d, dIdx) => (
                          <li key={dIdx} className="truncate">• {d}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Notes de cours récentes */}
            {recentNotes.length > 0 && (
              <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-600" />
                  <span>Reprendre une prise de note</span>
                </h2>
                <div className="space-y-1.5">
                  {recentNotes.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => onOpenResource(n.resourceId, n.type, n.id)}
                      className="w-full text-left px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-between gap-2 cursor-pointer transition-colors"
                    >
                      <span className="text-xs font-semibold text-slate-800 truncate">{n.title}</span>
                      <span className="text-[10px] font-mono text-slate-500 shrink-0">{n.type}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Copilot IA */}
            <AICopilotWidget
              onOpenCopilot={onOpenCopilot || (() => {})}
              onOpenConfig={onOpenAIConfig || (() => {})}
              onNavigateToResource={(code) => onOpenResource(code)}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
