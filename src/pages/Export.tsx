import React from 'react';
import { useTimetable } from '@/contexts/TimetableContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileSpreadsheet, Printer, RotateCcw, Users, FileText } from 'lucide-react';
import { exportToCSV, downloadFile, printTimetable } from '@/utils/exportUtils';
import { exportFacultyToCSV } from '@/utils/facultyExportUtils';
import { exportFacultyTimetablePdf } from '@/utils/facultyPdfExport';
import { toast } from '@/hooks/use-toast';

export default function ExportPage() {
  const { data, dispatch } = useTimetable();

  const hasTable = !!data.generatedTimetable;

  const handleCSV = () => {
    if (!data.generatedTimetable) return;
    const csv = exportToCSV({
      sessions: data.generatedTimetable,
      sections: data.sections,
      subjects: data.subjects,
      faculty: data.faculty,
    });
    downloadFile(csv, 'timetable.csv', 'text/csv');
    toast({ title: 'Section timetable CSV exported' });
  };

  const handleFacultyCSV = () => {
    if (!data.generatedTimetable) return;
    const csv = exportFacultyToCSV({
      sessions: data.generatedTimetable,
      faculty: data.faculty,
      subjects: data.subjects,
      sections: data.sections,
    });
    downloadFile(csv, 'faculty-timetable.csv', 'text/csv');
    toast({ title: 'Faculty timetable CSV exported' });
  };

  const handleFacultyPdf = () => {
    if (!data.generatedTimetable) return;
    exportFacultyTimetablePdf({
      sessions: data.generatedTimetable,
      faculty: data.faculty,
      subjects: data.subjects,
      sections: data.sections,
    });
    toast({ title: 'Faculty timetable PDF opened for print' });
  };

  const handlePrint = () => {
    if (!data.generatedTimetable) return;
    printTimetable({
      sessions: data.generatedTimetable,
      sections: data.sections,
      subjects: data.subjects,
      faculty: data.faculty,
    });
  };

  const handleReset = () => {
    dispatch({ type: 'RESET' });
    toast({ title: 'All data cleared' });
  };

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <h1 className="text-xl font-bold">Export & Tools</h1>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Export Section Timetable</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!hasTable && (
            <p className="text-xs text-muted-foreground">Generate a timetable first to enable exports.</p>
          )}
          <Button onClick={handleCSV} disabled={!hasTable} className="w-full" variant="outline">
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Export Sections as CSV
          </Button>
          <Button onClick={handlePrint} disabled={!hasTable} className="w-full" variant="outline">
            <Printer className="h-4 w-4 mr-2" /> Print / Save as PDF
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Export Faculty Timetable</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!hasTable && (
            <p className="text-xs text-muted-foreground">Generate a timetable first to enable exports.</p>
          )}
          <Button onClick={handleFacultyCSV} disabled={!hasTable} className="w-full" variant="outline">
            <Users className="h-4 w-4 mr-2" /> Export Faculty Timetables as CSV
          </Button>
          <Button onClick={handleFacultyPdf} disabled={!hasTable} className="w-full" variant="outline">
            <FileText className="h-4 w-4 mr-2" /> Print / Save Faculty PDF
          </Button>
          <p className="text-[10px] text-muted-foreground">
            Includes: Day, Time Slot, Subject Code, Section, LAB/THEORY indication, Lunch break.
          </p>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={handleReset} className="w-full">
            <RotateCcw className="h-4 w-4 mr-2" /> Reset All Data
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
