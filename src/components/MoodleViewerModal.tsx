import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { api } from "../services/api";
import {
  X,
  Download,
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FolderOpen,
  ExternalLink,
  Eye,
  Clock,
  Flag,
  Sparkles,
  Globe,
  Video,
  ChevronLeft,
  ChevronRight,
  FolderPlus,
} from "lucide-react";
import { AddToSpaceModal } from "./AddToSpaceModal";

function isOptionSuggestedByAI(
  answer: string | undefined,
  labelHtml: string | undefined,
  value: string | undefined,
  decisionPick?: string,
  choiceNumber?: number
): boolean {
  if (!answer && !decisionPick) return false;
  const normalize = (s: string) =>
    s
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const rawLabel = (labelHtml || value || "").replace(/<[^>]+>/g, " ").trim();
  const cleanedLabel = rawLabel.replace(/^(?:[a-z]\.|[0-9]+\.)\s*/i, "");
  const normLabel = normalize(cleanedLabel);
  if (!normLabel || normLabel.length < 2) return false;

  if (decisionPick) {
    const normPick = normalize(decisionPick.replace(/^(?:[a-z]\.|[0-9]+\.)\s*/i, ""));
    if (normPick && normPick === normLabel) return true;
  }

  if (!answer) return false;
  // Extraire uniquement le bloc Réponse (entre "Réponse ... :" et "Explication") si présent
  const respMatch = answer.match(/(?:\*\*|)?R[ée]ponse[^\n:]*:\s*(?:\*\*|)?([\s\S]*?)(?=(?:\*\*|)?Explication|$)/i);
  const answerSection = respMatch ? respMatch[1] : (answer.split(/\*\*\s*Explication/i)[0] || answer);

  // Détecter les réponses numérotées (ex: "Choix 2 et 3", "Réponses 1, 3", "Option 2")
  if (typeof choiceNumber === "number" && choiceNumber > 0) {
    const numberedMatches = answerSection.matchAll(
      /(?:choix|r[ée]ponses?|options?)\s*(?:n[°o]|num[ée]ro|#)?\s*([0-9]+(?:\s*(?:,|et|ou|\/|&|-)\s*[0-9]+)*)/gi
    );
    for (const m of numberedMatches) {
      const nums = (m[1].match(/\d+/g) || []).map((n) => parseInt(n, 10));
      if (nums.includes(choiceNumber)) return true;
    }
    const bareNumbersOnly = answerSection
      .replace(/\*\*/g, "")
      .trim()
      .match(/^([0-9]+(?:\s*(?:,|et|ou|\/|&)\s*[0-9]+)*)\.?$/i);
    if (bareNumbersOnly) {
      const nums = (bareNumbersOnly[1].match(/\d+/g) || []).map((n) => parseInt(n, 10));
      if (nums.includes(choiceNumber)) return true;
    }
  }

  const normAnswer = normalize(answerSection);
  const escaped = normLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\b)${escaped}(?:\\b|$)`).test(normAnswer);
}

export interface MoodleViewerTarget {
  title: string;
  url: string;
  type: "resource" | "folder" | "assign" | "page" | "url" | "forum" | "quiz" | "label" | "autre";
  fileType?: string;
}

interface MoodleViewerModalProps {
  target: MoodleViewerTarget | null;
  onClose: () => void;
}

export const MoodleViewerModal: React.FC<MoodleViewerModalProps> = ({ target, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<Awaited<ReturnType<typeof api.getMoodleActivity>> | null>(null);
  const [previewFile, setPreviewFile] = useState<{ name: string; url: string } | null>(null);

  // Assignment upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  // Quiz state
  const [quizInfo, setQuizInfo] = useState<Awaited<ReturnType<typeof api.getMoodleQuizInfo>> | null>(null);
  const [quizAttempt, setQuizAttempt] = useState<Awaited<ReturnType<typeof api.startMoodleQuiz>> | null>(null);
  const [allQuizQuestions, setAllQuizQuestions] = useState<QuizQuestionItem[]>([]);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string | string[]>>({});
  const [quizReviewHtml, setQuizReviewHtml] = useState<string | null>(null);
  const [quizBusy, setQuizBusy] = useState(false);
  const [bbbEmbedUrl, setBbbEmbedUrl] = useState<string | null>(null);
  const [bbbLoading, setBbbLoading] = useState(false);
  const [addToSpaceFile, setAddToSpaceFile] = useState<{ name: string; url: string } | null>(null);
  const [quizAiHelp, setQuizAiHelp] = useState<
    Record<
      string,
      {
        loading: boolean;
        error?: string;
        answer?: string;
        sources?: Array<{ title: string; url: string }>;
        provider?: string;
        webSearchUsed?: boolean;
        decisionPick?: string;
        decisionConfidence?: number;
      }
    >
  >({});

  const isQuiz = Boolean(target && (target.type === "quiz" || target.url.includes("mod/quiz")));

  const initAnswersFromAttempt = (attemptData: Awaited<ReturnType<typeof api.startMoodleQuiz>>) => {
    const init: Record<string, string | string[]> = {};
    for (const q of attemptData.questions) {
      if (q.flagField?.checked) {
        init[q.flagField.name] = "1";
      }
      for (const inp of q.inputs) {
        if (inp.kind === "checkbox") {
          if (!Array.isArray(init[inp.name])) init[inp.name] = [];
          if (inp.checked && inp.value !== undefined) {
            (init[inp.name] as string[]).push(inp.value);
          }
        } else if (inp.kind === "radio") {
          if (inp.checked && inp.value !== undefined) init[inp.name] = inp.value;
        } else if (inp.kind === "select") {
          const sel = inp.options?.find((o) => o.selected);
          if (sel) init[inp.name] = sel.value;
        } else if (inp.value) {
          init[inp.name] = inp.value;
        }
      }
    }
    setQuizAnswers((prev) => ({ ...prev, ...init }));
  };

  useEffect(() => {
    if (!target) {
      setActivity(null);
      setPreviewFile(null);
      setError(null);
      setSubmitFeedback(null);
      setSelectedFile(null);
      setQuizInfo(null);
      setQuizAttempt(null);
      setAllQuizQuestions([]);
      setActiveQuestionId(null);
      setQuizAnswers({});
      setQuizReviewHtml(null);
      return;
    }

    if (target.type === "resource") {
      setPreviewFile({ name: target.title, url: target.url });
      setActivity(null);
      setError(null);
      return;
    }

    setPreviewFile(null);
    setLoading(true);
    setError(null);
    setSubmitFeedback(null);
    setQuizInfo(null);
    setQuizAttempt(null);
    setAllQuizQuestions([]);
    setActiveQuestionId(null);
    setQuizReviewHtml(null);
    setQuizAiHelp({});
    setBbbEmbedUrl(null);

    if (target.type === "quiz" || target.url.includes("mod/quiz")) {
      api
        .getMoodleQuizInfo(target.url)
        .then((info) => setQuizInfo(info))
        .catch((err: any) => setError(err.message || "Impossible de charger le questionnaire."))
        .finally(() => setLoading(false));
      return;
    }

    api
      .getMoodleActivity(target.url, target.type)
      .then((data) => {
        setActivity(data);
      })
      .catch((err: any) => {
        setError(err.message || "Impossible de charger le contenu eCampus.");
      })
      .finally(() => setLoading(false));
  }, [target]);

  if (!target) return null;

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !target) return;
    setSubmitting(true);
    setSubmitFeedback(null);
    try {
      const res = await api.submitMoodleAssignment(target.url, selectedFile);
      setSubmitFeedback({ ok: true, msg: res.message });
      setSelectedFile(null);
      const refreshed = await api.getMoodleActivity(target.url, target.type);
      setActivity(refreshed);
    } catch (err: any) {
      setSubmitFeedback({ ok: false, msg: err.message || "Erreur lors du dépôt." });
    } finally {
      setSubmitting(false);
    }
  };

  const isImageUrl = (name: string) => /\.(png|jpe?g|gif|webp|svg)$/i.test(name);

  type QuizQuestionItem = NonNullable<Awaited<ReturnType<typeof api.startMoodleQuiz>>["allQuestions"]>[number];

  const isQuestionAnswered = (q: QuizQuestionItem): boolean => {
    return q.inputs.some((inp) => {
      const val = quizAnswers[inp.name];
      if (Array.isArray(val)) return val.length > 0;
      return typeof val === "string" && val.trim().length > 0;
    });
  };

  const scrollToQuestionCard = (qId: string) => {
    setActiveQuestionId(qId);
    setTimeout(() => {
      document.getElementById(`quiz-q-${qId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  };

  const handleStartQuiz = async () => {
    if (!target) return;
    setQuizBusy(true);
    setError(null);
    try {
      const attempt = await api.startMoodleQuiz(target.url);
      setQuizAttempt(attempt);
      setQuizAnswers({});
      initAnswersFromAttempt(attempt);
      const allQ = (attempt.allQuestions?.length ? attempt.allQuestions : attempt.questions || []) as QuizQuestionItem[];
      setAllQuizQuestions(allQ);
      if (allQ.length > 0) {
        setActiveQuestionId(attempt.questions[0]?.id || allQ[0]?.id || null);
        // Traiter les questions par paquets de 3
        void handleAskQuizAIBatch(allQ);
      }
    } catch (err: any) {
      setError(err.message || "Impossible de démarrer le questionnaire.");
    } finally {
      setQuizBusy(false);
    }
  };

  const handleSubmitQuiz = async (
    action: "next" | "prev" | "finish" | "goto",
    targetPage?: number,
    focusQuestionId?: string
  ) => {
    if (!quizAttempt) return;
    setQuizBusy(true);
    setError(null);
    try {
      const res = await api.submitMoodleQuiz({
        processUrl: quizAttempt.processUrl,
        hiddenFields: quizAttempt.hiddenFields,
        answers: quizAnswers,
        action,
        targetPage,
      });
      if (res.status === "finished") {
        setQuizReviewHtml(res.reviewHtml || "<p>Questionnaire envoyé avec succès.</p>");
        setQuizAttempt(null);
        setAllQuizQuestions([]);
        setActiveQuestionId(null);
      } else {
        setQuizAttempt(res);
        initAnswersFromAttempt(res);
        const pageQs: QuizQuestionItem[] = res.questions || [];
        const pageIdx = Number(res.currentPage ?? res.hiddenFields?.thispage ?? 0);
        setAllQuizQuestions((prev) => {
          const merged = new Map<string, QuizQuestionItem>();
          for (const item of prev) merged.set(item.id, item);
          for (const q of pageQs) merged.set(q.id, { ...q, pageIndex: pageIdx });
          return Array.from(merged.values()).sort((a, b) => {
            const na = parseInt(a.number || "", 10);
            const nb = parseInt(b.number || "", 10);
            if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
            return (a.pageIndex ?? 0) - (b.pageIndex ?? 0);
          });
        });
        const focusId =
          focusQuestionId && pageQs.some((q) => q.id === focusQuestionId)
            ? focusQuestionId
            : pageQs[0]?.id;
        if (focusId) scrollToQuestionCard(focusId);
        void handleAskQuizAIBatch(pageQs);
      }
    } catch (err: any) {
      setError(err.message || "Erreur lors de l'envoi des réponses.");
    } finally {
      setQuizBusy(false);
    }
  };

  const jumpToQuestion = (q: QuizQuestionItem) => {
    if (!quizAttempt) return;
    if (quizAttempt.questions.some((cur) => cur.id === q.id)) {
      scrollToQuestionCard(q.id);
    } else if (typeof q.pageIndex === "number" && !quizBusy) {
      void handleSubmitQuiz("goto", q.pageIndex, q.id);
    }
  };

  const stepQuestion = (delta: -1 | 1) => {
    if (!quizAttempt) return;
    if (quizAttempt.navItems && quizAttempt.navItems.length > 0) {
      const items = quizAttempt.navItems;
      const curIdx = items.findIndex((it) => {
        const curQ = quizAttempt.questions.find((q) => q.number === it.number);
        return curQ ? curQ.id === activeQuestionId : it.isCurrent;
      });
      const baseIdx = curIdx >= 0 ? curIdx : 0;
      const nextIdx = Math.max(0, Math.min(items.length - 1, baseIdx + delta));
      const targetItem = items[nextIdx];
      if (!targetItem || targetItem.blocked) return;
      const curQ = quizAttempt.questions.find((q) => q.number === targetItem.number);
      if (curQ) {
        scrollToQuestionCard(curQ.id);
      } else if (!quizBusy) {
        const knownQ = allQuizQuestions.find((q) => q.number === targetItem.number);
        void handleSubmitQuiz("goto", targetItem.pageIndex, knownQ?.id);
      }
      return;
    }

    const navList = allQuizQuestions.length > 0 ? allQuizQuestions : (quizAttempt.questions as QuizQuestionItem[]);
    if (navList.length === 0) return;
    const currentIdx = navList.findIndex((q) => q.id === activeQuestionId);
    const baseIdx = currentIdx >= 0 ? currentIdx : 0;
    const nextIdx = Math.max(0, Math.min(navList.length - 1, baseIdx + delta));
    if (nextIdx !== baseIdx || currentIdx < 0) {
      jumpToQuestion(navList[nextIdx]);
    }
  };

  const extractQuestionPayload = (q: QuizQuestionItem) => {
    const stripHtml = (h: string) =>
      h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    const questionText = stripHtml(q.textHtml || "");
    const choicesText: string[] = [];
    for (const inp of q.inputs) {
      if (inp.kind === "radio" || inp.kind === "checkbox") {
        choicesText.push(stripHtml(inp.labelHtml || inp.value || ""));
      } else if (inp.kind === "select" && inp.options) {
        const opts = inp.options
          .map((o) => o.label)
          .filter((l) => l && l !== "Choisir...");
        if (opts.length > 0) choicesText.push(`Liste déroulante : ${opts.join(" | ")}`);
      }
    }
    return { id: q.id, questionText, choicesText };
  };

  const handleAskQuizAIBatch = async (questions: QuizQuestionItem[]) => {
    const pendingQuestions = (questions || []).filter(
      (q) => !quizAiHelp[q.id]?.answer && !quizAiHelp[q.id]?.loading
    );
    if (pendingQuestions.length === 0) return;

    setQuizAiHelp((prev) => {
      const next = { ...prev };
      for (const q of pendingQuestions) {
        next[q.id] = { loading: true };
      }
      return next;
    });

    const BATCH_SIZE = 3;
    const chunks: QuizQuestionItem[][] = [];
    for (let i = 0; i < pendingQuestions.length; i += BATCH_SIZE) {
      chunks.push(pendingQuestions.slice(i, i + BATCH_SIZE));
    }

    for (const chunk of chunks) {
      try {
        const payload = chunk.map(extractQuestionPayload);
        const batchRes = await api.getMoodleQuizAIHelpBatch(payload);
        setQuizAiHelp((prev) => {
          const next = { ...prev };
          for (const q of chunk) {
            const item = batchRes.results?.[q.id];
            if (item) {
              next[q.id] = {
                loading: false,
                answer: item.answer,
                sources: item.sources,
                provider: item.provider,
                webSearchUsed: item.webSearchUsed,
              };
            } else {
              next[q.id] = { loading: false, error: "Réponse non reçue dans le batch" };
            }
          }
          return next;
        });
      } catch (err: any) {
        setQuizAiHelp((prev) => {
          const next = { ...prev };
          for (const q of chunk) {
            next[q.id] = { loading: false, error: err.message || "Erreur assistance IA batch" };
          }
          return next;
        });
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
              {previewFile ? <Eye className="w-4 h-4" /> : <FolderOpen className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 truncate">
                {previewFile ? previewFile.name : activity?.title || target.title}
              </h3>
              <p className="text-[11px] text-slate-500">E-Campus Vert • Lecture intégrée dans Backpack</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {previewFile && activity && (
              <button
                onClick={() => setPreviewFile(null)}
                className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition-colors"
              >
                Retour à l&apos;activité
              </button>
            )}
            {(previewFile || target.type === "resource") && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setAddToSpaceFile({
                      name: previewFile ? previewFile.name : target.title,
                      url: api.getMoodlePreviewUrl(previewFile ? previewFile.url : target.url),
                    })
                  }
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Ajouter ce fichier dans un cours, TP ou TD"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Ajouter à mon espace</span>
                </button>
                <a
                  href={api.getMoodlePreviewUrl(previewFile ? previewFile.url : target.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  title="Ouvrir dans un nouvel onglet"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Nouvel onglet</span>
                </a>
                <a
                  href={api.getMoodleDownloadUrl(previewFile ? previewFile.url : target.url)}
                  download
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Télécharger</span>
                </a>
              </>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
              aria-label="Fermer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-white">
          {previewFile ? (
            <div className="w-full h-full flex items-center justify-center bg-slate-100">
              {isImageUrl(previewFile.name) ? (
                <img
                  src={api.getMoodlePreviewUrl(previewFile.url)}
                  alt={previewFile.name}
                  className="max-w-full max-h-full object-contain p-4"
                />
              ) : /\.(docx?|pptx?|xlsx?|odt|ods|odp|zip|rar|7z)$/i.test(previewFile.name || previewFile.url) ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md text-center space-y-4 shadow-sm m-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center mx-auto">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 break-words">{previewFile.name}</h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Ce format ne peut pas être prévisualisé directement dans le navigateur.
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <a
                      href={api.getMoodleDownloadUrl(previewFile.url)}
                      download
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Télécharger</span>
                    </a>
                    <button
                      type="button"
                      onClick={() =>
                        setAddToSpaceFile({
                          name: previewFile.name,
                          url: api.getMoodlePreviewUrl(previewFile.url),
                        })
                      }
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                      <span>Ajouter à mon espace</span>
                    </button>
                  </div>
                </div>
              ) : (
                <iframe
                  src={api.getMoodlePreviewUrl(previewFile.url)}
                  title={previewFile.name}
                  className="w-full h-full border-0 bg-white"
                />
              )}
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2 p-8">
              <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
              <p className="text-xs font-medium">Chargement du contenu eCampus...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
              <p className="text-sm font-bold text-slate-800">Erreur de chargement</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md">{error}</p>
            </div>
          ) : isQuiz && quizReviewHtml ? (
            <div className="p-5 sm:p-6 space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-2.5 text-emerald-800 text-xs font-bold">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>Questionnaire enregistré et envoyé sur Moodle !</span>
              </div>
              <div
                className="prose prose-sm max-w-none text-slate-800 bg-white border border-slate-200 rounded-2xl p-5 overflow-x-auto"
                dangerouslySetInnerHTML={{ __html: quizReviewHtml }}
              />
            </div>
          ) : isQuiz && quizAttempt ? (
            <div className="p-5 sm:p-6 space-y-5">
              {/* Barre de navigation sticky entre les questions */}
              {(() => {
                const officialNav = quizAttempt.navItems && quizAttempt.navItems.length > 0 ? quizAttempt.navItems : null;
                const navQuestions =
                  allQuizQuestions.length > 0 ? allQuizQuestions : (quizAttempt.questions as QuizQuestionItem[]);
                const totalItems = officialNav ? officialNav.length : navQuestions.length;
                if (totalItems === 0) return null;

                const answeredCount = officialNav
                  ? officialNav.filter((it) => {
                      const curQ = quizAttempt.questions.find((q) => q.number === it.number);
                      return curQ ? isQuestionAnswered(curQ) : it.answered;
                    }).length
                  : navQuestions.filter((nq) => isQuestionAnswered(nq)).length;

                const currentNavIdx = officialNav
                  ? Math.max(
                      0,
                      officialNav.findIndex((it) => {
                        const curQ = quizAttempt.questions.find((q) => q.number === it.number);
                        return curQ ? curQ.id === activeQuestionId : it.isCurrent;
                      })
                    )
                  : Math.max(
                      0,
                      navQuestions.findIndex((nq) => nq.id === activeQuestionId)
                    );

                return (
                  <div className="sticky top-0 z-20 -mx-5 sm:-mx-6 -mt-5 sm:-mt-6 mb-5 px-5 py-3 bg-white/95 backdrop-blur-xs border-b border-slate-200 shadow-2xs space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => stepQuestion(-1)}
                          disabled={quizBusy || currentNavIdx <= 0}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold border border-slate-200 cursor-pointer disabled:opacity-40"
                          title="Question précédente"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                          <span>Préc.</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => stepQuestion(1)}
                          disabled={quizBusy || currentNavIdx >= totalItems - 1}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold border border-slate-200 cursor-pointer disabled:opacity-40"
                          title="Question suivante"
                        >
                          <span>Suiv.</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-slate-600">
                        <span className="font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          {answeredCount} / {totalItems} répondue{answeredCount > 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {officialNav
                        ? officialNav.map((it) => {
                            const curQ = quizAttempt.questions.find((q) => q.number === it.number);
                            const knownQ = curQ || allQuizQuestions.find((q) => q.number === it.number);
                            const isActive = curQ ? curQ.id === activeQuestionId : it.isCurrent;
                            const isCurrentPage = Boolean(curQ);
                            const isAnswered = curQ ? isQuestionAnswered(curQ) : it.answered;
                            const isFlagged = curQ
                              ? Boolean(curQ.flagField && quizAnswers[curQ.flagField.name] === "1")
                              : it.flagged;
                            const hasAi = Boolean(knownQ && quizAiHelp[knownQ.id]?.answer);

                            return (
                              <button
                                key={`nav-${it.number}`}
                                type="button"
                                onClick={() => {
                                  if (curQ) {
                                    scrollToQuestionCard(curQ.id);
                                  } else if (!it.blocked && !quizBusy) {
                                    void handleSubmitQuiz("goto", it.pageIndex, knownQ?.id);
                                  }
                                }}
                                disabled={quizBusy || it.blocked}
                                title={`Question ${it.number}${
                                  it.blocked ? " (verrouillée)" : isCurrentPage ? "" : " (autre page)"
                                }`}
                                className={`relative min-w-[28px] h-7 px-1.5 rounded-lg text-[11px] font-mono font-bold border transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                                  isActive
                                    ? "ring-2 ring-indigo-500 border-indigo-600 bg-indigo-50 text-indigo-800"
                                    : isAnswered
                                    ? "bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                                    : isCurrentPage
                                    ? "bg-white border-slate-300 text-slate-700 hover:bg-slate-100"
                                    : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                                }`}
                              >
                                {it.number}
                                {isFlagged && (
                                  <span
                                    className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-rose-500 ring-1 ring-white"
                                    title="Question marquée"
                                  />
                                )}
                                {hasAi && (
                                  <span
                                    className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-indigo-500 ring-1 ring-white"
                                    title="Réponse IA prête"
                                  />
                                )}
                              </button>
                            );
                          })
                        : navQuestions.map((nq, idx) => {
                            const isActive = nq.id === activeQuestionId;
                            const isCurrentPage = quizAttempt.questions.some((cur) => cur.id === nq.id);
                            const isAnswered = isQuestionAnswered(nq);
                            const isFlagged = Boolean(nq.flagField && quizAnswers[nq.flagField.name] === "1");
                            const hasAi = Boolean(quizAiHelp[nq.id]?.answer);
                            const label = (nq.number || "").trim() || String(idx + 1);

                            return (
                              <button
                                key={nq.id}
                                type="button"
                                onClick={() => jumpToQuestion(nq)}
                                disabled={quizBusy}
                                title={`Question ${label}${isCurrentPage ? "" : " (autre page)"}`}
                                className={`relative min-w-[28px] h-7 px-1.5 rounded-lg text-[11px] font-mono font-bold border transition-all cursor-pointer disabled:opacity-50 ${
                                  isActive
                                    ? "ring-2 ring-indigo-500 border-indigo-600 bg-indigo-50 text-indigo-800"
                                    : isAnswered
                                    ? "bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                                    : isCurrentPage
                                    ? "bg-white border-slate-300 text-slate-700 hover:bg-slate-100"
                                    : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                                }`}
                              >
                                {label}
                                {isFlagged && (
                                  <span
                                    className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-rose-500 ring-1 ring-white"
                                    title="Question marquée"
                                  />
                                )}
                                {hasAi && (
                                  <span
                                    className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-indigo-500 ring-1 ring-white"
                                    title="Réponse IA prête"
                                  />
                                )}
                              </button>
                            );
                          })}
                    </div>
                  </div>
                );
              })()}

              {quizAttempt.questions.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-8">Aucune question détectée sur cette page.</p>
              ) : (
                quizAttempt.questions.map((q, qIdx) => {
                  const isFlagged = Boolean(q.flagField && quizAnswers[q.flagField.name] === "1");
                  const aiState = quizAiHelp[q.id];
                  return (
                  <div
                    key={q.id}
                    id={`quiz-q-${q.id}`}
                    onClick={() => setActiveQuestionId(q.id)}
                    className={`scroll-mt-28 bg-white border rounded-2xl p-5 space-y-4 shadow-xs transition-colors ${
                      activeQuestionId === q.id ? "border-indigo-300 ring-1 ring-indigo-200" : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Question {q.number || qIdx + 1}
                      </span>
                      <div className="flex items-center gap-2">
                        {q.flagField && (
                          <button
                            type="button"
                            onClick={() =>
                              setQuizAnswers((prev) => ({
                                ...prev,
                                [q.flagField!.name]: isFlagged ? "0" : "1",
                              }))
                            }
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer ${
                              isFlagged
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                            }`}
                            title="Marquer la question"
                          >
                            <Flag className={`w-3.5 h-3.5 ${isFlagged ? "fill-rose-500 text-rose-600" : ""}`} />
                            <span>{isFlagged ? "Marquée" : "Marquer"}</span>
                          </button>
                        )}
                      </div>
                    </div>
                    {q.textHtml && (
                      <div
                        className="prose prose-sm max-w-none text-slate-900 font-medium"
                        dangerouslySetInnerHTML={{ __html: q.textHtml }}
                      />
                    )}
                    <div className="space-y-2 pt-1">
                      {q.inputs.map((inp, iIdx) => {
                        const choiceNum = q.inputs
                          .slice(0, iIdx + 1)
                          .filter((x) => x.kind === "radio" || x.kind === "checkbox").length;
                        if (inp.kind === "radio") {
                          const checked = quizAnswers[inp.name] === inp.value;
                          const isAiPick = isOptionSuggestedByAI(
                            aiState?.answer,
                            inp.labelHtml,
                            inp.value,
                            aiState?.decisionPick,
                            choiceNum
                          );
                          return (
                            <label
                              key={`${inp.name}-${iIdx}`}
                              className={`flex items-start justify-between gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                                checked
                                  ? `bg-emerald-50 border-emerald-300 ${isAiPick ? "ring-2 ring-indigo-300" : ""}`
                                  : isAiPick
                                  ? "bg-indigo-50/80 border-indigo-400 ring-1 ring-indigo-300"
                                  : "bg-slate-50 hover:bg-slate-100 border-slate-200"
                              }`}
                            >
                              <div className="flex items-start gap-2.5">
                                <input
                                  type="radio"
                                  name={inp.name}
                                  value={inp.value}
                                  checked={checked}
                                  onChange={() => setQuizAnswers((prev) => ({ ...prev, [inp.name]: inp.value || "" }))}
                                  className="mt-0.5 accent-emerald-600"
                                />
                                <span
                                  className={`text-xs ${isAiPick ? "font-semibold text-indigo-950" : "text-slate-800"}`}
                                  dangerouslySetInnerHTML={{ __html: inp.labelHtml || inp.value || "" }}
                                />
                              </div>
                              {isAiPick && (
                                <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-600 text-white">
                                  <Sparkles className="w-2.5 h-2.5" />
                                  Choix IA
                                </span>
                              )}
                            </label>
                          );
                        }
                        if (inp.kind === "checkbox") {
                          const arr = Array.isArray(quizAnswers[inp.name]) ? (quizAnswers[inp.name] as string[]) : [];
                          const checked = inp.value !== undefined && arr.includes(inp.value);
                          const isAiPick = isOptionSuggestedByAI(
                            aiState?.answer,
                            inp.labelHtml,
                            inp.value,
                            aiState?.decisionPick,
                            choiceNum
                          );
                          return (
                            <label
                              key={`${inp.name}-${iIdx}`}
                              className={`flex items-start justify-between gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                                checked
                                  ? `bg-emerald-50 border-emerald-300 ${isAiPick ? "ring-2 ring-indigo-300" : ""}`
                                  : isAiPick
                                  ? "bg-indigo-50/80 border-indigo-400 ring-1 ring-indigo-300"
                                  : "bg-slate-50 hover:bg-slate-100 border-slate-200"
                              }`}
                            >
                              <div className="flex items-start gap-2.5">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const val = inp.value || "";
                                    setQuizAnswers((prev) => {
                                      const cur = Array.isArray(prev[inp.name]) ? (prev[inp.name] as string[]) : [];
                                      return {
                                        ...prev,
                                        [inp.name]: e.target.checked ? [...cur, val] : cur.filter((x) => x !== val),
                                      };
                                    });
                                  }}
                                  className="mt-0.5 accent-emerald-600"
                                />
                                <span
                                  className={`text-xs ${isAiPick ? "font-semibold text-indigo-950" : "text-slate-800"}`}
                                  dangerouslySetInnerHTML={{ __html: inp.labelHtml || inp.value || "" }}
                                />
                              </div>
                              {isAiPick && (
                                <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-600 text-white">
                                  <Sparkles className="w-2.5 h-2.5" />
                                  Choix IA
                                </span>
                              )}
                            </label>
                          );
                        }
                        if (inp.kind === "textarea") {
                          return (
                            <textarea
                              key={`${inp.name}-${iIdx}`}
                              rows={4}
                              value={(quizAnswers[inp.name] as string) ?? ""}
                              onChange={(e) => setQuizAnswers((prev) => ({ ...prev, [inp.name]: e.target.value }))}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 focus:outline-none focus:border-emerald-600 focus:bg-white"
                              placeholder="Votre réponse..."
                            />
                          );
                        }
                        if (inp.kind === "select") {
                          return (
                            <div key={`${inp.name}-${iIdx}`} className="space-y-1">
                              {inp.labelHtml && (
                                <div
                                  className="text-xs font-medium text-slate-700"
                                  dangerouslySetInnerHTML={{ __html: inp.labelHtml }}
                                />
                              )}
                              <select
                                value={(quizAnswers[inp.name] as string) ?? ""}
                                onChange={(e) => setQuizAnswers((prev) => ({ ...prev, [inp.name]: e.target.value }))}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-600 focus:bg-white"
                              >
                                {(inp.options || []).map((opt, oIdx) => (
                                  <option key={oIdx} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        }
                        return (
                          <input
                            key={`${inp.name}-${iIdx}`}
                            type="text"
                            value={(quizAnswers[inp.name] as string) ?? ""}
                            onChange={(e) => setQuizAnswers((prev) => ({ ...prev, [inp.name]: e.target.value }))}
                            placeholder={inp.placeholder || "Votre réponse..."}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-600 focus:bg-white"
                          />
                        );
                      })}
                    </div>

                    {aiState && (
                      <div className="mt-3 bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 space-y-2.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                            {aiState.loading ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                            )}
                            <span>{aiState.loading ? "Recherche Web & analyse IA en cours..." : "Réponse suggérée"}</span>
                          </span>
                          <div className="flex items-center gap-1.5">
                            {aiState.webSearchUsed && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white text-emerald-700 border border-emerald-200 flex items-center gap-1">
                                <Globe className="w-3 h-3" />
                                <span>Recherche Web</span>
                              </span>
                            )}
                            {aiState.provider && (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white text-indigo-700 border border-indigo-200">
                                {aiState.provider}
                              </span>
                            )}
                          </div>
                        </div>

                        {!aiState.loading && (aiState.error ? (
                          <p className="text-xs text-rose-700">{aiState.error}</p>
                        ) : (
                          <>
                            <div className="prose prose-sm prose-slate max-w-none text-xs leading-relaxed">
                              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                                {aiState.answer}
                              </ReactMarkdown>
                            </div>
                            {aiState.sources && aiState.sources.length > 0 && (
                              <div className="pt-2 border-t border-indigo-200/70 space-y-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 block">
                                  Sources
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                  {aiState.sources.map((src, sIdx) => (
                                    <a
                                      key={sIdx}
                                      href={src.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[11px] font-medium transition-colors max-w-xs truncate"
                                      title={src.url}
                                    >
                                      <ExternalLink className="w-3 h-3 shrink-0" />
                                      <span className="truncate">{src.title}</span>
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        ))}
                      </div>
                    )}
                  </div>
                  );
                })
              )}

              <div className="flex items-center justify-between gap-3 pt-2">
                <div>
                  {quizAttempt.hasPrevPage && (
                    <button
                      onClick={() => handleSubmitQuiz("prev")}
                      disabled={quizBusy}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      Page précédente
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {quizAttempt.hasNextPage ? (
                    <button
                      onClick={() => handleSubmitQuiz("next")}
                      disabled={quizBusy}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {quizBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>Page suivante</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSubmitQuiz("finish")}
                      disabled={quizBusy}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {quizBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>Terminer et envoyer</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : isQuiz && quizInfo ? (
            <div className="p-6 space-y-5">
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-5 space-y-4">
                <h4 className="text-sm font-bold text-slate-900">{quizInfo.title}</h4>
                {quizInfo.introHtml && (
                  <div
                    className="prose prose-sm max-w-none text-slate-700"
                    dangerouslySetInnerHTML={{ __html: quizInfo.introHtml }}
                  />
                )}
                {quizInfo.canStart ? (
                  <button
                    onClick={handleStartQuiz}
                    disabled={quizBusy}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {quizBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>{quizInfo.buttonLabel}</span>
                  </button>
                ) : (
                  <p className="text-xs text-slate-500">Aucune tentative disponible pour ce questionnaire.</p>
                )}
              </div>
            </div>
          ) : activity ? (
            <div className="p-5 sm:p-6 space-y-5">
              {/* Visioconférence BigBlueButton intégrée */}
              {activity.bbbJoinEndpoint && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                        <Video className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-indigo-950">Classe virtuelle BigBlueButton</p>
                        <p className="text-[11px] text-indigo-700">Ouverture directe dans un nouvel onglet</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={bbbLoading}
                      onClick={async () => {
                        setBbbLoading(true);
                        const popup = window.open("", "_blank");
                        try {
                          const url = await api.resolveMoodleBbbJoin(activity.bbbJoinEndpoint!);
                          setBbbEmbedUrl(url);
                          if (popup) {
                            popup.location.href = url;
                          } else {
                            window.open(url, "_blank", "noopener,noreferrer");
                          }
                        } catch (err: any) {
                          if (popup) popup.close();
                          setError(err.message || "Impossible de rejoindre la session");
                        } finally {
                          setBbbLoading(false);
                        }
                      }}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {bbbLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                      <span>{bbbLoading ? "Connexion..." : "Ouvrir la visio"}</span>
                    </button>
                  </div>

                  {bbbEmbedUrl && (
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-indigo-200/70">
                      <span className="text-[11px] text-indigo-800">Si l&apos;onglet ne s&apos;est pas ouvert automatiquement :</span>
                      <a
                        href={bbbEmbedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-bold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1"
                      >
                        <span>Rejoindre la visio</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* External URL notice */}
              {activity.externalUrl && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-blue-900">Lien externe associé</p>
                    <p className="text-xs text-blue-700 truncate font-mono mt-0.5">{activity.externalUrl}</p>
                  </div>
                  <a
                    href={activity.externalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0"
                  >
                    <span>Ouvrir le lien</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}

              {/* Assignment Status & Submission */}
              {activity.assignInfo && (
                <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {activity.assignInfo.submissionStatus && (
                      <div className="bg-white border border-amber-100 rounded-xl p-3">
                        <span className="text-slate-500 block text-[11px]">Statut de remise</span>
                        <span className="font-bold text-slate-900">{activity.assignInfo.submissionStatus}</span>
                      </div>
                    )}
                    {activity.assignInfo.gradingStatus && (
                      <div className="bg-white border border-amber-100 rounded-xl p-3">
                        <span className="text-slate-500 block text-[11px]">Évaluation</span>
                        <span className="font-bold text-slate-900">{activity.assignInfo.gradingStatus}</span>
                      </div>
                    )}
                    {activity.assignInfo.dueDate && (
                      <div className="bg-white border border-amber-100 rounded-xl p-3">
                        <span className="text-slate-500 block text-[11px]">Date limite</span>
                        <span className="font-bold text-slate-900">{activity.assignInfo.dueDate}</span>
                      </div>
                    )}
                    {activity.assignInfo.timeRemaining && (
                      <div className="bg-white border border-amber-100 rounded-xl p-3 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                        <div>
                          <span className="text-slate-500 block text-[11px]">Temps restant</span>
                          <span className="font-bold text-slate-900">{activity.assignInfo.timeRemaining}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {activity.assignInfo.canSubmit && (
                    <form onSubmit={handleAssignSubmit} className="bg-white border border-amber-200 rounded-xl p-4 space-y-3">
                      <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Upload className="w-4 h-4 text-amber-600" />
                        <span>Déposer un travail sur Moodle</span>
                      </p>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                        <input
                          type="file"
                          onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                          className="flex-1 text-xs text-slate-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-slate-200 file:text-xs file:font-semibold file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100"
                        />
                        <button
                          type="submit"
                          disabled={!selectedFile || submitting}
                          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                        >
                          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                          <span>{submitting ? "Envoi..." : "Remettre le devoir"}</span>
                        </button>
                      </div>
                      {submitFeedback && (
                        <div
                          className={`text-xs p-2.5 rounded-lg flex items-center gap-2 ${
                            submitFeedback.ok
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              : "bg-rose-50 text-rose-700 border border-rose-200"
                          }`}
                        >
                          {submitFeedback.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                          <span>{submitFeedback.msg}</span>
                        </div>
                      )}
                    </form>
                  )}
                </div>
              )}

              {/* Attached files (Dossiers, sujets de devoirs, etc.) */}
              {activity.files.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5">
                  <p className="text-xs font-bold text-slate-800">
                    Fichiers disponibles ({activity.files.length})
                  </p>
                  <div className="divide-y divide-slate-200 bg-white border border-slate-200 rounded-xl overflow-hidden">
                    {activity.files.map((f, idx) => (
                      <div key={idx} className="px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span className="text-xs font-medium text-slate-800 truncate">{f.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => setPreviewFile(f)}
                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Aperçu</span>
                          </button>
                          <a
                            href={api.getMoodleDownloadUrl(f.url)}
                            download
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-[11px] font-semibold flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            <span>Télécharger</span>
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sanitized Moodle HTML Content */}
              {activity.html && (
                <div
                  className="prose prose-sm max-w-none text-slate-800 bg-white border border-slate-200 rounded-2xl p-5 overflow-x-auto"
                  dangerouslySetInnerHTML={{ __html: activity.html }}
                />
              )}
            </div>
          ) : null}
        </div>
      </div>

      {addToSpaceFile && (
        <AddToSpaceModal
          isOpen={Boolean(addToSpaceFile)}
          onClose={() => setAddToSpaceFile(null)}
          fileName={addToSpaceFile.name}
          fileUrl={addToSpaceFile.url}
          sourceLabel="Moodle"
        />
      )}
    </div>
  );
};
