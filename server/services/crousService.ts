import https from "https";
import { CROUS_MENU_URL } from "../config.js";
import { CrousMenuResponse, CrousDailyMenu, CrousMeal, CrousDishCategory, CrousRestaurantInfos } from "../../src/types/index.js";

// Cache mémoire avec TTL de 30 minutes
let cachedResponse: CrousMenuResponse | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 30 * 60 * 1000;

function fetchHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
    };

    const req = https.request(options, (res) => {
      // Redirections HTTP
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchHtml(res.headers.location).then(resolve).catch(reject);
      }

      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    });

    req.on("error", reject);
    req.setTimeout(10000, () => {
      req.destroy(new Error("Timeout lors de la récupération du menu CROUS"));
    });
    req.end();
  });
}

export function parseCrousHtml(html: string, sourceUrl: string): CrousMenuResponse {
  // Nom du restaurant
  let restaurantName = "Restaurant Universitaire IFS (Campus 3)";
  const hTitleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title>([\s\S]*?)<\/title>/i);
  if (hTitleMatch) {
    const raw = hTitleMatch[1].replace(/<[^>]+>/g, "").replace(/\s*-\s*Crous.*$/i, "").trim();
    if (raw) restaurantName = raw;
  }

  // Menus par jour
  const menus: CrousDailyMenu[] = [];
  const menuBlocks = [...html.matchAll(/<div class="menu">([\s\S]*?)(?:<div class="menu">|<\/section>)/gi)];

  for (const block of menuBlocks) {
    const b = block[1];
    const dateMatch = b.match(/<time class="menu_date_title">([\s\S]*?)<\/time>/i);
    const dateText = dateMatch ? dateMatch[1].replace(/^Menu\s+du\s+/i, "").trim() : "Aujourd'hui";

    const meals: CrousMeal[] = [];
    const mealBlocks = [...b.matchAll(/<div class="meal">([\s\S]*?)(?:<div class="meal">|$)/gi)];

    for (const mb of mealBlocks) {
      const mHtml = mb[1];
      const titleMatch = mHtml.match(/<div class="meal_title">([\s\S]*?)<\/div>/i);
      const mealTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "Déjeuner";

      const categories: CrousDishCategory[] = [];
      const foodiesMatch = mHtml.match(/<ul class="meal_foodies">([\s\S]*?)<\/ul>/i);

      if (foodiesMatch) {
        const fHtml = foodiesMatch[1];
        const headerMatch = fHtml.match(/<li[^>]*>\s*([^<]+)\s*<ul>/i);
        const categoryName = headerMatch ? headerMatch[1].trim() : "Propositions du jour";

        const allLis = [...fHtml.matchAll(/<li[^>]*>([\s\S]*?)(?:<\/li>|$)/gi)];
        const dishes: string[] = [];

        for (const li of allLis) {
          let text = li[1];
          if (text.includes("<ul")) {
            text = text.substring(text.indexOf("<ul"));
          }
          text = text.replace(/<[^>]+>/g, "").trim();
          if (categoryName && text.startsWith(categoryName)) {
            text = text.substring(categoryName.length).trim();
          }
          if (text && text.length > 2 && text !== categoryName) {
            dishes.push(text);
          }
        }

        if (dishes.length > 0) {
          categories.push({
            name: categoryName,
            dishes,
          });
        }
      }

      meals.push({
        title: mealTitle,
        categories,
      });
    }

    menus.push({
      date: dateText,
      meals,
    });
  }

  // Infos pratiques
  const infos: CrousRestaurantInfos = {
    horaires: "Du lundi au vendredi de 11h45 à 13h30",
    adresse: "3 boulevard Yitzhak Rabin - 14123 IFS (Campus 3)",
    telephone: "02 31 52 55 81",
    paiement: "Carte bancaire, IZLY",
    pratique: "Accès handicapé, Accès wifi",
  };

  const infoMatches = [
    ...html.matchAll(
      /<div class="info">[\s\S]*?<div class="info_title">(?:<svg[\s\S]*?<\/svg>)?([\s\S]*?)<\/div>[\s\S]*?<p>([\s\S]*?)<\/p>/gi
    ),
  ];

  for (const m of infoMatches) {
    const title = m[1].replace(/<[^>]+>/g, "").trim().toLowerCase();
    const val = m[2].replace(/<br\s*\/?>/gi, ", ").replace(/<[^>]+>/g, "").trim().replace(/,\s*$/, "");

    if (title.includes("horaire")) infos.horaires = val;
    else if (title.includes("adresse")) infos.adresse = val;
    else if (title.includes("phone") || title.includes("téléphone") || title.includes("telephone")) infos.telephone = val;
    else if (title.includes("paiement")) infos.paiement = val;
    else if (title.includes("pratique")) infos.pratique = val;
  }

  const todayMenu = menus.length > 0 ? menus[0] : null;

  return {
    success: true,
    restaurantName,
    sourceUrl,
    menus,
    todayMenu,
    infos,
    lastFetched: new Date().toISOString(),
  };
}

export class CrousService {
  /**
   * Récupère le menu du CROUS en direct ou depuis le cache
   */
  public async getMenu(forceRefresh = false): Promise<CrousMenuResponse> {
    const now = Date.now();
    if (!forceRefresh && cachedResponse && now - lastCacheTime < CACHE_TTL_MS) {
      return { ...cachedResponse, cached: true };
    }

    try {
      const url = CROUS_MENU_URL;
      const html = await fetchHtml(url);
      const parsed = parseCrousHtml(html, url);

      cachedResponse = parsed;
      lastCacheTime = now;
      return parsed;
    } catch (err: any) {
      console.error("[-] Erreur lors de la récupération du menu CROUS :", err.message);

      // Si cache existant, le renvoyer même expiré
      if (cachedResponse) {
        return {
          ...cachedResponse,
          cached: true,
          error: `Données en cache (erreur mise à jour : ${err.message})`,
        };
      }

      // Fallback gracieux si aucune donnée en cache
      return {
        success: false,
        restaurantName: "Restaurant Universitaire IFS",
        sourceUrl: CROUS_MENU_URL,
        menus: [],
        todayMenu: null,
        infos: {
          horaires: "Du lundi au vendredi de 11h45 à 13h30",
          adresse: "3 boulevard Yitzhak Rabin - 14123 IFS (Campus 3)",
          telephone: "02 31 52 55 81",
          paiement: "Carte bancaire, IZLY",
          pratique: "Accès handicapé, Accès wifi",
        },
        lastFetched: new Date().toISOString(),
        error: `Impossible de contacter le CROUS Normandie (${err.message}). Vérifiez votre connexion Internet.`,
      };
    }
  }
}

export const crousService = new CrousService();
