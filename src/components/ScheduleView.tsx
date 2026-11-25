import React, { useState, useMemo } from "react";
import { ScheduleEvent, Resource } from "../types";
import { formatCourseTitle } from "../utils/scheduleFormat";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  User,
  Users,
  BookOpen,
  Award,
  Filter,
  X,
  Sparkles,
  Video,
  ExternalLink,
  Mail,
} from "lucide-react";

interface ScheduleViewProps {
  events: ScheduleEvent[];
  resources: Resource[];
  onOpenResource: (resourceId: string, preferredType?: "CM" | "TD" | "TP") => void;
  onOpenMail?: (mailId?: string) => void;
  onRefreshEvents?: () => void;
}

export const ScheduleView: React.FC<ScheduleViewProps> = ({
  events,
  resources,
  onOpenResource,
  onOpenMail,
}) => {
  // Pick an initial date based on available events or current date
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    // If events exist, find the first upcoming event or use today
    const now = new Date();
    const upcoming = events.find((e) => new Date(e.start) >= now);
    if (upcoming) return new Date(upcoming.start);
    return now;
  });

  const [viewMode, setViewMode] = useState<"day" | "week">(() => {
    return typeof window !== "undefined" && window.innerWidth < 768 ? "day" : "week";
  });

  // Default day index (0 = Monday, ..., 5 = Saturday)
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(() => {
    const today = new Date().getDay();
    // Monday is 1 -> index 0, Saturday is 6 -> index 5, Sunday is 0 -> default 0
    return today >= 1 && today <= 6 ? today - 1 : 0;
  });

  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [resourceFilter, setResourceFilter] = useState<string>("ALL");

  // Get Monday of current date week
  const weekStart = useMemo(() => {
    const d = new Date(currentDate);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [currentDate]);

  // Days of week (Mon-Sat, 6 days)
  const weekDays = useMemo(() => {
    return Array.from({ length: 6 }).map((_, i) => {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + i);
      return day;
    });
  }, [weekStart]);

  // Filter events in current week
  const weekEvents = useMemo(() => {
    const startMs = weekStart.getTime();
    const endMs = new Date(weekStart).setDate(weekStart.getDate() + 6);

    return events.filter((e) => {
      const eTime = new Date(e.start).getTime();
      if (eTime < startMs || eTime >= endMs) return false;
      if (typeFilter !== "ALL" && e.type !== typeFilter) return false;
      if (resourceFilter !== "ALL" && e.matchedCode !== resourceFilter) return false;
      return true;
    });
  }, [events, weekStart, typeFilter, resourceFilter]);

  // Events for selected day in Day View
  const selectedDay = weekDays[selectedDayIndex] || weekDays[0];
  const dayEvents = useMemo(() => {
    return weekEvents
      .filter((e) => {
        const eDate = new Date(e.start);
        return (
          eDate.getFullYear() === selectedDay.getFullYear() &&
          eDate.getMonth() === selectedDay.getMonth() &&
          eDate.getDate() === selectedDay.getDate()
        );
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [weekEvents, selectedDay]);

  const handlePrev = () => {
    if (viewMode === "day") {
      if (selectedDayIndex > 0) {
        setSelectedDayIndex(selectedDayIndex - 1);
      } else {
        // Go to previous week's Saturday
        const d = new Date(currentDate);
        d.setDate(d.getDate() - 7);
        setCurrentDate(d);
        setSelectedDayIndex(5);
      }
    } else {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 7);
      setCurrentDate(d);
    }
  };

  const handleNext = () => {
    if (viewMode === "day") {
      if (selectedDayIndex < 5) {
        setSelectedDayIndex(selectedDayIndex + 1);
      } else {
        // Go to next week's Monday
        const d = new Date(currentDate);
        d.setDate(d.getDate() + 7);
        setCurrentDate(d);
        setSelectedDayIndex(0);
      }
    } else {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 7);
      setCurrentDate(d);
    }
  };

  const handleToday = () => {
    const now = new Date();
    setCurrentDate(now);
    const day = now.getDay();
    setSelectedDayIndex(day >= 1 && day <= 6 ? day - 1 : 0);
  };

  const hours = Array.from({ length: 12 }, (_, i) => i + 8); // 8h to 19h
  const HOUR_HEIGHT = 68;
  const now = new Date();
  const nowHours = now.getHours() + now.getMinutes() / 60;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-white select-none">
      {/* Top Header */}
      <div className="bg-white border-b border-slate-200 px-3 md:px-6 py-2.5 md:py-3.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shrink-0 no-print">
        <div className="flex items-center justify-between md:justify-start gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center border border-sky-200 shrink-0">
              <CalendarIcon className="w-4 h-4 md:w-5 md:h-5" />
            </div>
            <div>
              <h2 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
                Emploi du Temps
              </h2>
              <p className="text-[11px] md:text-xs text-slate-500 font-medium capitalize">
                {viewMode === "day"
                  ? selectedDay.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
                  : `Sem. du ${weekDays[0].toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} au ${weekDays[5].toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`}
              </p>
            </div>
          </div>

          {/* Navigation & Mode Toggle */}
          <div className="flex items-center gap-1.5 ml-auto md:ml-2">
            {/* Day / Week Switcher */}
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
              <button
                onClick={() => setViewMode("day")}
                className={`px-2 py-1 text-xs font-semibold rounded transition-colors ${
                  viewMode === "day" ? "bg-white text-blue-700 shadow-2xs font-bold" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Jour
              </button>
              <button
                onClick={() => setViewMode("week")}
                className={`px-2 py-1 text-xs font-semibold rounded transition-colors ${
                  viewMode === "week" ? "bg-white text-blue-700 shadow-2xs font-bold" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Semaine
              </button>
            </div>

            {/* Prev / Today / Next */}
            <div className="flex items-center bg-slate-100 rounded-lg border border-slate-200 p-0.5">
              <button
                onClick={handlePrev}
                className="p-1 text-slate-600 hover:text-slate-900 rounded hover:bg-white transition-colors"
                title={viewMode === "day" ? "Jour précédent" : "Semaine précédente"}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleToday}
                className="px-2 py-1 text-[11px] md:text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-white rounded transition-colors"
              >
                Aujourd'hui
              </button>
              <button
                onClick={handleNext}
                className="p-1 text-slate-600 hover:text-slate-900 rounded hover:bg-white transition-colors"
                title={viewMode === "day" ? "Jour suivant" : "Semaine suivante"}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Filters & Sync */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 md:pb-0">
          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-white border border-slate-200 text-xs rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-blue-500 shrink-0"
          >
            <option value="ALL">Tous les types</option>
            <option value="CM">CM (Cours)</option>
            <option value="TD">TD (Travaux Dirigés)</option>
            <option value="TP">TP (Travaux Pratiques)</option>
            <option value="Examen">🚨 Examens</option>
            <option value="SAE">🚀 SAÉs</option>
          </select>

          {/* Resource Filter */}
          <select
            value={resourceFilter}
            onChange={(e) => setResourceFilter(e.target.value)}
            className="bg-white border border-slate-200 text-xs rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-blue-500 max-w-[120px] md:max-w-[150px] truncate shrink-0"
          >
            <option value="ALL">Toutes matières</option>
            {resources.map((r) => (
              <option key={r.code} value={r.code}>
                {r.code} - {r.shortName}
              </option>
            ))}
          </select>

          {onOpenMail && (
            <button
              type="button"
              onClick={() => onOpenMail()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold transition-colors shrink-0 ml-auto cursor-pointer"
              title="Ouvrir la messagerie Unicaen"
            >
              <Mail className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Mails</span>
            </button>
          )}
        </div>
      </div>

      {/* Day Picker Pills (Visible in Day Mode) */}
      {viewMode === "day" && (
        <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 flex items-center justify-between gap-1 sm:gap-2 overflow-x-auto no-scrollbar shrink-0">
          {weekDays.map((day, idx) => {
            const isSelected = idx === selectedDayIndex;
            const isToday = day.toDateString() === new Date().toDateString();
            return (
              <button
                key={idx}
                onClick={() => setSelectedDayIndex(idx)}
                className={`flex-1 min-w-[50px] py-1.5 px-1 rounded-xl text-center transition-all flex flex-col items-center justify-center border ${
                  isSelected
                    ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                    : isToday
                    ? "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100/70"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span
                  className={`text-[10px] uppercase font-semibold tracking-wider ${
                    isSelected ? "text-blue-100" : isToday ? "text-blue-600" : "text-slate-400"
                  }`}
                >
                  {day.toLocaleDateString("fr-FR", { weekday: "short" })}
                </span>
                <span className="text-sm font-bold mt-0.5">{day.getDate()}</span>
                {isToday && !isSelected && (
                  <span className="w-1 h-1 rounded-full bg-blue-600 mt-0.5"></span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Timetable Container */}
      {viewMode === "day" ? (
        /* DAY AGENDA VIEW (Ideal for mobile & focused daily view) */
        <div className="flex-1 overflow-y-auto p-3 md:p-6 bg-slate-50/50">
          <div className="max-w-3xl mx-auto space-y-3">
            {dayEvents.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center my-6">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                  <CalendarIcon className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-800 mb-1">
                  Aucun cours prévu
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Il n'y a pas d'événement programmé pour le{" "}
                  {selectedDay.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}.
                </p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={handleToday}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                  >
                    Revenir à aujourd'hui
                  </button>
                  <button
                    onClick={handleNext}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                    Jour suivant →
                  </button>
                </div>
              </div>
            ) : (
              dayEvents.map((evt) => {
                const startDate = new Date(evt.start);
                const endDate = new Date(evt.end);
                const isExam = evt.type === "Examen";
                const isCM = evt.type === "CM";
                const isTP = evt.type === "TP";
                const isTD = evt.type === "TD";
                const isSAE = evt.type === "SAE";

                const badgeBg = isExam
                  ? "bg-rose-100 text-rose-800 border-rose-200"
                  : isCM
                  ? "bg-purple-100 text-purple-800 border-purple-200"
                  : isTP
                  ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                  : isTD
                  ? "bg-sky-100 text-sky-800 border-sky-200"
                  : isSAE
                  ? "bg-amber-100 text-amber-800 border-amber-200"
                  : "bg-blue-100 text-blue-800 border-blue-200";

                const leftBarColor = isExam
                  ? "border-l-rose-500"
                  : isCM
                  ? "border-l-purple-500"
                  : isTP
                  ? "border-l-emerald-500"
                  : isTD
                  ? "border-l-sky-500"
                  : isSAE
                  ? "border-l-amber-500"
                  : "border-l-blue-500";

                const fullTitle = formatCourseTitle(evt.summary, evt.matchedCode, resources);

                return (
                  <div
                    key={evt.id}
                    style={
                      evt.isCancelled
                        ? {
                            backgroundImage:
                              "repeating-linear-gradient(-45deg, transparent, transparent 8px, rgba(244,63,94,0.05) 8px, rgba(244,63,94,0.05) 16px)",
                          }
                        : undefined
                    }
                    className={`rounded-xl border border-l-4 p-4 shadow-2xs hover:shadow-sm transition-shadow ${
                      evt.isCancelled
                        ? "bg-rose-50/75 border-rose-300 border-l-rose-500"
                        : `bg-white border-slate-200 ${leftBarColor}`
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                          {startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -{" "}
                          {endDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${badgeBg}`}>
                          {evt.type}
                        </span>
                        {evt.matchedCode && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                            {evt.matchedCode}
                          </span>
                        )}
                      </div>
                      {evt.isCancelled && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-extrabold uppercase tracking-wider shadow-2xs">
                          Annulé
                        </span>
                      )}
                    </div>

                    <h3
                      onClick={() => setSelectedEvent(evt)}
                      className={`text-sm font-bold mb-2.5 cursor-pointer hover:text-blue-600 transition-colors ${
                        evt.isCancelled
                          ? "line-through decoration-rose-500/70 text-rose-900/75"
                          : "text-slate-900"
                      }`}
                    >
                      {fullTitle}
                    </h3>

                    {evt.isCancelled && evt.aiUpdatedReason && (
                      <div className="mb-3 px-2.5 py-1.5 rounded-lg bg-rose-100/80 border border-rose-200 text-[11px] font-medium text-rose-900">
                        {evt.aiUpdatedReason}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 mb-3">
                      {!evt.isCancelled && evt.visioUrl && (
                        <a
                          href={evt.visioUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs"
                        >
                          <Video className="w-3.5 h-3.5" />
                          <span>Rejoindre la visio</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {evt.location && (
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span className="font-mono">{evt.location}</span>
                        </div>
                      )}
                      {evt.teacher && (
                        <div className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{evt.teacher}</span>
                        </div>
                      )}
                      {evt.group && (
                        <div className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="bg-slate-100 px-1.5 py-0.2 rounded text-[11px] font-mono border border-slate-200">
                            {evt.group}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-100">
                      <button
                        onClick={() => setSelectedEvent(evt)}
                        className="text-xs text-slate-600 hover:text-slate-900 font-medium px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors"
                      >
                        Voir les détails
                      </button>

                      {evt.matchedCode && (
                        <button
                          onClick={() => {
                            const code = evt.matchedCode!;
                            const prefType = evt.type === "TP" ? "TP" : evt.type === "TD" ? "TD" : "CM";
                            onOpenResource(code, prefType);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-2xs"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>Notes & Cours ({evt.matchedCode})</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* WEEK GRID VIEW (Scrollable on small screens) */
        <div className="flex-1 overflow-y-auto overflow-x-auto flex flex-col">
          {weekEvents.length === 0 && (
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
              <span>
                Aucun cours programmé pour cette semaine (
                {weekDays[0].toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} -{" "}
                {weekDays[5].toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}).
              </span>
              {events.length > 0 && (
                <button
                  onClick={() => {
                    const sorted = [...events].sort(
                      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
                    );
                    setCurrentDate(new Date(sorted[sorted.length - 1].start));
                  }}
                  className="text-blue-600 hover:text-blue-800 font-semibold underline ml-1"
                >
                  Consulter les cours archivés
                </button>
              )}
            </div>
          )}

          {/* Grid wrapper with min-width to avoid column collapse on narrow screens */}
          <div className="min-w-[760px] flex-1 flex flex-col">
            {/* Days Header */}
            <div className="grid grid-cols-[60px_repeat(6,1fr)] bg-slate-50 border-b border-slate-200 sticky top-0 z-20 shrink-0">
              <div className="p-3 text-center text-xs font-mono text-slate-400 border-r border-slate-200">
                Heure
              </div>
              {weekDays.map((day, idx) => {
                const isToday =
                  day.toDateString() === new Date().toDateString();
                return (
                  <div
                    key={idx}
                    className={`p-3 text-center border-r border-slate-200 ${
                      isToday ? "bg-blue-50/60" : ""
                    }`}
                  >
                    <div
                      className={`text-xs font-semibold uppercase tracking-wider ${
                        isToday ? "text-blue-600" : "text-slate-500"
                      }`}
                    >
                      {day.toLocaleDateString("fr-FR", { weekday: "short" })}
                    </div>
                    <div
                      className={`text-sm font-bold mt-0.5 ${
                        isToday
                          ? "w-7 h-7 mx-auto bg-blue-600 text-white rounded-full flex items-center justify-center shadow-none"
                          : "text-slate-800"
                      }`}
                    >
                      {day.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Hours Grid */}
            <div className="flex-1 min-h-[816px] grid grid-cols-[60px_repeat(6,1fr)] relative">
              {/* Time axis column */}
              <div className="border-r border-slate-200 bg-slate-50/40">
                {hours.map((h) => (
                  <div
                    key={h}
                    style={{ height: `${HOUR_HEIGHT}px` }}
                    className="h-[68px] border-b border-slate-100 text-[11px] font-mono text-slate-400 text-right pr-2 pt-1 select-none"
                  >
                    {h.toString().padStart(2, "0")}:00
                  </div>
                ))}
              </div>

              {/* 6 Day Columns */}
              {weekDays.map((day, dayIndex) => {
                const isToday = day.toDateString() === now.toDateString();
                const showNowLine = isToday && nowHours >= 8 && nowHours <= 20;
                const dayColumnEvents = weekEvents.filter((e) => {
                  const eDate = new Date(e.start);
                  return (
                    eDate.getFullYear() === day.getFullYear() &&
                    eDate.getMonth() === day.getMonth() &&
                    eDate.getDate() === day.getDate()
                  );
                });

                return (
                  <div
                    key={dayIndex}
                    className={`border-r border-slate-200 relative min-w-[115px] ${
                      isToday ? "bg-blue-50/20" : "bg-white"
                    }`}
                  >
                    {/* Horizontal hour lines */}
                    {hours.map((h) => (
                      <div
                        key={h}
                        style={{ height: `${HOUR_HEIGHT}px` }}
                        className="h-[68px] border-b border-slate-100 w-full pointer-events-none"
                      />
                    ))}

                    {/* Ligne de l'heure actuelle */}
                    {showNowLine && (
                      <div
                        style={{ top: `${(nowHours - 8) * HOUR_HEIGHT}px` }}
                        className="absolute inset-x-0 z-20 pointer-events-none flex items-center"
                      >
                        <div className="w-2 h-2 rounded-full bg-rose-500 -ml-1 shrink-0" />
                        <div className="h-[2px] bg-rose-500 flex-1" />
                      </div>
                    )}

                    {/* Event Cards */}
                    {dayColumnEvents.map((evt) => {
                      const startDate = new Date(evt.start);
                      const endDate = new Date(evt.end);

                      const startHour = startDate.getHours() + startDate.getMinutes() / 60;
                      const endHour = endDate.getHours() + endDate.getMinutes() / 60;
                      const durationHours = endHour - startHour;

                      const topPx = (startHour - 8) * HOUR_HEIGHT;
                      const heightPx = Math.max(durationHours * HOUR_HEIGHT, 40);
                      const isShort = durationHours <= 1.1;

                      const isExam = evt.type === "Examen";
                      const isCM = evt.type === "CM";
                      const isTP = evt.type === "TP";
                      const isTD = evt.type === "TD";
                      const isSAE = evt.type === "SAE";

                      const cardBg = evt.isCancelled
                        ? "bg-rose-50/90 border-rose-300 border-l-rose-500 text-rose-950"
                        : isExam
                        ? "bg-rose-50/90 border-rose-200 border-l-rose-500 text-rose-950"
                        : isCM
                        ? "bg-purple-50/90 border-purple-200 border-l-purple-500 text-purple-950"
                        : isTP
                        ? "bg-emerald-50/90 border-emerald-200 border-l-emerald-500 text-emerald-950"
                        : isTD
                        ? "bg-sky-50/90 border-sky-200 border-l-sky-500 text-sky-950"
                        : isSAE
                        ? "bg-amber-50/90 border-amber-200 border-l-amber-500 text-amber-950"
                        : "bg-blue-50/90 border-blue-200 border-l-blue-500 text-blue-950";

                      const fullTitle = formatCourseTitle(evt.summary, evt.matchedCode, resources);

                      return (
                        <div
                          key={evt.id}
                          onClick={() => setSelectedEvent(evt)}
                          title={fullTitle}
                          style={{
                            top: `${topPx + 2}px`,
                            height: `${heightPx - 4}px`,
                            ...(evt.isCancelled
                              ? {
                                  backgroundImage:
                                    "repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(244,63,94,0.06) 6px, rgba(244,63,94,0.06) 12px)",
                                }
                              : {}),
                          }}
                          className={`absolute inset-x-1 rounded-xl border border-l-4 cursor-pointer shadow-2xs hover:shadow-md hover:z-20 transition-all overflow-hidden flex flex-col justify-between group z-10 ${
                            isShort ? "px-2 py-1.5" : "p-2.5"
                          } ${cardBg}`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center justify-between gap-1 text-[10px] font-mono text-slate-600">
                              <span className="truncate font-semibold">
                                {startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -{" "}
                                {endDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                {evt.isCancelled && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-rose-600 text-white text-[9px] font-extrabold uppercase tracking-wider shadow-2xs shrink-0">
                                    Annulé
                                  </span>
                                )}
                                {evt.matchedCode && (
                                  <span className="font-bold px-1.5 py-0.2 rounded-md text-[9.5px] bg-white/90 border border-slate-200/80 text-slate-700">
                                    {evt.matchedCode}
                                  </span>
                                )}
                              </div>
                            </div>

                            <h4
                              className={`font-bold text-xs transition-colors mt-1 leading-snug ${
                                isShort ? "line-clamp-1" : durationHours >= 2 ? "line-clamp-3" : "line-clamp-2"
                              } ${
                                evt.isCancelled
                                  ? "line-through decoration-rose-500/70 text-rose-900/70"
                                  : "text-slate-900 group-hover:text-blue-700"
                              }`}
                            >
                              {fullTitle}
                            </h4>
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-slate-600 mt-1 pt-0.5 gap-1">
                            {!evt.isCancelled && evt.visioUrl ? (
                              <a
                                href={evt.visioUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-600 text-white font-semibold text-[10px] hover:bg-indigo-700 shrink-0 shadow-2xs"
                                title="Rejoindre la visioconférence"
                              >
                                <Video className="w-2.5 h-2.5" />
                                <span>Visio</span>
                              </a>
                            ) : evt.location ? (
                              <span className="flex items-center gap-1 font-mono text-[10px] truncate">
                                <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="truncate">{evt.location}</span>
                              </span>
                            ) : (
                              <span />
                            )}
                            {evt.group && (
                              <span className="text-[9.5px] bg-white/90 px-1.5 py-0.2 rounded-md text-slate-600 border border-slate-200/80 shrink-0 font-medium">
                                {evt.group}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Event Details Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-3 md:p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-sm overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div
              className={`p-5 border-b ${
                selectedEvent.isCancelled ? "bg-rose-50 border-rose-200" : "bg-slate-50 border-slate-200"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    {selectedEvent.isCancelled && (
                      <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-rose-600 text-white shadow-2xs">
                        Annulé
                      </span>
                    )}
                    {selectedEvent.matchedCode && (
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded border bg-white border-slate-300 text-slate-800">
                        {selectedEvent.matchedCode}
                      </span>
                    )}
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-white text-slate-700 border border-slate-200">
                      {selectedEvent.type}
                    </span>
                  </div>
                  <h3
                    className={`font-bold text-lg ${
                      selectedEvent.isCancelled
                        ? "line-through decoration-rose-500/70 text-rose-900/80"
                        : "text-slate-900"
                    }`}
                  >
                    {formatCourseTitle(selectedEvent.summary, selectedEvent.matchedCode, resources, {
                      includeCode: true,
                    })}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="p-1 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 md:p-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-slate-500 font-semibold block mb-1">Horaires</span>
                  <div className="flex items-center gap-1.5 text-slate-800 font-mono">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    <span>
                      {new Date(selectedEvent.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -{" "}
                      {new Date(selectedEvent.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 capitalize">
                    {new Date(selectedEvent.start).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-slate-500 font-semibold block mb-1">Salle / Lieu</span>
                  <div className="flex items-center gap-1.5 text-slate-800 font-mono">
                    <MapPin className="w-3.5 h-3.5 text-rose-500" />
                    <span>{selectedEvent.location || "Non précisé"}</span>
                  </div>
                </div>
              </div>

              {(selectedEvent.teacher || selectedEvent.group) && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                  {selectedEvent.teacher && (
                    <div className="flex items-center gap-2 text-slate-700">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        Enseignant : <strong className="text-slate-900">{selectedEvent.teacher}</strong>
                      </span>
                    </div>
                  )}
                  {selectedEvent.group && (
                    <div className="flex items-center gap-2 text-slate-700">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        Groupe : <strong className="text-slate-900">{selectedEvent.group}</strong>
                      </span>
                    </div>
                  )}
                </div>
              )}

              {(selectedEvent.visioUrl || selectedEvent.aiUpdatedReason || selectedEvent.isCancelled || selectedEvent.sourceMailId) && (
                <div className="space-y-2">
                  {selectedEvent.isCancelled && (
                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
                      Ce cours est marqué comme annulé.
                    </div>
                  )}
                  {selectedEvent.aiUpdatedReason && (
                    <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-800 flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span>{selectedEvent.aiUpdatedReason}</span>
                    </div>
                  )}
                  {onOpenMail && (selectedEvent.sourceMailId || selectedEvent.aiUpdatedReason || selectedEvent.isCancelled) && (
                    <button
                      type="button"
                      onClick={() => {
                        const mid = selectedEvent.sourceMailId;
                        setSelectedEvent(null);
                        onOpenMail(mid);
                      }}
                      className="w-full py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <Mail className="w-3.5 h-3.5 text-indigo-600" />
                      <span>{selectedEvent.sourceMailId ? "Voir le mail d'origine" : "Consulter les mails"}</span>
                    </button>
                  )}
                  {selectedEvent.visioUrl && (
                    <a
                      href={selectedEvent.visioUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-colors"
                    >
                      <Video className="w-4 h-4" />
                      <span>Rejoindre la visioconférence</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              )}

              {/* Course Description / Coefs */}
              {selectedEvent.description && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-700 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">
                  {selectedEvent.description}
                </div>
              )}
            </div>

            {/* Modal Footer Direct Note Action */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition-colors"
              >
                Fermer
              </button>

              {selectedEvent.matchedCode && (
                <button
                  onClick={() => {
                    const code = selectedEvent.matchedCode!;
                    const prefType = selectedEvent.type === "TP" ? "TP" : selectedEvent.type === "TD" ? "TD" : "CM";
                    setSelectedEvent(null);
                    onOpenResource(code, prefType);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>
                    Accéder aux notes ({selectedEvent.matchedCode})
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
