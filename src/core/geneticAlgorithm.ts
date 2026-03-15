import {
  ClassSession,
  Subject,
  Section,
  FixedClass,
  CareerPathClass,
  Day,
  SubjectType,
  FacultySectionMapping,
  LabRoom,
  LabRoomMapping,
} from '@/types/timetable';
import { ConstraintEngine } from './constraintEngine';
import { TimeSlotManager, DAYS } from './timeSlotManager';
import { getAssignedFaculty } from './facultySectionAssigner';

interface GAConfig {
  populationSize: number;
  maxGenerations: number;
  mutationRate: number;
  eliteCount: number;
}

const DEFAULT_CONFIG: GAConfig = {
  populationSize: 60,
  maxGenerations: 500,
  mutationRate: 0.2,
  eliteCount: 5,
};

type Chromosome = ClassSession[];

export interface GAResult {
  timetable: ClassSession[];
  fitness: number;
  generation: number;
  converged: boolean;
}

const MORNING_SLOTS = [0, 1];

/** Seeded PRNG (mulberry32) for deterministic output */
function createSeededRandom(seed: number): () => number {
  let t = seed | 0;
  return () => {
    t = (t + 0x6D2B79F5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic shuffle using seeded random */
function seededShuffle<T>(arr: T[], rand: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export class GeneticAlgorithm {
  private config: GAConfig;
  private constraintEngine: ConstraintEngine;
  private timeSlotManager: TimeSlotManager;
  private subjects: Subject[];
  private sections: Section[];
  private fixedClasses: FixedClass[];
  private careerPathClasses: CareerPathClass[];
  private facultyMappings: FacultySectionMapping[];
  private labRooms: LabRoom[];
  private labRoomMappings: LabRoomMapping[];
  private subjectMap: Map<string, Subject>;
  private rand: () => number;

  constructor(
    constraintEngine: ConstraintEngine,
    timeSlotManager: TimeSlotManager,
    subjects: Subject[],
    sections: Section[],
    fixedClasses: FixedClass[],
    careerPathClasses: CareerPathClass[],
    facultyMappings: FacultySectionMapping[],
    labRooms: LabRoom[] = [],
    labRoomMappings: LabRoomMapping[] = [],
    config?: Partial<GAConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.constraintEngine = constraintEngine;
    this.timeSlotManager = timeSlotManager;
    this.subjects = subjects;
    this.sections = sections;
    this.fixedClasses = fixedClasses;
    this.careerPathClasses = careerPathClasses;
    this.facultyMappings = facultyMappings;
    this.labRooms = labRooms;
    this.labRoomMappings = labRoomMappings;
    this.subjectMap = new Map(subjects.map(s => [s.code, s]));
    // Fixed seed for deterministic output
    this.rand = createSeededRandom(42);
  }

  run(onProgress?: (gen: number, bestFitness: number) => void): GAResult {
    let population = this.initializePopulation();
    let bestChromosome = population[0];
    let bestFitness = Infinity;
    let bestGeneration = 0;

    for (let gen = 0; gen < this.config.maxGenerations; gen++) {
      const fitnesses = population.map((c) =>
        this.constraintEngine.calculateFitness(c)
      );

      for (let i = 0; i < fitnesses.length; i++) {
        if (fitnesses[i] < bestFitness) {
          bestFitness = fitnesses[i];
          bestChromosome = population[i].map((s) => ({ ...s }));
          bestGeneration = gen;
        }
      }

      if (onProgress) onProgress(gen, bestFitness);

      if (bestFitness <= 1) {
        const finalTimetable = this.ensureLabContinuity(bestChromosome);
        const finalFitness = this.constraintEngine.calculateFitness(finalTimetable);
        return {
          timetable: finalTimetable,
          fitness: finalFitness,
          generation: gen,
          converged: finalFitness <= 1,
        };
      }

      const newPopulation: Chromosome[] = [];
      const sorted = population
        .map((c, i) => ({ chromosome: c, fitness: fitnesses[i] }))
        .sort((a, b) => a.fitness - b.fitness);

      for (let i = 0; i < this.config.eliteCount && i < sorted.length; i++) {
        newPopulation.push(sorted[i].chromosome.map((s) => ({ ...s })));
      }

      while (newPopulation.length < this.config.populationSize) {
        const parent1 = this.tournamentSelect(population, fitnesses);
        const parent2 = this.tournamentSelect(population, fitnesses);
        let child = this.crossover(parent1, parent2);
        if (this.rand() < this.config.mutationRate) {
          child = this.mutate(child);
        }
        child = this.repair(child);
        newPopulation.push(child);
      }

      population = newPopulation;
    }

    const finalTimetable = this.ensureLabContinuity(bestChromosome);
    const finalFitness = this.constraintEngine.calculateFitness(finalTimetable);

    return {
      timetable: finalTimetable,
      fitness: finalFitness,
      generation: bestGeneration,
      converged: finalFitness <= 1,
    };
  }

  private initializePopulation(): Chromosome[] {
    const population: Chromosome[] = [];
    for (let i = 0; i < this.config.populationSize; i++) {
      population.push(this.generateRandomChromosome());
    }
    return population;
  }

  /** Get the lab room ID for a subject+section from mappings */
  private getLabRoomForSession(subjectCode: string, sectionId: string): string | undefined {
    return this.labRoomMappings.find(
      m => m.subjectCode === subjectCode && m.sectionId === sectionId
    )?.labRoomId;
  }

  /** Check if a lab room is free at a given day+slot across all sessions */
  private isLabRoomFree(sessions: ClassSession[], labRoomId: string, day: Day, slot: number): boolean {
    return !sessions.some(s => s.labRoomId === labRoomId && s.day === day && s.slotIndex === slot);
  }

  /** Check if a faculty has a back-to-back THEORY class (lab blocks are allowed) */
  private isFacultyBackToBack(sessions: ClassSession[], facultyId: string, day: Day, slot: number, currentSubjectCode?: string, currentSectionId?: string): boolean {
    return sessions.some(s => {
      if (s.facultyId !== facultyId || s.day !== day) return false;
      if (!this.timeSlotManager.areSlotsConsecutive(s.slotIndex, slot)) return false;

      // If both are part of the same lab/integrated subject for the same section, allow it
      if (currentSubjectCode && currentSectionId) {
        const existingSubj = this.subjectMap.get(s.subjectCode);
        const currentSubj = this.subjectMap.get(currentSubjectCode);
        if (existingSubj && currentSubj
            && s.subjectCode === currentSubjectCode && s.sectionId === currentSectionId
            && (existingSubj.subjectType === SubjectType.LAB || existingSubj.subjectType === SubjectType.INTEGRATED)) {
          return false; // Allow lab block
        }
      }

      return true; // Violation
    });
  }

  /** Check if a subject is already assigned to slot 0 on another day for this section */
  private isFirstHourDuplicate(sessions: ClassSession[], sectionId: string, subjectCode: string): boolean {
    return sessions.some(s =>
      s.sectionId === sectionId && s.slotIndex === 0 && s.subjectCode === subjectCode
    );
  }

  private generateRandomChromosome(): Chromosome {
    const sessions: ClassSession[] = [];
    const facultySchedule = new Map<string, Set<string>>();
    const sectionSchedule = new Map<string, Set<string>>();

    const isFacultyFree = (fId: string, day: Day, slot: number) =>
      !(facultySchedule.get(fId)?.has(`${day}-${slot}`));
    const markFaculty = (fId: string, day: Day, slot: number) => {
      if (!facultySchedule.has(fId)) facultySchedule.set(fId, new Set());
      facultySchedule.get(fId)!.add(`${day}-${slot}`);
    };
    const isSectionFree = (sId: string, day: Day, slot: number) =>
      !(sectionSchedule.get(sId)?.has(`${day}-${slot}`));
    const markSection = (sId: string, day: Day, slot: number) => {
      if (!sectionSchedule.has(sId)) sectionSchedule.set(sId, new Set());
      sectionSchedule.get(sId)!.add(`${day}-${slot}`);
    };

    const pickFaculty = (subject: Subject, sectionId: string, day: Day, slot: number): string | null => {
      const preAssigned = getAssignedFaculty(this.facultyMappings, subject.code, sectionId);
      if (preAssigned) {
        if (isFacultyFree(preAssigned, day, slot) && !this.isFacultyBackToBack(sessions, preAssigned, day, slot, subject.code, sectionId))
          return preAssigned;
        return null;
      }
      const eligible = seededShuffle(subject.eligibleFacultyIds, this.rand);
      for (const fid of eligible) {
        if (isFacultyFree(fid, day, slot) && !this.isFacultyBackToBack(sessions, fid, day, slot, subject.code, sectionId))
          return fid;
      }
      return null;
    };

    // 1. Fixed classes
    for (const fc of this.fixedClasses) {
      sessions.push({
        sectionId: fc.sectionId, yearNumber: fc.yearNumber,
        subjectCode: fc.subjectCode, facultyId: fc.facultyId,
        day: fc.day, slotIndex: fc.slotIndex, isFixed: true, isCareerPath: false,
      });
      markFaculty(fc.facultyId, fc.day, fc.slotIndex);
      markSection(fc.sectionId, fc.day, fc.slotIndex);
    }

    // 2. Career path classes — ALL sections of the year get the SAME day+slot
    for (const cp of this.careerPathClasses) {
      const yearSections = this.sections.filter(s => s.yearNumber === cp.yearNumber);
      const labRoomId = cp.slotType === 'lab' ? this.findLabRoomForCareerPath(cp, sessions) : undefined;
      // Mark faculty first to guarantee sync
      markFaculty(cp.facultyId, cp.day, cp.slotIndex);
      for (const section of yearSections) {
        // Force-place career path for ALL sections regardless of section-free status
        // (career path takes priority — remove any conflicting session)
        const conflictIdx = sessions.findIndex(
          s => s.sectionId === section.id && s.day === cp.day && s.slotIndex === cp.slotIndex && !s.isFixed
        );
        if (conflictIdx !== -1) {
          const removed = sessions[conflictIdx];
          sectionSchedule.get(removed.sectionId)?.delete(`${removed.day}-${removed.slotIndex}`);
          sessions.splice(conflictIdx, 1);
        }
        sessions.push({
          sectionId: section.id, yearNumber: cp.yearNumber,
          subjectCode: cp.subjectCode, facultyId: cp.facultyId,
          day: cp.day, slotIndex: cp.slotIndex, isFixed: false, isCareerPath: true,
          labRoomId,
          careerPathSlotType: cp.slotType, // Preserve user-selected THEORY vs LAB
        });
        markSection(section.id, cp.day, cp.slotIndex);
      }
    }

    // MANDATORY_SLOTS must always be filled (leisure NOT allowed here)
    const MANDATORY_SLOTS = [0, 1, 2, 4];

    // 3. Remaining subjects per section — process ALL sections uniformly
    // Shuffle sections so no single section always gets priority
    const shuffledSections = seededShuffle(this.sections, this.rand);

    for (const section of shuffledSections) {
      const yearSubjects = seededShuffle(
        this.subjects.filter(s => s.yearNumber === section.yearNumber),
        this.rand,
      );

      // --- Phase A: Place labs/integrated continuous blocks first ---
      for (const subject of yearSubjects) {
        if (subject.subjectType !== SubjectType.LAB && subject.subjectType !== SubjectType.INTEGRATED) continue;
        const existingCount = sessions.filter(s => s.sectionId === section.id && s.subjectCode === subject.code).length;
        let remaining = subject.weeklyHours - existingCount;
        if (remaining <= 0) continue;

        const labRoomId = this.getLabRoomForSession(subject.code, section.id);
        const labHours = subject.subjectType === SubjectType.INTEGRATED ? subject.labHours : subject.weeklyHours;

        if (labHours > 0) {
          const placed = this.placeConsecutive(
            sessions, section.id, section.yearNumber, subject, labHours,
            isFacultyFree, isSectionFree, markFaculty, markSection, labRoomId,
          );
          remaining -= placed;

          // Aggressive retry if first attempt failed
          if (placed === 0) {
            for (const day of DAYS) {
              const slots = this.timeSlotManager.getValidSlots(day);
              for (let i = 0; i <= slots.length - 2; i++) {
                const s1 = slots[i], s2 = slots[i + 1];
                if (!this.timeSlotManager.areSlotsConsecutive(s1.slotIndex, s2.slotIndex)) continue;
                if (!isSectionFree(section.id, day, s1.slotIndex) || !isSectionFree(section.id, day, s2.slotIndex)) continue;
                if (labRoomId && (!this.isLabRoomFree(sessions, labRoomId, day, s1.slotIndex) || !this.isLabRoomFree(sessions, labRoomId, day, s2.slotIndex))) continue;
                const fac = pickFaculty(subject, section.id, day, s1.slotIndex);
                if (!fac) continue;
                if (!isFacultyFree(fac, day, s2.slotIndex)) continue;
                for (const sl of [s1, s2]) {
                  sessions.push({
                    sectionId: section.id, yearNumber: section.yearNumber,
                    subjectCode: subject.code, facultyId: fac,
                    day, slotIndex: sl.slotIndex, isFixed: false, isCareerPath: false,
                    labRoomId,
                  });
                  markFaculty(fac, day, sl.slotIndex);
                  markSection(section.id, day, sl.slotIndex);
                  remaining--;
                }
                break;
              }
              if (remaining <= 0) break;
            }
          }
        }
      }

      // --- Phase B: Place theory hours, prioritizing MANDATORY slots ---
      for (const subject of yearSubjects) {
        const existingCount = sessions.filter(s => s.sectionId === section.id && s.subjectCode === subject.code).length;
        let remaining = subject.weeklyHours - existingCount;
        if (remaining <= 0) continue;

        // For integrated subjects, track lab day
        let labDay: Day | null = null;
        if (subject.subjectType === SubjectType.INTEGRATED) {
          const labSessions = sessions.filter(
            s => s.sectionId === section.id && s.subjectCode === subject.code,
          );
          if (labSessions.length > 0) labDay = labSessions[0].day;
        }

        const daysUsed = new Set(
          sessions.filter(s => s.sectionId === section.id && s.subjectCode === subject.code).map(s => s.day),
        );

        const shuffledDays = seededShuffle(DAYS, this.rand);
        const sortedDays = subject.subjectType === SubjectType.INTEGRATED && labDay
          ? [...shuffledDays.filter(d => d !== labDay), ...shuffledDays.filter(d => d === labDay)]
          : shuffledDays;

        for (const day of sortedDays) {
          if (remaining <= 0) break;
          if (subject.subjectType === SubjectType.THEORY && daysUsed.has(day)) continue;

          const slots = this.timeSlotManager.getValidSlots(day);
          // Prioritize mandatory slots (0,1,2,4) that are empty for this section
          const prioritizedSlots = [...slots].sort((a, b) => {
            const aMand = MANDATORY_SLOTS.includes(a.slotIndex) && isSectionFree(section.id, day, a.slotIndex) ? 0 : 1;
            const bMand = MANDATORY_SLOTS.includes(b.slotIndex) && isSectionFree(section.id, day, b.slotIndex) ? 0 : 1;
            if (aMand !== bMand) return aMand - bMand;
            const aMorning = MORNING_SLOTS.includes(a.slotIndex) ? 0 : 1;
            const bMorning = MORNING_SLOTS.includes(b.slotIndex) ? 0 : 1;
            return aMorning - bMorning || (this.rand() - 0.5);
          });

          for (const slot of prioritizedSlots) {
            if (remaining <= 0) break;
            if (!isSectionFree(section.id, day, slot.slotIndex)) continue;

            // First-hour diversity check
            if (slot.slotIndex === 0 && this.isFirstHourDuplicate(sessions, section.id, subject.code)) continue;

            // Integrated theory on lab day: must be after lunch and not adjacent
            if (subject.subjectType === SubjectType.INTEGRATED && day === labDay) {
              if (slot.slotIndex < 4) continue;
              const labSlots = sessions
                .filter(s => s.sectionId === section.id && s.subjectCode === subject.code && s.day === day)
                .map(s => s.slotIndex);
              const isAdjacent = labSlots.some(ls => this.timeSlotManager.areSlotsConsecutive(ls, slot.slotIndex));
              if (isAdjacent) continue;
            }

            const chosenFaculty = pickFaculty(subject, section.id, day, slot.slotIndex);
            if (!chosenFaculty) continue;

            sessions.push({
              sectionId: section.id, yearNumber: section.yearNumber,
              subjectCode: subject.code, facultyId: chosenFaculty,
              day, slotIndex: slot.slotIndex, isFixed: false, isCareerPath: false,
            });
            markFaculty(chosenFaculty, day, slot.slotIndex);
            markSection(section.id, day, slot.slotIndex);
            daysUsed.add(day);
            remaining--;
            break;
          }
        }

        // Fill any remaining in any available slot (mandatory slots first)
        if (remaining > 0) {
          for (const day of DAYS) {
            const allSlots = this.timeSlotManager.getValidSlots(day);
            const ordered = [...allSlots].sort((a, b) => {
              const aMand = MANDATORY_SLOTS.includes(a.slotIndex) ? 0 : 1;
              const bMand = MANDATORY_SLOTS.includes(b.slotIndex) ? 0 : 1;
              return aMand - bMand;
            });
            for (const slot of ordered) {
              if (remaining <= 0) break;
              if (!isSectionFree(section.id, day, slot.slotIndex)) continue;
              if (slot.slotIndex === 0 && this.isFirstHourDuplicate(sessions, section.id, subject.code)) continue;
              const chosenFaculty = pickFaculty(subject, section.id, day, slot.slotIndex);
              if (!chosenFaculty) continue;
              sessions.push({
                sectionId: section.id, yearNumber: section.yearNumber,
                subjectCode: subject.code, facultyId: chosenFaculty,
                day, slotIndex: slot.slotIndex, isFixed: false, isCareerPath: false,
              });
              markFaculty(chosenFaculty, day, slot.slotIndex);
              markSection(section.id, day, slot.slotIndex);
              remaining--;
            }
          }
        }
      }
    }

    return sessions;
  }

  private findLabRoomForCareerPath(cp: CareerPathClass, sessions: ClassSession[]): string | undefined {
    // Find a lab room that supports this subject and is free
    const subject = this.subjectMap.get(cp.subjectCode);
    if (!subject) return undefined;
    for (const lab of this.labRooms) {
      if (lab.subjectCodes.includes(cp.subjectCode) && this.isLabRoomFree(sessions, lab.id, cp.day, cp.slotIndex)) {
        return lab.id;
      }
    }
    return undefined;
  }

  private placeConsecutive(
    sessions: ClassSession[], sectionId: string, yearNumber: number,
    subject: Subject, hours: number,
    isFacultyFree: (f: string, d: Day, s: number) => boolean,
    isSectionFree: (s: string, d: Day, sl: number) => boolean,
    markFaculty: (f: string, d: Day, s: number) => void,
    markSection: (s: string, d: Day, sl: number) => void,
    labRoomId?: string,
  ): number {
    const shuffledDays = seededShuffle(DAYS, this.rand);

    for (const day of shuffledDays) {
      const slots = this.timeSlotManager.getValidSlots(day);
      for (let i = 0; i <= slots.length - hours; i++) {
        const candidates = slots.slice(i, i + hours);
        let ok = true;

        for (let j = 1; j < candidates.length; j++) {
          if (!this.timeSlotManager.areSlotsConsecutive(candidates[j - 1].slotIndex, candidates[j].slotIndex)) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;

        for (const c of candidates) {
          if (!isSectionFree(sectionId, day, c.slotIndex)) { ok = false; break; }
        }
        if (!ok) continue;

        // Check lab room availability for all candidate slots
        if (labRoomId) {
          for (const c of candidates) {
            if (!this.isLabRoomFree(sessions, labRoomId, day, c.slotIndex)) { ok = false; break; }
          }
          if (!ok) continue;
        }

        const preAssigned = getAssignedFaculty(this.facultyMappings, subject.code, sectionId);
        let chosenFaculty: string | null = null;
        if (preAssigned) {
          if (candidates.every(c => isFacultyFree(preAssigned, day, c.slotIndex))) chosenFaculty = preAssigned;
        } else {
          const eligible = seededShuffle(subject.eligibleFacultyIds, this.rand);
          for (const fid of eligible) {
            if (candidates.every(c => isFacultyFree(fid, day, c.slotIndex))) { chosenFaculty = fid; break; }
          }
        }
        if (!chosenFaculty) continue;

        for (const c of candidates) {
          sessions.push({
            sectionId, yearNumber, subjectCode: subject.code,
            facultyId: chosenFaculty, day, slotIndex: c.slotIndex,
            isFixed: false, isCareerPath: false,
            labRoomId,
          });
          markFaculty(chosenFaculty, day, c.slotIndex);
          markSection(sectionId, day, c.slotIndex);
        }
        return hours;
      }
    }
    return 0;
  }

  private tournamentSelect(population: Chromosome[], fitnesses: number[]): Chromosome {
    let bestIdx = Math.floor(this.rand() * population.length);
    for (let i = 0; i < 3; i++) {
      const idx = Math.floor(this.rand() * population.length);
      if (fitnesses[idx] < fitnesses[bestIdx]) bestIdx = idx;
    }
    return population[bestIdx].map((s) => ({ ...s }));
  }

  private crossover(p1: Chromosome, p2: Chromosome): Chromosome {
    const child: ClassSession[] = [];
    const sectionIds = [...new Set([...p1, ...p2].map((s) => s.sectionId))];

    // 1. Always take career path sessions from p1 to keep them synchronized
    const cpSessions = p1.filter(s => s.isCareerPath).map(s => ({ ...s }));
    const cpKeys = new Set(cpSessions.map(s => `${s.sectionId}-${s.day}-${s.slotIndex}`));
    child.push(...cpSessions);

    // 2. Crossover non-career-path sessions by section
    for (const sid of sectionIds) {
      const source = this.rand() < 0.5 ? p1 : p2;
      const sectionSessions = source
        .filter(s => s.sectionId === sid && !s.isCareerPath)
        .map(s => ({ ...s }))
        .filter(s => !cpKeys.has(`${s.sectionId}-${s.day}-${s.slotIndex}`));
      child.push(...sectionSessions);
    }
    return child;
  }

  private mutate(chromosome: Chromosome): Chromosome {
    const mutable = chromosome.filter((s) => !s.isFixed && !s.isCareerPath);
    if (mutable.length === 0) return chromosome;

    const session = mutable[Math.floor(this.rand() * mutable.length)];
    const subject = this.subjectMap.get(session.subjectCode);

    // 50% chance: try to change faculty (only if not pre-assigned)
    const preAssigned = getAssignedFaculty(this.facultyMappings, session.subjectCode, session.sectionId);
    if (!preAssigned && subject && subject.eligibleFacultyIds.length > 1 && this.rand() < 0.5) {
      const otherFaculty = subject.eligibleFacultyIds.filter(f => f !== session.facultyId);
      const shuffled = seededShuffle(otherFaculty, this.rand);
      for (const fid of shuffled) {
        const conflict = chromosome.some(
          s => s !== session && s.facultyId === fid && s.day === session.day && s.slotIndex === session.slotIndex
        );
        if (!conflict) {
          session.facultyId = fid;
          return chromosome;
        }
      }
    }

    // Otherwise mutate time slot — prefer non-morning-empty moves
    const days = seededShuffle(DAYS, this.rand);
    for (const day of days) {
      const slots = seededShuffle(this.timeSlotManager.getValidSlots(day), this.rand);
      for (const slot of slots) {
        const occupied = chromosome.some(
          s => s !== session && s.sectionId === session.sectionId && s.day === day && s.slotIndex === slot.slotIndex
        );
        if (!occupied) {
          session.day = day;
          session.slotIndex = slot.slotIndex;
          return chromosome;
        }
      }
    }
    return chromosome;
  }

  private repair(chromosome: Chromosome): Chromosome {
    // 0. Repair career path: ensure all sections of each year have the CP sessions
    const cpByKey = new Map<string, ClassSession>();
    for (const s of chromosome) {
      if (!s.isCareerPath) continue;
      const key = `${s.yearNumber}-${s.subjectCode}-${s.day}-${s.slotIndex}`;
      if (!cpByKey.has(key)) cpByKey.set(key, s);
    }
    for (const [, cpRef] of cpByKey) {
      const yearSections = this.sections.filter(s => s.yearNumber === cpRef.yearNumber);
      for (const section of yearSections) {
        const exists = chromosome.some(
          s => s.isCareerPath && s.sectionId === section.id && s.subjectCode === cpRef.subjectCode
            && s.day === cpRef.day && s.slotIndex === cpRef.slotIndex
        );
        if (!exists) {
          // Remove any conflicting non-fixed session at this slot
          chromosome = chromosome.filter(
            s => !(s.sectionId === section.id && s.day === cpRef.day && s.slotIndex === cpRef.slotIndex && !s.isFixed)
          );
          chromosome.push({
            ...cpRef,
            sectionId: section.id,
          });
        }
      }
    }

    // 1. Remove duplicate section-day-slot
    const seen = new Map<string, boolean>();
    let repaired: ClassSession[] = [];
    for (const session of chromosome) {
      const key = `${session.sectionId}-${session.day}-${session.slotIndex}`;
      if (session.isFixed || session.isCareerPath || !seen.has(key)) {
        seen.set(key, true);
        repaired.push(session);
      }
    }

    // 2. Repair faculty conflicts by reassigning to eligible faculty
    const facultySlotMap = new Map<string, ClassSession>();
    for (const session of repaired) {
      const fKey = `${session.facultyId}-${session.day}-${session.slotIndex}`;
      const existing = facultySlotMap.get(fKey);
      if (existing && !session.isFixed) {
        const preAssignedFaculty = getAssignedFaculty(this.facultyMappings, session.subjectCode, session.sectionId);
        if (!preAssignedFaculty) {
          const subject = this.subjectMap.get(session.subjectCode);
          if (subject && subject.eligibleFacultyIds.length > 1) {
            for (const fid of subject.eligibleFacultyIds) {
              const altKey = `${fid}-${session.day}-${session.slotIndex}`;
              if (!facultySlotMap.has(altKey)) {
                session.facultyId = fid;
                facultySlotMap.set(altKey, session);
                break;
              }
            }
          }
        }
      } else {
        facultySlotMap.set(fKey, session);
      }
    }

    // 3. Repair broken lab continuity for LAB and INTEGRATED subjects
    repaired = this.repairLabContinuity(repaired);

    // 4. Repair leisure violations: ensure mandatory slots (0,1,2,4) are filled
    //    by swapping sessions from optional slots (3,5) into empty mandatory slots
    repaired = this.repairLeisure(repaired);

    return repaired;
  }

  /** Validate LAB sessions are exactly in continuous 2-hour blocks for a section+subject */
  private isValidLabScheduleForSubject(
    sessions: ClassSession[],
    sectionId: string,
    subjectCode: string,
    expectedHours: number,
  ): boolean {
    const labSessions = sessions.filter(
      s => !s.isCareerPath && s.sectionId === sectionId && s.subjectCode === subjectCode
    );

    if (labSessions.length !== expectedHours) return false;
    if (labSessions.length % 2 !== 0) return false;

    const byDay = new Map<Day, number[]>();
    for (const s of labSessions) {
      if (!byDay.has(s.day)) byDay.set(s.day, []);
      byDay.get(s.day)!.push(s.slotIndex);
    }

    for (const [, daySlots] of byDay) {
      daySlots.sort((a, b) => a - b);
      if (daySlots.length % 2 !== 0) return false;
      for (let i = 0; i < daySlots.length; i += 2) {
        const first = daySlots[i];
        const second = daySlots[i + 1];
        if (second === undefined || !this.timeSlotManager.areSlotsConsecutive(first, second)) {
          return false;
        }
      }
    }

    return true;
  }

  /** Deterministic hard repair for a single LAB subject in a section */
  private repairSingleLabSubject(
    sessions: ClassSession[],
    sectionId: string,
    yearNumber: number,
    subject: Subject,
  ): ClassSession[] {
    const original = sessions;
    let repaired = sessions.filter(
      s => !(s.sectionId === sectionId && s.subjectCode === subject.code && !s.isCareerPath)
    );

    const labRoomId = this.getLabRoomForSession(subject.code, sectionId);
    const preAssigned = getAssignedFaculty(this.facultyMappings, subject.code, sectionId);
    const facultyCandidates = preAssigned ? [preAssigned] : [...subject.eligibleFacultyIds];
    const requiredPairs = Math.floor(subject.weeklyHours / 2);

    for (let pair = 0; pair < requiredPairs; pair++) {
      let placed = false;

      for (const day of DAYS) {
        const daySlots = this.timeSlotManager.getValidSlots(day);

        for (let i = 0; i < daySlots.length - 1; i++) {
          const slotA = daySlots[i].slotIndex;
          const slotB = daySlots[i + 1].slotIndex;

          if (!this.timeSlotManager.areSlotsConsecutive(slotA, slotB)) continue;

          const sectionBlocked = repaired.some(
            s => s.sectionId === sectionId && s.day === day && (s.slotIndex === slotA || s.slotIndex === slotB)
          );
          if (sectionBlocked) continue;

          if (labRoomId) {
            const labBlocked = repaired.some(
              s => s.labRoomId === labRoomId && s.day === day && (s.slotIndex === slotA || s.slotIndex === slotB)
            );
            if (labBlocked) continue;
          }

          let selectedFaculty: string | null = null;
          for (const fid of facultyCandidates) {
            const facultyBlocked = repaired.some(
              s => s.facultyId === fid && s.day === day && (s.slotIndex === slotA || s.slotIndex === slotB)
            );
            if (facultyBlocked) continue;

            // Avoid faculty adjacency to satisfy no back-to-back + post-lab-free expectations
            const adjacentBefore = repaired.some(
              s => s.facultyId === fid && s.day === day && this.timeSlotManager.areSlotsConsecutive(s.slotIndex, slotA)
            );
            const adjacentAfter = repaired.some(
              s => s.facultyId === fid && s.day === day && this.timeSlotManager.areSlotsConsecutive(slotB, s.slotIndex)
            );
            if (adjacentBefore || adjacentAfter) continue;

            selectedFaculty = fid;
            break;
          }

          if (!selectedFaculty) continue;

          repaired.push({
            sectionId,
            yearNumber,
            subjectCode: subject.code,
            facultyId: selectedFaculty,
            day,
            slotIndex: slotA,
            isFixed: false,
            isCareerPath: false,
            labRoomId,
          });
          repaired.push({
            sectionId,
            yearNumber,
            subjectCode: subject.code,
            facultyId: selectedFaculty,
            day,
            slotIndex: slotB,
            isFixed: false,
            isCareerPath: false,
            labRoomId,
          });

          placed = true;
          break;
        }

        if (placed) break;
      }

      // If not placeable, keep original sessions instead of returning partial/broken replacement
      if (!placed) return original;
    }

    return repaired;
  }

  /** Re-place LAB/INTEGRATED sessions that are missing/split/broken into valid 2-hour blocks */
  private repairLabContinuity(sessions: ClassSession[]): ClassSession[] {
    let repaired = sessions.map(s => ({ ...s }));

    // Repair both LAB and INTEGRATED subjects
    const labSubjects = this.subjects.filter(s => s.subjectType === SubjectType.LAB || s.subjectType === SubjectType.INTEGRATED);

    for (const section of this.sections) {
      const sectionLabSubjects = labSubjects.filter(s => s.yearNumber === section.yearNumber);

      for (const subject of sectionLabSubjects) {
        const expectedLabHours = subject.subjectType === SubjectType.INTEGRATED ? subject.labHours : subject.weeklyHours;
        if (expectedLabHours <= 0 || expectedLabHours % 2 !== 0) continue;

        const valid = this.isValidLabScheduleForSubject(
          repaired,
          section.id,
          subject.code,
          expectedLabHours,
        );

        if (!valid) {
          repaired = this.repairSingleLabSubject(repaired, section.id, section.yearNumber, subject);
        }
      }
    }

    return repaired;
  }

  /** Final hard guarantee: LAB subjects must end as exact 2-hour continuous blocks */
  private ensureLabContinuity(sessions: ClassSession[]): ClassSession[] {
    let result = sessions.map(s => ({ ...s }));

    for (let attempt = 0; attempt < 5; attempt++) {
      let valid = true;

      const labSubjects = this.subjects.filter(s => s.subjectType === SubjectType.LAB || s.subjectType === SubjectType.INTEGRATED);
      for (const section of this.sections) {
        for (const subject of labSubjects.filter(s => s.yearNumber === section.yearNumber)) {
          const expectedLabHours = subject.subjectType === SubjectType.INTEGRATED ? subject.labHours : subject.weeklyHours;
          if (expectedLabHours <= 0 || expectedLabHours % 2 !== 0) continue;
          if (!this.isValidLabScheduleForSubject(result, section.id, subject.code, expectedLabHours)) {
            valid = false;
            break;
          }
        }
        if (!valid) break;
      }

      if (valid) return result;
      result = this.repairLabContinuity(result);
    }

    return result;
  }

  /** Repair leisure violations: move sessions from optional slots (3,5) to empty mandatory slots (0,1,2,4) */
  private repairLeisure(sessions: ClassSession[]): ClassSession[] {
    const MANDATORY_SLOTS = [0, 1, 2, 4];
    const repaired = sessions.map(s => ({ ...s }));

    for (const section of this.sections) {
      for (const day of DAYS) {
        const sectionDaySessions = repaired.filter(
          s => s.sectionId === section.id && s.day === day
        );
        const occupiedSlots = new Set(sectionDaySessions.map(s => s.slotIndex));

        // Find empty mandatory slots
        const emptyMandatory = MANDATORY_SLOTS.filter(slot => !occupiedSlots.has(slot));
        if (emptyMandatory.length === 0) continue;

        // Find movable sessions in optional slots (3, 5)
        const movableSessions = sectionDaySessions.filter(s => {
          if (s.isFixed || s.isCareerPath) return false;
          if (s.slotIndex !== 3 && s.slotIndex !== 5) return false;
          // Don't move lab sessions that are part of a continuous pair
          const subj = this.subjectMap.get(s.subjectCode);
          if (subj && (subj.subjectType === SubjectType.LAB || subj.subjectType === SubjectType.INTEGRATED)) {
            const pairSlot = sectionDaySessions.find(
              other => other !== s && other.subjectCode === s.subjectCode
                && this.timeSlotManager.areSlotsConsecutive(other.slotIndex, s.slotIndex)
            );
            if (pairSlot) return false; // Part of a lab pair, don't move
          }
          return true;
        });

        for (let i = 0; i < emptyMandatory.length && i < movableSessions.length; i++) {
          const session = movableSessions[i];
          // Check faculty is free at the target slot
          const targetSlot = emptyMandatory[i];
          const facultyBusy = repaired.some(
            s => s !== session && s.facultyId === session.facultyId && s.day === day && s.slotIndex === targetSlot
          );
          if (facultyBusy) continue;
          session.slotIndex = targetSlot;
        }
      }
    }

    return repaired;
  }
}
