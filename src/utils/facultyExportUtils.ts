import { ClassSession, Faculty, Subject, Day, SubjectType } from '@/types/timetable';
import { DAYS, SLOT_DEFINITIONS } from '@/core/timeSlotManager';

interface FacultyExportDeps {
  sessions: ClassSession[];
  faculty: Faculty[];
  subjects: Subject[];
  sections: { id: string; yearNumber: number; name: string }[];
}

export function exportFacultyToCSV({ sessions, faculty, subjects, sections }: FacultyExportDeps): string {
  const lines: string[] = [];
  const slotHeaders = SLOT_DEFINITIONS.slice(0, 6).map(
    (s) => `${s.startTime}-${s.endTime}`
  );

  for (const fac of faculty) {
    const facSessions = sessions.filter(s => s.facultyId === fac.id || s.secondFacultyId === fac.id);
    if (facSessions.length === 0) continue;

    lines.push('');
    lines.push(`Faculty: ${fac.shortName} (${fac.id})`);
    lines.push(['Day', ...slotHeaders].join(','));

    for (const day of DAYS) {
      const cells = SLOT_DEFINITIONS.slice(0, 6).map((slot) => {
        const session = facSessions.find(s => s.day === day && s.slotIndex === slot.slotIndex);
        if (!session) return '""';
        const subj = subjects.find(s => s.code === session.subjectCode);
        const section = sections.find(s => s.id === session.sectionId);
        const type = session.isCareerPath
          ? (session.careerPathSlotType === 'lab' ? 'CP-LAB' : 'CP-THEORY')
          : subj?.subjectType === SubjectType.LAB ? 'LAB'
          : subj?.subjectType === SubjectType.INTEGRATED ? 'INT'
          : 'THEORY';
        return `"${session.subjectCode} / Y${session.yearNumber}-${section?.name || session.sectionId} / ${type}"`;
      });
      lines.push([day, ...cells].join(','));
    }
  }

  return lines.join('\n');
}
