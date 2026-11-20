import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  X,
  Send,
  Bot,
  User,
  Wrench,
  ChevronRight,
  Maximize2,
  Minimize2,
  Settings,
  Calendar,
  CheckSquare,
  GraduationCap,
  Lightbulb,
  ExternalLink,
  Presentation,
  FileText,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { AIMessage, AIUserConfig, AIProactiveInsight } from "../types";
import { api } from "../services/api";

interface AICopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenConfig: () => void;
  onNavigateToResource?: (code: string) => void;
  onNavigateToSchedule?: () => void;
  onNavigateToGrades?: () => void;
  onNavigateToMail?: () => void;
}

export const AICopilotDrawer: React.FC<AICopilotDrawerProps> = ({
  isOpen,
  onClose,
  onOpenConfig,
  onNavigateToResource,
  onNavigateToSchedule,
  onNavigateToGrades,
  onNavigateToMail,
}) => {
  const [messages, setMessages] = useState<AIMessage[]>([
    {
      role: "assistant",
      content: `👋 Bonjour ! Je suis votre **Copilot Universitaire BUT Réseaux & Télécoms**.

J'ai un accès direct à vos outils :
- 🎓 **Moodle eCampus Unicaen** (cours, diaporamas PDF, consignes de TP)
- 🏫 **Écosystème Unicaen & UniCloud** (salles campus 3, enseignants, fichiers cloud)
- 📅 **Emploi du temps ADE** (cours, horaires, changements de salle)
- 📊 **Notes & moyennes Webnotes**
- 📝 **Cahier de texte & devoirs**
- ✉️ **Courriels Zimbra**

Posez-moi une question ou demandez-moi une action (ex : *"Cherche le support de cours de routage sur Moodle"*, *"Dans quelle salle est le TP de R201 ?"*, *"Quels cours ai-je demain ?"*).`,
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiConfig, setAiConfig] = useState<AIUserConfig | null>(null);
  const [insights, setInsights] = useState<AIProactiveInsight[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Charger la configuration et les insights proactifs au montage
  useEffect(() => {
    if (!isOpen) return;
    const fetchMeta = async () => {
      try {
        const conf = await api.getAIConfig();
        setAiConfig(conf);
        if (conf.enabled && conf.enableProactive) {
          const res = await api.getAIProactiveInsights();
          setInsights(res.insights || []);
        }
      } catch (e) {
        console.error("Erreur chargement Copilot:", e);
      }
    };
    fetchMeta();
  }, [isOpen]);

  // Scroll automatique en bas des messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleSend = async (textToSend?: string) => {
    const text = textToSend || inputValue.trim();
    if (!text || loading) return;

    if (!aiConfig?.enabled) {
      onOpenConfig();
      return;
    }

    const newMessages: AIMessage[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInputValue("");
    setLoading(true);

    try {
      const res = await api.chatAI(newMessages);
      setMessages([...newMessages, res.message]);

      if (res.toolsExecuted && Array.isArray(res.toolsExecuted)) {
        for (const t of res.toolsExecuted) {
          if (t.name === "create_slide_deck") {
            window.dispatchEvent(new CustomEvent("cartable:slides-updated"));
          }
          if (t.name === "create_note") {
            window.dispatchEvent(new CustomEvent("cartable:notes-updated"));
          }
        }
      }
    } catch (e: any) {
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: `⚠️ **Erreur :** ${e.message || "Une erreur est survenue lors de la communication avec l'IA."}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    handleSend(prompt);
  };

  return (
    <div
      className={`fixed bottom-0 right-0 z-50 bg-white border-t md:border-l border-slate-200 shadow-2xl transition-all duration-300 flex flex-col ${
        isExpanded
          ? "w-full md:w-[700px] h-full md:h-[90vh] md:rounded-tl-2xl"
          : "w-full md:w-[460px] h-[85vh] md:h-[680px] md:rounded-tl-2xl"
      }`}
    >
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-slate-200 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white flex items-center justify-between shrink-0 md:rounded-tl-2xl">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-xs flex items-center justify-center text-white">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold flex items-center gap-1.5">
              Copilot Universitaire IA
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 bg-white/20 rounded-md">
                {aiConfig?.activeProvider ? aiConfig.activeProvider : "Agent"}
              </span>
            </h3>
            <p className="text-[11px] text-blue-100 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              Connecté aux outils du Cartable
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 text-white/80">
          <button
            onClick={onOpenConfig}
            title="Paramètres de l'IA"
            className="p-1.5 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? "Réduire" : "Agrandir"}
            className="p-1.5 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer hidden md:block"
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            title="Fermer le Copilot"
            className="p-1.5 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Alerte si IA désactivée */}
      {!aiConfig?.enabled && (
        <div className="p-3 bg-amber-50 border-b border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-2">
          <span>⚠️ L'IA n'est pas encore configurée ou activée.</span>
          <button
            onClick={onOpenConfig}
            className="px-2.5 py-1 bg-amber-600 text-white rounded-md font-semibold text-[11px] hover:bg-amber-700 transition-colors shrink-0 cursor-pointer"
          >
            Activer maintenant
          </button>
        </div>
      )}

      {/* Bandeau Proactif si alertes détectées */}
      {insights.length > 0 && (
        <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 text-xs flex items-center gap-2 overflow-x-auto shrink-0">
          <span className="font-bold text-[10.5px] uppercase tracking-wider text-slate-500 shrink-0 flex items-center gap-1">
            <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
            Alertes :
          </span>
          <div className="flex items-center gap-1.5 flex-nowrap">
            {insights.slice(0, 3).map((ins) => (
              <button
                key={ins.id}
                onClick={() => {
                  if (ins.actionType === "open_resource" && ins.actionData?.resourceCode && onNavigateToResource) {
                    onNavigateToResource(ins.actionData.resourceCode);
                  } else if (ins.actionType === "open_schedule" && onNavigateToSchedule) {
                    onNavigateToSchedule();
                  } else if (ins.actionType === "open_grades" && onNavigateToGrades) {
                    onNavigateToGrades();
                  } else if (ins.actionType === "open_mail" && onNavigateToMail) {
                    onNavigateToMail();
                  }
                }}
                className={`px-2 py-0.5 rounded-full border text-[11px] font-medium shrink-0 flex items-center gap-1 transition-all cursor-pointer ${
                  ins.urgency === "high"
                    ? "bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100"
                    : "bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100"
                }`}
              >
                <span>{ins.title}</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages Feed */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50/50">
        {messages.map((m, idx) => {
          const isUser = m.role === "user";
          return (
            <div key={idx} className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}>
              {!isUser && (
                <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                  <Bot className="w-4 h-4" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                  isUser
                    ? "bg-blue-600 text-white rounded-br-xs shadow-xs"
                    : "bg-white text-slate-800 border border-slate-200 rounded-bl-xs shadow-xs"
                }`}
              >
                {/* Badges Outils exécutés */}
                {m.toolCalls && m.toolCalls.length > 0 && (
                  <div className="mb-2 pb-2 border-b border-slate-100 flex items-center gap-1.5 flex-wrap">
                    {m.toolCalls.map((tc, tcIdx) => (
                      <span
                        key={tcIdx}
                        className="text-[10px] font-mono px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md border border-indigo-200 flex items-center gap-1"
                      >
                        <Wrench className="w-3 h-3 text-indigo-500" />
                        <span>Outil : {tc.name}</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* Contenu Markdown */}
                <div className="prose prose-xs max-w-none text-inherit dark:prose-invert">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {m.content}
                  </ReactMarkdown>
                </div>
              </div>
              {isUser && (
                <div className="w-7 h-7 rounded-lg bg-slate-800 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}

        {loading && (
          <div className="flex gap-2.5 items-center text-xs text-slate-500 bg-white p-3 rounded-xl border border-slate-200 w-fit">
            <div className="w-2 h-2 rounded-full bg-blue-600 animate-bounce"></div>
            <div className="w-2 h-2 rounded-full bg-blue-600 animate-bounce [animation-delay:0.2s]"></div>
            <div className="w-2 h-2 rounded-full bg-blue-600 animate-bounce [animation-delay:0.4s]"></div>
            <span className="text-[11px] text-slate-600 font-medium ml-1">L'IA analyse vos données...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts */}
      <div className="px-4 py-2 border-t border-slate-200 bg-white flex items-center gap-1.5 overflow-x-auto shrink-0">
        <button
          onClick={() => handleQuickPrompt("Quels cours ai-je demain et dans quelles salles ?")}
          className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 font-medium border border-slate-200 shrink-0 transition-colors flex items-center gap-1 cursor-pointer"
        >
          <Calendar className="w-3 h-3 text-blue-600" />
          <span>Cours de demain</span>
        </button>
        <button
          onClick={() => handleQuickPrompt("Quels devoirs et leçons ai-je à faire dans mon cahier de texte ?")}
          className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 font-medium border border-slate-200 shrink-0 transition-colors flex items-center gap-1 cursor-pointer"
        >
          <CheckSquare className="w-3 h-3 text-emerald-600" />
          <span>Devoirs à faire</span>
        </button>
        <button
          onClick={() => handleQuickPrompt("Fais-moi un bilan de mes notes et moyennes récentes")}
          className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 hover:bg-purple-50 hover:text-purple-700 text-slate-600 font-medium border border-slate-200 shrink-0 transition-colors flex items-center gap-1 cursor-pointer"
        >
          <GraduationCap className="w-3 h-3 text-purple-600" />
          <span>Bilan des notes</span>
        </button>
        <button
          onClick={() => handleQuickPrompt("Crée un diapo sur le CM de R101 en t'appuyant sur les documents eCampus")}
          className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 font-medium border border-slate-200 shrink-0 transition-colors flex items-center gap-1 cursor-pointer"
        >
          <Presentation className="w-3 h-3 text-indigo-600" />
          <span>Diapo CM R101</span>
        </button>
        <button
          onClick={() => handleQuickPrompt("Fais un résumé du CM de R101 en t'appuyant sur eCampus")}
          className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 hover:bg-teal-50 hover:text-teal-700 text-slate-600 font-medium border border-slate-200 shrink-0 transition-colors flex items-center gap-1 cursor-pointer"
        >
          <FileText className="w-3 h-3 text-teal-600" />
          <span>Résumé CM R101</span>
        </button>
        <button
          onClick={() => handleQuickPrompt("Cherche sur Moodle les documents et cours disponibles")}
          className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 hover:bg-amber-50 hover:text-amber-700 text-slate-600 font-medium border border-slate-200 shrink-0 transition-colors flex items-center gap-1 cursor-pointer"
        >
          <span>🎓 Cours Moodle</span>
        </button>
        <button
          onClick={() => handleQuickPrompt("Trouve les enseignants et contacts du département BUT RT Unicaen")}
          className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 hover:bg-cyan-50 hover:text-cyan-700 text-slate-600 font-medium border border-slate-200 shrink-0 transition-colors flex items-center gap-1 cursor-pointer"
        >
          <span>🏫 Enseignants &amp; Salles</span>
        </button>
      </div>

      {/* Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="p-3 border-t border-slate-200 bg-white flex items-center gap-2 shrink-0"
      >
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={
            aiConfig?.enabled
              ? "Demandez une révision, un devoir, votre emploi du temps..."
              : "Activez l'IA pour discuter..."
          }
          disabled={!aiConfig?.enabled || loading}
          className="flex-1 px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!inputValue.trim() || loading || !aiConfig?.enabled}
          className="p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
