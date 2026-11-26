import { Router } from "express";
import multer from "multer";
import { db } from "../db.js";
import { runMoodleScraper, getMoodleSessionCookies } from "../services/moodleScraper.js";
import { aiService } from "../services/aiService.js";
import { ECAMPUS_BASE_URL } from "../config.js";
import https from "https";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

function buildMoodleCookieHeader(): string {
  const cookiesObj = getMoodleSessionCookies();
  return Object.entries(cookiesObj)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function fetchMoodleHtml(targetUrl: string, allowRetry = true): Promise<{ html: string; finalUrl: string }> {
  let currentUrl = targetUrl;
  if (currentUrl.startsWith(ECAMPUS_BASE_URL + "/") && !currentUrl.includes("lang=")) {
    currentUrl += (currentUrl.includes("?") ? "&" : "?") + "lang=fr";
  }
  for (let i = 0; i < 6; i++) {
    const cookieHeader = buildMoodleCookieHeader();
    const res = await fetch(currentUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        Cookie: cookieHeader,
        Referer: `${ECAMPUS_BASE_URL}/my/`,
      },
      redirect: "manual",
    });

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) break;
      const nextUrl = new URL(loc, currentUrl).toString();
      if (nextUrl.includes("cas.unicaen.fr")) {
        if (allowRetry) {
          await runMoodleScraper(true);
          return fetchMoodleHtml(targetUrl, false);
        }
        throw new Error("Session Moodle expirée (redirection CAS).");
      }
      if (!nextUrl.startsWith(ECAMPUS_BASE_URL + "/")) {
        return { html: "", finalUrl: nextUrl };
      }
      currentUrl = nextUrl;
      continue;
    }

    const html = await res.text();
    if (html.includes("cas.unicaen.fr/login") && allowRetry) {
      await runMoodleScraper(true);
      return fetchMoodleHtml(targetUrl, false);
    }
    return { html, finalUrl: currentUrl };
  }
  throw new Error("Trop de redirections lors du chargement de la page Moodle.");
}

function sanitizeMoodleHtml(rawHtml: string, token?: string): string {
  let clean = rawHtml
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  clean = clean.replace(
    /(href|src)=(["'])((?:https:\/\/ecampus-vert\.unicaen\.fr)?\/(?:pluginfile|theme\/image)\.php[^"']+)\2/gi,
    (_m, attr, q, rawUrl) => {
      const fullUrl = rawUrl.startsWith("http") ? rawUrl : `${ECAMPUS_BASE_URL}${rawUrl}`;
      const proxy = `/api/moodle/download?url=${encodeURIComponent(fullUrl)}&inline=1${token ? `&token=${encodeURIComponent(token)}` : ""}`;
      return `${attr}=${q}${proxy}${q}`;
    }
  );
  return clean;
}

// GET /api/moodle/courses
router.get("/courses", (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const courses = currentDb.getMoodleCourses();
    let status = currentDb.getMoodleSyncStatus();
    const globalStatus = db.getMoodleSyncStatus();

    if (courses.length === 0 && req.credentials) {
      if (!globalStatus.isSyncing) {
        void runMoodleScraper(false);
      }
      status = { ...status, isSyncing: true };
    } else if (globalStatus.isSyncing) {
      status = { ...status, isSyncing: true };
    }

    res.json({ courses, status });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/moodle/courses/:code
router.get("/courses/:code", (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const code = req.params.code;
    const course = currentDb.getMoodleCourseByResource(code);
    const allMatching = currentDb.getMoodleCoursesForResource(code);

    if (!course && allMatching.length === 0) {
      return res.status(404).json({ error: `Aucun cours Moodle associé à la ressource ${code}` });
    }

    const primary = course || allMatching[0];
    res.json({
      ...primary,
      matchedCourses: allMatching,
      totalMatchedCourses: allMatching.length,
      matchedResourceCode: code,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/moodle/mapping
// Retourne la cartographie regex complète entre toutes les ressources et leurs cours Moodle
router.get("/mapping", (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const resources = currentDb.getResources();
    const courses = currentDb.getMoodleCourses();

    const mapping = resources.map((r) => {
      const matched = currentDb.getMoodleCoursesForResource(r.code);
      const totalDocs = matched.reduce(
        (acc, c) =>
          acc +
          c.sections.reduce(
            (sAcc, s) => sAcc + s.modules.reduce((mAcc, m) => mAcc + m.files.length, 0),
            0
          ),
        0
      );

      return {
        resourceCode: r.code,
        resourceName: r.name,
        hasMoodleCourse: matched.length > 0,
        matchedCount: matched.length,
        totalDocuments: totalDocs,
        courses: matched.map((c) => ({
          id: c.id,
          moodleId: c.moodleId,
          fullname: c.fullname,
          shortname: c.shortname,
          url: c.url,
        })),
      };
    });

    res.json({ mapping, totalMapped: mapping.filter((m) => m.hasMoodleCourse).length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/moodle/assignments
// Retourne tous les devoirs et livrables Moodle avec leurs dates limites
router.get("/assignments", (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const courses = currentDb.getMoodleCourses();
    const assignments: any[] = [];

    for (const course of courses) {
      for (const section of course.sections || []) {
        for (const mod of section.modules || []) {
          const nameLower = (mod.name || "").toLowerCase();
          const isAssign =
            mod.type === "assign" ||
            Boolean(mod.dueDate) ||
            nameLower.includes("devoir") ||
            nameLower.includes("à rendre") ||
            nameLower.includes("a rendre") ||
            nameLower.includes("livrable") ||
            nameLower.includes("dépôt") ||
            nameLower.includes("depot");

          if (isAssign) {
            assignments.push({
              id: `${course.id}_${mod.id}`,
              name: mod.name,
              courseId: course.id,
              courseTitle: course.fullname || course.shortname,
              resourceCode: course.resourceCode,
              url: mod.url,
              dueDate: mod.dueDate,
              sectionName: section.name,
              description: mod.description,
            });
          }
        }
      }
    }

    // Trier : ceux avec date limite en premier, du plus urgent au moins urgent
    assignments.sort((a, b) => {
      if (a.dueDate && b.dueDate) {
        const tA = new Date(a.dueDate).getTime();
        const tB = new Date(b.dueDate).getTime();
        if (!isNaN(tA) && !isNaN(tB)) return tA - tB;
        return a.dueDate.localeCompare(b.dueDate);
      }
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });

    res.json({ assignments, total: assignments.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/moodle/status
router.get("/status", (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const status = currentDb.getMoodleSyncStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/moodle/sync
router.post("/sync", async (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const forceLogin = Boolean(req.body.forceLogin);
    // Launch scraper (bypassing 5 min auto cooldown for manual refresh)
    const status = await runMoodleScraper(forceLogin, true);
    if (currentDb !== db && db.getMoodleCourses().length > 0) {
      currentDb.updateMoodleCourses(db.getMoodleCourses());
      currentDb.updateMoodleSyncStatus(status);
    }
    const courses = currentDb.getMoodleCourses();
    res.json({ status, courses });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/moodle/activity?url=...&type=...
// Récupère et parse une page d'activité Moodle (Page, Devoir, Dossier, Forum, URL) pour affichage natif in-app
router.get("/activity", async (req, res) => {
  try {
    const targetUrl = req.query.url as string;
    const modType = (req.query.type as string) || "autre";
    if (!targetUrl || !targetUrl.startsWith(ECAMPUS_BASE_URL + "/")) {
      return res.status(400).json({ error: "URL d'activité Moodle invalide" });
    }

    const { html, finalUrl } = await fetchMoodleHtml(targetUrl);
    if (!finalUrl.startsWith(ECAMPUS_BASE_URL + "/")) {
      return res.json({
        type: "url",
        title: "Lien externe",
        externalUrl: finalUrl,
        html: "",
        files: [],
      });
    }

    const titleMatch = html.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i);
    const title = titleMatch
      ? titleMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : "Activité eCampus";

    // Extraire la zone principale #region-main
    const mainMatch = html.match(/<section[^>]+id=["']region-main["'][^>]*>([\s\S]*?)<\/section>/i)
      || html.match(/<div[^>]+role=["']main["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
    const regionHtml = mainMatch ? mainMatch[1] : html;

    // Extraire tous les fichiers pluginfile.php
    const filesMap = new Map<string, { name: string; url: string }>();
    const fileRegex = /<a[^>]+href=["'](https:\/\/ecampus-vert\.unicaen\.fr\/pluginfile\.php[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let fm: RegExpExecArray | null;
    while ((fm = fileRegex.exec(regionHtml)) !== null) {
      const fUrl = fm[1].replace(/&amp;/g, "&");
      const rawName = fm[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const urlName = decodeURIComponent(fUrl.split("/").pop()?.split("?")[0] || "Fichier");
      const name = rawName && rawName.length > 1 ? rawName : urlName;
      if (!filesMap.has(fUrl)) {
        filesMap.set(fUrl, { name, url: fUrl });
      }
    }

    // Extraire lien externe pour mod/url
    let externalUrl: string | undefined;
    if (modType === "url" || targetUrl.includes("mod/url")) {
      const urlMatch = regionHtml.match(/class=["'][^"']*urlworkaround[^"']*["'][\s\S]*?<a[^>]+href=["']([^"']+)["']/i);
      if (urlMatch) externalUrl = urlMatch[1].replace(/&amp;/g, "&");
    }

    // Extraire infos de devoir pour mod/assign
    let assignInfo: any = undefined;
    if (modType === "assign" || targetUrl.includes("mod/assign")) {
      const extractRow = (labelPattern: RegExp): string | undefined => {
        const rowRegex = new RegExp(`<tr[^>]*>[\\s\\S]*?<t[hd][^>]*>[^<]*${labelPattern.source}[^<]*<\\/t[hd]>[\\s\\S]*?<td[^>]*>([\\s\\S]*?)<\\/td>[\\s\\S]*?<\\/tr>`, "i");
        const m = regionHtml.match(rowRegex);
        return m ? m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : undefined;
      };
      const cmidMatch = targetUrl.match(/[?&]id=(\d+)/);
      assignInfo = {
        cmid: cmidMatch ? cmidMatch[1] : undefined,
        submissionStatus: extractRow(/Statut des travaux remis|Submission status/i),
        gradingStatus: extractRow(/Statut de l['’]évaluation|Grading status/i),
        dueDate: extractRow(/Date de remise|Due date/i),
        timeRemaining: extractRow(/Temps restant|Time remaining/i),
        canSubmit: regionHtml.includes("action=editsubmission") || regionHtml.includes("Ajouter un travail") || regionHtml.includes("Modifier le travail"),
      };
    }

    // Détecter BigBlueButton (mod/bigbluebuttonbn) dans toute la page HTML
    let bbbJoinEndpoint: string | undefined;
    if (targetUrl.includes("mod/bigbluebuttonbn") || html.includes("bbb_view.php")) {
      const bbbHrefMatch =
        html.match(/(https:\/\/ecampus-vert\.unicaen\.fr\/mod\/bigbluebuttonbn\/bbb_view\.php\?[^"'\s<>]*action=join[^"'\s<>]*)/i) ||
        html.match(/href=["']([^"']*mod\/bigbluebuttonbn\/bbb_view\.php\?[^"']*action=join[^"']*)["']/i) ||
        html.match(/data-action-url=["']([^"']*bbb_view\.php[^"']*)["']/i);
      if (bbbHrefMatch) {
        bbbJoinEndpoint = bbbHrefMatch[1].replace(/&amp;/g, "&");
        if (!bbbJoinEndpoint.startsWith("http")) {
          bbbJoinEndpoint = `${ECAMPUS_BASE_URL}${bbbJoinEndpoint.startsWith("/") ? "" : "/mod/bigbluebuttonbn/"}${bbbJoinEndpoint}`;
        }
      } else {
        const cmidMatch = targetUrl.match(/[?&]id=(\d+)/);
        const bnMatch = html.match(/name=["']bn["'][^>]*value=["'](\d+)["']/i) || html.match(/[?&]bn=(\d+)/);
        if (cmidMatch) {
          bbbJoinEndpoint = `${ECAMPUS_BASE_URL}/mod/bigbluebuttonbn/bbb_view.php?action=join&id=${cmidMatch[1]}${bnMatch ? `&bn=${bnMatch[1]}` : ""}`;
        }
      }
    }

    const token = req.authToken;
    return res.json({
      type: modType,
      title,
      url: finalUrl,
      externalUrl,
      bbbJoinEndpoint,
      html: sanitizeMoodleHtml(regionHtml, token),
      files: Array.from(filesMap.values()),
      assignInfo,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Erreur lors du chargement de l'activité Moodle" });
  }
});

// GET /api/moodle/bbb/join?url=...
// Résout l'URL authentifiée de la salle BigBlueButton sans quitter l'app
router.get("/bbb/join", async (req, res) => {
  try {
    const targetUrl = req.query.url as string;
    if (!targetUrl || !targetUrl.startsWith(ECAMPUS_BASE_URL + "/")) {
      return res.status(400).json({ error: "URL BigBlueButton invalide" });
    }
    const { finalUrl } = await fetchMoodleHtml(targetUrl);
    return res.json({ joinUrl: finalUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Impossible de rejoindre la session BigBlueButton" });
  }
});

// GET /api/moodle/bbb/redirect?url=...
// Redirige directement vers la salle BigBlueButton (utilisé par les boutons Visio sur l'EDT et le Dashboard)
router.get("/bbb/redirect", async (req, res) => {
  try {
    const targetUrl = req.query.url as string;
    if (!targetUrl || !targetUrl.startsWith(ECAMPUS_BASE_URL + "/")) {
      return res.status(400).send("URL BigBlueButton invalide");
    }
    let joinEndpoint = targetUrl;
    if (!targetUrl.includes("bbb_view.php")) {
      const { html } = await fetchMoodleHtml(targetUrl);
      const m = html.match(/(https:\/\/ecampus-vert\.unicaen\.fr\/mod\/bigbluebuttonbn\/bbb_view\.php\?[^"'\s<>]*action=join[^"'\s<>]*)/i);
      if (m) {
        joinEndpoint = m[1].replace(/&amp;/g, "&");
      } else {
        const cmid = targetUrl.match(/[?&]id=(\d+)/)?.[1];
        if (cmid) joinEndpoint = `${ECAMPUS_BASE_URL}/mod/bigbluebuttonbn/bbb_view.php?action=join&id=${cmid}`;
      }
    }
    const { finalUrl } = await fetchMoodleHtml(joinEndpoint);
    return res.redirect(finalUrl);
  } catch (error: any) {
    res.status(500).send(error.message || "Session BigBlueButton indisponible");
  }
});

// POST /api/moodle/assign/submit
// Permet de déposer un fichier directement sur un devoir Moodle (mod/assign) depuis Backpack
router.post("/assign/submit", upload.single("file"), async (req, res) => {
  try {
    const assignUrl = req.body?.url as string;
    const file = req.file;
    if (!assignUrl || !assignUrl.startsWith(ECAMPUS_BASE_URL + "/")) {
      return res.status(400).json({ error: "URL de devoir Moodle invalide" });
    }
    if (!file) {
      return res.status(400).json({ error: "Aucun fichier sélectionné" });
    }

    const cmidMatch = assignUrl.match(/[?&]id=(\d+)/);
    if (!cmidMatch) {
      return res.status(400).json({ error: "Identifiant du devoir (id) introuvable" });
    }
    const cmid = cmidMatch[1];
    const editUrl = `${ECAMPUS_BASE_URL}/mod/assign/view.php?id=${cmid}&action=editsubmission`;
    const { html } = await fetchMoodleHtml(editUrl);

    const sesskeyMatch = html.match(/["']sesskey["']\s*:\s*["']([^"']+)["']/) || html.match(/name=["']sesskey["']\s+value=["']([^"']+)["']/);
    const itemidMatch = html.match(/name=["']files_filemanager["'][^>]*value=["'](\d+)["']/) || html.match(/["']itemid["']\s*:\s*(\d+)/);
    const ctxMatch = html.match(/["']contextid["']\s*:\s*(\d+)/);

    if (!sesskeyMatch || !itemidMatch) {
      return res.status(400).json({
        error: "Ce devoir n'accepte pas le dépôt de fichier direct (ou la période de remise est fermée).",
      });
    }

    const sesskey = sesskeyMatch[1];
    const itemid = itemidMatch[1];
    const ctxId = ctxMatch ? ctxMatch[1] : "";
    const cookieHeader = buildMoodleCookieHeader();

    // 1. Upload du fichier dans la zone de brouillon Moodle
    const form = new FormData();
    form.append("repo_upload_file", new Blob([new Uint8Array(file.buffer)], { type: file.mimetype || "application/octet-stream" }), file.originalname);
    form.append("sesskey", sesskey);
    form.append("repo_id", "4");
    form.append("itemid", itemid);
    if (ctxId) form.append("ctx_id", ctxId);
    form.append("savepath", "/");
    form.append("title", file.originalname);

    const uploadRes = await fetch(`${ECAMPUS_BASE_URL}/repository/repository_ajax.php?action=upload`, {
      method: "POST",
      headers: {
        Cookie: cookieHeader,
        Referer: editUrl,
      },
      body: form,
    });
    const uploadJson: any = await uploadRes.json().catch(() => ({}));
    if (!uploadRes.ok || uploadJson?.error) {
      throw new Error(uploadJson?.error || `Échec upload Moodle HTTP ${uploadRes.status}`);
    }

    // 2. Validation du formulaire de remise de devoir
    const submitParams = new URLSearchParams();
    submitParams.append("id", cmid);
    submitParams.append("action", "savesubmission");
    submitParams.append("sesskey", sesskey);
    submitParams.append("_qf__mod_assign_submission_form", "1");
    submitParams.append("files_filemanager", itemid);
    submitParams.append("submitbutton", "Enregistrer");

    const saveRes = await fetch(`${ECAMPUS_BASE_URL}/mod/assign/view.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader,
        Referer: editUrl,
      },
      body: submitParams.toString(),
      redirect: "manual",
    });

    if (saveRes.status >= 400) {
      throw new Error(`Erreur lors de l'enregistrement du devoir (HTTP ${saveRes.status})`);
    }

    res.json({ success: true, message: `Fichier « ${file.originalname} » déposé sur Moodle avec succès.` });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Erreur lors du dépôt sur Moodle" });
  }
});

// ============================================================================
// MOODLE QUIZ (mod_quiz) — Répondre aux questionnaires/tests dans Backpack
// ============================================================================

async function postMoodleForm(targetUrl: string, params: URLSearchParams, referer: string): Promise<{ html: string; finalUrl: string }> {
  const cookieHeader = buildMoodleCookieHeader();
  const res = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Cookie: cookieHeader,
      Referer: referer,
    },
    body: params.toString(),
    redirect: "manual",
  });

  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    if (loc) {
      const nextUrl = new URL(loc, targetUrl).toString();
      return fetchMoodleHtml(nextUrl);
    }
  }
  return { html: await res.text(), finalUrl: targetUrl };
}

function extractAttr(tag: string, attr: string): string | undefined {
  const m = tag.match(new RegExp(`${attr}=["']([^"']*)["']`, "i"));
  return m ? m[1].replace(/&amp;/g, "&") : undefined;
}

function parseQuizAttemptHtml(html: string, currentUrl: string, token?: string) {
  const formMatch = html.match(/<form[^>]+id=["']responseform["'][^>]*>([\s\S]*?)<\/form>/i);
  const formTagMatch = html.match(/<form[^>]+id=["']responseform["'][^>]*>/i);
  const processUrl = (formTagMatch && extractAttr(formTagMatch[0], "action")) || `${ECAMPUS_BASE_URL}/mod/quiz/processattempt.php`;
  const formBody = formMatch ? formMatch[1] : html;

  const hiddenFields: Record<string, string> = {};
  const inputRegex = /<input[^>]+type=["']hidden["'][^>]*>/gi;
  let im: RegExpExecArray | null;
  while ((im = inputRegex.exec(formBody)) !== null) {
    const name = extractAttr(im[0], "name");
    const val = extractAttr(im[0], "value") ?? "";
    if (name) hiddenFields[name] = val;
  }

  // Découper par bloc de question <div id="question-..." class="que ...">
  const questions: Array<{
    id: string;
    number: string;
    textHtml: string;
    flagField?: { name: string; checked: boolean };
    inputs: Array<{
      kind: "radio" | "checkbox" | "text" | "textarea" | "select";
      name: string;
      value?: string;
      labelHtml?: string;
      checked?: boolean;
      placeholder?: string;
      options?: Array<{ value: string; label: string; selected?: boolean }>;
    }>;
  }> = [];

  const qParts = formBody.split(/(?=<div[^>]+id=["']question-[^"']+["'][^>]*class=["'][^"']*\bque\b)/i);
  for (const part of qParts) {
    const qIdMatch = part.match(/^<div[^>]+id=["'](question-[^"']+)["']/i);
    if (!qIdMatch) continue;
    const qId = qIdMatch[1];

    const qNoMatch = part.match(/class=["'][^"']*\bqno\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    const number = qNoMatch ? qNoMatch[1].replace(/<[^>]+>/g, "").trim() : "";

    const qTextMatch = part.match(/<div[^>]+class=["'][^"']*\bqtext\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    let textHtml = qTextMatch ? sanitizeMoodleHtml(qTextMatch[1], token) : "";

    // Extraire les images d'illustration éventuelles (ex: ddimageortext background / droparea) hors qtext
    const bgImgMatch = part.match(/<img[^>]+class=["'][^"']*dropbackground[^"']*["'][^>]*>/i);
    if (bgImgMatch) {
      textHtml += `<div class="mt-2">${sanitizeMoodleHtml(bgImgMatch[0], token)}</div>`;
    }

    let flagField: { name: string; checked: boolean } | undefined;
    const inputs: any[] = [];
    // Radio & Checkbox
    const rcRegex = /<input[^>]+type=["'](radio|checkbox)["'][^>]*>/gi;
    let rcm: RegExpExecArray | null;
    while ((rcm = rcRegex.exec(part)) !== null) {
      const tag = rcm[0];
      const kind = rcm[1].toLowerCase() as "radio" | "checkbox";
      const name = extractAttr(tag, "name");
      const value = extractAttr(tag, "value") ?? "";
      const id = extractAttr(tag, "id");
      const ariaLblId = extractAttr(tag, "aria-labelledby");
      const checked = /\bchecked\b/i.test(tag);
      if (!name) continue;
      if (name.endsWith(":flagged")) {
        flagField = { name, checked };
        continue;
      }
      if (value === "" && kind === "radio" && name.endsWith("_answer") && tag.includes("sr-only")) continue;
      if (kind === "radio" && value === "-1") continue;

      let labelHtml = "";
      if (ariaLblId) {
        const escAria = ariaLblId.split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const ariaMatch = part.match(new RegExp(`<[a-z0-9]+[^>]+id=["']${escAria}["'][^>]*>([\\s\\S]*?)<\\/(?:div|span|label)>`, "i"));
        if (ariaMatch) labelHtml = sanitizeMoodleHtml(ariaMatch[1], token);
      }
      if (!labelHtml && id) {
        const escId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const lblMatch = part.match(new RegExp(`<label[^>]+for=["']${escId}["'][^>]*>([\\s\\S]*?)<\\/label>`, "i"));
        if (lblMatch) labelHtml = sanitizeMoodleHtml(lblMatch[1], token);
      }
      if (!labelHtml) {
        // Fallback: lire le div/span/label juste après l'input
        const after = part.slice(rcm.index + tag.length, rcm.index + tag.length + 700);
        const afterMatch = after.match(/^\s*(?:<\/?(?:div|span|p)[^>]*>\s*)*<div[^>]+class=["'][^"']*flex-fill[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)
          || after.match(/^\s*(?:<label[^>]*>|<div[^>]*>|<span[^>]*>)?([\s\S]{1,350}?)(?:<\/label>|<\/div>|<\/p>|<br)/i);
        if (afterMatch) labelHtml = sanitizeMoodleHtml(afterMatch[1], token);
      }
      const plainLabel = labelHtml.replace(/<[^>]+>/g, "").trim();
      if (/effacer mon choix|clear my choice|limpar a minha escolha/i.test(plainLabel)) continue;

      inputs.push({ kind, name, value, labelHtml: plainLabel ? labelHtml : value, checked });
    }

    // Text inputs (hors hidden/submit/radio/checkbox)
    const txtRegex = /<input[^>]+type=["'](text|number|email)["'][^>]*>/gi;
    let tm: RegExpExecArray | null;
    while ((tm = txtRegex.exec(part)) !== null) {
      const name = extractAttr(tm[0], "name");
      if (!name) continue;
      inputs.push({
        kind: "text",
        name,
        value: extractAttr(tm[0], "value") ?? "",
        placeholder: extractAttr(tm[0], "placeholder") ?? "",
      });
    }

    // Textareas (questions ouvertes / rédaction)
    const taRegex = /<textarea[^>]*>([\s\S]*?)<\/textarea>/gi;
    let tam: RegExpExecArray | null;
    while ((tam = taRegex.exec(part)) !== null) {
      const name = extractAttr(tam[0], "name");
      if (!name) continue;
      inputs.push({
        kind: "textarea",
        name,
        value: tam[1].replace(/<[^>]+>/g, "").trim(),
      });
    }

    // Selects (dropdowns / appariement / mots manquants)
    const selRegex = /<select[^>]*>([\s\S]*?)<\/select>/gi;
    let sm: RegExpExecArray | null;
    while ((sm = selRegex.exec(part)) !== null) {
      const name = extractAttr(sm[0], "name");
      if (!name) continue;
      const options: Array<{ value: string; label: string; selected?: boolean }> = [];
      const optRegex = /<option[^>]*>([\s\S]*?)<\/option>/gi;
      let om: RegExpExecArray | null;
      while ((om = optRegex.exec(sm[1])) !== null) {
        options.push({
          value: extractAttr(om[0], "value") ?? "",
          label: om[1].replace(/<[^>]+>/g, "").trim(),
          selected: /\bselected\b/i.test(om[0]),
        });
      }
      // Chercher un libellé de ligne (<td class="text">...</td>) pour les questions d'appariement (match)
      let labelHtml = "";
      const before = part.slice(Math.max(0, sm.index - 600), sm.index);
      const tdMatch = before.match(/<td[^>]+class=["'][^"']*\btext\b[^"']*["'][^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>\s*(?:<label[^>]*>[^<]*<\/label>\s*)?$/i);
      if (tdMatch) {
        labelHtml = sanitizeMoodleHtml(tdMatch[1], token);
      }
      inputs.push({ kind: "select", name, labelHtml: labelHtml || undefined, options });
    }

    // Glisser-déposer (ddwtos / ddimageortext) : zones placeinput + éléments draghome
    const dragItems: Array<{ value: string; label: string }> = [];
    const dragRegex = /<(?:span|div)[^>]+class=["'][^"']*\bdraghome\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div)>/gi;
    let dm: RegExpExecArray | null;
    let dragIdx = 1;
    while ((dm = dragRegex.exec(part)) !== null) {
      const cls = extractAttr(dm[0], "class") || "";
      const choiceMatch = cls.match(/\bchoice(\d+)\b/);
      const val = choiceMatch ? choiceMatch[1] : String(dragIdx);
      const lbl = dm[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (lbl && !dragItems.some((d) => d.value === val)) {
        dragItems.push({ value: val, label: lbl });
      }
      dragIdx++;
    }
    if (dragItems.length > 0) {
      const placeRegex = /<input[^>]+class=["'][^"']*\bplaceinput\b[^"']*["'][^>]*>/gi;
      let pm: RegExpExecArray | null;
      let zoneIdx = 1;
      while ((pm = placeRegex.exec(part)) !== null) {
        const name = extractAttr(pm[0], "name");
        const curVal = extractAttr(pm[0], "value") || "0";
        if (!name) continue;
        inputs.push({
          kind: "select",
          name,
          labelHtml: `Zone à compléter ${zoneIdx}`,
          options: [
            { value: "0", label: "Choisir...", selected: curVal === "0" || !curVal },
            ...dragItems.map((d) => ({ ...d, selected: curVal === d.value })),
          ],
        });
        zoneIdx++;
      }
    }

    questions.push({ id: qId, number, textHtml, flagField, inputs });
  }

  // Extraire la navigation officielle Moodle (quiznavbutton1..N) présente dans le bloc de droite de la page
  const navMap = new Map<
    string,
    {
      number: string;
      pageIndex: number;
      answered: boolean;
      flagged: boolean;
      isCurrent: boolean;
      blocked: boolean;
    }
  >();
  const currentPage = Number(hiddenFields.thispage || 0);
  const navBtnRegex = /<(a|span|button)[^>]+id=["']quiznavbutton(\d+)["'][^>]*>/gi;
  let nm: RegExpExecArray | null;
  while ((nm = navBtnRegex.exec(html)) !== null) {
    const tagName = nm[1].toLowerCase();
    const tag = nm[0];
    const numStr = nm[2];
    const cls = extractAttr(tag, "class") || "";
    const dpAttr = extractAttr(tag, "data-quiz-page");
    const hrefAttr = extractAttr(tag, "href");

    let pageIndex = currentPage;
    if (dpAttr !== undefined && /^\d+$/.test(dpAttr.trim())) {
      pageIndex = parseInt(dpAttr.trim(), 10);
    } else if (hrefAttr) {
      try {
        const u = new URL(hrefAttr, currentUrl);
        const p = u.searchParams.get("page");
        pageIndex = p !== null && /^\d+$/.test(p) ? parseInt(p, 10) : 0;
      } catch {
        pageIndex = currentPage;
      }
    }

    const answered = /\b(?:answersaved|complete|correct|partiallycorrect|incorrect)\b/i.test(cls);
    const flagged = /\bflagged\b/i.test(cls);
    const isCurrent = /\bthispage\b/i.test(cls);
    const blocked =
      /\bblocked\b/i.test(cls) || (tagName === "span" && !hrefAttr && dpAttr === undefined);

    if (!navMap.has(numStr)) {
      navMap.set(numStr, {
        number: numStr,
        pageIndex,
        answered,
        flagged,
        isCurrent,
        blocked,
      });
    }
  }
  const navItems = Array.from(navMap.values()).sort((a, b) => Number(a.number) - Number(b.number));

  return {
    attemptUrl: currentUrl,
    processUrl,
    hiddenFields,
    questions,
    navItems,
    currentPage,
    hasNextPage: hiddenFields.nextpage !== undefined && hiddenFields.nextpage !== "-1",
    hasPrevPage: hiddenFields.thispage !== undefined && hiddenFields.thispage !== "0",
  };
}

async function prefetchAllQuizQuestions(
  firstHtml: string,
  firstUrl: string,
  firstParsed: ReturnType<typeof parseQuizAttemptHtml>,
  token?: string
) {
  const firstPageIdx = Number(firstParsed.hiddenFields?.thispage || 0);
  const allQuestions: Array<ReturnType<typeof parseQuizAttemptHtml>["questions"][number] & { pageIndex: number }> =
    firstParsed.questions.map((q) => ({ ...q, pageIndex: firstPageIdx }));
  const seenIds = new Set(allQuestions.map((q) => q.id));

  let firstAttemptId: string | null = null;
  try {
    firstAttemptId = new URL(firstUrl).searchParams.get("attempt");
  } catch {}

  // Extraire les numéros de pages uniques depuis la navigation du quiz Moodle (href ou data-quiz-page)
  const pageNums = new Set<number>();
  const linkRegex = /href=["']([^"']*attempt\.php\?[^"']*)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRegex.exec(firstHtml)) !== null) {
    try {
      const absUrl = new URL(m[1].replace(/&amp;/g, "&"), firstUrl);
      const linkAttempt = absUrl.searchParams.get("attempt");
      if (firstAttemptId && linkAttempt && linkAttempt !== firstAttemptId) continue;
      const pageParam = absUrl.searchParams.get("page");
      const pNum = pageParam !== null ? parseInt(pageParam, 10) : 0;
      if (!Number.isNaN(pNum) && pNum >= 0) {
        pageNums.add(pNum);
      }
    } catch {}
  }

  const dataPageRegex = /data-quiz-page=["'](\d+)["']/gi;
  let dp: RegExpExecArray | null;
  while ((dp = dataPageRegex.exec(firstHtml)) !== null) {
    const pNum = parseInt(dp[1], 10);
    if (!Number.isNaN(pNum) && pNum >= 0) {
      pageNums.add(pNum);
    }
  }

  for (const item of firstParsed.navItems || []) {
    if (!item.blocked && typeof item.pageIndex === "number" && item.pageIndex >= 0) {
      pageNums.add(item.pageIndex);
    }
  }

  if (firstPageIdx > 0) {
    pageNums.add(0);
  }
  pageNums.delete(firstPageIdx);

  const sortQuestions = () => {
    allQuestions.sort((a, b) => {
      const na = parseInt(a.number || "", 10);
      const nb = parseInt(b.number || "", 10);
      if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) {
        return na - nb;
      }
      return a.pageIndex - b.pageIndex;
    });
  };

  // Fallback si la navigation ne contient pas de liens directs mais qu'il y a une page suivante
  if (pageNums.size === 0 && firstParsed.hasNextPage) {
    for (let pNum = 0; pNum <= 40; pNum++) {
      if (pNum === firstPageIdx) continue;
      try {
        const u = new URL(firstUrl);
        u.hash = "";
        u.searchParams.set("page", String(pNum));
        const { html, finalUrl } = await fetchMoodleHtml(u.toString());
        const parsed = parseQuizAttemptHtml(html, finalUrl, token);
        if (!parsed.questions.length) break;
        const pageIdx = Number(parsed.hiddenFields?.thispage ?? pNum);
        let added = 0;
        for (const q of parsed.questions) {
          if (!seenIds.has(q.id)) {
            seenIds.add(q.id);
            allQuestions.push({ ...q, pageIndex: pageIdx });
            added++;
          }
        }
        if (added === 0 || !parsed.hasNextPage) break;
      } catch {
        break;
      }
    }
    sortQuestions();
    console.log(`[Moodle Quiz] Prefetch séquentiel : ${allQuestions.length} question(s) récupérée(s).`);
    return { ...firstParsed, allQuestions };
  }

  const sortedPages = Array.from(pageNums)
    .sort((a, b) => a - b)
    .slice(0, 40);

  const pageUrlMap = new Map<number, string>();
  for (const pNum of sortedPages) {
    try {
      const u = new URL(firstUrl);
      u.hash = "";
      u.searchParams.set("page", String(pNum));
      pageUrlMap.set(pNum, u.toString());
    } catch {}
  }

  const fetchQuizPage = async (pNum: number, url: string) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { html, finalUrl } = await fetchMoodleHtml(url);
        const parsed = parseQuizAttemptHtml(html, finalUrl, token);
        if (parsed.questions.length > 0 || attempt === 1) {
          const pageIndex = Number(parsed.hiddenFields?.thispage ?? pNum);
          return { parsed, pageIndex };
        }
      } catch {
        if (attempt === 1) return null;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  };

  // Prefetch par lots de 3 requêtes concurrentes pour ne pas saturer le verrou de session PHP Moodle
  const CONCURRENCY = 3;
  for (let i = 0; i < sortedPages.length; i += CONCURRENCY) {
    const batchNums = sortedPages.slice(i, i + CONCURRENCY);
    const pages = await Promise.all(
      batchNums.map((pNum) => {
        const url = pageUrlMap.get(pNum);
        return url ? fetchQuizPage(pNum, url) : Promise.resolve(null);
      })
    );
    for (const p of pages) {
      if (!p) continue;
      for (const q of p.parsed.questions) {
        if (!seenIds.has(q.id)) {
          seenIds.add(q.id);
          allQuestions.push({ ...q, pageIndex: p.pageIndex });
        }
      }
    }
  }

  sortQuestions();
  console.log(
    `[Moodle Quiz] Prefetch : ${allQuestions.length} question(s) sur ${sortedPages.length + 1} page(s) unique(s).`
  );
  return { ...firstParsed, allQuestions };
}

// GET /api/moodle/quiz/info?url=...
router.get("/quiz/info", async (req, res) => {
  try {
    const targetUrl = req.query.url as string;
    if (!targetUrl || !targetUrl.startsWith(ECAMPUS_BASE_URL + "/")) {
      return res.status(400).json({ error: "URL du questionnaire invalide" });
    }

    const { html, finalUrl } = await fetchMoodleHtml(targetUrl);
    const titleMatch = html.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "Questionnaire eCampus";

    const introMatch = html.match(/<div[^>]+id=["']intro["'][^>]*>([\s\S]*?)<\/div>/i);
    const introHtml = introMatch ? sanitizeMoodleHtml(introMatch[1], req.authToken) : "";

    const attemptLinkMatch = html.match(/href=["'](https:\/\/ecampus-vert\.unicaen\.fr\/mod\/quiz\/attempt\.php\?[^"']+)["']/i);
    const startFormMatch = html.match(/<form[^>]+action=["'][^"']*mod\/quiz\/startattempt\.php["'][^>]*>([\s\S]*?)<\/form>/i);

    let buttonLabel = "Commencer le questionnaire";
    if (attemptLinkMatch) {
      buttonLabel = "Continuer le questionnaire";
    } else if (startFormMatch) {
      const btnMatch = startFormMatch[1].match(/<(?:button|input[^>]+type=["']submit["'])[^>]*>(?:([\s\S]*?)<\/button>)?/i);
      const val = btnMatch?.[1]?.replace(/<[^>]+>/g, "").trim() || (btnMatch && extractAttr(btnMatch[0], "value"));
      if (val) buttonLabel = val;
    }

    res.json({
      title,
      url: finalUrl,
      introHtml,
      canStart: Boolean(startFormMatch || attemptLinkMatch),
      inProgressAttemptUrl: attemptLinkMatch ? attemptLinkMatch[1].replace(/&amp;/g, "&") : undefined,
      buttonLabel,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Erreur chargement questionnaire Moodle" });
  }
});

// POST /api/moodle/quiz/start
router.post("/quiz/start", async (req, res) => {
  try {
    const targetUrl = req.body?.url as string;
    if (!targetUrl || !targetUrl.startsWith(ECAMPUS_BASE_URL + "/")) {
      return res.status(400).json({ error: "URL du questionnaire invalide" });
    }

    const { html, finalUrl } = await fetchMoodleHtml(targetUrl);
    const attemptLinkMatch = html.match(/href=["'](https:\/\/ecampus-vert\.unicaen\.fr\/mod\/quiz\/attempt\.php\?[^"']+)["']/i);
    if (attemptLinkMatch) {
      const attemptUrl = attemptLinkMatch[1].replace(/&amp;/g, "&");
      const { html: attemptHtml, finalUrl: attemptFinal } = await fetchMoodleHtml(attemptUrl);
      const parsed = parseQuizAttemptHtml(attemptHtml, attemptFinal, req.authToken);
      return res.json(await prefetchAllQuizQuestions(attemptHtml, attemptFinal, parsed, req.authToken));
    }

    const startFormMatch = html.match(/<form[^>]+action=["']([^"']*mod\/quiz\/startattempt\.php)["'][^>]*>([\s\S]*?)<\/form>/i);
    if (!startFormMatch) {
      return res.status(400).json({ error: "Impossible de démarrer ce questionnaire (aucune tentative autorisée)." });
    }

    const actionUrl = startFormMatch[1].replace(/&amp;/g, "&");
    const params = new URLSearchParams();
    const inputRegex = /<input[^>]+>/gi;
    let im: RegExpExecArray | null;
    while ((im = inputRegex.exec(startFormMatch[2])) !== null) {
      const type = (extractAttr(im[0], "type") || "text").toLowerCase();
      const name = extractAttr(im[0], "name");
      const val = extractAttr(im[0], "value") ?? "";
      if (name && type !== "submit") params.append(name, val);
    }

    const { html: attemptHtml, finalUrl: attemptFinal } = await postMoodleForm(actionUrl, params, finalUrl);
    const parsed = parseQuizAttemptHtml(attemptHtml, attemptFinal, req.authToken);
    res.json(await prefetchAllQuizQuestions(attemptHtml, attemptFinal, parsed, req.authToken));
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Erreur démarrage questionnaire Moodle" });
  }
});

// POST /api/moodle/quiz/submit
router.post("/quiz/submit", async (req, res) => {
  try {
    const { processUrl, hiddenFields, answers, action, targetPage } = req.body || {};
    if (!processUrl || !String(processUrl).startsWith(ECAMPUS_BASE_URL + "/")) {
      return res.status(400).json({ error: "URL de soumission Moodle invalide" });
    }

    const params = new URLSearchParams();
    if (hiddenFields && typeof hiddenFields === "object") {
      for (const [k, v] of Object.entries(hiddenFields)) {
        params.append(k, String(v ?? ""));
      }
    }
    if (answers && typeof answers === "object") {
      for (const [k, v] of Object.entries(answers)) {
        if (Array.isArray(v)) {
          for (const item of v) params.append(k, String(item));
        } else if (v !== undefined && v !== null) {
          params.append(k, String(v));
        }
      }
    }

    if (action === "goto" && typeof targetPage === "number") {
      params.set("nextpage", String(targetPage));
      params.set("next", "1");
    } else if (action === "prev") {
      params.set("previous", "Page précédente");
    } else if (action === "finish") {
      params.set("next", "Terminer le test...");
    } else {
      params.set("next", "Page suivante");
    }

    let { html, finalUrl } = await postMoodleForm(processUrl, params, processUrl);

    // Si redirigé vers summary.php et l'utilisateur a cliqué "Terminer et envoyer"
    if (finalUrl.includes("mod/quiz/summary.php") && action === "finish") {
      const finishFormMatch = html.match(/<form[^>]+action=["']([^"']*processattempt\.php)["'][^>]*>([\s\S]*?)<\/form>/i);
      if (finishFormMatch) {
        const finParams = new URLSearchParams();
        const inputRegex = /<input[^>]+>/gi;
        let im: RegExpExecArray | null;
        while ((im = inputRegex.exec(finishFormMatch[2])) !== null) {
          const name = extractAttr(im[0], "name");
          const val = extractAttr(im[0], "value") ?? "";
          if (name) finParams.append(name, val);
        }
        finParams.set("finishattempt", "1");
        const finRes = await postMoodleForm(finishFormMatch[1].replace(/&amp;/g, "&"), finParams, finalUrl);
        html = finRes.html;
        finalUrl = finRes.finalUrl;
      }
    }

    if (finalUrl.includes("mod/quiz/review.php") || finalUrl.includes("mod/quiz/view.php")) {
      const mainMatch = html.match(/<section[^>]+id=["']region-main["'][^>]*>([\s\S]*?)<\/section>/i);
      const reviewHtml = sanitizeMoodleHtml(mainMatch ? mainMatch[1] : html, req.authToken);
      return res.json({ status: "finished", reviewHtml });
    }

    return res.json({
      status: "in_progress",
      ...parseQuizAttemptHtml(html, finalUrl, req.authToken),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Erreur lors de l'envoi des réponses" });
  }
});

// POST /api/moodle/quiz/ai-help
router.post("/quiz/ai-help", async (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const aiConfig = aiService.resolveConfigForRole(currentDb.getAIConfig(), "quiz_helper");
    const { questionText, choicesText } = req.body || {};
    if (!questionText) {
      return res.status(400).json({ error: "Texte de la question requis" });
    }
    const result = await aiService.answerQuizQuestionWithWebSearch(aiConfig, {
      questionText: String(questionText),
      choicesText: Array.isArray(choicesText) ? choicesText.map(String) : [],
    });
    res.json(result);
  } catch (error: any) {
    const formatted = aiService.formatFriendlyAIError(error);
    res.status(formatted.statusCode).json({ error: formatted.message, saturated: formatted.isSaturated });
  }
});

// POST /api/moodle/quiz/ai-help-batch
router.post("/quiz/ai-help-batch", async (req, res) => {
  try {
    const currentDb = req.userDb || db;
    const aiConfig = aiService.resolveConfigForRole(currentDb.getAIConfig(), "quiz_helper");
    const rawQuestions = Array.isArray(req.body?.questions) ? req.body.questions : [];
    if (rawQuestions.length === 0) {
      return res.json({ results: {}, provider: aiConfig.activeProvider, webSearchUsed: false });
    }
    const questions = rawQuestions.slice(0, 20).map((q: any) => ({
      id: String(q.id),
      questionText: String(q.questionText || ""),
      choicesText: Array.isArray(q.choicesText) ? q.choicesText.map(String) : [],
    }));
    const result = await aiService.answerQuizQuestionsBatchWithWebSearch(aiConfig, questions);
    res.json(result);
  } catch (error: any) {
    const formatted = aiService.formatFriendlyAIError(error);
    res.status(formatted.statusCode).json({ error: formatted.message, saturated: formatted.isSaturated });
  }
});

// GET /api/moodle/download?url=...
// Proxy authentifié pour télécharger ou prévisualiser (?inline=1) les fichiers Moodle en 1 clic
router.get("/download", async (req, res) => {
  const targetUrl = req.query.url as string;
  const inline = req.query.inline === "1" || req.query.inline === "true";
  const token = (req.query.token as string) || req.authToken;
  const retried = req.query.retried === "1";
  if (!targetUrl || !targetUrl.startsWith(ECAMPUS_BASE_URL + "/")) {
    return res.status(400).json({ error: "URL de téléchargement invalide" });
  }

  const extractMoodlePluginFileUrl = (html: string, baseUrl: string): string | null => {
    const decodeEntities = (s: string) =>
      s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'");
    const patterns = [
      /<div[^>]*class=["'][^"']*resourceworkaround[^"']*["'][^>]*>[\s\S]*?<a[^>]*href=["']([^"']*pluginfile\.php[^"']+)["']/i,
      /<(?:object|iframe|embed)[^>]*id=["']resourceobject["'][^>]*(?:data|src)=["']([^"']*pluginfile\.php[^"']+)["']/i,
      /<(?:object|iframe|embed)[^>]*(?:data|src)=["']([^"']*pluginfile\.php[^"']+)["']/i,
      /href=["'](https?:\/\/[^"']*ecampus\.unicaen\.fr\/pluginfile\.php\/\d+\/mod_resource\/[^"']+)["']/i,
      /["'](https?:\/\/[^"']*ecampus\.unicaen\.fr\/pluginfile\.php\/[^"']+)["']/i,
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m?.[1]) {
        try {
          return new URL(decodeEntities(m[1]), baseUrl).toString();
        } catch {
          // ignore malformed URL
        }
      }
    }
    return null;
  };

  const performProxy = (urlToFetch: string, hasRetried: boolean, depth = 0) => {
    if (depth > 6) {
      if (!res.headersSent) res.status(508).json({ error: "Trop de redirections Moodle" });
      return;
    }
    const cookieHeader = buildMoodleCookieHeader();
    const parsed = new URL(urlToFetch);
    const options = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Cookie": cookieHeader,
        "Referer": ECAMPUS_BASE_URL + "/my/",
      },
    };

    const proxyReq = https.request(options, async (proxyRes) => {
      if (proxyRes.statusCode && proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
        const redirectLocation = new URL(proxyRes.headers.location, urlToFetch).toString();
        proxyRes.resume();
        if (redirectLocation.includes("cas.unicaen.fr") || redirectLocation.includes("/login/index.php")) {
          if (!hasRetried) {
            try {
              await runMoodleScraper(true);
              return performProxy(urlToFetch, true, depth);
            } catch {
              if (!res.headersSent) return res.status(401).json({ error: "Session Moodle expirée" });
              return;
            }
          }
          if (!res.headersSent) return res.status(401).json({ error: "Session Moodle expirée" });
          return;
        }
        return performProxy(redirectLocation, hasRetried, depth + 1);
      }

      const contentType = String(proxyRes.headers["content-type"] || "").toLowerCase();
      if (contentType.includes("text/html")) {
        const chunks: Buffer[] = [];
        proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
        proxyRes.on("end", async () => {
          const html = Buffer.concat(chunks).toString("utf-8");

          // Détecter une page de connexion CAS/Moodle renvoyée en 200 OK
          if (
            !hasRetried &&
            (html.includes("cas.unicaen.fr/cas/login") ||
              (html.includes("login/index.php") && html.includes('name="username"')))
          ) {
            try {
              await runMoodleScraper(true);
              return performProxy(urlToFetch, true, depth);
            } catch {
              if (!res.headersSent) return res.status(401).json({ error: "Session Moodle expirée" });
              return;
            }
          }

          // Extraire le vrai lien pluginfile.php depuis les pages wrapper mod/resource/view.php
          const realFileUrl = extractMoodlePluginFileUrl(html, urlToFetch);
          if (realFileUrl && realFileUrl !== urlToFetch) {
            return performProxy(realFileUrl, hasRetried, depth + 1);
          }

          if (!res.headersSent) {
            res.status(proxyRes.statusCode || 200);
            res.setHeader("Content-Type", proxyRes.headers["content-type"] || "text/html; charset=utf-8");
            res.send(html);
          }
        });
        return;
      }

      res.status(proxyRes.statusCode || 200);
      for (const [key, val] of Object.entries(proxyRes.headers)) {
        if (!val || ["set-cookie", "content-security-policy", "x-frame-options"].includes(key.toLowerCase())) continue;
        if (key.toLowerCase() === "content-disposition" && typeof val === "string") {
          res.setHeader(
            key,
            inline
              ? val.replace(/^attachment/i, "inline")
              : val.replace(/^inline/i, "attachment")
          );
        } else {
          res.setHeader(key, val);
        }
      }
      if (!inline && !proxyRes.headers["content-disposition"]) {
        const inferredName = decodeURIComponent(parsed.pathname.split("/").pop() || "fichier");
        if (inferredName && inferredName.includes(".")) {
          res.setHeader("Content-Disposition", `attachment; filename="${inferredName.replace(/"/g, "")}"`);
        }
      }
      proxyRes.pipe(res);
    });

    proxyReq.on("error", (err) => {
      console.error("[-] Proxy error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Erreur lors du téléchargement du fichier Moodle" });
      }
    });

    proxyReq.end();
  };

  performProxy(targetUrl, retried, 0);
});

export default router;
