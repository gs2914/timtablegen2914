import React from 'react';
import { useTimetable } from '@/contexts/TimetableContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileSpreadsheet, Printer, RotateCcw } from 'lucide-react';
import { exportToCSV, downloadFile, printTimetable } from '@/utils/exportUtils';
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
    toast({ title: 'CSV exported' });
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
          <CardTitle className="text-sm">Export Timetable</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!hasTable && (
            <p className="text-xs text-muted-foreground">Generate a timetable first to enable exports.</p>
          )}
          <Button onClick={handleCSV} disabled={!hasTable} className="w-full" variant="outline">
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Export as CSV
          </Button>
          <Button onClick={handlePrint} disabled={!hasTable} className="w-full" variant="outline">
            <Printer className="h-4 w-4 mr-2" /> Print / Save as PDF
          </Button>
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
