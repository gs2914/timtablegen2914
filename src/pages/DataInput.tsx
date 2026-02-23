import React, { useState, useRef } from 'react';
import { useTimetable } from '@/contexts/TimetableContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Trash2, Upload, Plus } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Day, SubjectType, Faculty, Subject, Section, FixedClass, CareerPathClass } from '@/types/timetable';
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

  const addFaculty = () => {
    if (!facId || !facName) return;
    if (data.faculty.find((f) => f.id === facId)) {
      toast({ title: 'Duplicate ID', variant: 'destructive' });
      return;
    }
    dispatch({ type: 'ADD_FACULTY', payload: { id: facId, shortName: facName } });
    setFacId(''); setFacName('');
  };

  // Subject form
  const [subCode, setSubCode] = useState('');
  const [subName, setSubName] = useState('');
  const [subFaculty, setSubFaculty] = useState('');
  const [subHours, setSubHours] = useState('3');
  const [subType, setSubType] = useState<SubjectType>(SubjectType.THEORY);
  const [subLabHours, setSubLabHours] = useState('0');
  const [subYear, setSubYear] = useState('1');

  const addSubject = () => {
    if (!subCode || !subName || !subFaculty) return;
    dispatch({
      type: 'ADD_SUBJECT',
      payload: {
        code: subCode, name: subName, facultyId: subFaculty,
        weeklyHours: parseInt(subHours), subjectType: subType,
        labHours: parseInt(subLabHours), yearNumber: parseInt(subYear),
      },
    });
    setSubCode(''); setSubName('');
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
    // Check faculty conflict
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
  const [cpYear, setCpYear] = useState('1');
  const [cpDay, setCpDay] = useState<Day>(Day.MONDAY);
  const [cpSlot, setCpSlot] = useState('0');

  const addCareer = () => {
    if (!cpSubject || !cpFaculty) return;
    dispatch({
      type: 'ADD_CAREER_CLASS',
      payload: {
        subjectCode: cpSubject, facultyId: cpFaculty,
        yearNumber: parseInt(cpYear), day: cpDay, slotIndex: parseInt(cpSlot),
      },
    });
  };

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <h1 className="text-xl font-bold">Data Input</h1>

      <Tabs defaultValue="faculty" className="w-full">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="faculty" className="text-xs">Faculty</TabsTrigger>
          <TabsTrigger value="subjects" className="text-xs">Subjects</TabsTrigger>
          <TabsTrigger value="sections" className="text-xs">Sections</TabsTrigger>
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
              <div className="flex flex-wrap gap-1 mt-2">
                {data.faculty.map((f) => (
                  <Badge key={f.id} variant="secondary" className="text-xs cursor-pointer" onClick={() => dispatch({ type: 'REMOVE_FACULTY', payload: f.id })}>
                    {f.shortName} ({f.id}) <Trash2 className="h-2.5 w-2.5 ml-1" />
                  </Badge>
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
              <Button size="sm" onClick={addSubject} className="w-full"><Plus className="h-3 w-3 mr-1" /> Add Subject</Button>
              <div className="space-y-1 mt-2 max-h-40 overflow-auto">
                {data.subjects.map((s) => (
                  <div key={s.code} className="flex items-center justify-between p-2 bg-muted rounded text-xs">
                    <div>
                      <span className="font-semibold">{s.code}</span> — {s.name}
                      <Badge variant="outline" className="ml-1 text-[10px]">{s.subjectType}</Badge>
                      <span className="text-muted-foreground ml-1">Y{s.yearNumber} {s.weeklyHours}h/w</span>
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
                <div><Label className="text-xs">Year</Label><Input type="number" value={cpYear} onChange={(e) => setCpYear(e.target.value)} className="h-8 text-sm" /></div>
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
              <Button size="sm" onClick={addCareer} className="w-full"><Plus className="h-3 w-3 mr-1" /> Add Career Path</Button>
              <div className="space-y-1 mt-2 max-h-32 overflow-auto">
                {data.careerPathClasses.map((cp, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-muted rounded text-xs">
                    <span>{cp.subjectCode} | Y{cp.yearNumber} | {cp.day.slice(0, 3)} Slot {cp.slotIndex}</span>
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
    </div>
  );
}
