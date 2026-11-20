import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Lightbulb,
  AlertCircle,
  Calendar,
  GraduationCap,
  Mail,
  ChevronRight,
  ArrowRight,
  Bot,
  Settings,
  RefreshCw,
} from "lucide-react";
import { AIProactiveInsight, AIUserConfig } from "../types";
import { api } from "../services/api";

interface AICopilotWidgetProps {
  onOpenCopilot: () => void;
  onOpenConfig: () => void;
  onNavigateToResource?: (code: string) => void;
  onNavigateToSchedule?: () => void;
  onNavigateToGrades?: () => void;
  onNavigateToMail?: () => void;
}

export const AICopilotWidget: React.FC<AICopilotWidgetProps> = ({
  onOpenCopilot,
  onOpenConfig,
  onNavigateToResource,
  onNavigateToSchedule,
  onNavigateToGrades,
  onNavigateToMail,
}) => {
  const [config, setConfig] = useState<AIUserConfig | null>(null);
  const [insights, setInsights] = useState<AIProactiveInsight[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const conf = await api.getAIConfig();
      setConfig(conf);
      if (conf.enabled && conf.enableProactive) {
        const res = await api.getAIProactiveInsights();
        setInsights(res.insights || []);
      }
    } catch (e) {
      console.error("Erreur chargement widget IA:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="p-4 rounded-2xl bg-white border border-slate-200 flex items-center justify-center gap-2 text-xs text-slate-400">
        <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
        <span>Chargement du Copilot IA...</span>
      </div>
    );
  }

  // Si l'IA n'est pas encore activée
  if (!config?.enabled) {
    return (
      <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-purple-50/70 border border-blue-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              Activer le Copilot IA &amp; Outils
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                Nouveau
              </span>
            </h4>
            <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
              Connectez votre modèle préféré (Ollama local, OpenRouter, Claude, Mistral, Google Gemini) pour obtenir une aide à la
              rédaction de cours, des conseils personnalisés et des alertes automatiques.
            </p>
          </div>
        </div>

        <button
          onClick={onOpenConfig}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Configurer l'IA</span>
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-xs overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-blue-50/30">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              Conseils Proactifs du Copilot IA
              <span className="text-[10px] font-mono px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md font-semibold uppercase">
                {config.activeProvider}
              </span>
            </h4>
            <p className="text-[11px] text-slate-500">
              Analyse continue de votre emploi du temps, cahier de texte et évaluations
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            title="Rafraîchir les analyses"
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onOpenCopilot}
            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer border border-blue-200"
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Discuter avec l'IA</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Liste des cartes d'insights */}
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {insights.map((ins) => {
          const isHigh = ins.urgency === "high";
          const isMedium = ins.urgency === "medium";

          let Icon = Lightbulb;
          let iconColor = "text-amber-500 bg-amber-50 border-amber-200";

          if (ins.type === "urgent_homework") {
            Icon = AlertCircle;
            iconColor = "text-rose-500 bg-rose-50 border-rose-200";
          } else if (ins.type === "upcoming_exam") {
            Icon = Calendar;
            iconColor = "text-purple-500 bg-purple-50 border-purple-200";
          } else if (ins.type === "grade_alert") {
            Icon = GraduationCap;
            iconColor = "text-emerald-500 bg-emerald-50 border-emerald-200";
          } else if (ins.type === "teacher_email") {
            Icon = Mail;
            iconColor = "text-blue-500 bg-blue-50 border-blue-200";
          }

          return (
            <div
              key={ins.id}
              className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                isHigh
                  ? "bg-rose-50/30 border-rose-200 hover:border-rose-300"
                  : isMedium
                  ? "bg-amber-50/20 border-amber-200 hover:border-amber-300"
                  : "bg-white border-slate-200 hover:border-slate-300"
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`p-1.5 rounded-lg border ${iconColor}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    {ins.resourceCode && (
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                        {ins.resourceCode}
                      </span>
                    )}
                  </div>
                  {isHigh && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                      Prioritaire
                    </span>
                  )}
                </div>

                <h5 className="text-xs font-bold text-slate-900 line-clamp-1">{ins.title}</h5>
                <p className="text-[11px] text-slate-600 mt-1 leading-relaxed line-clamp-2">
                  {ins.description}
                </p>
              </div>

              {ins.actionText && (
                <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                  <button
                    onClick={() => {
                      if (ins.actionType === "open_resource" && ins.actionData?.resourceCode && onNavigateToResource) {
                        onNavigateToResource(ins.actionData.resourceCode);
                      } else if (ins.actionType === "open_schedule" && onNavigateToSchedule) {
                        onNavigateToSchedule();
                      } else if (ins.actionType === "open_grades" && onNavigateToGrades) {
                        onNavigateToGrades();
                      } else if (ins.actionType === "open_mail" && onNavigateToMail) {
                        onNavigateToMail();
                      } else {
                        onOpenCopilot();
                      }
                    }}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <span>{ins.actionText}</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
