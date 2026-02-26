import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  TimetableData,
  INITIAL_DATA,
  Faculty,
  Subject,
  Section,
  FixedClass,
  CareerPathClass,
  ClassSession,
  FacultySectionMapping,
  LabRoom,
  LabRoomMapping,
} from '@/types/timetable';

type Action =
  | { type: 'SET_FACULTY'; payload: Faculty[] }
  | { type: 'ADD_FACULTY'; payload: Faculty }
  | { type: 'UPDATE_FACULTY'; payload: Faculty }
  | { type: 'REMOVE_FACULTY'; payload: string }
  | { type: 'SET_SUBJECTS'; payload: Subject[] }
  | { type: 'ADD_SUBJECT'; payload: Subject }
  | { type: 'UPDATE_SUBJECT'; payload: Subject }
  | { type: 'REMOVE_SUBJECT'; payload: string }
  | { type: 'SET_SECTIONS'; payload: Section[] }
  | { type: 'ADD_SECTION'; payload: Section }
  | { type: 'REMOVE_SECTION'; payload: string }
  | { type: 'SET_FIXED_CLASSES'; payload: FixedClass[] }
  | { type: 'ADD_FIXED_CLASS'; payload: FixedClass }
  | { type: 'REMOVE_FIXED_CLASS'; payload: number }
  | { type: 'SET_CAREER_CLASSES'; payload: CareerPathClass[] }
  | { type: 'ADD_CAREER_CLASS'; payload: CareerPathClass }
  | { type: 'REMOVE_CAREER_CLASS'; payload: number }
  | { type: 'SET_LAB_ROOMS'; payload: LabRoom[] }
  | { type: 'ADD_LAB_ROOM'; payload: LabRoom }
  | { type: 'REMOVE_LAB_ROOM'; payload: string }
  | { type: 'SET_LAB_ROOM_MAPPINGS'; payload: LabRoomMapping[] }
  | { type: 'SET_FACULTY_SECTION_MAPPINGS'; payload: FacultySectionMapping[] }
  | { type: 'SET_TIMETABLE'; payload: ClassSession[] | null }
  | { type: 'LOAD_ALL'; payload: TimetableData }
  | { type: 'RESET' };

function reducer(state: TimetableData, action: Action): TimetableData {
  switch (action.type) {
    case 'SET_FACULTY': return { ...state, faculty: action.payload };
    case 'ADD_FACULTY': return { ...state, faculty: [...state.faculty, action.payload], generatedTimetable: null };
    case 'UPDATE_FACULTY': return { ...state, faculty: state.faculty.map(f => f.id === action.payload.id ? action.payload : f), generatedTimetable: null };
    case 'REMOVE_FACULTY': return { ...state, faculty: state.faculty.filter(f => f.id !== action.payload), generatedTimetable: null };
    case 'SET_SUBJECTS': return { ...state, subjects: action.payload };
    case 'ADD_SUBJECT': return { ...state, subjects: [...state.subjects, action.payload], generatedTimetable: null };
    case 'UPDATE_SUBJECT': return { ...state, subjects: state.subjects.map(s => s.code === action.payload.code ? action.payload : s), generatedTimetable: null };
    case 'REMOVE_SUBJECT': return { ...state, subjects: state.subjects.filter(s => s.code !== action.payload), generatedTimetable: null };
    case 'SET_SECTIONS': return { ...state, sections: action.payload };
    case 'ADD_SECTION': return { ...state, sections: [...state.sections, action.payload] };
    case 'REMOVE_SECTION': return { ...state, sections: state.sections.filter(s => s.id !== action.payload) };
    case 'SET_FIXED_CLASSES': return { ...state, fixedClasses: action.payload };
    case 'ADD_FIXED_CLASS': return { ...state, fixedClasses: [...state.fixedClasses, action.payload] };
    case 'REMOVE_FIXED_CLASS': return { ...state, fixedClasses: state.fixedClasses.filter((_, i) => i !== action.payload) };
    case 'SET_CAREER_CLASSES': return { ...state, careerPathClasses: action.payload };
    case 'ADD_CAREER_CLASS': return { ...state, careerPathClasses: [...state.careerPathClasses, action.payload] };
    case 'REMOVE_CAREER_CLASS': return { ...state, careerPathClasses: state.careerPathClasses.filter((_, i) => i !== action.payload) };
    case 'SET_LAB_ROOMS': return { ...state, labRooms: action.payload };
    case 'ADD_LAB_ROOM': return { ...state, labRooms: [...state.labRooms, action.payload], generatedTimetable: null };
    case 'REMOVE_LAB_ROOM': return { ...state, labRooms: state.labRooms.filter(l => l.id !== action.payload), generatedTimetable: null };
    case 'SET_LAB_ROOM_MAPPINGS': return { ...state, labRoomMappings: action.payload };
    case 'SET_FACULTY_SECTION_MAPPINGS': return { ...state, facultySectionMappings: action.payload };
    case 'SET_TIMETABLE': return { ...state, generatedTimetable: action.payload };
    case 'LOAD_ALL': return { ...INITIAL_DATA, ...action.payload };
    case 'RESET': return INITIAL_DATA;
    default: return state;
  }
}

const STORAGE_KEY = 'cse-timetable-data';

function loadFromLocalStorage(): TimetableData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...INITIAL_DATA,
        ...parsed,
        labRooms: parsed.labRooms || [],
        labRoomMappings: parsed.labRoomMappings || [],
      };
    }
  } catch { /* ignore */ }
  return INITIAL_DATA;
}

interface TimetableContextValue {
  data: TimetableData;
  dispatch: React.Dispatch<Action>;
}

const TimetableContext = createContext<TimetableContextValue | null>(null);

export function TimetableProvider({ children }: { children: React.ReactNode }) {
  const [data, dispatch] = useReducer(reducer, undefined, loadFromLocalStorage);
  const { user } = useAuth();
  const loadedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load data from Supabase when user logs in
  useEffect(() => {
    if (!user) {
      loadedRef.current = false;
      return;
    }
    if (loadedRef.current) return;

    const loadFromSupabase = async () => {
      try {
        const { data: row } = await supabase
          .from('user_timetable_data')
          .select('data')
          .eq('user_id', user.id)
          .maybeSingle();

        if (row?.data && typeof row.data === 'object') {
          dispatch({ type: 'LOAD_ALL', payload: { ...INITIAL_DATA, ...(row.data as any) } });
        }
        loadedRef.current = true;
      } catch (err) {
        console.error('Failed to load data from Supabase:', err);
        loadedRef.current = true;
      }
    };

    loadFromSupabase();
  }, [user]);

  // Save to localStorage always + debounced save to Supabase
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

    if (!user || !loadedRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await supabase
          .from('user_timetable_data')
          .upsert(
            { user_id: user.id, data: data as any, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
          );
      } catch (err) {
        console.error('Failed to save data to Supabase:', err);
      }
    }, 2000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [data, user]);

  return (
    <TimetableContext.Provider value={{ data, dispatch }}>
      {children}
    </TimetableContext.Provider>
  );
}

export function useTimetable() {
  const ctx = useContext(TimetableContext);
  if (!ctx) throw new Error('useTimetable must be used within TimetableProvider');
  return ctx;
}
