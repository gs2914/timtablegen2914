import React, { useState } from 'react';
import { useTimetable } from '@/contexts/TimetableContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ClassSession, Day, SubjectType } from '@/types/timetable';
import { DAYS, SLOT_DEFINITIONS } from '@/core/timeSlotManager';
import { cn } from '@/lib/utils';

const DISPLAY_SLOTS = [
  ...SLOT_DEFINITIONS.slice(0, 4),
  { slotIndex: -1, startTime: '13:10', endTime: '14:00' }, // Lunch
  ...SLOT_DEFINITIONS.slice(4, 6),
];

export default function FacultyTimetable() {
  const { data } = useTimetable();
  const [selectedFaculty, setSelectedFaculty] = useState<string>('');

  if (!data.generatedTimetable) {
    return (
      <div className="p-4 animate-fade-in">
        <h1 className="text-xl font-bold">Faculty Timetable</h1>
        <p className="text-sm text-muted-foreground mt-4">No timetable generated yet. Go to Generate tab first.</p>
      </div>
    );
  }

  const facultyList = selectedFaculty && selectedFaculty !== 'all'
    ? data.faculty.filter(f => f.id === selectedFaculty)
    : data.faculty;

  const getSession = (facultyId: string, day: Day, slotIndex: number): ClassSession | undefined =>
    data.generatedTimetable!.find(s =>
      (s.facultyId === facultyId || s.secondFacultyId === facultyId) &&
      s.day === day && s.slotIndex === slotIndex
    );

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <h1 className="text-xl font-bold">Faculty Timetable</h1>

      <div>
        <Label className="text-xs">Filter by Faculty</Label>
        <Select value={selectedFaculty} onValueChange={setSelectedFaculty}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="All Faculty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Faculty</SelectItem>
            {data.faculty.map(f => (
              <SelectItem key={f.id} value={f.id}>{f.shortName} ({f.id})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-6">
        {facultyList.map(fac => {
          const facSessions = data.generatedTimetable!.filter(
            s => s.facultyId === fac.id || s.secondFacultyId === fac.id
          );
          if (facSessions.length === 0 && selectedFaculty === 'all') return null;

          const totalHours = facSessions.length;
          const uniqueSubjects = [...new Set(facSessions.map(s => s.subjectCode))];
          const uniqueSections = [...new Set(facSessions.map(s => s.sectionId))];

          return (
            <div key={fac.id}>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-sm font-bold">{fac.shortName} ({fac.id})</h2>
                <Badge variant="secondary" className="text-[10px]">{totalHours} hrs/wk</Badge>
                <Badge variant="outline" className="text-[10px]">{uniqueSections.length} sections</Badge>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse min-w-[600px]">
                  <thead>
                    <tr>
                      <th className="p-2 border bg-primary text-primary-foreground font-semibold text-left">Day</th>
                      {DISPLAY_SLOTS.map((s, i) => (
                        <th
                          key={i}
                          className={cn(
                            'p-2 border font-semibold text-center',
                            s.slotIndex === -1
                              ? 'bg-accent text-accent-foreground'
                              : 'bg-primary text-primary-foreground'
                          )}
                        >
                          {s.startTime}<br />{s.endTime}
                          {s.slotIndex === -1 && <><br /><span className="text-[9px]">LUNCH</span></>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DAYS.map(day => (
                      <tr key={day}>
                        <td className="p-2 border font-semibold bg-muted">{day.slice(0, 3)}</td>
                        {DISPLAY_SLOTS.map((slot, i) => {
                          if (slot.slotIndex === -1) {
                            return (
                              <td key={i} className="p-2 border text-center bg-accent/20 text-accent-foreground">
                                <div className="font-semibold text-[10px]">LUNCH</div>
                              </td>
                            );
                          }
                          const session = getSession(fac.id, day, slot.slotIndex);
                          if (!session) {
                            return <td key={i} className="p-2 border text-center text-muted-foreground">—</td>;
                          }
                          const subj = data.subjects.find(s => s.code === session.subjectCode);
                          const section = data.sections.find(s => s.id === session.sectionId);
                          const isLab = subj && (subj.subjectType === SubjectType.LAB || subj.subjectType === SubjectType.INTEGRATED);
                          const isSecondFac = session.secondFacultyId === fac.id;

                          return (
                            <td
                              key={i}
                              className={cn(
                                'p-2 border text-center rounded-sm',
                                isLab ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
                              )}
                            >
                              <div className="font-bold">{session.subjectCode}</div>
                              <div className="text-[10px] opacity-75">
                                Y{session.yearNumber}-{section?.name || session.sectionId}
                              </div>
                              {isLab && <Badge variant="outline" className="text-[8px] mt-0.5">LAB</Badge>}
                              {isSecondFac && <Badge variant="secondary" className="text-[8px] mt-0.5">2nd</Badge>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
