import React, { useState } from 'react';
import { ClassSession, Section, Subject, Faculty, Day, FacultySectionMapping } from '@/types/timetable';
import { DAYS, SLOT_DEFINITIONS } from '@/core/timeSlotManager';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { TimeSlotManager } from '@/core/timeSlotManager';
import { ConstraintEngine } from '@/core/constraintEngine';
import { Pencil } from 'lucide-react';

interface Props {
  sessions: ClassSession[];
  section: Section;
  subjects: Subject[];
  faculty: Faculty[];
  facultyMappings?: FacultySectionMapping[];
  onEditSession?: (original: ClassSession, updated: ClassSession) => void;
  editable?: boolean;
}

const slotColors = [
  'bg-primary/10 text-primary',
  'bg-accent/15 text-accent-foreground',
  'bg-destructive/10 text-destructive',
  'bg-secondary text-secondary-foreground',
  'bg-muted text-foreground',
];

export default function TimetableGrid({
  sessions, section, subjects, faculty,
  facultyMappings = [], onEditSession, editable = false
}: Props) {
  const sectionSessions = sessions.filter((s) => s.sectionId === section.id);
  const slots = SLOT_DEFINITIONS.slice(0, 6);

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ClassSession | null>(null);
  const [editSubjectCode, setEditSubjectCode] = useState('');
  const [editFacultyId, setEditFacultyId] = useState('');

  const getSession = (day: Day, slotIndex: number) =>
    sectionSessions.find((s) => s.day === day && s.slotIndex === slotIndex);

  const getColorClass = (subjectCode: string) => {
    const idx = subjects.findIndex((s) => s.code === subjectCode);
    return slotColors[idx % slotColors.length];
  };

  const openEdit = (session: ClassSession) => {
    if (!editable || session.isFixed) return;
    setEditTarget(session);
    setEditSubjectCode(session.subjectCode);
    setEditFacultyId(session.facultyId);
    setEditOpen(true);
  };

  const handleSave = () => {
    if (!editTarget || !onEditSession) return;

    const updated: ClassSession = {
      ...editTarget,
      subjectCode: editSubjectCode,
      facultyId: editFacultyId,
    };

    // Validate with constraint engine
    const tsm = new TimeSlotManager();
    const ce = new ConstraintEngine(tsm, subjects, facultyMappings);
    const errors = ce.validateEdit(sessions, updated, editTarget);

    if (errors.length > 0) {
      toast({
        title: 'Edit rejected — constraint violation',
        description: errors.slice(0, 3).join('; '),
        variant: 'destructive',
      });
      return;
    }

    onEditSession(editTarget, updated);
    setEditOpen(false);
    toast({ title: 'Cell updated successfully' });
  };

  return (
    <>
      <div className="overflow-x-auto animate-fade-in">
        <table className="w-full text-xs border-collapse min-w-[600px]">
          <thead>
            <tr>
              <th className="p-2 border bg-primary text-primary-foreground font-semibold text-left">Day</th>
              {slots.map((s) => (
                <th key={s.slotIndex} className="p-2 border bg-primary text-primary-foreground font-semibold text-center">
                  {s.startTime}<br />{s.endTime}
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
                      <td key={slot.slotIndex} className="p-2 border text-center text-muted-foreground">—</td>
                    );
                  const subj = subjects.find((s) => s.code === session.subjectCode);
                  const fac = faculty.find((f) => f.id === session.facultyId);
                  return (
                    <td
                      key={slot.slotIndex}
                      className={cn(
                        'p-2 border text-center rounded-sm relative group',
                        getColorClass(session.subjectCode),
                        editable && !session.isFixed && 'cursor-pointer hover:ring-2 hover:ring-primary/50'
                      )}
                      onClick={() => openEdit(session)}
                    >
                      <div className="font-bold">{subj?.code || session.subjectCode}</div>
                      <div className="text-[10px] opacity-75">{fac?.shortName || session.facultyId}</div>
                      {editable && !session.isFixed && (
                        <Pencil className="h-2.5 w-2.5 absolute top-1 right-1 opacity-0 group-hover:opacity-60 text-foreground" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">Edit Cell</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {editTarget.day} — Slot {editTarget.slotIndex} — Section {section.name}
              </p>
              <div>
                <Label className="text-xs">Subject</Label>
                <Select value={editSubjectCode} onValueChange={setEditSubjectCode}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {subjects.filter(s => s.yearNumber === section.yearNumber).map(s => (
                      <SelectItem key={s.code} value={s.code}>{s.code} — {s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Faculty</Label>
                <Select value={editFacultyId} onValueChange={setEditFacultyId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {faculty.map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.shortName} ({f.id})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
