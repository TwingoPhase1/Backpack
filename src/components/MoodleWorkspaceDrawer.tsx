import React, { useState } from "react";
import { MoodleCourse, MoodleFile } from "../types";
import {
  FolderArchive,
  Search,
  FileText,
  Download,
  Copy,
  Check,
  Plus,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";

interface MoodleWorkspaceDrawerProps {
  course: MoodleCourse | null;
  loading: boolean;
  resourceCode: string;
  onInsertLink: (markdownText: string) => void;
  onSyncMoodle?: () => void;
  isSyncing?: boolean;
  onClose?: () => void;
}

export const MoodleWorkspaceDrawer: React.FC<MoodleWorkspaceDrawerProps> = ({
  course,
  loading,
  resourceCode,
  onInsertLink,
  onSyncMoodle,
  isSyncing,
  onClose,
}) => {
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [insertedId, setInsertedId] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (sectionId: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const handleCopy = (file: MoodleFile) => {
    const md = `[📄 ${file.name}](${file.url})`;
    navigator.clipboard.writeText(md);
    setCopiedId(file.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleInsert = (file: MoodleFile) => {
    // Generate an authenticated download / direct link markdown
    const md = `[📄 ${file.name}](${file.url}) `;
    onInsertLink(md);
    setInsertedId(file.id);
    setTimeout(() => setInsertedId(null), 1800);
  };

  // Collect all files
  const allFiles =
    course?.sections.flatMap((s) =>
      s.modules.flatMap((m) =>
        m.files.map((f) => ({
          ...f,
          sectionName: s.name,
          moduleType: m.type,
        }))
      )
    ) || [];

  const filteredFiles = search.trim()
    ? allFiles.filter(
        (f) =>
          f.name.toLowerCase().includes(search.toLowerCase()) ||
          f.sectionName.toLowerCase().includes(search.toLowerCase())
      )
    : null;

  return (
    <>
      {/* Mobile Backdrop */}
      {onClose && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-30 md:hidden"
        />
      )}

      <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-96 md:w-96 bg-white border-l border-slate-200 flex flex-col h-full shrink-0 shadow-2xl md:static md:shadow-xs">
        {/* Drawer Header */}
        <div className="p-3.5 border-b border-slate-200 bg-slate-50/50 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
                <FolderArchive className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs font-bold text-slate-900">Supports Moodle</h4>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {resourceCode}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">
                  {allFiles.length} document{allFiles.length > 1 ? "s" : ""} synchronisé{allFiles.length > 1 ? "s" : ""}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {onSyncMoodle && (
                <button
                  onClick={onSyncMoodle}
                  disabled={isSyncing}
                  className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg border border-slate-200 transition-colors disabled:opacity-50"
                  title="Rafraîchir depuis Moodle E-Campus"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-emerald-600" : ""}`} />
                </button>
              )}
              {onClose && (
                <button
                  onClick={onClose}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                  title="Fermer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

        {/* Search input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Filtrer CM, TP, PDF, devoirs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>
      </div>

      {/* Drawer Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full mx-auto mb-2" />
            <p className="text-xs text-slate-500">Chargement de l'espace Moodle...</p>
          </div>
        ) : !course ? (
          <div className="text-center py-10 px-4">
            <FolderArchive className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="text-xs font-semibold text-slate-700">Aucun espace Moodle associé</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Aucun cours Moodle ne matche actuellement la ressource <span className="font-mono">{resourceCode}</span>.
            </p>
            <a
              href="https://ecampus-vert.unicaen.fr/my/"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium border border-slate-200 transition-colors"
            >
              <span>Ouvrir E-Campus</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        ) : filteredFiles !== null ? (
          /* Search results list */
          <div className="space-y-2">
            <p className="text-[11px] text-slate-500 font-semibold px-1">
              Résultats ({filteredFiles.length})
            </p>
            {filteredFiles.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">Aucun document ne correspond.</p>
            ) : (
              filteredFiles.map((file) => (
                <FileRow
                  key={file.id}
                  file={file}
                  onInsert={() => handleInsert(file)}
                  onCopy={() => handleCopy(file)}
                  isInserted={insertedId === file.id}
                  isCopied={copiedId === file.id}
                />
              ))
            )}
          </div>
        ) : (
          /* Sections list */
          course.sections
            .filter((s) => s.modules.some((m) => m.files.length > 0))
            .map((sec) => {
              const isCollapsed = collapsedSections[sec.id];
              const secFiles = sec.modules.flatMap((m) => m.files);

              return (
                <div key={sec.id} className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/40">
                  <button
                    onClick={() => toggleSection(sec.id)}
                    className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-slate-100/70 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isCollapsed ? (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                      <span className="text-xs font-bold text-slate-800 truncate">{sec.name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0 ml-2">
                      {secFiles.length}
                    </span>
                  </button>

                  {!isCollapsed && (
                    <div className="p-2 pt-0 space-y-1 bg-white border-t border-slate-100">
                      {secFiles.map((file) => (
                        <FileRow
                          key={file.id}
                          file={file}
                          onInsert={() => handleInsert(file)}
                          onCopy={() => handleCopy(file)}
                          isInserted={insertedId === file.id}
                          isCopied={copiedId === file.id}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
        )}
      </div>

      {/* Drawer Footer tip */}
      <div className="p-2.5 border-t border-slate-200 bg-slate-50/70 text-[11px] text-slate-500 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-slate-600">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>Cliquez <b>+ Insérer</b> pour injecter le lien dans la note.</span>
        </span>
      </div>
    </div>
    </>
  );
};

interface FileRowProps {
  file: MoodleFile & { sectionName?: string };
  onInsert: () => void;
  onCopy: () => void;
  isInserted: boolean;
  isCopied: boolean;
}

const FileRow: React.FC<FileRowProps> = ({ file, onInsert, onCopy, isInserted, isCopied }) => {
  return (
    <div className="group p-2 rounded-lg border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition-all flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-800 truncate group-hover:text-emerald-950 transition-colors">
            {file.name}
          </p>
          {file.sectionName && (
            <p className="text-[10px] text-slate-400 truncate">{file.sectionName}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {/* Insert in Note */}
        <button
          onClick={onInsert}
          className={`p-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1 ${
            isInserted
              ? "bg-emerald-600 text-white"
              : "bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-800"
          }`}
          title="Insérer le lien dans le texte de la note"
        >
          {isInserted ? (
            <>
              <Check className="w-3 h-3" />
              <span className="text-[10px]">Inséré</span>
            </>
          ) : (
            <>
              <Plus className="w-3 h-3" />
              <span className="text-[10px]">Insérer</span>
            </>
          )}
        </button>

        {/* Copy Link */}
        <button
          onClick={onCopy}
          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
          title="Copier le lien Markdown"
        >
          {isCopied ? (
            <Check className="w-3 h-3 text-emerald-600" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
        </button>

        {/* Download directly */}
        <a
          href={`/api/moodle/download?url=${encodeURIComponent(file.url)}`}
          target="_blank"
          rel="noreferrer"
          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
          title="Télécharger / Ouvrir le fichier"
        >
          <Download className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
};
