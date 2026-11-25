import React, { useState, useEffect } from "react";
import {
  X,
  Bot,
  Sparkles,
  Check,
  AlertTriangle,
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
  ArrowLeft,
  Settings,
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

const DEFAULT_ROLE_CARDS: Array<{
  id: AIDefaultRole;
  label: string;
  shortLabel: string;
  icon: string;
  desc: string;
}> = [
  {
    id: "copilot",
    label: "Chat & Rédaction",
    shortLabel: "Chat",
    icon: "💬",
    desc: "Assistant Copilot, rédaction d'e-mails, aide sur les notes",
  },
  {
    id: "generator",
    label: "Création de cours",
    shortLabel: "Création",
    icon: "✨",
    desc: "Diaporamas, fiches de synthèse, exercices TD, QCM",
  },
  {
    id: "agent",
    label: "Automatisation",
    shortLabel: "Auto",
    icon: "🤖",
    desc: "Triage des mails, mise à jour EDT & visio, quiz Moodle",
  },
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
  const [apiModels, setApiModels] = useState<Partial<Record<AIProvider, string[]>>>({});
  const [modelsSource, setModelsSource] = useState<Partial<Record<AIProvider, "api" | "fallback">>>({});
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelFilter, setModelFilter] = useState("");

  // Navigation & Multi-IA (interface à onglets)
  const [activeTab, setActiveTab] = useState<"models" | "roles" | "options">("models");
  const [showAdvancedRoles, setShowAdvancedRoles] = useState(false);
  const [editingProfile, setEditingProfile] = useState<AIModelProfile | null>(null);
  const [isAddingNewProfile, setIsAddingNewProfile] = useState(false);
  const [editorTestStatus, setEditorTestStatus] = useState<{
    running: boolean;
    success?: boolean;
    message?: string;
  }>({ running: false });
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
    setActiveTab("models");
    setShowAdvancedRoles(false);
    setEditingProfile(null);
    setIsAddingNewProfile(false);
    setEditorTestStatus({ running: false });
    setModelFilter("");
    const fetchConfig = async () => {
      setLoading(true);
      try {
        const data = await api.getAIConfig();
        // Migration douce / initialisation des profils à partir des providers configurés si vide
        if (!data.profiles || data.profiles.length === 0) {
          const seeded: AIModelProfile[] = [];
          const nextRoleAssignments = { ...(data.roleAssignments || {}) };

          for (const pKey of Object.keys(PROVIDER_METADATA) as AIProvider[]) {
            const pCfg = data.providers?.[pKey];
            if (pKey === data.activeProvider || pCfg?.apiKey) {
              const mainModel = pCfg?.model || PROVIDER_METADATA[pKey].defaultModel;
              const mainId = `prof_${pKey}_default`;
              seeded.push({
                id: mainId,
                name: `${PROVIDER_METADATA[pKey].name.split(" ")[0]} (${mainModel.split("/").pop()})`,
                provider: pKey,
                apiKey: pCfg?.apiKey || "",
                baseUrl: pCfg?.baseUrl || PROVIDER_METADATA[pKey].defaultBaseUrl,
                model: mainModel,
              });

              if (pKey === data.activeProvider) {
                if (!nextRoleAssignments.copilot) nextRoleAssignments.copilot = mainId;

                const proactiveModel = pCfg?.proactiveModel?.trim();
                if (proactiveModel && proactiveModel !== mainModel) {
                  const proactiveId = `prof_${pKey}_proactive`;
                  seeded.push({
                    id: proactiveId,
                    name: `${PROVIDER_METADATA[pKey].name.split(" ")[0]} Proactif (${proactiveModel.split("/").pop()})`,
                    provider: pKey,
                    apiKey: pCfg?.apiKey || "",
                    baseUrl: pCfg?.baseUrl || PROVIDER_METADATA[pKey].defaultBaseUrl,
                    model: proactiveModel,
                  });
                  if (!nextRoleAssignments.agent) nextRoleAssignments.agent = proactiveId;
                }

                const documentModel = pCfg?.documentModel?.trim();
                if (documentModel && documentModel !== mainModel) {
                  const documentId = `prof_${pKey}_document`;
                  seeded.push({
                    id: documentId,
                    name: `${PROVIDER_METADATA[pKey].name.split(" ")[0]} Documents (${documentModel.split("/").pop()})`,
                    provider: pKey,
                    apiKey: pCfg?.apiKey || "",
                    baseUrl: pCfg?.baseUrl || PROVIDER_METADATA[pKey].defaultBaseUrl,
                    model: documentModel,
                  });
                  if (!nextRoleAssignments.generator) nextRoleAssignments.generator = documentId;
                }
              }
            }
          }

          const defaultId = seeded.find((s) => s.provider === data.activeProvider)?.id || seeded[0]?.id;
          data.profiles = seeded;
          if (defaultId) {
            data.roleAssignments = {
              copilot: nextRoleAssignments.copilot || defaultId,
              generator: nextRoleAssignments.generator || defaultId,
              agent: nextRoleAssignments.agent || defaultId,
            };
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

  // Si aucune IA n'est encore configurée après chargement, ouvrir automatiquement l'éditeur
  useEffect(() => {
    if (!isOpen || loading) return;
    if ((config.profiles || []).length === 0 && !editingProfile) {
      const p = config.activeProvider;
      const meta = PROVIDER_METADATA[p];
      setIsAddingNewProfile(true);
      setEditingProfile({
        id: `prof_${Date.now()}`,
        name: "",
        provider: p,
        apiKey: config.providers[p]?.apiKey || "",
        baseUrl: config.providers[p]?.baseUrl || meta.defaultBaseUrl,
        model: config.providers[p]?.model || meta.defaultModel,
      });
    }
  }, [isOpen, loading, config.profiles, editingProfile, config.activeProvider, config.providers]);

  if (!isOpen) return null;

  const getKnownCredentialsForProvider = (provider: AIProvider): { apiKey: string; baseUrl?: string } => {
    const existingProfile = (config.profiles || []).find((p) => p.provider === provider && (p.apiKey || p.baseUrl));
    const providerCfg = config.providers[provider] || {};
    return {
      apiKey: providerCfg.apiKey || existingProfile?.apiKey || "",
      baseUrl: providerCfg.baseUrl || existingProfile?.baseUrl || PROVIDER_METADATA[provider].defaultBaseUrl,
    };
  };

  const openProfileEditor = (profileToEdit?: AIModelProfile) => {
    setActiveTab("models");
    setEditorTestStatus({ running: false });
    setModelFilter("");
    if (profileToEdit) {
      setIsAddingNewProfile(false);
      setEditingProfile({ ...profileToEdit });
      fetchModelsForProvider(profileToEdit.provider, {
        apiKey: profileToEdit.apiKey,
        baseUrl: profileToEdit.baseUrl,
        model: profileToEdit.model,
      });
      return;
    }
    setIsAddingNewProfile(true);
    const p = config.activeProvider;
    const creds = getKnownCredentialsForProvider(p);
    const meta = PROVIDER_METADATA[p];
    const nextDraft: AIModelProfile = {
      id: `prof_${Date.now()}`,
      name: "",
      provider: p,
      apiKey: creds.apiKey,
      baseUrl: creds.baseUrl,
      model: config.providers[p]?.model || meta.defaultModel,
    };
    setEditingProfile(nextDraft);
    fetchModelsForProvider(p, { apiKey: creds.apiKey, baseUrl: creds.baseUrl, model: nextDraft.model });
  };

  const handleEditorProviderChange = (provider: AIProvider) => {
    if (!editingProfile) return;
    const meta = PROVIDER_METADATA[provider];
    const creds = getKnownCredentialsForProvider(provider);
    const nextModel = config.providers[provider]?.model || meta.defaultModel;
    setEditingProfile({
      ...editingProfile,
      provider,
      apiKey: creds.apiKey,
      baseUrl: creds.baseUrl,
      model: nextModel,
    });
    setEditorTestStatus({ running: false });
    setModelFilter("");
    fetchModelsForProvider(provider, { apiKey: creds.apiKey, baseUrl: creds.baseUrl, model: nextModel });
  };

  const handleTestEditorProfile = async () => {
    if (!editingProfile) return;
    setEditorTestStatus({ running: true, success: undefined, message: undefined });
    try {
      const res = await api.testAIConnection(
        editingProfile.provider,
        {
          apiKey: editingProfile.apiKey,
          baseUrl: editingProfile.baseUrl,
          model: editingProfile.model || PROVIDER_METADATA[editingProfile.provider].defaultModel,
        },
        editingProfile.id
      );
      setEditorTestStatus({
        running: false,
        success: res.success,
        message: res.message,
      });
    } catch (e: any) {
      setEditorTestStatus({
        running: false,
        success: false,
        message: e.message || "Erreur de communication avec le fournisseur IA",
      });
    }
  };

  const handleSaveEditorProfile = () => {
    if (!editingProfile) return;
    const p = editingProfile.provider;
    const finalModel = editingProfile.model.trim() || PROVIDER_METADATA[p].defaultModel;
    const finalProfile: AIModelProfile = {
      ...editingProfile,
      model: finalModel,
      name:
        editingProfile.name.trim() ||
        `${PROVIDER_METADATA[p].name.split(" ")[0]} (${finalModel.split("/").pop()})`,
    };

    setConfig((prev) => {
      const existing = prev.profiles || [];
      const exists = existing.some((item) => item.id === finalProfile.id);
      const nextProfiles = exists
        ? existing.map((item) => (item.id === finalProfile.id ? finalProfile : item))
        : [...existing, finalProfile];

      const isFirstProfile = existing.length === 0;
      const nextRoleAssignments = isFirstProfile
        ? {
            copilot: finalProfile.id,
            generator: finalProfile.id,
            agent: finalProfile.id,
          }
        : prev.roleAssignments;

      const prevProvCfg = prev.providers[p] || {};
      return {
        ...prev,
        activeProvider: isFirstProfile ? p : prev.activeProvider,
        profiles: nextProfiles,
        roleAssignments: nextRoleAssignments,
        providers: {
          ...prev.providers,
          [p]: {
            ...prevProvCfg,
            ...(finalProfile.apiKey ? { apiKey: finalProfile.apiKey } : {}),
            ...(finalProfile.baseUrl ? { baseUrl: finalProfile.baseUrl } : {}),
            ...(isFirstProfile ? { model: finalProfile.model } : {}),
          },
        },
      };
    });
    setEditingProfile(null);
    setEditorTestStatus({ running: false });
  };

  const handleDeleteProfile = (profileId: string) => {
    setConfig((prev) => {
      const remaining = (prev.profiles || []).filter((p) => p.id !== profileId);
      const cleanRoles: AIUserConfig["roleAssignments"] = prev.roleAssignments
        ? {
            copilot: prev.roleAssignments.copilot === profileId ? undefined : prev.roleAssignments.copilot,
            generator: prev.roleAssignments.generator === profileId ? undefined : prev.roleAssignments.generator,
            agent: prev.roleAssignments.agent === profileId ? undefined : prev.roleAssignments.agent,
          }
        : undefined;
      const cleanTasks = prev.taskAssignments
        ? (Object.fromEntries(
            Object.entries(prev.taskAssignments).map(([k, v]) => [k, v === profileId ? undefined : v])
          ) as AIUserConfig["taskAssignments"])
        : undefined;
      const cleanCustomRoles = prev.customRoles
        ? prev.customRoles.map((r) => (r.profileId === profileId ? { ...r, profileId: undefined } : r))
        : undefined;

      return {
        ...prev,
        profiles: remaining,
        roleAssignments: cleanRoles,
        taskAssignments: cleanTasks,
        customRoles: cleanCustomRoles,
      };
    });
    if (editingProfile?.id === profileId) {
      setEditingProfile(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const profiles = config.profiles || [];
      const syncedProviders: Record<AIProvider, AIProviderConfig> = {
        ollama: { ...(config.providers?.ollama || {}) },
        openrouter: { ...(config.providers?.openrouter || {}) },
        claude: { ...(config.providers?.claude || {}) },
        mistral: { ...(config.providers?.mistral || {}) },
        google: { ...(config.providers?.google || {}) },
      };

      for (const prof of profiles) {
        const current = syncedProviders[prof.provider] || {};
        syncedProviders[prof.provider] = {
          ...current,
          ...(prof.apiKey ? { apiKey: prof.apiKey } : {}),
          ...(prof.baseUrl ? { baseUrl: prof.baseUrl } : {}),
        };
      }

      const copilotProfile =
        profiles.find((p) => p.id === config.roleAssignments?.copilot) || profiles[0];
      const generatorProfile =
        profiles.find((p) => p.id === config.roleAssignments?.generator) || copilotProfile;
      const agentProfile =
        profiles.find((p) => p.id === config.roleAssignments?.agent) || copilotProfile;

      const nextActiveProvider = copilotProfile?.provider || config.activeProvider;
      if (copilotProfile) {
        syncedProviders[copilotProfile.provider] = {
          ...syncedProviders[copilotProfile.provider],
          model: copilotProfile.model,
        };
      }
      if (generatorProfile && generatorProfile.provider === nextActiveProvider) {
        syncedProviders[generatorProfile.provider] = {
          ...syncedProviders[generatorProfile.provider],
          documentModel: generatorProfile.model,
        };
      }
      if (agentProfile && agentProfile.provider === nextActiveProvider) {
        syncedProviders[agentProfile.provider] = {
          ...syncedProviders[agentProfile.provider],
          proactiveModel: agentProfile.model,
        };
      }

      const syncedConfig: AIUserConfig = {
        ...config,
        activeProvider: nextActiveProvider,
        providers: syncedProviders,
      };

      const res = await api.saveAIConfig(syncedConfig);
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
        {/* Header sobre */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50/50 via-indigo-50/30 to-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm shadow-blue-500/20">
              <Sparkles className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Configuration de l&apos;IA</h3>
              <p className="text-xs text-slate-500">Modèles, rôles et permissions</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barre d'activation compacte + 3 onglets */}
        <div className="px-6 pt-4 pb-3 border-b border-slate-200 bg-slate-50/60 space-y-3">
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-white rounded-xl border border-slate-200">
            <div className="flex items-center gap-2.5 min-w-0">
              <Bot className={`w-4 h-4 shrink-0 ${config.enabled ? "text-blue-600" : "text-slate-400"}`} />
              <span className="text-xs font-semibold text-slate-900 truncate">
                {config.enabled ? "Assistance IA active" : "Assistance IA désactivée"}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                  config.enabled
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-slate-100 text-slate-500 border-slate-200"
                }`}
              >
                {config.enabled ? `${(config.profiles || []).length} modèle(s)` : "Off"}
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-10 h-5.5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-200/70 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab("models")}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === "models"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>⚡ Mes IA</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  activeTab === "models" ? "bg-blue-100 text-blue-700" : "bg-slate-300/70 text-slate-600"
                }`}
              >
                {(config.profiles || []).length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("roles")}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === "roles"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>🎯 Qui fait quoi ?</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("options")}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === "options"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Options</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 max-h-[64vh] overflow-y-auto space-y-5">
          {/* ONGLET 1 : MES IA */}
          {activeTab === "models" && (
            !editingProfile ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-slate-600">
                    Ajoutez vos modèles IA, puis assignez-les dans l&apos;onglet <strong>« Qui fait quoi ? »</strong>.
                  </p>
                  <button
                    type="button"
                    onClick={() => openProfileEditor()}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Ajouter un modèle</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(config.profiles || []).map((prof) => {
                    const meta = PROVIDER_METADATA[prof.provider];
                    const tState = profileTestStatus[prof.id];
                    const assignedRoles = DEFAULT_ROLE_CARDS.filter((r) => config.roleAssignments?.[r.id] === prof.id);
                    return (
                      <div
                        key={prof.id}
                        className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between gap-3 hover:border-slate-300 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                              <span className="text-base">{meta.icon}</span>
                              <span className="truncate">{prof.name}</span>
                            </div>
                            <div className="text-[11px] font-mono text-slate-500 truncate mt-1">
                              {prof.provider} • {prof.model}
                            </div>
                          </div>
                        </div>

                        {assignedRoles.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap">
                            {assignedRoles.map((r) => (
                              <span
                                key={r.id}
                                className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700"
                              >
                                <span>{r.icon}</span>
                                <span>{r.shortLabel}</span>
                              </span>
                            ))}
                          </div>
                        )}

                        {tState?.msg && (
                          <div
                            className={`text-[10.5px] truncate ${
                              tState.ok ? "text-emerald-600 font-semibold" : "text-rose-600"
                            }`}
                            title={tState.msg}
                          >
                            {tState.msg}
                          </div>
                        )}

                        <div className="flex items-center gap-1.5 pt-2 border-t border-slate-200/70">
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
                            className="flex-1 px-2.5 py-1.5 bg-white hover:bg-amber-50 border border-slate-200 rounded-lg text-[11px] font-medium text-amber-700 flex items-center justify-center gap-1 cursor-pointer"
                          >
                            {tState?.running ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <Zap className="w-3 h-3" />
                            )}
                            <span>Tester</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openProfileEditor(prof)}
                            className="flex-1 px-2.5 py-1.5 bg-white hover:bg-blue-50 border border-slate-200 rounded-lg text-[11px] font-medium text-slate-700 hover:text-blue-700 flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Modifier</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteProfile(prof.id)}
                            className="p-1.5 bg-white hover:bg-rose-50 border border-slate-200 rounded-lg text-slate-500 hover:text-rose-600 cursor-pointer"
                            title="Supprimer ce modèle"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (() => {
              const edMeta = PROVIDER_METADATA[editingProfile.provider];
              const liveModels = apiModels[editingProfile.provider];
              const allModels =
                liveModels && liveModels.length > 0 ? liveModels : edMeta.modelSuggestions;
              const isFromApi = modelsSource[editingProfile.provider] === "api" && (liveModels?.length || 0) > 0;
              const filteredModels = modelFilter.trim()
                ? allModels.filter((m) => m.toLowerCase().includes(modelFilter.trim().toLowerCase()))
                : allModels;
              const knownCreds = getKnownCredentialsForProvider(editingProfile.provider);
              const isKeyPrefilled = Boolean(
                edMeta.needsApiKey &&
                  isAddingNewProfile &&
                  editingProfile.apiKey &&
                  knownCreds.apiKey &&
                  editingProfile.apiKey === knownCreds.apiKey
              );

              return (
                <div className="space-y-4">
                  {/* Barre retour */}
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200">
                    <div className="flex items-center gap-2.5">
                      {(config.profiles || []).length > 0 && (
                        <button
                          type="button"
                          onClick={() => setEditingProfile(null)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium cursor-pointer transition-colors"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                          <span>Retour à mes IA</span>
                        </button>
                      )}
                      <h4 className="text-sm font-bold text-slate-900">
                        {isAddingNewProfile ? "Ajouter un modèle IA" : "Modifier le modèle IA"}
                      </h4>
                    </div>
                  </div>

                  {/* Étape 1 · Fournisseur */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      Étape 1 · Fournisseur
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                      {(Object.keys(PROVIDER_METADATA) as AIProvider[]).map((pKey) => {
                        const meta = PROVIDER_METADATA[pKey];
                        const isSelected = editingProfile.provider === pKey;
                        return (
                          <button
                            key={pKey}
                            type="button"
                            onClick={() => handleEditorProviderChange(pKey)}
                            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                              isSelected
                                ? "bg-blue-50/80 border-blue-500 shadow-xs ring-1 ring-blue-500"
                                : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-lg">{meta.icon}</span>
                              {isSelected && <Check className="w-3.5 h-3.5 text-blue-600" />}
                            </div>
                            <div>
                              <div className="text-xs font-bold text-slate-900">{meta.name.split(" ")[0]}</div>
                              <div className="text-[10px] text-slate-500 truncate">
                                {meta.defaultModel.split("/").pop()}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span>{edMeta.description}</span>
                    </p>
                  </div>

                  {/* Étape 2 · Connexion */}
                  <div className="space-y-2 pt-1">
                    <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      Étape 2 · Connexion
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {edMeta.needsApiKey && (
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1">
                              <Key className="w-3.5 h-3.5 text-amber-500" />
                              Clé d&apos;API
                            </span>
                            {isKeyPrefilled ? (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Clé pré-remplie
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-normal">Chiffrée en privé</span>
                            )}
                          </label>
                          <input
                            type="password"
                            value={editingProfile.apiKey || ""}
                            onChange={(e) => setEditingProfile({ ...editingProfile, apiKey: e.target.value })}
                            placeholder={
                              editingProfile.provider === "claude"
                                ? "sk-ant-api03-..."
                                : editingProfile.provider === "openrouter"
                                ? "sk-or-v1-..."
                                : editingProfile.provider === "google"
                                ? "AIzaSy..."
                                : "Clé secrète d'API..."
                            }
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      )}

                      {edMeta.needsBaseUrl && (
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Adresse de l&apos;API (Base URL)
                          </label>
                          <input
                            type="text"
                            value={editingProfile.baseUrl || edMeta.defaultBaseUrl || ""}
                            onChange={(e) => setEditingProfile({ ...editingProfile, baseUrl: e.target.value })}
                            placeholder="http://localhost:11434"
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Nom affiché (optionnel)
                        </label>
                        <input
                          type="text"
                          value={editingProfile.name}
                          onChange={(e) => setEditingProfile({ ...editingProfile, name: e.target.value })}
                          placeholder={`Ex: ${edMeta.name.split(" ")[0]} Rapide`}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Étape 3 · Modèle */}
                  <div className="space-y-2 pt-1">
                    <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      Étape 3 · Modèle
                    </div>
                    <input
                      type="text"
                      list="unified-ai-model-suggestions"
                      value={editingProfile.model}
                      onChange={(e) => setEditingProfile({ ...editingProfile, model: e.target.value })}
                      placeholder={edMeta.defaultModel}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <datalist id="unified-ai-model-suggestions">
                      {allModels.map((m) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10.5px] text-slate-400">
                            {isFromApi ? `Modèles API (${allModels.length}) →` : "Suggestions →"}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              fetchModelsForProvider(editingProfile.provider, {
                                apiKey: editingProfile.apiKey,
                                baseUrl: editingProfile.baseUrl,
                              })
                            }
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
                            placeholder="Filtrer..."
                            className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[10.5px] font-mono w-36 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                          />
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap max-h-28 overflow-y-auto pr-1">
                        {filteredModels.slice(0, 60).map((m) => {
                          const isCurrent = editingProfile.model === m;
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setEditingProfile({ ...editingProfile, model: m })}
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

                  {/* Pied de l'éditeur */}
                  <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={handleTestEditorProfile}
                        disabled={editorTestStatus.running}
                        className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50 shrink-0"
                      >
                        {editorTestStatus.running ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                        ) : (
                          <Zap className="w-3.5 h-3.5 text-amber-500" />
                        )}
                        <span>Tester la connexion</span>
                      </button>

                      {editorTestStatus.message && (
                        <span
                          className={`text-xs flex items-center gap-1 truncate ${
                            editorTestStatus.success ? "text-emerald-700 font-semibold" : "text-rose-600"
                          }`}
                          title={editorTestStatus.message}
                        >
                          {editorTestStatus.success ? (
                            <Check className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span className="truncate">{editorTestStatus.message}</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {(config.profiles || []).length > 0 && (
                        <button
                          type="button"
                          onClick={() => setEditingProfile(null)}
                          className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                        >
                          Annuler
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleSaveEditorProfile}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Valider ce modèle
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()
          )}

          {/* ONGLET 2 : QUI FAIT QUOI ? */}
          {activeTab === "roles" && (
            (config.profiles || []).length === 0 ? (
              <div className="p-8 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 text-center space-y-3">
                <p className="text-sm font-semibold text-slate-800">Aucun modèle IA configuré pour le moment</p>
                <p className="text-xs text-slate-500">
                  Ajoutez d&apos;abord au moins un modèle pour choisir quelle IA gère le chat, vos cours ou l&apos;automatisation.
                </p>
                <button
                  type="button"
                  onClick={() => openProfileEditor()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Ajouter mon premier modèle</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2.5">
                  {DEFAULT_ROLE_CARDS.map((role) => (
                    <div
                      key={role.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <span className="text-base">{role.icon}</span>
                          <span>{role.label}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">{role.desc}</p>
                      </div>
                      <select
                        value={config.roleAssignments?.[role.id] || ""}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            roleAssignments: { ...prev.roleAssignments, [role.id]: e.target.value || undefined },
                          }))
                        }
                        className="w-full sm:w-64 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-indigo-500 shrink-0"
                      >
                        <option value="">Fournisseur actif par défaut</option>
                        {(config.profiles || []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {PROVIDER_METADATA[p.provider].icon} {p.name} — {p.model}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                {/* Accordéon Réglages avancés */}
                <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedRoles(!showAdvancedRoles)}
                    className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    <span>
                      Réglages avancés (tâches précises &amp; rôles personnalisés ·{" "}
                      {Object.values(config.taskAssignments || {}).filter(Boolean).length +
                        (config.customRoles || []).length}{" "}
                      actif(s))
                    </span>
                    {showAdvancedRoles ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {showAdvancedRoles && (
                    <div className="p-4 pt-2 border-t border-slate-100 space-y-4">
                      <div>
                        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-2">
                          Attribution granulaire par tâche
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                      </div>

                      <div className="pt-3 border-t border-slate-100 space-y-2">
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
                                className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold cursor-pointer"
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
                                    className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
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
                  )}
                </div>
              </div>
            )
          )}

          {/* ONGLET 3 : OPTIONS */}
          {activeTab === "options" && (
            <div className="space-y-3">
              {/* Outils Système (Tool Calling) */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5 text-indigo-600" />
                    Outils &amp; Actions automatiques (Function Calling)
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Permet à l&apos;IA d&apos;interroger directement votre emploi du temps ADE, vos notes Webnotes, votre cahier de texte, vos e-mails Zimbra, et de coller des post-its ou devoirs en votre nom.
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
              <div className="p-4 rounded-xl border border-slate-200 bg-white flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-600" />
                    Conseils et alertes proactives (Copilot Étudiant)
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    L&apos;IA analyse proactivement vos cours du lendemain, les devoirs non rendus, les alertes d&apos;examens et les courriels de vos professeurs pour vous prévenir sur le tableau de bord.
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

              {/* Confidentialité & Isolation */}
              <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-200/70 flex items-start gap-2 text-xs text-blue-900">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Confidentialité &amp; Isolation :</strong> Vos clés d&apos;API et paramètres restent stockés
                  strictement dans votre base personnelle hermétique. Aucun mot de passe ENT n&apos;est partagé avec les API IA.
                </span>
              </div>
            </div>
          )}
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
            <span>Enregistrer</span>
          </button>
        </div>
      </div>
    </div>
  );
};
