import React, { useState, useRef } from "react";
import { Asset } from "../types";
import { api } from "../services/api";
import {
  Upload,
  Image as ImageIcon,
  Check,
  Copy,
  Edit2,
  Trash2,
  ExternalLink,
  Plus,
  FileText,
  X,
} from "lucide-react";

interface ImageWorkspaceProps {
  noteId: string;
  assets: Asset[];
  onAssetsChanged: () => void;
  onInsertImageTag: (tag: string) => void;
  onSyncCaptionsInMarkdown?: () => void;
  onClose?: () => void;
}

export const ImageWorkspace: React.FC<ImageWorkspaceProps> = ({
  noteId,
  assets,
  onAssetsChanged,
  onInsertImageTag,
  onSyncCaptionsInMarkdown,
  onClose,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState("");
  const [copiedAssetId, setCopiedAssetId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) continue;
        const newAsset = await api.uploadImage(noteId, file);
        // Automatically insert newly uploaded image if single file
        if (files.length === 1) {
          onInsertImageTag(`![${newAsset.name}](asset://${newAsset.id})`);
        }
      }
      onAssetsChanged();
    } catch (err: any) {
      alert("Erreur lors de l''upload : " + err.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const startRename = (asset: Asset) => {
    setEditingAssetId(asset.id);
    setEditNameValue(asset.name);
  };

  const saveRename = async (assetId: string) => {
    if (!editNameValue.trim()) {
      setEditingAssetId(null);
      return;
    }
    try {
      await api.renameImage(assetId, editNameValue.trim());
      setEditingAssetId(null);
      onAssetsChanged();
    } catch (err: any) {
      alert("Erreur renommage : " + err.message);
    }
  };

  const deleteAsset = async (asset: Asset) => {
    if (!confirm(`Supprimer l'image "${asset.name}" ?`)) return;
    try {
      await api.deleteImage(asset.id);
      onAssetsChanged();
    } catch (err: any) {
      alert("Erreur suppression : " + err.message);
    }
  };

  const copyMarkdownTag = (asset: Asset) => {
    const tag = `![${asset.name}](asset://${asset.id})`;
    navigator.clipboard.writeText(tag);
    setCopiedAssetId(asset.id);
    setTimeout(() => setCopiedAssetId(null), 2000);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {onClose && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-30 md:hidden"
        />
      )}

      <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-80 md:w-80 bg-white border-l border-slate-200 flex flex-col h-full select-none text-slate-800 shadow-2xl md:static md:shadow-none">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-blue-600" />
            <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider">
              Médiathèque TP ({assets.length})
            </h3>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition-colors"
              title="Fermer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

      {/* Drop Zone */}
      <div className="p-3">
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => handleFileUpload(e.target.files)}
          multiple
          accept="image/*"
          className="hidden"
        />
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFileUpload(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
            dragOver
              ? "border-blue-500 bg-blue-50 text-blue-700"
              : "border-slate-300 hover:border-blue-400 bg-slate-50/60 text-slate-600 hover:text-slate-800"
          }`}
        >
          <Upload className="w-6 h-6 mx-auto mb-1.5 text-slate-400" />
          <p className="text-xs font-medium">Glissez vos images ou cliquez ici</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Coller direct (Ctrl+V) supporté</p>
        </div>
      </div>

      {/* Sync Caption Button (Optional helper) */}
      {assets.length > 0 && onSyncCaptionsInMarkdown && (
        <div className="px-3 pb-2">
          <button
            onClick={onSyncCaptionsInMarkdown}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 transition-colors font-medium"
            title="Met à jour le texte alt affiché dans le markdown pour correspondre aux nouveaux noms renommés"
          >
            <FileText className="w-3.5 h-3.5 text-cyan-600" />
            <span>Synchroniser les légendes Markdown</span>
          </button>
        </div>
      )}

      {/* Image list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {assets.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-xs">
            <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-30 text-slate-400" />
            Aucune image dans ce workspace TP.
          </div>
        ) : (
          assets.map((asset) => {
            const isEditing = editingAssetId === asset.id;
            const isCopied = copiedAssetId === asset.id;

            return (
              <div
                key={asset.id}
                className="bg-white border border-slate-200 rounded-xl p-2.5 space-y-2 group hover:border-slate-300 transition-colors"
              >
                {/* Top preview & info */}
                <div className="flex gap-2.5 items-start">
                  <div className="w-14 h-14 rounded-lg bg-slate-50 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center relative group/img">
                    <img
                      src={asset.url}
                      alt={asset.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <a
                      href={asset.url}
                      target="_blank"
                      rel="noreferrer"
                      className="absolute inset-0 bg-black/50 opacity-0 group-hover/img:opacity-100 flex items-center justify-center text-white transition-opacity"
                      title="Voir en taille réelle"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  {/* Name and ID */}
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="space-y-1">
                        <input
                          type="text"
                          value={editNameValue}
                          onChange={(e) => setEditNameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveRename(asset.id);
                            if (e.key === "Escape") setEditingAssetId(null);
                          }}
                          autoFocus
                          className="w-full bg-slate-50 border border-blue-500 rounded px-2 py-0.5 text-xs text-slate-800 focus:outline-none"
                        />
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => saveRename(asset.id)}
                            className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-medium"
                          >
                            Sauvegarder
                          </button>
                          <button
                            onClick={() => setEditingAssetId(null)}
                            className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px]"
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <span
                            onDoubleClick={() => startRename(asset)}
                            title="Double-cliquez pour renommer"
                            className="font-medium text-xs text-slate-900 truncate block cursor-pointer hover:text-blue-600 transition-colors"
                          >
                            {asset.name}
                          </span>
                          <button
                            onClick={() => startRename(asset)}
                            className="text-slate-400 hover:text-slate-600 p-0.5 transition-colors"
                            title="Renommer l'image (l'ID reste intact)"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-slate-500 font-mono">
                            {formatSize(asset.size)}
                          </span>
                          <span className="text-[9.5px] bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.2 rounded font-mono truncate max-w-[110px]">
                            ID: {asset.id}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom action buttons */}
                <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
                  <button
                    onClick={() =>
                      onInsertImageTag(`![${asset.name}](asset://${asset.id})`)
                    }
                    className="flex-1 flex items-center justify-center gap-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 py-1 px-2 rounded-lg text-[11px] font-medium transition-colors"
                    title="Insérer dans l'éditeur Markdown"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Insérer dans la note</span>
                  </button>

                  <button
                    onClick={() => copyMarkdownTag(asset)}
                    className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors"
                    title="Copier le tag Markdown"
                  >
                    {isCopied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <button
                    onClick={() => deleteAsset(asset)}
                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                    title="Supprimer l'image"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
    </>
  );
};
