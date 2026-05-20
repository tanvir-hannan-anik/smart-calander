import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useWorkspace } from './workspaceContext';

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
interface RegisteredStore {
  /** Replace the store's contents (used by hydrate/reset). Does not re-persist
   *  beyond the normal set() path. */
  replace: (value: unknown) => void;
  /** Current value, for exporting a full snapshot to the cloud. */
  snapshot: () => unknown;
  /** The empty value this store resets to for a fresh user. */
  empty: unknown;
}

/** Every store registers here so we can hydrate / reset / export them all. */
const storeRegistry = new Map<string, RegisteredStore>();

function createStore<T>(key: string, fallback: T, empty: T) {
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
    scheduleCloudSync();
  };

  storeRegistry.set(key, {
    replace: (value: unknown) => {
      state = (value as T);
      try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* ignore */ }
      listeners.forEach(l => l());
    },
    snapshot: () => state,
    empty,
  });

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

// ─── Per-user cloud sync ─────────────────────────────────────────────────────

/**
 * The UID of the currently signed-in user, or null when logged out.
 * Cloud sync only runs while a user is signed in — logged-out demo browsing
 * never touches Firestore.
 */
let currentUid: string | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;

/** Snapshot every store keyed by its localStorage key, for saving to the cloud. */
export function exportAllStores(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  storeRegistry.forEach((s, key) => { out[key] = s.snapshot(); });
  return out;
}

/** Overwrite stores from a cloud snapshot. Missing keys fall back to empty. */
export function hydrateStores(data: Record<string, unknown> | null): void {
  storeRegistry.forEach((s, key) => {
    const value = data && key in data ? data[key] : s.empty;
    s.replace(value);
  });
}

/** Reset every store to its empty value — a brand-new user starts blank. */
export function resetAllStores(): void {
  storeRegistry.forEach(s => s.replace(s.empty));
}

/**
 * Saves the current snapshot to Firestore (debounced). Called automatically on
 * every store change while signed in, and flushed immediately on logout.
 */
function scheduleCloudSync(): void {
  if (!currentUid) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { void flushCloudSync(); }, 1500);
}

export async function flushCloudSync(): Promise<void> {
  if (!currentUid) return;
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
  const uid = currentUid;
  const { saveUserData } = await import('./firestore');
  await saveUserData(uid, exportAllStores());
}

/**
 * Call on sign-in. Loads the user's cloud data into the stores; a brand-new
 * user (no cloud document) gets a completely empty workspace — no demo data.
 */
export async function beginUserSession(uid: string): Promise<void> {
  currentUid = uid;
  const { loadUserData } = await import('./firestore');
  const data = await loadUserData(uid);
  hydrateStores(data); // null => everything resets to empty
}

/**
 * Call on logout. Flushes the latest data to the cloud first so nothing is
 * lost, then clears the in-memory/local stores so the next user (or the
 * logged-out demo view) does not see the previous user's data.
 */
export async function endUserSession(): Promise<void> {
  try {
    await flushCloudSync();
  } catch (err) {
    console.error('Final cloud sync on logout failed:', err);
  }
  currentUid = null;
  resetAllStores();
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

// ─── Shared store instances ──────────────────────────────────────────────────

// `fallback` is the demo data shown to a logged-out visitor (and on first
// load before auth resolves). `empty` is what a freshly signed-in user with no
// cloud data gets — a completely blank workspace.
const tasksStore = createStore<Task[]>('scm_tasks', DEFAULT_TASKS, []);
const habitsStore = createStore<Habit[]>('scm_habits', DEFAULT_HABITS, []);
const subjectsStore = createStore<StudySubject[]>('scm_subjects', DEFAULT_SUBJECTS, []);
const notesStore = createStore<Note[]>('scm_notes', [], []);
// Team data now lives in shared `workspaces/{id}` Firestore docs via
// workspaceContext.tsx — no per-user store for members/team tasks.

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

/**
 * useTeam — backed by the active shared workspace (Firestore, real-time).
 *
 * The shape is preserved for backwards compatibility with AIChatPanel.tsx,
 * which uses `addTeamTask`/`moveTask`/`deleteTeamTask`. When no workspace is
 * active yet, members/tasks are empty arrays and mutations are no-ops.
 */
export function useTeam() {
  const { workspace, addTask, moveTask: ctxMoveTask, deleteTask } = useWorkspace();

  // Map shared workspace members to the legacy { id, name, avatar } shape.
  // The AI chat uses members[0]?.name as the default assignee — that still
  // works because the owner is the first member.
  const members = useMemo(() => {
    if (!workspace) return [] as TeamMember[];
    return workspace.memberUids.map(uid => {
      const info = workspace.memberInfo[uid];
      return {
        id: uid,
        name: info?.name || 'Member',
        // Stable colour-emoji per UID; gives every member a distinct chip.
        avatar: info?.photoURL ? '' : '👤',
      } as TeamMember;
    });
  }, [workspace]);

  const tasks = useMemo<TeamTask[]>(() => {
    if (!workspace) return [];
    return workspace.tasks.map(t => ({
      id: t.id,
      title: t.title,
      // Legacy `assignee` was a display name — map UID -> name for old callers.
      assignee: workspace.memberInfo[t.assigneeUid]?.name || 'Member',
      label: t.label,
      status: t.status,
    }));
  }, [workspace]);

  const addTeamTask = useCallback((title: string, assignee: string, label: string) => {
    // Legacy callers pass an assignee NAME. Resolve it to a UID; fall back to
    // the owner so a task is never orphaned.
    const ws = workspace;
    if (!ws) {
      return { id: generateId(), title, assignee, label, status: 'todo' } as TeamTask;
    }
    const matchUid = ws.memberUids.find(uid =>
      (ws.memberInfo[uid]?.name || '').toLowerCase() === assignee.toLowerCase(),
    ) || ws.ownerUid;
    void addTask(title, matchUid, label);
    return {
      id: generateId(), title,
      assignee: ws.memberInfo[matchUid]?.name || assignee,
      label, status: 'todo',
    } as TeamTask;
  }, [workspace, addTask]);

  const moveTask = useCallback((id: string, status: TeamTask['status']) => {
    void ctxMoveTask(id, status);
  }, [ctxMoveTask]);

  const deleteTeamTask = useCallback((id: string) => {
    void deleteTask(id);
  }, [deleteTask]);

  // addMember is intentionally omitted from the new API — adding members is
  // done via inviteMember() on the workspace, not a local add.
  return { members, tasks, addTeamTask, moveTask, deleteTeamTask };
}
