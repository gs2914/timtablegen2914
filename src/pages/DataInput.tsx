import React, { useState, useRef } from 'react';
import { useTimetable } from '@/contexts/TimetableContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Trash2, Upload, Plus, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from '@/hooks/use-toast';
import { Day, SubjectType, Faculty, Subject, Section, FixedClass, CareerPathClass, LabRoom } from '@/types/timetable';
import { parseFacultyCSV, parseSubjectCSV, parseSectionCSV, parseFixedClassCSV, parseCareerPathCSV } from '@/utils/csvParser';
import { DAYS, SLOT_DEFINITIONS } from '@/core/timeSlotManager';

function CSVUpload({ label, onParse }: { label: string; onParse: (text: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2">
      <input
        ref={ref}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => onParse(ev.target?.result as string);
            reader.readAsText(file);
          }
        }}
      />
      <Button variant="outline" size="sm" onClick={() => ref.current?.click()}>
        <Upload className="h-3 w-3 mr-1" /> {label}
      </Button>
    </div>
  );
}

export default function DataInput() {
  const { data, dispatch } = useTimetable();

  // Faculty form
  const [facId, setFacId] = useState('');
  const [facName, setFacName] = useState('');

  // Faculty edit state
  const [editFacOpen, setEditFacOpen] = useState(false);
  const [editFac, setEditFac] = useState<Faculty | null>(null);
  const [editFacName, setEditFacName] = useState('');

  // Faculty delete confirmation
  const [deleteFacOpen, setDeleteFacOpen] = useState(false);
  const [deleteFacId, setDeleteFacId] = useState<string | null>(null);

  const addFaculty = () => {
    if (!facId || !facName) return;
    if (data.faculty.find((f) => f.id === facId)) {
      toast({ title: 'Duplicate ID', variant: 'destructive' });
      return;
    }
    dispatch({ type: 'ADD_FACULTY', payload: { id: facId, shortName: facName } });
    setFacId(''); setFacName('');
  };

  const openEditFaculty = (f: Faculty) => {
    setEditFac(f);
    setEditFacName(f.shortName);
    setEditFacOpen(true);
  };

  const saveEditFaculty = () => {
    if (!editFac || !editFacName.trim()) return;
    dispatch({ type: 'UPDATE_FACULTY', payload: { id: editFac.id, shortName: editFacName.trim() } });
    setEditFacOpen(false);
    toast({ title: 'Faculty updated' });
  };

  const confirmDeleteFaculty = (fid: string) => {
    const isMapped = data.subjects.some(s => s.facultyId === fid || s.eligibleFacultyIds.includes(fid));
    if (isMapped) {
      setDeleteFacId(fid);
      setDeleteFacOpen(true);
    } else {
      dispatch({ type: 'REMOVE_FACULTY', payload: fid });
    }
  };

  const executeDeleteFaculty = () => {
    if (deleteFacId) {
      dispatch({ type: 'REMOVE_FACULTY', payload: deleteFacId });
      setDeleteFacOpen(false);
      setDeleteFacId(null);
    }
  };

  // Subject form
  const [subCode, setSubCode] = useState('');
  const [subName, setSubName] = useState('');
  const [subFaculty, setSubFaculty] = useState('');
  const [subEligibleFaculty, setSubEligibleFaculty] = useState<string[]>([]);
  const [subHours, setSubHours] = useState('3');
  const [subType, setSubType] = useState<SubjectType>(SubjectType.THEORY);
  const [subLabHours, setSubLabHours] = useState('0');
  const [subYear, setSubYear] = useState('1');

  const toggleEligibleFaculty = (fid: string) => {
    setSubEligibleFaculty(prev =>
      prev.includes(fid) ? prev.filter(f => f !== fid) : [...prev, fid]
    );
  };

  const addSubject = () => {
    if (!subCode || !subName || !subFaculty) return;
    const eligibleFacultyIds = [...new Set([subFaculty, ...subEligibleFaculty])];
    dispatch({
      type: 'ADD_SUBJECT',
      payload: {
        code: subCode, name: subName, facultyId: subFaculty,
        eligibleFacultyIds,
        weeklyHours: parseInt(subHours), subjectType: subType,
        labHours: parseInt(subLabHours), yearNumber: parseInt(subYear),
      },
    });
    setSubCode(''); setSubName(''); setSubEligibleFaculty([]);
  };

  // Section form
  const [secId, setSecId] = useState('');
  const [secYear, setSecYear] = useState('1');
  const [secName, setSecName] = useState('');

  const addSection = () => {
    if (!secId || !secName) return;
    dispatch({ type: 'ADD_SECTION', payload: { id: secId, yearNumber: parseInt(secYear), name: secName } });
    setSecId(''); setSecName('');
  };

  // Fixed class form
  const [fcSubject, setFcSubject] = useState('');
  const [fcFaculty, setFcFaculty] = useState('');
  const [fcYear, setFcYear] = useState('1');
  const [fcSection, setFcSection] = useState('');
  const [fcDay, setFcDay] = useState<Day>(Day.MONDAY);
  const [fcSlot, setFcSlot] = useState('0');

  const addFixed = () => {
    if (!fcSubject || !fcFaculty || !fcSection) return;
    const conflict = data.fixedClasses.find(
      (f) => f.facultyId === fcFaculty && f.day === fcDay && f.slotIndex === parseInt(fcSlot)
    );
    if (conflict) {
      toast({ title: 'Faculty already occupied at this slot', variant: 'destructive' });
      return;
    }
    dispatch({
      type: 'ADD_FIXED_CLASS',
      payload: {
        subjectCode: fcSubject, facultyId: fcFaculty, yearNumber: parseInt(fcYear),
        sectionId: fcSection, day: fcDay, slotIndex: parseInt(fcSlot),
      },
    });
  };

  // Career path form
  const [cpSubject, setCpSubject] = useState('');
  const [cpFaculty, setCpFaculty] = useState('');
  const [cpYear, setCpYear] = useState('3');
  const [cpDay, setCpDay] = useState<Day>(Day.MONDAY);
  const [cpSlot, setCpSlot] = useState('0');
  const [cpSlotType, setCpSlotType] = useState<'theory' | 'lab'>('theory');

  const addCareer = () => {
    if (!cpSubject || !cpFaculty) return;
    const yearNum = parseInt(cpYear);
    if (yearNum < 3 || yearNum > 4) {
      toast({ title: 'Career path is only allowed for 3rd and 4th year', variant: 'destructive' });
      return;
    }
    dispatch({
      type: 'ADD_CAREER_CLASS',
      payload: {
        subjectCode: cpSubject, facultyId: cpFaculty,
        yearNumber: yearNum, day: cpDay, slotIndex: parseInt(cpSlot),
        slotType: cpSlotType,
      },
    });
  };

  // Lab room form
  const [labId, setLabId] = useState('');
  const [labName, setLabName] = useState('');
  const [labCapacity, setLabCapacity] = useState('30');
  const [labSubjects, setLabSubjects] = useState<string[]>([]);

  const toggleLabSubject = (code: string) => {
    setLabSubjects(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const addLabRoom = () => {
    if (!labId || !labName) return;
    if (data.labRooms.find(l => l.id === labId)) {
      toast({ title: 'Duplicate Lab ID', variant: 'destructive' });
      return;
    }
    dispatch({
      type: 'ADD_LAB_ROOM',
      payload: { id: labId, name: labName, capacity: parseInt(labCapacity), subjectCodes: labSubjects },
    });
    setLabId(''); setLabName(''); setLabCapacity('30'); setLabSubjects([]);
    toast({ title: 'Lab room added' });
  };

  const hasGeneratedTimetable = !!data.generatedTimetable;

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <h1 className="text-xl font-bold">Data Input</h1>

      {hasGeneratedTimetable && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive">
          <span className="font-semibold">⚠ Timetable already generated.</span>
          <span>Any changes here will require re-generation.</span>
        </div>
      )}

      <Tabs defaultValue="faculty" className="w-full">
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="faculty" className="text-xs">Faculty</TabsTrigger>
          <TabsTrigger value="subjects" className="text-xs">Subjects</TabsTrigger>
          <TabsTrigger value="sections" className="text-xs">Sections</TabsTrigger>
          <TabsTrigger value="labs" className="text-xs">Labs</TabsTrigger>
          <TabsTrigger value="fixed" className="text-xs">Fixed</TabsTrigger>
          <TabsTrigger value="career" className="text-xs">Career</TabsTrigger>
        </TabsList>

        {/* FACULTY */}
        <TabsContent value="faculty">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Faculty ({data.faculty.length})</CardTitle>
                <CSVUpload label="CSV" onParse={(t) => {
                  const parsed = parseFacultyCSV(t);
                  dispatch({ type: 'SET_FACULTY', payload: [...data.faculty, ...parsed] });
                  toast({ title: `${parsed.length} faculty imported` });
                }} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">ID</Label><Input value={facId} onChange={(e) => setFacId(e.target.value)} placeholder="F001" className="h-8 text-sm" /></div>
                <div><Label className="text-xs">Short Name</Label><Input value={facName} onChange={(e) => setFacName(e.target.value)} placeholder="Dr.K" className="h-8 text-sm" /></div>
              </div>
              <Button size="sm" onClick={addFaculty} className="w-full"><Plus className="h-3 w-3 mr-1" /> Add Faculty</Button>
              <div className="space-y-1 mt-2 max-h-48 overflow-auto">
                {data.faculty.map((f) => (
                  <div key={f.id} className="flex items-center justify-between p-2 bg-muted rounded text-xs">
                    <div>
                      <span className="font-semibold">{f.shortName}</span>
                      <span className="text-muted-foreground ml-1">({f.id})</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditFaculty(f)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => confirmDeleteFaculty(f.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SUBJECTS */}
        <TabsContent value="subjects">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Subjects ({data.subjects.length})</CardTitle>
                <CSVUpload label="CSV" onParse={(t) => {
                  const parsed = parseSubjectCSV(t);
                  dispatch({ type: 'SET_SUBJECTS', payload: [...data.subjects, ...parsed] });
                  toast({ title: `${parsed.length} subjects imported` });
                }} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Code</Label><Input value={subCode} onChange={(e) => setSubCode(e.target.value)} placeholder="CS101" className="h-8 text-sm" /></div>
                <div><Label className="text-xs">Name</Label><Input value={subName} onChange={(e) => setSubName(e.target.value)} placeholder="Data Structures" className="h-8 text-sm" /></div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Faculty</Label>
                  <Select value={subFaculty} onValueChange={setSubFaculty}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{data.faculty.map((f) => <SelectItem key={f.id} value={f.id}>{f.shortName}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Hrs/Week</Label><Input type="number" value={subHours} onChange={(e) => setSubHours(e.target.value)} className="h-8 text-sm" /></div>
                <div><Label className="text-xs">Year</Label><Input type="number" value={subYear} onChange={(e) => setSubYear(e.target.value)} min="1" max="4" className="h-8 text-sm" /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Type</Label>
                  <Select value={subType} onValueChange={(v) => setSubType(v as SubjectType)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SubjectType.THEORY}>Theory</SelectItem>
                      <SelectItem value={SubjectType.LAB}>Lab</SelectItem>
                      <SelectItem value={SubjectType.INTEGRATED}>Integrated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Lab Hours</Label><Input type="number" value={subLabHours} onChange={(e) => setSubLabHours(e.target.value)} className="h-8 text-sm" /></div>
              </div>
              {data.faculty.length > 0 && (
                <div>
                  <Label className="text-xs">Additional Eligible Faculty (optional)</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {data.faculty.filter(f => f.id !== subFaculty).map(f => (
                      <Badge
                        key={f.id}
                        variant={subEligibleFaculty.includes(f.id) ? 'default' : 'outline'}
                        className="text-[10px] cursor-pointer"
                        onClick={() => toggleEligibleFaculty(f.id)}
                      >
                        {f.shortName}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <Button size="sm" onClick={addSubject} className="w-full"><Plus className="h-3 w-3 mr-1" /> Add Subject</Button>
              <div className="space-y-1 mt-2 max-h-40 overflow-auto">
                {data.subjects.map((s) => (
                  <div key={s.code} className="flex items-center justify-between p-2 bg-muted rounded text-xs">
                    <div>
                      <span className="font-semibold">{s.code}</span> — {s.name}
                      <Badge variant="outline" className="ml-1 text-[10px]">{s.subjectType}</Badge>
                      <span className="text-muted-foreground ml-1">Y{s.yearNumber} {s.weeklyHours}h/w</span>
                      {s.eligibleFacultyIds.length > 1 && (
                        <Badge variant="secondary" className="ml-1 text-[10px]">{s.eligibleFacultyIds.length} faculty</Badge>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => dispatch({ type: 'REMOVE_SUBJECT', payload: s.code })}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SECTIONS */}
        <TabsContent value="sections">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Sections ({data.sections.length})</CardTitle>
                <CSVUpload label="CSV" onParse={(t) => {
                  const parsed = parseSectionCSV(t);
                  dispatch({ type: 'SET_SECTIONS', payload: [...data.sections, ...parsed] });
                  toast({ title: `${parsed.length} sections imported` });
                }} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div><Label className="text-xs">ID</Label><Input value={secId} onChange={(e) => setSecId(e.target.value)} placeholder="1A" className="h-8 text-sm" /></div>
                <div><Label className="text-xs">Year</Label><Input type="number" value={secYear} onChange={(e) => setSecYear(e.target.value)} className="h-8 text-sm" /></div>
                <div><Label className="text-xs">Name</Label><Input value={secName} onChange={(e) => setSecName(e.target.value)} placeholder="A" className="h-8 text-sm" /></div>
              </div>
              <Button size="sm" onClick={addSection} className="w-full"><Plus className="h-3 w-3 mr-1" /> Add Section</Button>
              <div className="flex flex-wrap gap-1 mt-2">
                {data.sections.map((s) => (
                  <Badge key={s.id} variant="secondary" className="text-xs cursor-pointer" onClick={() => dispatch({ type: 'REMOVE_SECTION', payload: s.id })}>
                    Y{s.yearNumber}-{s.name} <Trash2 className="h-2.5 w-2.5 ml-1" />
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* LAB ROOMS */}
        <TabsContent value="labs">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Lab Rooms ({data.labRooms.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div><Label className="text-xs">Lab ID</Label><Input value={labId} onChange={(e) => setLabId(e.target.value)} placeholder="LAB-1" className="h-8 text-sm" /></div>
                <div><Label className="text-xs">Lab Name</Label><Input value={labName} onChange={(e) => setLabName(e.target.value)} placeholder="CS Lab 1" className="h-8 text-sm" /></div>
                <div><Label className="text-xs">Capacity</Label><Input type="number" value={labCapacity} onChange={(e) => setLabCapacity(e.target.value)} className="h-8 text-sm" /></div>
              </div>
              {data.subjects.filter(s => s.subjectType !== SubjectType.THEORY).length > 0 && (
                <div>
                  <Label className="text-xs">Subjects Assigned to This Lab</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {data.subjects.filter(s => s.subjectType !== SubjectType.THEORY).map(s => (
                      <Badge
                        key={s.code}
                        variant={labSubjects.includes(s.code) ? 'default' : 'outline'}
                        className="text-[10px] cursor-pointer"
                        onClick={() => toggleLabSubject(s.code)}
                      >
                        {s.code}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <Button size="sm" onClick={addLabRoom} className="w-full"><Plus className="h-3 w-3 mr-1" /> Add Lab Room</Button>
              <div className="space-y-1 mt-2 max-h-40 overflow-auto">
                {data.labRooms.map((lab) => (
                  <div key={lab.id} className="flex items-center justify-between p-2 bg-muted rounded text-xs">
                    <div>
                      <span className="font-semibold">{lab.name}</span>
                      <span className="text-muted-foreground ml-1">({lab.id})</span>
                      <span className="text-muted-foreground ml-1">Cap: {lab.capacity}</span>
                      {lab.subjectCodes.length > 0 && (
                        <Badge variant="secondary" className="ml-1 text-[10px]">{lab.subjectCodes.length} subjects</Badge>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => dispatch({ type: 'REMOVE_LAB_ROOM', payload: lab.id })}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
              {data.labRooms.length === 0 && (
                <p className="text-[10px] text-muted-foreground">Add lab rooms to enable lab-aware scheduling. Each lab session will be assigned a specific room, and no two sessions can use the same room simultaneously.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* FIXED CLASSES */}
        <TabsContent value="fixed">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Fixed Classes ({data.fixedClasses.length})</CardTitle>
                <CSVUpload label="CSV" onParse={(t) => {
                  const parsed = parseFixedClassCSV(t);
                  dispatch({ type: 'SET_FIXED_CLASSES', payload: [...data.fixedClasses, ...parsed] });
                  toast({ title: `${parsed.length} fixed classes imported` });
                }} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Subject</Label>
                  <Select value={fcSubject} onValueChange={setFcSubject}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{data.subjects.map((s) => <SelectItem key={s.code} value={s.code}>{s.code}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Faculty</Label>
                  <Select value={fcFaculty} onValueChange={setFcFaculty}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{data.faculty.map((f) => <SelectItem key={f.id} value={f.id}>{f.shortName}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label className="text-xs">Year</Label><Input type="number" value={fcYear} onChange={(e) => setFcYear(e.target.value)} className="h-8 text-sm" /></div>
                <div>
                  <Label className="text-xs">Section</Label>
                  <Select value={fcSection} onValueChange={setFcSection}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sec" /></SelectTrigger>
                    <SelectContent>{data.sections.filter(s => s.yearNumber === parseInt(fcYear)).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Day</Label>
                  <Select value={fcDay} onValueChange={(v) => setFcDay(v as Day)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{DAYS.map((d) => <SelectItem key={d} value={d}>{d.slice(0, 3)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Slot</Label>
                <Select value={fcSlot} onValueChange={setFcSlot}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{SLOT_DEFINITIONS.slice(0, 6).map((s) => <SelectItem key={s.slotIndex} value={String(s.slotIndex)}>{s.startTime}-{s.endTime}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button size="sm" onClick={addFixed} className="w-full"><Plus className="h-3 w-3 mr-1" /> Add Fixed Class</Button>
              <div className="space-y-1 mt-2 max-h-32 overflow-auto">
                {data.fixedClasses.map((fc, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-muted rounded text-xs">
                    <span>{fc.subjectCode} | {fc.day.slice(0, 3)} Slot {fc.slotIndex} | Sec {fc.sectionId}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => dispatch({ type: 'REMOVE_FIXED_CLASS', payload: i })}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CAREER PATH */}
        <TabsContent value="career">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Career Path ({data.careerPathClasses.length})</CardTitle>
                <CSVUpload label="CSV" onParse={(t) => {
                  const parsed = parseCareerPathCSV(t);
                  dispatch({ type: 'SET_CAREER_CLASSES', payload: [...data.careerPathClasses, ...parsed] });
                  toast({ title: `${parsed.length} career path classes imported` });
                }} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-2 rounded bg-muted/50 text-[10px] text-muted-foreground">
                Career path classes are allowed only for <strong>3rd and 4th year</strong>. They are scheduled simultaneously across all sections of the selected year.
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Subject</Label>
                  <Select value={cpSubject} onValueChange={setCpSubject}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{data.subjects.map((s) => <SelectItem key={s.code} value={s.code}>{s.code}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Faculty</Label>
                  <Select value={cpFaculty} onValueChange={setCpFaculty}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{data.faculty.map((f) => <SelectItem key={f.id} value={f.id}>{f.shortName}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Year</Label>
                  <Select value={cpYear} onValueChange={setCpYear}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3rd Year</SelectItem>
                      <SelectItem value="4">4th Year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Day</Label>
                  <Select value={cpDay} onValueChange={(v) => setCpDay(v as Day)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{DAYS.map((d) => <SelectItem key={d} value={d}>{d.slice(0, 3)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Slot</Label>
                  <Select value={cpSlot} onValueChange={setCpSlot}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{SLOT_DEFINITIONS.slice(0, 6).map((s) => <SelectItem key={s.slotIndex} value={String(s.slotIndex)}>{s.startTime}-{s.endTime}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Slot Type</Label>
                <RadioGroup value={cpSlotType} onValueChange={(v) => setCpSlotType(v as 'theory' | 'lab')} className="flex gap-4 mt-1">
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="theory" id="cp-theory" />
                    <Label htmlFor="cp-theory" className="text-xs">Theory</Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="lab" id="cp-lab" />
                    <Label htmlFor="cp-lab" className="text-xs">Lab</Label>
                  </div>
                </RadioGroup>
              </div>
              <Button size="sm" onClick={addCareer} className="w-full"><Plus className="h-3 w-3 mr-1" /> Add Career Path</Button>
              <div className="space-y-1 mt-2 max-h-32 overflow-auto">
                {data.careerPathClasses.map((cp, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-muted rounded text-xs">
                    <span>
                      {cp.subjectCode} | Y{cp.yearNumber} | {cp.day.slice(0, 3)} Slot {cp.slotIndex}
                      <Badge variant="outline" className="ml-1 text-[10px]">{cp.slotType}</Badge>
                    </span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => dispatch({ type: 'REMOVE_CAREER_CLASS', payload: i })}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Faculty Edit Dialog */}
      <Dialog open={editFacOpen} onOpenChange={setEditFacOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">Edit Faculty</DialogTitle>
          </DialogHeader>
          {editFac && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Faculty ID (read-only)</Label>
                <Input value={editFac.id} disabled className="h-8 text-sm bg-muted" />
              </div>
              <div>
                <Label className="text-xs">Short Name</Label>
                <Input value={editFacName} onChange={(e) => setEditFacName(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditFacOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={saveEditFaculty}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Faculty Delete Confirmation */}
      <AlertDialog open={deleteFacOpen} onOpenChange={setDeleteFacOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Faculty?</AlertDialogTitle>
            <AlertDialogDescription>
              This faculty is currently mapped to one or more subjects. Deleting will remove the mapping. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeDeleteFaculty}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
