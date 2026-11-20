import { MoodleSection } from "../types";

export interface GroupedMoodleSection {
  section: MoodleSection;
  subsections: MoodleSection[];
  totalModules: number;
}

/**
 * Regroupe les sous-sections Moodle (mod_subsection / sec-id-* / sec-N avec N > 15 après une tuile)
 * sous leur tuile parente afin de ne pas encombrer la barre de navigation.
 */
export function groupMoodleSections(sections: MoodleSection[]): GroupedMoodleSection[] {
  const groups: GroupedMoodleSection[] = [];

  const isSubsection = (sec: MoodleSection): boolean => {
    if (sec.id.startsWith("sec-sub-") || sec.id.startsWith("sec-id-")) return true;
    const m = sec.id.match(/^sec-(\d+)$/);
    if (m) {
      const num = Number(m[1]);
      // Les tuiles principales sont numérotées 0..15 ; les mod_subsection Moodle ont des IDs >= 20
      if (num > 15 && groups.some((g) => g.section.id !== "sec-0")) {
        return true;
      }
    }
    return false;
  };

  for (const sec of sections) {
    if (isSubsection(sec) && groups.length > 0) {
      const parent = groups[groups.length - 1];
      parent.subsections.push(sec);
      parent.totalModules += sec.modules.length;
    } else {
      groups.push({
        section: sec,
        subsections: [],
        totalModules: sec.modules.length,
      });
    }
  }

  return groups;
}
