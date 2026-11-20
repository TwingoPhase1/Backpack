import React, { useState, useEffect } from "react";
import { LessonItem, LessonType, Resource, ScheduleEvent } from "../types";
import { api } from "../services/api";
import {
  Calendar as CalendarIcon,
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  BookOpen,
  Trash2,
  AlertCircle,
  Bell,
  BellRing,
  Check,
  X,
  Sparkles,
  ArrowRight,
  Filter,
} from "lucide-react";

interface LessonsPlannerProps {
  resourceCode?: string;
  resources?: Resource[];
  scheduleEvents?: ScheduleEvent[];
  onOpenResource?: (resourceCode: string) => void;
  onOpenSchedule?: () => void;
  compact?: boolean;
}

const LESSON_TYPE_LABELS: Record<LessonType, { label: string; badge: string }> = {
  LECON: { label: "Leçon à réviser", badge: "bg-blue-50 text-blue-700 border-blue-200" },
  DEVOIR: { label: "Devoir / Exercice", badge: "bg-purple-50 text-purple-700 border-purple-200" },
  TP_PREP: { label: "Préparation TP", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  REVISION: { label: "Révision DS / Partiel", badge: "bg-rose-50 text-rose-700 border-rose-200" },
};

export const LessonsPlanner: React.FC<LessonsPlannerProps> = ({
  resourceCode,
  resources = [],
  scheduleEvents = [],
  onOpenResource,
  onOpenSchedule,
  compact = false,
}) => {
  const [lessons, setLessons] = useState<LessonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<"ALL" | "PENDING" | "COMPLETED">("ALL");

  // Creator state
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [selectedResource, setSelectedResource] = useState(resourceCode || (resources[0]?.code || "R101"));
  const [type, setType] = useState<LessonType>("LECON");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(true);

  const fetchLessons = async () => {
    try {
      setLoading(true);
      const res = await api.getLessons(resourceCode);
      setLessons(res.lessons || []);
    } catch (e) {
      console.error("Erreur chargement des leçons", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLessons();
  }, [resourceCode]);

  // Find next course for a resource code
  const getNextCourseForResource = (code: string) => {
    if (!scheduleEvents || scheduleEvents.length === 0) return null;
    const now = new Date();
    const upcoming = scheduleEvents
      .filter((e) => {
        if (!e.start) return false;
        if (new Date(e.start).getTime() < now.getTime()) return false;
        const c = code.trim().toUpperCase();
        return (
          (e.matchedCode && e.matchedCode.toUpperCase() === c) ||
          (e.summary && e.summary.toUpperCase().includes(c))
        );
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    return upcoming.length > 0 ? upcoming[0] : null;
  };

  // Helper to determine if tomorrow or today is the next course
  const getProximityInfo = (nextEvent: ScheduleEvent | null, manualDueDate?: string) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let target: Date | null = null;
    if (nextEvent) {
      target = new Date(nextEvent.start);
    } else if (manualDueDate) {
      target = new Date(manualDueDate + "T08:00:00");
    }

    if (!target || isNaN(target.getTime())) return null;

    const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const diffDays = Math.round((targetDay.getTime() - today.getTime()) / (1000 * 3600 * 24));

    return {
      diffDays,
      isTomorrow: diffDays === 1,
      isToday: diffDays === 0,
      targetDate: target,
    };
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      const res = await api.createLesson({
        title: title.trim(),
        resourceCode: resourceCode || selectedResource,
        type,
        dueDate: dueDate || undefined,
        description: description.trim(),
        reminderEnabled,
      });

      setLessons((prev) => [res.lesson, ...prev]);
      setTitle("");
      setDescription("");
      setDueDate("");
      setIsCreating(false);
    } catch (err: any) {
      alert("Erreur création leçon : " + err.message);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      const res = await api.toggleLesson(id);
      setLessons((prev) => prev.map((l) => (l.id === id ? res.lesson : l)));
    } catch (err: any) {
      alert("Erreur mise à jour : " + err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer cette leçon du cahier de texte ?")) return;
    try {
      await api.deleteLesson(id);
      setLessons((prev) => prev.filter((l) => l.id !== id));
    } catch (err: any) {
      alert("Erreur suppression : " + err.message);
    }
  };

  const filteredLessons = lessons.filter((l) => {
    if (filterStatus === "PENDING") return !l.isCompleted;
    if (filterStatus === "COMPLETED") return l.isCompleted;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-800 flex items-center justify-center border border-sky-200">
            <CalendarIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              Cahier de Texte & Leçons à réviser
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                {lessons.filter((l) => !l.isCompleted).length} à faire
              </span>
            </h3>
            <p className="text-[11px] text-slate-500">
              {resourceCode
                ? `Leçons et devoirs pour ${resourceCode} (rappel la veille au soir du cours)`
                : "Planification des révisions avec rappel la veille au soir du prochain cours"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status filter buttons */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
            <button
              onClick={() => setFilterStatus("ALL")}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                filterStatus === "ALL" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600"
              }`}
            >
              Tous
            </button>
            <button
              onClick={() => setFilterStatus("PENDING")}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                filterStatus === "PENDING" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600"
              }`}
            >
              À réviser
            </button>
            <button
              onClick={() => setFilterStatus("COMPLETED")}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                filterStatus === "COMPLETED" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600"
              }`}
            >
              Fait
            </button>
          </div>

          {!isCreating && (
            <button
              onClick={() => setIsCreating(true)}
              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ajouter une leçon</span>
            </button>
          )}
        </div>
      </div>

      {/* Creation form */}
      {isCreating && (
        <form
          onSubmit={handleCreate}
          className="p-4 rounded-xl border border-sky-200 bg-sky-50/50 shadow-xs space-y-3 animate-fadeIn"
        >
          <div className="flex items-center justify-between border-b border-sky-100 pb-2">
            <span className="text-xs font-bold text-sky-900 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-sky-600" />
              Programmer une leçon ou un devoir à réviser
            </span>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="p-1 text-sky-700 hover:text-sky-950 rounded hover:bg-sky-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Titre de la leçon / Révision *
              </label>
              <input
                type="text"
                placeholder="Ex: Routage OSPF & tables RIP, Préparer TP Wireshark..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500 font-semibold"
                autoFocus
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as LessonType)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="LECON">📖 Leçon à réviser</option>
                <option value="DEVOIR">✍️ Devoir / Exercice</option>
                <option value="TP_PREP">🧪 Préparation TP</option>
                <option value="REVISION">🎯 Révision Partiel / DS</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {!resourceCode && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Matière / Ressource associée
                </label>
                <select
                  value={selectedResource}
                  onChange={(e) => setSelectedResource(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none"
                >
                  {resources.map((r) => (
                    <option key={r.id} value={r.code}>
                      {r.code} - {r.shortName || r.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Date d'échéance (optionnel si cours ADE prévu)
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Détails / Consignes / Formules à retenir
            </label>
            <textarea
              rows={2}
              placeholder="Notes complémentaires, chapitres du cours à relire, exercices à faire..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-between gap-3 pt-1 border-t border-sky-100 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={reminderEnabled}
                onChange={(e) => setReminderEnabled(e.target.checked)}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-3.5 h-3.5"
              />
              <span className="text-xs text-slate-700 flex items-center gap-1 font-medium">
                <Bell className="w-3.5 h-3.5 text-sky-600" />
                M'alerter la veille au soir du prochain cours
              </span>
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200/50 rounded-lg font-medium"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Enregistrer la leçon</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Lessons List */}
      {filteredLessons.length === 0 ? (
        <div className="text-center py-8 bg-slate-50/70 rounded-xl border border-dashed border-slate-200 p-6">
          <CalendarIcon className="w-8 h-8 mx-auto mb-2 text-slate-400" />
          <h4 className="text-xs font-bold text-slate-700">Aucune leçon dans le cahier de texte</h4>
          <p className="text-[11px] text-slate-500 max-w-sm mx-auto mt-0.5">
            Ajoutez vos leçons, devoirs ou révisions. Le système détecte automatiquement la séance suivante de cours et vous alerte la veille au soir.
          </p>
          <button
            onClick={() => setIsCreating(true)}
            className="mt-3 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold shadow-xs transition-colors inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5 text-sky-600" />
            <span>Ajouter ma première leçon</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredLessons.map((lesson) => {
            const typeConfig = LESSON_TYPE_LABELS[lesson.type] || LESSON_TYPE_LABELS.LECON;
            const nextEvent = getNextCourseForResource(lesson.resourceCode);
            const proximity = getProximityInfo(nextEvent, lesson.dueDate);

            const isUrgent = proximity?.isTomorrow || proximity?.isToday;

            return (
              <div
                key={lesson.id}
                className={`p-3.5 rounded-xl border transition-all flex items-start justify-between gap-3 bg-white ${
                  lesson.isCompleted
                    ? "border-slate-200 opacity-60 bg-slate-50/50"
                    : isUrgent
                    ? "border-amber-300 bg-amber-50/30 shadow-xs"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                {/* Left: Checkbox */}
                <button
                  onClick={() => handleToggle(lesson.id)}
                  className="mt-0.5 text-slate-400 hover:text-emerald-600 transition-colors shrink-0"
                  title={lesson.isCompleted ? "Marquer comme non fait" : "Marquer comme révisé"}
                >
                  {lesson.isCompleted ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 fill-emerald-100" />
                  ) : (
                    <Circle className="w-5 h-5" />
                  )}
                </button>

                {/* Middle: Content */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Resource tag */}
                    <button
                      onClick={() => onOpenResource && onOpenResource(lesson.resourceCode)}
                      className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition-colors"
                      title="Ouvrir cette ressource"
                    >
                      {lesson.resourceCode}
                    </button>

                    {/* Type badge */}
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${typeConfig.badge}`}>
                      {typeConfig.label}
                    </span>

                    {/* Proximity / Reminder Notice */}
                    {proximity?.isTomorrow && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1 animate-pulse">
                        <BellRing className="w-3 h-3 text-amber-600" />
                        Cours demain ! À réviser ce soir
                      </span>
                    )}

                    {proximity?.isToday && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-900 border border-rose-300 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-rose-600" />
                        Cours aujourd'hui
                      </span>
                    )}
                  </div>

                  <h4
                    className={`text-xs font-bold text-slate-900 leading-snug ${
                      lesson.isCompleted ? "line-through text-slate-500" : ""
                    }`}
                  >
                    {lesson.title}
                  </h4>

                  {lesson.description && (
                    <p className="text-[11px] text-slate-600 whitespace-pre-wrap leading-relaxed">
                      {lesson.description}
                    </p>
                  )}

                  {/* Schedule event reference */}
                  <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono flex-wrap pt-0.5">
                    {nextEvent ? (
                      <span className="flex items-center gap-1 text-slate-600">
                        <Clock className="w-3 h-3 text-sky-500" />
                        Prochain cours :{" "}
                        {new Date(nextEvent.start).toLocaleDateString("fr-FR", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}{" "}
                        à{" "}
                        {new Date(nextEvent.start).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {nextEvent.location && ` (${nextEvent.location})`}
                      </span>
                    ) : lesson.dueDate ? (
                      <span className="flex items-center gap-1 text-slate-600">
                        <CalendarIcon className="w-3 h-3 text-slate-400" />
                        Échéance : {new Date(lesson.dueDate).toLocaleDateString("fr-FR")}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">En attente de séance ADE</span>
                    )}

                    {lesson.reminderEnabled && (
                      <span className="flex items-center gap-1 text-sky-600">
                        <Bell className="w-3 h-3" />
                        Rappel actif
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleDelete(lesson.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Supprimer la leçon"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
