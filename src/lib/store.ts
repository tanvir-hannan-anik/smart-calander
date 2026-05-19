import { useCallback, useSyncExternalStore } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  title: string;
  time: string;
  done: boolean;
  tag: string;
  date: string; // YYYY-MM-DD
}

export interface Habit {
  id: string;
  name: string;
  color: string;
  icon: string;
  checkins: string[]; // array of YYYY-MM-DD dates
}

export interface StudySubject {
  id: string;
  title: string;
  color: string;
  sessions: StudySession[];
}

export interface StudySession {
  id: string;
  topic: string;
  day: string;
  hours: number;
  completed: boolean;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  name: string;
  avatar: string;
}

export interface TeamTask {
  id: string;
  title: string;
  assignee: string;
  label: string;
  status: 'todo' | 'in-progress' | 'done';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * A tiny shared, persisted, subscribable store. Every component (and the AI
 * chatbot) that uses the same store sees live updates — no more isolated
 * per-component useState that silently diverged.
 */
function createStore<T>(key: string, fallback: T) {
  let state: T = loadFromStorage(key, fallback);
  const listeners = new Set<() => void>();

  const get = () => state;
  const subscribe = (cb: () => void) => {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  };
  const set = (updater: T | ((prev: T) => T)) => {
    state = typeof updater === 'function' ? (updater as (p: T) => T)(state) : updater;
    try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* ignore */ }
    listeners.forEach(l => l());
  };

  // Keep multiple browser tabs in sync.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', e => {
      if (e.key === key && e.newValue) {
        try { state = JSON.parse(e.newValue); listeners.forEach(l => l()); } catch { /* ignore */ }
      }
    });
  }

  return { get, set, subscribe };
}

function useStore<T>(store: { get: () => T; subscribe: (cb: () => void) => () => void }): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

// ─── Default Data ────────────────────────────────────────────────────────────

const DEFAULT_TASKS: Task[] = [
  { id: generateId(), title: 'Finish UI Prototype', time: '10:00 AM - 12:00 PM', done: true, tag: 'Urgent', date: todayStr() },
  { id: generateId(), title: 'Review System Architecture with Team', time: '1:30 PM - 2:30 PM', done: false, tag: 'Meeting', date: todayStr() },
  { id: generateId(), title: 'Study Distributed Systems Ch 4', time: '4:00 PM - 6:00 PM', done: false, tag: 'Exam Prep', date: todayStr() },
];

const DEFAULT_HABITS: Habit[] = [
  { id: generateId(), name: 'Morning Exercise', color: 'green', icon: '🏃', checkins: [] },
  { id: generateId(), name: 'Read 30 mins', color: 'blue', icon: '📚', checkins: [] },
  { id: generateId(), name: 'Meditate', color: 'purple', icon: '🧘', checkins: [] },
  { id: generateId(), name: 'Drink Water (8 cups)', color: 'cyan', icon: '💧', checkins: [] },
];

const DEFAULT_SUBJECTS: StudySubject[] = [
  {
    id: generateId(), title: 'Distributed Systems', color: 'blue',
    sessions: [
      { id: generateId(), topic: 'Ch 4: Consensus Algorithms', day: 'Monday', hours: 2, completed: false },
      { id: generateId(), topic: 'Ch 5: Replication', day: 'Wednesday', hours: 2, completed: false },
    ]
  },
  {
    id: generateId(), title: 'Machine Learning', color: 'purple',
    sessions: [
      { id: generateId(), topic: 'Neural Networks Intro', day: 'Monday', hours: 1.5, completed: false },
      { id: generateId(), topic: 'Backpropagation', day: 'Thursday', hours: 2, completed: false },
    ]
  },
  {
    id: generateId(), title: 'Advanced Algorithms', color: 'green',
    sessions: [
      { id: generateId(), topic: 'Dynamic Programming', day: 'Tuesday', hours: 2, completed: false },
      { id: generateId(), topic: 'Graph Algorithms', day: 'Friday', hours: 1.5, completed: false },
    ]
  },
];

const DEFAULT_TEAM_MEMBERS: TeamMember[] = [
  { id: generateId(), name: 'Tanvir', avatar: '🧑‍💻' },
  { id: generateId(), name: 'Sarah', avatar: '👩‍🔬' },
  { id: generateId(), name: 'Alex', avatar: '🧑‍🎨' },
];

const DEFAULT_TEAM_TASKS: TeamTask[] = [
  { id: generateId(), title: 'Design landing page', assignee: 'Alex', label: 'Design', status: 'done' },
  { id: generateId(), title: 'Set up CI/CD pipeline', assignee: 'Tanvir', label: 'DevOps', status: 'in-progress' },
  { id: generateId(), title: 'Write API documentation', assignee: 'Sarah', label: 'Docs', status: 'todo' },
  { id: generateId(), title: 'Database schema review', assignee: 'Tanvir', label: 'Backend', status: 'todo' },
  { id: generateId(), title: 'User research interviews', assignee: 'Sarah', label: 'Research', status: 'in-progress' },
];

// ─── Shared store instances ──────────────────────────────────────────────────

const tasksStore = createStore<Task[]>('scm_tasks', DEFAULT_TASKS);
const habitsStore = createStore<Habit[]>('scm_habits', DEFAULT_HABITS);
const subjectsStore = createStore<StudySubject[]>('scm_subjects', DEFAULT_SUBJECTS);
const notesStore = createStore<Note[]>('scm_notes', []);
const teamMembersStore = createStore<TeamMember[]>('scm_team_members', DEFAULT_TEAM_MEMBERS);
const teamTasksStore = createStore<TeamTask[]>('scm_team_tasks', DEFAULT_TEAM_TASKS);

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useTasks() {
  const tasks = useStore(tasksStore);

  const addTask = useCallback((title: string, time: string = '', tag: string = '', date?: string) => {
    const task: Task = { id: generateId(), title, time, done: false, tag, date: date || todayStr() };
    tasksStore.set(prev => [task, ...prev]);
    return task;
  }, []);

  const toggleTask = useCallback((id: string) => {
    tasksStore.set(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  }, []);

  const deleteTask = useCallback((id: string) => {
    tasksStore.set(prev => prev.filter(t => t.id !== id));
  }, []);

  const todayTasks = tasks.filter(t => t.date === todayStr());

  return {
    tasks,
    todayTasks,
    addTask,
    toggleTask,
    deleteTask,
    completedToday: todayTasks.filter(t => t.done).length,
    totalToday: todayTasks.length,
  };
}

export function useHabits() {
  const habits = useStore(habitsStore);

  const addHabit = useCallback((name: string, color: string, icon: string) => {
    const habit: Habit = { id: generateId(), name, color, icon, checkins: [] };
    habitsStore.set(prev => [...prev, habit]);
    return habit;
  }, []);

  const toggleCheckin = useCallback((habitId: string, date?: string) => {
    const d = date || todayStr();
    habitsStore.set(prev => prev.map(h => {
      if (h.id !== habitId) return h;
      const has = h.checkins.includes(d);
      return { ...h, checkins: has ? h.checkins.filter(c => c !== d) : [...h.checkins, d] };
    }));
  }, []);

  const deleteHabit = useCallback((id: string) => {
    habitsStore.set(prev => prev.filter(h => h.id !== id));
  }, []);

  const getStreak = useCallback((habitId: string) => {
    const habit = habitsStore.get().find(h => h.id === habitId);
    if (!habit) return 0;
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (habit.checkins.includes(ds)) streak++;
      else break;
    }
    return streak;
  }, [habits]);

  return { habits, addHabit, toggleCheckin, deleteHabit, getStreak };
}

export function useStudyPlanner() {
  const subjects = useStore(subjectsStore);

  const addSubject = useCallback((title: string, color: string) => {
    const subject: StudySubject = { id: generateId(), title, color, sessions: [] };
    subjectsStore.set(prev => [...prev, subject]);
    return subject;
  }, []);

  const deleteSubject = useCallback((id: string) => {
    subjectsStore.set(prev => prev.filter(s => s.id !== id));
  }, []);

  const addSession = useCallback((subjectId: string, topic: string, day: string, hours: number) => {
    const session: StudySession = { id: generateId(), topic, day, hours, completed: false };
    subjectsStore.set(prev => prev.map(s => s.id === subjectId ? { ...s, sessions: [...s.sessions, session] } : s));
    return session;
  }, []);

  const toggleSession = useCallback((subjectId: string, sessionId: string) => {
    subjectsStore.set(prev => prev.map(s => {
      if (s.id !== subjectId) return s;
      return { ...s, sessions: s.sessions.map(ss => ss.id === sessionId ? { ...ss, completed: !ss.completed } : ss) };
    }));
  }, []);

  const deleteSession = useCallback((subjectId: string, sessionId: string) => {
    subjectsStore.set(prev => prev.map(s => {
      if (s.id !== subjectId) return s;
      return { ...s, sessions: s.sessions.filter(ss => ss.id !== sessionId) };
    }));
  }, []);

  const getProgress = useCallback((subjectId: string) => {
    const subject = subjectsStore.get().find(s => s.id === subjectId);
    if (!subject || subject.sessions.length === 0) return 0;
    return Math.round((subject.sessions.filter(s => s.completed).length / subject.sessions.length) * 100);
  }, [subjects]);

  return { subjects, addSubject, deleteSubject, addSession, toggleSession, deleteSession, getProgress };
}

export function useNotes() {
  const notes = useStore(notesStore);

  const addNote = useCallback((title: string, content: string = '') => {
    const note: Note = { id: generateId(), title, content, createdAt: new Date().toISOString() };
    notesStore.set(prev => [note, ...prev]);
    return note;
  }, []);

  const updateNote = useCallback((id: string, title: string, content: string) => {
    notesStore.set(prev => prev.map(n => n.id === id ? { ...n, title, content } : n));
  }, []);

  const deleteNote = useCallback((id: string) => {
    notesStore.set(prev => prev.filter(n => n.id !== id));
  }, []);

  return { notes, addNote, updateNote, deleteNote };
}

export function useTeam() {
  const members = useStore(teamMembersStore);
  const tasks = useStore(teamTasksStore);

  const addMember = useCallback((name: string, avatar: string) => {
    teamMembersStore.set(prev => [...prev, { id: generateId(), name, avatar }]);
  }, []);

  const addTeamTask = useCallback((title: string, assignee: string, label: string) => {
    const task: TeamTask = { id: generateId(), title, assignee, label, status: 'todo' };
    teamTasksStore.set(prev => [...prev, task]);
    return task;
  }, []);

  const moveTask = useCallback((id: string, status: TeamTask['status']) => {
    teamTasksStore.set(prev => prev.map(t => t.id === id ? { ...t, status } : t));
  }, []);

  const deleteTeamTask = useCallback((id: string) => {
    teamTasksStore.set(prev => prev.filter(t => t.id !== id));
  }, []);

  return { members, tasks, addMember, addTeamTask, moveTask, deleteTeamTask };
}
