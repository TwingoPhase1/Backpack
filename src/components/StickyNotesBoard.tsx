import React, { useState, useEffect } from "react";
import { StickyNote, PostItColor, Resource } from "../types";
import { api } from "../services/api";
import {
  Pin,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Tag,
  StickyNote as StickyIcon,
  Filter,
} from "lucide-react";

interface StickyNotesBoardProps {
  resourceCode?: string; // Scoped to a specific resource if provided
  resources?: Resource[];
  onOpenResource?: (resourceCode: string) => void;
  compact?: boolean;
}

const COLOR_CLASSES: Record<
  PostItColor,
  {
    bg: string;
    border: string;
    text: string;
    badge: string;
    accent: string;
    dot: string;
  }
> = {
  yellow: {
    bg: "bg-amber-50",
    border: "border-amber-300/90",
    text: "text-amber-950",
    badge: "bg-amber-200/70 text-amber-900 border-amber-300",
    accent: "text-amber-700",
    dot: "bg-amber-400",
  },
  green: {
    bg: "bg-emerald-50",
    border: "border-emerald-300/90",
    text: "text-emerald-950",
    badge: "bg-emerald-200/70 text-emerald-900 border-emerald-300",
    accent: "text-emerald-700",
    dot: "bg-emerald-400",
  },
  blue: {
    bg: "bg-sky-50",
    border: "border-sky-300/90",
    text: "text-sky-950",
    badge: "bg-sky-200/70 text-sky-900 border-sky-300",
    accent: "text-sky-700",
    dot: "bg-sky-400",
  },
  pink: {
    bg: "bg-rose-50",
    border: "border-rose-300/90",
    text: "text-rose-950",
    badge: "bg-rose-200/70 text-rose-900 border-rose-300",
    accent: "text-rose-700",
    dot: "bg-rose-400",
  },
  orange: {
    bg: "bg-orange-50",
    border: "border-orange-300/90",
    text: "text-orange-950",
    badge: "bg-orange-200/70 text-orange-900 border-orange-300",
    accent: "text-orange-700",
    dot: "bg-orange-400",
  },
  purple: {
    bg: "bg-purple-50",
    border: "border-purple-300/90",
    text: "text-purple-950",
    badge: "bg-purple-200/70 text-purple-900 border-purple-300",
    accent: "text-purple-700",
    dot: "bg-purple-400",
  },
};

const AVAILABLE_COLORS: PostItColor[] = ["yellow", "green", "blue", "pink", "orange", "purple"];

export const StickyNotesBoard: React.FC<StickyNotesBoardProps> = ({
  resourceCode,
  resources = [],
  onOpenResource,
  compact = false,
}) => {
  const [stickyNotes, setStickyNotes] = useState<StickyNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<string>(resourceCode || "ALL");

  // New note form state
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newColor, setNewColor] = useState<PostItColor>("yellow");
  const [newResourceCode, setNewResourceCode] = useState<string>(resourceCode || "");
  const [newIsPinned, setNewIsPinned] = useState(false);

  // Edit note state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editColor, setEditColor] = useState<PostItColor>("yellow");
  const [editResourceCode, setEditResourceCode] = useState("");

  const fetchStickyNotes = async () => {
    try {
      setLoading(true);
      const res = await api.getStickyNotes(resourceCode ? resourceCode : undefined);
      setStickyNotes(res.stickyNotes || []);
    } catch (e) {
      console.error("Erreur chargement pense-bêtes", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStickyNotes();
  }, [resourceCode]);

  // Handle Create
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim() && !newTitle.trim()) return;

    try {
      const res = await api.createStickyNote({
        title: newTitle.trim(),
        content: newContent.trim(),
        color: newColor,
        resourceCode: resourceCode || newResourceCode || undefined,
        isPinned: newIsPinned,
      });

      setStickyNotes((prev) => [res.stickyNote, ...prev]);
      setNewTitle("");
      setNewContent("");
      setNewColor("yellow");
      setNewIsPinned(false);
      if (!resourceCode) setNewResourceCode("");
      setIsCreating(false);
    } catch (err: any) {
      alert("Erreur création post-it : " + err.message);
    }
  };

  // Handle Update
  const handleStartEdit = (note: StickyNote) => {
    setEditingId(note.id);
    setEditTitle(note.title || "");
    setEditContent(note.content);
    setEditColor(note.color);
    setEditResourceCode(note.resourceCode || "");
  };

  const handleSaveEdit = async (id: string) => {
    try {
      const res = await api.updateStickyNote(id, {
        title: editTitle.trim(),
        content: editContent.trim(),
        color: editColor,
        resourceCode: editResourceCode || undefined,
      });

      setStickyNotes((prev) => prev.map((n) => (n.id === id ? res.stickyNote : n)));
      setEditingId(null);
    } catch (err: any) {
      alert("Erreur modification post-it : " + err.message);
    }
  };

  // Toggle Pin
  const handleTogglePin = async (note: StickyNote) => {
    try {
      const updated = await api.updateStickyNote(note.id, {
        isPinned: !note.isPinned,
      });
      setStickyNotes((prev) =>
        prev
          .map((n) => (n.id === note.id ? updated.stickyNote : n))
          .sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          })
      );
    } catch (err: any) {
      console.error(err);
    }
  };

  // Delete
  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer définitivement ce pense-bête ?")) return;
    try {
      await api.deleteStickyNote(id);
      setStickyNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (err: any) {
      alert("Erreur suppression : " + err.message);
    }
  };

  // Filtering
  const displayedNotes = stickyNotes.filter((note) => {
    if (resourceCode) return true; // Already scoped
    if (selectedFilter === "ALL") return true;
    if (selectedFilter === "GENERAL") return !note.resourceCode;
    return note.resourceCode === selectedFilter;
  });

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center border border-amber-200">
            <StickyIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              Pense-bêtes & Post-it
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                {displayedNotes.length}
              </span>
            </h3>
            <p className="text-[11px] text-slate-500">
              {resourceCode
                ? `Pense-bêtes spécifiques à la ressource ${resourceCode}`
                : "Vos notes rapides, formules mémo et rappels immédiats"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter selector on global dashboard */}
          {!resourceCode && resources.length > 0 && (
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-500 ml-1" />
              <select
                value={selectedFilter}
                onChange={(e) => setSelectedFilter(e.target.value)}
                className="bg-transparent border-0 text-slate-700 font-medium focus:outline-none pr-1 py-0.5 text-xs cursor-pointer"
              >
                <option value="ALL">Tous les post-it</option>
                <option value="GENERAL">Général (sans matière)</option>
                <optgroup label="Par matière">
                  {resources.map((r) => (
                    <option key={r.id} value={r.code}>
                      {r.code} - {r.shortName || r.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          )}

          {/* New Post-it button */}
          {!isCreating && (
            <button
              onClick={() => setIsCreating(true)}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nouveau post-it</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick Creator Form */}
      {isCreating && (
        <form
          onSubmit={handleCreate}
          className="p-4 rounded-xl border border-amber-300 bg-amber-50/70 shadow-xs space-y-3 transition-all animate-fadeIn"
        >
          <div className="flex items-center justify-between gap-2 border-b border-amber-200/70 pb-2">
            <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
              <StickyIcon className="w-3.5 h-3.5 text-amber-600" />
              Rédiger un pense-bête
            </span>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="p-1 text-amber-700 hover:text-amber-950 rounded hover:bg-amber-200/50"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2">
            <input
              type="text"
              placeholder="Titre (ex: Formule de Nyquist, Penser au TP...)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-white border border-amber-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-400 font-semibold"
            />
            <textarea
              rows={3}
              placeholder="Texte du pense-bête, note rapide, commande..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white border border-amber-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-400 leading-relaxed resize-y"
              autoFocus
              required
            />
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
            {/* Color selection */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500 font-medium mr-1">Couleur :</span>
              {AVAILABLE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  className={`w-5 h-5 rounded-full border transition-transform ${
                    COLOR_CLASSES[c].dot
                  } ${
                    newColor === c
                      ? "ring-2 ring-slate-800 ring-offset-1 scale-110"
                      : "border-slate-300 hover:scale-105"
                  }`}
                  title={c}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              {/* Resource selection if not scoped */}
              {!resourceCode && (
                <select
                  value={newResourceCode}
                  onChange={(e) => setNewResourceCode(e.target.value)}
                  className="px-2 py-1 bg-white border border-amber-200 rounded-lg text-xs text-slate-700 focus:outline-none"
                >
                  <option value="">📌 Note générale</option>
                  {resources.map((r) => (
                    <option key={r.id} value={r.code}>
                      {r.code} ({r.shortName || r.name})
                    </option>
                  ))}
                </select>
              )}

              {/* Pin toggle */}
              <button
                type="button"
                onClick={() => setNewIsPinned(!newIsPinned)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center gap-1 transition-colors ${
                  newIsPinned
                    ? "bg-amber-200 border-amber-400 text-amber-900 font-bold"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
                title="Épingler en haut"
              >
                <Pin className="w-3 h-3" />
                <span>{newIsPinned ? "Épinglé" : "Épingler"}</span>
              </button>

              <button
                type="submit"
                className="px-3.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Épingler le post-it</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Grid of Post-its */}
      {displayedNotes.length === 0 ? (
        <div className="text-center py-8 bg-slate-50/70 rounded-xl border border-dashed border-slate-200 p-6">
          <StickyIcon className="w-8 h-8 mx-auto mb-2 text-slate-400" />
          <h4 className="text-xs font-bold text-slate-700">Aucun pense-bête pour le moment</h4>
          <p className="text-[11px] text-slate-500 max-w-sm mx-auto mt-0.5">
            {resourceCode
              ? `Ajoutez un pense-bête pour ${resourceCode} pour garder vos rappels et astuces sous la main.`
              : "Gardez vos mémo-techniques, rappels ou formules importants directement sur votre tableau."}
          </p>
          <button
            onClick={() => setIsCreating(true)}
            className="mt-3 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold shadow-xs transition-colors inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5 text-amber-600" />
            <span>Créer mon premier post-it</span>
          </button>
        </div>
      ) : (
        <div
          className={`grid gap-3.5 ${
            compact
              ? "grid-cols-1 md:grid-cols-2"
              : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          }`}
        >
          {displayedNotes.map((note) => {
            const isEditing = editingId === note.id;
            const style = COLOR_CLASSES[note.color] || COLOR_CLASSES.yellow;

            if (isEditing) {
              return (
                <div
                  key={note.id}
                  className={`p-4 rounded-xl border ${style.border} ${style.bg} shadow-sm space-y-2.5 flex flex-col justify-between`}
                >
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Titre..."
                      className="w-full px-2.5 py-1 text-xs bg-white border border-slate-300 rounded text-slate-900 font-bold focus:outline-none"
                    />
                    <textarea
                      rows={3}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full px-2.5 py-1 text-xs bg-white border border-slate-300 rounded text-slate-900 focus:outline-none resize-none leading-relaxed"
                    />
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-200/60">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        {AVAILABLE_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setEditColor(c)}
                            className={`w-4 h-4 rounded-full border ${COLOR_CLASSES[c].dot} ${
                              editColor === c ? "ring-2 ring-slate-800 scale-110" : ""
                            }`}
                          />
                        ))}
                      </div>
                      {!resourceCode && (
                        <select
                          value={editResourceCode}
                          onChange={(e) => setEditResourceCode(e.target.value)}
                          className="text-[10px] px-1 py-0.5 bg-white border rounded text-slate-700"
                        >
                          <option value="">Général</option>
                          {resources.map((r) => (
                            <option key={r.id} value={r.code}>
                              {r.code}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200/50 rounded"
                      >
                        Annuler
                      </button>
                      <button
                        onClick={() => handleSaveEdit(note.id)}
                        className="px-3 py-1 bg-slate-900 text-white rounded text-xs font-semibold hover:bg-slate-800"
                      >
                        Enregistrer
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={note.id}
                className={`p-4 rounded-xl border ${style.border} ${style.bg} shadow-xs hover:shadow-md transition-all flex flex-col justify-between group relative overflow-hidden`}
              >
                {/* Pin marker */}
                {note.isPinned && (
                  <div
                    className="absolute top-2 right-2 text-amber-600"
                    title="Post-it épinglé"
                  >
                    <Pin className="w-3.5 h-3.5 fill-current rotate-45" />
                  </div>
                )}

                <div>
                  {/* Top info: Resource tag & date */}
                  <div className="flex items-center justify-between gap-2 mb-2 pr-6">
                    {note.resourceCode ? (
                      <button
                        onClick={() => onOpenResource && onOpenResource(note.resourceCode!)}
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border transition-colors ${style.badge} hover:opacity-80`}
                        title="Voir la ressource"
                      >
                        {note.resourceCode}
                      </button>
                    ) : (
                      <span className="text-[10px] font-medium text-slate-500 italic">
                        Note générale
                      </span>
                    )}

                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(note.updatedAt).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>

                  {/* Title if present */}
                  {note.title && (
                    <h4 className={`text-xs font-bold ${style.text} mb-1.5 leading-snug`}>
                      {note.title}
                    </h4>
                  )}

                  {/* Content */}
                  <p
                    className={`text-xs ${style.text} leading-relaxed whitespace-pre-wrap font-sans break-words select-text`}
                  >
                    {note.content}
                  </p>
                </div>

                {/* Card footer actions */}
                <div className="mt-3 pt-2 border-t border-slate-200/50 flex items-center justify-between text-[11px] opacity-80 group-hover:opacity-100 transition-opacity">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleTogglePin(note)}
                      className={`p-1 rounded hover:bg-black/5 transition-colors ${
                        note.isPinned ? "text-amber-700 font-bold" : "text-slate-500"
                      }`}
                      title={note.isPinned ? "Détacher l'épingle" : "Épingler ce post-it"}
                    >
                      <Pin className={`w-3 h-3 ${note.isPinned ? "fill-current" : ""}`} />
                    </button>
                    <button
                      onClick={() => handleStartEdit(note)}
                      className="p-1 rounded hover:bg-black/5 text-slate-500 transition-colors"
                      title="Modifier ce post-it"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  </div>

                  <button
                    onClick={() => handleDelete(note.id)}
                    className="p-1 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-600 transition-colors"
                    title="Supprimer ce post-it"
                  >
                    <Trash2 className="w-3 h-3" />
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
