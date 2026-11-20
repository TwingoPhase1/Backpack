import React, { useState, useEffect } from "react";
import {
  X,
  Bot,
  Sparkles,
  Check,
  AlertTriangle,
  Server,
  Key,
  ShieldCheck,
  Wrench,
  Lightbulb,
  Zap,
  Info,
  RefreshCw,
  Plus,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronUp,
  Sliders,
} from "lucide-react";
import {
  AIProvider,
  AIUserConfig,
  AIProviderConfig,
  AIDefaultRole,
  AITaskRole,
  AIModelProfile,
  AICustomRole,
} from "../types";
import { api } from "../services/api";

interface AIConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved?: (config: AIUserConfig) => void;
}

const PROVIDER_METADATA: Record<
  AIProvider,
  {
    name: string;
    description: string;
    icon: string;
    defaultModel: string;
    modelSuggestions: string[];
    needsApiKey: boolean;
    needsBaseUrl: boolean;
    defaultBaseUrl?: string;
  }
> = {
  ollama: {
    name: "Ollama (Llama Local)",
    description: "Modèle open-source exécuté 100% en local sur votre machine ou réseau, sans coût d'API.",
    icon: "🦙",
    defaultModel: "llama3.2",
    modelSuggestions: ["llama3.2", "mistral", "qwen2.5", "deepseek-r1:8b", "phi3"],
    needsApiKey: false,
    needsBaseUrl: true,
    defaultBaseUrl: "http://localhost:11434",
  },
  openrouter: {
    name: "OpenRouter",
    description: "Passerelle unifiée donnant accès à tous les modèles (Claude 3.5, Llama 3.3, DeepSeek, GPT-4o).",
    icon: "🌐",
    defaultModel: "meta-llama/llama-3.3-70b-instruct",
    modelSuggestions: [
      "meta-llama/llama-3.3-70b-instruct",
      "anthropic/claude-3.5-sonnet",
      "deepseek/deepseek-chat",
      "google/gemini-2.0-flash-001",
      "mistralai/mistral-large-2411",
    ],
    needsApiKey: true,
    needsBaseUrl: false,
  },
  claude: {
    name: "Claude (Anthropic)",
    description: "Intelligence de pointe pour la rédaction, la pédagogie et l'analyse de cours d'ingénierie et réseaux.",
    icon: "🧠",
    defaultModel: "claude-3-5-sonnet-latest",
    modelSuggestions: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"],
    needsApiKey: true,
    needsBaseUrl: false,
  },
  mistral: {
    name: "Mistral AI",
    description: "Modèles européens haute performance (Mistral Large, Codestral pour la programmation).",
    icon: "🌪️",
    defaultModel: "mistral-large-latest",
    modelSuggestions: ["mistral-large-latest", "codestral-latest", "mistral-small-latest"],
    needsApiKey: true,
    needsBaseUrl: false,
  },
  google: {
    name: "Google Gemini",
    description: "Modèles rapides et multimodaux de Google AI Studio (Gemini 2.5 Flash & Pro).",
    icon: "✨",
    defaultModel: "gemini-2.5-flash",
    modelSuggestions: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite", "gemini-2.0-flash"],
    needsApiKey: true,
    needsBaseUrl: false,
  },
};

const DEFAULT_ROLE_CARDS: Array<{ id: AIDefaultRole; label: string; icon: string; desc: string }> = [
  { id: "copilot", label: "Copilot & Chat", icon: "💬", desc: "Assistant chat, rédaction d'e-mails, aide sur les notes" },
  { id: "generator", label: "Générateur", icon: "✨", desc: "Diaporamas, synthèses Markdown, exercices TD, QCM" },
  { id: "agent", label: "Agent Autonome", icon: "🤖", desc: "Triage mails, mise à jour EDT & visio, quiz Moodle" },
];

const GRANULAR_TASKS: Array<{ id: AITaskRole; label: string; parent: AIDefaultRole }> = [
  { id: "chat", label: "Chat Copilot", parent: "copilot" },
  { id: "mail_compose", label: "Rédaction d'e-mails", parent: "copilot" },
  { id: "document_assist", label: "Assistant de rédaction (Notes)", parent: "copilot" },
  { id: "slides", label: "Générateur de Diaporamas", parent: "generator" },
  { id: "summary", label: "Fiches de synthèse", parent: "generator" },
  { id: "td_exercises", label: "Exercices de TD & Photo", parent: "generator" },
  { id: "qcm", label: "Générateur de QCM", parent: "generator" },
  { id: "mail_triage", label: "Triage & Résumé des mails", parent: "agent" },
  { id: "schedule_agent", label: "Agent EDT & liens visio", parent: "agent" },
  { id: "quiz_helper", label: "Quiz Moodle & Recherche Web", parent: "agent" },
];

export const AIConfigModal: React.FC<AIConfigModalProps> = ({ isOpen, onClose, onConfigSaved }) => {
  const [config, setConfig] = useState<AIUserConfig>({
    enabled: false,
    activeProvider: "ollama",
    providers: {
      ollama: { baseUrl: "http://localhost:11434", model: "llama3.2" },
      openrouter: { apiKey: "", model: "meta-llama/llama-3.3-70b-instruct" },
      claude: { apiKey: "", model: "claude-3-5-sonnet-latest" },
      mistral: { apiKey: "", model: "mistral-large-latest" },
      google: { apiKey: "", model: "gemini-2.5-flash" },
    },
    enableTools: true,
    enableProactive: true,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<{
    running: boolean;
    success?: boolean;
    message?: string;
  }>({ running: false });
  const [apiModels, setApiModels] = useState<Partial<Record<AIProvider, string[]>>>({});
  const [modelsSource, setModelsSource] = useState<Partial<Record<AIProvider, "api" | "fallback">>>({});
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelFilter, setModelFilter] = useState("");
  const [activeModelTarget, setActiveModelTarget] = useState<"model" | "proactiveModel" | "documentModel">("model");

  // Multi-IA Profiles & Rôles Granulaires
  const [showGranularTasks, setShowGranularTasks] = useState(false);
  const [editingProfile, setEditingProfile] = useState<AIModelProfile | null>(null);
  const [profileTestStatus, setProfileTestStatus] = useState<Record<string, { running: boolean; ok?: boolean; msg?: string }>>({});
  const [showNewCustomRole, setShowNewCustomRole] = useState(false);
  const [newCustomRoleName, setNewCustomRoleName] = useState("");
  const [newCustomRoleDesc, setNewCustomRoleDesc] = useState("");
  const [newCustomRoleProfileId, setNewCustomRoleProfileId] = useState("");

  const fetchModelsForProvider = async (provider: AIProvider, providerCfg?: AIProviderConfig) => {
    setModelsLoading(true);
    try {
      const res = await api.getAIModels(provider, {
        apiKey: providerCfg?.apiKey,
        baseUrl: providerCfg?.baseUrl,
      });
      if (res.models.length > 0) {
        setApiModels((prev) => ({ ...prev, [provider]: res.models }));
      }
      setModelsSource((prev) => ({ ...prev, [provider]: res.source }));
    } catch {
      setModelsSource((prev) => ({ ...prev, [provider]: "fallback" }));
    } finally {
      setModelsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const fetchConfig = async () => {
      setLoading(true);
      try {
        const data = await api.getAIConfig();
        // Initialiser automatiquement les profils à partir des providers configurés si vide
        if (!data.profiles || data.profiles.length === 0) {
          const seeded: AIModelProfile[] = [];
          for (const pKey of Object.keys(PROVIDER_METADATA) as AIProvider[]) {
            const pCfg = data.providers?.[pKey];
            if (pKey === data.activeProvider || pCfg?.apiKey) {
              seeded.push({
                id: `prof_${pKey}_default`,
                name: `${PROVIDER_METADATA[pKey].name.split(" ")[0]} (${(pCfg?.model || PROVIDER_METADATA[pKey].defaultModel).split("/").pop()})`,
                provider: pKey,
                apiKey: pCfg?.apiKey || "",
                baseUrl: pCfg?.baseUrl || PROVIDER_METADATA[pKey].defaultBaseUrl,
                model: pCfg?.model || PROVIDER_METADATA[pKey].defaultModel,
              });
            }
          }
          const defaultId = seeded.find((s) => s.provider === data.activeProvider)?.id || seeded[0]?.id;
          data.profiles = seeded;
          if (!data.roleAssignments && defaultId) {
            data.roleAssignments = { copilot: defaultId, generator: defaultId, agent: defaultId };
          }
        }
        setConfig(data);
        fetchModelsForProvider(data.activeProvider, data.providers[data.activeProvider]);
      } catch (e: any) {
        console.error("Erreur chargement config IA:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, [isOpen]);

  if (!isOpen) return null;

  const currentProviderMeta = PROVIDER_METADATA[config.activeProvider];
  const currentProviderConfig = config.providers[config.activeProvider] || {};

  const handleProviderChange = (provider: AIProvider) => {
    setConfig((prev) => ({
      ...prev,
      activeProvider: provider,
    }));
    setTestStatus({ running: false });
    setModelFilter("");
    fetchModelsForProvider(provider, config.providers[provider]);
  };

  const handleProviderConfigChange = (field: keyof AIProviderConfig, value: string) => {
    setConfig((prev) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [prev.activeProvider]: {
          ...prev.providers[prev.activeProvider],
          [field]: value,
        },
      },
    }));
  };

  const handleTestConnection = async () => {
    setTestStatus({ running: true, success: undefined, message: undefined });
    try {
      const res = await api.testAIConnection(config.activeProvider, currentProviderConfig);
      setTestStatus({
        running: false,
        success: res.success,
        message: res.message,
      });
    } catch (e: any) {
      setTestStatus({
        running: false,
        success: false,
        message: e.message || "Erreur de communication avec le fournisseur IA",
      });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.saveAIConfig(config);
      setConfig(res.config);
      if (onConfigSaved) onConfigSaved(res.config);
      onClose();
    } catch (e: any) {
      alert("Erreur lors de la sauvegarde : " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50/50 via-indigo-50/30 to-purple-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Intelligence Artificielle &amp; Outils
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full border border-blue-200">
                  Agentique
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Ollama, OpenRouter, Claude, Mistral, Google — assistance rédactionnelle et Copilot autonome
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Activation Globale */}
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="space-y-0.5 pr-4">
              <label className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Bot className="w-4 h-4 text-blue-600" />
                Activer l'assistance IA dans Cartable Numérique
              </label>
              <p className="text-xs text-slate-500">
                Débloque l'aide à l'écriture dans vos notes, l'aide aux courriels Zimbra et le Copilot proactif.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Sélecteur de Fournisseur */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Fournisseur d'IA actif
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
              {(Object.keys(PROVIDER_METADATA) as AIProvider[]).map((pKey) => {
                const meta = PROVIDER_METADATA[pKey];
                const isSelected = config.activeProvider === pKey;
                return (
                  <button
                    key={pKey}
                    type="button"
                    onClick={() => handleProviderChange(pKey)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? "bg-blue-50/70 border-blue-500 shadow-xs ring-1 ring-blue-500"
                        : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xl">{meta.icon}</span>
                      {isSelected && <Check className="w-4 h-4 text-blue-600" />}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">{meta.name.split(" ")[0]}</div>
                      <div className="text-[10px] text-slate-500 truncate">{meta.defaultModel.split("/").pop()}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span>{currentProviderMeta.description}</span>
            </p>
          </div>

          {/* Paramètres du Provider Sélectionné */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-blue-600" />
                Paramètres {currentProviderMeta.name}
              </h4>
              <span className="text-[11px] text-slate-400 font-mono">
                Modèle par défaut : {currentProviderMeta.defaultModel}
              </span>
            </div>

            {/* URL de base pour Ollama */}
            {currentProviderMeta.needsBaseUrl && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Adresse de l'API Ollama (Base URL)
                </label>
                <input
                  type="text"
                  value={currentProviderConfig.baseUrl || currentProviderMeta.defaultBaseUrl || ""}
                  onChange={(e) => handleProviderConfigChange("baseUrl", e.target.value)}
                  placeholder="http://localhost:11434"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Par défaut : <code>http://localhost:11434</code> (exécutez <code>ollama serve</code> en local).
                </span>
              </div>
            )}

            {/* Clé d'API */}
            {currentProviderMeta.needsApiKey && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Key className="w-3.5 h-3.5 text-amber-500" />
                    Clé d'API ({currentProviderMeta.name})
                  </span>
                  <span className="text-[10.5px] text-slate-400 font-normal">Chiffrée dans votre espace privé</span>
                </label>
                <input
                  type="password"
                  value={currentProviderConfig.apiKey || ""}
                  onChange={(e) => handleProviderConfigChange("apiKey", e.target.value)}
                  placeholder={
                    config.activeProvider === "claude"
                      ? "sk-ant-api03-..."
                      : config.activeProvider === "openrouter"
                      ? "sk-or-v1-..."
                      : config.activeProvider === "google"
                      ? "AIzaSy..."
                      : "Clé secrète d'API..."
                  }
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            )}

            {/* Modèle */}
            {(() => {
              const liveModels = apiModels[config.activeProvider];
              const allModels =
                liveModels && liveModels.length > 0 ? liveModels : currentProviderMeta.modelSuggestions;
              const isFromApi = modelsSource[config.activeProvider] === "api" && (liveModels?.length || 0) > 0;
              const filteredModels = modelFilter.trim()
                ? allModels.filter((m) => m.toLowerCase().includes(modelFilter.trim().toLowerCase()))
                : allModels;

              return (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Modèle principal (Chat / Copilot)
                    </label>
                    <input
                      type="text"
                      list="ai-model-suggestions"
                      value={currentProviderConfig.model || currentProviderMeta.defaultModel}
                      onChange={(e) => handleProviderConfigChange("model", e.target.value)}
                      onFocus={() => setActiveModelTarget("model")}
                      placeholder={currentProviderMeta.defaultModel}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-emerald-700 mb-1">
                        Petit modèle (Requêtes proactives, mails, quiz)
                      </label>
                      <input
                        type="text"
                        list="ai-model-suggestions"
                        value={currentProviderConfig.proactiveModel || ""}
                        onChange={(e) => handleProviderConfigChange("proactiveModel", e.target.value)}
                        onFocus={() => setActiveModelTarget("proactiveModel")}
                        placeholder={currentProviderConfig.model || currentProviderMeta.defaultModel}
                        className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-lg text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-indigo-700 mb-1">
                        Modèle génération de documents (CM, TD, QCM)
                      </label>
                      <input
                        type="text"
                        list="ai-model-suggestions"
                        value={currentProviderConfig.documentModel || ""}
                        onChange={(e) => handleProviderConfigChange("documentModel", e.target.value)}
                        onFocus={() => setActiveModelTarget("documentModel")}
                        placeholder={currentProviderConfig.model || currentProviderMeta.defaultModel}
                        className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <datalist id="ai-model-suggestions">
                    {allModels.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>

                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10.5px] text-slate-400">
                          {isFromApi
                            ? `Modèles API (${allModels.length}) →`
                            : "Suggestions →"}
                        </span>
                        <div className="inline-flex bg-slate-100 p-0.5 rounded-md border border-slate-200 text-[10px] font-semibold">
                          {(
                            [
                              { id: "model", label: "Chat" },
                              { id: "proactiveModel", label: "Proactif" },
                              { id: "documentModel", label: "Documents" },
                            ] as const
                          ).map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => setActiveModelTarget(t.id)}
                              className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                                activeModelTarget === t.id
                                  ? "bg-white text-blue-700 shadow-2xs"
                                  : "text-slate-500 hover:text-slate-800"
                              }`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => fetchModelsForProvider(config.activeProvider, currentProviderConfig)}
                          disabled={modelsLoading}
                          title="Charger les modèles disponibles depuis l'API"
                          className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 hover:text-blue-700 px-1.5 py-0.5 rounded bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw className={`w-2.5 h-2.5 ${modelsLoading ? "animate-spin" : ""}`} />
                          <span>{modelsLoading ? "Chargement..." : "Actualiser"}</span>
                        </button>
                      </div>

                      {allModels.length > 10 && (
                        <input
                          type="text"
                          value={modelFilter}
                          onChange={(e) => setModelFilter(e.target.value)}
                          placeholder="Filtrer les modèles..."
                          className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[10.5px] font-mono w-36 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                        />
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap max-h-28 overflow-y-auto pr-1">
                      {filteredModels.slice(0, 60).map((m) => {
                        const targetVal =
                          activeModelTarget === "model"
                            ? currentProviderConfig.model || currentProviderMeta.defaultModel
                            : currentProviderConfig[activeModelTarget] || "";
                        const isCurrent = targetVal === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => handleProviderConfigChange(activeModelTarget, m)}
                            title={m}
                            className={`text-[10px] font-mono px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                              isCurrent
                                ? "bg-blue-50 text-blue-700 border-blue-300 font-semibold"
                                : "bg-white hover:bg-blue-50 hover:text-blue-700 border-slate-200 text-slate-600"
                            }`}
                          >
                            {m.split("/").pop()}
                          </button>
                        );
                      })}
                      {filteredModels.length > 60 && (
                        <span className="text-[10px] text-slate-400">
                          +{filteredModels.length - 60} autres (utilisez le filtre)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Test de connexion */}
            <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testStatus.running}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
              >
                {testStatus.running ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                ) : (
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                )}
                <span>Tester la connexion</span>
              </button>

              {testStatus.message && (
                <span
                  className={`text-xs flex items-center gap-1.5 max-w-[65%] truncate ${
                    testStatus.success ? "text-emerald-700 font-semibold" : "text-rose-600"
                  }`}
                  title={testStatus.message}
                >
                  {testStatus.success ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  <span className="truncate">{testStatus.message}</span>
                </span>
              )}
            </div>
          </div>

          {/* Multi-IA : Profils & Attribution Granulaire des Rôles */}
          <div className="space-y-4 p-4 rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-2 flex-wrap border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                  Multi-IA &amp; Rôles Granulaires ({(config.profiles || []).length} IA)
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Ajoutez autant de modèles et fournisseurs que souhaité, puis assignez-les par rôle ou par tâche.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setEditingProfile({
                    id: `prof_${Date.now()}`,
                    name: "",
                    provider: config.activeProvider,
                    apiKey: config.providers[config.activeProvider]?.apiKey || "",
                    baseUrl: config.providers[config.activeProvider]?.baseUrl || PROVIDER_METADATA[config.activeProvider].defaultBaseUrl,
                    model: config.providers[config.activeProvider]?.model || PROVIDER_METADATA[config.activeProvider].defaultModel,
                  })
                }
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ajouter une IA</span>
              </button>
            </div>

            {/* Éditeur de profil IA (Ajout / Modification) */}
            {editingProfile && (
              <div className="p-3.5 rounded-xl border border-indigo-200 bg-indigo-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-900">Configurer un profil IA</span>
                  <button
                    type="button"
                    onClick={() => setEditingProfile(null)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nom du profil</label>
                    <input
                      type="text"
                      value={editingProfile.name}
                      onChange={(e) => setEditingProfile({ ...editingProfile, name: e.target.value })}
                      placeholder="Ex: Gemini Rapide, Claude Rédaction..."
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Fournisseur</label>
                    <select
                      value={editingProfile.provider}
                      onChange={(e) => {
                        const p = e.target.value as AIProvider;
                        const meta = PROVIDER_METADATA[p];
                        setEditingProfile({
                          ...editingProfile,
                          provider: p,
                          model: config.providers[p]?.model || meta.defaultModel,
                          apiKey: config.providers[p]?.apiKey || "",
                          baseUrl: config.providers[p]?.baseUrl || meta.defaultBaseUrl,
                        });
                        fetchModelsForProvider(p, config.providers[p]);
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    >
                      {(Object.keys(PROVIDER_METADATA) as AIProvider[]).map((pKey) => (
                        <option key={pKey} value={pKey}>
                          {PROVIDER_METADATA[pKey].icon} {PROVIDER_METADATA[pKey].name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {PROVIDER_METADATA[editingProfile.provider].needsApiKey && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Clé API</label>
                      <input
                        type="password"
                        value={editingProfile.apiKey || ""}
                        onChange={(e) => setEditingProfile({ ...editingProfile, apiKey: e.target.value })}
                        placeholder="Clé API..."
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  )}
                  {PROVIDER_METADATA[editingProfile.provider].needsBaseUrl && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Base URL</label>
                      <input
                        type="text"
                        value={editingProfile.baseUrl || "http://localhost:11434"}
                        onChange={(e) => setEditingProfile({ ...editingProfile, baseUrl: e.target.value })}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Modèle</label>
                    <input
                      type="text"
                      list="profile-model-suggestions"
                      value={editingProfile.model}
                      onChange={(e) => setEditingProfile({ ...editingProfile, model: e.target.value })}
                      placeholder={PROVIDER_METADATA[editingProfile.provider].defaultModel}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                    <datalist id="profile-model-suggestions">
                      {(apiModels[editingProfile.provider] || PROVIDER_METADATA[editingProfile.provider].modelSuggestions).map((m) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingProfile(null)}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const finalProfile: AIModelProfile = {
                        ...editingProfile,
                        name:
                          editingProfile.name.trim() ||
                          `${PROVIDER_METADATA[editingProfile.provider].name.split(" ")[0]} (${editingProfile.model.split("/").pop()})`,
                      };
                      setConfig((prev) => {
                        const existing = prev.profiles || [];
                        const exists = existing.some((p) => p.id === finalProfile.id);
                        return {
                          ...prev,
                          profiles: exists
                            ? existing.map((p) => (p.id === finalProfile.id ? finalProfile : p))
                            : [...existing, finalProfile],
                        };
                      });
                      setEditingProfile(null);
                    }}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold"
                  >
                    Valider ce profil
                  </button>
                </div>
              </div>
            )}

            {/* Liste des profils configurés */}
            {(config.profiles || []).length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(config.profiles || []).map((prof) => {
                  const meta = PROVIDER_METADATA[prof.provider];
                  const tState = profileTestStatus[prof.id];
                  return (
                    <div
                      key={prof.id}
                      className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 truncate">
                          <span>{meta.icon}</span>
                          <span className="truncate">{prof.name}</span>
                        </div>
                        <div className="text-[10.5px] font-mono text-slate-500 truncate">
                          {prof.provider} • {prof.model}
                        </div>
                        {tState?.msg && (
                          <div className={`text-[10px] truncate mt-0.5 ${tState.ok ? "text-emerald-600 font-semibold" : "text-rose-600"}`}>
                            {tState.msg}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={async () => {
                            setProfileTestStatus((p) => ({ ...p, [prof.id]: { running: true } }));
                            try {
                              const res = await api.testAIConnection(
                                prof.provider,
                                { apiKey: prof.apiKey, baseUrl: prof.baseUrl, model: prof.model },
                                prof.id
                              );
                              setProfileTestStatus((p) => ({
                                ...p,
                                [prof.id]: { running: false, ok: res.success, msg: res.message },
                              }));
                            } catch (e: any) {
                              setProfileTestStatus((p) => ({
                                ...p,
                                [prof.id]: { running: false, ok: false, msg: e.message },
                              }));
                            }
                          }}
                          disabled={tState?.running}
                          className="p-1.5 bg-white hover:bg-amber-50 border border-slate-200 rounded-lg text-amber-600"
                          title="Tester ce profil"
                        >
                          {tState?.running ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingProfile(prof)}
                          className="p-1.5 bg-white hover:bg-blue-50 border border-slate-200 rounded-lg text-slate-600 hover:text-blue-600"
                          title="Modifier"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              profiles: (prev.profiles || []).filter((p) => p.id !== prof.id),
                            }))
                          }
                          className="p-1.5 bg-white hover:bg-rose-50 border border-slate-200 rounded-lg text-slate-500 hover:text-rose-600"
                          title="Supprimer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 3 Rôles Principaux : Copilot, Générateur, Agent */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                3 Rôles par défaut
              </span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                {DEFAULT_ROLE_CARDS.map((role) => (
                  <div key={role.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
                    <div>
                      <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <span>{role.icon}</span>
                        <span>{role.label}</span>
                      </div>
                      <p className="text-[10.5px] text-slate-500 mt-0.5 leading-snug">{role.desc}</p>
                    </div>
                    <select
                      value={config.roleAssignments?.[role.id] || ""}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          roleAssignments: { ...prev.roleAssignments, [role.id]: e.target.value || undefined },
                        }))
                      }
                      className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Fournisseur actif par défaut</option>
                      {(config.profiles || []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.provider})
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Attribution Granulaire par Tâche */}
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowGranularTasks(!showGranularTasks)}
                className="w-full flex items-center justify-between text-xs font-semibold text-indigo-700 hover:text-indigo-900 py-1 cursor-pointer"
              >
                <span>Attribution granulaire par tâche ({Object.values(config.taskAssignments || {}).filter(Boolean).length} personnalisées)</span>
                {showGranularTasks ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showGranularTasks && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2.5">
                  {GRANULAR_TASKS.map((t) => (
                    <div key={t.id} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-slate-800">{t.label}</span>
                        <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-500">
                          {t.parent}
                        </span>
                      </div>
                      <select
                        value={config.taskAssignments?.[t.id] || ""}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            taskAssignments: { ...prev.taskAssignments, [t.id]: e.target.value || undefined },
                          }))
                        }
                        className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[11px]"
                      >
                        <option value="">Hériter de « {t.parent} »</option>
                        {(config.profiles || []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Rôles Spécialisés Personnalisés */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Rôles spécialisés personnalisés
                </span>
                <button
                  type="button"
                  onClick={() => setShowNewCustomRole(!showNewCustomRole)}
                  className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Ajouter un rôle</span>
                </button>
              </div>

              {showNewCustomRole && (
                <div className="p-3 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={newCustomRoleName}
                      onChange={(e) => setNewCustomRoleName(e.target.value)}
                      placeholder="Nom du rôle (ex: Traduction, Code Python)"
                      className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                    <select
                      value={newCustomRoleProfileId}
                      onChange={(e) => setNewCustomRoleProfileId(e.target.value)}
                      className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    >
                      <option value="">Choisir une IA...</option>
                      {(config.profiles || []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newCustomRoleDesc}
                      onChange={(e) => setNewCustomRoleDesc(e.target.value)}
                      placeholder="Spécialité / description courte (optionnel)"
                      className="flex-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!newCustomRoleName.trim()) return;
                        const role: AICustomRole = {
                          id: `role_${Date.now()}`,
                          name: newCustomRoleName.trim(),
                          description: newCustomRoleDesc.trim() || undefined,
                          profileId: newCustomRoleProfileId || undefined,
                        };
                        setConfig((prev) => ({
                          ...prev,
                          customRoles: [...(prev.customRoles || []), role],
                        }));
                        setNewCustomRoleName("");
                        setNewCustomRoleDesc("");
                        setNewCustomRoleProfileId("");
                        setShowNewCustomRole(false);
                      }}
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold"
                    >
                      Ajouter
                    </button>
                  </div>
                </div>
              )}

              {(config.customRoles || []).length > 0 && (
                <div className="space-y-1.5">
                  {(config.customRoles || []).map((cr) => (
                    <div
                      key={cr.id}
                      className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/60 flex items-center justify-between gap-2 flex-wrap"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900">{cr.name}</div>
                        {cr.description && <div className="text-[10.5px] text-slate-500">{cr.description}</div>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={cr.profileId || ""}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              customRoles: (prev.customRoles || []).map((r) =>
                                r.id === cr.id ? { ...r, profileId: e.target.value || undefined } : r
                              ),
                            }))
                          }
                          className="px-2 py-1 bg-white border border-slate-200 rounded text-[11px]"
                        >
                          <option value="">Fournisseur par défaut</option>
                          {(config.profiles || []).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              customRoles: (prev.customRoles || []).filter((r) => r.id !== cr.id),
                            }))
                          }
                          className="p-1 text-slate-400 hover:text-rose-600"
                          title="Supprimer ce rôle"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Options de l'Agent IA & Outils */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Capacités de l'Agent IA
            </label>

            {/* Outils Système (Tool Calling) */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-indigo-600" />
                  Autoriser l'IA à utiliser les outils (Function Calling)
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Permet à l'IA d'interroger directement votre emploi du temps ADE, vos notes Scodoc, votre cahier de
                  texte, vos e-mails Zimbra, et de coller des post-its ou devoirs en votre nom.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                <input
                  type="checkbox"
                  checked={config.enableTools}
                  onChange={(e) => setConfig({ ...config, enableTools: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {/* Mode Proactif (Insights) */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-600" />
                  Conseils et alertes proactives (Copilot Étudiant)
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  L'IA analyse proactivement vos cours du lendemain, les devoirs non rendus, les alertes d'examens et les
                  courriels de vos professeurs pour vous prévenir sur le tableau de bord.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                <input
                  type="checkbox"
                  checked={config.enableProactive}
                  onChange={(e) => setConfig({ ...config, enableProactive: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
              </label>
            </div>
          </div>

          {/* Note de confidentialité */}
          <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200/70 flex items-start gap-2 text-xs text-blue-900">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>
              <strong>Confidentialité &amp; Isolation :</strong> Vos clés d'API et paramètres restent stockés
              strictement dans votre base personnelle hermétique. Aucun mot de passe ENT n'est partagé avec les API IA.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            <span>Enregistrer la configuration</span>
          </button>
        </div>
      </div>
    </div>
  );
};
