import { Day, TimeSlot } from '@/types/timetable';

export const DAYS: Day[] = [
  Day.MONDAY,
  Day.TUESDAY,
  Day.WEDNESDAY,
  Day.THURSDAY,
  Day.FRIDAY,
];

export const SLOT_DEFINITIONS = [
  { slotIndex: 0, startTime: '09:00', endTime: '10:00' },
  { slotIndex: 1, startTime: '10:00', endTime: '11:00' },
  { slotIndex: 2, startTime: '11:10', endTime: '12:10' },
  { slotIndex: 3, startTime: '12:10', endTime: '13:10' },
  { slotIndex: 4, startTime: '14:00', endTime: '15:00' },
  { slotIndex: 5, startTime: '15:00', endTime: '16:00' },
  { slotIndex: 6, startTime: '16:00', endTime: '17:00' },
];

export class TimeSlotManager {
  private allowOptionalSlot: boolean;
  private optionalSlotDays: Day[];

  constructor(allowOptionalSlot = false, optionalSlotDays: Day[] = []) {
    this.allowOptionalSlot = allowOptionalSlot;
    this.optionalSlotDays = optionalSlotDays;
  }

  getValidSlots(day: Day): TimeSlot[] {
    const maxSlot =
      this.allowOptionalSlot && this.optionalSlotDays.includes(day) ? 7 : 6;
    return SLOT_DEFINITIONS
      .filter((s) => s.slotIndex < maxSlot)
      .map((s) => ({ ...s, day }));
  }

  getAllValidSlots(): TimeSlot[] {
    return DAYS.flatMap((day) => this.getValidSlots(day));
  }

  getSlotCount(day: Day): number {
    return this.getValidSlots(day).length;
  }

  isValidSlot(day: Day, slotIndex: number): boolean {
    return this.getValidSlots(day).some((s) => s.slotIndex === slotIndex);
  }

  getSlotLabel(slotIndex: number): string {
    const slot = SLOT_DEFINITIONS.find((s) => s.slotIndex === slotIndex);
    return slot ? `${slot.startTime}-${slot.endTime}` : '';
  }

  areSlotsConsecutive(slotIndex1: number, slotIndex2: number): boolean {
    // Slots 3→4 cross lunch break, NOT consecutive
    if (
      (slotIndex1 === 3 && slotIndex2 === 4) ||
      (slotIndex1 === 4 && slotIndex2 === 3)
    ) {
      return false;
    }
    return Math.abs(slotIndex1 - slotIndex2) === 1;
  }
}
