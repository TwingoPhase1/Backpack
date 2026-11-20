import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Note, Asset } from "../types";
import { api } from "../services/api";
import {
  Bold,
  Italic,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Table as TableIcon,
  Eye,
  Edit3,
  Columns,
  Sparkles,
  Save,
  Sigma,
  Copy,
  Check,
  X,
  ChevronDown,
  RefreshCw,
  FileText,
  HelpCircle,
  Wand2,
} from "lucide-react";

interface NoteEditorProps {
  note: Note;
  assets: Asset[];
  onNoteUpdate: (updated: Partial<Note>) => void;
  onAssetsChanged: () => void;
  editorRefExpose?: (insertFn: (text: string) => void) => void;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  note,
  assets,
  onNoteUpdate,
  onAssetsChanged,
  editorRefExpose,
}) => {
  const [content, setContent] = useState(note.content);
  const [viewMode, setViewMode] = useState<"edit" | "split" | "preview">(() => {
    return typeof window !== "undefined" && window.innerWidth < 768 ? "edit" : "split";
  });
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<any>(null);

  // AI Assistant States
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiAction, setAiAction] = useState<string>("");
  const [aiError, setAiError] = useState<string | null>(null);
  const [copiedResult, setCopiedResult] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const handleAIAssist = async (action: "continue" | "explain" | "summarize" | "quiz" | "fix_markdown") => {
    setShowDropdown(false);
    setShowAIAssistant(true);
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    setAiAction(action);

    const textarea = textareaRef.current;
    const selection = textarea ? textarea.value.substring(textarea.selectionStart, textarea.selectionEnd) : "";
    const targetText = selection.trim() || content.trim();

    try {
      const res = await api.documentAssistAI(action, targetText, note.resourceId, note.title);
      setAiResult(res.result);
    } catch (err: any) {
      setAiError(err.message || "Erreur lors de l'appel à l'IA.");
    } finally {
      setAiLoading(false);
    }
  };

  const insertAIResult = (mode: "append" | "replace") => {
    if (!aiResult) return;
    const textarea = textareaRef.current;
    if (mode === "replace" && textarea && textarea.selectionStart !== textarea.selectionEnd) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newContent = content.substring(0, start) + aiResult + content.substring(end);
      setContent(newContent);
      triggerAutoSave(newContent);
    } else {
      const newContent = content.trim() ? `${content}\n\n${aiResult}\n` : aiResult;
      setContent(newContent);
      triggerAutoSave(newContent);
    }
    setShowAIAssistant(false);
  };

  // Sync content when note changes
  useEffect(() => {
    setContent(note.content);
  }, [note.id]);

  // Insert helper function
  const insertText = (before: string, after = "") => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);

    const replacement = `${before}${selected}${after}`;
    const newContent = text.substring(0, start) + replacement + text.substring(end);

    setContent(newContent);
    triggerAutoSave(newContent);

    // Reposition cursor
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, end + before.length);
    }, 0);
  };

  // Expose insert function to parent for image insertions from workspace
  useEffect(() => {
    if (editorRefExpose) {
      editorRefExpose((tag: string) => {
        insertText(`\n${tag}\n`);
      });
    }
  }, [editorRefExpose]);

  // Debounced auto-save
  const triggerAutoSave = (newContent: string) => {
    setIsSaving(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await api.updateNote(note.id, { content: newContent });
        onNoteUpdate({ content: newContent });
        setLastSaved(new Date());
      } catch (err) {
        console.error("Auto-save error", err);
      } finally {
        setIsSaving(false);
      }
    }, 800);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    triggerAutoSave(val);
  };

  // Direct paste image handler (Ctrl+V)
  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (!file) continue;

        setIsSaving(true);
        try {
          const newAsset = await api.uploadImage(note.id, file);
          insertText(`\n![${newAsset.name}](asset://${newAsset.id})\n`);
          onAssetsChanged();
        } catch (err: any) {
          alert("Erreur collage d''image : " + err.message);
        } finally {
          setIsSaving(false);
        }
        break;
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white overflow-hidden text-slate-800">
      {/* Formatting & Mode Toolbar */}
      <div className="bg-white border-b border-slate-200 px-2 md:px-4 py-1.5 flex items-center justify-between gap-2 shrink-0 no-print">
        {/* Formatting tools with horizontal scroll on mobile */}
        <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar py-0.5 shrink min-w-0">
          <button
            onClick={() => insertText("**", "**")}
            className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors shrink-0"
            title="Gras (**texte**)"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            onClick={() => insertText("*", "*")}
            className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors shrink-0"
            title="Italique (*texte*)"
          >
            <Italic className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-slate-200 mx-1 shrink-0" />
          <button
            onClick={() => insertText("# ")}
            className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors shrink-0"
            title="Titre 1"
          >
            <Heading1 className="w-4 h-4" />
          </button>
          <button
            onClick={() => insertText("## ")}
            className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors shrink-0"
            title="Titre 2"
          >
            <Heading2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => insertText("### ")}
            className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors shrink-0"
            title="Titre 3"
          >
            <Heading3 className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-slate-200 mx-1 shrink-0" />
          <button
            onClick={() => insertText("\n```bash\n", "\n```\n")}
            className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors shrink-0"
            title="Bloc de code"
          >
            <Code className="w-4 h-4" />
          </button>
          <button
            onClick={() => insertText("\n$$\n", "\n$$\n")}
            className="p-1.5 rounded hover:bg-slate-100 text-emerald-600 hover:text-emerald-700 transition-colors shrink-0"
            title="Formule Mathématiques LaTeX ($$...$$)"
          >
            <Sigma className="w-4 h-4 text-emerald-600" />
          </button>
          <button
            onClick={() => insertText("- ")}
            className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors shrink-0"
            title="Liste à puces"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => insertText("- [ ] ")}
            className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors shrink-0"
            title="Tâche / Checklist"
          >
            <CheckSquare className="w-4 h-4" />
          </button>
          <button
            onClick={() => insertText("> ")}
            className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors shrink-0"
            title="Citation"
          >
            <Quote className="w-4 h-4" />
          </button>
          <button
            onClick={() =>
              insertText(
                "\n| Colonne 1 | Colonne 2 |\n|---|---|\n| Valeur 1 | Valeur 2 |\n"
              )
            }
            className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors shrink-0"
            title="Tableau"
          >
            <TableIcon className="w-4 h-4" />
          </button>
        </div>

        {/* View mode toggle, AI Assistant & save indicator */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Assistant IA Dropdown */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="px-2.5 py-1 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 text-blue-700 rounded-lg text-xs font-semibold border border-blue-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Assistant IA pour ce cours"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">Assistant IA</span>
              <ChevronDown className="w-3 h-3 text-blue-500" />
            </button>

            {showDropdown && (
              <div className="absolute right-0 mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-30 py-1 text-xs animate-in fade-in zoom-in-95">
                <div className="px-3 py-1.5 border-b border-slate-100 text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">
                  Aide Rédactionnelle IA
                </div>
                <button
                  onClick={() => handleAIAssist("continue")}
                  className="w-full px-3 py-2 text-left hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 text-slate-700 transition-colors cursor-pointer"
                >
                  <Wand2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Continuer la rédaction</span>
                </button>
                <button
                  onClick={() => handleAIAssist("explain")}
                  className="w-full px-3 py-2 text-left hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 text-slate-700 transition-colors cursor-pointer"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-amber-500" />
                  <span>Expliquer ce passage</span>
                </button>
                <button
                  onClick={() => handleAIAssist("summarize")}
                  className="w-full px-3 py-2 text-left hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 text-slate-700 transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-purple-600" />
                  <span>Fiche de révision &amp; résumé</span>
                </button>
                <button
                  onClick={() => handleAIAssist("quiz")}
                  className="w-full px-3 py-2 text-left hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 text-slate-700 transition-colors cursor-pointer"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Générer un quiz QCM</span>
                </button>
                <button
                  onClick={() => handleAIAssist("fix_markdown")}
                  className="w-full px-3 py-2 text-left hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 text-slate-700 transition-colors cursor-pointer border-t border-slate-100"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Mettre en forme &amp; corriger</span>
                </button>
              </div>
            )}
          </div>
          <div className="text-[11px] text-slate-500 font-medium hidden sm:block">
            {isSaving ? (
              <span className="text-amber-600 animate-pulse flex items-center gap-1">
                <Save className="w-3 h-3" />
                Enregistrement...
              </span>
            ) : lastSaved ? (
              <span className="text-slate-500">
                {lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            ) : null}
          </div>

          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={() => setViewMode("edit")}
              className={`p-1.5 rounded-md text-xs transition-colors ${
                viewMode === "edit"
                  ? "bg-white text-slate-900 font-semibold border border-slate-200/80 shadow-none"
                  : "text-slate-500 hover:text-slate-800"
              }`}
              title="Éditeur uniquement"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode("split")}
              className={`p-1.5 rounded-md text-xs transition-colors hidden md:inline-flex ${
                viewMode === "split"
                  ? "bg-white text-slate-900 font-semibold border border-slate-200/80 shadow-none"
                  : "text-slate-500 hover:text-slate-800"
              }`}
              title="Vue partagée (Édition + Aperçu)"
            >
              <Columns className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode("preview")}
              className={`p-1.5 rounded-md text-xs transition-colors ${
                viewMode === "preview"
                  ? "bg-white text-slate-900 font-semibold border border-slate-200/80 shadow-none"
                  : "text-slate-500 hover:text-slate-800"
              }`}
              title="Aperçu rendu seul"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Editor & Preview Split Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor Area */}
        {(viewMode === "edit" || viewMode === "split") && (
          <div className="flex-1 h-full flex flex-col no-print">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleContentChange}
              onPaste={handlePaste}
              placeholder="Rédigez votre prise de cours en Markdown... Collez vos captures d'écran directement ici (Ctrl+V) !"
              className="flex-1 w-full bg-slate-50/50 text-slate-800 p-3 md:p-6 font-mono text-xs md:text-sm leading-relaxed resize-none focus:outline-none focus:bg-white selection:bg-blue-100"
            />
          </div>
        )}

        {/* Live Preview Area */}
        {(viewMode === "preview" || viewMode === "split") && (
          <div
            className={`flex-1 h-full overflow-y-auto p-4 md:p-8 bg-white ${
              viewMode === "split" ? "border-l border-slate-200" : ""
            } print-content`}
          >
            <div className="max-w-3xl mx-auto space-y-4">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  // Custom Image Resolver for asset://<id>
                  img: ({ node, src, alt, ...props }) => {
                    let finalSrc = src || "";
                    let caption = alt || "";

                    if (src && src.startsWith("asset://")) {
                      const assetId = src.replace("asset://", "");
                      const found = assets.find((a) => a.id === assetId);
                      finalSrc = `/api/images/${assetId}`;
                      if (found) {
                        caption = found.name; // Always reflect current workspace name!
                      }
                    }

                    return (
                      <figure className="my-6 block group">
                        <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50 p-1">
                          <img
                            src={finalSrc}
                            alt={caption}
                            className="w-full max-h-[550px] object-contain rounded-lg mx-auto"
                            {...props}
                          />
                        </div>
                        {caption && (
                          <figcaption className="text-center text-xs text-slate-500 mt-2 font-mono flex items-center justify-center gap-1.5">
                            <span>📷</span>
                            <span>{caption}</span>
                          </figcaption>
                        )}
                      </figure>
                    );
                  },
                  h1: ({ children }) => (
                    <h1 className="text-2xl font-bold text-slate-900 border-b border-slate-200 pb-2 mt-6 mb-4">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-xl font-semibold text-slate-800 border-b border-slate-100 pb-1.5 mt-6 mb-3">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-base font-semibold text-slate-800 mt-4 mb-2">
                      {children}
                    </h3>
                  ),
                  p: ({ children }) => (
                    <p className="text-slate-700 leading-relaxed my-2 text-sm">{children}</p>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-blue-500 pl-4 py-1.5 my-3 text-slate-700 italic bg-blue-50/60 rounded-r">
                      {children}
                    </blockquote>
                  ),
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-4 border border-slate-200 rounded-lg">
                      <table className="min-w-full divide-y divide-slate-200 text-xs">
                        {children}
                      </table>
                    </div>
                  ),
                  thead: ({ children }) => <thead className="bg-slate-50">{children}</thead>,
                  th: ({ children }) => (
                    <th className="px-3 py-2 text-left font-semibold text-slate-700 border-b border-slate-200">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="px-3 py-2 text-slate-700 border-b border-slate-100 font-mono">
                      {children}
                    </td>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc list-inside space-y-1 my-2 text-sm text-slate-700">
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal list-inside space-y-1 my-2 text-sm text-slate-700">
                      {children}
                    </ol>
                  ),
                  code: ({ inline, className, children, ...props }: any) => {
                    return inline ? (
                      <code
                        className="bg-slate-100 text-blue-700 px-1.5 py-0.5 rounded text-xs font-mono border border-slate-200"
                        {...props}
                      >
                        {children}
                      </code>
                    ) : (
                      <pre className="bg-slate-100 p-4 rounded-xl border border-slate-200 overflow-x-auto my-3 text-xs font-mono text-slate-800">
                        <code>{children}</code>
                      </pre>
                    );
                  },
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>

      {/* AI Assistant Output Dialog */}
      {showAIAssistant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95">
            {/* Dialog Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    {aiAction === "continue"
                      ? "Continuer la rédaction"
                      : aiAction === "explain"
                      ? "Explication pédagogique"
                      : aiAction === "summarize"
                      ? "Fiche de révision & Résumé"
                      : aiAction === "quiz"
                      ? "Quiz interactif de révision"
                      : "Mise en forme & Correction"}
                  </h4>
                  <p className="text-[11px] text-slate-500">Généré par votre modèle d'IA pour ce cours</p>
                </div>
              </div>
              <button
                onClick={() => setShowAIAssistant(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Dialog Body */}
            <div className="p-5 max-h-[60vh] overflow-y-auto">
              {aiLoading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-500">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                  <span className="text-xs font-medium">L'IA rédige votre contenu...</span>
                </div>
              ) : aiError ? (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                  <strong>Erreur :</strong> {aiError}
                </div>
              ) : aiResult ? (
                <div className="prose prose-xs max-w-none text-slate-800 bg-slate-50 p-4 rounded-xl border border-slate-200 font-sans leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {aiResult}
                  </ReactMarkdown>
                </div>
              ) : null}
            </div>

            {/* Dialog Footer */}
            {aiResult && !aiLoading && (
              <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(aiResult);
                    setCopiedResult(true);
                    setTimeout(() => setCopiedResult(false), 2000);
                  }}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  {copiedResult ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedResult ? "Copié !" : "Copier"}</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => insertAIResult("replace")}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                  >
                    Remplacer la sélection
                  </button>
                  <button
                    type="button"
                    onClick={() => insertAIResult("append")}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Insérer dans la note</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
