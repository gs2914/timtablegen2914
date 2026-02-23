import {
  ClassSession,
  Subject,
  Section,
  FixedClass,
  CareerPathClass,
  Day,
  SubjectType,
  FacultySectionMapping,
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

// Morning slots that MUST be filled (leisure rule)
const MORNING_SLOTS = [0, 1];

// Allowed leisure slots: 3 (12:10-13:10), 5 (15:00-16:00), 6 (16:00-17:00)
const ALLOWED_LEISURE_SLOTS = [3, 5, 6];

export class GeneticAlgorithm {
  private config: GAConfig;
  private constraintEngine: ConstraintEngine;
  private timeSlotManager: TimeSlotManager;
  private subjects: Subject[];
  private sections: Section[];
  private fixedClasses: FixedClass[];
  private careerPathClasses: CareerPathClass[];
  private facultyMappings: FacultySectionMapping[];
  private subjectMap: Map<string, Subject>;

  constructor(
    constraintEngine: ConstraintEngine,
    timeSlotManager: TimeSlotManager,
    subjects: Subject[],
    sections: Section[],
    fixedClasses: FixedClass[],
    careerPathClasses: CareerPathClass[],
    facultyMappings: FacultySectionMapping[],
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
    this.subjectMap = new Map(subjects.map(s => [s.code, s]));
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

      if (bestFitness === 0) {
        return { timetable: bestChromosome, fitness: 0, generation: gen, converged: true };
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
        if (Math.random() < this.config.mutationRate) {
          child = this.mutate(child);
        }
        child = this.repair(child);
        newPopulation.push(child);
      }

      population = newPopulation;
    }

    return { timetable: bestChromosome, fitness: bestFitness, generation: bestGeneration, converged: bestFitness === 0 };
  }

  private initializePopulation(): Chromosome[] {
    const population: Chromosome[] = [];
    for (let i = 0; i < this.config.populationSize; i++) {
      population.push(this.generateRandomChromosome());
    }
    return population;
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
      if (preAssigned) return isFacultyFree(preAssigned, day, slot) ? preAssigned : null;
      const eligible = [...subject.eligibleFacultyIds].sort(() => Math.random() - 0.5);
      for (const fid of eligible) {
        if (isFacultyFree(fid, day, slot)) return fid;
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

    // 2. Career path classes
    for (const cp of this.careerPathClasses) {
      const yearSections = this.sections.filter(s => s.yearNumber === cp.yearNumber);
      for (const section of yearSections) {
        if (isSectionFree(section.id, cp.day, cp.slotIndex) && isFacultyFree(cp.facultyId, cp.day, cp.slotIndex)) {
          sessions.push({
            sectionId: section.id, yearNumber: cp.yearNumber,
            subjectCode: cp.subjectCode, facultyId: cp.facultyId,
            day: cp.day, slotIndex: cp.slotIndex, isFixed: false, isCareerPath: true,
          });
          markSection(section.id, cp.day, cp.slotIndex);
        }
      }
      markFaculty(cp.facultyId, cp.day, cp.slotIndex);
    }

    // 3. Remaining subjects per section
    for (const section of this.sections) {
      const yearSubjects = this.subjects.filter(s => s.yearNumber === section.yearNumber);

      for (const subject of yearSubjects) {
        const existingCount = sessions.filter(s => s.sectionId === section.id && s.subjectCode === subject.code).length;
        let remaining = subject.weeklyHours - existingCount;
        if (remaining <= 0) continue;

        // Handle lab/integrated continuous slots
        if (subject.subjectType === SubjectType.LAB || subject.subjectType === SubjectType.INTEGRATED) {
          const labHours = subject.subjectType === SubjectType.INTEGRATED ? subject.labHours : subject.weeklyHours;
          if (labHours > 0) {
            const placed = this.placeConsecutive(
              sessions, section.id, section.yearNumber, subject, labHours,
              isFacultyFree, isSectionFree, markFaculty, markSection
            );
            remaining -= placed;
          }
        }

        // For integrated subjects, track which day the lab is on to avoid theory on same day
        let labDay: Day | null = null;
        if (subject.subjectType === SubjectType.INTEGRATED) {
          const labSessions = sessions.filter(
            s => s.sectionId === section.id && s.subjectCode === subject.code
          );
          if (labSessions.length > 0) labDay = labSessions[0].day;
        }

        // Distribute remaining theory hours across different days
        const daysUsed = new Set(
          sessions.filter(s => s.sectionId === section.id && s.subjectCode === subject.code).map(s => s.day)
        );

        // Prefer morning slots first (leisure rule: mornings must be occupied)
        const shuffledDays = [...DAYS].sort(() => Math.random() - 0.5);
        // For integrated subjects, prioritize days OTHER than lab day
        const sortedDays = subject.subjectType === SubjectType.INTEGRATED && labDay
          ? [...shuffledDays.filter(d => d !== labDay), ...shuffledDays.filter(d => d === labDay)]
          : shuffledDays;

        for (const day of sortedDays) {
          if (remaining <= 0) break;
          if (subject.subjectType === SubjectType.THEORY && daysUsed.has(day)) continue;

          // For integrated theory on lab day: only after lunch (slot >= 4) and not adjacent to lab
          const slots = this.timeSlotManager.getValidSlots(day);
          // Prefer morning slots to fill mornings first
          const prioritizedSlots = [...slots].sort((a, b) => {
            const aMorning = MORNING_SLOTS.includes(a.slotIndex) ? 0 : 1;
            const bMorning = MORNING_SLOTS.includes(b.slotIndex) ? 0 : 1;
            return aMorning - bMorning || (Math.random() - 0.5);
          });

          for (const slot of prioritizedSlots) {
            if (remaining <= 0) break;
            if (!isSectionFree(section.id, day, slot.slotIndex)) continue;

            // Integrated theory on lab day: must be after lunch and not adjacent to lab
            if (subject.subjectType === SubjectType.INTEGRATED && day === labDay) {
              if (slot.slotIndex < 4) continue; // Must be after lunch
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

        // Fill any remaining in any available slot
        if (remaining > 0) {
          for (const day of DAYS) {
            for (const slot of this.timeSlotManager.getValidSlots(day)) {
              if (remaining <= 0) break;
              if (!isSectionFree(section.id, day, slot.slotIndex)) continue;
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

  private placeConsecutive(
    sessions: ClassSession[], sectionId: string, yearNumber: number,
    subject: Subject, hours: number,
    isFacultyFree: (f: string, d: Day, s: number) => boolean,
    isSectionFree: (s: string, d: Day, sl: number) => boolean,
    markFaculty: (f: string, d: Day, s: number) => void,
    markSection: (s: string, d: Day, sl: number) => void,
  ): number {
    const shuffledDays = [...DAYS].sort(() => Math.random() - 0.5);

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

        const preAssigned = getAssignedFaculty(this.facultyMappings, subject.code, sectionId);
        let chosenFaculty: string | null = null;
        if (preAssigned) {
          if (candidates.every(c => isFacultyFree(preAssigned, day, c.slotIndex))) chosenFaculty = preAssigned;
        } else {
          const eligible = [...subject.eligibleFacultyIds].sort(() => Math.random() - 0.5);
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
    let bestIdx = Math.floor(Math.random() * population.length);
    for (let i = 0; i < 3; i++) {
      const idx = Math.floor(Math.random() * population.length);
      if (fitnesses[idx] < fitnesses[bestIdx]) bestIdx = idx;
    }
    return population[bestIdx].map((s) => ({ ...s }));
  }

  private crossover(p1: Chromosome, p2: Chromosome): Chromosome {
    const child: ClassSession[] = [];
    const sectionIds = [...new Set([...p1, ...p2].map((s) => s.sectionId))];
    for (const sid of sectionIds) {
      const source = Math.random() < 0.5 ? p1 : p2;
      child.push(...source.filter((s) => s.sectionId === sid).map((s) => ({ ...s })));
    }
    return child;
  }

  private mutate(chromosome: Chromosome): Chromosome {
    const mutable = chromosome.filter((s) => !s.isFixed && !s.isCareerPath);
    if (mutable.length === 0) return chromosome;

    const session = mutable[Math.floor(Math.random() * mutable.length)];
    const subject = this.subjectMap.get(session.subjectCode);

    // 50% chance: try to change faculty (only if not pre-assigned)
    const preAssigned = getAssignedFaculty(this.facultyMappings, session.subjectCode, session.sectionId);
    if (!preAssigned && subject && subject.eligibleFacultyIds.length > 1 && Math.random() < 0.5) {
      const otherFaculty = subject.eligibleFacultyIds.filter(f => f !== session.facultyId);
      const shuffled = otherFaculty.sort(() => Math.random() - 0.5);
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
    const days = [...DAYS].sort(() => Math.random() - 0.5);
    for (const day of days) {
      const slots = this.timeSlotManager.getValidSlots(day).sort(() => Math.random() - 0.5);
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
    // 1. Remove duplicate section-day-slot
    const seen = new Map<string, boolean>();
    const repaired: ClassSession[] = [];
    for (const session of chromosome) {
      const key = `${session.sectionId}-${session.day}-${session.slotIndex}`;
      if (session.isFixed || !seen.has(key)) {
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

    return repaired;
  }
}
