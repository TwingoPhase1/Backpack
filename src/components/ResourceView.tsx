import React, { useState, useEffect, useMemo } from "react";
import { Resource, Note, Asset, ResourceGrade, MoodleCourse } from "../types";
import { api } from "../services/api";
import { NoteEditor } from "./NoteEditor";
import { ImageWorkspace } from "./ImageWorkspace";
import { ExportModal } from "./ExportModal";
import { MoodleWorkspaceDrawer } from "./MoodleWorkspaceDrawer";
import { MoodleViewerModal, MoodleViewerTarget } from "./MoodleViewerModal";
import { groupMoodleSections } from "../utils/moodleSections";
import { StickyNotesBoard } from "./StickyNotesBoard";
import { LessonsPlanner } from "./LessonsPlanner";
import { ResourceSlidesTab } from "./ResourceSlidesTab";
import { TDExerciseGeneratorModal } from "./TDExerciseGeneratorModal";
import { ResourceQCMTab } from "./ResourceQCMTab";
import { AddToSpaceModal } from "./AddToSpaceModal";
import {
  BookOpen,
  Laptop,
  Plus,
  Calendar,
  Clock,
  CheckCircle2,
  ListTodo,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  FileDown,
  Trash2,
  Image as ImageIcon,
  Check,
  Award,
  User,
  ArrowRight,
  GraduationCap,
  TrendingUp,
  FolderArchive,
  Download,
  ExternalLink,
  Copy,
  Eye,
  FileText,
  FileArchive,
  MessageSquare,
  StickyNote as StickyIcon,
  Presentation,
  PenTool,
  Sparkles,
  HelpCircle,
  FolderPlus,
  RefreshCw,
} from "lucide-react";

interface ResourceViewProps {
  resource: Resource;
  onOpenScheduleForResource?: (resourceCode: string) => void;
  onOpenGrades?: () => void;
  initialNoteId?: string;
  initialTab?: "CM" | "TD" | "TP" | "QCM" | "GRADES" | "MOODLE" | "POSTITS" | "LESSONS" | "SLIDES";
}

export const ResourceView: React.FC<ResourceViewProps> = ({
  resource,
  onOpenScheduleForResource,
  onOpenGrades,
  initialNoteId,
  initialTab,
}) => {
  const [activeTab, setActiveTab] = useState<"CM" | "TD" | "TP" | "QCM" | "GRADES" | "MOODLE" | "POSTITS" | "LESSONS" | "SLIDES">(initialTab || "CM");
  const [notes, setNotes] = useState<Note[]>([]);
  const [showTDGeneratorModal, setShowTDGeneratorModal] = useState(false);
  const [gradesReport, setGradesReport] = useState<{ semester: 1 | 2; resourceGrade?: ResourceGrade }[]>([]);
  const [loadingGrades, setLoadingGrades] = useState(false);
  const [selectedNote, setSelectedNote] = useState<(Note & { assets: Asset[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [workspaceDrawer, setWorkspaceDrawer] = useState<"images" | "moodle" | "none">("images");
  const [selectedMoodleId, setSelectedMoodleId] = useState<number | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [insertFn, setInsertFn] = useState<((tag: string) => void) | null>(null);
  const [moodleCourse, setMoodleCourse] = useState<MoodleCourse | null>(null);
  const [loadingMoodle, setLoadingMoodle] = useState(false);
  const [syncingMoodle, setSyncingMoodle] = useState(false);
  const [selectedMoodleSectionId, setSelectedMoodleSectionId] = useState<string>("ALL");
  const [expandedMoodleSubsections, setExpandedMoodleSubsections] = useState<Record<string, boolean>>({});
  const [moodleViewerTarget, setMoodleViewerTarget] = useState<MoodleViewerTarget | null>(null);
  const [addToSpaceFile, setAddToSpaceFile] = useState<{ name: string; url: string } | null>(null);
  const [copiedFileId, setCopiedFileId] = useState<string | null>(null);
  const [createSlideTrigger, setCreateSlideTrigger] = useState(0);
  const [createQCMTrigger, setCreateQCMTrigger] = useState(0);
  const [qcmsCount, setQcmsCount] = useState(0);

  const groupedMoodleSections = useMemo(
    () => (moodleCourse ? groupMoodleSections(moodleCourse.sections) : []),
    [moodleCourse]
  );

  useEffect(() => {
    setExpandedMoodleSubsections({});
    if (groupedMoodleSections.length > 0) {
      const firstTile = groupedMoodleSections.find((g) => g.section.id !== "sec-0") || groupedMoodleSections[0];
      setSelectedMoodleSectionId(firstTile.section.id);
    } else {
      setSelectedMoodleSectionId("ALL");
    }
  }, [moodleCourse?.id, groupedMoodleSections.length]);

  // Load QCMs count
  useEffect(() => {
    api.getQCMs(resource.code).then((list) => setQcmsCount(list.length)).catch(() => {});
  }, [resource.code, createQCMTrigger]);

  // Load Moodle course for this resource
  useEffect(() => {
    const fetchMoodle = async () => {
      setLoadingMoodle(true);
      try {
        const data = await api.getMoodleCourse(resource.code);
        setMoodleCourse(data);
      } catch {
        setMoodleCourse(null);
      } finally {
        setLoadingMoodle(false);
      }
    };
    fetchMoodle();
  }, [resource.code]);

  const handleSyncMoodle = async () => {
    if (syncingMoodle) return;
    setSyncingMoodle(true);
    try {
      await api.syncMoodle(false);
      const data = await api.getMoodleCourse(resource.code);
      setMoodleCourse(data);
    } catch (e) {
      console.error("Erreur actualisation Moodle:", e);
    } finally {
      setSyncingMoodle(false);
    }
  };

  const handleCopyMarkdown = (title: string, url: string, id: string) => {
    const md = `[📄 ${title}](${url})`;
    navigator.clipboard.writeText(md);
    setCopiedFileId(id);
    setTimeout(() => setCopiedFileId(null), 2000);
  };

  // Load grades for this resource from Webnotes
  useEffect(() => {
    const fetchGrades = async () => {
      setLoadingGrades(true);
      try {
        const data = await api.getGradesByResource(resource.code);
        setGradesReport(data || []);
      } catch (e) {
        console.error("Erreur chargement notes ressource:", e);
      } finally {
        setLoadingGrades(false);
      }
    };
    fetchGrades();
  }, [resource.code]);

  // Load notes for this resource
  const fetchNotes = async () => {
    setLoading(true);
    try {
      const data = await api.getNotes(resource.id);
      setNotes(data);

      if (initialNoteId) {
        const found = data.find((n) => n.id === initialNoteId);
        if (found) {
          openNote(found.id);
          setActiveTab(found.type);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
    setSelectedNote(null);
    const handleNotesUpdated = () => fetchNotes();
    window.addEventListener("cartable:notes-updated", handleNotesUpdated);
    return () => window.removeEventListener("cartable:notes-updated", handleNotesUpdated);
  }, [resource.id]);

  const openNote = async (noteId: string) => {
    try {
      const detailed = await api.getNote(noteId);
      setSelectedNote(detailed);
      setActiveTab(detailed.type);
    } catch (err: any) {
      alert("Erreur ouverture note : " + err.message);
    }
  };

  const handleCreateNote = async (type: "CM" | "TD" | "TP") => {
    const defaultTitle =
      type === "CM"
        ? `CM : Séance du ${new Date().toLocaleDateString("fr-FR")}`
        : type === "TD"
        ? `TD ${notes.filter((n) => n.type === "TD").length + 1} : Travaux Dirigés`
        : `TP ${notes.filter((n) => n.type === "TP").length + 1} : Travaux Pratiques`;

    try {
      const newNote = await api.createNote({
        resourceId: resource.id,
        type,
        title: defaultTitle,
        content:
          type === "CM"
            ? `# ${defaultTitle}\n\n**Date :** ${new Date().toLocaleDateString("fr-FR")}\n**Matière :** ${resource.code} — ${resource.name}\n\n## 1. Introduction\n\nPrise de note au fil de l'eau...\n`
            : type === "TD"
            ? `# ${defaultTitle}\n\n**Matière :** ${resource.code} — ${resource.name}\n**Date :** ${new Date().toLocaleDateString("fr-FR")}\n\n## Exercice 1\n\n### Énoncé\nÉcrivez l'énoncé ici ou générez des exercices avec l'IA.\n\n### Solution\n\n`
            : `# ${defaultTitle}\n\n**Matière :** ${resource.code} — ${resource.name}\n**Date :** ${new Date().toLocaleDateString("fr-FR")}\n\n## Objectifs du TP\n- [ ] Prendre en main l'environnement\n- [ ] Réaliser les tests et manipulations\n- [ ] Capturer les résultats d'exécution\n\n## 1. Déroulement\n\n> Note : Glissez vos captures d'écran dans la médiathèque à droite ou collez-les directement (Ctrl+V) !\n`,
        objectives:
          type === "TP"
            ? [
                { id: "obj-1", text: "Prendre en main l'environnement", completed: false },
                { id: "obj-2", text: "Réaliser les tests et manipulations", completed: false },
                { id: "obj-3", text: "Capturer les résultats d'exécution", completed: false },
              ]
            : [],
      });

      await fetchNotes();
      openNote(newNote.id);
    } catch (err: any) {
      alert("Erreur création note : " + err.message);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm("Voulez-vous vraiment supprimer cette note et tous ses assets associés ?")) return;
    try {
      await api.deleteNote(noteId);
      setSelectedNote(null);
      fetchNotes();
    } catch (err: any) {
      alert("Erreur suppression : " + err.message);
    }
  };

  const refreshSelectedNoteAssets = async () => {
    if (!selectedNote) return;
    try {
      const detailed = await api.getNote(selectedNote.id);
      setSelectedNote(detailed);
    } catch (err) {
      console.error(err);
    }
  };

  const cmNotes = notes.filter((n) => n.type === "CM");
  const tdNotes = notes.filter((n) => n.type === "TD");
  const tpNotes = notes.filter((n) => n.type === "TP");
  const allEvals = gradesReport.flatMap((g) => g.resourceGrade?.evaluations || []);
  const currentResGrade = gradesReport[0]?.resourceGrade;
  const averageNumber =
    currentResGrade?.moyenne != null && !isNaN(Number(currentResGrade.moyenne))
      ? Number(currentResGrade.moyenne)
      : null;

  const totalMoodleDocs = moodleCourse
    ? moodleCourse.sections.reduce(
        (acc, s) =>
          acc +
          s.modules.reduce(
            (mAcc, m) =>
              mAcc +
              (m.files && m.files.length > 0
                ? m.files.length
                : m.type === "resource"
                ? 1
                : 0),
            0
          ),
        0
      )
    : 0;

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50 text-slate-800">
      {/* If a note is currently open in workspace */}
      {selectedNote ? (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Top Bar Note Workspace */}
          <div className="bg-white border-b border-slate-200 px-3 md:px-4 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0 no-print">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <button
                onClick={() => {
                  setSelectedNote(null);
                  fetchNotes();
                }}
                className="p-1.5 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors shrink-0 flex items-center gap-1 text-xs"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Retour</span>
              </button>

              <span
                className="text-xs font-mono font-bold px-2 py-0.5 rounded shrink-0"
                style={{
                  backgroundColor: `${resource.color}15`,
                  color: resource.color,
                  borderColor: `${resource.color}35`,
                  borderWidth: "1px",
                }}
              >
                {resource.code} {selectedNote.type}
              </span>

              {/* Title input */}
              <input
                type="text"
                value={selectedNote.title}
                onChange={async (e) => {
                  const newTitle = e.target.value;
                  setSelectedNote({ ...selectedNote, title: newTitle });
                  await api.updateNote(selectedNote.id, { title: newTitle });
                }}
                className="bg-transparent font-bold text-slate-900 text-xs md:text-sm focus:outline-none focus:bg-slate-100 px-2 py-1 rounded truncate min-w-0 flex-1 max-w-xs md:max-w-md"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto no-scrollbar">
              {/* Status for TP */}
              {selectedNote.type === "TP" && (
                <select
                  value={selectedNote.status || "En cours"}
                  onChange={async (e) => {
                    const newStatus = e.target.value as any;
                    setSelectedNote({ ...selectedNote, status: newStatus });
                    await api.updateNote(selectedNote.id, { status: newStatus });
                  }}
                  className="bg-white border border-slate-200 text-xs rounded-lg px-2 py-1 text-slate-700 focus:outline-none font-medium"
                >
                  <option value="En cours">🟡 En cours</option>
                  <option value="Terminé">🟢 Terminé</option>
                  <option value="À réviser">🔴 À réviser</option>
                </select>
              )}

              {/* Toggle Images Drawer */}
              <button
                onClick={() => setWorkspaceDrawer(workspaceDrawer === "images" ? "none" : "images")}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  workspaceDrawer === "images"
                    ? "bg-blue-50 text-blue-700 border-blue-200 font-semibold"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
                title="Médiathèque d'images"
              >
                <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                <span className="hidden sm:inline">Images ({selectedNote.assets?.length || 0})</span>
              </button>

              {/* Toggle Supports Moodle Drawer */}
              <button
                onClick={() => setWorkspaceDrawer(workspaceDrawer === "moodle" ? "none" : "moodle")}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  workspaceDrawer === "moodle"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
                title="Supports Moodle"
              >
                <FolderArchive className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden sm:inline">Moodle ({totalMoodleDocs})</span>
              </button>

              {/* Export Modal trigger */}
              <button
                onClick={() => setShowExportModal(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors"
                title="Exporter en PDF ou Markdown"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Exporter</span>
              </button>

              {/* Delete button */}
              <button
                onClick={() => handleDeleteNote(selectedNote.id)}
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Supprimer la note"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Objectives Checkbar for TP notes */}
          {selectedNote.type === "TP" && selectedNote.objectives && selectedNote.objectives.length > 0 && (
            <div className="bg-slate-50 border-b border-slate-200 px-4 md:px-6 py-2 flex items-center gap-4 overflow-x-auto text-xs shrink-0 no-print">
              <div className="flex items-center gap-2 text-slate-600 font-semibold shrink-0">
                <ListTodo className="w-4 h-4 text-cyan-600" />
                <span>Objectifs TP :</span>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                {selectedNote.objectives.map((obj) => (
                  <label
                    key={obj.id}
                    className="flex items-center gap-2 cursor-pointer select-none text-slate-700 hover:text-slate-900"
                  >
                    <input
                      type="checkbox"
                      checked={obj.completed}
                      onChange={async (e) => {
                        const updatedObjs = selectedNote.objectives!.map((o) =>
                          o.id === obj.id ? { ...o, completed: e.target.checked } : o
                        );
                        setSelectedNote({ ...selectedNote, objectives: updatedObjs });
                        await api.updateNote(selectedNote.id, { objectives: updatedObjs });
                      }}
                      className="rounded bg-white border-slate-300 text-blue-600 focus:ring-0 w-3.5 h-3.5"
                    />
                    <span className={obj.completed ? "line-through text-slate-400" : ""}>
                      {obj.text}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Workspace Body: NoteEditor + ImageWorkspace */}
          <div className="flex-1 flex overflow-hidden relative">
            <NoteEditor
              note={selectedNote}
              assets={selectedNote.assets || []}
              onNoteUpdate={(updated) => setSelectedNote({ ...selectedNote, ...updated })}
              onAssetsChanged={refreshSelectedNoteAssets}
              editorRefExpose={(fn) => setInsertFn(() => fn)}
            />

            {workspaceDrawer === "images" && (
              <ImageWorkspace
                noteId={selectedNote.id}
                assets={selectedNote.assets || []}
                onAssetsChanged={refreshSelectedNoteAssets}
                onInsertImageTag={(tag) => {
                  if (insertFn) insertFn(tag);
                }}
                onClose={() => setWorkspaceDrawer("none")}
              />
            )}

            {workspaceDrawer === "moodle" && (
              <MoodleWorkspaceDrawer
                course={moodleCourse}
                loading={loadingMoodle}
                resourceCode={resource.code}
                onInsertLink={(md) => {
                  if (insertFn) insertFn(md);
                }}
                onClose={() => setWorkspaceDrawer("none")}
              />
            )}
          </div>

          {/* Export Modal */}
          {showExportModal && (
            <ExportModal
              note={selectedNote}
              assets={selectedNote.assets || []}
              onClose={() => setShowExportModal(false)}
            />
          )}
        </div>
      ) : (
        /* Resource Overview (Tabs CM & TP) */
        <div className="flex-1 flex flex-col h-full overflow-y-auto">
          {/* Header Banner */}
          <div className="p-4 md:p-8 border-b border-slate-200 bg-white">
            <div className="max-w-6xl mx-auto">
              <div className="flex flex-col sm:flex-row items-start justify-between gap-4 md:gap-6">
                <div className="flex items-start gap-3 md:gap-4">
                  <div className="text-3xl md:text-4xl p-2.5 md:p-3 bg-slate-50 border border-slate-200 rounded-2xl shrink-0">
                    {resource.emoji}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span
                        className="font-mono text-xs font-bold px-2.5 py-0.5 rounded border"
                        style={{
                          backgroundColor: `${resource.color}15`,
                          color: resource.color,
                          borderColor: `${resource.color}35`,
                        }}
                      >
                        {resource.code}
                      </span>
                      <span className="text-xs text-slate-500 font-medium">
                        Semestre {resource.semester} • {resource.category}
                      </span>
                    </div>
                    <h2 className="text-xl md:text-2xl font-bold text-slate-900 leading-tight">{resource.name}</h2>
                    {resource.teacher && (
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 font-medium">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        Enseignant : {resource.teacher}
                      </p>
                    )}
                  </div>
                </div>

                {/* Coefs pills */}
                {resource.coefs && Object.keys(resource.coefs).length > 0 && (
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-2 md:p-2.5 rounded-xl self-start">
                    <Award className="w-4 h-4 text-amber-500 shrink-0" />
                    <div className="flex gap-1.5 flex-wrap">
                      {Object.entries(resource.coefs).map(([ue, val]) => (
                        <span
                          key={ue}
                          className="px-2 py-0.5 rounded text-xs font-mono bg-white text-slate-700 border border-slate-200"
                        >
                          <strong>{ue}</strong> : coef {val}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Tabs Navigation */}
              <div className="mt-4 md:mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-b border-slate-200 gap-3">
                <div className="flex gap-2 sm:gap-4 overflow-x-auto no-scrollbar pb-1 shrink-0">
                  <button
                    onClick={() => setActiveTab("CM")}
                    className={`flex items-center gap-1.5 pb-2.5 text-xs md:text-sm font-semibold border-b-2 whitespace-nowrap transition-all ${
                      activeTab === "CM"
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <BookOpen className="w-4 h-4 shrink-0" />
                    <span>Cahier CM ({cmNotes.length})</span>
                  </button>

                  <button
                    onClick={() => setActiveTab("TD")}
                    className={`flex items-center gap-1.5 pb-2.5 text-xs md:text-sm font-semibold border-b-2 whitespace-nowrap transition-all ${
                      activeTab === "TD"
                        ? "border-indigo-600 text-indigo-600"
                        : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <PenTool className="w-4 h-4 shrink-0" />
                    <span>Exercices TD ({tdNotes.length})</span>
                  </button>

                  <button
                    onClick={() => setActiveTab("TP")}
                    className={`flex items-center gap-1.5 pb-2.5 text-xs md:text-sm font-semibold border-b-2 whitespace-nowrap transition-all ${
                      activeTab === "TP"
                        ? "border-cyan-600 text-cyan-600"
                        : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <Laptop className="w-4 h-4 shrink-0" />
                    <span>Espaces TP ({tpNotes.length})</span>
                  </button>

                  <button
                    onClick={() => setActiveTab("QCM")}
                    className={`flex items-center gap-1.5 pb-2.5 text-xs md:text-sm font-semibold border-b-2 whitespace-nowrap transition-all ${
                      activeTab === "QCM"
                        ? "border-violet-600 text-violet-600"
                        : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <HelpCircle className="w-4 h-4 shrink-0" />
                    <span>QCM & Quiz ({qcmsCount})</span>
                  </button>

                  <button
                    onClick={() => setActiveTab("GRADES")}
                    className={`flex items-center gap-1.5 pb-2.5 text-xs md:text-sm font-semibold border-b-2 whitespace-nowrap transition-all ${
                      activeTab === "GRADES"
                        ? "border-amber-600 text-amber-600"
                        : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <GraduationCap className="w-4 h-4 shrink-0" />
                    <span>Notes ({allEvals.length})</span>
                    {averageNumber !== null && (
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold ${
                          averageNumber >= 10
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-rose-50 text-rose-700 border border-rose-200"
                        }`}
                      >
                        {averageNumber.toFixed(2)}/20
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setActiveTab("MOODLE")}
                    className={`flex items-center gap-1.5 pb-2.5 text-xs md:text-sm font-semibold border-b-2 whitespace-nowrap transition-all ${
                      activeTab === "MOODLE"
                        ? "border-emerald-600 text-emerald-600"
                        : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <FolderArchive className="w-4 h-4 shrink-0" />
                    <span>Moodle ({totalMoodleDocs})</span>
                  </button>

                  <button
                    onClick={() => setActiveTab("POSTITS")}
                    className={`flex items-center gap-1.5 pb-2.5 text-xs md:text-sm font-semibold border-b-2 whitespace-nowrap transition-all ${
                      activeTab === "POSTITS"
                        ? "border-amber-500 text-amber-600"
                        : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <StickyIcon className="w-4 h-4 shrink-0" />
                    <span>Pense-bêtes</span>
                  </button>

                  <button
                    onClick={() => setActiveTab("LESSONS")}
                    className={`flex items-center gap-1.5 pb-2.5 text-xs md:text-sm font-semibold border-b-2 whitespace-nowrap transition-all ${
                      activeTab === "LESSONS"
                        ? "border-sky-600 text-sky-600"
                        : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <Calendar className="w-4 h-4 shrink-0" />
                    <span>Cahier de texte</span>
                  </button>

                  <button
                    onClick={() => setActiveTab("SLIDES")}
                    className={`flex items-center gap-1.5 pb-2.5 text-xs md:text-sm font-semibold border-b-2 whitespace-nowrap transition-all ${
                      activeTab === "SLIDES"
                        ? "border-purple-600 text-purple-600"
                        : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <Presentation className="w-4 h-4 shrink-0" />
                    <span>Diaporama</span>
                  </button>
                </div>

                {activeTab === "CM" || activeTab === "TP" ? (
                  <button
                    onClick={() => handleCreateNote(activeTab)}
                    className="mb-2 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{activeTab === "CM" ? "Nouvelle séance CM" : "Nouveau TP"}</span>
                  </button>
                ) : activeTab === "TD" ? (
                  <div className="mb-2 flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setShowTDGeneratorModal(true)}
                      className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-lg text-xs font-semibold transition-all shadow-xs"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Générer avec l'IA</span>
                    </button>
                    <button
                      onClick={() => handleCreateNote("TD")}
                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold transition-colors shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Nouveau TD</span>
                    </button>
                  </div>
                ) : activeTab === "QCM" ? (
                  <button
                    onClick={() => setCreateQCMTrigger((c) => c + 1)}
                    className="mb-2 flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-lg text-xs font-semibold transition-all shadow-xs"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Générer un QCM</span>
                  </button>
                ) : activeTab === "GRADES" ? (
                  onOpenGrades ? (
                    <button
                      onClick={onOpenGrades}
                      className="mb-2 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-semibold transition-colors shrink-0"
                    >
                      <GraduationCap className="w-4 h-4" />
                      <span>Relevé complet</span>
                    </button>
                  ) : null
                ) : activeTab === "MOODLE" ? (
                  <div className="mb-2 flex items-center gap-2 shrink-0">
                    {moodleCourse && (
                      <a
                        href={moodleCourse.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                        <span>Ouvrir sur E-Campus</span>
                      </a>
                    )}
                  </div>
                ) : activeTab === "SLIDES" ? (
                  <button
                    onClick={() => setCreateSlideTrigger((c) => c + 1)}
                    className="mb-2 flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold transition-colors shrink-0 shadow-xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Créer un diaporama</span>
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 p-3 md:p-8 max-w-6xl mx-auto w-full">
            {activeTab === "CM" ? (
              /* CM Notes Section */
              <div className="space-y-4">
                {cmNotes.length === 0 ? (
                  <div className="text-center py-16 bg-white border border-dashed border-slate-200 rounded-2xl p-6">
                    <BookOpen className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                    <h4 className="text-slate-800 font-semibold text-sm">Aucune note de CM pour le moment</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      Créez votre première séance de cours magistral pour commencer à prendre vos notes au fil de l'eau.
                    </p>
                    <button
                      onClick={() => handleCreateNote("CM")}
                      className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Créer une note de CM</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {cmNotes.map((note) => (
                      <div
                        key={note.id}
                        onClick={() => openNote(note.id)}
                        className="p-5 bg-white border border-slate-200 rounded-xl hover:border-blue-300 cursor-pointer transition-colors group flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between text-xs text-slate-500 mb-2 font-mono">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              {note.cmDate || new Date(note.createdAt).toLocaleDateString("fr-FR")}
                            </span>
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                              CM
                            </span>
                          </div>
                          <h4 className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                            {note.title}
                          </h4>
                          <p className="text-xs text-slate-600 mt-2 line-clamp-3 leading-relaxed">
                            {note.content.replace(/[#*`_\[\]]/g, "").substring(0, 150)}...
                          </p>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-blue-600 font-medium">
                          <span>Ouvrir le cahier</span>
                          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : activeTab === "TD" ? (
              /* TD Exercises Section */
              <div className="space-y-4">
                {tdNotes.length === 0 ? (
                  <div className="text-center py-16 bg-white border border-dashed border-slate-200 rounded-2xl p-6">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto mb-3 text-indigo-600">
                      <PenTool className="w-6 h-6" />
                    </div>
                    <h4 className="text-slate-800 font-semibold text-sm">Aucun exercice de TD pour le moment</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                      Créez votre première fiche de TD manuellement ou générez des exercices adaptés avec l'IA à partir d'une photo de votre feuille d'exercices ou des documents eCampus.
                    </p>
                    <div className="mt-5 flex items-center justify-center gap-3 flex-wrap">
                      <button
                        onClick={() => setShowTDGeneratorModal(true)}
                        className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-medium rounded-lg inline-flex items-center gap-2 shadow-xs transition-all"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>Générer des exercices avec l'IA</span>
                      </button>
                      <button
                        onClick={() => handleCreateNote("TD")}
                        className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Créer un TD vide</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {tdNotes.map((note) => (
                      <div
                        key={note.id}
                        onClick={() => openNote(note.id)}
                        className="p-5 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 cursor-pointer transition-colors group flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between text-xs text-slate-500 mb-2 font-mono">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              {new Date(note.createdAt).toLocaleDateString("fr-FR")}
                            </span>
                            <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200 font-bold">
                              TD
                            </span>
                          </div>
                          <h4 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-2">
                            {note.title}
                          </h4>
                          <p className="text-xs text-slate-600 mt-2 line-clamp-3 leading-relaxed">
                            {note.content.replace(/[#*`_\[\]$]/g, "").substring(0, 150)}...
                          </p>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-indigo-600 font-medium">
                          <span>Ouvrir la fiche TD</span>
                          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : activeTab === "TP" ? (
              /* TP Workspaces Section */
              <div className="space-y-4">
                {tpNotes.length === 0 ? (
                  <div className="text-center py-16 bg-white border border-dashed border-slate-200 rounded-2xl p-6">
                    <Laptop className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                    <h4 className="text-slate-800 font-semibold text-sm">Aucun espace de TP créé</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      Créez un espace TP pour organiser vos manipulations, insérer des captures d'écran par ID et exporter en PDF.
                    </p>
                    <button
                      onClick={() => handleCreateNote("TP")}
                      className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-medium rounded-lg inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Créer un espace TP</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {tpNotes.map((note) => {
                      const totalObjs = note.objectives?.length || 0;
                      const doneObjs = note.objectives?.filter((o) => o.completed).length || 0;

                      return (
                        <div
                          key={note.id}
                          onClick={() => openNote(note.id)}
                          className="p-5 bg-white border border-slate-200 rounded-xl hover:border-cyan-300 cursor-pointer transition-colors group flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between text-xs mb-2">
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                  note.status === "Terminé"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : note.status === "À réviser"
                                    ? "bg-rose-50 text-rose-700 border-rose-200"
                                    : "bg-amber-50 text-amber-700 border-amber-200"
                                }`}
                              >
                                {note.status || "En cours"}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                {new Date(note.updatedAt).toLocaleDateString("fr-FR")}
                              </span>
                            </div>

                            <h4 className="text-base font-bold text-slate-900 group-hover:text-cyan-700 transition-colors line-clamp-2">
                              {note.title}
                            </h4>

                            {totalObjs > 0 && (
                              <div className="mt-3">
                                <div className="flex justify-between text-[11px] text-slate-500 mb-1 font-medium">
                                  <span>Progression TP</span>
                                  <span>
                                    {doneObjs}/{totalObjs}
                                  </span>
                                </div>
                                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden border border-slate-200">
                                  <div
                                    className="bg-cyan-500 h-full rounded-full transition-all"
                                    style={{
                                      width: `${(doneObjs / totalObjs) * 100}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-cyan-600 font-medium">
                            <span>Accéder à l'espace TP</span>
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : activeTab === "GRADES" ? (
              /* Grades & Evaluations Section */
              <div className="space-y-6">
                {/* Header Summary for Grades */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  <div className="flex items-center gap-5">
                    <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col items-center justify-center shrink-0">
                      <GraduationCap className="w-7 h-7 text-amber-600 mb-0.5" />
                      <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Webnotes</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-slate-500 font-medium">Moyenne du module</span>
                        <span className="text-xs text-slate-300">•</span>
                        <span className="text-xs text-slate-600 font-mono">
                          {gradesReport[0]?.semester
                            ? `Semestre ${gradesReport[0].semester}`
                            : `Semestre ${resource.semester}`}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-3">
                        <span
                          className={`text-3xl font-extrabold font-mono ${
                            averageNumber !== null
                              ? averageNumber >= 10
                                ? "text-emerald-600"
                                : "text-rose-600"
                              : "text-slate-400"
                          }`}
                        >
                          {averageNumber !== null ? averageNumber.toFixed(2) : "—"}
                        </span>
                        <span className="text-sm font-semibold text-slate-400 font-mono">/ 20</span>
                        {averageNumber !== null && (
                          <span
                            className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                              averageNumber >= 10
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-rose-50 text-rose-700 border-rose-200"
                            }`}
                          >
                            {averageNumber >= 10 ? "Validé (≥ 10)" : "Non validé (< 10)"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 w-full md:w-auto justify-end border-t md:border-t-0 pt-4 md:pt-0 border-slate-100">
                    <div className="bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-center">
                      <div className="text-[11px] text-slate-500 font-medium">Évaluations</div>
                      <div className="text-lg font-bold font-mono text-slate-900">{allEvals.length}</div>
                    </div>
                    {onOpenGrades && (
                      <button
                        onClick={onOpenGrades}
                        className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                      >
                        <span>Relevé général</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Evaluations List or Empty */}
                {loadingGrades ? (
                  <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl p-6">
                    <div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full mx-auto mb-3" />
                    <p className="text-xs text-slate-500">Chargement des évaluations Webnotes...</p>
                  </div>
                ) : allEvals.length === 0 ? (
                  <div className="text-center py-16 bg-white border border-dashed border-slate-200 rounded-2xl p-6">
                    <GraduationCap className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                    <h4 className="text-slate-800 font-semibold text-sm">
                      Aucune évaluation trouvée pour {resource.code}
                    </h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                      Les notes proviennent de l'ENT Webnotes Unicaen. Dès qu'un enseignant publie une note pour cette ressource, elle apparaîtra ici automatiquement.
                    </p>
                    {onOpenGrades && (
                      <button
                        onClick={onOpenGrades}
                        className="mt-4 px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 transition-colors"
                      >
                        <GraduationCap className="w-4 h-4" />
                        <span>Ouvrir le relevé complet</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
                      <span>
                        Détail des {allEvals.length} évaluation{allEvals.length > 1 ? "s" : ""}
                      </span>
                      <span className="text-[11px] text-slate-400">Source : Webnotes / Passerelle Unicaen</span>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
                      {allEvals.map((ev, idx) => {
                        const noteNum =
                          ev.note != null && !isNaN(Number(ev.note)) ? Number(ev.note) : null;
                        const moyPromoNum =
                          ev.moy_promo != null && !isNaN(Number(ev.moy_promo))
                            ? Number(ev.moy_promo)
                            : null;
                        const minPromoNum =
                          ev.min_promo != null && !isNaN(Number(ev.min_promo))
                            ? Number(ev.min_promo)
                            : null;
                        const maxPromoNum =
                          ev.max_promo != null && !isNaN(Number(ev.max_promo))
                            ? Number(ev.max_promo)
                            : null;

                        return (
                          <div
                            key={ev.id || idx}
                            className="p-4 hover:bg-slate-50 transition-colors flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                          >
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h5 className="text-sm font-semibold text-slate-900">
                                  {ev.description || "Évaluation"}
                                </h5>
                                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                  coef {ev.coef}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-slate-500 font-mono">
                                {ev.date && (
                                  <span className="flex items-center gap-1 text-slate-600">
                                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                    {new Date(ev.date).toLocaleDateString("fr-FR")}
                                  </span>
                                )}
                                {ev.remarque && (
                                  <span className="italic text-slate-500">"{ev.remarque}"</span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-6 self-end md:self-auto shrink-0">
                              {/* Promotion stats comparison */}
                              {(moyPromoNum !== null ||
                                minPromoNum !== null ||
                                maxPromoNum !== null) && (
                                <div className="text-right text-[11px] font-mono hidden sm:block bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
                                  <div className="text-slate-600 flex items-center justify-end gap-2">
                                    <span className="text-slate-400">Moyenne :</span>
                                    <span className="font-semibold text-slate-800">
                                      {moyPromoNum !== null ? moyPromoNum.toFixed(2) : "—"}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-400 flex items-center justify-end gap-1.5 mt-0.5">
                                    <span>
                                      Min {minPromoNum !== null ? minPromoNum.toFixed(2) : "—"}
                                    </span>
                                    <span>•</span>
                                    <span>
                                      Max {maxPromoNum !== null ? maxPromoNum.toFixed(2) : "—"}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* Student Note */}
                              <div className="text-right">
                                <div className="flex items-baseline justify-end gap-1 font-mono">
                                  <span
                                    className={`text-xl font-extrabold ${
                                      noteNum !== null
                                        ? noteNum >= 10
                                          ? "text-emerald-600"
                                          : "text-rose-600"
                                        : "text-slate-400"
                                    }`}
                                  >
                                    {noteNum !== null ? noteNum.toFixed(2) : "ABS/DIS"}
                                  </span>
                                  <span className="text-xs font-semibold text-slate-400">/ 20</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : activeTab === "MOODLE" ? (
              /* Moodle Course Documents Section */
              <div className="space-y-6">
                {loadingMoodle ? (
                  <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl p-6">
                    <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-3" />
                    <p className="text-xs text-slate-500">Chargement des supports de cours E-Campus Unicaen...</p>
                  </div>
                ) : !moodleCourse ? (
                  <div className="text-center py-16 bg-white border border-dashed border-slate-200 rounded-2xl p-6">
                    <FolderArchive className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                    <h4 className="text-slate-800 font-semibold text-sm">
                      Aucun espace Moodle associé détecté pour {resource.code}
                    </h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                      La synchronisation automatique récupère les cours E-Campus Vert en arrière-plan. Si ce cours vient d&apos;être ouvert sur Moodle, il apparaîtra au prochain cycle.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Header Banner */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                      <div className="flex items-center gap-5">
                        <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-col items-center justify-center shrink-0">
                          <FolderArchive className="w-7 h-7 text-emerald-600 mb-0.5" />
                          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Moodle</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs text-slate-500 font-medium">E-Campus Vert Unicaen</span>
                            <span className="text-xs text-slate-300">•</span>
                            <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              ID #{moodleCourse.moodleId}
                            </span>
                            <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                              Regex: {resource.code}
                            </span>
                            {moodleCourse.lastSyncedAt && (
                              <>
                                <span className="text-xs text-slate-300">•</span>
                                <span className="text-[11px] text-slate-500 font-mono">
                                  Sync le {new Date(moodleCourse.lastSyncedAt).toLocaleString("fr-FR")}
                                </span>
                              </>
                            )}
                          </div>
                          <h3 className="text-lg font-bold text-slate-900 line-clamp-1">{moodleCourse.fullname}</h3>
                          <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                            <span>Anti-ban actif : session réutilisée, téléchargements directs en 1 clic</span>
                          </p>
                          {(moodleCourse as any).matchedCourses && (moodleCourse as any).matchedCourses.length > 1 && (
                            <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                              <span className="text-[11px] text-slate-500 font-medium">Espaces associés :</span>
                              {(moodleCourse as any).matchedCourses.map((c: any) => (
                                <button
                                  key={c.id}
                                  onClick={() => setMoodleCourse({ ...c, matchedCourses: (moodleCourse as any).matchedCourses })}
                                  className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold transition-colors border ${
                                    moodleCourse.id === c.id
                                      ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                                      : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                                  }`}
                                >
                                  {c.shortname?.replace(/^2026_[^-]+-/, "") || c.fullname}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 w-full md:w-auto justify-end border-t md:border-t-0 pt-4 md:pt-0 border-slate-100">
                        <button
                          type="button"
                          onClick={handleSyncMoodle}
                          disabled={syncingMoodle}
                          className="px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
                          title="Actualiser le cours depuis E-Campus"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${syncingMoodle ? "animate-spin" : ""}`} />
                          <span>{syncingMoodle ? "Synchro..." : "Actualiser"}</span>
                        </button>
                        <div className="bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-center">
                          <div className="text-[11px] text-slate-500 font-medium">Documents &amp; Liens</div>
                          <div className="text-lg font-bold font-mono text-slate-900">{totalMoodleDocs}</div>
                        </div>
                      </div>
                    </div>

                    {/* Sections and items */}
                    {moodleCourse.sections.length === 0 ? (
                      <div className="text-center py-12 bg-white border border-dashed border-slate-200 rounded-xl p-6">
                        <FileText className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                        <p className="text-xs text-slate-500">Aucune ressource publiée dans ce cours pour le moment.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Barre de navigation des tuiles / sections (sous-sections regroupées sous leur tuile) */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                          {groupedMoodleSections.map((grp) => {
                            const sec = grp.section;
                            const active = selectedMoodleSectionId === sec.id;
                            return (
                              <button
                                key={sec.id}
                                onClick={() => setSelectedMoodleSectionId(sec.id)}
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
                          {groupedMoodleSections.length > 1 && (
                            <button
                              onClick={() => setSelectedMoodleSectionId("ALL")}
                              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer border ml-auto ${
                                selectedMoodleSectionId === "ALL"
                                  ? "bg-slate-900 text-white border-slate-900"
                                  : "bg-white hover:bg-slate-100 text-slate-600 border-slate-200"
                              }`}
                            >
                              Tout voir
                            </button>
                          )}
                        </div>

                        <div className="space-y-4">
                          {groupedMoodleSections
                            .filter((grp) => selectedMoodleSectionId === "ALL" || grp.section.id === selectedMoodleSectionId)
                            .flatMap((grp) => [
                              { sec: grp.section, isSub: false },
                              ...grp.subsections.map((sub) => ({ sec: sub, isSub: true })),
                            ])
                            .map(({ sec, isSub }) => {
                              const isOpen = !isSub || Boolean(expandedMoodleSubsections[sec.id]);
                              return (
                          <div
                            key={sec.id}
                            className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (isSub) {
                                  setExpandedMoodleSubsections((prev) => ({ ...prev, [sec.id]: !prev[sec.id] }));
                                }
                              }}
                              className={`w-full bg-slate-50 px-5 py-3 flex items-center justify-between text-left ${
                                isOpen ? "border-b border-slate-200" : ""
                              } ${isSub ? "hover:bg-slate-100 transition-colors cursor-pointer" : "cursor-default"}`}
                            >
                              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
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
                              </h4>
                              <span className="text-[11px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                                {sec.modules.length} ressource{sec.modules.length > 1 ? "s" : ""}
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
                              {sec.modules.length === 0 && !sec.summaryHtml ? (
                                <div className="p-4 text-xs text-slate-400 italic">Aucun contenu dans cette section.</div>
                              ) : (
                                sec.modules.map((mod) => {
                                  if (mod.type === "label" && mod.html) {
                                    return (
                                      <div
                                        key={mod.id}
                                        className="px-5 py-4 prose prose-sm max-w-none text-slate-800 [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:px-2.5 [&_a]:py-0.5 [&_a]:mx-0.5 [&_a]:rounded-lg [&_a]:bg-blue-600 [&_a]:text-white [&_a]:font-bold [&_a]:no-underline [&_a]:shadow-2xs hover:[&_a]:bg-blue-700 [&_a]:transition-colors"
                                        dangerouslySetInnerHTML={{ __html: mod.html }}
                                      />
                                    );
                                  }
                                  const file = mod.files && mod.files.length > 0 ? mod.files[0] : null;
                                  const downloadUrl = file ? api.getMoodleDownloadUrl(file.url) : null;
                                  const isCopied = copiedFileId === mod.id;

                                  // Determine clean icon & badge
                                  let typeBadge = "Ressource";
                                  let badgeColor = "bg-blue-50 text-blue-700 border-blue-200";
                                  let IconComponent = FileText;

                                  if (mod.type === "assign") {
                                    typeBadge = "Devoir / Rendu";
                                    badgeColor = "bg-purple-50 text-purple-700 border-purple-200";
                                    IconComponent = ListTodo;
                                  } else if (mod.type === "forum") {
                                    typeBadge = "Forum";
                                    badgeColor = "bg-amber-50 text-amber-700 border-amber-200";
                                    IconComponent = MessageSquare;
                                  } else if (file?.fileType === "pdf") {
                                    typeBadge = "PDF";
                                    badgeColor = "bg-rose-50 text-rose-700 border-rose-200";
                                    IconComponent = FileText;
                                  } else if (file?.fileType === "zip" || file?.fileType === "archive") {
                                    typeBadge = "Archive ZIP";
                                    badgeColor = "bg-amber-50 text-amber-700 border-amber-200";
                                    IconComponent = FileArchive;
                                  }

                                  const cleanName = (file?.name || mod.name).replace(/\s+(Fichier|Dossier|Document)$/i, "");

                                  return (
                                    <div
                                      key={mod.id}
                                      className="p-4 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                                    >
                                      <div className="flex items-start gap-3 min-w-0">
                                        <div className="p-2 bg-slate-100 text-slate-600 rounded-xl shrink-0 mt-0.5">
                                          <IconComponent className="w-5 h-5" />
                                        </div>
                                        <div>
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <h5 className="text-sm font-semibold text-slate-900 line-clamp-1">
                                              {cleanName}
                                            </h5>
                                            <span
                                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badgeColor}`}
                                            >
                                              {typeBadge}
                                            </span>
                                          </div>
                                          {mod.html ? (
                                            <div
                                              className="text-xs text-slate-600 mt-1.5 prose prose-sm max-w-none [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:px-2 [&_a]:py-0.5 [&_a]:mx-0.5 [&_a]:rounded-md [&_a]:bg-blue-600 [&_a]:text-white [&_a]:font-bold [&_a]:no-underline hover:[&_a]:bg-blue-700"
                                              dangerouslySetInnerHTML={{ __html: mod.html }}
                                            />
                                          ) : mod.description ? (
                                            <p className="text-xs text-slate-600 mt-1 whitespace-pre-line">
                                              {mod.description}
                                            </p>
                                          ) : null}
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                                        {/* Copy Markdown tag */}
                                        <button
                                          onClick={() =>
                                            handleCopyMarkdown(
                                              cleanName,
                                              file?.url || mod.url,
                                              mod.id
                                            )
                                          }
                                          className={`p-2 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                                            isCopied
                                              ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                              : "bg-white hover:bg-slate-100 text-slate-600 border-slate-200"
                                          }`}
                                          title="Copier le lien en Markdown pour l'insérer dans vos notes"
                                        >
                                          {isCopied ? (
                                            <>
                                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                                              <span className="text-[11px]">Copié !</span>
                                            </>
                                          ) : (
                                            <>
                                              <Copy className="w-3.5 h-3.5" />
                                              <span className="text-[11px] hidden md:inline">Lien MD</span>
                                            </>
                                          )}
                                        </button>

                                        {/* Open in-app viewer (PDF, Page, Dossier, Devoir, Forum...) */}
                                        <button
                                          onClick={() =>
                                            setMoodleViewerTarget({
                                              title: cleanName,
                                              url: mod.type === "resource" && file ? file.url : mod.url,
                                              type: mod.type,
                                              fileType: file?.fileType,
                                            })
                                          }
                                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                                        >
                                          <Eye className="w-3.5 h-3.5" />
                                          <span>Ouvrir</span>
                                        </button>

                                        {/* Direct download if file */}
                                        {downloadUrl && (
                                          <>
                                            <button
                                              onClick={() =>
                                                setAddToSpaceFile({
                                                  name: cleanName,
                                                  url: file?.url || mod.url,
                                                })
                                              }
                                              className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                                              title="Ajouter à mon espace (CM / TP / TD)"
                                            >
                                              <FolderPlus className="w-3.5 h-3.5" />
                                              <span className="hidden md:inline">Mon espace</span>
                                            </button>
                                            <a
                                              href={downloadUrl}
                                              download
                                              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition-colors flex items-center"
                                              title="Télécharger"
                                            >
                                              <Download className="w-3.5 h-3.5" />
                                            </a>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                            </div>
                            )}
                          </div>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : activeTab === "POSTITS" ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <StickyNotesBoard resourceCode={resource.code} />
              </div>
            ) : activeTab === "LESSONS" ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <LessonsPlanner resourceCode={resource.code} />
              </div>
            ) : activeTab === "SLIDES" ? (
              <ResourceSlidesTab
                resource={resource}
                createTrigger={createSlideTrigger}
              />
            ) : activeTab === "QCM" ? (
              <ResourceQCMTab
                resource={resource}
                moodleCourse={moodleCourse}
                createTrigger={createQCMTrigger}
              />
            ) : null}
          </div>
        </div>
      )}

      {showTDGeneratorModal && (
        <TDExerciseGeneratorModal
          isOpen={showTDGeneratorModal}
          onClose={() => setShowTDGeneratorModal(false)}
          resource={resource}
          moodleCourse={moodleCourse}
          onExerciseCreated={(createdNote) => {
            fetchNotes();
            openNote(createdNote.id);
          }}
        />
      )}

      <MoodleViewerModal
        target={moodleViewerTarget}
        onClose={() => setMoodleViewerTarget(null)}
      />

      <AddToSpaceModal
        isOpen={!!addToSpaceFile}
        onClose={() => setAddToSpaceFile(null)}
        fileName={addToSpaceFile?.name || ""}
        fileUrl={addToSpaceFile?.url || ""}
        sourceLabel="Moodle"
        defaultResourceCode={resource.code}
        onSuccess={(targetResId, targetType) => {
          if (targetResId === resource.id) {
            fetchNotes();
            setActiveTab(targetType);
          }
        }}
      />
    </div>
  );
};
