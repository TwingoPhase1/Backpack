import { Router } from "express";
import fs from "fs";
import { mailService, MailTriageMeta } from "../services/mailService.js";
import { aiService } from "../services/aiService.js";
import { db } from "../db.js";
import { AIMessage, AIUserConfig } from "../../src/types/index.js";

const router = Router();

// GET /api/mail/messages?folder=INBOX&limit=30&offset=0&refresh=true
router.get("/messages", async (req, res) => {
  try {
    const rawLimit = req.query.limit !== undefined ? parseInt(req.query.limit as string, 10) : 0;
    const limit = Number.isNaN(rawLimit) ? 0 : rawLimit;
    const offset = parseInt(req.query.offset as string, 10) || 0;
    const folder = (req.query.folder as string) || "INBOX";
    const forceRefresh = req.query.refresh === "true";
    const creds = req.credentials;

    const data = await mailService.getMessages(limit, offset, forceRefresh, creds, folder);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/mail/unread-count
router.get("/unread-count", async (req, res) => {
  try {
    const creds = req.credentials;
    const unreadCount = await mailService.getUnreadCount(creds);
    res.json({ unreadCount });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/mail/messages/:id?folder=INBOX
router.get("/messages/:id", async (req, res) => {
  try {
    const creds = req.credentials;
    const folder = (req.query.folder as string) || "INBOX";
    const message = await mailService.getMessage(req.params.id, creds, folder);
    res.json(message);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/mail/messages/:id/attachments/:partIndex?folder=INBOX
router.get("/messages/:id/attachments/:partIndex", async (req, res) => {
  try {
    const { id, partIndex } = req.params;
    const folder = (req.query.folder as string) || "INBOX";
    const creds = req.credentials;
    const { tempPath, filename } = await mailService.getAttachment(id, parseInt(partIndex, 10), creds, folder);

    if (!fs.existsSync(tempPath)) {
      return res.status(404).json({ error: "Pièce jointe introuvable" });
    }

    res.download(tempPath, filename, () => {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {}
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/mail/messages/:id/read
router.post("/messages/:id/read", async (req, res) => {
  try {
    const creds = req.credentials;
    const read = req.body?.read !== false;
    const folder = (req.body?.folder as string) || "INBOX";
    const result = await mailService.markRead(req.params.id, read, creds, folder);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/mail/messages/:id?folder=INBOX
router.delete("/messages/:id", async (req, res) => {
  try {
    const creds = req.credentials;
    const folder = (req.query.folder as string) || "INBOX";
    const result = await mailService.deleteMessage(req.params.id, creds, folder);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/mail/send
router.post("/send", async (req, res) => {
  try {
    const creds = req.credentials;
    const { to, cc, subject, bodyHtml, bodyText, inReplyTo, references, attachments } = req.body || {};
    if (!to || !String(to).trim()) {
      return res.status(400).json({ error: "Destinataire (À) requis." });
    }
    const result = await mailService.sendEmail(
      {
        to: String(to).trim(),
        cc: cc ? String(cc).trim() : undefined,
        subject: subject ? String(subject).trim() : "(Sans objet)",
        bodyHtml: bodyHtml || "",
        bodyText: bodyText || "",
        inReplyTo,
        references,
        attachments,
      },
      creds
    );
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: "Erreur d'envoi SMTP : " + error.message });
  }
});

// POST /api/mail/drafts/save
router.post("/drafts/save", async (req, res) => {
  try {
    const creds = req.credentials;
    const { to, cc, subject, bodyHtml, bodyText, inReplyTo, references } = req.body || {};
    const result = await mailService.saveDraft(
      {
        to: String(to || ""),
        cc: cc ? String(cc) : undefined,
        subject: subject || "(Brouillon)",
        bodyHtml: bodyHtml || "",
        bodyText: bodyText || "",
        inReplyTo,
        references,
      },
      creds
    );
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: "Erreur sauvegarde brouillon IMAP : " + error.message });
  }
});

// POST /api/mail/triage
// Analyse IA structurée d'un lot de courriels (résumé, priorité, catégorie, action requise)
router.post("/triage", async (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const creds = req.credentials;
    const aiConfig = aiService.resolveConfigForRole(currentDb.getAIConfig(), "mail_compose");
    if (!aiConfig.enabled) {
      return res.status(400).json({ error: "Activez l'IA dans les paramètres pour utiliser le triage automatique." });
    }

    const items = Array.isArray(req.body?.messages) ? req.body.messages.slice(0, 8) : [];
    const folder = (req.body?.folder as string) || "INBOX";
    if (items.length === 0) {
      return res.json({ success: true, triaged: {} });
    }

    const triagedOutput = await mailService.triageMessagesBatch(items, {
      folder,
      creds,
      currentDb,
      aiConfig,
    });

    res.json({ success: true, triaged: triagedOutput });
  } catch (error: any) {
    res.status(500).json({ error: "Erreur triage IA : " + error.message });
  }
});

// POST /api/mail/ai-compose
// Rédaction intelligente avec Tool Calling (planning, notes, Moodle, contacts) -> HTML propre
router.post("/ai-compose", async (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const creds = req.credentials;
    const aiConfig = aiService.resolveConfigForRole(currentDb.getAIConfig(), "mail_compose");
    if (!aiConfig.enabled) {
      return res.status(400).json({ error: "Activez l'IA dans les paramètres pour rédiger avec l'IA." });
    }

    const { instruction, mode, currentHtml, incomingMail, contacts } = req.body || {};
    if (!instruction || !String(instruction).trim()) {
      return res.status(400).json({ error: "Veuillez saisir une consigne pour l'IA." });
    }

    const contactsSnippet = Array.isArray(contacts) && contacts.length > 0
      ? `\nContacts récents connus (pour résoudre un prénom/nom en e-mail) :\n${contacts
          .slice(0, 20)
          .map((c: any) => `- ${c.name || ""} <${c.email}>`)
          .join("\n")}`
      : "";

    const incomingSnippet = incomingMail
      ? `\nMessage auquel on répond :\nDe : ${incomingMail.from}\nObjet : ${incomingMail.subject}\nContenu :\n${String(incomingMail.bodyText || "").slice(0, 2000)}`
      : "";

    const currentDraftSnippet = currentHtml
      ? `\nBrouillon actuel dans l'éditeur (à améliorer/modifier si demandé) :\n${String(currentHtml).slice(0, 2000)}`
      : "";

    const prompt = `Tu es l'assistant de rédaction de courriels universitaires de ${req.user?.name || "l'étudiant"} (BUT Réseaux & Télécoms - IUT Grand Ouest Normandie).
Tu peux utiliser tes outils (emploi du temps, notes, Moodle, cahier de texte) si la consigne mentionne un cours, une absence, une note ou une date.
${contactsSnippet}
${incomingSnippet}
${currentDraftSnippet}

Consigne de l'étudiant : "${instruction}"
Mode : ${mode || "reply"}

Règles strictes :
- Vouvoiement respectueux et ton universitaire professionnel (sauf si l'étudiant demande explicitement un ton familier).
- N'ajoute PAS de signature générique du type "[Votre nom]" car la signature de l'étudiant est ajoutée automatiquement par le compositeur.
- Réponds STRICTEMENT en JSON valide (sans texte autour) :
{
  "to": "adresse@email si déductible en mode new, sinon chaîne vide",
  "subject": "Objet suggéré si mode new, sinon chaîne vide",
  "bodyHtml": "<p>Bonjour ...</p><p>...</p><p>Bien cordialement,</p>"
}`;

    const messages: AIMessage[] = [{ role: "user", content: prompt }];
    const result = await aiService.chatWithAgent(aiConfig, messages, currentDb, creds);
    const raw = result.message.content || "";

    let parsed: { to?: string; subject?: string; bodyHtml?: string } = {};
    try {
      const cleaned = raw.replace(/```json\s*|\s*```/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      }
    } catch {}

    if (!parsed.bodyHtml) {
      // Fallback propre si le modèle a renvoyé du texte brut
      const escaped = raw
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .split(/\n{2,}/)
        .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
        .join("");
      parsed.bodyHtml = escaped;
    }

    res.json({
      success: true,
      to: parsed.to || "",
      subject: parsed.subject || "",
      bodyHtml: parsed.bodyHtml,
    });
  } catch (error: any) {
    res.status(500).json({ error: "Erreur rédaction IA : " + error.message });
  }
});

// GET /api/mail/staff
// Liste les professeurs (Zimbra GAL) et membres du staff autorisés à modifier l'EDT
router.get("/staff", (req, res) => {
  try {
    const currentDb = req.userDb || db;
    res.json({ senders: currentDb.getAuthorizedSenders() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/mail/staff/sync-teachers
// Synchronise les professeurs de l'EDT avec leurs adresses sur Zimbra
router.post("/staff/sync-teachers", async (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const creds = req.credentials;
    const names = currentDb.getUniqueScheduleTeacherNames();
    const resolved = await mailService.resolveTeachersFromGal(names, creds);
    const nowIso = new Date().toISOString();
    const senders = currentDb.upsertAuthorizedSenders(
      resolved.map((t) => ({ email: t.email, name: t.name, role: "teacher", addedAt: nowIso }))
    );
    res.json({ success: true, resolvedCount: resolved.length, senders });
  } catch (error: any) {
    res.status(500).json({ error: "Erreur synchronisation répertoire profs : " + error.message });
  }
});

// POST /api/mail/staff
// Ajoute manuellement une adresse e-mail en tant que staff autorisé (ex: scolarité, intervenant Unicaen)
router.post("/staff", async (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const creds = req.credentials;
    const { email, name, mailId, folder } = req.body || {};
    if (!email || !String(email).includes("@")) {
      return res.status(400).json({ error: "Adresse e-mail invalide." });
    }

    const sender = currentDb.addStaffSender(String(email), name ? String(name) : undefined);

    // Si on ajoute le staff depuis un mail ouvert et que l'IA est activée, analyser immédiatement ce mail pour l'EDT
    let actions: Array<{ action: string; summary: string; eventId?: string; visioUrl?: string }> = [];
    const aiConfig = aiService.resolveConfigForRole(currentDb.getAIConfig(), "mail_compose");
    if (mailId && aiConfig.enabled) {
      try {
        const detail = await mailService.getMessage(String(mailId), creds, folder || "INBOX");
        const bodyText = detail.bodyText || detail.bodyHtml?.replace(/<[^>]+>/g, " ") || "";
        const schedRes = await aiService.processMailForSchedule(
          aiConfig,
          {
            id: String(detail.id),
            subject: detail.subject,
            from: detail.from,
            senderName: detail.senderName || sender.name,
            date: detail.date,
            bodyText,
            resourceCode: detail.resourceCode,
          },
          currentDb
        );
        actions = schedRes.actions;

        const key = detail.messageId ? detail.messageId.trim() : `uid:${detail.id}`;
        const triageMap = mailService.loadTriageMap(creds?.username);
        const existingMeta = triageMap[key];
        if (existingMeta) {
          mailService.saveTriageEntry(creds?.username, key, {
            ...existingMeta,
            scheduleProcessed: true,
            ...(actions.length > 0 ? { aiScheduleActions: actions } : {}),
          });
        }
      } catch (e) {
        console.warn("[-] Analyse EDT post-ajout staff ignorée:", e);
      }
    }

    res.json({ success: true, sender, senders: currentDb.getAuthorizedSenders(), actions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/mail/staff
router.delete("/staff", (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: "Email manquant" });
    currentDb.removeStaffSender(String(email));
    res.json({ success: true, senders: currentDb.getAuthorizedSenders() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
