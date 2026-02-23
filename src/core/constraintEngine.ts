import { ClassSession, Subject, SubjectType, FacultySectionMapping } from '@/types/timetable';
import { TimeSlotManager } from './timeSlotManager';

export interface ConstraintViolation {
  type: 'hard' | 'soft';
  message: string;
  penalty: number;
}

export class ConstraintEngine {
  private timeSlotManager: TimeSlotManager;
  private subjects: Map<string, Subject>;
  private facultyMappings: FacultySectionMapping[];

  constructor(timeSlotManager: TimeSlotManager, subjects: Subject[], facultyMappings: FacultySectionMapping[] = []) {
    this.timeSlotManager = timeSlotManager;
    this.subjects = new Map(subjects.map((s) => [s.code, s]));
    this.facultyMappings = facultyMappings;
  }

  evaluateAll(sessions: ClassSession[]): ConstraintViolation[] {
    return [
      ...this.checkFacultyConflicts(sessions),
      ...this.checkDuplicateSubjectPerDay(sessions),
      ...this.checkInvalidSlots(sessions),
      ...this.checkLabContinuity(sessions),
      ...this.checkCareerPathSync(sessions),
      ...this.checkFacultyMappingViolations(sessions),
      ...this.checkIntegratedSubjectRules(sessions),
      ...this.checkLeisureHourPlacement(sessions),
      ...this.checkSoftConstraints(sessions),
    ];
  }

  calculateFitness(sessions: ClassSession[]): number {
    const violations = this.evaluateAll(sessions);
    return violations.reduce((sum, v) => sum + v.penalty, 0);
  }

  /** Validate a single-cell edit against all hard constraints. Returns violation messages or empty array. */
  validateEdit(
    allSessions: ClassSession[],
    editedSession: ClassSession,
    originalSession: ClassSession
  ): string[] {
    // Build a hypothetical timetable with the edit applied
    const hypothetical = allSessions.map(s =>
      s === originalSession ? { ...editedSession } : { ...s }
    );
    const violations = this.evaluateAll(hypothetical).filter(v => v.type === 'hard');
    return violations.map(v => v.message);
  }

  // ─── HARD: Faculty conflicts ───────────────────────────────────
  private checkFacultyConflicts(sessions: ClassSession[]): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];
    const slotMap = new Map<string, ClassSession[]>();
    for (const session of sessions) {
      const key = `${session.facultyId}-${session.day}-${session.slotIndex}`;
      if (!slotMap.has(key)) slotMap.set(key, []);
      slotMap.get(key)!.push(session);
    }
    for (const [key, classes] of slotMap) {
      if (classes.length > 1) {
        violations.push({ type: 'hard', message: `Faculty conflict: ${key}`, penalty: 1000 });
      }
    }
    return violations;
  }

  // ─── HARD: No same theory subject twice per day per section ────
  private checkDuplicateSubjectPerDay(sessions: ClassSession[]): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];
    const dayMap = new Map<string, number>();
    for (const session of sessions) {
      const subject = this.subjects.get(session.subjectCode);
      if (subject && subject.subjectType !== SubjectType.THEORY) continue;
      const key = `${session.sectionId}-${session.day}-${session.subjectCode}`;
      dayMap.set(key, (dayMap.get(key) || 0) + 1);
    }
    for (const [key, count] of dayMap) {
      if (count > 1) {
        violations.push({ type: 'hard', message: `Duplicate theory subject: ${key}`, penalty: 1000 });
      }
    }
    return violations;
  }

  // ─── HARD: Valid time slots only ───────────────────────────────
  private checkInvalidSlots(sessions: ClassSession[]): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];
    for (const session of sessions) {
      if (!this.timeSlotManager.isValidSlot(session.day, session.slotIndex)) {
        violations.push({ type: 'hard', message: `Invalid slot: ${session.day} slot ${session.slotIndex}`, penalty: 1000 });
      }
    }
    return violations;
  }

  // ─── HARD: Lab hours must be exactly 2 continuous slots ────────
  private checkLabContinuity(sessions: ClassSession[]): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];
    const groups = new Map<string, ClassSession[]>();
    for (const session of sessions) {
      const subject = this.subjects.get(session.subjectCode);
      if (!subject || subject.subjectType === SubjectType.THEORY) continue;
      const key = `${session.sectionId}-${session.subjectCode}-${session.day}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(session);
    }
    for (const [key, classes] of groups) {
      if (classes.length > 1) {
        const slots = classes.map((c) => c.slotIndex).sort((a, b) => a - b);
        for (let i = 1; i < slots.length; i++) {
          if (!this.timeSlotManager.areSlotsConsecutive(slots[i - 1], slots[i])) {
            violations.push({ type: 'hard', message: `Lab not continuous: ${key}`, penalty: 1000 });
          }
        }
      }
    }

    // Also check that lab sessions for a subject appear on only one day
    const subjectSectionDays = new Map<string, Set<string>>();
    for (const session of sessions) {
      const subject = this.subjects.get(session.subjectCode);
      if (!subject || subject.subjectType === SubjectType.THEORY) continue;
      // Group lab sessions by section+subject (ignoring day)
      const key = `${session.sectionId}-${session.subjectCode}`;
      if (!subjectSectionDays.has(key)) subjectSectionDays.set(key, new Set());
      subjectSectionDays.get(key)!.add(session.day);
    }
    // For lab-only subjects the lab block must be on exactly one day
    for (const [key, days] of subjectSectionDays) {
      const subCode = key.split('-').slice(1).join('-');
      const subject = this.subjects.get(subCode);
      if (subject && subject.subjectType === SubjectType.LAB && days.size > 1) {
        violations.push({ type: 'hard', message: `Lab split across days: ${key}`, penalty: 1000 });
      }
    }

    return violations;
  }

  // ─── HARD: Career path sync ────────────────────────────────────
  private checkCareerPathSync(sessions: ClassSession[]): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];
    const careerSessions = sessions.filter((s) => s.isCareerPath);
    const groups = new Map<string, ClassSession[]>();
    for (const session of careerSessions) {
      const key = `${session.yearNumber}-${session.subjectCode}-${session.day}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(session);
    }
    for (const [, classes] of groups) {
      if (classes.length > 1) {
        const slots = new Set(classes.map((c) => c.slotIndex));
        if (slots.size > 1) {
          violations.push({ type: 'hard', message: `Career path not synchronized`, penalty: 1000 });
        }
      }
    }
    return violations;
  }

  // ─── HARD: Faculty-section mapping immutability ────────────────
  private checkFacultyMappingViolations(sessions: ClassSession[]): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];
    for (const session of sessions) {
      const mapping = this.facultyMappings.find(
        m => m.subjectCode === session.subjectCode && m.sectionId === session.sectionId
      );
      if (mapping && session.facultyId !== mapping.facultyId) {
        violations.push({
          type: 'hard',
          message: `Faculty mapping violated: ${session.subjectCode} in ${session.sectionId} should be ${mapping.facultyId}`,
          penalty: 1000,
        });
      }
    }
    return violations;
  }

  // ─── HARD: Integrated subject – no 3 continuous hours ──────────
  private checkIntegratedSubjectRules(sessions: ClassSession[]): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];

    for (const subject of this.subjects.values()) {
      if (subject.subjectType !== SubjectType.INTEGRATED) continue;

      // Get all section IDs that have this subject
      const sectionIds = [...new Set(sessions.filter(s => s.subjectCode === subject.code).map(s => s.sectionId))];

      for (const sectionId of sectionIds) {
        const subjSessions = sessions.filter(s => s.subjectCode === subject.code && s.sectionId === sectionId);

        // Group by day
        const byDay = new Map<string, ClassSession[]>();
        for (const s of subjSessions) {
          if (!byDay.has(s.day)) byDay.set(s.day, []);
          byDay.get(s.day)!.push(s);
        }

        for (const [day, daySessions] of byDay) {
          if (daySessions.length >= 3) {
            // 3+ hours of same integrated subject in one day → hard violation
            violations.push({
              type: 'hard',
              message: `Integrated 3+ hours on ${day}: ${subject.code} in ${sectionId}`,
              penalty: 1000,
            });
          }

          if (daySessions.length >= 2) {
            // Check for continuous lab+theory or theory+lab (3-hour block)
            const slots = daySessions.map(s => s.slotIndex).sort((a, b) => a - b);
            // Find lab slots (consecutive pair)
            const labSlots: number[] = [];
            const theorySlots: number[] = [];
            for (const s of daySessions) {
              // Heuristic: if there's a consecutive pair, those are lab
              // We'll check all pairs
            }
            // Simpler: if any theory slot is immediately adjacent to a lab slot pair, reject
            // Identify which slots form the lab block
            for (let i = 0; i < slots.length - 1; i++) {
              if (this.timeSlotManager.areSlotsConsecutive(slots[i], slots[i + 1])) {
                labSlots.push(slots[i], slots[i + 1]);
              }
            }
            const nonLabSlots = slots.filter(s => !labSlots.includes(s));
            // If a theory slot is adjacent to a lab slot, violation
            for (const ts of nonLabSlots) {
              for (const ls of labSlots) {
                if (this.timeSlotManager.areSlotsConsecutive(ts, ls)) {
                  violations.push({
                    type: 'hard',
                    message: `Integrated theory adjacent to lab on ${day}: ${subject.code} in ${sectionId}`,
                    penalty: 1000,
                  });
                }
              }
            }
          }
        }
      }
    }

    return violations;
  }

  // ─── HARD: Leisure hours must not be in morning slots ──────────
  private checkLeisureHourPlacement(sessions: ClassSession[]): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];

    // Collect all sections
    const sectionIds = [...new Set(sessions.map(s => s.sectionId))];

    // Morning slots: 0 (09-10), 1 (10-11)
    const morningSlots = [0, 1];

    for (const sectionId of sectionIds) {
      const sectionSessions = sessions.filter(s => s.sectionId === sectionId);

      // Group by day
      const byDay = new Map<string, Set<number>>();
      for (const s of sectionSessions) {
        if (!byDay.has(s.day)) byDay.set(s.day, new Set());
        byDay.get(s.day)!.add(s.slotIndex);
      }

      for (const [day, occupiedSlots] of byDay) {
        for (const ms of morningSlots) {
          if (this.timeSlotManager.isValidSlot(day as any, ms) && !occupiedSlots.has(ms)) {
            violations.push({
              type: 'hard',
              message: `Morning free hour: ${sectionId} ${day} slot ${ms}`,
              penalty: 1000,
            });
          }
        }
      }

      // Also check days with no sessions at all — morning must still be filled
      // (only relevant if section has classes on other days)
    }

    return violations;
  }

  // ─── SOFT CONSTRAINTS ──────────────────────────────────────────
  private checkSoftConstraints(sessions: ClassSession[]): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];

    for (const session of sessions) {
      if (session.slotIndex === 6) {
        violations.push({ type: 'soft', message: `Late slot`, penalty: 5 });
      }
    }

    const facultyDayCount = new Map<string, number>();
    for (const session of sessions) {
      const key = `${session.facultyId}-${session.day}`;
      facultyDayCount.set(key, (facultyDayCount.get(key) || 0) + 1);
    }
    for (const [, count] of facultyDayCount) {
      if (count > 4) {
        violations.push({ type: 'soft', message: `Faculty overload`, penalty: 10 * (count - 4) });
      }
    }

    const sectionDaySlots = new Map<string, number[]>();
    for (const session of sessions) {
      const key = `${session.sectionId}-${session.day}`;
      if (!sectionDaySlots.has(key)) sectionDaySlots.set(key, []);
      sectionDaySlots.get(key)!.push(session.slotIndex);
    }
    for (const [, slots] of sectionDaySlots) {
      if (slots.length > 1) {
        const sorted = [...slots].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) {
          const gap = sorted[i] - sorted[i - 1] - 1;
          if (gap > 0 && !(sorted[i - 1] === 3 && sorted[i] === 4)) {
            violations.push({ type: 'soft', message: `Idle gap`, penalty: 3 * gap });
          }
        }
      }
    }

    // Workload balancing
    const subjectFacultyLoad = new Map<string, Map<string, number>>();
    for (const session of sessions) {
      const subject = this.subjects.get(session.subjectCode);
      if (!subject || subject.eligibleFacultyIds.length <= 1) continue;
      if (!subjectFacultyLoad.has(session.subjectCode)) {
        subjectFacultyLoad.set(session.subjectCode, new Map());
      }
      const loads = subjectFacultyLoad.get(session.subjectCode)!;
      loads.set(session.facultyId, (loads.get(session.facultyId) || 0) + 1);
    }
    for (const [, loads] of subjectFacultyLoad) {
      const counts = [...loads.values()];
      if (counts.length > 0) {
        const max = Math.max(...counts);
        const min = Math.min(...counts);
        const imbalance = max - min;
        if (imbalance > 2) {
          violations.push({ type: 'soft', message: `Faculty workload imbalance`, penalty: 5 * (imbalance - 2) });
        }
      }
    }

    return violations;
  }
}
