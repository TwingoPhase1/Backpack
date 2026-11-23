import { Resource } from "../types";

function normalizeResourceCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function findMatchingResource(
  summary: string,
  matchedCode: string | undefined,
  resources: Resource[]
): Resource | undefined {
  if (!resources || resources.length === 0) return undefined;

  const candidates: string[] = [];
  if (matchedCode) candidates.push(normalizeResourceCode(matchedCode));

  const m = summary.match(/\b(R\d\.?\d{2}|SAE\s?\d\.?\d{1,2})\b/i);
  if (m) candidates.push(normalizeResourceCode(m[1]));

  for (const cand of candidates) {
    const exact = resources.find((r) => normalizeResourceCode(r.code) === cand);
    if (exact) return exact;
    // Gérer SAE1.01 <-> SAE11 si besoin
    const saeMatch = cand.match(/^SAE(\d)0?(\d)$/);
    if (saeMatch) {
      const alt = `SAE${saeMatch[1]}${saeMatch[2]}`;
      const altZero = `SAE${saeMatch[1]}0${saeMatch[2]}`;
      const found = resources.find((r) => {
        const rc = normalizeResourceCode(r.code);
        return rc === alt || rc === altZero;
      });
      if (found) return found;
    }
  }

  return undefined;
}

export function formatCourseTitle(
  summary: string,
  matchedCode: string | undefined,
  resources: Resource[],
  options: { includeCode?: boolean } = {}
): string {
  const res = findMatchingResource(summary, matchedCode, resources);
  if (!res) return summary;

  const subjectName = res.name || res.shortName;
  if (!subjectName) return summary;

  // Si le titre contient déjà le nom de la matière, ne pas le dupliquer
  if (summary.toLowerCase().includes(subjectName.toLowerCase())) {
    return summary;
  }

  // Extraire le type / groupe après le code (ex: "R1.15 - TD INI 2" -> "TD INI 2")
  const suffix = summary
    .replace(/^\s*(?:R\d\.?\d{2}|SAE\s?\d\.?\d{1,2})\s*(?:[-–—:|]\s*)?/i, "")
    .trim();

  const base = options.includeCode ? `${subjectName} (${res.code})` : subjectName;
  return suffix ? `${base} — ${suffix}` : base;
}
