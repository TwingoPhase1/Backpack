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
  HelpCircle,
  Image as ImageIcon,
  Flame,
} from "lucide-react";
import { Resource, MoodleCourse, QCMQuiz, QCMGenerationParams } from "../types";
import { api } from "../services/api";

interface QCMGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  resource: Resource;
  moodleCourse?: MoodleCourse | null;
  onQuizCreated: (quiz: QCMQuiz) => void;
}

export const QCMGeneratorModal: React.FC<QCMGeneratorModalProps> = ({
  isOpen,
  onClose,
  resource,
  moodleCourse,
  onQuizCreated,
}) => {
  const [sourceType, setSourceType] = useState<"photo" | "ecampus" | "topic">("topic");

  // Photo
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // eCampus
  const [selectedDocUrl, setSelectedDocUrl] = useState<string | null>(null);
  const [selectedDocName, setSelectedDocName] = useState<string | null>(null);

  // Settings
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<"facile" | "moyen" | "difficile">("moyen");
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [additionalInstructions, setAdditionalInstructions] = useState("");

  // Loading & error
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Handle Ctrl+V paste for images
  useEffect(() => {
    if (!isOpen) return;
    const handlePaste = (e: ClipboardEvent) => {
      if (e.clipboardData && e.clipboardData.files.length > 0) {
        const file = e.clipboardData.files[0];
        if (file.type.startsWith("image/")) {
          processImageFile(file);
          setSourceType("photo");
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [isOpen]);

  if (!isOpen) return null;

  const processImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setErrorMsg("Veuillez sélectionner un fichier image valide (PNG, JPEG, WebP).");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setPhotoDataUrl(result);
      setPhotoName(file.name);
      setErrorMsg(null);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processImageFile(e.dataTransfer.files[0]);
    }
  };

  // Extraire la liste des fichiers Moodle disponibles pour cette ressource
  const moodleFiles = moodleCourse
    ? moodleCourse.sections.flatMap((sec) =>
        sec.modules
          .filter((m) => m.files && m.files.length > 0)
          .flatMap((m) =>
            m.files.map((f) => ({
              sectionName: sec.name,
              moduleName: m.name,
              fileName: f.name,
              fileUrl: f.url,
            }))
          )
      )
    : [];

  const handleGenerate = async () => {
    setErrorMsg(null);
    setIsGenerating(true);

    try {
      const payload: QCMGenerationParams = {
        resourceCode: resource.code,
        resourceName: resource.name,
        sourceType,
        image: sourceType === "photo" && photoDataUrl ? photoDataUrl : undefined,
        documentName: sourceType === "ecampus" ? selectedDocName || undefined : undefined,
        topic: topic.trim() || undefined,
        difficulty,
        questionCount,
        additionalInstructions: additionalInstructions.trim() || undefined,
      };

      const result = await api.generateQCM(payload);
      if (result.quiz) {
        // Enregistrer automatiquement le QCM dans la base
        const saved = await api.createQCM(result.quiz);
        onQuizCreated(saved);
        onClose();
      } else {
        throw new Error("Format de QCM inattendu renvoyé par le serveur.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Erreur lors de la génération du QCM");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs select-none">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-gradient-to-r from-indigo-50/50 via-white to-violet-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Générateur de QCM interactif avec l'IA
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {resource.code} — {resource.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Source Selection Tabs */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Source d'inspiration du QCM
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSourceType("topic")}
                className={`p-3 rounded-xl border-2 text-xs font-bold flex flex-col items-center gap-1.5 transition-all ${
                  sourceType === "topic"
                    ? "border-indigo-600 bg-indigo-50/50 text-indigo-700 shadow-2xs"
                    : "border-slate-200 hover:border-slate-300 text-slate-600 bg-white"
                }`}
              >
                <HelpCircle className="w-4 h-4" />
                <span>Thème de cours</span>
              </button>

              <button
                type="button"
                onClick={() => setSourceType("photo")}
                className={`p-3 rounded-xl border-2 text-xs font-bold flex flex-col items-center gap-1.5 transition-all ${
                  sourceType === "photo"
                    ? "border-indigo-600 bg-indigo-50/50 text-indigo-700 shadow-2xs"
                    : "border-slate-200 hover:border-slate-300 text-slate-600 bg-white"
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>Photo / Feuille</span>
              </button>

              <button
                type="button"
                onClick={() => setSourceType("ecampus")}
                className={`p-3 rounded-xl border-2 text-xs font-bold flex flex-col items-center gap-1.5 transition-all ${
                  sourceType === "ecampus"
                    ? "border-indigo-600 bg-indigo-50/50 text-indigo-700 shadow-2xs"
                    : "border-slate-200 hover:border-slate-300 text-slate-600 bg-white"
                }`}
              >
                <FolderArchive className="w-4 h-4" />
                <span>Document eCampus</span>
              </button>
            </div>
          </div>

          {/* Photo source area */}
          {sourceType === "photo" && (
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                Photo ou scan de la feuille / énoncé
              </label>
              {photoDataUrl ? (
                <div className="relative border border-slate-200 rounded-xl p-3 bg-slate-50 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={photoDataUrl}
                      alt="Aperçu"
                      className="w-14 h-14 object-cover rounded-lg border border-slate-300 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-800 truncate">
                        {photoName || "Photo importée"}
                      </div>
                      <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Prête pour l'analyse IA
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setPhotoDataUrl(null);
                      setPhotoName(null);
                    }}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
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
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                    dragOver
                      ? "border-indigo-500 bg-indigo-50/50"
                      : "border-slate-300 hover:border-indigo-400 bg-slate-50/40"
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        processImageFile(e.target.files[0]);
                      }
                    }}
                    accept="image/*"
                    className="hidden"
                  />
                  <ImageIcon className="w-8 h-8 text-indigo-500 mx-auto mb-2" />
                  <div className="text-xs font-bold text-slate-700">
                    Glissez une photo de feuille ou cliquez pour parcourir
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Astuce : vous pouvez aussi coller directement avec <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono">Ctrl+V</kbd>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* eCampus source area */}
          {sourceType === "ecampus" && (
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                Sélectionner un support de cours eCampus Moodle
              </label>
              {moodleFiles.length === 0 ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 text-center">
                  Aucun document PDF synchronisé sur eCampus pour cette matière.
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-2 bg-slate-50/50">
                  {moodleFiles.map((f, i) => {
                    const isSelected = selectedDocUrl === f.fileUrl;
                    return (
                      <div
                        key={i}
                        onClick={() => {
                          setSelectedDocUrl(f.fileUrl);
                          setSelectedDocName(f.fileName);
                        }}
                        className={`p-2 rounded-lg border text-xs flex items-center justify-between gap-2 cursor-pointer transition-all ${
                          isSelected
                            ? "border-indigo-600 bg-indigo-50/70 text-indigo-950 font-semibold"
                            : "border-slate-200 bg-white hover:border-slate-300 text-slate-700"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span className="truncate">{f.fileName}</span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Topic / Chapter Field */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Thème / Chapitre ciblé (optionnel)
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Ex: Masques et découpage VLSM, Modèle OSI, Routage OSPF..."
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Difficulty & Count Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Difficulté
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as any)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-medium"
              >
                <option value="facile">Accessible / Fondamentaux</option>
                <option value="moyen">Standard BUT R&T</option>
                <option value="difficile">Niveau Examen & DS</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Nombre de questions
              </label>
              <select
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-medium"
              >
                <option value={3}>3 questions (Flash)</option>
                <option value={5}>5 questions (Standard)</option>
                <option value={10}>10 questions (Complet)</option>
                <option value={15}>15 questions (Intensif)</option>
              </select>
            </div>
          </div>

          {/* Instructions libres */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Consignes spécifiques (optionnel)
            </label>
            <input
              type="text"
              value={additionalInstructions}
              onChange={(e) => setAdditionalInstructions(e.target.value)}
              placeholder="Ex: Insister sur les pièges fréquents, inclure des calculs binaires..."
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Annuler
          </button>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                <span>Génération du QCM par l'IA...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Générer et lancer le QCM ({questionCount} questions)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
