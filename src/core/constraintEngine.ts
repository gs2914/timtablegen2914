import { ClassSession, Subject, SubjectType, Day, FacultySectionMapping, LabRoom, LabRoomMapping } from '@/types/timetable';
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
  private labRooms: LabRoom[];
  private labRoomMappings: LabRoomMapping[];

  constructor(
    timeSlotManager: TimeSlotManager,
    subjects: Subject[],
    facultyMappings: FacultySectionMapping[] = [],
    labRooms: LabRoom[] = [],
    labRoomMappings: LabRoomMapping[] = [],
  ) {
    this.timeSlotManager = timeSlotManager;
    this.subjects = new Map(subjects.map((s) => [s.code, s]));
    this.facultyMappings = facultyMappings;
    this.labRooms = labRooms;
    this.labRoomMappings = labRoomMappings;
  }

  evaluateAll(sessions: ClassSession[]): ConstraintViolation[] {
    return [
      ...this.checkFacultyConflicts(sessions),
      ...this.checkFacultyBackToBack(sessions),
      ...this.checkFirstHourDiversity(sessions),
      ...this.checkDuplicateSubjectPerDay(sessions),
      ...this.checkInvalidSlots(sessions),
      ...this.checkLabContinuity(sessions),
      ...this.checkCareerPathSync(sessions),
      ...this.checkFacultyMappingViolations(sessions),
      ...this.checkIntegratedSubjectRules(sessions),
      ...this.checkLeisureHourPlacement(sessions),
      ...this.checkLabRoomClashes(sessions),
      ...this.checkLabRoomMappingImmutability(sessions),
      ...this.checkSoftConstraints(sessions),
    ];
  }

  calculateFitness(sessions: ClassSession[]): number {
    const violations = this.evaluateAll(sessions);
    return violations.reduce((sum, v) => sum + v.penalty, 0);
  }

  validateEdit(
    allSessions: ClassSession[],
    editedSession: ClassSession,
    originalSession: ClassSession
  ): string[] {
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

  // ─── HARD: Faculty no back-to-back THEORY classes (labs allowed as 2-hr blocks) ───
  private checkFacultyBackToBack(sessions: ClassSession[]): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];

    // Build a lookup: faculty+day+slot → session
    const facultyDaySessions = new Map<string, ClassSession[]>();
    for (const session of sessions) {
      const key = `${session.facultyId}-${session.day}`;
      if (!facultyDaySessions.has(key)) facultyDaySessions.set(key, []);
      facultyDaySessions.get(key)!.push(session);
    }

    for (const [key, daySessions] of facultyDaySessions) {
      const sorted = daySessions
        .map(s => ({ slot: s.slotIndex, session: s }))
        .sort((a, b) => a.slot - b.slot);

      // Deduplicate by slot (shouldn't have dupes but be safe)
      const unique: { slot: number; session: ClassSession }[] = [];
      const seen = new Set<number>();
      for (const entry of sorted) {
        if (!seen.has(entry.slot)) { seen.add(entry.slot); unique.push(entry); }
      }

      for (let i = 1; i < unique.length; i++) {
        const prev = unique[i - 1];
        const curr = unique[i];

        if (!this.timeSlotManager.areSlotsConsecutive(prev.slot, curr.slot)) continue;

        // Both are part of the same lab subject → allowed (2-hr lab block)
        const prevSubj = this.subjects.get(prev.session.subjectCode);
        const currSubj = this.subjects.get(curr.session.subjectCode);
        const prevIsLab = prevSubj && (prevSubj.subjectType === SubjectType.LAB || prevSubj.subjectType === SubjectType.INTEGRATED);
        const currIsLab = currSubj && (currSubj.subjectType === SubjectType.LAB || currSubj.subjectType === SubjectType.INTEGRATED);

        if (prevIsLab && currIsLab && prev.session.subjectCode === curr.session.subjectCode
            && prev.session.sectionId === curr.session.sectionId) {
          continue; // Valid 2-hr lab block
        }

        // Otherwise it's a violation
        violations.push({
          type: 'hard',
          message: `Faculty back-to-back: ${key} slots ${prev.slot}-${curr.slot}`,
          penalty: 1000,
        });
      }

      // After a lab block, next slot must be free
      // Find lab blocks and check the slot after the second lab hour
      const slotSet = new Set(unique.map(u => u.slot));
      for (let i = 0; i < unique.length - 1; i++) {
        const a = unique[i];
        const b = unique[i + 1];
        const aSubj = this.subjects.get(a.session.subjectCode);
        const bSubj = this.subjects.get(b.session.subjectCode);
        const aIsLab = aSubj && (aSubj.subjectType === SubjectType.LAB || aSubj.subjectType === SubjectType.INTEGRATED);
        const bIsLab = bSubj && (bSubj.subjectType === SubjectType.LAB || bSubj.subjectType === SubjectType.INTEGRATED);

        if (aIsLab && bIsLab && a.session.subjectCode === b.session.subjectCode
            && a.session.sectionId === b.session.sectionId
            && this.timeSlotManager.areSlotsConsecutive(a.slot, b.slot)) {
          // This is a lab block ending at b.slot. Check if there's a session in the next consecutive slot.
          const nextEntry = unique.find(u => this.timeSlotManager.areSlotsConsecutive(b.slot, u.slot) && u.slot > b.slot);
          if (nextEntry) {
            violations.push({
              type: 'hard',
              message: `No free slot after lab: ${key} lab ends at slot ${b.slot}, next at ${nextEntry.slot}`,
              penalty: 1000,
            });
          }
        }
      }
    }

    return violations;
  }

  // ─── HARD: First-hour subject diversity ────────────────────────
  private checkFirstHourDiversity(sessions: ClassSession[]): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];
    // Group slot-0 sessions by section
    const sectionFirstHour = new Map<string, Map<string, number>>();
    for (const session of sessions) {
      if (session.slotIndex !== 0) continue;
      if (!sectionFirstHour.has(session.sectionId)) sectionFirstHour.set(session.sectionId, new Map());
      const subjectCounts = sectionFirstHour.get(session.sectionId)!;
      subjectCounts.set(session.subjectCode, (subjectCounts.get(session.subjectCode) || 0) + 1);
    }
    for (const [sectionId, subjectCounts] of sectionFirstHour) {
      for (const [subjectCode, count] of subjectCounts) {
        if (count > 1) {
          violations.push({
            type: 'hard',
            message: `First-hour repeat: ${subjectCode} in ${sectionId} (${count} days)`,
            penalty: 1000,
          });
        }
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

    // Lab sessions for a subject appear on only one day
    const subjectSectionDays = new Map<string, Set<string>>();
    for (const session of sessions) {
      const subject = this.subjects.get(session.subjectCode);
      if (!subject || subject.subjectType === SubjectType.THEORY) continue;
      const key = `${session.sectionId}-${session.subjectCode}`;
      if (!subjectSectionDays.has(key)) subjectSectionDays.set(key, new Set());
      subjectSectionDays.get(key)!.add(session.day);
    }
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
          violations.push({ type: 'hard', message: `Career path not synchronised`, penalty: 1000 });
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

      const sectionIds = [...new Set(sessions.filter(s => s.subjectCode === subject.code).map(s => s.sectionId))];

      for (const sectionId of sectionIds) {
        const subjSessions = sessions.filter(s => s.subjectCode === subject.code && s.sectionId === sectionId);

        const byDay = new Map<string, ClassSession[]>();
        for (const s of subjSessions) {
          if (!byDay.has(s.day)) byDay.set(s.day, []);
          byDay.get(s.day)!.push(s);
        }

        for (const [day, daySessions] of byDay) {
          if (daySessions.length >= 3) {
            violations.push({
              type: 'hard',
              message: `Integrated 3+ hours on ${day}: ${subject.code} in ${sectionId}`,
              penalty: 1000,
            });
          }

          if (daySessions.length >= 2) {
            const slots = daySessions.map(s => s.slotIndex).sort((a, b) => a - b);
            const labSlots: number[] = [];
            for (let i = 0; i < slots.length - 1; i++) {
              if (this.timeSlotManager.areSlotsConsecutive(slots[i], slots[i + 1])) {
                labSlots.push(slots[i], slots[i + 1]);
              }
            }
            const nonLabSlots = slots.filter(s => !labSlots.includes(s));
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

  // ─── HARD: Max 1 leisure (free) hour per day per section ────────
  // Leisure must be afternoon only (slots 4,5) and max 1 per day.
  // Leisure slots must NOT be consecutive (no 2-hour free block).
  private checkLeisureHourPlacement(sessions: ClassSession[]): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];
    const sectionIds = [...new Set(sessions.map(s => s.sectionId))];

    for (const sectionId of sectionIds) {
      const sectionSessions = sessions.filter(s => s.sectionId === sectionId);
      const byDay = new Map<string, Set<number>>();
      for (const s of sectionSessions) {
        if (!byDay.has(s.day)) byDay.set(s.day, new Set());
        byDay.get(s.day)!.add(s.slotIndex);
      }

      const leisureDays: string[] = [];

      for (const [day, occupiedSlots] of byDay) {
        // Count free slots among the first 6 valid slots (exclude optional 7th)
        const validSlots = this.timeSlotManager.getValidSlots(day as Day).filter(s => s.slotIndex < 6);
        const freeSlots = validSlots.filter(s => !occupiedSlots.has(s.slotIndex));
        const freeCount = freeSlots.length;

        // Max 1 free hour per day
        if (freeCount > 1) {
          violations.push({
            type: 'hard',
            message: `Too many free hours (${freeCount}): ${sectionId} ${day}`,
            penalty: 1000 * (freeCount - 1),
          });
        }

        // Free hour must be in afternoon slots (4 or 5) only
        if (freeCount >= 1) {
          for (const fs of freeSlots) {
            if (fs.slotIndex < 4) {
              violations.push({
                type: 'hard',
                message: `Free hour in morning slot ${fs.slotIndex}: ${sectionId} ${day}`,
                penalty: 1000,
              });
            }
          }
          leisureDays.push(day);
        }

        // No 2 consecutive free slots
        if (freeCount >= 2) {
          const freeIdxs = freeSlots.map(s => s.slotIndex).sort((a, b) => a - b);
          for (let i = 1; i < freeIdxs.length; i++) {
            if (this.timeSlotManager.areSlotsConsecutive(freeIdxs[i - 1], freeIdxs[i])) {
              violations.push({
                type: 'hard',
                message: `Consecutive free hours: ${sectionId} ${day} slots ${freeIdxs[i-1]}-${freeIdxs[i]}`,
                penalty: 1000,
              });
            }
          }
        }
      }
    }

    return violations;
  }

  // ─── HARD: Lab room double-booking ─────────────────────────────
  private checkLabRoomClashes(sessions: ClassSession[]): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];
    const labSlotMap = new Map<string, ClassSession[]>();
    for (const session of sessions) {
      if (!session.labRoomId) continue;
      const key = `${session.labRoomId}-${session.day}-${session.slotIndex}`;
      if (!labSlotMap.has(key)) labSlotMap.set(key, []);
      labSlotMap.get(key)!.push(session);
    }
    for (const [key, classes] of labSlotMap) {
      // Multiple sessions in the same lab room at the same time is only OK if they are the same section+subject (continuous lab)
      const uniqueSections = new Set(classes.map(c => `${c.sectionId}-${c.subjectCode}`));
      if (uniqueSections.size > 1) {
        violations.push({
          type: 'hard',
          message: `Lab room double-booked: ${key}`,
          penalty: 1000,
        });
      }
    }
    return violations;
  }

  // ─── HARD: Lab room mapping immutability ───────────────────────
  private checkLabRoomMappingImmutability(sessions: ClassSession[]): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];
    for (const session of sessions) {
      if (!session.labRoomId) continue;
      const mapping = this.labRoomMappings.find(
        m => m.subjectCode === session.subjectCode && m.sectionId === session.sectionId
      );
      if (mapping && session.labRoomId !== mapping.labRoomId) {
        violations.push({
          type: 'hard',
          message: `Lab room mapping violated: ${session.subjectCode} in ${session.sectionId} should use ${mapping.labRoomId}`,
          penalty: 1000,
        });
      }
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
