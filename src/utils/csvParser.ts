import {
  Faculty,
  Subject,
  Section,
  FixedClass,
  CareerPathClass,
  Day,
  SubjectType,
} from '@/types/timetable';

function parseCSVRows(text: string): string[][] {
  return text
    .trim()
    .split('\n')
    .map((line) => line.split(',').map((cell) => cell.trim()));
}

function parseDay(val: string): Day {
  const map: Record<string, Day> = {
    monday: Day.MONDAY, mon: Day.MONDAY,
    tuesday: Day.TUESDAY, tue: Day.TUESDAY,
    wednesday: Day.WEDNESDAY, wed: Day.WEDNESDAY,
    thursday: Day.THURSDAY, thu: Day.THURSDAY,
    friday: Day.FRIDAY, fri: Day.FRIDAY,
  };
  return map[val.toLowerCase()] ?? Day.MONDAY;
}

function parseSubjectType(val: string): SubjectType {
  const lower = val.toLowerCase();
  if (lower === 'lab') return SubjectType.LAB;
  if (lower === 'integrated') return SubjectType.INTEGRATED;
  return SubjectType.THEORY;
}

export function parseFacultyCSV(text: string): Faculty[] {
  const rows = parseCSVRows(text);
  const start = rows[0]?.[0]?.toLowerCase() === 'id' ? 1 : 0;
  return rows.slice(start).filter(r => r.length >= 2).map((r) => ({
    id: r[0],
    shortName: r[1],
  }));
}

export function parseSubjectCSV(text: string): Subject[] {
  const rows = parseCSVRows(text);
  const start = rows[0]?.[0]?.toLowerCase() === 'code' ? 1 : 0;
  return rows.slice(start).filter(r => r.length >= 6).map((r) => {
    const primaryFaculty = r[2];
    // Column 7 (index 7) can hold semicolon-separated eligible faculty IDs
    const extraFaculty = r[7] ? r[7].split(';').map(f => f.trim()).filter(Boolean) : [];
    const eligibleFacultyIds = [...new Set([primaryFaculty, ...extraFaculty])];
    return {
      code: r[0],
      name: r[1],
      facultyId: primaryFaculty,
      eligibleFacultyIds,
      weeklyHours: parseInt(r[3], 10) || 0,
      subjectType: parseSubjectType(r[4]),
      labHours: parseInt(r[5], 10) || 0,
      yearNumber: parseInt(r[6], 10) || 1,
    };
  });
}

export function parseSectionCSV(text: string): Section[] {
  const rows = parseCSVRows(text);
  const start = rows[0]?.[0]?.toLowerCase() === 'id' ? 1 : 0;
  return rows.slice(start).filter(r => r.length >= 3).map((r) => ({
    id: r[0],
    yearNumber: parseInt(r[1], 10) || 1,
    name: r[2],
  }));
}

export function parseFixedClassCSV(text: string): FixedClass[] {
  const rows = parseCSVRows(text);
  const start = rows[0]?.[0]?.toLowerCase().includes('subject') ? 1 : 0;
  return rows.slice(start).filter(r => r.length >= 6).map((r) => ({
    subjectCode: r[0],
    facultyId: r[1],
    yearNumber: parseInt(r[2], 10) || 1,
    sectionId: r[3],
    day: parseDay(r[4]),
    slotIndex: parseInt(r[5], 10) || 0,
  }));
}

export function parseCareerPathCSV(text: string): CareerPathClass[] {
  const rows = parseCSVRows(text);
  const start = rows[0]?.[0]?.toLowerCase().includes('subject') ? 1 : 0;
  return rows.slice(start).filter(r => r.length >= 5).map((r) => ({
    subjectCode: r[0],
    facultyId: r[1],
    yearNumber: parseInt(r[2], 10) || 3,
    day: parseDay(r[3]),
    slotIndex: parseInt(r[4], 10) || 0,
    slotType: (r[5]?.toLowerCase() === 'lab' ? 'lab' : 'theory') as 'theory' | 'lab',
  }));
}
