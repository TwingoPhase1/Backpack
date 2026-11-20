import React, { useState, useEffect } from "react";
import {
  X,
  CheckCircle2,
  XCircle,
  Clock,
  Award,
  RotateCw,
  ArrowRight,
  ArrowLeft,
  BookOpen,
  Sparkles,
  HelpCircle,
  Check,
  Download,
  Flame,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { QCMQuiz, QCMQuestion } from "../types";
import { api } from "../services/api";

interface QCMRunnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  quiz: QCMQuiz;
  onQuizUpdated?: (updated: QCMQuiz) => void;
}

export const QCMRunnerModal: React.FC<QCMRunnerModalProps> = ({
  isOpen,
  onClose,
  quiz,
  onQuizUpdated,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [isSavingScore, setIsSavingScore] = useState(false);
  const [latestQuiz, setLatestQuiz] = useState<QCMQuiz>(quiz);

  // Reset or initialize state when a quiz is opened
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0);
      setSelectedAnswers({});
      setIsSubmitted(false);
      setReviewMode(false);
      setSecondsElapsed(0);
      setLatestQuiz(quiz);
    }
  }, [isOpen, quiz.id]);

  // Timer
  useEffect(() => {
    if (!isOpen || isSubmitted) return;
    const interval = setInterval(() => {
      setSecondsElapsed((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, isSubmitted]);

  // Keyboard navigation for A, B, C, D
  useEffect(() => {
    if (!isOpen || isSubmitted) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toUpperCase();
      const validKeys = ["A", "B", "C", "D", "1", "2", "3", "4"];
      if (validKeys.includes(key)) {
        const mappedOption =
          key === "1" ? "A" : key === "2" ? "B" : key === "3" ? "C" : key === "4" ? "D" : key;
        const currentQ = latestQuiz.questions[currentIndex];
        if (currentQ && currentQ.options.some((o) => o.id === mappedOption)) {
          setSelectedAnswers((prev) => ({ ...prev, [currentQ.id]: mappedOption }));
        }
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        if (currentIndex < latestQuiz.questions.length - 1) {
          setCurrentIndex((i) => i + 1);
        }
      } else if (e.key === "ArrowLeft") {
        if (currentIndex > 0) {
          setCurrentIndex((i) => i - 1);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitted, currentIndex, latestQuiz.questions]);

  if (!isOpen) return null;

  const currentQ: QCMQuestion | undefined = latestQuiz.questions[currentIndex];
  const totalQuestions = latestQuiz.questions.length;
  const answeredCount = Object.keys(selectedAnswers).length;

  // Calcul du score
  let correctCount = 0;
  latestQuiz.questions.forEach((q) => {
    if (selectedAnswers[q.id] === q.correctOptionId) {
      correctCount += 1;
    }
  });
  const scoreOutOf20 = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 20 * 10) / 10 : 0;

  const handleSelectOption = (questionId: string, optionId: string) => {
    if (isSubmitted) return;
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: optionId,
    }));
  };

  const handleSubmitQuiz = async () => {
    setIsSubmitted(true);
    setReviewMode(true);
    setIsSavingScore(true);
    try {
      const updated = await api.submitQCMAttempt(latestQuiz.id, scoreOutOf20, 20);
      setLatestQuiz(updated);
      if (onQuizUpdated) onQuizUpdated(updated);
    } catch (err) {
      console.error("Erreur enregistrement score QCM:", err);
    } finally {
      setIsSavingScore(false);
    }
  };

  const handleRestart = () => {
    setSelectedAnswers({});
    setIsSubmitted(false);
    setReviewMode(false);
    setCurrentIndex(0);
    setSecondsElapsed(0);
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs select-none">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header Bar */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
              <HelpCircle className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                  {latestQuiz.resourceCode}
                </span>
                <span className="text-xs text-slate-500 font-medium truncate">
                  {latestQuiz.title}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {!isSubmitted && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-700 shadow-2xs">
                <Clock className="w-3.5 h-3.5 text-indigo-600" />
                <span>{formatTimer(secondsElapsed)}</span>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        {!isSubmitted ? (
          /* Active Question Step */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Progress bar */}
            <div className="w-full bg-slate-100 h-1.5 shrink-0">
              <div
                className="bg-gradient-to-r from-indigo-600 to-violet-600 h-1.5 transition-all duration-300"
                style={{
                  width: `${((currentIndex + 1) / totalQuestions) * 100}%`,
                }}
              />
            </div>

            {/* Stepper info */}
            <div className="px-6 pt-4 pb-2 flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold text-indigo-700">
                Question {currentIndex + 1} sur {totalQuestions}
              </span>
              <span className="font-mono">
                {answeredCount}/{totalQuestions} répondue{answeredCount > 1 ? "s" : ""}
              </span>
            </div>

            {/* Question Content */}
            {currentQ && (
              <div className="flex-1 overflow-y-auto px-6 py-3 space-y-5">
                <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4">
                  <div className="text-base font-bold text-slate-900 leading-snug prose prose-sm max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {currentQ.question}
                    </ReactMarkdown>
                  </div>
                </div>

                {/* Options List */}
                <div className="space-y-2.5">
                  {currentQ.options.map((option, idx) => {
                    const isSelected = selectedAnswers[currentQ.id] === option.id;
                    const letter = option.id;

                    return (
                      <div
                        key={option.id}
                        onClick={() => handleSelectOption(currentQ.id, option.id)}
                        className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-3.5 ${
                          isSelected
                            ? "border-indigo-600 bg-indigo-50/60 shadow-xs"
                            : "border-slate-200 hover:border-indigo-300 bg-white"
                        }`}
                      >
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 transition-colors ${
                            isSelected
                              ? "bg-indigo-600 text-white"
                              : "bg-slate-100 text-slate-600 border border-slate-300"
                          }`}
                        >
                          {letter}
                        </div>
                        <div className="flex-1 text-sm font-medium text-slate-800 leading-relaxed pt-0.5 prose prose-sm max-w-none">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                          >
                            {option.text}
                          </ReactMarkdown>
                        </div>
                        <div className="shrink-0 pt-1">
                          <div
                            className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                              isSelected
                                ? "border-indigo-600 bg-indigo-600 text-white"
                                : "border-slate-300 bg-white"
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3" />}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Bottom Nav Bar */}
            <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              <button
                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                disabled={currentIndex === 0}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Précédente</span>
              </button>

              <div className="flex items-center gap-1.5 overflow-x-auto max-w-[200px] no-scrollbar">
                {latestQuiz.questions.map((q, idx) => (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIndex(idx)}
                    className={`w-6 h-6 rounded-md text-[11px] font-bold transition-all ${
                      currentIndex === idx
                        ? "bg-indigo-600 text-white scale-110 shadow-xs"
                        : selectedAnswers[q.id]
                        ? "bg-indigo-100 text-indigo-800 border border-indigo-200"
                        : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                    }`}
                  >
                    {idx + 1}
                  </button>
                ))}
              </div>

              {currentIndex < totalQuestions - 1 ? (
                <button
                  onClick={() => setCurrentIndex((i) => Math.min(totalQuestions - 1, i + 1))}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
                >
                  <span>Suivante</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={handleSubmitQuiz}
                  className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all animate-pulse"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Valider le QCM</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Results & Pedagogical Review Screen */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Score Banner */}
            <div className="p-6 bg-gradient-to-b from-indigo-50/50 to-white border-b border-slate-200 shrink-0 text-center">
              <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-white border border-indigo-100 shadow-md mb-3">
                <div className="relative flex items-center justify-center">
                  <div
                    className={`w-20 h-20 rounded-full border-4 flex flex-col items-center justify-center ${
                      scoreOutOf20 >= 14
                        ? "border-emerald-500 text-emerald-700"
                        : scoreOutOf20 >= 10
                        ? "border-amber-500 text-amber-700"
                        : "border-rose-500 text-rose-700"
                    }`}
                  >
                    <span className="text-2xl font-black font-mono leading-none">
                      {scoreOutOf20}
                    </span>
                    <span className="text-[11px] font-bold text-slate-400">/20</span>
                  </div>
                </div>
              </div>

              <h3 className="text-lg font-bold text-slate-900">
                {scoreOutOf20 >= 16
                  ? "🎉 Excellent travail ! Maîtrise parfaite."
                  : scoreOutOf20 >= 12
                  ? "👍 Bon résultat ! Les bases sont solides."
                  : scoreOutOf20 >= 10
                  ? "💪 Juste au-dessus de la moyenne. Révisez les corrections !"
                  : "⚠️ Des notions à consolider. Prenez le temps de lire les explications ci-dessous."}
              </h3>

              <div className="flex items-center justify-center gap-4 text-xs text-slate-500 mt-2 font-medium">
                <span>
                  <strong>{correctCount}</strong> bonnes réponses sur <strong>{totalQuestions}</strong>
                </span>
                <span>•</span>
                <span>Temps : <strong>{formatTimer(secondsElapsed)}</strong></span>
                {latestQuiz.bestScore !== undefined && (
                  <>
                    <span>•</span>
                    <span className="text-amber-700 font-bold flex items-center gap-1">
                      <Award className="w-3.5 h-3.5" />
                      Record : {latestQuiz.bestScore}/20
                    </span>
                  </>
                )}
              </div>

              <div className="mt-4 flex items-center justify-center gap-2.5">
                <button
                  onClick={handleRestart}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Recommencer le QCM</span>
                </button>
                <button
                  onClick={onClose}
                  className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>

            {/* Questions Review List with Corrections */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Corrigé détaillé et explications pas-à-pas ({totalQuestions} questions)
              </div>

              {latestQuiz.questions.map((q, idx) => {
                const userChoice = selectedAnswers[q.id];
                const isCorrect = userChoice === q.correctOptionId;

                return (
                  <div
                    key={q.id}
                    className={`p-4 rounded-xl border transition-all ${
                      isCorrect
                        ? "bg-emerald-50/40 border-emerald-200"
                        : "bg-rose-50/40 border-rose-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0 ${
                            isCorrect
                              ? "bg-emerald-600 text-white"
                              : "bg-rose-600 text-white"
                          }`}
                        >
                          {isCorrect ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                        </span>
                        <span className="text-xs font-bold text-slate-700 font-mono">
                          Question {idx + 1}
                        </span>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          isCorrect
                            ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                            : "bg-rose-100 text-rose-800 border-rose-200"
                        }`}
                      >
                        {isCorrect ? "+1 pt" : "0 pt"}
                      </span>
                    </div>

                    <div className="text-sm font-semibold text-slate-900 mb-3 prose prose-sm max-w-none">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                      >
                        {q.question}
                      </ReactMarkdown>
                    </div>

                    {/* Options status */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                      {q.options.map((opt) => {
                        const isRightAnswer = opt.id === q.correctOptionId;
                        const isUserAnswer = opt.id === userChoice;

                        let style = "bg-white border-slate-200 text-slate-700";
                        if (isRightAnswer) {
                          style = "bg-emerald-100/70 border-emerald-300 text-emerald-950 font-semibold";
                        } else if (isUserAnswer && !isRightAnswer) {
                          style = "bg-rose-100/70 border-rose-300 text-rose-950 line-through";
                        }

                        return (
                          <div
                            key={opt.id}
                            className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${style}`}
                          >
                            <span className="font-bold shrink-0">{opt.id}.</span>
                            <span className="flex-1">{opt.text}</span>
                            {isRightAnswer && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                            )}
                            {isUserAnswer && !isRightAnswer && (
                              <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Pedagogical Explanation Box */}
                    {q.explanation && (
                      <div className="bg-white/80 border border-slate-200/80 rounded-lg p-3 text-xs text-slate-700 prose prose-xs max-w-none">
                        <strong className="text-indigo-900 block mb-1">
                          💡 Explication didactique :
                        </strong>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath]}
                          rehypePlugins={[rehypeKatex]}
                        >
                          {q.explanation}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
