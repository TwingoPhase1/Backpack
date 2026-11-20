import { MoodleCourse } from "../../src/types/index.js";

/**
 * Génère une expression régulière tolérante pour matcher un code de ressource ou de SAÉ.
 * Supporte :
 * - R101, R1.01, R1-01, R 101, R.1.01, r101
 * - SAE12, SAE 1.2, SAE1.2, SAE-12, sae12
 * - Variantes avec ou sans zéro pour les numéros < 10 (ex: R1.1 vs R1.01)
 */
export function createResourceRegex(code: string): RegExp {
  const norm = code.toUpperCase().trim();

  // Motif Ressource : R suivi du semestre et du numéro
  const rMatch = norm.match(/^R([1-6])[.\s\-_]?0?(\d{1,2})$/i);
  if (rMatch) {
    const sem = rMatch[1];
    const num = parseInt(rMatch[2], 10);
    const numPadded = num < 10 ? "0" + num : "" + num;
    // Tolère R101, R1.01, R1-01, R 101, R.1.01, R1.1
    return new RegExp(
      `(^|[^a-zA-Z0-9])R[.\\s\\-_]?${sem}[.\\s\\-_]?(?:0?${num}|${numPadded})([^a-zA-Z0-9]|$)`,
      "i"
    );
  }

  // Motif SAÉ : SAE suivi du semestre et du numéro
  const saeMatch = norm.match(/^SAE([1-6])[.\s\-_]?0?(\d{1,2})$/i);
  if (saeMatch) {
    const sem = saeMatch[1];
    const num = parseInt(saeMatch[2], 10);
    const numPadded = num < 10 ? "0" + num : "" + num;
    return new RegExp(
      `(^|[^a-zA-Z0-9])SAE[.\\s\\-_]?${sem}[.\\s\\-_]?(?:0?${num}|${numPadded})([^a-zA-Z0-9]|$)`,
      "i"
    );
  }

  // Fallback littéral sécurisé
  const escaped = norm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-zA-Z0-9])${escaped}([^a-zA-Z0-9]|$)`, "i");
}

/**
 * Extrait et normalise le code ressource à partir du texte (titre de cours, sujet mail, etc.)
 */
export function extractResourceCode(text: string): string | null {
  if (!text) return null;

  // 1. Recherche pattern R[sem][num]
  const mR = text.match(/\b(?:R[.\s\-_]?([1-6])[.\s\-_]?(0?[1-9]|1[0-6]))\b/i);
  if (mR) {
    const sem = mR[1];
    const num = parseInt(mR[2], 10);
    return `R${sem}${num < 10 ? "0" + num : num}`;
  }

  // 2. Recherche pattern SAE[sem][num]
  const mSae = text.match(/\b(?:SAE[.\s\-_]?([1-6])[.\s\-_]?(0?[1-6]))\b/i);
  if (mSae) {
    const sem = mSae[1];
    const num = parseInt(mSae[2], 10);
    return `SAE${sem}${num}`;
  }

  // 3. Mots-clés sémantiques reconnus
  const lower = text.toLowerCase();
  if (lower.includes("portfolio")) return "SAE16";
  if (lower.includes("orientation") && lower.includes("insertion")) return "R112";

  return null;
}

/**
 * Vérifie si un cours Moodle correspond à un code de ressource.
 */
export function matchResourceToCourse(
  resourceCode: string,
  course: MoodleCourse,
  resourceName?: string
): boolean {
  if (!resourceCode || !course) return false;

  const targetCode = resourceCode.toUpperCase().trim();

  // 1. Correspondance directe si resourceCode déjà extrait
  if (course.resourceCode && course.resourceCode.toUpperCase() === targetCode) {
    return true;
  }

  // 2. Correspondance par Regex sur fullname et shortname
  const regex = createResourceRegex(targetCode);
  if (regex.test(course.fullname) || regex.test(course.shortname)) {
    return true;
  }

  // 3. Correspondance sur resourceCode du cours via la regex
  if (course.resourceCode && regex.test(course.resourceCode)) {
    return true;
  }

  // 4. Mappage sémantique pour cours spéciaux
  if (targetCode === "R112" || targetCode === "R212") {
    const lower = `${course.fullname} ${course.shortname}`.toLowerCase();
    if (lower.includes("orientation") && lower.includes("insertion")) {
      return true;
    }
  }

  if (targetCode === "SAE16" || targetCode === "SAE25") {
    const lower = `${course.fullname} ${course.shortname}`.toLowerCase();
    if (lower.includes("portfolio")) {
      return true;
    }
  }

  // 5. Correspondance par nom de ressource (si le code RXXX n'apparaît pas dans le titre Moodle)
  if (resourceName) {
    const norm = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ");
    const resWords = norm(resourceName)
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !["dans", "pour", "avec", "initiation", "bases"].includes(w));
    const courseText = norm(`${course.fullname} ${course.shortname}`);
    if (resWords.length >= 2) {
      const hits = resWords.filter((w) => courseText.includes(w));
      if (hits.length >= 2) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Récupère tous les cours Moodle correspondant à une ressource via le moteur Regex.
 */
export function findMoodleCoursesForResource(
  resourceCode: string,
  courses: MoodleCourse[],
  resourceName?: string
): MoodleCourse[] {
  return courses.filter((c) => matchResourceToCourse(resourceCode, c, resourceName));
}

/**
 * Récupère le cours Moodle le plus pertinent pour une ressource.
 */
export function findBestMoodleCourseForResource(
  resourceCode: string,
  courses: MoodleCourse[],
  resourceName?: string
): MoodleCourse | undefined {
  const matches = findMoodleCoursesForResource(resourceCode, courses, resourceName);
  if (matches.length === 0) return undefined;

  const targetCode = resourceCode.toUpperCase().trim();

  // Préfère celui dont le resourceCode est exactement égal
  const exact = matches.find((c) => c.resourceCode?.toUpperCase() === targetCode);
  if (exact) return exact;

  // Préfère celui qui a le plus de documents/fichiers
  return matches.sort((a, b) => {
    const countA = a.sections.reduce((acc, s) => acc + s.modules.reduce((mAcc, m) => mAcc + m.files.length, 0), 0);
    const countB = b.sections.reduce((acc, s) => acc + s.modules.reduce((mAcc, m) => mAcc + m.files.length, 0), 0);
    return countB - countA;
  })[0];
}
