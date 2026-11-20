import React, { useRef, useEffect, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link as LinkIcon,
  Paperclip,
  Sparkles,
  Send,
  Save,
  Loader2,
  X,
  FileText,
} from "lucide-react";
import { api } from "../services/api";
import { MailSendPayload } from "../types";

export interface ComposerAttachment {
  filename: string;
  contentBase64: string;
  contentType: string;
  size: number;
}

interface RichMailComposerProps {
  mode: "new" | "reply";
  to: string;
  cc?: string;
  subject: string;
  inReplyTo?: string;
  references?: string;
  incomingMail?: { from: string; subject: string; bodyText: string };
  contacts?: Array<{ name: string; email: string }>;
  studentName?: string;
  draftStorageKey?: string;
  onChangeTo?: (val: string) => void;
  onChangeCc?: (val: string) => void;
  onChangeSubject?: (val: string) => void;
  onScheduleSend: (payload: MailSendPayload) => void;
  onDraftSaved?: () => void;
  compact?: boolean;
}

export const RichMailComposer: React.FC<RichMailComposerProps> = ({
  mode,
  to,
  cc = "",
  subject,
  inReplyTo,
  references,
  incomingMail,
  contacts = [],
  studentName = "Étudiant BUT R&T",
  draftStorageKey,
  onChangeTo,
  onChangeCc,
  onChangeSubject,
  onScheduleSend,
  onDraftSaved,
  compact = false,
}) => {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftFeedback, setDraftFeedback] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [includeSignature, setIncludeSignature] = useState(true);

  const signatureHtml = `<br/><div style="margin-top:12px;padding-top:10px;border-top:1px solid #e2e8f0;color:#475569;font-size:12px;font-family:sans-serif;"><strong>${studentName}</strong><br/>BUT Réseaux &amp; Télécoms — IUT Grand Ouest Normandie (Unicaen)</div>`;

  // Restaurer brouillon localStorage si présent
  useEffect(() => {
    if (draftStorageKey && editorRef.current) {
      const saved = localStorage.getItem(draftStorageKey);
      if (saved && !editorRef.current.innerHTML.trim()) {
        editorRef.current.innerHTML = saved;
      }
    }
  }, [draftStorageKey]);

  const handleEditorInput = () => {
    if (draftStorageKey && editorRef.current) {
      localStorage.setItem(draftStorageKey, editorRef.current.innerHTML);
    }
  };

  const execFormat = (cmd: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
    handleEditorInput();
  };

  const handleInsertLink = () => {
    const url = prompt("URL du lien (https://...) :");
    if (url && /^https?:\/\//i.test(url)) {
      execFormat("createLink", url);
    }
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setAttachments((prev) => [
          ...prev,
          {
            filename: file.name,
            contentBase64: String(reader.result || ""),
            contentType: file.type || "application/octet-stream",
            size: file.size,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const handleAICompose = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const currentHtml = editorRef.current?.innerHTML || "";
      const res = await api.aiComposeMail({
        instruction: aiPrompt.trim(),
        mode: currentHtml.trim() ? "refine" : mode,
        currentHtml: currentHtml.trim() ? currentHtml : undefined,
        incomingMail,
        contacts,
      });

      if (mode === "new") {
        if (res.to && onChangeTo && !to.trim()) onChangeTo(res.to);
        if (res.subject && onChangeSubject && !subject.trim()) onChangeSubject(res.subject);
      }

      if (editorRef.current && res.bodyHtml) {
        editorRef.current.innerHTML = res.bodyHtml;
        handleEditorInput();
      }
      setAiPrompt("");
    } catch (e: any) {
      alert(e.message || "Erreur rédaction IA");
    } finally {
      setAiLoading(false);
    }
  };

  const buildPayload = (): MailSendPayload => {
    const rawHtml = editorRef.current?.innerHTML || "";
    const rawText = editorRef.current?.innerText || "";
    const finalHtml = includeSignature ? `${rawHtml}${signatureHtml}` : rawHtml;
    const finalText = includeSignature
      ? `${rawText}\n\n--\n${studentName}\nBUT Réseaux & Télécoms — IUT Grand Ouest Normandie (Unicaen)`
      : rawText;

    return {
      to,
      cc: cc || undefined,
      subject: subject || "(Sans objet)",
      bodyHtml: finalHtml,
      bodyText: finalText,
      inReplyTo,
      references,
      attachments: attachments.map((a) => ({
        filename: a.filename,
        contentBase64: a.contentBase64,
        contentType: a.contentType,
      })),
    };
  };

  const handleSaveImapDraft = async () => {
    setSavingDraft(true);
    setDraftFeedback(null);
    try {
      await api.saveMailDraft(buildPayload());
      setDraftFeedback("Brouillon enregistré !");
      setTimeout(() => setDraftFeedback(null), 3000);
      if (onDraftSaved) onDraftSaved();
    } catch (e: any) {
      alert(e.message || "Erreur sauvegarde brouillon");
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSendClick = () => {
    if (!to.trim()) {
      alert("Veuillez renseigner au moins un destinataire (À).");
      return;
    }
    const text = editorRef.current?.innerText?.trim() || "";
    if (!text && attachments.length === 0) {
      alert("Le corps du message est vide.");
      return;
    }
    const payload = buildPayload();
    if (draftStorageKey) localStorage.removeItem(draftStorageKey);
    if (editorRef.current) editorRef.current.innerHTML = "";
    setAttachments([]);
    onScheduleSend(payload);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
      {/* Barre IA inline */}
      <div className="px-3.5 py-2.5 bg-gradient-to-r from-indigo-50/70 to-blue-50/70 border-b border-slate-200 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
        <input
          type="text"
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAICompose();
            }
          }}
          placeholder={
            mode === "reply"
              ? "Décrivez votre réponse pour la rédiger avec l'IA (ex: demander un RDV jeudi matin)..."
              : "Décrivez votre message pour l'IA (ex: mail à M. Dien pour une absence en R101)..."
          }
          className="flex-1 bg-white border border-indigo-200/80 rounded-xl px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
        />
        <button
          type="button"
          onClick={handleAICompose}
          disabled={aiLoading || !aiPrompt.trim()}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 shrink-0 cursor-pointer"
        >
          {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          <span>Rédiger IA</span>
        </button>
      </div>

      {/* Barre de mise en forme */}
      <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => execFormat("bold")}
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg transition-colors"
            title="Gras"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => execFormat("italic")}
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg transition-colors"
            title="Italique"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => execFormat("underline")}
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg transition-colors"
            title="Souligné"
          >
            <Underline className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-4 bg-slate-200 mx-1" />
          <button
            type="button"
            onClick={() => execFormat("insertUnorderedList")}
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg transition-colors"
            title="Liste à puces"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => execFormat("insertOrderedList")}
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg transition-colors"
            title="Liste numérotée"
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleInsertLink}
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg transition-colors"
            title="Insérer un lien"
          >
            <LinkIcon className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-4 bg-slate-200 mx-1" />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFilePick}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-2 py-1 text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors"
            title="Joindre un fichier"
          >
            <Paperclip className="w-3.5 h-3.5" />
            <span>Joindre</span>
          </button>
        </div>

        <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
          <input
            type="checkbox"
            checked={includeSignature}
            onChange={(e) => setIncludeSignature(e.target.checked)}
            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span>Signature auto</span>
        </label>
      </div>

      {/* Zone d'édition contenteditable avec correcteur orthographique */}
      <div
        ref={editorRef}
        contentEditable
        spellCheck
        onInput={handleEditorInput}
        data-placeholder={mode === "reply" ? "Écrivez votre réponse ici..." : "Rédigez votre courriel..."}
        className={`w-full px-4 py-3 text-xs text-slate-800 leading-relaxed focus:outline-none overflow-y-auto prose prose-sm max-w-none empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 ${
          compact ? "min-h-[110px] max-h-[220px]" : "min-h-[180px] max-h-[320px]"
        }`}
      />

      {/* Signature preview */}
      {includeSignature && (
        <div className="px-4 py-2 bg-slate-50/50 border-t border-slate-100 text-[11px] text-slate-400">
          <span className="font-semibold text-slate-500">{studentName}</span> — BUT Réseaux &amp; Télécoms • IUT Grand Ouest Normandie
        </div>
      )}

      {/* Pièces jointes sélectionnées */}
      {attachments.length > 0 && (
        <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 flex items-center gap-2 flex-wrap">
          {attachments.map((att, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-700"
            >
              <FileText className="w-3 h-3 text-indigo-600" />
              <span className="truncate max-w-[140px]">{att.filename}</span>
              <span className="text-slate-400 font-mono">({Math.ceil(att.size / 1024)} Ko)</span>
              <button
                type="button"
                onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                className="text-slate-400 hover:text-rose-600"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Footer Actions */}
      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSaveImapDraft}
            disabled={savingDraft}
            className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {savingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>Brouillon</span>
          </button>
          {draftFeedback && (
            <span className="text-[11px] font-semibold text-emerald-700">{draftFeedback}</span>
          )}
        </div>

        <button
          type="button"
          onClick={handleSendClick}
          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Envoyer</span>
        </button>
      </div>
    </div>
  );
};
