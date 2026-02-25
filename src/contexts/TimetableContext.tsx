import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
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
  | { type: 'RESET' };

function reducer(state: TimetableData, action: Action): TimetableData {
  switch (action.type) {
    case 'SET_FACULTY': return { ...state, faculty: action.payload };
    case 'ADD_FACULTY': return { ...state, faculty: [...state.faculty, action.payload], generatedTimetable: null };
    case 'UPDATE_FACULTY': return { ...state, faculty: state.faculty.map(f => f.id === action.payload.id ? action.payload : f), generatedTimetable: null };
    case 'REMOVE_FACULTY': return { ...state, faculty: state.faculty.filter(f => f.id !== action.payload), generatedTimetable: null };
    case 'SET_SUBJECTS': return { ...state, subjects: action.payload };
    case 'ADD_SUBJECT': return { ...state, subjects: [...state.subjects, action.payload], generatedTimetable: null };
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
    case 'RESET': return INITIAL_DATA;
    default: return state;
  }
}

const STORAGE_KEY = 'cse-timetable-data';

function loadData(): TimetableData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Ensure new fields exist for backwards compatibility
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
  const [data, dispatch] = useReducer(reducer, undefined, loadData);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

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
