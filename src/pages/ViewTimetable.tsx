import React, { useState } from 'react';
import { useTimetable } from '@/contexts/TimetableContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import TimetableGrid from '@/components/timetable/TimetableGrid';
import { ClassSession } from '@/types/timetable';

export default function ViewTimetable() {
  const { data, dispatch } = useTimetable();
  const [selectedSection, setSelectedSection] = useState<string>('');

  if (!data.generatedTimetable) {
    return (
      <div className="p-4 animate-fade-in">
        <h1 className="text-xl font-bold">View Timetable</h1>
        <p className="text-sm text-muted-foreground mt-4">No timetable generated yet. Go to Generate tab first.</p>
      </div>
    );
  }

  const filteredSections = selectedSection && selectedSection !== 'all'
    ? data.sections.filter((s) => s.id === selectedSection)
    : data.sections;

  const handleEditSession = (original: ClassSession, updated: ClassSession) => {
    const newTimetable = data.generatedTimetable!.map(s => {
      if (
        s.sectionId === original.sectionId &&
        s.day === original.day &&
        s.slotIndex === original.slotIndex &&
        s.subjectCode === original.subjectCode &&
        s.facultyId === original.facultyId
      ) {
        return { ...updated };
      }
      return s;
    });
    dispatch({ type: 'SET_TIMETABLE', payload: newTimetable });
  };

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">View Timetable</h1>
      </div>

      <div>
        <Label className="text-xs">Filter by Section</Label>
        <Select value={selectedSection} onValueChange={setSelectedSection}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="All Sections" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sections</SelectItem>
            {data.sections.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                Year {s.yearNumber} - Section {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-[10px] text-muted-foreground">Click any cell to edit subject or faculty. Fixed cells cannot be edited.</p>

      <div className="space-y-6">
        {filteredSections.map((section) => (
          <div key={section.id}>
            <h2 className="text-sm font-bold mb-2">
              Year {section.yearNumber} — Section {section.name}
            </h2>
            <TimetableGrid
              sessions={data.generatedTimetable!}
              section={section}
              subjects={data.subjects}
              faculty={data.faculty}
              facultyMappings={data.facultySectionMappings}
              onEditSession={handleEditSession}
              editable
            />
          </div>
        ))}
      </div>
    </div>
  );
}
