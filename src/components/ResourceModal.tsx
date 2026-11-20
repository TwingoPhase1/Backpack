import React, { useState } from "react";
import { Resource } from "../types";
import { api } from "../services/api";
import { X, Plus, BookOpen, Sparkles } from "lucide-react";

interface ResourceModalProps {
  onClose: () => void;
  onResourceCreated: (resource: Resource) => void;
}

const PRESET_COLORS = [
  "#3b82f6", // Blue
  "#06b6d4", // Cyan
  "#818cf8", // Indigo
  "#a855f7", // Purple
  "#f472b6", // Pink
  "#ef4444", // Red
  "#fb923c", // Orange
  "#fbbf24", // Amber
  "#22c55e", // Green
  "#34d399", // Emerald
];

const PRESET_EMOJIS = ["🌐", "💻", "🔧", "⚡", "📡", "🖥️", "🐍", "🐧", "🌍", "🇬🇧", "🗣️", "🎯", "📈", "📋", "🛡️", "🔬", "💼", "🚀"];

export const ResourceModal: React.FC<ResourceModalProps> = ({ onClose, onResourceCreated }) => {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [semester, setSemester] = useState<1 | 2>(() => {
    const m = new Date().getMonth();
    return m >= 8 || m === 0 ? 1 : 2;
  });
  const [category, setCategory] = useState<"Ressource" | "SAE">("Ressource");
  const [emoji, setEmoji] = useState("📚");
  const [color, setColor] = useState("#3b82f6");
  const [teacher, setTeacher] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;

    setIsSubmitting(true);
    try {
      const created = await api.createResource({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        shortName: shortName.trim() || name.trim(),
        semester,
        category,
        emoji,
        color,
        teacher: teacher.trim() || undefined,
      });
      onResourceCreated(created);
      onClose();
    } catch (err: any) {
      alert("Erreur lors de la création : " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-200">
              <Plus className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm">Ajouter une Matière / Ressource</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Code (ex: R209)</label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="R209 ou SAE21"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Semestre</label>
              <select
                value={semester}
                onChange={(e) => setSemester(Number(e.target.value) as 1 | 2)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
              >
                <option value={1}>Semestre 1</option>
                <option value={2}>Semestre 2</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Intitulé Complet</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Initiation au développement Web"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nom Court (Sidebar)</label>
              <input
                type="text"
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                placeholder="Ex: Dev Web"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Catégorie</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
              >
                <option value="Ressource">Ressource (Cours)</option>
                <option value="SAE">SAÉ (Projet)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Enseignant Référent</label>
            <input
              type="text"
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
              placeholder="Ex: Christophe VALLOT"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
            />
          </div>

          {/* Emoji & Color */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Emoji & Couleur</label>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {PRESET_EMOJIS.slice(0, 12).map((em) => (
                <button
                  type="button"
                  key={em}
                  onClick={() => setEmoji(em)}
                  className={`w-7 h-7 rounded flex items-center justify-center text-sm transition-transform ${
                    emoji === em ? "bg-slate-100 scale-110 ring-2 ring-blue-600" : "hover:bg-slate-100"
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full transition-transform ${
                    color === c ? "scale-125 ring-2 ring-slate-800" : "hover:scale-110"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="p-4 bg-slate-50 -mx-5 -mb-5 border-t border-slate-200 flex justify-end gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              {isSubmitting ? "Création..." : "Ajouter la matière"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
