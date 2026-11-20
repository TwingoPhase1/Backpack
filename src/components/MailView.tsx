import React, { useState, useEffect, useMemo, useRef } from "react";
import { MailMessage, MailDetail, Resource, MailSendPayload, AuthorizedSender } from "../types";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { RichMailComposer } from "./RichMailComposer";
import {
  Mail,
  MailOpen,
  Inbox,
  Paperclip,
  Download,
  Search,
  RefreshCw,
  ExternalLink,
  Clock,
  Copy,
  Check,
  FileText,
  ArrowLeft,
  Sparkles,
  GraduationCap,
  BookOpen,
  Plus,
  Eye,
  EyeOff,
  Send,
  FileEdit,
  Trash2,
  Zap,
  Flame,
  X,
  Undo2,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Loader2,
  UserPlus,
  ShieldCheck,
  Video,
  Calendar,
} from "lucide-react";

interface MailViewProps {
  resources: Resource[];
  initialSelectedId?: string;
  onOpenResource?: (resourceCode: string, preferredType?: "CM" | "TP" | "GRADES" | "MOODLE", noteId?: string) => void;
}

type ImapFolder = "INBOX" | "Sent" | "Drafts" | "Trash";
type SmartFilter = "all" | "resources" | "grades" | "attachments" | "ai_action" | "ai_priority";

/**
 * Sanitise le HTML d'un courriel entrant pour prévenir toute injection XSS.
 */
function sanitizeMailHtml(rawHtml: string): string {
  if (!rawHtml) return "";
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, "text/html");
    const blockedTags = ["script", "iframe", "object", "embed", "form", "meta", "base"];
    blockedTags.forEach((tag) => {
      doc.querySelectorAll(tag).forEach((el) => el.remove());
    });
    doc.querySelectorAll("*").forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        const val = attr.value.trim().toLowerCase();
        if (name.startsWith("on") || ((name === "href" || name === "src") && val.startsWith("javascript:"))) {
          el.removeAttribute(attr.name);
        }
      });
    });
    return doc.body.innerHTML;
  } catch {
    return rawHtml.replace(/<script[\s\S]*?<\/script>/gi, "");
  }
}

export const MailView: React.FC<MailViewProps> = ({
  resources,
  initialSelectedId,
  onOpenResource,
}) => {
  const { user } = useAuth();
  const [imapFolder, setImapFolder] = useState<ImapFolder>("INBOX");
  const [smartFilter, setSmartFilter] = useState<SmartFilter>("all");
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId || null);
  const [selectedDetail, setSelectedDetail] = useState<MailDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterUnreadOnly, setFilterUnreadOnly] = useState<boolean>(false);
  const [selectedTagResource, setSelectedTagResource] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [copiedBody, setCopiedBody] = useState<boolean>(false);
  const [bodyViewMode, setBodyViewMode] = useState<"html" | "text">("html");
  const [creatingNote, setCreatingNote] = useState<boolean>(false);
  const [noteCreatedFeedback, setNoteCreatedFeedback] = useState<string | null>(null);

  // AI Triage & Summary states
  const [triaging, setTriaging] = useState<boolean>(false);
  const [showAISummaryBox, setShowAISummaryBox] = useState<boolean>(true);

  // Threading & Reply Composer states
  const [showThreadHistory, setShowThreadHistory] = useState<boolean>(false);

  // New Message Modal states
  const [showComposeModal, setShowComposeModal] = useState<boolean>(false);
  const [composeTo, setComposeTo] = useState<string>("");
  const [composeCc, setComposeCc] = useState<string>("");
  const [composeSubject, setComposeSubject] = useState<string>("");

  // Undo Send (5s delayed send)
  const [pendingSend, setPendingSend] = useState<{
    payload: MailSendPayload;
    secondsLeft: number;
  } | null>(null);
  const [sendSuccessBanner, setSendSuccessBanner] = useState<string | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoTriagedIdsRef = useRef<Set<string>>(new Set());

  // Répertoire professeurs & staff autorisé à mettre à jour l'EDT
  const [authorizedSenders, setAuthorizedSenders] = useState<AuthorizedSender[]>([]);
  const [addingStaff, setAddingStaff] = useState(false);

  const loadAuthorizedStaff = async () => {
    try {
      const res = await api.getAuthorizedStaff();
      setAuthorizedSenders(res.senders || []);
    } catch {}
  };

  useEffect(() => {
    loadAuthorizedStaff();
  }, []);

  const extractEmail = (fromHeader: string) => {
    const match = (fromHeader || "").match(/<([^>]+)>/);
    return (match ? match[1] : fromHeader || "").trim().toLowerCase();
  };

  const getSenderAuth = (fromHeader: string) => {
    const email = extractEmail(fromHeader);
    if (!email) return undefined;
    return authorizedSenders.find((s) => s.email.toLowerCase() === email);
  };

  const handleAddStaff = async (detail: MailDetail) => {
    const email = extractEmail(detail.from);
    if (!email || !email.includes("@")) return;
    setAddingStaff(true);
    try {
      const res = await api.addStaffSender(email, detail.senderName, detail.id, imapFolder);
      setAuthorizedSenders(res.senders || []);
      if (res.actions && res.actions.length > 0) {
        setSelectedDetail((prev) => (prev && prev.id === detail.id ? { ...prev, aiScheduleActions: res.actions } : prev));
        setMessages((prev) =>
          prev.map((m) => (m.id === detail.id ? { ...m, aiScheduleActions: res.actions } : m))
        );
        setSendSuccessBanner(`Staff ajouté & EDT mis à jour (${res.actions[0].summary})`);
        setTimeout(() => setSendSuccessBanner(null), 5000);
      } else {
        setSendSuccessBanner(`${detail.senderName || email} ajouté au répertoire Staff`);
        setTimeout(() => setSendSuccessBanner(null), 3500);
      }
    } catch (e: any) {
      alert(e.message || "Erreur lors de l'ajout au répertoire Staff");
    } finally {
      setAddingStaff(false);
    }
  };

  const handleRemoveStaff = async (email: string) => {
    try {
      const res = await api.removeStaffSender(email);
      setAuthorizedSenders(res.senders || []);
    } catch {}
  };

  const fetchMessages = async (refresh = false, folderOverride?: ImapFolder) => {
    const targetFolder = folderOverride || imapFolder;
    setLoading(true);
    try {
      const data = await api.getMailMessages(0, 0, refresh, targetFolder);
      setMessages(data.messages);
      setTotalCount(data.totalCount);
      setUnreadCount(data.unreadCount);

      if (!selectedId && data.messages.length > 0 && typeof window !== "undefined" && window.innerWidth >= 768) {
        setSelectedId(data.messages[0].id);
      }

      // Lancement automatique du résumé & triage IA en arrière-plan pour les nouveaux messages
      const untriaged = data.messages.filter(
        (m) => !m.aiSummary && !autoTriagedIdsRef.current.has(`${targetFolder}:${m.id}`)
      );
      if (untriaged.length > 0) {
        handleRunAITriage(undefined, true, untriaged.slice(0, 6), targetFolder);
      }
    } catch (e: any) {
      console.error("Erreur chargement messagerie Zimbra:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages(false, imapFolder);
    // Rafraîchissement automatique silencieux toutes les 60 secondes
    const interval = setInterval(() => {
      api
        .getMailMessages(0, 0, true, imapFolder)
        .then((data) => {
          setMessages(data.messages);
          setTotalCount(data.totalCount);
          setUnreadCount(data.unreadCount);
          const untriaged = data.messages.filter(
            (m) => !m.aiSummary && !autoTriagedIdsRef.current.has(`${imapFolder}:${m.id}`)
          );
          if (untriaged.length > 0) {
            handleRunAITriage(undefined, true, untriaged.slice(0, 6), imapFolder);
          }
        })
        .catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, [imapFolder]);

  // Fetch full detail when selectedId changes
  useEffect(() => {
    if (!selectedId) {
      setSelectedDetail(null);
      return;
    }

    const fetchDetail = async () => {
      setLoadingDetail(true);
      try {
        const wasUnreadInList = messages.some((m) => m.id === selectedId && m.isUnread);
        const detail = await api.getMailMessage(selectedId, imapFolder);
        setSelectedDetail(detail);
        setBodyViewMode(detail.bodyHtml ? "html" : "text");

        if (wasUnreadInList) {
          setMessages((prev) =>
            prev.map((m) => (m.id === selectedId ? { ...m, isUnread: false } : m))
          );
          setUnreadCount((c) => Math.max(0, c - 1));
        }

        if (!detail.aiSummary && !autoTriagedIdsRef.current.has(`${imapFolder}:${detail.id}`)) {
          handleRunAITriage(detail, true, undefined, imapFolder);
        }
      } catch (e) {
        console.error("Erreur lecture message:", e);
      } finally {
        setLoadingDetail(false);
      }
    };

    fetchDetail();
  }, [selectedId, imapFolder]);

  // Contacts extraits des messages récents pour l'autocomplétion & l'IA
  const knownContacts = useMemo(() => {
    const map = new Map<string, string>();
    messages.forEach((m) => {
      const match = m.from.match(/<([^>]+)>/);
      const email = match ? match[1] : m.from;
      if (email.includes("@")) {
        map.set(email.toLowerCase(), m.senderName || email);
      }
    });
    return Array.from(map.entries()).map(([email, name]) => ({ email, name }));
  }, [messages]);

  // Fils de discussion liés au message sélectionné
  const threadMessages = useMemo(() => {
    if (!selectedDetail?.threadKey) return [];
    return messages
      .filter((m) => m.id !== selectedDetail.id && m.threadKey === selectedDetail.threadKey)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [messages, selectedDetail]);

  const threadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    messages.forEach((m) => {
      if (m.threadKey) counts[m.threadKey] = (counts[m.threadKey] || 0) + 1;
    });
    return counts;
  }, [messages]);

  // Undo Send countdown effect
  const triggerUndoableSend = (payload: MailSendPayload) => {
    if (pendingTimerRef.current) clearInterval(pendingTimerRef.current);
    setPendingSend({ payload, secondsLeft: 5 });

    pendingTimerRef.current = setInterval(() => {
      setPendingSend((prev) => {
        if (!prev) return null;
        if (prev.secondsLeft <= 1) {
          if (pendingTimerRef.current) clearInterval(pendingTimerRef.current);
          executeSendNow(prev.payload);
          return null;
        }
        return { ...prev, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);
  };

  const executeSendNow = async (payload: MailSendPayload) => {
    try {
      await api.sendMail(payload);
      setSendSuccessBanner(`Courriel envoyé à ${payload.to} !`);
      setTimeout(() => setSendSuccessBanner(null), 4000);
      fetchMessages(true, imapFolder);
    } catch (e: any) {
      alert("Erreur lors de l'envoi : " + e.message);
    }
  };

  const handleCancelPendingSend = () => {
    if (pendingTimerRef.current) clearInterval(pendingTimerRef.current);
    setPendingSend(null);
  };

  // Triage IA par lot (manuel ou automatique)
  const handleRunAITriage = async (
    singleMsg?: MailMessage,
    silent = false,
    explicitTargets?: MailMessage[],
    folderOverride?: ImapFolder
  ) => {
    const targetFolder = folderOverride || imapFolder;
    const targets = explicitTargets
      ? explicitTargets
      : singleMsg
      ? [singleMsg]
      : messages.filter((m) => !m.aiSummary).slice(0, 6);

    if (targets.length === 0) return;
    targets.forEach((m) => autoTriagedIdsRef.current.add(`${targetFolder}:${m.id}`));

    setTriaging(true);
    try {
      const res = await api.triageMail(
        targets.map((m) => ({
          id: m.id,
          messageId: m.messageId,
          subject: m.subject,
          from: m.from,
          date: m.date,
        })),
        targetFolder
      );
      if (res.triaged) {
        setMessages((prev) =>
          prev.map((m) => (res.triaged[m.id] ? { ...m, ...res.triaged[m.id] } : m))
        );
        setSelectedDetail((prev) =>
          prev && res.triaged[prev.id] ? { ...prev, ...res.triaged[prev.id] } : prev
        );
      }
    } catch (e: any) {
      if (!silent) {
        alert(e.message || "Erreur triage IA");
      }
    } finally {
      setTriaging(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      }
      return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    } catch {
      return dateStr;
    }
  };

  const presentResourceCodes = useMemo(() => {
    const set = new Set<string>();
    messages.forEach((m) => {
      if (m.resourceCode) set.add(m.resourceCode);
    });
    return Array.from(set).sort();
  }, [messages]);

  const isGradesMail = (msg: MailMessage) => {
    const text = `${msg.subject} ${msg.senderName || ""} ${msg.from}`.toLowerCase();
    return (
      text.includes("note") ||
      text.includes("evaluation") ||
      text.includes("évaluation") ||
      text.includes("scodoc") ||
      text.includes("releve") ||
      text.includes("relevé") ||
      text.includes("partiel") ||
      text.includes("bulletin")
    );
  };

  const smartCounts = useMemo(() => {
    return {
      all: messages.length,
      resources: messages.filter((m) => Boolean(m.resourceCode)).length,
      grades: messages.filter(isGradesMail).length,
      attachments: messages.filter((m) => m.hasAttachments).length,
      ai_action: messages.filter((m) => m.aiActionRequired).length,
      ai_priority: messages.filter((m) => m.aiPriority === "urgent" || m.aiPriority === "high").length,
    };
  }, [messages]);

  const filteredMessages = useMemo(() => {
    const result = messages.filter((msg) => {
      if (filterUnreadOnly && !msg.isUnread) return false;
      if (smartFilter === "resources" && !msg.resourceCode) return false;
      if (smartFilter === "grades" && !isGradesMail(msg)) return false;
      if (smartFilter === "attachments" && !msg.hasAttachments) return false;
      if (smartFilter === "ai_action" && !msg.aiActionRequired) return false;
      if (smartFilter === "ai_priority" && msg.aiPriority !== "urgent" && msg.aiPriority !== "high") return false;
      if (selectedTagResource && msg.resourceCode !== selectedTagResource) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesQuery =
          msg.subject.toLowerCase().includes(q) ||
          msg.from.toLowerCase().includes(q) ||
          (msg.senderName && msg.senderName.toLowerCase().includes(q)) ||
          (msg.aiSummary && msg.aiSummary.toLowerCase().includes(q)) ||
          (msg.resourceCode && msg.resourceCode.toLowerCase().includes(q));
        if (!matchesQuery) return false;
      }
      return true;
    });

    return result.sort((a, b) => {
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      return sortOrder === "desc" ? timeB - timeA : timeA - timeB;
    });
  }, [messages, filterUnreadOnly, smartFilter, selectedTagResource, searchQuery, sortOrder]);

  const handleCopyBody = () => {
    if (!selectedDetail) return;
    const text = selectedDetail.bodyText || selectedDetail.bodyHtml?.replace(/<[^>]+>/g, " ") || "";
    navigator.clipboard.writeText(text);
    setCopiedBody(true);
    setTimeout(() => setCopiedBody(false), 2000);
  };

  const handleToggleReadStatus = async () => {
    if (!selectedDetail) return;
    const targetRead = selectedDetail.isUnread;
    try {
      await api.markMailRead(selectedDetail.id, targetRead, imapFolder);
      setSelectedDetail({ ...selectedDetail, isUnread: !targetRead });
      setMessages((prev) =>
        prev.map((m) => (m.id === selectedDetail.id ? { ...m, isUnread: !targetRead } : m))
      );
      setUnreadCount((c) => (targetRead ? Math.max(0, c - 1) : c + 1));
    } catch (e: any) {
      alert("Erreur : " + e.message);
    }
  };

  const handleDeleteSelected = async () => {
    if (!selectedDetail) return;
    const msg =
      imapFolder === "Trash"
        ? "Supprimer définitivement ce courriel ?"
        : "Déplacer ce courriel vers la Corbeille ?";
    if (!confirm(msg)) return;
    try {
      await api.deleteMailMessage(selectedDetail.id, imapFolder);
      setMessages((prev) => prev.filter((m) => m.id !== selectedDetail.id));
      setSelectedId(null);
      setSelectedDetail(null);
    } catch (e: any) {
      alert("Erreur suppression : " + e.message);
    }
  };

  const handleCreateNoteFromMail = async (type: "CM" | "TP") => {
    if (!selectedDetail) return;
    setCreatingNote(true);

    const resourceId = selectedDetail.resourceCode || "R101";
    const title = `${type} : ${selectedDetail.subject.replace(/^(?:Re:\s*|Fwd:\s*)+/i, "")}`;
    const cleanBody =
      selectedDetail.bodyText || selectedDetail.bodyHtml?.replace(/<[^>]+>/g, " ").trim() || "";

    const content = `> **Courriel de :** ${selectedDetail.senderName || selectedDetail.from}\n> **Date :** ${new Date(
      selectedDetail.date
    ).toLocaleString("fr-FR")}\n\n---\n\n${cleanBody}`;

    try {
      const newNote = await api.createNote({
        resourceId,
        type,
        title,
        content,
        status: "En cours",
      });

      setNoteCreatedFeedback(`Note ${type} créée dans ${resourceId} !`);
      setTimeout(() => setNoteCreatedFeedback(null), 4000);

      if (onOpenResource) {
        setTimeout(() => {
          onOpenResource(resourceId, type, newNote.id);
        }, 800);
      }
    } catch (e: any) {
      alert("Erreur création note : " + e.message);
    } finally {
      setCreatingNote(false);
    }
  };

  const sanitizedBodyHtml = useMemo(() => {
    return selectedDetail?.bodyHtml ? sanitizeMailHtml(selectedDetail.bodyHtml) : "";
  }, [selectedDetail?.bodyHtml]);

  const replyAddress = useMemo(() => {
    if (!selectedDetail) return "";
    const match = selectedDetail.from.match(/<([^>]+)>/);
    return match ? match[1] : selectedDetail.from;
  }, [selectedDetail]);

  const replySubject = useMemo(() => {
    if (!selectedDetail) return "";
    return /^re:/i.test(selectedDetail.subject) ? selectedDetail.subject : `Re: ${selectedDetail.subject}`;
  }, [selectedDetail]);

  const switchFolder = (folder: ImapFolder) => {
    setImapFolder(folder);
    setSelectedId(null);
    setSelectedDetail(null);
    setSmartFilter("all");
    setSelectedTagResource(null);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 text-slate-800 relative">
      {/* Top Header Bar */}
      <div className="bg-white border-b border-slate-200 px-3 md:px-6 py-2.5 md:py-3.5 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center shrink-0">
              <Mail className="w-4 h-4 md:w-5 md:h-5 text-indigo-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base md:text-lg font-bold text-slate-900">Messagerie</h2>
                {unreadCount > 0 && (
                  <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                    {unreadCount} non-lu{unreadCount > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <p className="text-[11px] md:text-xs text-slate-500 truncate">
                {imapFolder === "INBOX"
                  ? "Boîte de réception"
                  : imapFolder === "Sent"
                  ? "Envoyés"
                  : imapFolder === "Drafts"
                  ? "Brouillons"
                  : "Corbeille"}{" "}
                • {totalCount} messages
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 flex-wrap">
            {noteCreatedFeedback && (
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                {noteCreatedFeedback}
              </span>
            )}
            {sendSuccessBanner && (
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                {sendSuccessBanner}
              </span>
            )}

            {triaging && (
              <span className="px-2.5 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl flex items-center gap-1.5 text-xs font-medium">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="hidden sm:inline">Analyse IA...</span>
              </span>
            )}

            <button
              onClick={() => fetchMessages(true)}
              disabled={loading}
              className="p-1.5 md:p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1.5 text-xs font-medium cursor-pointer"
              title="Rafraîchir la boîte de réception"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Actualiser</span>
            </button>

            <button
              onClick={() => {
                setComposeTo("");
                setComposeCc("");
                setComposeSubject("");
                setShowComposeModal(true);
              }}
              className="lg:hidden px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nouveau</span>
            </button>

            <a
              href="https://webmail.unicaen.fr/"
              target="_blank"
              rel="noreferrer"
              className="px-2.5 md:px-3.5 py-1.5 md:py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0"
            >
              <span className="hidden sm:inline">Webmail</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>

      {/* Main 3-Column Container */}
      <div className="flex-1 flex overflow-hidden max-w-7xl mx-auto w-full p-2 sm:p-4 md:p-6 gap-3 md:gap-5">
        {/* Leftmost Folder Navigation Sidebar */}
        <div className="hidden lg:flex w-56 bg-white border border-slate-200 rounded-2xl flex-col overflow-hidden shrink-0 shadow-xs p-3 space-y-4">
          <button
            onClick={() => {
              setComposeTo("");
              setComposeCc("");
              setComposeSubject("");
              setShowComposeModal(true);
            }}
            className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau message</span>
          </button>

          {/* Dossiers */}
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 block mb-1">
              Dossiers
            </span>
            <div className="space-y-0.5">
              {[
                { id: "INBOX" as ImapFolder, label: "Boîte de réception", icon: Inbox },
                { id: "Sent" as ImapFolder, label: "Envoyés", icon: Send },
                { id: "Drafts" as ImapFolder, label: "Brouillons", icon: FileEdit },
                { id: "Trash" as ImapFolder, label: "Corbeille", icon: Trash2 },
              ].map((f) => {
                const Icon = f.icon;
                const active = imapFolder === f.id && smartFilter === "all" && !selectedTagResource;
                return (
                  <button
                    key={f.id}
                    onClick={() => switchFolder(f.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? "bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${active ? "text-indigo-600" : "text-slate-400"}`} />
                      <span>{f.label}</span>
                    </div>
                    {f.id === "INBOX" && unreadCount > 0 && (
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-700">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filtres Intelligents & IA */}
          <div className="pt-2 border-t border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 block mb-1">
              Filtres &amp; Triage IA
            </span>
            <div className="space-y-0.5">
              <button
                onClick={() => {
                  setSmartFilter(smartFilter === "ai_action" ? "all" : "ai_action");
                  setSelectedTagResource(null);
                }}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                  smartFilter === "ai_action"
                    ? "bg-rose-50 text-rose-700 font-semibold border border-rose-200"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-rose-500" />
                  <span>Action requise</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">{smartCounts.ai_action}</span>
              </button>

              <button
                onClick={() => {
                  setSmartFilter(smartFilter === "ai_priority" ? "all" : "ai_priority");
                  setSelectedTagResource(null);
                }}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                  smartFilter === "ai_priority"
                    ? "bg-amber-50 text-amber-800 font-semibold border border-amber-200"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Flame className="w-3.5 h-3.5 text-amber-500" />
                  <span>Prioritaires IA</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">{smartCounts.ai_priority}</span>
              </button>

              <button
                onClick={() => {
                  setSmartFilter(smartFilter === "resources" ? "all" : "resources");
                  setSelectedTagResource(null);
                }}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                  smartFilter === "resources"
                    ? "bg-blue-50 text-blue-700 font-semibold border border-blue-200"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center gap-2">
                  <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                  <span>Cours &amp; Matières</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">{smartCounts.resources}</span>
              </button>

              <button
                onClick={() => {
                  setSmartFilter(smartFilter === "grades" ? "all" : "grades");
                  setSelectedTagResource(null);
                }}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                  smartFilter === "grades"
                    ? "bg-amber-50 text-amber-700 font-semibold border border-amber-200"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-3.5 h-3.5 text-amber-600" />
                  <span>Notes &amp; Évals</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">{smartCounts.grades}</span>
              </button>

              <button
                onClick={() => {
                  setSmartFilter(smartFilter === "attachments" ? "all" : "attachments");
                  setSelectedTagResource(null);
                }}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                  smartFilter === "attachments"
                    ? "bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Paperclip className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Pièces jointes</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">{smartCounts.attachments}</span>
              </button>
            </div>
          </div>

          {/* Quick Resource Tags */}
          {presentResourceCodes.length > 0 && (
            <div className="pt-2 border-t border-slate-100 flex-1 overflow-y-auto">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 block mb-1.5">
                Matières détectées
              </span>
              <div className="space-y-1">
                {presentResourceCodes.map((code) => {
                  const isSelected = selectedTagResource === code;
                  const resObj = resources.find((r) => r.code === code);
                  const count = messages.filter((m) => m.resourceCode === code).length;
                  return (
                    <button
                      key={code}
                      onClick={() => setSelectedTagResource(isSelected ? null : code)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                        isSelected ? "bg-slate-800 text-white font-semibold" : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[11px] font-mono font-bold">{code}</span>
                        <span className="text-[11px] text-slate-400 truncate">{resObj?.shortName || ""}</span>
                      </div>
                      <span className="text-[10px] font-mono opacity-70 ml-1">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Middle Column: Email List */}
        <div
          className={`w-full md:w-[360px] lg:w-[390px] bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden shrink-0 shadow-xs ${
            selectedId ? "hidden md:flex" : "flex"
          }`}
        >
          {/* Search, Mobile Folders & Sort toolbar */}
          <div className="p-3 border-b border-slate-200 space-y-2.5 bg-slate-50/50">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Rechercher par expéditeur, résumé IA, objet..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Mobile folder pills */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5 lg:hidden">
              {(["INBOX", "Sent", "Drafts", "Trash"] as ImapFolder[]).map((f) => (
                <button
                  key={f}
                  onClick={() => switchFolder(f)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    imapFolder === f
                      ? "bg-indigo-600 text-white shadow-2xs"
                      : "bg-white text-slate-600 border border-slate-200"
                  }`}
                >
                  {f === "INBOX" ? "Reçus" : f === "Sent" ? "Envoyés" : f === "Drafts" ? "Brouillons" : "Corbeille"}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setFilterUnreadOnly(false)}
                  className={`py-1 px-2.5 rounded-lg text-xs font-semibold transition-colors ${
                    !filterUnreadOnly
                      ? "bg-white text-slate-900 border border-slate-200 shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Tous ({messages.length})
                </button>
                <button
                  onClick={() => setFilterUnreadOnly(true)}
                  className={`py-1 px-2.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    filterUnreadOnly
                      ? "bg-white text-slate-900 border border-slate-200 shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <span>Non-lus ({unreadCount})</span>
                </button>
              </div>

              <button
                onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
                className="text-[11px] text-slate-500 hover:text-slate-800 font-mono px-2 py-1 rounded border border-slate-200 bg-white"
              >
                {sortOrder === "desc" ? "↓ Récent" : "↑ Ancien"}
              </button>
            </div>
          </div>

          {/* Email Items List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="text-center py-16">
                <div className="animate-spin w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto mb-2" />
                <p className="text-xs text-slate-400">Relevé des courriels...</p>
              </div>
            ) : filteredMessages.length === 0 ? (
              <div className="text-center py-16 text-slate-400 p-4">
                <Inbox className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p className="text-xs font-medium">Aucun e-mail trouvé</p>
              </div>
            ) : (
              filteredMessages.map((msg) => {
                const isSelected = selectedId === msg.id;
                const tCount = msg.threadKey ? threadCounts[msg.threadKey] || 1 : 1;

                return (
                  <div
                    key={msg.id}
                    onClick={() => setSelectedId(msg.id)}
                    className={`p-3.5 cursor-pointer transition-colors border-l-3 ${
                      isSelected
                        ? "bg-indigo-50/70 border-l-indigo-600"
                        : msg.isUnread
                        ? "bg-blue-50/30 hover:bg-slate-50 border-l-rose-500"
                        : "hover:bg-slate-50/80 border-l-transparent"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {msg.isUnread && <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />}
                        <span
                          className={`text-xs truncate ${
                            msg.isUnread ? "font-bold text-slate-900" : "font-medium text-slate-700"
                          }`}
                        >
                          {imapFolder === "Sent" ? `À: ${msg.to || msg.senderName}` : msg.senderName || msg.from}
                        </span>
                        {tCount > 1 && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                            {tCount}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">
                        {formatDate(msg.date)}
                      </span>
                    </div>

                    <h4
                      className={`text-xs leading-snug line-clamp-2 ${
                        msg.isUnread ? "font-bold text-slate-900" : "font-normal text-slate-700"
                      }`}
                    >
                      {msg.subject}
                    </h4>

                    {msg.aiSummary && (
                      <p className="text-[11px] text-slate-500 mt-1 line-clamp-1 italic">
                        ✨ {msg.aiSummary}
                      </p>
                    )}

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {msg.aiPriority === "urgent" && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-100 text-rose-700 border border-rose-200">
                            Urgent
                          </span>
                        )}
                        {msg.aiPriority === "high" && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200">
                            Prioritaire
                          </span>
                        )}
                        {msg.aiActionRequired && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                            Action
                          </span>
                        )}
                        {msg.resourceCode && (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onOpenResource) onOpenResource(msg.resourceCode!);
                            }}
                            className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                          >
                            {msg.resourceCode}
                          </span>
                        )}
                        {isGradesMail(msg) && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200">
                            Notes
                          </span>
                        )}
                      </div>

                      {msg.hasAttachments && <Paperclip className="w-3.5 h-3.5 text-slate-400" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Reading Pane + Thread + Integrated Rich Reply Composer */}
        <div
          className={`flex-1 bg-white border border-slate-200 rounded-2xl flex-col overflow-hidden shadow-xs ${
            selectedId ? "flex" : "hidden md:flex"
          }`}
        >
          {!selectedId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400">
              <MailOpen className="w-12 h-12 mb-3 text-slate-300" />
              <h4 className="text-sm font-semibold text-slate-700">Sélectionnez un courriel</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Consultez vos messages, lancez un triage IA ou rédigez directement une réponse enrichie avec votre signature étudiante.
              </p>
            </div>
          ) : loadingDetail ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full mb-3" />
              <p className="text-xs text-slate-400">Chargement du message...</p>
            </div>
          ) : !selectedDetail ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">
              Erreur lors du chargement du message.
            </div>
          ) : (
            <div className="flex-1 flex flex-col h-full overflow-y-auto">
              {/* Message Header & Action Toolbar */}
              <div className="p-4 md:p-5 border-b border-slate-200 bg-slate-50/40 shrink-0 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <button
                      onClick={() => setSelectedId(null)}
                      className="md:hidden p-1.5 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-200"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <h3 className="text-base md:text-lg font-bold text-slate-900 leading-snug">
                      {selectedDetail.subject}
                    </h3>
                    {selectedDetail.resourceCode && (
                      <button
                        onClick={() => onOpenResource && onOpenResource(selectedDetail.resourceCode!)}
                        className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 flex items-center gap-1 shrink-0"
                      >
                        <span>{selectedDetail.resourceCode}</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                    <div className="flex items-center rounded-xl border border-slate-200 bg-white overflow-hidden">
                      <button
                        onClick={() => handleCreateNoteFromMail("CM")}
                        disabled={creatingNote}
                        className="px-2.5 py-1.5 hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-xs font-medium border-r border-slate-200 flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5 text-blue-600" />
                        <span>Note CM</span>
                      </button>
                      <button
                        onClick={() => handleCreateNoteFromMail("TP")}
                        disabled={creatingNote}
                        className="px-2.5 py-1.5 hover:bg-cyan-50 text-slate-700 hover:text-cyan-700 text-xs font-medium flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5 text-cyan-600" />
                        <span>Note TP</span>
                      </button>
                    </div>

                    <button
                      onClick={handleToggleReadStatus}
                      className="p-2 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl transition-colors"
                      title={selectedDetail.isUnread ? "Marquer comme lu" : "Marquer comme non-lu"}
                    >
                      {selectedDetail.isUnread ? <Eye className="w-3.5 h-3.5 text-rose-600" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>

                    <button
                      onClick={handleCopyBody}
                      className="p-2 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl transition-colors"
                      title="Copier le texte"
                    >
                      {copiedBody ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>

                    <button
                      onClick={handleDeleteSelected}
                      className="p-2 bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 rounded-xl transition-colors"
                      title={imapFolder === "Trash" ? "Supprimer définitivement" : "Déplacer vers la Corbeille"}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    {selectedDetail.bodyHtml && selectedDetail.bodyText && (
                      <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
                        <button
                          onClick={() => setBodyViewMode("html")}
                          className={`px-2 py-1 rounded font-semibold ${
                            bodyViewMode === "html" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500"
                          }`}
                        >
                          HTML
                        </button>
                        <button
                          onClick={() => setBodyViewMode("text")}
                          className={`px-2 py-1 rounded font-semibold ${
                            bodyViewMode === "text" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500"
                          }`}
                        >
                          Texte
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sender & Meta */}
                <div className="flex items-center justify-between text-xs text-slate-600 gap-4 flex-wrap pt-2 border-t border-slate-200/60">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-800 font-bold flex items-center justify-center text-xs shrink-0">
                      {selectedDetail.senderName?.charAt(0).toUpperCase() || "U"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900">{selectedDetail.senderName || selectedDetail.from}</span>
                        {(() => {
                          const auth = getSenderAuth(selectedDetail.from);
                          if (auth) {
                            return (
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                  auth.role === "teacher"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-indigo-50 text-indigo-700 border-indigo-200"
                                }`}
                                title="Autorisé à mettre à jour l'emploi du temps via l'IA"
                              >
                                <ShieldCheck className="w-3 h-3" />
                                <span>{auth.role === "teacher" ? "Professeur" : "Staff autorisé"}</span>
                                {auth.role === "staff" && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveStaff(auth.email)}
                                    className="ml-0.5 hover:text-rose-600"
                                    title="Retirer du répertoire Staff"
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                )}
                              </span>
                            );
                          }
                          return (
                            <button
                              type="button"
                              onClick={() => handleAddStaff(selectedDetail)}
                              disabled={addingStaff}
                              className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 border border-slate-200 hover:border-indigo-300 transition-colors cursor-pointer disabled:opacity-50"
                              title="Autoriser cette adresse e-mail (staff / intervenant Unicaen) à mettre à jour votre emploi du temps"
                            >
                              <UserPlus className="w-3 h-3" />
                              <span>{addingStaff ? "Ajout..." : "Ajouter Staff"}</span>
                            </button>
                          );
                        })()}
                      </div>
                      <div className="text-slate-400 font-mono text-[11px] truncate max-w-md">{selectedDetail.from}</div>
                    </div>
                  </div>
                  <div className="text-right text-[11px] font-mono text-slate-500">
                    <div className="flex items-center gap-1.5 justify-end">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{new Date(selectedDetail.date).toLocaleString("fr-FR")}</span>
                    </div>
                    {selectedDetail.to && (
                      <div className="text-slate-400 truncate max-w-xs mt-0.5">À : {selectedDetail.to}</div>
                    )}
                  </div>
                </div>

                {/* Attachments */}
                {selectedDetail.attachments && selectedDetail.attachments.length > 0 && (
                  <div className="pt-2 border-t border-slate-200/60 flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                      <Paperclip className="w-3.5 h-3.5 text-indigo-600" />
                      {selectedDetail.attachments.length} PJ :
                    </span>
                    {selectedDetail.attachments.map((att) => (
                      <a
                        key={att.partIndex}
                        href={api.getMailAttachmentUrl(selectedDetail.id, att.partIndex, imapFolder)}
                        target="_blank"
                        rel="noreferrer"
                        download={att.filename}
                        className="px-2.5 py-1 bg-white hover:bg-indigo-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium flex items-center gap-1.5 shadow-xs"
                      >
                        <FileText className="w-3.5 h-3.5 text-indigo-600" />
                        <span className="truncate max-w-[180px]">{att.filename}</span>
                        <Download className="w-3 h-3 text-slate-400" />
                      </a>
                    ))}
                  </div>
                )}

                {/* Encart Résumé IA */}
                {selectedDetail.aiSummary ? (
                  <div className="rounded-xl bg-gradient-to-r from-indigo-50/80 to-blue-50/80 border border-indigo-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Résumé IA</span>
                        {selectedDetail.aiCategory && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white text-indigo-700 border border-indigo-200 font-semibold">
                            {selectedDetail.aiCategory}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => setShowAISummaryBox(!showAISummaryBox)}
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        {showAISummaryBox ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                    {showAISummaryBox && (
                      <div className="mt-1.5 space-y-2">
                        <p className="text-xs text-indigo-950 leading-relaxed">{selectedDetail.aiSummary}</p>
                        {selectedDetail.aiScheduleActions && selectedDetail.aiScheduleActions.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-indigo-200/60">
                            {selectedDetail.aiScheduleActions.map((act, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200"
                              >
                                {act.visioUrl ? <Video className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
                                <span>{act.summary}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : triaging ? (
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-indigo-600">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Résumé IA en cours...</span>
                  </div>
                ) : null}
              </div>

              {/* Message Body (XSS-sanitized) */}
              <div className="p-5 md:p-6 bg-white">
                {bodyViewMode === "html" && sanitizedBodyHtml ? (
                  <div
                    className="prose prose-slate max-w-none text-xs leading-relaxed overflow-x-auto"
                    dangerouslySetInnerHTML={{ __html: sanitizedBodyHtml }}
                  />
                ) : (
                  <pre className="font-sans text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
                    {selectedDetail.bodyText || "(Aucun contenu texte)"}
                  </pre>
                )}
              </div>

              {/* Historique du fil de discussion */}
              {threadMessages.length > 0 && (
                <div className="px-5 pb-4">
                  <button
                    onClick={() => setShowThreadHistory(!showThreadHistory)}
                    className="w-full py-2 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                      <span>{threadMessages.length} autre{threadMessages.length > 1 ? "s" : ""} message{threadMessages.length > 1 ? "s" : ""} dans ce fil</span>
                    </span>
                    {showThreadHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {showThreadHistory && (
                    <div className="mt-2 space-y-2 border-l-2 border-indigo-200 pl-3">
                      {threadMessages.map((tm) => (
                        <div
                          key={tm.id}
                          onClick={() => setSelectedId(tm.id)}
                          className="p-2.5 bg-slate-50 hover:bg-indigo-50/50 border border-slate-200 rounded-xl cursor-pointer text-xs flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-800 truncate">{tm.senderName || tm.from}</div>
                            <div className="text-[11px] text-slate-500 truncate">{tm.aiSummary || tm.subject}</div>
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 shrink-0">{formatDate(tm.date)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Compositeur de réponse intégré sous le message */}
              <div className="p-4 md:p-5 bg-slate-50/60 border-t border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                  <span>
                    Répondre à <strong className="text-slate-800">{replyAddress}</strong>
                  </span>
                  <span className="font-mono text-[11px] truncate max-w-xs">{replySubject}</span>
                </div>
                <RichMailComposer
                  mode="reply"
                  compact
                  to={replyAddress}
                  subject={replySubject}
                  inReplyTo={selectedDetail.messageId}
                  references={
                    selectedDetail.references
                      ? `${selectedDetail.references} ${selectedDetail.messageId || ""}`.trim()
                      : selectedDetail.messageId
                  }
                  incomingMail={{
                    from: selectedDetail.from,
                    subject: selectedDetail.subject,
                    bodyText: selectedDetail.bodyText || "",
                  }}
                  contacts={knownContacts}
                  studentName={user?.name || user?.username}
                  draftStorageKey={`mail_reply_draft_${selectedDetail.id}`}
                  onScheduleSend={triggerUndoableSend}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Nouveau Message */}
      {showComposeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                  <Send className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Nouveau message</h3>
              </div>
              <button
                onClick={() => setShowComposeModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-[82vh] overflow-y-auto">
              <datalist id="zimbra-known-contacts">
                {knownContacts.map((c) => (
                  <option key={c.email} value={c.email}>
                    {c.name}
                  </option>
                ))}
              </datalist>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">À (Destinataire)</label>
                  <input
                    type="text"
                    list="zimbra-known-contacts"
                    value={composeTo}
                    onChange={(e) => setComposeTo(e.target.value)}
                    placeholder="enseignant@unicaen.fr"
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Cc (Optionnel)</label>
                  <input
                    type="text"
                    list="zimbra-known-contacts"
                    value={composeCc}
                    onChange={(e) => setComposeCc(e.target.value)}
                    placeholder="copie@unicaen.fr"
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Objet</label>
                <input
                  type="text"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="Objet du courriel..."
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <RichMailComposer
                mode="new"
                to={composeTo}
                cc={composeCc}
                subject={composeSubject}
                contacts={knownContacts}
                studentName={user?.name || user?.username}
                draftStorageKey="mail_new_compose_draft"
                onChangeTo={setComposeTo}
                onChangeCc={setComposeCc}
                onChangeSubject={setComposeSubject}
                onScheduleSend={(payload) => {
                  setShowComposeModal(false);
                  triggerUndoableSend(payload);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Toast Envoi Différé Annulable (Undo Send - 5s) */}
      {pendingSend && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-4 text-xs animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
            <span>
              Envoi à <strong>{pendingSend.payload.to}</strong> dans{" "}
              <strong className="font-mono text-indigo-300">{pendingSend.secondsLeft}s</strong>...
            </span>
          </div>
          <button
            onClick={handleCancelPendingSend}
            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold flex items-center gap-1 transition-colors cursor-pointer"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Annuler</span>
          </button>
        </div>
      )}
    </div>
  );
};
