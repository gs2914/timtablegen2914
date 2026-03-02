export enum Day {
  MONDAY = 'Monday',
  TUESDAY = 'Tuesday',
  WEDNESDAY = 'Wednesday',
  THURSDAY = 'Thursday',
  FRIDAY = 'Friday',
}

export enum SubjectType {
  THEORY = 'Theory',
  LAB = 'Lab',
  INTEGRATED = 'Integrated',
}

export interface Faculty {
  id: string;
  shortName: string;
}

export interface Subject {
  code: string;
  name: string;
  facultyId: string;
  eligibleFacultyIds: string[];
  weeklyHours: number;
  subjectType: SubjectType;
  labHours: number;
  yearNumber: number;
  labRoomId?: string; // Which lab room this subject requires
}

export interface Section {
  id: string;
  yearNumber: number;
  name: string;
}

export interface TimeSlot {
  day: Day;
  slotIndex: number;
  startTime: string;
  endTime: string;
}

export interface ClassSession {
  sectionId: string;
  yearNumber: number;
  subjectCode: string;
  facultyId: string;
  secondFacultyId?: string;
  day: Day;
  slotIndex: number;
  isFixed: boolean;
  isCareerPath: boolean;
  labRoomId?: string; // Assigned lab room for this session
  careerPathSlotType?: 'theory' | 'lab'; // Preserves the user-selected type for career path display
}

export interface FixedClass {
  subjectCode: string;
  facultyId: string;
  yearNumber: number;
  sectionId: string;
  day: Day;
  slotIndex: number;
}

export interface CareerPathClass {
  subjectCode: string;
  facultyId: string;
  yearNumber: number; // Must be 3 or 4
  day: Day;
  slotIndex: number;
  slotType: 'theory' | 'lab'; // Whether this is a theory or lab career path session
}

export interface LabRoom {
  id: string;
  name: string;
  capacity: number;
  subjectCodes: string[]; // Subjects that can be conducted in this lab
}

/** Fixed lab-to-section mapping for a semester (decided before generation) */
export interface LabRoomMapping {
  subjectCode: string;
  sectionId: string;
  labRoomId: string;
  yearNumber: number;
}

export interface FacultySectionMapping {
  subjectCode: string;
  sectionId: string;
  facultyId: string;
  yearNumber: number;
}

export interface TimetableData {
  faculty: Faculty[];
  subjects: Subject[];
  sections: Section[];
  fixedClasses: FixedClass[];
  careerPathClasses: CareerPathClass[];
  labRooms: LabRoom[];
  labRoomMappings: LabRoomMapping[];
  facultySectionMappings: FacultySectionMapping[];
  generatedTimetable: ClassSession[] | null;
}

export const INITIAL_DATA: TimetableData = {
  faculty: [],
  subjects: [],
  sections: [],
  fixedClasses: [],
  careerPathClasses: [],
  labRooms: [],
  labRoomMappings: [],
  facultySectionMappings: [],
  generatedTimetable: null,
};
