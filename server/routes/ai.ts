import { Router } from "express";
import { db } from "../db.js";
import { aiService } from "../services/aiService.js";
import { AIProvider, AIUserConfig, AIMessage } from "../../src/types/index.js";

const router = Router();

// Fonction utilitaire pour masquer les clés d'API renvoyées au client
function maskKey(key?: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

function sanitizeAIConfig(config: AIUserConfig): AIUserConfig {
  return {
    ...config,
    providers: {
      ollama: { ...config.providers.ollama },
      openrouter: {
        ...config.providers.openrouter,
        apiKey: maskKey(config.providers.openrouter?.apiKey),
      },
      claude: {
        ...config.providers.claude,
        apiKey: maskKey(config.providers.claude?.apiKey),
      },
      mistral: {
        ...config.providers.mistral,
        apiKey: maskKey(config.providers.mistral?.apiKey),
      },
      google: {
        ...config.providers.google,
        apiKey: maskKey(config.providers.google?.apiKey),
      },
    },
    profiles: (config.profiles || []).map((p) => ({
      ...p,
      apiKey: p.apiKey ? maskKey(p.apiKey) : "",
    })),
  };
}

// GET /api/ai/config
// Récupère la configuration IA de l'étudiant
router.get("/config", (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const config = currentDb.getAIConfig();
    res.json(sanitizeAIConfig(config));
  } catch (err: any) {
    res.status(500).json({ error: "Erreur lecture configuration IA: " + err.message });
  }
});

// POST /api/ai/config
// Met à jour la configuration IA de l'étudiant
router.post("/config", (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const existing = currentDb.getAIConfig();
    const incoming = req.body as Partial<AIUserConfig>;

    // Fusionner en préservant les clés d'API si l'utilisateur envoie une clé masquée (••••)
    const updatedProviders = { ...existing.providers };

    const providersList: AIProvider[] = ["ollama", "openrouter", "claude", "mistral", "google"];
    for (const p of providersList) {
      if (incoming.providers && incoming.providers[p]) {
        const newP = incoming.providers[p]!;
        const currentKey = existing.providers[p]?.apiKey || "";
        const isMasked = newP.apiKey && newP.apiKey.includes("••••");

        updatedProviders[p] = {
          ...existing.providers[p],
          ...newP,
          apiKey: isMasked ? currentKey : (newP.apiKey !== undefined ? newP.apiKey.trim() : currentKey),
        };
      }
    }

    const updatedProfiles = Array.isArray(incoming.profiles)
      ? incoming.profiles.map((p) => {
          const prevProfile = (existing.profiles || []).find((ep) => ep.id === p.id);
          const isMasked = p.apiKey && p.apiKey.includes("••••");
          const fallbackKey = prevProfile?.apiKey || updatedProviders[p.provider]?.apiKey || "";
          return {
            ...p,
            apiKey: isMasked
              ? fallbackKey
              : p.apiKey !== undefined
              ? p.apiKey.trim()
              : fallbackKey,
          };
        })
      : existing.profiles;

    const saved = currentDb.setAIConfig({
      enabled: incoming.enabled !== undefined ? incoming.enabled : existing.enabled,
      activeProvider: incoming.activeProvider || existing.activeProvider,
      providers: updatedProviders,
      profiles: updatedProfiles,
      roleAssignments: incoming.roleAssignments !== undefined ? incoming.roleAssignments : existing.roleAssignments,
      taskAssignments: incoming.taskAssignments !== undefined ? incoming.taskAssignments : existing.taskAssignments,
      customRoles: incoming.customRoles !== undefined ? incoming.customRoles : existing.customRoles,
      enableTools: incoming.enableTools !== undefined ? incoming.enableTools : existing.enableTools,
      enableProactive: incoming.enableProactive !== undefined ? incoming.enableProactive : existing.enableProactive,
      customSystemPrompt: incoming.customSystemPrompt !== undefined ? incoming.customSystemPrompt : existing.customSystemPrompt,
    });

    res.json({
      success: true,
      message: "Configuration IA mise à jour avec succès !",
      config: sanitizeAIConfig(saved),
    });
  } catch (err: any) {
    res.status(500).json({ error: "Erreur sauvegarde configuration IA: " + err.message });
  }
});

// POST /api/ai/test
// Teste la connectivité avec un fournisseur IA donné
router.post("/test", async (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const existing = currentDb.getAIConfig();
    const { provider, config, profileId } = req.body as {
      provider: AIProvider;
      config: { apiKey?: string; baseUrl?: string; model?: string };
      profileId?: string;
    };

    if (!provider) {
      return res.status(400).json({ error: "Fournisseur non spécifié" });
    }

    // Récupérer la vraie clé stockée si celle reçue est masquée
    let effectiveKey = config?.apiKey;
    if (!effectiveKey || effectiveKey.includes("••••")) {
      const matchedProfile = profileId ? (existing.profiles || []).find((p) => p.id === profileId) : undefined;
      effectiveKey = matchedProfile?.apiKey || existing.providers[provider]?.apiKey || "";
    }

    const effectiveConfig = {
      apiKey: effectiveKey,
      baseUrl: config?.baseUrl || existing.providers[provider]?.baseUrl,
      model: config?.model || existing.providers[provider]?.model,
    };

    const result = await aiService.testProvider(provider, effectiveConfig);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Erreur test de connexion: " + err.message });
  }
});

// POST /api/ai/models
// Récupère les modèles disponibles depuis l'API du fournisseur
router.post("/models", async (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const existing = currentDb.getAIConfig();
    const { provider, config } = req.body as {
      provider: AIProvider;
      config?: { apiKey?: string; baseUrl?: string };
    };

    if (!provider) {
      return res.status(400).json({ error: "Fournisseur non spécifié" });
    }

    let effectiveKey = config?.apiKey;
    if (!effectiveKey || effectiveKey.includes("••••")) {
      effectiveKey = existing.providers[provider]?.apiKey || "";
    }

    const result = await aiService.listModels(provider, {
      apiKey: effectiveKey,
      baseUrl: config?.baseUrl || existing.providers[provider]?.baseUrl,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ models: [], source: "fallback", error: err.message });
  }
});

// POST /api/ai/chat
// Requête de chat interactif avec boucle d'outils
router.post("/chat", async (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const aiConfig = aiService.resolveConfigForRole(currentDb.getAIConfig(), (req.body?.role as string) || "chat");

    if (!aiConfig.enabled) {
      return res.status(400).json({
        error: "L'assistance IA est actuellement désactivée dans vos paramètres.",
        disabled: true,
      });
    }

    const { messages, context } = req.body as {
      messages: AIMessage[];
      context?: { resourceCode?: string; currentNoteTitle?: string };
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Historique de messages vide." });
    }

    // Injecter le contexte actif (matière consultée, titre du cours) si fourni
    const enrichedMessages = [...messages];
    if (context && context.resourceCode) {
      const lastMsg = enrichedMessages[enrichedMessages.length - 1];
      if (lastMsg && lastMsg.role === "user") {
        lastMsg.content = `[Contexte: Matière consultée = ${context.resourceCode}${
          context.currentNoteTitle ? `, Note active = "${context.currentNoteTitle}"` : ""
        }]\n${lastMsg.content}`;
      }
    }

    const credentials = (req as any).userCredentials;
    const result = await aiService.chatWithAgent(aiConfig, enrichedMessages, currentDb, credentials);

    res.json({
      success: true,
      message: result.message,
      toolsExecuted: result.toolsExecuted,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Erreur lors du traitement IA : " + err.message });
  }
});

// GET /api/ai/proactive-insights
// Renvoie les conseils, avertissements et alertes proactives pour l'étudiant
router.get("/proactive-insights", (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const aiConfig = aiService.resolveConfigForTask(currentDb.getAIConfig(), "proactive");

    if (!aiConfig.enabled || !aiConfig.enableProactive) {
      return res.json({ enabled: false, insights: [] });
    }

    const insights = aiService.generateProactiveInsights(currentDb);
    res.json({ enabled: true, insights });
  } catch (err: any) {
    res.status(500).json({ error: "Erreur génération insights proactifs: " + err.message });
  }
});

// POST /api/ai/document-assist
// Assistant d'écriture pour l'éditeur de cours (continuer, expliquer, résumer, quiz)
router.post("/document-assist", async (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const aiConfig = aiService.resolveConfigForTask(currentDb.getAIConfig(), "document");

    if (!aiConfig.enabled) {
      return res.status(400).json({
        error: "L'assistance IA est désactivée. Veuillez l'activer dans le menu IA.",
      });
    }

    const { action, text, resourceCode, noteTitle } = req.body as {
      action: "continue" | "explain" | "summarize" | "quiz" | "fix_markdown";
      text: string;
      resourceCode?: string;
      noteTitle?: string;
    };

    if (!text && action !== "continue") {
      return res.status(400).json({ error: "Texte source requis." });
    }

    let prompt = "";
    switch (action) {
      case "continue":
        prompt = `Tu es un professeur assistant en BUT Réseaux & Télécoms.
Voici le début de la prise de note pour le cours "${noteTitle || "Cours"}" (Matière: ${resourceCode || "BUT R&T"}) :
---
${text.slice(-3000)}
---
Continue la rédaction pédagogique du cours de manière naturelle, claire et structurée. Utilise des titres Markdown (#, ##), des puces, et des formules KaTeX ($...$) si pertinent. Ne répète pas ce qui a déjà été écrit.`;
        break;

      case "explain":
        prompt = `Tu es un tuteur pédagogique pour des étudiants de BUT Réseaux & Télécoms.
Voici un passage ou un concept tiré d'un cours (${resourceCode || "Informatique"}) :
---
${text.slice(0, 3000)}
---
Explique ce passage de façon claire, concrète, avec une analogie simple du monde réel pour que l'étudiant comprenne immédiatement.`;
        break;

      case "summarize":
        prompt = `Crée une fiche de révision synthétique et percutante à partir de cette note de cours (${resourceCode || "BUT R&T"}) :
---
${text.slice(0, 5000)}
---
Structure ta fiche ainsi :
1. Les 3 idées clés indispensables à retenir
2. Définitions et protocoles clés
3. Formules ou commandes terminal à savoir par cœur pour le DS
4. Pièges fréquents à éviter`;
        break;

      case "quiz":
        prompt = `Génère un mini-quiz de révision (QCM interactif + 1 question ouverte) pour évaluer un étudiant sur cette note (${resourceCode || "Réseaux"}) :
---
${text.slice(0, 4000)}
---
Propose 3 questions à choix multiples (avec 4 propositions A, B, C, D et la solution détaillée sous un spoiler ou bloc) et 1 question de réflexion pratique.`;
        break;

      case "fix_markdown":
        prompt = `Améliore la mise en forme et corrige l'orthographe du texte suivant, en insérant la syntaxe Markdown propre (tableaux, listes, code blocks, KaTeX $...$) :
---
${text.slice(0, 4000)}
---
Renvoie uniquement le texte Markdown corrigé et magnifiquement formaté.`;
        break;

      default:
        return res.status(400).json({ error: "Action inconnue." });
    }

    const messages: AIMessage[] = [{ role: "user", content: prompt }];
    const credentials = (req as any).userCredentials;

    // Pas besoin d'outils pour l'assistance rédactionnelle pure
    const tempConfig: AIUserConfig = { ...aiConfig, enableTools: false };
    const result = await aiService.chatWithAgent(tempConfig, messages, currentDb, credentials);

    res.json({
      success: true,
      action,
      result: result.message.content,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Erreur lors de l'assistance document : " + err.message });
  }
});

// POST /api/ai/draft-email
// Assistant de rédaction pour les courriels universitaires Zimbra
router.post("/draft-email", async (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const aiConfig = aiService.resolveConfigForTask(currentDb.getAIConfig(), "document");

    if (!aiConfig.enabled) {
      return res.status(400).json({
        error: "L'assistance IA est désactivée. Veuillez l'activer dans le menu IA.",
      });
    }

    const { type, recipient, subject, incomingEmailBody, customPrompt, studentName } = req.body as {
      type: "reply_ack" | "reply_question" | "absence" | "meeting" | "custom";
      recipient?: string;
      subject?: string;
      incomingEmailBody?: string;
      customPrompt?: string;
      studentName?: string;
    };

    let instructions = "";
    switch (type) {
      case "reply_ack":
        instructions = "Rédige une réponse polie et concise accusant bonne réception du message et confirmant que l'information a bien été prise en compte.";
        break;
      case "reply_question":
        instructions = `Rédige une réponse respectueuse demandant des précisions sur le point suivant : "${customPrompt || "le travail à rendre"}".`;
        break;
      case "absence":
        instructions = `Rédige un courriel respectueux pour justifier une absence en cours/TP auprès de l'enseignant. Mentionne que le justificatif médical ou d'absence sera transmis à la scolarité et demande comment rattraper la séance. Consigne spécifique : "${customPrompt || "absence pour raison médicale"}".`;
        break;
      case "meeting":
        instructions = `Rédige un courriel demandant poliment un court rendez-vous ou un échange en fin de séance pour discuter de : "${customPrompt || "du projet tutoré"}".`;
        break;
      case "custom":
        instructions = `Rédige un courriel universitaire soigné selon cette consigne de l'étudiant : "${customPrompt || "Préciser la demande"}".`;
        break;
    }

    const prompt = `Tu es un assistant universitaire aidant un étudiant de BUT Réseaux & Télécoms à rédiger un courriel professionnel à un enseignant ou à l'administration de l'IUT.
Nom de l'étudiant : ${studentName || "L'étudiant"}
Destinataire : ${recipient || "L'enseignant"}
Objet : ${subject ? `Re: ${subject}` : "Demande d'information"}
${incomingEmailBody ? `\nCourriel reçu auquel répondre :\n"""\n${incomingEmailBody.slice(0, 1500)}\n"""\n` : ""}

Consigne :
${instructions}

Règles de rédaction :
- Ton respectueux, vouvoiement obligatoire ("Madame, Monsieur" ou "Monsieur [Nom]").
- Clarté et concision, sans familiarité.
- Formule de politesse soignée ("En vous remerciant par avance pour votre retour, Bien cordialement,").
- Renvoie uniquement l'objet suggéré et le corps du mail prêt à être copié.`;

    const messages: AIMessage[] = [{ role: "user", content: prompt }];
    const credentials = (req as any).userCredentials;

    const tempConfig: AIUserConfig = { ...aiConfig, enableTools: false };
    const result = await aiService.chatWithAgent(tempConfig, messages, currentDb, credentials);

    res.json({
      success: true,
      draft: result.message.content,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Erreur rédaction courriel IA : " + err.message });
  }
});

// POST /api/ai/generate-td-exercises
// Générateur d'exercices de TD avec l'IA (feuille photo et/ou documents eCampus)
router.post("/generate-td-exercises", async (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const aiConfig = aiService.resolveConfigForRole(currentDb.getAIConfig(), (req.body?.role as string) || "chat");

    if (!aiConfig.enabled) {
      return res.status(400).json({
        error: "L'assistance IA est actuellement désactivée dans vos paramètres.",
      });
    }

    const {
      resourceCode,
      resourceName,
      sourceType,
      image,
      documentName,
      documentContent,
      topic,
      difficulty,
      exerciseCount,
      includeSolution,
      includeGrading,
      includeHints,
      additionalInstructions,
    } = req.body;

    if (!resourceCode) {
      return res.status(400).json({ error: "Code de la ressource (ex: R101) requis." });
    }

    const result = await aiService.generateTDExercises(aiConfig, {
      resourceCode,
      resourceName,
      sourceType: sourceType || "mixed",
      image,
      documentName,
      documentContent,
      topic,
      difficulty: difficulty || "moyen",
      exerciseCount: exerciseCount || 2,
      includeSolution: includeSolution !== false,
      includeGrading: Boolean(includeGrading),
      includeHints: Boolean(includeHints),
      additionalInstructions,
    });

    res.json({
      success: true,
      title: result.title,
      content: result.content,
      estimatedTime: result.estimatedTime,
    });
  } catch (err: any) {
    console.error("[-] Erreur génération TD IA:", err);
    res.status(500).json({ error: "Erreur lors de la génération des exercices de TD : " + err.message });
  }
});

// POST /api/ai/generate-qcm
// Générateur de QCM d'entraînement interactif avec l'IA
router.post("/generate-qcm", async (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const aiConfig = aiService.resolveConfigForRole(currentDb.getAIConfig(), (req.body?.role as string) || "chat");

    if (!aiConfig.enabled) {
      return res.status(400).json({
        error: "L'assistance IA est actuellement désactivée dans vos paramètres.",
      });
    }

    const {
      resourceCode,
      resourceName,
      sourceType,
      image,
      documentName,
      documentContent,
      topic,
      difficulty,
      questionCount,
      additionalInstructions,
    } = req.body;

    if (!resourceCode) {
      return res.status(400).json({ error: "Code de la ressource (ex: R101) requis." });
    }

    const quiz = await aiService.generateQCM(aiConfig, {
      resourceCode,
      resourceName,
      sourceType: sourceType || "topic",
      image,
      documentName,
      documentContent,
      topic,
      difficulty: difficulty || "moyen",
      questionCount: questionCount || 5,
      additionalInstructions,
    });

    res.json({
      success: true,
      quiz,
    });
  } catch (err: any) {
    console.error("[-] Erreur génération QCM IA:", err);
    res.status(500).json({ error: "Erreur lors de la génération du QCM : " + err.message });
  }
});

export default router;
