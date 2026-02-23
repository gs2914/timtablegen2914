/**
 * Faculty-to-Section Pre-Assignment Engine
 *
 * Handles automatic, immutable faculty-section mapping before GA scheduling.
 * Supports 3 scenarios:
 *   Scenario 1: 2 faculty – 4 sections → 2 each
 *   Scenario 2: 4 faculty – 4 sections → 1 each
 *   Scenario 3: 3 faculty – 4 sections → 1+1+2 (lowest-load gets 2)
 *
 * Generalises gracefully to other ratios.
 */

import { Subject, Section, ClassSession } from '@/types/timetable';

/** One mapping entry: "faculty F teaches subject S for section SEC" */
export interface FacultySectionMapping {
  subjectCode: string;
  sectionId: string;
  facultyId: string;
  yearNumber: number;
}

/** Shuffle an array in-place (Fisher-Yates) and return it */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Compute the total weekly teaching load per faculty across ALL subjects
 * that have already been mapped. Used to decide who gets the extra section
 * in Scenario 3.
 */
function computeGlobalLoad(
  mappings: FacultySectionMapping[],
  subjects: Subject[],
): Map<string, number> {
  const subjectMap = new Map(subjects.map(s => [s.code, s]));
  const load = new Map<string, number>();
  for (const m of mappings) {
    const sub = subjectMap.get(m.subjectCode);
    const hours = sub ? sub.weeklyHours : 1;
    load.set(m.facultyId, (load.get(m.facultyId) || 0) + hours);
  }
  return load;
}

/**
 * Build all faculty-section mappings for every multi-faculty subject.
 *
 * Single-faculty subjects (eligibleFacultyIds.length <= 1) are skipped —
 * they are trivially assigned in the GA.
 */
export function buildFacultySectionMappings(
  subjects: Subject[],
  sections: Section[],
): FacultySectionMapping[] {
  const mappings: FacultySectionMapping[] = [];

  // Process subjects sorted by fewer eligible faculty first so their load
  // counts can feed into later decisions (Scenario 3).
  const multiFacultySubjects = subjects
    .filter(s => s.eligibleFacultyIds.length > 1)
    .sort((a, b) => a.eligibleFacultyIds.length - b.eligibleFacultyIds.length);

  for (const subject of multiFacultySubjects) {
    const yearSections = sections.filter(s => s.yearNumber === subject.yearNumber);
    if (yearSections.length === 0) continue;

    const numFaculty = subject.eligibleFacultyIds.length;
    const numSections = yearSections.length;

    // Shuffle both lists for randomness
    const shuffledFaculty = shuffle([...subject.eligibleFacultyIds]);
    const shuffledSections = shuffle([...yearSections]);

    if (numFaculty >= numSections) {
      // Scenario 2 (or more faculty than sections): 1-to-1 assignment
      for (let i = 0; i < numSections; i++) {
        mappings.push({
          subjectCode: subject.code,
          sectionId: shuffledSections[i].id,
          facultyId: shuffledFaculty[i % numFaculty],
          yearNumber: subject.yearNumber,
        });
      }
    } else {
      // numFaculty < numSections
      // Compute how many sections each faculty gets
      const base = Math.floor(numSections / numFaculty);
      const extra = numSections % numFaculty;

      // Decide who gets extra sections — pick faculty with lowest global load
      const globalLoad = computeGlobalLoad(mappings, subjects);
      const facultySorted = [...shuffledFaculty].sort((a, b) => {
        return (globalLoad.get(a) || 0) - (globalLoad.get(b) || 0);
      });

      // First `extra` faculty get (base+1) sections, rest get `base`
      let sectionIdx = 0;
      for (let f = 0; f < numFaculty; f++) {
        const count = f < extra ? base + 1 : base;
        for (let c = 0; c < count && sectionIdx < numSections; c++) {
          mappings.push({
            subjectCode: subject.code,
            sectionId: shuffledSections[sectionIdx].id,
            facultyId: facultySorted[f],
            yearNumber: subject.yearNumber,
          });
          sectionIdx++;
        }
      }
    }
  }

  return mappings;
}

/**
 * Look up the pre-assigned faculty for a given subject+section.
 * Returns undefined for subjects without pre-assignment (single-faculty).
 */
export function getAssignedFaculty(
  mappings: FacultySectionMapping[],
  subjectCode: string,
  sectionId: string,
): string | undefined {
  return mappings.find(
    m => m.subjectCode === subjectCode && m.sectionId === sectionId,
  )?.facultyId;
}
