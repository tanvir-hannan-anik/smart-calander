import { getApp } from 'firebase/app';
import {
  getFirestore, doc, collection, collectionGroup, getDoc, getDocs, setDoc,
  updateDoc, deleteDoc, query, where, onSnapshot, arrayUnion, arrayRemove,
  serverTimestamp, writeBatch, Unsubscribe,
} from 'firebase/firestore';

/**
 * Shared team workspaces.
 *
 * Schema:
 *   workspaces/{wid}  -- a shared kanban board
 *     name, ownerUid, memberUids: [uid...], memberInfo: { uid: {...} },
 *     tasks: [{ id, title, assigneeUid, label, status }]
 *
 *   workspaces/{wid}/invitations/{normalizedEmail}   -- ONE invite per email/ws
 *     workspaceId, workspaceName, inviterUid, inviterEmail,
 *     inviteeEmail (lowercased), status: 'pending'|'accepted'|'declined'
 *
 *   users/{uid}.workspaceIds: [wid...]   -- index of workspaces this user belongs to
 *
 * Invitations live as a subcollection of the workspace with the invitee's
 * lowercased email as the document ID. That gives us two properties the
 * security rules rely on:
 *   1. There is at most one pending invitation per email per workspace
 *      (re-invite simply overwrites the previous record), and
 *   2. The workspace-update rule can verify the invitation exists at a
 *      KNOWN path (no cross-collection query required from rules).
 *
 * To find all pending invitations across every workspace for the current
 * user, we use a collectionGroup('invitations') query filtered by
 * inviteeEmail. Firestore will prompt for a one-time composite index.
 *
 * No real email is sent (in-app invitations only). The invitee discovers
 * pending invitations the next time they open the app.
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
  // Path: workspaces/{wid}/invitations/{email} — using the email as the doc
  // ID lets the security rules verify the invitation exists at a known path
  // when the invitee tries to join, and naturally caps invites at one per
  // email per workspace.
  const ref = doc(db, 'workspaces', workspace.id, 'invitations', email);
  await setDoc(ref, {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    inviterUid: inviter.uid,
    inviterEmail: inviter.email || '',
    inviteeEmail: email,
    status: 'pending' as InvitationStatus,
    createdAt: serverTimestamp(),
  });
}

/** All pending invitations addressed to the given email (across all workspaces). */
export async function listPendingInvitations(email: string): Promise<Invitation[]> {
  const q = query(
    collectionGroup(db, 'invitations'),
    where('inviteeEmail', '==', normalizeEmail(email)),
    where('status', '==', 'pending'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Invitation, 'id'>) }));
}

/** Real-time subscribe to pending invitations for this email. */
export function subscribePendingInvitations(
  email: string,
  onChange: (invites: Invitation[], error?: string) => void,
): Unsubscribe {
  const normalized = normalizeEmail(email);
  console.log('[invitations] subscribing for', normalized);
  const q = query(
    collectionGroup(db, 'invitations'),
    where('inviteeEmail', '==', normalized),
    where('status', '==', 'pending'),
  );
  return onSnapshot(q, snap => {
    const invites = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Invitation, 'id'>) }));
    console.log(`[invitations] received ${invites.length} pending for ${normalized}`);
    onChange(invites);
  }, err => {
    // The two real reasons this fails:
    //   • failed-precondition  -> composite index missing (one-click link in the
    //     error message); the query silently returns nothing until the index exists.
    //   • permission-denied    -> security rules don't allow the read.
    const code = (err as any)?.code || 'unknown';
    const msg = (err as any)?.message || String(err);
    console.error(`[invitations] subscription failed (${code}):`, msg);
    let hint = msg;
    if (code === 'failed-precondition' || /index/i.test(msg)) {
      hint = 'Firestore needs a composite index for the invitations query. Open the browser console — the error above contains a one-click link to create it.';
    } else if (code === 'permission-denied') {
      hint = 'Firestore security rules are blocking the invitations read. Update the rules to allow the invitee to read invitations addressed to their email.';
    }
    onChange([], hint);
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
  // The invitation doc id IS the lowercased invitee email — exactly the path
  // the security rules check via exists() to authorise the self-add.
  const invRef = doc(db, 'workspaces', invitation.workspaceId, 'invitations', invitation.id);

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

export async function declineInvitation(workspaceId: string, invitationId: string): Promise<void> {
  await updateDoc(
    doc(db, 'workspaces', workspaceId, 'invitations', invitationId),
    { status: 'declined' },
  );
}
