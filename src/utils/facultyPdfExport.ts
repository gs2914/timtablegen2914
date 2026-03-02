import { ClassSession, Faculty, Subject, SubjectType, Day } from '@/types/timetable';
import { DAYS, SLOT_DEFINITIONS } from '@/core/timeSlotManager';

interface FacultyPdfDeps {
  sessions: ClassSession[];
  faculty: Faculty[];
  subjects: Subject[];
  sections: { id: string; yearNumber: number; name: string }[];
}

export function exportFacultyTimetablePdf({ sessions, faculty, subjects, sections }: FacultyPdfDeps) {
  const slotHeaders = SLOT_DEFINITIONS.slice(0, 6).map(
    (s) => `${s.startTime}-${s.endTime}`
  );

  // Insert lunch column after slot 3 (index 3)
  const displayHeaders = [
    ...slotHeaders.slice(0, 4),
    '13:10-14:00',
    ...slotHeaders.slice(4),
  ];

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Faculty Timetables</title>
  <style>
    @page { size: landscape; margin: 12mm; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; padding: 10px; color: #1a1a1a; }
    h1 { font-size: 18px; text-align: center; margin-bottom: 4px; }
    h2 { font-size: 14px; margin: 20px 0 6px; color: #1a365d; page-break-before: always; }
    h2:first-of-type { page-break-before: avoid; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 10px; }
    th, td { border: 1px solid #444; padding: 5px 4px; text-align: center; font-size: 11px; }
    th { background: #1a365d; color: #fff; font-weight: 600; }
    .lunch { background: #fef3c7; font-weight: 600; font-size: 10px; color: #92400e; }
    .lab { background: #dbeafe; }
    .theory { background: #f0fdf4; }
    .cp { background: #fce7f3; }
    .sub { font-weight: bold; }
    .sec { font-size: 9px; color: #555; }
    .type { font-size: 9px; color: #777; font-style: italic; }
    .free { color: #aaa; }
    @media print { body { padding: 0; } }
  </style></head><body>
  <h1>Faculty Timetables</h1>`;

  for (const fac of faculty) {
    const facSessions = sessions.filter(s => s.facultyId === fac.id || s.secondFacultyId === fac.id);
    if (facSessions.length === 0) continue;

    html += `<h2>${fac.shortName} (${fac.id})</h2>`;
    html += `<table><tr><th>Day</th>${displayHeaders.map(h =>
      h === '13:10-14:00' ? `<th class="lunch">LUNCH<br>${h}</th>` : `<th>${h}</th>`
    ).join('')}</tr>`;

    for (const day of DAYS) {
      html += `<tr><td><strong>${day.slice(0, 3)}</strong></td>`;

      for (let si = 0; si < 6; si++) {
        // Insert lunch column after slot index 3
        if (si === 4) {
          html += `<td class="lunch">LUNCH</td>`;
        }

        const slot = SLOT_DEFINITIONS[si];
        const session = facSessions.find(s => s.day === day && s.slotIndex === slot.slotIndex);
        if (!session) {
          html += `<td class="free">—</td>`;
          continue;
        }

        const subj = subjects.find(s => s.code === session.subjectCode);
        const section = sections.find(s => s.id === session.sectionId);

        let type: string;
        let cellClass: string;
        if (session.isCareerPath) {
          type = session.careerPathSlotType === 'lab' ? 'CP-LAB' : 'CP-THEORY';
          cellClass = 'cp';
        } else if (subj?.subjectType === SubjectType.LAB) {
          type = 'LAB';
          cellClass = 'lab';
        } else if (subj?.subjectType === SubjectType.INTEGRATED) {
          // Check if this is part of a 2-hour block (lab portion)
          const sameSubjSameDay = facSessions.filter(
            s => s.day === day && s.subjectCode === session.subjectCode && s.sectionId === session.sectionId
          );
          const slots = sameSubjSameDay.map(s => s.slotIndex).sort((a, b) => a - b);
          const isLabPortion = slots.length >= 2 && (
            (session.slotIndex === slots[0] && Math.abs(slots[1] - slots[0]) === 1) ||
            (session.slotIndex === slots[1] && Math.abs(slots[1] - slots[0]) === 1)
          );
          type = isLabPortion ? 'INT-LAB' : 'INT-THEORY';
          cellClass = isLabPortion ? 'lab' : 'theory';
        } else {
          type = 'THEORY';
          cellClass = 'theory';
        }

        html += `<td class="${cellClass}">
          <span class="sub">${session.subjectCode}</span><br>
          <span class="sec">Y${session.yearNumber}-${section?.name || session.sectionId}</span><br>
          <span class="type">${type}</span>
        </td>`;
      }
      html += `</tr>`;
    }
    html += `</table>`;
  }

  html += `</body></html>`;

  // Open in new window for print/save as PDF
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    win.print();
  }
}
