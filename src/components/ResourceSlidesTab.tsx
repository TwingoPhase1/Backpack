import React, { useState, useEffect, useRef } from "react";
import {
  Presentation,
  Plus,
  Download,
  Upload,
  Save,
  Maximize2,
  Minimize2,
  Sparkles,
  Trash2,
  RefreshCw,
  Check,
  AlertCircle,
  X,
  ChevronLeft,
  Calendar,
  Layers,
  FileCode,
} from "lucide-react";
import { Resource, SlideDeckItem, BentoDoc } from "../types";
import { api } from "../services/api";

interface ResourceSlidesTabProps {
  resource: Resource;
  createTrigger?: number;
}

export const ResourceSlidesTab: React.FC<ResourceSlidesTabProps> = ({
  resource,
  createTrigger,
}) => {
  const [decks, setDecks] = useState<SlideDeckItem[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeDeck = decks.find((d) => d.id === selectedDeckId) || null;

  // Load decks for this resource
  const loadDecks = async () => {
    try {
      setLoading(true);
      const list = await api.getSlideDecks(resource.code);
      setDecks(list);
    } catch (err) {
      console.error("Erreur chargement diaporamas ressource:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDecks();
    setSelectedDeckId(null);
    const handleSlidesUpdated = () => loadDecks();
    window.addEventListener("cartable:slides-updated", handleSlidesUpdated);
    return () => window.removeEventListener("cartable:slides-updated", handleSlidesUpdated);
  }, [resource.code]);

  // Open create modal if triggered from header
  useEffect(() => {
    if (createTrigger && createTrigger > 0) {
      setShowCreateModal(true);
    }
  }, [createTrigger]);

  // Listen to messages from Bento iframe bridge
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (!event.data || typeof event.data !== "object") return;
      const { type, doc } = event.data;

      if (type === "BENTO_READY") {
        if (activeDeck && activeDeck.doc && iframeRef.current?.contentWindow) {
          const payloadStr =
            typeof activeDeck.doc === "string"
              ? activeDeck.doc
              : JSON.stringify(activeDeck.doc);
          iframeRef.current.contentWindow.postMessage(
            { type: "BENTO_LOAD_DOC", payload: payloadStr },
            "*"
          );
        }
      } else if (type === "BENTO_DOC_CONTENT") {
        if (activeDeck && doc) {
          try {
            setSaving(true);
            const updated = await api.updateSlideDeck(activeDeck.id, {
              doc,
              slideCount: doc.slides?.length || activeDeck.slideCount,
              title: doc.title || activeDeck.title,
            });
            setDecks((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2500);
          } catch (err) {
            console.error("Erreur sauvegarde auto diaporama:", err);
          } finally {
            setSaving(false);
          }
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [activeDeck]);

  // Send deck to iframe when opening an activeDeck
  useEffect(() => {
    if (activeDeck && activeDeck.doc && iframeRef.current?.contentWindow) {
      const payloadStr =
        typeof activeDeck.doc === "string"
          ? activeDeck.doc
          : JSON.stringify(activeDeck.doc);
      iframeRef.current.contentWindow.postMessage(
        { type: "BENTO_LOAD_DOC", payload: payloadStr },
        "*"
      );
    }
  }, [selectedDeckId]);

  // Save current active deck
  const handleSaveDeck = () => {
    if (iframeRef.current?.contentWindow) {
      setSaving(true);
      iframeRef.current.contentWindow.postMessage({ type: "BENTO_GET_DOC" }, "*");
      setTimeout(() => setSaving(false), 2500);
    }
  };

  // Create a new empty deck
  const handleCreateDeck = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim() || `Diaporama ${decks.length + 1} — ${resource.code}`;

    try {
      setSaving(true);
      const created = await api.createSlideDeck({
        title,
        resourceCode: resource.code,
        description: `Présentation pour ${resource.code}`,
      });
      setDecks((prev) => [created, ...prev]);
      setSelectedDeckId(created.id);
      setShowCreateModal(false);
      setNewTitle("");
    } catch (err) {
      console.error("Erreur création diaporama:", err);
    } finally {
      setSaving(false);
    }
  };

  // Delete deck
  const handleDeleteDeck = async (deckId: string, deckTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Supprimer le diaporama "${deckTitle}" ?`)) return;

    try {
      setLoading(true);
      await api.deleteSlideDeck(deckId);
      setDecks((prev) => prev.filter((d) => d.id !== deckId));
      if (selectedDeckId === deckId) {
        setSelectedDeckId(null);
      }
    } catch (err) {
      console.error("Erreur suppression diaporama:", err);
    } finally {
      setLoading(false);
    }
  };

  // Import local file
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      try {
        let importedDoc: BentoDoc | null = null;
        if (file.name.endsWith(".json")) {
          importedDoc = JSON.parse(content);
        } else {
          const tag = '<script type="application/bento+json" id="bento-doc">';
          const sIdx = content.indexOf(tag);
          if (sIdx !== -1) {
            const eIdx = content.indexOf("</script>", sIdx);
            if (eIdx !== -1) {
              importedDoc = JSON.parse(content.slice(sIdx + tag.length, eIdx).trim());
            }
          }
        }

        if (!importedDoc || !importedDoc.slides) {
          alert("Le fichier ne contient pas un diaporama Bento valide.");
          return;
        }

        // Guarantee format property
        importedDoc.format = "bento/slides";

        const title =
          importedDoc.title || file.name.replace(/\.bento\.html$|\.html$|\.json$/, "");
        const created = await api.createSlideDeck({
          title,
          resourceCode: resource.code,
          doc: importedDoc,
        });

        setDecks((prev) => [created, ...prev]);
        setSelectedDeckId(created.id);
      } catch (err) {
        console.error("Erreur import Bento:", err);
        alert("Impossible de lire ce fichier.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Generate slides with AI for this resource
  const handleGenerateAI = async () => {
    if (!aiPrompt.trim()) return;
    try {
      setAiGenerating(true);
      setAiError(null);

      const response = await api.chatAI([
        {
          role: "user",
          content: `Tu es le moteur de génération de diaporamas Bento pour la matière "${resource.code} - ${resource.name}".
Génère une présentation au format JSON strict conforme au schéma "bento/slides" version 1.
Sujet demandé : "${aiPrompt}".
Ressource : ${resource.code} (${resource.name}).
Directives impératives :
- format: "bento/slides", size: { width: 1280, height: 720 }, version: 1.
- Theme: font "Inter", background "#0f172a", color "#f8fafc", accent "#3b82f6".
- Génère 2 à 3 slides structurées (slide de titre avec cartouche, slide de contenu/architecture avec cartes).
- Réponds UNIQUEMENT avec un objet JSON valide, sans texte additionnel.`,
        },
      ]);

      let rawJson = response.message?.content || "";
      const jsonMatch = rawJson.match(/\{([\s\S]*)\}/);
      if (jsonMatch) rawJson = jsonMatch[0];

      const generatedDoc: BentoDoc = JSON.parse(rawJson);
      if (!generatedDoc.slides || generatedDoc.slides.length === 0) {
        throw new Error("L'IA n'a pas retourné de diapositives valides.");
      }

      generatedDoc.format = "bento/slides";

      const title = generatedDoc.title || `${resource.code} — ${aiPrompt.slice(0, 30)}`;
      const created = await api.createSlideDeck({
        title,
        resourceCode: resource.code,
        doc: generatedDoc,
      });

      setDecks((prev) => [created, ...prev]);
      setSelectedDeckId(created.id);
      setShowAIModal(false);
      setAiPrompt("");
    } catch (err: any) {
      console.error("Erreur génération IA:", err);
      setAiError(err.message || "Erreur lors de la génération.");
    } finally {
      setAiGenerating(false);
    }
  };

  // 1. EDITING / VIEWING A SPECIFIC DECK
  if (selectedDeckId && activeDeck) {
    return (
      <div
        className={`flex flex-col bg-slate-950 text-slate-100 overflow-hidden ${
          fullscreen ? "fixed inset-0 z-50 h-screen w-screen" : "h-[750px] rounded-2xl border border-slate-800 my-4 shadow-sm"
        }`}
      >
        {/* Compact Bar with Back Button */}
        <div className="bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => {
                handleSaveDeck();
                setSelectedDeckId(null);
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors shrink-0"
              title="Retourner à la liste des diaporamas"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Diaporamas</span>
            </button>

            <span className="text-slate-600">/</span>

            <span className="text-xs font-bold text-white truncate max-w-[200px] sm:max-w-[320px]">
              {activeDeck.title}
            </span>

            <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
              {activeDeck.slideCount || 1} slide{(activeDeck.slideCount || 1) > 1 ? "s" : ""}
            </span>
          </div>

          {/* Action Tools */}
          <div className="flex items-center gap-2 shrink-0">
            {/* AI Generator */}
            <button
              onClick={() => setShowAIModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 transition-colors"
              title="Générer des diapositives avec l'IA"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span className="hidden md:inline">Générer IA</span>
            </button>

            {/* Save Button */}
            <button
              onClick={handleSaveDeck}
              disabled={saving}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                saveSuccess
                  ? "bg-emerald-600 text-white border-emerald-500"
                  : "bg-blue-600 hover:bg-blue-500 text-white border-blue-500"
              }`}
              title="Sauvegarder les modifications"
            >
              {saveSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 text-white" />
                  <span>Enregistré</span>
                </>
              ) : (
                <>
                  <Save className={`w-3.5 h-3.5 ${saving ? "animate-spin" : ""}`} />
                  <span>{saving ? "Sauvegarde..." : "Sauvegarder"}</span>
                </>
              )}
            </button>

            {/* Download Standalone .bento.html */}
            <a
              href={api.getSlideDownloadUrl(activeDeck.id)}
              download
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
              title="Télécharger le fichier .bento.html autonome (100% hors-ligne)"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden lg:inline">Télécharger .bento.html</span>
            </a>

            {/* Fullscreen Toggle */}
            <button
              onClick={() => setFullscreen(!fullscreen)}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              title={fullscreen ? "Quitter le plein écran" : "Plein écran"}
            >
              {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Embedded Bento Player/Editor */}
        <div className="flex-1 relative w-full h-full bg-[#0a0f1d] overflow-hidden">
          <iframe
            ref={iframeRef}
            src="/bento/bento_slides_template.html"
            title="Bento Slides"
            className="w-full h-full border-0"
            allow="fullscreen; clipboard-read; clipboard-write"
          />
        </div>

        {/* Modal: AI Generator */}
        {showAIModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
              <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <h3 className="text-sm font-semibold text-white">
                    Générer des diapositives avec l'IA ({resource.code})
                  </h3>
                </div>
                <button
                  onClick={() => setShowAIModal(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Indiquez le sujet de votre présentation pour {resource.code} ({resource.name}).
                </p>

                <textarea
                  rows={4}
                  placeholder="Ex: Soutenance sur la configuration des VLANs et du protocole 802.1Q..."
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none"
                />

                {aiError && (
                  <div className="p-3 rounded-lg bg-rose-900/30 border border-rose-700/50 flex items-center gap-2 text-xs text-rose-200">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{aiError}</span>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAIModal(false)}
                    disabled={aiGenerating}
                    className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateAI}
                    disabled={aiGenerating || !aiPrompt.trim()}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-md transition-all disabled:opacity-50"
                  >
                    {aiGenerating ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Génération...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>Générer les diapositives</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 2. GALLERY OF CARDS (Multiple presentations per course)
  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Presentation className="w-4 h-4 text-purple-600" />
            Diaporamas &amp; Présentations ({decks.length})
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Présentations interactives Bento autonomes pour vos soutenances, TPs et exposés de {resource.code}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Import button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition-colors"
            title="Importer un fichier .bento.html ou .json"
          >
            <Upload className="w-3.5 h-3.5 text-slate-500" />
            <span>Importer</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,.bento.html,.json"
            onChange={handleImportFile}
            className="hidden"
          />

          {/* Create new presentation button */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Créer un diaporama</span>
          </button>
        </div>
      </div>

      {/* Cards List or Empty State */}
      {loading ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl p-6">
          <RefreshCw className="w-8 h-8 mx-auto mb-3 text-purple-600 animate-spin" />
          <p className="text-xs text-slate-500">Chargement des diaporamas...</p>
        </div>
      ) : decks.length === 0 ? (
        <div className="text-center py-16 bg-white border border-dashed border-slate-300 rounded-2xl p-6">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-purple-50 border border-purple-200 flex items-center justify-center">
            <Presentation className="w-7 h-7 text-purple-600" />
          </div>
          <h4 className="text-slate-900 font-bold text-sm">Aucun diaporama pour {resource.code}</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Créez un diaporama Bento vide pour préparer une soutenance orale, un compte-rendu de TP ou un exposé.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Créer un diaporama</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {decks.map((deck) => {
            const dateStr = deck.updatedAt
              ? new Date(deck.updatedAt).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
              : "Récemment";

            return (
              <div
                key={deck.id}
                onClick={() => setSelectedDeckId(deck.id)}
                className="p-5 bg-white border border-slate-200 rounded-2xl hover:border-purple-300 hover:shadow-md cursor-pointer transition-all flex flex-col justify-between group relative"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200/80 flex items-center justify-center text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors shrink-0">
                      <Presentation className="w-5 h-5" />
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                        {deck.slideCount || 1} diapo{(deck.slideCount || 1) > 1 ? "s" : ""}
                      </span>

                      {/* Delete button */}
                      <button
                        onClick={(e) => handleDeleteDeck(deck.id, deck.title, e)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                        title="Supprimer ce diaporama"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <h4 className="font-bold text-slate-900 text-sm mb-1 group-hover:text-purple-600 transition-colors line-clamp-1">
                    {deck.title}
                  </h4>

                  {deck.description && (
                    <p className="text-xs text-slate-500 line-clamp-2 mb-3">
                      {deck.description}
                    </p>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 mt-3">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>{dateStr}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={api.getSlideDownloadUrl(deck.id)}
                      download
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="Télécharger .bento.html"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>

                    <span className="font-semibold text-purple-600 group-hover:translate-x-0.5 transition-transform inline-flex items-center gap-0.5">
                      Ouvrir &rarr;
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create new presentation */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Presentation className="w-4 h-4 text-purple-600" />
                <h4 className="text-sm font-bold text-slate-900">
                  Créer un diaporama pour {resource.code}
                </h4>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateDeck} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Titre du diaporama *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder={`Ex: Soutenance SAÉ — ${resource.name}`}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-purple-500"
                />
              </div>

              <p className="text-[11px] text-slate-500">
                Le diaporama sera créé vierge avec le thème sombre du Cartable Numérique, prêt à être édité ou présenté.
              </p>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-600 hover:text-slate-900"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving || !newTitle.trim()}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white transition-colors shadow-xs"
                >
                  Créer le diaporama
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
