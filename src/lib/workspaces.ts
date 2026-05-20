import { getApp } from 'firebase/app';
import {
  getFirestore, doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  addDoc, query, where, onSnapshot, arrayUnion, arrayRemove, serverTimestamp,
  writeBatch, Unsubscribe,
} from 'firebase/firestore';

/**
 * Shared team workspaces.
 *
 * Schema:
 *   workspaces/{wid}  -- a shared kanban board
 *     name, ownerUid, memberUids: [uid...], memberInfo: { uid: {...} },
 *     tasks: [{ id, title, assigneeUid, label, status }]
 *
 *   invitations/{iid}
 *     workspaceId, workspaceName, inviterUid, inviterEmail,
 *     inviteeEmail (lowercased), status: 'pending'|'accepted'|'declined'
 *
 *   users/{uid}.workspaceIds: [wid...]   -- index of workspaces this user belongs to
 *
 * Invitations are in-app only: no real email is sent. The invitee discovers
 * pending invitations by querying invitations where inviteeEmail == their own
 * email; that is also why we lowercase emails before storing/querying.
 */

const db = getFirestore(getApp());

// ─── Types ───────────────────────────────────────────────────────────────────

export type WorkspaceTaskStatus = 'todo' | 'in-progress' | 'done';

export interface WorkspaceTask {
  id: string;
  title: string;
  assigneeUid: string;
  label: string;
  status: WorkspaceTaskStatus;
}

export interface WorkspaceMemberInfo {
  name: string;
  email: string;
  photoURL?: string;
}

export interface Workspace {
  id: string;
  name: string;
  ownerUid: string;
  memberUids: string[];
  memberInfo: Record<string, WorkspaceMemberInfo>;
  tasks: WorkspaceTask[];
}

export type InvitationStatus = 'pending' | 'accepted' | 'declined';

export interface Invitation {
  id: string;
  workspaceId: string;
  workspaceName: string;
  inviterUid: string;
  inviterEmail: string;
  inviteeEmail: string;
  status: InvitationStatus;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 11);
}

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

// ─── Workspace CRUD ──────────────────────────────────────────────────────────

export async function createWorkspace(
  name: string,
  owner: { uid: string; email: string | null; displayName: string | null; photoURL?: string | null },
): Promise<string> {
  const wid = generateId();
  const memberInfo: Record<string, WorkspaceMemberInfo> = {
    [owner.uid]: {
      name: owner.displayName || owner.email || 'Owner',
      email: owner.email || '',
      photoURL: owner.photoURL || undefined,
    },
  };
  const workspace: Omit<Workspace, 'id'> = {
    name: name.trim() || 'New Workspace',
    ownerUid: owner.uid,
    memberUids: [owner.uid],
    memberInfo,
    tasks: [],
  };
  await setDoc(doc(db, 'workspaces', wid), { ...workspace, createdAt: serverTimestamp() });
  // Add to the owner's index so listWorkspaces() finds it.
  await setDoc(doc(db, 'users', owner.uid), { workspaceIds: arrayUnion(wid) }, { merge: true });
  return wid;
}

/** Returns all workspaces this user is a member of. */
export async function listMyWorkspaces(uid: string): Promise<Workspace[]> {
  const userSnap = await getDoc(doc(db, 'users', uid));
  const ids = (userSnap.data()?.workspaceIds as string[] | undefined) || [];
  if (ids.length === 0) return [];
  const docs = await Promise.all(ids.map(id => getDoc(doc(db, 'workspaces', id))));
  return docs
    .filter(d => d.exists())
    .map(d => ({ id: d.id, ...(d.data() as Omit<Workspace, 'id'>) }));
}

/** Real-time subscribe to a single workspace. Returns unsubscribe. */
export function subscribeWorkspace(
  workspaceId: string,
  onChange: (ws: Workspace | null) => void,
): Unsubscribe {
  return onSnapshot(doc(db, 'workspaces', workspaceId), snap => {
    if (!snap.exists()) { onChange(null); return; }
    onChange({ id: snap.id, ...(snap.data() as Omit<Workspace, 'id'>) });
  }, err => {
    console.error('Workspace subscription failed:', err);
    onChange(null);
  });
}

export async function renameWorkspace(workspaceId: string, name: string): Promise<void> {
  await updateDoc(doc(db, 'workspaces', workspaceId), { name: name.trim() || 'Workspace' });
}

/** Removes a member (or self) from a workspace, and updates their user index. */
export async function removeMember(workspaceId: string, uid: string): Promise<void> {
  const ref = doc(db, 'workspaces', workspaceId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as Workspace;
  const newMemberInfo = { ...data.memberInfo };
  delete newMemberInfo[uid];
  await updateDoc(ref, {
    memberUids: arrayRemove(uid),
    memberInfo: newMemberInfo,
  });
  await setDoc(doc(db, 'users', uid), { workspaceIds: arrayRemove(workspaceId) }, { merge: true });
}

/** Owner-only: delete the entire workspace. */
export async function deleteWorkspace(workspaceId: string): Promise<void> {
  const ref = doc(db, 'workspaces', workspaceId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as Workspace;
  await Promise.all(
    data.memberUids.map(uid =>
      setDoc(doc(db, 'users', uid), { workspaceIds: arrayRemove(workspaceId) }, { merge: true }),
    ),
  );
  await deleteDoc(ref);
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export async function addWorkspaceTask(
  workspaceId: string,
  title: string,
  assigneeUid: string,
  label: string,
): Promise<WorkspaceTask> {
  const task: WorkspaceTask = {
    id: generateId(),
    title: title.trim() || 'New Task',
    assigneeUid,
    label: label.trim() || 'General',
    status: 'todo',
  };
  await updateDoc(doc(db, 'workspaces', workspaceId), { tasks: arrayUnion(task) });
  return task;
}

export async function moveWorkspaceTask(
  workspaceId: string,
  taskId: string,
  status: WorkspaceTaskStatus,
): Promise<void> {
  const ref = doc(db, 'workspaces', workspaceId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const tasks = ((snap.data() as Workspace).tasks || []).map(t =>
    t.id === taskId ? { ...t, status } : t,
  );
  await updateDoc(ref, { tasks });
}

export async function deleteWorkspaceTask(workspaceId: string, taskId: string): Promise<void> {
  const ref = doc(db, 'workspaces', workspaceId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const tasks = ((snap.data() as Workspace).tasks || []).filter(t => t.id !== taskId);
  await updateDoc(ref, { tasks });
}

// ─── Invitations ─────────────────────────────────────────────────────────────

export async function inviteMember(
  workspace: { id: string; name: string },
  inviter: { uid: string; email: string | null },
  inviteeEmail: string,
): Promise<void> {
  const email = normalizeEmail(inviteeEmail);
  if (!email || !email.includes('@')) throw new Error('Please enter a valid email address.');
  await addDoc(collection(db, 'invitations'), {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    inviterUid: inviter.uid,
    inviterEmail: inviter.email || '',
    inviteeEmail: email,
    status: 'pending' as InvitationStatus,
    createdAt: serverTimestamp(),
  });
}

/** All pending invitations addressed to the given email. */
export async function listPendingInvitations(email: string): Promise<Invitation[]> {
  const q = query(
    collection(db, 'invitations'),
    where('inviteeEmail', '==', normalizeEmail(email)),
    where('status', '==', 'pending'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Invitation, 'id'>) }));
}

/** Real-time subscribe to pending invitations for this email. */
export function subscribePendingInvitations(
  email: string,
  onChange: (invites: Invitation[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'invitations'),
    where('inviteeEmail', '==', normalizeEmail(email)),
    where('status', '==', 'pending'),
  );
  return onSnapshot(q, snap => {
    onChange(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Invitation, 'id'>) })));
  }, err => {
    console.error('Invitations subscription failed:', err);
    onChange([]);
  });
}

export async function acceptInvitation(
  invitation: Invitation,
  invitee: { uid: string; email: string | null; displayName: string | null; photoURL?: string | null },
): Promise<void> {
  // We deliberately do NOT read the workspace doc here — a non-member cannot
  // read it under the security rules, which would make accept fail. Instead
  // we add ourselves via arrayUnion + a single keyed field on memberInfo, all
  // in one atomic batch alongside the user-index update and the invitation
  // status change. The security rules permit this specific shape (non-member
  // adding only themselves while there is a matching pending invitation).
  const wsRef = doc(db, 'workspaces', invitation.workspaceId);
  const userRef = doc(db, 'users', invitee.uid);
  const invRef = doc(db, 'invitations', invitation.id);

  const myInfo = {
    name: invitee.displayName || invitee.email || 'Member',
    email: invitee.email || '',
    ...(invitee.photoURL ? { photoURL: invitee.photoURL } : {}),
  };

  const batch = writeBatch(db);
  batch.update(wsRef, {
    memberUids: arrayUnion(invitee.uid),
    // Dotted field path writes a single key inside the memberInfo map without
    // touching other members' entries (which we couldn't read anyway).
    [`memberInfo.${invitee.uid}`]: myInfo,
  });
  batch.set(userRef, { workspaceIds: arrayUnion(invitation.workspaceId) }, { merge: true });
  batch.update(invRef, { status: 'accepted' });

  try {
    await batch.commit();
  } catch (err: any) {
    // Surface a useful error so the UI can show it instead of silently failing.
    const msg = err?.code === 'permission-denied'
      ? 'Accept was blocked by Firestore security rules. Update the rules to allow non-members with a matching pending invitation to add themselves.'
      : (err?.message || 'Failed to accept invitation.');
    throw new Error(msg);
  }
}

export async function declineInvitation(invitationId: string): Promise<void> {
  await updateDoc(doc(db, 'invitations', invitationId), { status: 'declined' });
}
