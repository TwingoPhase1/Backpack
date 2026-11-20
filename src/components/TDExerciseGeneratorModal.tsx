import React, { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  Camera,
  FolderArchive,
  Upload,
  X,
  FileText,
  Check,
  AlertCircle,
  Clock,
  Award,
  Lightbulb,
  BookOpen,
  Copy,
  Save,
  RotateCw,
  Image as ImageIcon,
  CheckCircle2,
  ListOrdered,
  Eye,
  FileCode,
  Layers,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Resource, MoodleCourse, Note, TDExerciseGenerationParams } from "../types";
import { api } from "../services/api";

interface TDExerciseGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  resource: Resource;
  moodleCourse?: MoodleCourse | null;
  onExerciseCreated: (note: Note) => void;
}

export const TDExerciseGeneratorModal: React.FC<TDExerciseGeneratorModalProps> = ({
  isOpen,
  onClose,
  resource,
  moodleCourse,
  onExerciseCreated,
}) => {
  // Source: "photo" | "ecampus"
  const [sourceType, setSourceType] = useState<"photo" | "ecampus">("photo");

  // Photo state
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string | null>(null);
  const [imageFileSize, setImageFileSize] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // eCampus state
  const [selectedMoodleFile, setSelectedMoodleFile] = useState<{
    name: string;
    url: string;
    sectionName?: string;
  } | null>(null);
  const [moodleSearch, setMoodleSearch] = useState("");

  // Configuration params
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<"facile" | "moyen" | "difficile">("moyen");
  const [exerciseCount, setExerciseCount] = useState<number>(2);
  const [includeSolution, setIncludeSolution] = useState(true);
  const [includeGrading, setIncludeGrading] = useState(true);
  const [includeHints, setIncludeHints] = useState(true);
  const [additionalInstructions, setAdditionalInstructions] = useState("");

  // Generation status
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generatedResult, setGeneratedResult] = useState<{
    title: string;
    content: string;
    estimatedTime: string;
  } | null>(null);

  const [previewTab, setPreviewTab] = useState<"rendered" | "raw">("rendered");
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Listen to paste (Ctrl+V) for images when modal is open
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) {
            processFile(file);
            setSourceType("photo");
          }
          break;
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [isOpen]);

  if (!isOpen) return null;

  // Helper to read file as Base64 data URL
  const processFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Veuillez sélectionner un fichier image (JPG, PNG, WebP).");
      return;
    }

    setImageFileName(file.name);
    setImageFileSize(`${(file.size / 1024).toFixed(1)} KB`);

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setImagePreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  // Flatten Moodle files
  const allMoodleFiles = (moodleCourse?.sections || []).flatMap((section) =>
    (section.modules || []).flatMap((module) =>
      (module.files || []).map((f) => ({
        ...f,
        sectionName: section.name,
        moduleName: module.name,
      }))
    )
  );

  const filteredMoodleFiles = moodleSearch.trim()
    ? allMoodleFiles.filter(
        (f) =>
          f.name.toLowerCase().includes(moodleSearch.toLowerCase()) ||
          (f.sectionName && f.sectionName.toLowerCase().includes(moodleSearch.toLowerCase()))
      )
    : allMoodleFiles;

  // Trigger Generation
  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerationError(null);

    try {
      const payload: TDExerciseGenerationParams = {
        resourceCode: resource.code,
        resourceName: resource.name,
        sourceType,
        image: sourceType === "photo" && imagePreview ? imagePreview : undefined,
        documentName:
          sourceType === "ecampus" && selectedMoodleFile
            ? `${selectedMoodleFile.name} (${selectedMoodleFile.sectionName || ""})`
            : undefined,
        topic: topic.trim() || undefined,
        difficulty,
        exerciseCount,
        includeSolution,
        includeGrading,
        includeHints,
        additionalInstructions: additionalInstructions.trim() || undefined,
      };

      const result = await api.generateTDExercises(payload);
      setGeneratedResult({
        title: result.title,
        content: result.content,
        estimatedTime: result.estimatedTime,
      });
    } catch (err: any) {
      console.error("Erreur génération TD :", err);
      setGenerationError(err.message || "Impossible de générer les exercices de TD.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Save to TD Notebook
  const handleSaveToTD = async () => {
    if (!generatedResult) return;
    setIsSaving(true);
    try {
      const newNote = await api.createNote({
        resourceId: resource.id,
        type: "TD",
        title: generatedResult.title,
        content: generatedResult.content,
        status: "En cours",
        cmDate: new Date().toISOString().split("T")[0],
      });

      window.dispatchEvent(new CustomEvent("cartable:notes-updated"));
      onExerciseCreated(newNote);
      onClose();
    } catch (err: any) {
      alert("Erreur enregistrement TD : " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyMarkdown = () => {
    if (!generatedResult) return;
    navigator.clipboard.writeText(generatedResult.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 select-none">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-600 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-white shadow-2xs">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm md:text-base leading-tight">
                  Générateur d'Exercices TD par IA
                </h3>
                <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 bg-white/20 rounded-md">
                  {resource.code}
                </span>
              </div>
              <p className="text-xs text-blue-100 mt-0.5">
                Créez des exercices personnalisés à partir d'une photo de feuille ou des cours eCampus
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            title="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {!generatedResult ? (
            <>
              {/* Source Selector: Photo vs eCampus */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                  <span>1. Choisissez la source des exercices</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Option A: Photo de feuille */}
                  <div
                    onClick={() => setSourceType("photo")}
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-3.5 ${
                      sourceType === "photo"
                        ? "border-indigo-600 bg-indigo-50/40 shadow-xs"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div
                      className={`p-2.5 rounded-xl shrink-0 ${
                        sourceType === "photo"
                          ? "bg-indigo-600 text-white shadow-2xs"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      <Camera className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        <span>Feuille en photo</span>
                        {sourceType === "photo" && (
                          <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-100 px-1.5 py-0.2 rounded">
                            Actif
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        Prenez en photo une feuille d'exercices, un polycopié ou des notes manuscrites. L'IA extrait et résout les exercices.
                      </p>
                    </div>
                  </div>

                  {/* Option B: eCampus / Moodle */}
                  <div
                    onClick={() => setSourceType("ecampus")}
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-3.5 ${
                      sourceType === "ecampus"
                        ? "border-blue-600 bg-blue-50/40 shadow-xs"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div
                      className={`p-2.5 rounded-xl shrink-0 ${
                        sourceType === "ecampus"
                          ? "bg-blue-600 text-white shadow-2xs"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      <FolderArchive className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        <span>Documents eCampus Moodle</span>
                        {sourceType === "ecampus" && (
                          <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-1.5 py-0.2 rounded">
                            Actif
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        Générez des exercices alignés sur les supports de cours, TPs ou diaporamas déposés par vos enseignants sur eCampus.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Source Details Panel */}
              {sourceType === "photo" ? (
                /* Photo Upload Area */
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">Photo de votre feuille :</span>
                    <span className="text-slate-400">Glissez-déposez ou collez (Ctrl+V)</span>
                  </div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    className="hidden"
                  />

                  {imagePreview ? (
                    <div className="border border-indigo-200 bg-indigo-50/30 rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-4">
                      <div className="w-32 h-32 rounded-xl border border-slate-200 bg-white overflow-hidden shrink-0 shadow-xs relative group">
                        <img
                          src={imagePreview}
                          alt="Aperçu feuille"
                          className="w-full h-full object-cover"
                        />
                        <a
                          href={imagePreview}
                          target="_blank"
                          rel="noreferrer"
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity text-xs font-semibold"
                        >
                          Agrandir
                        </a>
                      </div>

                      <div className="flex-1 min-w-0 space-y-1 text-center sm:text-left">
                        <div className="flex items-center justify-center sm:justify-start gap-2">
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {imageFileName || "feuille_td.jpg"}
                          </span>
                          <span className="text-[10px] font-mono bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded font-semibold">
                            {imageFileSize || "Image prête"}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          Photo chargée avec succès ! L'IA va analyser le texte, les schémas et les équations.
                        </p>
                        <div className="pt-2 flex items-center justify-center sm:justify-start gap-2">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                          >
                            Remplacer la photo
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setImagePreview(null);
                              setImageFileName(null);
                              setImageFileSize(null);
                            }}
                            className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(true);
                      }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                        dragOver
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                          : "border-slate-300 hover:border-indigo-400 bg-slate-50/60 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <Camera className="w-8 h-8 mx-auto mb-2 text-indigo-500" />
                      <p className="text-xs md:text-sm font-semibold text-slate-800">
                        Cliquez pour importer la photo d'une feuille de TD ou glissez-la ici
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Formats supportés : JPG, PNG, WebP (ou raccourci Ctrl+V direct)
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                /* eCampus Files Selection Area */
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-700">
                      Sélectionnez un document eCampus de {resource.code} :
                    </span>
                    <input
                      type="text"
                      placeholder="Filtrer TD, TP, PDF, CM..."
                      value={moodleSearch}
                      onChange={(e) => setMoodleSearch(e.target.value)}
                      className="px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 w-48"
                    />
                  </div>

                  {allMoodleFiles.length === 0 ? (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                      <span>
                        Aucun document eCampus synchronisé pour cette matière. L'IA utilisera le syllabus officiel de {resource.code}.
                      </span>
                    </div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-2 bg-slate-50/50">
                      {filteredMoodleFiles.slice(0, 15).map((f) => {
                        const isSelected = selectedMoodleFile?.url === f.url;
                        return (
                          <div
                            key={f.id}
                            onClick={() =>
                              setSelectedMoodleFile(
                                isSelected
                                  ? null
                                  : { name: f.name, url: f.url, sectionName: f.sectionName }
                              )
                            }
                            className={`p-2.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                              isSelected
                                ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                                : "bg-white text-slate-800 border-slate-200 hover:border-blue-300"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText
                                className={`w-4 h-4 shrink-0 ${
                                  isSelected ? "text-white" : "text-blue-600"
                                }`}
                              />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold truncate leading-tight">
                                  {f.name}
                                </p>
                                {f.sectionName && (
                                  <p
                                    className={`text-[10px] truncate mt-0.5 ${
                                      isSelected ? "text-blue-100" : "text-slate-400"
                                    }`}
                                  >
                                    Section : {f.sectionName}
                                  </p>
                                )}
                              </div>
                            </div>

                            {isSelected && (
                              <span className="text-[10px] font-bold px-2 py-0.5 bg-white/20 rounded-md shrink-0">
                                Sélectionné
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Customization & Parameters */}
              <div className="space-y-4 pt-2 border-t border-slate-100">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  2. Personnalisation des exercices
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Niveau de difficulté */}
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                      Difficulté :
                    </label>
                    <select
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="facile">🟢 Accessible / Entraînement fondamental</option>
                      <option value="moyen">🟡 Standard BUT R&T (Recommandé)</option>
                      <option value="difficile">🔴 Avancé / Examen & DS poussé</option>
                    </select>
                  </div>

                  {/* Nombre d'exercices */}
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                      Nombre d'exercices :
                    </label>
                    <select
                      value={exerciseCount}
                      onChange={(e) => setExerciseCount(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-blue-500"
                    >
                      <option value={1}>1 grand exercice guidé et complet</option>
                      <option value={2}>2 exercices progressifs</option>
                      <option value={3}>3 exercices variés</option>
                      <option value={5}>5 exercices d'entraînement rapides</option>
                    </select>
                  </div>

                  {/* Thème ou mot-clé spécifique */}
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                      Thème spécifique (optionnel) :
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Masques CIDR, Routage statique..."
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Checkboxes Options */}
                <div className="flex flex-wrap gap-4 pt-1">
                  <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeSolution}
                      onChange={(e) => setIncludeSolution(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                    <span>Inclure le corrigé détaillé pas-à-pas</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeGrading}
                      onChange={(e) => setIncludeGrading(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                    <span>Inclure un barème de points (/20)</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeHints}
                      onChange={(e) => setIncludeHints(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                    <span>Ajouter des indices pour chaque question</span>
                  </label>
                </div>

                {/* Additional instructions */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">
                    Consignes ou précisions additionnelles (optionnel) :
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Insiste sur le calcul binaire, mets des schémas de trames..."
                    value={additionalInstructions}
                    onChange={(e) => setAdditionalInstructions(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {generationError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{generationError}</span>
                </div>
              )}
            </>
          ) : (
            /* Generated Result View */
            <div className="space-y-4">
              {/* Top Banner Result */}
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-2xs">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-emerald-950">
                      Exercices de TD générés avec succès !
                    </h4>
                    <p className="text-xs text-emerald-700">
                      Titre : <span className="font-semibold">{generatedResult.title}</span> • Durée : {generatedResult.estimatedTime}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPreviewTab(previewTab === "rendered" ? "raw" : "rendered")}
                    className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    {previewTab === "rendered" ? <FileCode className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{previewTab === "rendered" ? "Code Markdown" : "Aperçu Formules"}</span>
                  </button>

                  <button
                    onClick={handleCopyMarkdown}
                    className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? "Copié !" : "Copier"}</span>
                  </button>
                </div>
              </div>

              {/* Preview Content */}
              <div className="border border-slate-200 rounded-2xl bg-white p-5 max-h-[52vh] overflow-y-auto">
                {previewTab === "rendered" ? (
                  <div className="prose prose-xs md:prose-sm max-w-none text-slate-800 leading-relaxed font-sans dark:prose-invert">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                      {generatedResult.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <textarea
                    readOnly
                    value={generatedResult.content}
                    className="w-full h-80 bg-slate-50 border border-slate-200 rounded-xl p-3 font-mono text-xs text-slate-800 focus:outline-hidden"
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
          {!generatedResult ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={isGenerating}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
              >
                Annuler
              </button>

              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating || (sourceType === "photo" && !imagePreview && !topic.trim())}
                className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md hover:shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin text-white" />
                    <span>Génération des exercices en cours...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Générer les exercices avec l'IA</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setGeneratedResult(null)}
                disabled={isSaving}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-medium transition-colors cursor-pointer"
              >
                ← Modifier les paramètres
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSaving}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                >
                  Fermer
                </button>

                <button
                  type="button"
                  onClick={handleSaveToTD}
                  disabled={isSaving}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? "Enregistrement..." : "Enregistrer dans mes TD"}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
