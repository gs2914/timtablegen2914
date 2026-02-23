import React from 'react';
import { ClassSession, Section, Subject, Faculty, Day } from '@/types/timetable';
import { DAYS, SLOT_DEFINITIONS } from '@/core/timeSlotManager';
import { cn } from '@/lib/utils';

interface Props {
  sessions: ClassSession[];
  section: Section;
  subjects: Subject[];
  faculty: Faculty[];
}

const slotColors = [
  'bg-primary/10 text-primary',
  'bg-accent/15 text-accent-foreground',
  'bg-destructive/10 text-destructive',
  'bg-secondary text-secondary-foreground',
  'bg-muted text-foreground',
];

export default function TimetableGrid({ sessions, section, subjects, faculty }: Props) {
  const sectionSessions = sessions.filter((s) => s.sectionId === section.id);
  const slots = SLOT_DEFINITIONS.slice(0, 6);

  const getSession = (day: Day, slotIndex: number) =>
    sectionSessions.find((s) => s.day === day && s.slotIndex === slotIndex);

  const getColorClass = (subjectCode: string) => {
    const idx = subjects.findIndex((s) => s.code === subjectCode);
    return slotColors[idx % slotColors.length];
  };

  return (
    <div className="overflow-x-auto animate-fade-in">
      <table className="w-full text-xs border-collapse min-w-[600px]">
        <thead>
          <tr>
            <th className="p-2 border bg-primary text-primary-foreground font-semibold text-left">Day</th>
            {slots.map((s) => (
              <th key={s.slotIndex} className="p-2 border bg-primary text-primary-foreground font-semibold text-center">
                {s.startTime}
                <br />
                {s.endTime}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day) => (
            <tr key={day}>
              <td className="p-2 border font-semibold bg-muted">{day.slice(0, 3)}</td>
              {slots.map((slot) => {
                const session = getSession(day, slot.slotIndex);
                if (!session)
                  return (
                    <td key={slot.slotIndex} className="p-2 border text-center text-muted-foreground">
                      —
                    </td>
                  );
                const subj = subjects.find((s) => s.code === session.subjectCode);
                const fac = faculty.find((f) => f.id === session.facultyId);
                return (
                  <td
                    key={slot.slotIndex}
                    className={cn('p-2 border text-center rounded-sm', getColorClass(session.subjectCode))}
                  >
                    <div className="font-bold">{subj?.code || session.subjectCode}</div>
                    <div className="text-[10px] opacity-75">{fac?.shortName || session.facultyId}</div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
