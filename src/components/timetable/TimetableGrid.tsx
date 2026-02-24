import React, { useState } from 'react';
import { ClassSession, Section, Subject, Faculty, Day, SubjectType, FacultySectionMapping } from '@/types/timetable';
import { DAYS, SLOT_DEFINITIONS } from '@/core/timeSlotManager';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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

  // Build display slots with lunch break inserted after slot 3
  const displaySlots = [
    ...SLOT_DEFINITIONS.slice(0, 4),
    { slotIndex: -1, startTime: '13:10', endTime: '14:00' }, // Lunch
    ...SLOT_DEFINITIONS.slice(4, 6),
  ];

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ClassSession | null>(null);
  const [editSubjectCode, setEditSubjectCode] = useState('');
  const [editFacultyId, setEditFacultyId] = useState('');
  const [editSecondFacultyId, setEditSecondFacultyId] = useState<string>('');

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
    setEditSecondFacultyId(session.secondFacultyId || '');
    setEditOpen(true);
  };

  const handleSave = () => {
    if (!editTarget || !onEditSession) return;

    const updated: ClassSession = {
      ...editTarget,
      subjectCode: editSubjectCode,
      facultyId: editFacultyId,
      secondFacultyId: editSecondFacultyId || undefined,
    };

    // Validate second faculty clash
    if (editSecondFacultyId) {
      const clash = sessions.find(s =>
        s !== editTarget &&
        (s.facultyId === editSecondFacultyId || s.secondFacultyId === editSecondFacultyId) &&
        s.day === updated.day && s.slotIndex === updated.slotIndex
      );
      if (clash) {
        toast({ title: 'Second faculty has a clash at this slot', variant: 'destructive' });
        return;
      }
    }

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
        <table className="w-full text-xs border-collapse min-w-[700px]">
          <thead>
            <tr>
              <th className="p-2 border bg-primary text-primary-foreground font-semibold text-left">Day</th>
              {displaySlots.map((s, i) => (
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
            {DAYS.map((day) => (
              <tr key={day}>
                <td className="p-2 border font-semibold bg-muted">{day.slice(0, 3)}</td>
                {displaySlots.map((slot, i) => {
                  if (slot.slotIndex === -1) {
                    return (
                      <td key={i} className="p-2 border text-center bg-accent/20 text-accent-foreground">
                        <div className="font-semibold text-[10px]">LUNCH</div>
                      </td>
                    );
                  }
                  const session = getSession(day, slot.slotIndex);
                  if (!session)
                    return (
                      <td key={i} className="p-2 border text-center text-muted-foreground">—</td>
                    );
                  const subj = subjects.find((s) => s.code === session.subjectCode);
                  const fac = faculty.find((f) => f.id === session.facultyId);
                  const fac2 = session.secondFacultyId ? faculty.find(f => f.id === session.secondFacultyId) : null;
                  const isLab = subj && (subj.subjectType === SubjectType.LAB || subj.subjectType === SubjectType.INTEGRATED);
                  return (
                    <td
                      key={i}
                      className={cn(
                        'p-2 border text-center rounded-sm relative group',
                        getColorClass(session.subjectCode),
                        editable && !session.isFixed && 'cursor-pointer hover:ring-2 hover:ring-primary/50'
                      )}
                      onClick={() => openEdit(session)}
                    >
                      <div className="font-bold">{subj?.code || session.subjectCode}</div>
                      <div className="text-[10px] opacity-75">{fac?.shortName || session.facultyId}</div>
                      {fac2 && <div className="text-[9px] opacity-60">+{fac2.shortName}</div>}
                      {isLab && <Badge variant="outline" className="text-[8px] mt-0.5 px-1 py-0">LAB</Badge>}
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
          {editTarget && (() => {
            const editSubj = subjects.find(s => s.code === editSubjectCode);
            const isLabSession = editSubj && (editSubj.subjectType === SubjectType.LAB || editSubj.subjectType === SubjectType.INTEGRATED);
            return (
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
                {isLabSession && (
                  <div>
                    <Label className="text-xs">Second Faculty (Lab, optional)</Label>
                    <Select value={editSecondFacultyId} onValueChange={setEditSecondFacultyId}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {faculty.filter(f => f.id !== editFacultyId).map(f => (
                          <SelectItem key={f.id} value={f.id}>{f.shortName} ({f.id})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
