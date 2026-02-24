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
  yearNumber: number;
  day: Day;
  slotIndex: number;
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
  facultySectionMappings: FacultySectionMapping[];
  generatedTimetable: ClassSession[] | null;
}

export const INITIAL_DATA: TimetableData = {
  faculty: [],
  subjects: [],
  sections: [],
  fixedClasses: [],
  careerPathClasses: [],
  facultySectionMappings: [],
  generatedTimetable: null,
};
