import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  ReactNode,
} from 'react';
import { auth } from './auth';
import {
  Workspace, WorkspaceTask, WorkspaceTaskStatus,
  listMyWorkspaces, subscribeWorkspace,
  createWorkspace as fsCreateWorkspace,
  addWorkspaceTask, moveWorkspaceTask, deleteWorkspaceTask,
} from './workspaces';

/**
 * React context that holds the currently-active shared workspace and exposes
 * the same operations TeamWorkspace.tsx and the AI chat panel were already
 * using locally, so existing call sites keep working.
 *
 * When the user is signed out, or hasn't created/joined any workspace yet,
 * `workspace` is null and write operations are no-ops (with a console hint).
 * That keeps the AI assistant from crashing if it tries to add a team task
 * before a workspace exists.
 */

interface WorkspaceContextValue {
  /** All workspaces the current user is a member of. */
  workspaces: Workspace[];
  /** The active workspace (or null if none selected/exists). */
  workspace: Workspace | null;
  /** True while initial workspace list / subscription is loading. */
  loading: boolean;

  setActiveWorkspaceId: (id: string | null) => void;
  refreshWorkspaces: () => Promise<void>;

  // Mutations against the active workspace. No-op + console warn when null.
  createWorkspace: (name: string) => Promise<string | null>;
  addTask: (title: string, assigneeUid: string, label: string) => Promise<WorkspaceTask | null>;
  moveTask: (taskId: string, status: WorkspaceTaskStatus) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
}

const Ctx = createContext<WorkspaceContextValue | null>(null);

const ACTIVE_KEY = 'scm_active_workspace_id';

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(
    () => (typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_KEY) : null),
  );
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const subRef = useRef<(() => void) | null>(null);

  const setActiveWorkspaceId = useCallback((id: string | null) => {
    setActiveIdState(id);
    try {
      if (id) localStorage.setItem(ACTIVE_KEY, id);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch { /* ignore */ }
  }, []);

  const refreshWorkspaces = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      setWorkspaces([]);
      setWorkspace(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await listMyWorkspaces(user.uid);
      setWorkspaces(list);
      // Pick an active workspace: stored id if still valid, else the first one.
      const stored = typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_KEY) : null;
      const validStored = stored && list.find(w => w.id === stored) ? stored : null;
      const nextActive = validStored || list[0]?.id || null;
      setActiveWorkspaceId(nextActive);
    } catch (err) {
      console.error('Failed to load workspaces:', err);
    } finally {
      setLoading(false);
    }
  }, [setActiveWorkspaceId]);

  // Refresh when auth state changes.
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(() => { void refreshWorkspaces(); });
    return () => unsub();
  }, [refreshWorkspaces]);

  // Real-time subscribe to the active workspace.
  useEffect(() => {
    if (subRef.current) { subRef.current(); subRef.current = null; }
    if (!activeId) { setWorkspace(null); return; }
    subRef.current = subscribeWorkspace(activeId, ws => setWorkspace(ws));
    return () => { if (subRef.current) { subRef.current(); subRef.current = null; } };
  }, [activeId]);

  const createWorkspace = useCallback(async (name: string) => {
    const user = auth.currentUser;
    if (!user) { console.warn('Cannot create workspace: not signed in.'); return null; }
    const id = await fsCreateWorkspace(name, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
    });
    await refreshWorkspaces();
    setActiveWorkspaceId(id);
    return id;
  }, [refreshWorkspaces, setActiveWorkspaceId]);

  const addTask = useCallback(async (title: string, assigneeUid: string, label: string) => {
    if (!activeId) { console.warn('No active workspace — create one first.'); return null; }
    return addWorkspaceTask(activeId, title, assigneeUid, label);
  }, [activeId]);

  const moveTask = useCallback(async (taskId: string, status: WorkspaceTaskStatus) => {
    if (!activeId) { console.warn('No active workspace.'); return; }
    return moveWorkspaceTask(activeId, taskId, status);
  }, [activeId]);

  const deleteTask = useCallback(async (taskId: string) => {
    if (!activeId) { console.warn('No active workspace.'); return; }
    return deleteWorkspaceTask(activeId, taskId);
  }, [activeId]);

  const value: WorkspaceContextValue = useMemo(() => ({
    workspaces,
    workspace,
    loading,
    setActiveWorkspaceId,
    refreshWorkspaces,
    createWorkspace,
    addTask,
    moveTask,
    deleteTask,
  }), [workspaces, workspace, loading, setActiveWorkspaceId, refreshWorkspaces,
       createWorkspace, addTask, moveTask, deleteTask]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWorkspace must be used inside <WorkspaceProvider>');
  return v;
}
