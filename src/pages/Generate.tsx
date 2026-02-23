import React, { useState, useCallback } from 'react';
import { useTimetable } from '@/contexts/TimetableContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';
import { Play, RotateCcw, AlertCircle, CheckCircle } from 'lucide-react';
import { TimeSlotManager } from '@/core/timeSlotManager';
import { ConstraintEngine } from '@/core/constraintEngine';
import { GeneticAlgorithm, GAResult } from '@/core/geneticAlgorithm';

export default function Generate() {
  const { data, dispatch } = useTimetable();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<GAResult | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const validate = useCallback(() => {
    const errs: string[] = [];
    if (data.faculty.length === 0) errs.push('No faculty added');
    if (data.subjects.length === 0) errs.push('No subjects added');
    if (data.sections.length === 0) errs.push('No sections added');

    for (const sub of data.subjects) {
      if (!data.faculty.find((f) => f.id === sub.facultyId)) {
        errs.push(`Subject ${sub.code} references unknown faculty ${sub.facultyId}`);
      }
    }

    for (const fc of data.fixedClasses) {
      if (!data.subjects.find((s) => s.code === fc.subjectCode)) {
        errs.push(`Fixed class references unknown subject ${fc.subjectCode}`);
      }
    }

    return errs;
  }, [data]);

  const generate = useCallback(() => {
    const errs = validate();
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setRunning(true);
    setProgress(0);
    setResult(null);

    // Run in setTimeout to allow UI to update
    setTimeout(() => {
      try {
        const tsm = new TimeSlotManager();
        const ce = new ConstraintEngine(tsm, data.subjects);
        const ga = new GeneticAlgorithm(
          ce, tsm, data.subjects, data.sections,
          data.fixedClasses, data.careerPathClasses
        );

        const res = ga.run((gen, fitness) => {
          setProgress(Math.min((gen / 500) * 100, 99));
        });

        setResult(res);
        setProgress(100);
        dispatch({ type: 'SET_TIMETABLE', payload: res.timetable });

        if (res.converged) {
          toast({ title: 'Perfect timetable generated!', description: `Converged at generation ${res.generation}` });
        } else {
          toast({ title: 'Best timetable found', description: `Fitness: ${res.fitness} (lower is better)` });
        }
      } catch (err: any) {
        toast({ title: 'Generation failed', description: err.message, variant: 'destructive' });
      } finally {
        setRunning(false);
      }
    }, 50);
  }, [data, validate, dispatch]);

  const reset = () => {
    dispatch({ type: 'SET_TIMETABLE', payload: null });
    setResult(null);
    setProgress(0);
    setErrors([]);
  };

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <h1 className="text-xl font-bold">Generate Timetable</h1>

      {errors.length > 0 && (
        <Card className="border-destructive">
          <CardContent className="p-3 space-y-1">
            {errors.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-destructive">
                <AlertCircle className="h-3 w-3 flex-shrink-0" /> {e}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Input Summary</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <p>Faculty: {data.faculty.length} | Subjects: {data.subjects.length} | Sections: {data.sections.length}</p>
          <p>Fixed: {data.fixedClasses.length} | Career Path: {data.careerPathClasses.length}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Genetic Algorithm</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Population: 60 | Max Generations: 500 | Mutation Rate: 20%
          </div>

          {running && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">Optimizing... {Math.round(progress)}%</p>
            </div>
          )}

          {result && (
            <div className={`p-3 rounded text-xs ${result.converged ? 'bg-primary/10 text-primary' : 'bg-accent/15 text-accent-foreground'}`}>
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle className="h-4 w-4" />
                {result.converged ? 'Perfect Solution Found' : 'Best Solution Found'}
              </div>
              <p className="mt-1">Generation: {result.generation} | Fitness: {result.fitness}</p>
              <p>Sessions: {result.timetable.length}</p>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={generate} disabled={running} className="flex-1">
              <Play className="h-4 w-4 mr-1" /> {running ? 'Running...' : 'Generate'}
            </Button>
            <Button variant="outline" onClick={reset} disabled={running}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
