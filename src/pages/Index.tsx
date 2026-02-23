import React from 'react';
import { useTimetable } from '@/contexts/TimetableContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, BookOpen, Layers, Pin, Route, CheckCircle } from 'lucide-react';

const statCards = [
  { key: 'faculty', label: 'Faculty', icon: Users, color: 'text-primary' },
  { key: 'subjects', label: 'Subjects', icon: BookOpen, color: 'text-accent' },
  { key: 'sections', label: 'Sections', icon: Layers, color: 'text-destructive' },
  { key: 'fixedClasses', label: 'Fixed Classes', icon: Pin, color: 'text-muted-foreground' },
  { key: 'careerPathClasses', label: 'Career Path', icon: Route, color: 'text-primary' },
] as const;

export default function Dashboard() {
  const { data } = useTimetable();

  const counts: Record<string, number> = {
    faculty: data.faculty.length,
    subjects: data.subjects.length,
    sections: data.sections.length,
    fixedClasses: data.fixedClasses.length,
    careerPathClasses: data.careerPathClasses.length,
  };

  return (
    <div className="p-4 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Smart CSE Timetable Generator — Overview
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {statCards.map(({ key, label, icon: Icon, color }) => (
          <Card key={key} className="shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`${color}`}>
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-2xl font-bold">{counts[key]}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}

        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className={data.generatedTimetable ? 'text-primary' : 'text-muted-foreground'}>
              <CheckCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {data.generatedTimetable ? '✓' : '—'}
              </p>
              <p className="text-xs text-muted-foreground">Timetable</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Quick Guide</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
          <p><strong>1.</strong> Go to <strong>Input</strong> to add faculty, subjects, sections, and constraints.</p>
          <p><strong>2.</strong> Optionally upload CSV files for bulk input.</p>
          <p><strong>3.</strong> Go to <strong>Generate</strong> to create the timetable using AI optimization.</p>
          <p><strong>4.</strong> View the generated timetable in the <strong>View</strong> tab.</p>
          <p><strong>5.</strong> Export to CSV or PDF from the <strong>Export</strong> tab.</p>
        </CardContent>
      </Card>
    </div>
  );
}
