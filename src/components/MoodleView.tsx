import React, { useEffect, useMemo, useState } from "react";
import { MoodleAssignment, MoodleCourse, MoodleSyncStatus, Resource } from "../types";
import { api } from "../services/api";
import { MoodleViewerModal, MoodleViewerTarget } from "./MoodleViewerModal";
import { groupMoodleSections } from "../utils/moodleSections";
import {
  BookOpen,
  Search,
  FolderArchive,
  FileText,
  Clock,
  Eye,
  Download,
  ArrowRight,
  Layers,
  Loader2,
  MessageSquare,
  Link2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

interface MoodleViewProps {
  resources: Resource[];
  onOpenResource: (resourceId: string, preferredType?: "CM" | "TD" | "TP" | "MOODLE") => void;
}

export const MoodleView: React.FC<MoodleViewProps> = ({ resources, onOpenResource }) => {
  const [courses, setCourses] = useState<MoodleCourse[]>([]);
  const [assignments, setAssignments] = useState<MoodleAssignment[]>([]);
  const [status, setStatus] = useState<MoodleSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string>("ALL");
  const [expandedSubsections, setExpandedSubsections] = useState<Record<string, boolean>>({});
  const [viewerTarget, setViewerTarget] = useState<MoodleViewerTarget | null>(null);

  useEffect(() => {
    let mounted = true;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const loadMoodle = async (showSpinner: boolean) => {
      if (showSpinner) setLoading(true);
      try {
        const [coursesRes, assignRes] = await Promise.all([
          api.getMoodleCourses().catch(() => ({ courses: [], status: null })),
          api.getMoodleAssignments().catch(() => ({ assignments: [], total: 0 })),
        ]);
        if (!mounted) return;
        const list = coursesRes.courses || [];
        setCourses(list);
        setStatus(coursesRes.status || null);
        setAssignments(assignRes.assignments || []);
        if (list.length > 0) {
          setSelectedCourseId((prev) => prev || list[0].id);
        }

        const stillSyncing = Boolean(coursesRes.status?.isSyncing) || list.length === 0;
        if (stillSyncing && !pollTimer) {
          pollTimer = setInterval(() => {
            void loadMoodle(false);
          }, 3000);
        } else if (!stillSyncing && pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      } finally {
        if (mounted && showSpinner) setLoading(false);
      }
    };

    void loadMoodle(true);

    return () => {
      mounted = false;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, []);

  const filteredCourses = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter(
      (c) =>
        c.fullname.toLowerCase().includes(q) ||
        c.shortname.toLowerCase().includes(q) ||
        (c.resourceCode || "").toLowerCase().includes(q)
    );
  }, [courses, search]);

  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === selectedCourseId) || filteredCourses[0] || null,
    [courses, filteredCourses, selectedCourseId]
  );

  const groupedSections = useMemo(
    () => (selectedCourse ? groupMoodleSections(selectedCourse.sections) : []),
    [selectedCourse]
  );

  useEffect(() => {
    setExpandedSubsections({});
    if (groupedSections.length > 0) {
      const firstTile = groupedSections.find((g) => g.section.id !== "sec-0") || groupedSections[0];
      setSelectedSectionId(firstTile.section.id);
    } else {
      setSelectedSectionId("ALL");
    }
  }, [selectedCourse?.id, groupedSections.length]);

  const linkedResource = useMemo(() => {
    if (!selectedCourse?.resourceCode) return undefined;
    return resources.find(
      (r) => r.code.toUpperCase() === selectedCourse.resourceCode?.toUpperCase()
    );
  }, [selectedCourse, resources]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 text-slate-500 gap-2">
        <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
        <p className="text-xs font-medium">Chargement de l&apos;espace E-Campus...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 select-none">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-extrabold text-slate-900">
              E-Campus Vert — Intégré
            </h1>
            <p className="text-xs text-slate-500">
              {courses.length} cours • {status?.totalDocuments || 0} documents • {assignments.length} devoirs
              {status?.lastSyncedAt && (
                <> • Sync {new Date(status.lastSyncedAt).toLocaleString("fr-FR")}</>
              )}
            </p>
          </div>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un cours, R104, SAE..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-600 focus:bg-white"
          />
        </div>
      </div>

      {/* Main Split View */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: Course List + Upcoming Assignments */}
        <div className="w-full lg:w-80 xl:w-96 border-b lg:border-b-0 lg:border-r border-slate-200 bg-white overflow-y-auto shrink-0 max-h-[38vh] lg:max-h-none">
          {assignments.length > 0 && (
            <div className="p-3.5 border-b border-slate-200 bg-amber-50/50 space-y-2">
              <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>Devoirs à rendre ({assignments.length})</span>
              </p>
              <div className="space-y-1.5">
                {assignments.slice(0, 5).map((a) => (
                  <button
                    key={a.id}
                    onClick={() =>
                      setViewerTarget({
                        title: a.name,
                        url: a.url,
                        type: "assign",
                      })
                    }
                    className="w-full text-left p-2.5 bg-white hover:bg-amber-50 border border-amber-200 rounded-xl transition-colors cursor-pointer"
                  >
                    <p className="text-xs font-bold text-slate-900 truncate">{a.name}</p>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {a.resourceCode || a.courseTitle}
                      {a.dueDate ? ` • ${new Date(a.dueDate).toLocaleDateString("fr-FR")}` : ""}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="p-2.5 space-y-1">
            {filteredCourses.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">Aucun cours trouvé.</p>
            ) : (
              filteredCourses.map((c) => {
                const isSelected = selectedCourse?.id === c.id;
                const docCount = c.sections.reduce(
                  (acc, s) => acc + s.modules.reduce((mAcc, m) => mAcc + m.files.length, 0),
                  0
                );
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCourseId(c.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-emerald-50 border-emerald-300 shadow-xs"
                        : "bg-white hover:bg-slate-50 border-transparent"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        {c.resourceCode || "Général"}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {docCount} doc{docCount > 1 ? "s" : ""}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-900 line-clamp-2">{c.fullname}</p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Course Sections & Modules */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {!selectedCourse ? (
            <div className="text-center py-16 text-slate-400 text-xs">
              Sélectionnez un cours à gauche pour consulter son contenu.
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-5">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {selectedCourse.resourceCode || `Cours #${selectedCourse.moodleId}`}
                    </span>
                  </div>
                  <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                    {selectedCourse.fullname}
                  </h2>
                </div>
                {linkedResource && (
                  <button
                    onClick={() => onOpenResource(linkedResource.id, "CM")}
                    className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Ouvrir la ressource {linkedResource.code}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {selectedCourse.sections.length === 0 ? (
                <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-10 text-center text-xs text-slate-500">
                  Aucune section publiée dans ce cours pour le moment.
                </div>
              ) : (
                <>
                  <div className="bg-white border border-slate-200 rounded-2xl p-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    {groupedSections.map((grp) => {
                      const sec = grp.section;
                      const active = selectedSectionId === sec.id;
                      return (
                        <button
                          key={sec.id}
                          onClick={() => setSelectedSectionId(sec.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 shrink-0 cursor-pointer border ${
                            active
                              ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                              : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          <span>{sec.name || "Section"}</span>
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
                              active ? "bg-emerald-700 text-emerald-100" : "bg-white text-slate-500 border border-slate-200"
                            }`}
                          >
                            {grp.totalModules}
                          </span>
                        </button>
                      );
                    })}
                    {groupedSections.length > 1 && (
                      <button
                        onClick={() => setSelectedSectionId("ALL")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer border ml-auto ${
                          selectedSectionId === "ALL"
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-white hover:bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        Tout voir
                      </button>
                    )}
                  </div>

                  {groupedSections
                    .filter((grp) => selectedSectionId === "ALL" || grp.section.id === selectedSectionId)
                    .flatMap((grp) => [
                      { sec: grp.section, isSub: false },
                      ...grp.subsections.map((sub) => ({ sec: sub, isSub: true })),
                    ])
                    .map(({ sec, isSub }) => {
                      const isOpen = !isSub || Boolean(expandedSubsections[sec.id]);
                      return (
                  <div
                    key={sec.id}
                    className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (isSub) {
                          setExpandedSubsections((prev) => ({ ...prev, [sec.id]: !prev[sec.id] }));
                        }
                      }}
                      className={`w-full bg-slate-50 px-5 py-3 flex items-center justify-between text-left ${
                        isOpen ? "border-b border-slate-200" : ""
                      } ${isSub ? "hover:bg-slate-100 transition-colors cursor-pointer" : "cursor-default"}`}
                    >
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        {isSub ? (
                          isOpen ? (
                            <ChevronDown className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-emerald-600 shrink-0" />
                          )
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        )}
                        <span>{sec.name || "Section"}</span>
                      </h3>
                      <span className="text-[11px] font-mono text-slate-500">
                        {sec.modules.length} élément{sec.modules.length > 1 ? "s" : ""}
                      </span>
                    </button>

                    {isOpen && (
                    <div>
                      {sec.summaryHtml && (
                        <div
                          className="px-5 py-4 bg-slate-50/50 border-b border-slate-100 prose prose-sm max-w-none text-slate-800 [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:px-2.5 [&_a]:py-0.5 [&_a]:mx-0.5 [&_a]:rounded-lg [&_a]:bg-blue-600 [&_a]:text-white [&_a]:font-bold [&_a]:no-underline [&_a]:shadow-2xs hover:[&_a]:bg-blue-700 [&_a]:transition-colors"
                          dangerouslySetInnerHTML={{ __html: sec.summaryHtml }}
                        />
                      )}
                    <div className="divide-y divide-slate-100">
                      {sec.modules.map((mod) => {
                        if (mod.type === "label" && mod.html) {
                          return (
                            <div
                              key={mod.id}
                              className="px-5 py-4 prose prose-sm max-w-none text-slate-800 [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:px-2.5 [&_a]:py-0.5 [&_a]:mx-0.5 [&_a]:rounded-lg [&_a]:bg-blue-600 [&_a]:text-white [&_a]:font-bold [&_a]:no-underline [&_a]:shadow-2xs hover:[&_a]:bg-blue-700 [&_a]:transition-colors"
                              dangerouslySetInnerHTML={{ __html: mod.html }}
                            />
                          );
                        }
                        const file = mod.files?.[0];
                        const isDirectFile = mod.type === "resource" && !!file;
                        const Icon =
                          mod.type === "folder"
                            ? FolderArchive
                            : mod.type === "forum"
                            ? MessageSquare
                            : mod.type === "url"
                            ? Link2
                            : FileText;

                        return (
                          <div
                            key={mod.id}
                            className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                                <Icon className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-900 truncate">{mod.name}</p>
                                {mod.html ? (
                                  <div
                                    className="text-xs text-slate-600 mt-1 prose prose-sm max-w-none [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:px-2 [&_a]:py-0.5 [&_a]:mx-0.5 [&_a]:rounded-md [&_a]:bg-blue-600 [&_a]:text-white [&_a]:font-bold [&_a]:no-underline hover:[&_a]:bg-blue-700"
                                    dangerouslySetInnerHTML={{ __html: mod.html }}
                                  />
                                ) : mod.description ? (
                                  <p className="text-[11px] text-slate-500 mt-0.5 whitespace-pre-line">
                                    {mod.description}
                                  </p>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() =>
                                  setViewerTarget({
                                    title: mod.name,
                                    url: isDirectFile ? file.url : mod.url,
                                    type: mod.type,
                                    fileType: file?.fileType,
                                  })
                                }
                                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Ouvrir</span>
                              </button>
                              {isDirectFile && (
                                <a
                                  href={api.getMoodleDownloadUrl(file.url)}
                                  download
                                  className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg"
                                  title="Télécharger"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    </div>
                    )}
                  </div>
                      );
                    })}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <MoodleViewerModal target={viewerTarget} onClose={() => setViewerTarget(null)} />
    </div>
  );
};
