import React, { useState, useEffect, useMemo } from "react";
import { NextcloudItem, NextcloudStatus, Resource } from "../types";
import { api } from "../services/api";
import {
  Cloud,
  Folder,
  FolderOpen,
  FileText,
  FileCode,
  FileArchive,
  Image as ImageIcon,
  Download,
  ExternalLink,
  RefreshCw,
  Search,
  ChevronRight,
  ChevronLeft,
  Copy,
  Check,
  HardDrive,
  BookOpen,
  Laptop,
  ArrowUpRight,
  FileSpreadsheet,
  File,
  Sparkles,
} from "lucide-react";

interface NextcloudViewProps {
  resources: Resource[];
  onOpenResourceNote?: (resourceId: string, noteId: string) => void;
}

export const NextcloudView: React.FC<NextcloudViewProps> = ({
  resources,
  onOpenResourceNote,
}) => {
  const [currentPath, setCurrentPath] = useState<string>("/");
  const [items, setItems] = useState<NextcloudItem[]>([]);
  const [status, setStatus] = useState<NextcloudStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  // Import Modal state
  const [importingItem, setImportingItem] = useState<NextcloudItem | null>(null);
  const [selectedResourceId, setSelectedResourceId] = useState<string>(
    resources[0]?.id || ""
  );
  const [importType, setImportType] = useState<"CM" | "TP">("CM");
  const [importTitle, setImportTitle] = useState<string>("");
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const data = await api.getNextcloudStatus();
      setStatus(data);
    } catch (e) {
      console.error("Erreur statut UniCloud:", e);
    }
  };

  const fetchFiles = async (path: string, refresh = false) => {
    setLoading(true);
    try {
      const res = await api.getNextcloudFiles(path, refresh);
      setItems(res.items);
    } catch (e: any) {
      console.error("Erreur chargement fichiers UniCloud:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    fetchFiles(currentPath);
  }, [currentPath]);

  // Format bytes
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 o";
    const k = 1024;
    const sizes = ["o", "Ko", "Mo", "Go", "To"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  // Breadcrumbs segments
  const breadcrumbs = useMemo(() => {
    const parts = currentPath.split("/").filter(Boolean);
    const crumbs = [{ name: "UniCloud", path: "/" }];
    let acc = "";
    for (const p of parts) {
      acc += "/" + p;
      crumbs.push({ name: p, path: acc });
    }
    return crumbs;
  }, [currentPath]);

  const handleOpenFolder = (folderPath: string) => {
    setCurrentPath(folderPath);
    setSearchQuery("");
  };

  const handleNavigateUp = () => {
    if (currentPath === "/") return;
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    const parentPath = "/" + parts.join("/");
    setCurrentPath(parentPath === "" ? "/" : parentPath);
  };

  // Filtered items
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        (it.resourceCode && it.resourceCode.toLowerCase().includes(q))
    );
  }, [items, searchQuery]);

  const handleCopyMarkdownLink = (item: NextcloudItem) => {
    const url = api.getNextcloudDownloadUrl(item.path);
    const md = `[📄 ${item.name}](${url})`;
    navigator.clipboard.writeText(md);
    setCopiedPath(item.path);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  const handleOpenImportModal = (item: NextcloudItem) => {
    setImportingItem(item);
    const cleanTitle = item.name.replace(/\.(md|markdown|txt)$/i, "");
    setImportTitle(cleanTitle);

    // Auto-detect matching resource
    if (item.resourceCode) {
      const match = resources.find(
        (r) => r.code.toUpperCase() === item.resourceCode?.toUpperCase()
      );
      if (match) setSelectedResourceId(match.id);
    } else {
      setSelectedResourceId(resources[0]?.id || "");
    }

    // Guess type if in name
    if (/tp/i.test(item.name)) {
      setImportType("TP");
    } else {
      setImportType("CM");
    }
  };

  const handleConfirmImport = async () => {
    if (!importingItem || !selectedResourceId) return;
    setIsImporting(true);
    try {
      const newNote = await api.importNextcloudNote({
        remotePath: importingItem.path,
        resourceId: selectedResourceId,
        type: importType,
        title: importTitle || importingItem.name,
      });

      setImportSuccessMessage(
        `Note « ${newNote.title} » importée avec succès dans votre ressource !`
      );
      setTimeout(() => {
        setImportSuccessMessage(null);
        setImportingItem(null);
        if (onOpenResourceNote) {
          onOpenResourceNote(selectedResourceId, newNote.id);
        }
      }, 1200);
    } catch (e: any) {
      alert("Erreur lors de l'import : " + e.message);
    } finally {
      setIsImporting(false);
    }
  };

  // Icon helper
  const getItemIcon = (it: NextcloudItem) => {
    if (it.isDir) return <Folder className="w-5 h-5 text-blue-500 fill-blue-50" />;
    const ext = it.name.split(".").pop()?.toLowerCase() || "";
    if (ext === "pdf") return <FileText className="w-5 h-5 text-rose-500" />;
    if (["md", "markdown", "txt"].includes(ext))
      return <FileCode className="w-5 h-5 text-emerald-600" />;
    if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext))
      return <ImageIcon className="w-5 h-5 text-purple-500" />;
    if (["xlsx", "xls", "ods", "csv"].includes(ext))
      return <FileSpreadsheet className="w-5 h-5 text-emerald-600" />;
    if (["zip", "tar", "gz", "rar", "7z"].includes(ext))
      return <FileArchive className="w-5 h-5 text-amber-500" />;
    return <File className="w-5 h-5 text-slate-400" />;
  };

  const totalQuota = (status?.quotaUsed || 0) + (status?.quotaAvailable || 0);
  const quotaPercent =
    totalQuota > 0 ? ((status?.quotaUsed || 0) / totalQuota) * 100 : 0;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 text-slate-800">
      {/* Header Bar */}
      <div className="bg-white border-b border-slate-200 px-3.5 md:px-8 py-3 md:py-5 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3 md:gap-4">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-cyan-50 border border-cyan-200 flex items-center justify-center shrink-0">
              <Cloud className="w-5 h-5 md:w-6 md:h-6 text-cyan-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900">UniCloud IUT</h2>
                <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200">
                  Nextcloud Unicaen
                </span>
                {status?.connected && (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Connecté ({status.user})
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Accédez à vos documents, cours et TP stockés sur le cloud de l'université.
              </p>
            </div>
          </div>

          {/* Quota and Actions */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
            {status?.connected && (
              <div className="bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-xs flex flex-col justify-center min-w-[180px]">
                <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-slate-600 mb-1">
                  <span>Stockage</span>
                  <span className="font-semibold text-slate-800">
                    {formatBytes(status.quotaUsed || 0)} / {formatBytes(totalQuota)}
                  </span>
                </div>
                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-cyan-500 h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, quotaPercent)}%` }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={() => fetchFiles(currentPath, true)}
              disabled={loading}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl transition-colors disabled:opacity-50"
              title="Rafraîchir les fichiers"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>

            <a
              href="https://unicloud.unicaen.fr/"
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <span>UniCloud Web</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 flex flex-col overflow-hidden max-w-7xl mx-auto w-full p-2.5 sm:p-4 md:p-8">
        {/* Navigation Breadcrumbs & Search */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 mb-4 md:mb-6 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 md:gap-4 shrink-0 shadow-xs">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-medium py-1">
            {currentPath !== "/" && (
              <button
                onClick={handleNavigateUp}
                className="p-1.5 mr-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
                title="Dossier parent"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}

            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb.path}>
                {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
                <button
                  onClick={() => handleOpenFolder(crumb.path)}
                  className={`px-2 py-1 rounded-lg transition-colors truncate max-w-[160px] ${
                    idx === breadcrumbs.length - 1
                      ? "bg-slate-100 text-slate-900 font-bold"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
          </div>

          {/* Search Bar */}
          <div className="relative min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Rechercher un fichier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-cyan-500 transition-colors"
            />
          </div>
        </div>

        {/* Files and Folders Listing */}
        <div className="flex-1 bg-white border border-slate-200 rounded-2xl overflow-y-auto p-3 sm:p-6 shadow-xs">
          {loading ? (
            <div className="text-center py-20">
              <div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-xs text-slate-500">Chargement des fichiers UniCloud...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <Cloud className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <h4 className="text-sm font-semibold text-slate-700">Dossier vide ou aucun résultat</h4>
              <p className="text-xs text-slate-400 mt-1">
                {searchQuery ? "Aucun fichier ne correspond à votre recherche." : "Ce dossier ne contient aucun fichier."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium px-3 pb-2 border-b border-slate-100">
                <span>{filteredItems.length} élément{filteredItems.length > 1 ? "s" : ""}</span>
                <span className="font-mono text-[11px]">UniCloud WebDAV</span>
              </div>

              <div className="divide-y divide-slate-100">
                {filteredItems.map((item) => {
                  const isMd = /\.(md|markdown|txt)$/i.test(item.name);
                  const isCopied = copiedPath === item.path;

                  return (
                    <div
                      key={item.path}
                      className="py-3 px-3 hover:bg-slate-50 rounded-xl transition-colors flex items-center justify-between gap-4 group"
                    >
                      <div
                        onClick={() => item.isDir && handleOpenFolder(item.path)}
                        className={`flex items-center gap-3 min-w-0 flex-1 ${
                          item.isDir ? "cursor-pointer" : ""
                        }`}
                      >
                        <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 shrink-0 group-hover:bg-white transition-colors">
                          {getItemIcon(item)}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-sm font-semibold truncate ${
                                item.isDir
                                  ? "text-slate-900 group-hover:text-blue-600 font-bold"
                                  : "text-slate-800"
                              }`}
                            >
                              {item.name}
                            </span>

                            {item.resourceCode && (
                              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                                {item.resourceCode}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-0.5 font-mono">
                            {!item.isDir && <span>{formatBytes(item.size)}</span>}
                            {item.lastModified && (
                              <span>
                                {new Date(item.lastModified).toLocaleDateString("fr-FR")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Item Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {item.isDir ? (
                          <button
                            onClick={() => handleOpenFolder(item.path)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
                          >
                            <span>Ouvrir</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <>
                            {/* Import as Note button for Markdown */}
                            {isMd && (
                              <button
                                onClick={() => handleOpenImportModal(item)}
                                className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                                title="Importer comme note dans une matière"
                              >
                                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="hidden sm:inline">Importer note</span>
                              </button>
                            )}

                            {/* Copy Markdown tag */}
                            <button
                              onClick={() => handleCopyMarkdownLink(item)}
                              className={`p-1.5 rounded-lg border text-xs font-medium transition-colors ${
                                isCopied
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                  : "bg-white hover:bg-slate-100 text-slate-600 border-slate-200"
                              }`}
                              title="Copier le lien en Markdown"
                            >
                              {isCopied ? (
                                <Check className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>

                            {/* Download Button */}
                            <a
                              href={api.getNextcloudDownloadUrl(item.path)}
                              target="_blank"
                              rel="noreferrer"
                              download
                              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Télécharger</span>
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Import Modal */}
      {importingItem && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200">
                <FileCode className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Importer dans le Cartable
                </h3>
                <p className="text-xs text-slate-500">
                  Transformer ce fichier Markdown en séance de cours ou TP.
                </p>
              </div>
            </div>

            {importSuccessMessage ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{importSuccessMessage}</span>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                {/* File name preview */}
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl font-mono text-[11px] text-slate-600 truncate">
                  Fichier source : <strong>{importingItem.name}</strong>
                </div>

                {/* Resource Selector */}
                <div>
                  <label className="block text-slate-700 font-semibold mb-1.5">
                    Matière de destination :
                  </label>
                  <select
                    value={selectedResourceId}
                    onChange={(e) => setSelectedResourceId(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-cyan-500 font-medium"
                  >
                    {resources.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.emoji} {r.code} — {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Note Type */}
                <div>
                  <label className="block text-slate-700 font-semibold mb-1.5">
                    Type de note :
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setImportType("CM")}
                      className={`p-3 rounded-xl border font-semibold flex items-center justify-center gap-2 transition-colors ${
                        importType === "CM"
                          ? "bg-blue-50 text-blue-700 border-blue-300"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>Cahier de CM</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setImportType("TP")}
                      className={`p-3 rounded-xl border font-semibold flex items-center justify-center gap-2 transition-colors ${
                        importType === "TP"
                          ? "bg-cyan-50 text-cyan-700 border-cyan-300"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <Laptop className="w-4 h-4" />
                      <span>Espace TP</span>
                    </button>
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="block text-slate-700 font-semibold mb-1.5">
                    Titre de la note :
                  </label>
                  <input
                    type="text"
                    value={importTitle}
                    onChange={(e) => setImportTitle(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            )}

            {!importSuccessMessage && (
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  onClick={() => setImportingItem(null)}
                  disabled={isImporting}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={isImporting || !selectedResourceId}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isImporting ? "animate-spin" : ""}`} />
                  <span>{isImporting ? "Import en cours..." : "Créer la note"}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
