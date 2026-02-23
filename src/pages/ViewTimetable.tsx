import React, { useState } from 'react';
import { useTimetable } from '@/contexts/TimetableContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import TimetableGrid from '@/components/timetable/TimetableGrid';

export default function ViewTimetable() {
  const { data } = useTimetable();
  const [selectedSection, setSelectedSection] = useState<string>('');

  const years = [...new Set(data.sections.map((s) => s.yearNumber))].sort();

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
            />
          </div>
        ))}
      </div>
    </div>
  );
}
