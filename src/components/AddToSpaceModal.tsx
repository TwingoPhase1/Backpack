import React, { useEffect, useState } from "react";
import { X, FolderPlus, Loader2, CheckCircle2 } from "lucide-react";
import { Resource } from "../types";
import { api } from "../services/api";

interface AddToSpaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  fileUrl: string;
  sourceLabel: "Moodle" | "UniCloud";
  defaultResourceCode?: string;
  onSuccess?: (resourceId: string, type: "CM" | "TP" | "TD") => void;
}

export const AddToSpaceModal: React.FC<AddToSpaceModalProps> = ({
  isOpen,
  onClose,
  fileName,
  fileUrl,
  sourceLabel,
  defaultResourceCode,
  onSuccess,
}) => {
  const [resources, setResources] = useState<Resource[]>([]);
  const [resourceId, setResourceId] = useState("");
  const [noteType, setNoteType] = useState<"CM" | "TP" | "TD">("CM");
  const [title, setTitle] = useState(fileName);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(fileName);
    setSavedOk(false);
    setError(null);

    const upper = fileName.toUpperCase();
    if (upper.includes("TP")) setNoteType("TP");
    else if (upper.includes("TD")) setNoteType("TD");
    else setNoteType("CM");

    api
      .getResources()
      .then((list) => {
        setResources(list);
        if (defaultResourceCode) {
          const matched = list.find(
            (r) =>
              r.code.toUpperCase() === defaultResourceCode.toUpperCase() ||
              r.id.toUpperCase() === defaultResourceCode.toUpperCase()
          );
          if (matched) {
            setResourceId(matched.id);
            return;
          }
        }
        if (list.length > 0) setResourceId(list[0].id);
      })
      .catch(() => {});
  }, [isOpen, fileName, defaultResourceCode]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resourceId || !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const content = `# ${title.trim()}\n\n> Document ajouté depuis **${sourceLabel}**\n\n- [📄 Ouvrir le fichier](${fileUrl})\n`;
      await api.createNote({
        resourceId,
        type: noteType,
        title: title.trim(),
        content,
      });
      setSavedOk(true);
      onSuccess?.(resourceId, noteType);
      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err: any) {
      setError(err.message || "Impossible d'ajouter ce document.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <form
        onSubmit={handleSave}
        className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center">
              <FolderPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Ajouter à mon espace</h3>
              <p className="text-[11px] text-slate-500">Classer dans un cours, un TP ou un TD</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Matière</label>
            <select
              value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-500"
            >
              {resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} — {r.shortName || r.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Emplacement</label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: "CM", label: "Cours (CM)" },
                  { id: "TP", label: "TP" },
                  { id: "TD", label: "TD" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setNoteType(opt.id)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                    noteType === opt.id
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Titre</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
            />
          </div>

          {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
          {savedOk && (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>Ajouté à votre espace !</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={saving || !resourceId}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>Ajouter</span>
          </button>
        </div>
      </form>
    </div>
  );
};
