import { ClassSession, Subject, SubjectType } from '@/types/timetable';
import { TimeSlotManager } from './timeSlotManager';

export interface ConstraintViolation {
  type: 'hard' | 'soft';
  message: string;
  penalty: number;
}

export class ConstraintEngine {
  private timeSlotManager: TimeSlotManager;
  private subjects: Map<string, Subject>;

  constructor(timeSlotManager: TimeSlotManager, subjects: Subject[]) {
    this.timeSlotManager = timeSlotManager;
    this.subjects = new Map(subjects.map((s) => [s.code, s]));
  }

  evaluateAll(sessions: ClassSession[]): ConstraintViolation[] {
    return [
      ...this.checkFacultyConflicts(sessions),
      ...this.checkDuplicateSubjectPerDay(sessions),
      ...this.checkInvalidSlots(sessions),
      ...this.checkLabContinuity(sessions),
      ...this.checkCareerPathSync(sessions),
      ...this.checkSoftConstraints(sessions),
    ];
  }

  calculateFitness(sessions: ClassSession[]): number {
    const violations = this.evaluateAll(sessions);
    return violations.reduce((sum, v) => sum + v.penalty, 0);
  }

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
        violations.push({
          type: 'hard',
          message: `Faculty conflict: ${key}`,
          penalty: 1000,
        });
      }
    }
    return violations;
  }

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
        violations.push({
          type: 'hard',
          message: `Duplicate theory subject: ${key}`,
          penalty: 1000,
        });
      }
    }
    return violations;
  }

  private checkInvalidSlots(sessions: ClassSession[]): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];
    for (const session of sessions) {
      if (!this.timeSlotManager.isValidSlot(session.day, session.slotIndex)) {
        violations.push({
          type: 'hard',
          message: `Invalid slot: ${session.day} slot ${session.slotIndex}`,
          penalty: 1000,
        });
      }
    }
    return violations;
  }

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
            violations.push({
              type: 'hard',
              message: `Lab not continuous: ${key}`,
              penalty: 1000,
            });
          }
        }
      }
    }
    return violations;
  }

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
          violations.push({
            type: 'hard',
            message: `Career path not synchronized`,
            penalty: 1000,
          });
        }
      }
    }
    return violations;
  }

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
        violations.push({
          type: 'soft',
          message: `Faculty overload`,
          penalty: 10 * (count - 4),
        });
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

    // Workload balancing across eligible faculty for multi-faculty subjects
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
          violations.push({
            type: 'soft',
            message: `Faculty workload imbalance`,
            penalty: 5 * (imbalance - 2),
          });
        }
      }
    }

    return violations;
  }
}
