import React, { useState } from "react";
import { Note, Asset } from "../types";
import { api } from "../services/api";
import {
  FileDown,
  Printer,
  FileCode,
  Archive,
  X,
  ExternalLink,
  CheckCircle2,
  Cloud,
  Check,
  Sparkles,
} from "lucide-react";

interface ExportModalProps {
  note: Note;
  assets: Asset[];
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ note, assets, onClose }) => {
  const [exportingCloud, setExportingCloud] = useState(false);
  const [cloudSuccessMsg, setCloudSuccessMsg] = useState<string | null>(null);

  const handlePrintPdf = () => {
    onClose();
    setTimeout(() => {
      window.print();
    }, 200);
  };

  const handleExportNextcloud = async () => {
    setExportingCloud(true);
    try {
      const res = await api.exportNoteToNextcloud({ noteId: note.id, remoteDir: "/COURS_2026-2027" });
      setCloudSuccessMsg(`Sauvegardé sur UniCloud : ${res.path}`);
      setTimeout(() => {
        setCloudSuccessMsg(null);
      }, 3500);
    } catch (e: any) {
      alert("Erreur export UniCloud : " + e.message);
    } finally {
      setExportingCloud(false);
    }
  };

  const handleDownloadMarkdown = (mode: "url" | "relative") => {
    const url = api.getExportMarkdownUrl(note.id, mode);
    window.open(url, "_blank");
  };

  const handleDownloadZip = () => {
    const url = api.getExportZipUrl(note.id);
    window.open(url, "_blank");
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 shrink-0">
              <FileDown className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 text-sm">Exporter la note</h3>
              <p className="text-xs text-slate-500 truncate max-w-xs sm:max-w-sm">{note.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options */}
        <div className="p-3.5 sm:p-5 space-y-3">
          {/* PDF Export */}
          <div
            onClick={handlePrintPdf}
            className="p-4 rounded-xl bg-white border border-slate-200 hover:border-red-400 hover:bg-red-50/20 cursor-pointer transition-all group flex items-start gap-4"
          >
            <div className="p-2.5 rounded-lg bg-red-50 text-red-600 border border-red-200 shrink-0 group-hover:scale-105 transition-transform">
              <Printer className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm text-slate-900 group-hover:text-red-700 transition-colors">
                  Document PDF Académique
                </h4>
                <span className="text-[10px] bg-red-50 text-red-700 font-mono px-1.5 py-0.5 rounded border border-red-200">
                  PDF
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Mise en page d'impression A4 épurée avec formules KaTeX, tableaux, codes et images haute résolution (via Enregistrer en PDF du navigateur).
              </p>
            </div>
          </div>

          {/* Markdown Export with URLs */}
          <div
            onClick={() => handleDownloadMarkdown("url")}
            className="p-4 rounded-xl bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50/20 cursor-pointer transition-all group flex items-start gap-4"
          >
            <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 shrink-0 group-hover:scale-105 transition-transform">
              <FileCode className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm text-slate-900 group-hover:text-blue-700 transition-colors">
                  Fichier Markdown (.md)
                </h4>
                <span className="text-[10px] bg-blue-50 text-blue-700 font-mono px-1.5 py-0.5 rounded border border-blue-200">
                  .MD
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Les balises <code className="text-blue-700 font-mono bg-blue-50 px-1 py-0.5 rounded">asset://ID</code> sont automatiquement remplacées par les URLs directes des images.
              </p>
            </div>
          </div>

          {/* ZIP Bundle */}
          <div
            onClick={handleDownloadZip}
            className="p-4 rounded-xl bg-white border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/20 cursor-pointer transition-all group flex items-start gap-4"
          >
            <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 shrink-0 group-hover:scale-105 transition-transform">
              <Archive className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm text-slate-900 group-hover:text-emerald-700 transition-colors">
                  Archive Complète (.zip)
                </h4>
                <span className="text-[10px] bg-emerald-50 text-emerald-700 font-mono px-1.5 py-0.5 rounded border border-emerald-200">
                  ZIP
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Contient le fichier <code className="text-emerald-700 font-mono bg-emerald-50 px-1 py-0.5 rounded">.md</code> et un sous-dossier <code className="text-emerald-700 font-mono bg-emerald-50 px-1 py-0.5 rounded">images/</code> autonome avec toutes les captures d'écran ({assets.length} images).
              </p>
            </div>
          </div>

          {/* UniCloud Nextcloud Direct Save */}
          <div
            onClick={!exportingCloud ? handleExportNextcloud : undefined}
            className={`p-4 rounded-xl bg-white border border-slate-200 hover:border-cyan-400 hover:bg-cyan-50/20 cursor-pointer transition-all group flex items-start gap-4 ${
              exportingCloud ? "opacity-60 cursor-wait" : ""
            }`}
          >
            <div className="p-2.5 rounded-lg bg-cyan-50 text-cyan-600 border border-cyan-200 shrink-0 group-hover:scale-105 transition-transform">
              <Cloud className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm text-slate-900 group-hover:text-cyan-700 transition-colors">
                  Sauvegarder sur UniCloud IUT (Nextcloud)
                </h4>
                <span className="text-[10px] bg-cyan-50 text-cyan-700 font-mono px-1.5 py-0.5 rounded border border-cyan-200">
                  WebDAV
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Dépose automatiquement une copie Markdown de cette note dans votre dossier <code className="text-cyan-700 font-mono bg-cyan-50 px-1 py-0.5 rounded">/COURS_2026-2027/</code> sur votre espace UniCloud personnel.
              </p>
              {cloudSuccessMsg && (
                <div className="mt-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{cloudSuccessMsg}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
