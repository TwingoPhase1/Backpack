import path from "path";
import { NextcloudItem, NextcloudStatus } from "../../src/types/index.js";
import { NEXTCLOUD_WEBDAV_URL } from "../config.js";

const NEXTCLOUD_WEBDAV_BASE = NEXTCLOUD_WEBDAV_URL;

function getCredentials(creds?: { username?: string; password?: string }): { user: string; pass: string } {
  if (creds?.username && creds?.password) {
    return { user: creds.username, pass: creds.password };
  }

  throw new Error("Identifiants ENT manquants. Veuillez vous reconnecter.");
}

function getAuthHeader(creds?: { username?: string; password?: string }): string {
  const { user, pass } = getCredentials(creds);
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

function extractResourceCode(name: string): string | undefined {
  const m = name.match(/\b(R\d{3}|SAE\d{2}|SAÉ\d{2})\b/i);
  if (m) {
    return m[1].toUpperCase().replace("É", "E");
  }
  return undefined;
}

// In-memory cache for folder listings (TTL = 2 minutes)
interface CacheEntry {
  items: NextcloudItem[];
  timestamp: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 2 * 60 * 1000;

export class NextcloudService {
  /**
   * Vérifie le statut de la connexion et le quota de stockage UniCloud
   */
  async getStatus(creds?: { username?: string; password?: string }): Promise<NextcloudStatus> {
    try {
      const { user } = getCredentials(creds);
      const auth = getAuthHeader(creds);

      const res = await fetch(`${NEXTCLOUD_WEBDAV_BASE}/`, {
        method: "PROPFIND",
        headers: {
          Authorization: auth,
          Depth: "0",
        },
      });

      if (!res.ok) {
        return {
          connected: false,
          user,
          lastError: `Erreur HTTP ${res.status}: ${res.statusText}`,
        };
      }

      const xml = await res.text();
      let quotaUsed: number | undefined;
      let quotaAvailable: number | undefined;

      const mUsed = xml.match(/<d:quota-used-bytes>(\d+)<\/d:quota-used-bytes>/);
      if (mUsed) quotaUsed = parseInt(mUsed[1], 10);

      const mAvail = xml.match(/<d:quota-available-bytes>(\d+)<\/d:quota-available-bytes>/);
      if (mAvail) quotaAvailable = parseInt(mAvail[1], 10);

      return {
        connected: true,
        user,
        quotaUsed,
        quotaAvailable,
        lastError: null,
      };
    } catch (e: any) {
      return {
        connected: false,
        user: "",
        lastError: e.message || "Erreur de connexion à UniCloud",
      };
    }
  }

  /**
   * Liste les fichiers et dossiers d'un répertoire avec cache anti-spam
   */
  async listFiles(remotePath: string = "/", forceRefresh = false, creds?: { username?: string; password?: string }): Promise<NextcloudItem[]> {
    const cleanPath = "/" + remotePath.replace(/^\/+|\/+$/g, "");
    const webdavSubPath = cleanPath === "/" ? "/" : cleanPath + "/";
    const userPrefix = creds?.username || "default";
    const cacheKey = `${userPrefix}:${webdavSubPath}`;

    if (!forceRefresh && cache.has(cacheKey)) {
      const entry = cache.get(cacheKey)!;
      if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
        return entry.items;
      }
    }

    const auth = getAuthHeader(creds);
    const targetUrl = `${NEXTCLOUD_WEBDAV_BASE}${encodeURI(webdavSubPath)}`;

    const res = await fetch(targetUrl, {
      method: "PROPFIND",
      headers: {
        Authorization: auth,
        Depth: "1",
      },
    });

    if (!res.ok) {
      throw new Error(`Erreur HTTP WebDAV ${res.status}: ${res.statusText}`);
    }

    const xml = await res.text();
    const items: NextcloudItem[] = [];

    // Découpage par réponse XML
    const responses = xml.split(/<d:response[^>]*>/i).slice(1);

    for (const r of responses) {
      const mHref = r.match(/<d:href>([^<]+)<\/d:href>/i);
      if (!mHref) continue;

      const rawHref = mHref[1];
      const decodedHref = decodeURIComponent(rawHref);

      // On ignore le dossier parent lui-même
      const targetCleanHref = `/remote.php/webdav${webdavSubPath}`;
      if (
        decodedHref === targetCleanHref ||
        decodedHref === targetCleanHref.replace(/\/$/, "") ||
        decodedHref + "/" === targetCleanHref
      ) {
        continue;
      }

      const isDir = /<d:resourcetype>[^<]*<d:collection\/>/i.test(r);
      const mLen = r.match(/<d:getcontentlength>(\d+)<\/d:getcontentlength>/i);
      const size = mLen ? parseInt(mLen[1], 10) : 0;

      const mMod = r.match(/<d:getlastmodified>([^<]+)<\/d:getlastmodified>/i);
      const lastModified = mMod ? mMod[1] : undefined;

      const mType = r.match(/<d:getcontenttype>([^<]+)<\/d:getcontenttype>/i);
      const contentType = isDir ? "folder" : mType ? mType[1] : "application/octet-stream";

      // Nom d'affichage
      const mName = r.match(/<d:displayname>([^<]+)<\/d:displayname>/i);
      let name = "";
      if (mName && mName[1]) {
        name = mName[1];
      } else {
        const segments = decodedHref.replace(/\/+$/, "").split("/");
        name = segments[segments.length - 1] || "";
      }

      // Chemin relatif WebDAV (ex: /COURS_2026-2027/fichier.pdf)
      const relPath = decodedHref.replace(/^\/remote\.php\/webdav/, "");

      const item: NextcloudItem = {
        name,
        path: relPath,
        isDir,
        size,
        contentType,
        lastModified,
        resourceCode: extractResourceCode(name) || extractResourceCode(cleanPath),
      };

      items.push(item);
    }

    // Tri : dossiers en premier par nom, puis fichiers par nom
    items.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
    });

    cache.set(cacheKey, { items, timestamp: Date.now() });
    return items;
  }

  /**
   * Télécharge un fichier distant sous forme de buffer ou stream
   */
  async getFileBuffer(remotePath: string, creds?: { username?: string; password?: string }): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const auth = getAuthHeader(creds);
    const cleanPath = "/" + remotePath.replace(/^\/+/, "");
    const targetUrl = `${NEXTCLOUD_WEBDAV_BASE}${encodeURI(cleanPath)}`;

    const res = await fetch(targetUrl, {
      method: "GET",
      headers: { Authorization: auth },
    });

    if (!res.ok) {
      throw new Error(`Erreur téléchargement UniCloud HTTP ${res.status}: ${res.statusText}`);
    }

    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const segments = cleanPath.split("/");
    const filename = segments[segments.length - 1] || "document";

    return { buffer, contentType, filename };
  }

  /**
   * Lit le contenu texte d'un fichier distant (ex: Markdown, code)
   */
  async getFileText(remotePath: string, creds?: { username?: string; password?: string }): Promise<string> {
    const { buffer } = await this.getFileBuffer(remotePath, creds);
    return buffer.toString("utf-8");
  }

  /**
   * Envoie un fichier vers le Nextcloud UniCloud
   */
  async uploadFile(remotePath: string, content: Buffer | string, contentType = "application/octet-stream", creds?: { username?: string; password?: string }): Promise<void> {
    const auth = getAuthHeader(creds);
    const cleanPath = "/" + remotePath.replace(/^\/+/, "");
    const targetUrl = `${NEXTCLOUD_WEBDAV_BASE}${encodeURI(cleanPath)}`;

    const body = typeof content === "string" ? Buffer.from(content, "utf-8") : content;

    const res = await fetch(targetUrl, {
      method: "PUT",
      headers: {
        Authorization: auth,
        "Content-Type": contentType,
      },
      body,
    });

    if (!res.ok && res.status !== 201 && res.status !== 204) {
      throw new Error(`Erreur envoi UniCloud HTTP ${res.status}: ${res.statusText}`);
    }

    // Invalidation du cache du dossier parent
    const parentDir = path.posix.dirname(cleanPath);
    const userPrefix = creds?.username || "default";
    cache.delete(`${userPrefix}:${parentDir === "/" ? "/" : parentDir + "/"}`);
  }

  /**
   * Crée récursivement l'arborescence de dossiers sur Nextcloud UniCloud (MKCOL)
   */
  async ensureDirectory(remoteDir: string, creds?: { username?: string; password?: string }): Promise<void> {
    const auth = getAuthHeader(creds);
    const segments = remoteDir.split("/").filter(Boolean);
    let currentPath = "";

    for (const seg of segments) {
      currentPath += "/" + seg;
      const targetUrl = `${NEXTCLOUD_WEBDAV_BASE}${encodeURI(currentPath)}`;
      const res = await fetch(targetUrl, {
        method: "MKCOL",
        headers: { Authorization: auth },
      });

      // 201 = créé, 405 = existe déjà, 301/409 tolérés uniquement si déjà présent
      if (!res.ok && res.status !== 201 && res.status !== 405) {
        throw new Error(`Erreur création dossier UniCloud (${currentPath}) HTTP ${res.status}`);
      }
    }
  }

  /**
   * Supprime un fichier distant sur Nextcloud UniCloud
   */
  async deleteFile(remotePath: string, creds?: { username?: string; password?: string }): Promise<void> {
    const auth = getAuthHeader(creds);
    const cleanPath = "/" + remotePath.replace(/^\/+/, "");
    const targetUrl = `${NEXTCLOUD_WEBDAV_BASE}${encodeURI(cleanPath)}`;
    const res = await fetch(targetUrl, {
      method: "DELETE",
      headers: { Authorization: auth },
    });
    if (!res.ok && res.status !== 204 && res.status !== 404) {
      throw new Error(`Erreur suppression UniCloud HTTP ${res.status}`);
    }
  }

  /**
   * Construit le chemin standardisé : /cours/Xer_annee/semestre_X/RXXX/<type>/<titre>.<ext>
   */
  buildCourseRemotePath(options: {
    semester?: number;
    resourceCode?: string;
    category: "CM" | "TD" | "TP" | "DIAPO";
    title: string;
    chapterNumber?: number;
    extension: "md" | "json";
  }): string {
    const sem = options.semester && options.semester > 0 ? options.semester : 1;
    const yearNum = Math.max(1, Math.ceil(sem / 2));
    const yearFolder = yearNum === 1 ? "1ere_annee" : `${yearNum}eme_annee`;
    const semFolder = `semestre_${sem}`;
    const resFolder = (options.resourceCode || "General").replace(/[^a-zA-Z0-9_-]/g, "") || "General";

    let subFolder: string = options.category;
    if (options.category === "DIAPO") {
      subFolder = "Diapos";
    } else if (options.category === "TP") {
      const tpMatch = options.title.match(/\btp\s*0?(\d+)\b/i);
      const tpNum = options.chapterNumber || (tpMatch ? Number(tpMatch[1]) : undefined);
      subFolder = tpNum ? `tp${String(tpNum).padStart(2, "0")}` : "TP";
    }

    const safeTitle =
      options.title
        .trim()
        .replace(/[\/\\:*?"<>|]/g, "")
        .replace(/\s+/g, "_")
        .slice(0, 80) || "document";

    return `/cours/${yearFolder}/${semFolder}/${resFolder}/${subFolder}/${safeTitle}.${options.extension}`;
  }

  /**
   * Crée les dossiers nécessaires et sauvegarde un document de cours sur UniCloud
   */
  async syncCourseDocumentToNextcloud(
    remotePath: string,
    content: Buffer | string,
    contentType: string,
    creds?: { username?: string; password?: string }
  ): Promise<boolean> {
    if (!creds?.username || !creds?.password) {
      if (!process.env.ENT_USER || !process.env.ENT_PASS) {
        return false;
      }
    }
    const parentDir = path.posix.dirname(remotePath);
    await this.ensureDirectory(parentDir, creds);
    await this.uploadFile(remotePath, content, contentType, creds);
    return true;
  }

  /**
   * Recherche les fichiers associés à un code ressource dans le cache ou à la racine
   */
  async getFilesForResource(resourceCode: string, creds?: { username?: string; password?: string }): Promise<NextcloudItem[]> {
    const normalized = resourceCode.toUpperCase().replace("É", "E");
    const matched: NextcloudItem[] = [];

    // Explorer la racine et les dossiers principaux connus
    const rootItems = await this.listFiles("/", false, creds);
    for (const it of rootItems) {
      if (it.resourceCode === normalized || it.name.toUpperCase().includes(normalized)) {
        matched.push(it);
      }
      // Si c'est un dossier de la matière (ex: SAE24), lister ses sous-fichiers
      if (it.isDir && (it.name.toUpperCase().includes(normalized) || it.resourceCode === normalized)) {
        try {
          const subItems = await this.listFiles(it.path, false, creds);
          matched.push(...subItems);
        } catch {}
      }
    }

    return matched;
  }
}

export const nextcloudService = new NextcloudService();
