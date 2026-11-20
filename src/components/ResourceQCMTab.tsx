import React, { useState, useEffect } from "react";
import {
  HelpCircle,
  Plus,
  Sparkles,
  Award,
  Play,
  RotateCw,
  Trash2,
  Calendar,
  CheckCircle2,
  Clock,
  BookOpen,
} from "lucide-react";
import { Resource, QCMQuiz, MoodleCourse } from "../types";
import { api } from "../services/api";
import { QCMRunnerModal } from "./QCMRunnerModal";
import { QCMGeneratorModal } from "./QCMGeneratorModal";

interface ResourceQCMTabProps {
  resource: Resource;
  moodleCourse?: MoodleCourse | null;
  createTrigger?: number;
}

export const ResourceQCMTab: React.FC<ResourceQCMTabProps> = ({
  resource,
  moodleCourse,
  createTrigger,
}) => {
  const [qcms, setQcms] = useState<QCMQuiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeQuiz, setActiveQuiz] = useState<QCMQuiz | null>(null);
  const [showGeneratorModal, setShowGeneratorModal] = useState(false);

  const fetchQCMs = async () => {
    setLoading(true);
    try {
      const data = await api.getQCMs(resource.code);
      setQcms(data);
    } catch (err) {
      console.error("Erreur chargement QCMs:", err);
      setQcms([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQCMs();
  }, [resource.code]);

  useEffect(() => {
    if (createTrigger && createTrigger > 0) {
      setShowGeneratorModal(true);
    }
  }, [createTrigger]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Voulez-vous vraiment supprimer ce QCM ?")) return;
    try {
      await api.deleteQCM(id);
      fetchQCMs();
    } catch (err: any) {
      alert("Erreur suppression: " + err.message);
    }
  };

  // Quick Stats
  const attemptedQCMs = qcms.filter((q) => q.bestScore !== undefined);
  const averageBestScore =
    attemptedQCMs.length > 0
      ? (
          attemptedQCMs.reduce((acc, q) => acc + (q.bestScore || 0), 0) /
          attemptedQCMs.length
        ).toFixed(1)
      : null;

  return (
    <div className="space-y-6">
      {/* Top Banner with Stats & Action */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center font-bold text-lg shrink-0 shadow-xs">
            <HelpCircle className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">
                Auto-évaluation & QCMs ({qcms.length})
              </h3>
              {averageBestScore !== null && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Moyenne : {averageBestScore}/20
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Entraînez-vous avec des QCMs interactifs créés à partir de vos cours et feuilles de TD
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          <button
            onClick={() => setShowGeneratorModal(true)}
            className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Générer avec l'IA</span>
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="text-center py-12 text-xs text-slate-400">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <span>Chargement des QCMs...</span>
        </div>
      ) : qcms.length === 0 ? (
        /* Empty State */
        <div className="text-center py-16 bg-white border border-dashed border-slate-200 rounded-2xl p-6">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto mb-3 text-indigo-600">
            <HelpCircle className="w-6 h-6" />
          </div>
          <h4 className="text-slate-800 font-semibold text-sm">
            Aucun QCM créé pour le moment
          </h4>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Générez votre premier QCM d'entraînement à partir de vos photos de feuilles ou des cours eCampus Moodle avec l'IA.
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              onClick={() => setShowGeneratorModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-medium rounded-lg inline-flex items-center gap-2 shadow-xs transition-all"
            >
              <Sparkles className="w-4 h-4" />
              <span>Générer un premier QCM</span>
            </button>
          </div>
        </div>
      ) : (
        /* QCM Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {qcms.map((quiz) => {
            const hasAttempted = quiz.bestScore !== undefined;

            return (
              <div
                key={quiz.id}
                onClick={() => setActiveQuiz(quiz)}
                className="p-5 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 cursor-pointer transition-colors group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        quiz.difficulty === "facile"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : quiz.difficulty === "difficile"
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : "bg-indigo-50 text-indigo-700 border-indigo-200"
                      }`}
                    >
                      {quiz.difficulty.toUpperCase()}
                    </span>

                    <button
                      onClick={(e) => handleDelete(quiz.id, e)}
                      className="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                      title="Supprimer ce QCM"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <h4 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-2">
                    {quiz.title}
                  </h4>

                  <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1 font-medium">
                      <HelpCircle className="w-3.5 h-3.5 text-indigo-500" />
                      {quiz.questions.length} question{quiz.questions.length > 1 ? "s" : ""}
                    </span>

                    {hasAttempted ? (
                      <span className="flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[11px]">
                        <Award className="w-3 h-3 text-amber-500" />
                        Record : {quiz.bestScore}/20
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded font-medium">
                        Jamais testé
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-indigo-600">
                  <span className="flex items-center gap-1">
                    <Play className="w-3.5 h-3.5 fill-indigo-600" />
                    {hasAttempted ? "Recommencer le QCM" : "Lancer le QCM"}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {new Date(quiz.createdAt).toLocaleDateString("fr-FR")}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Runner Modal */}
      {activeQuiz && (
        <QCMRunnerModal
          isOpen={!!activeQuiz}
          onClose={() => {
            setActiveQuiz(null);
            fetchQCMs();
          }}
          quiz={activeQuiz}
          onQuizUpdated={(updated) => {
            setActiveQuiz(updated);
            fetchQCMs();
          }}
        />
      )}

      {/* Generator Modal */}
      {showGeneratorModal && (
        <QCMGeneratorModal
          isOpen={showGeneratorModal}
          onClose={() => setShowGeneratorModal(false)}
          resource={resource}
          moodleCourse={moodleCourse}
          onQuizCreated={(newQuiz) => {
            fetchQCMs();
            setActiveQuiz(newQuiz);
          }}
        />
      )}
    </div>
  );
};
