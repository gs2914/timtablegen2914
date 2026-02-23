import { ClassSession, Section, Subject, Faculty, Day } from '@/types/timetable';
import { DAYS, SLOT_DEFINITIONS } from '@/core/timeSlotManager';

interface ExportDeps {
  sessions: ClassSession[];
  sections: Section[];
  subjects: Subject[];
  faculty: Faculty[];
}

function getCellLabel(
  sessions: ClassSession[],
  sectionId: string,
  day: Day,
  slotIndex: number,
  subjects: Subject[],
  faculty: Faculty[]
): string {
  const session = sessions.find(
    (s) => s.sectionId === sectionId && s.day === day && s.slotIndex === slotIndex
  );
  if (!session) return '';
  const subj = subjects.find((s) => s.code === session.subjectCode);
  const fac = faculty.find((f) => f.id === session.facultyId);
  return `${subj?.code || session.subjectCode}\n${fac?.shortName || session.facultyId}`;
}

export function exportToCSV({ sessions, sections, subjects, faculty }: ExportDeps): string {
  const lines: string[] = [];
  const slotHeaders = SLOT_DEFINITIONS.slice(0, 6).map(
    (s) => `${s.startTime}-${s.endTime}`
  );

  for (const section of sections) {
    lines.push(`\nYear ${section.yearNumber} - Section ${section.name}`);
    lines.push(['Day', ...slotHeaders].join(','));

    for (const day of DAYS) {
      const cells = SLOT_DEFINITIONS.slice(0, 6).map((slot) => {
        const label = getCellLabel(
          sessions, section.id, day, slot.slotIndex, subjects, faculty
        );
        return `"${label.replace('\n', ' / ')}"`;
      });
      lines.push([day, ...cells].join(','));
    }
  }

  return lines.join('\n');
}

export function exportToHTML({ sessions, sections, subjects, faculty }: ExportDeps): string {
  const slotHeaders = SLOT_DEFINITIONS.slice(0, 6).map(
    (s) => `${s.startTime}-${s.endTime}`
  );

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>CSE Timetable</title>
  <style>
    body{font-family:system-ui,sans-serif;padding:20px}
    table{border-collapse:collapse;width:100%;margin-bottom:30px}
    th,td{border:1px solid #333;padding:8px 6px;text-align:center;font-size:13px}
    th{background:#1a365d;color:#fff}
    h2{margin-top:30px;color:#1a365d}
    .sub{font-weight:bold}.fac{font-size:11px;color:#555}
    @media print{body{padding:0}h2{page-break-before:always}}
  </style></head><body><h1>CSE Timetable</h1>`;

  for (const section of sections) {
    html += `<h2>Year ${section.yearNumber} - Section ${section.name}</h2>`;
    html += `<table><tr><th>Day</th>${slotHeaders.map((h) => `<th>${h}</th>`).join('')}</tr>`;

    for (const day of DAYS) {
      html += `<tr><td><strong>${day}</strong></td>`;
      for (const slot of SLOT_DEFINITIONS.slice(0, 6)) {
        const session = sessions.find(
          (s) =>
            s.sectionId === section.id &&
            s.day === day &&
            s.slotIndex === slot.slotIndex
        );
        if (session) {
          const subj = subjects.find((s) => s.code === session.subjectCode);
          const fac = faculty.find((f) => f.id === session.facultyId);
          html += `<td><span class="sub">${subj?.code || session.subjectCode}</span><br><span class="fac">${fac?.shortName || session.facultyId}</span></td>`;
        } else {
          html += `<td>-</td>`;
        }
      }
      html += `</tr>`;
    }
    html += `</table>`;
  }

  html += `</body></html>`;
  return html;
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function printTimetable(deps: ExportDeps) {
  const html = exportToHTML(deps);
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    win.print();
  }
}
