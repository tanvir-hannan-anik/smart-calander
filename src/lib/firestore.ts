import { getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

/**
 * Per-user cloud persistence.
 *
 * All of a user's app data (tasks, habits, subjects, notes, team) is stored in
 * a single Firestore document at `users/{uid}`. We read it on login and write
 * it on logout (and periodically while signed in). One document keeps reads
 * cheap and the data model dead simple — there is no relational querying need.
 */

// Reuse the Firebase app already initialised in auth.ts.
const db = getFirestore(getApp());

/**
 * The whole app state we persist per user, keyed by the same keys the store
 * uses for localStorage (e.g. `scm_tasks`). Kept as an open record so the
 * store layer stays the single source of truth for which keys exist.
 */
export type UserData = Record<string, unknown>;

/**
 * Loads a user's saved data from Firestore.
 * Returns `null` for a brand-new user (no document yet) so callers can start
 * them with a completely empty workspace rather than demo data.
 */
export async function loadUserData(uid: string): Promise<UserData | null> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    return snap.data() as UserData;
  } catch (err) {
    console.error('Failed to load user data from Firestore:', err);
    // On a load failure we return null; the caller treats it like a new user
    // (empty) rather than silently overwriting cloud data with stale local data.
    return null;
  }
}

/** Saves (overwrites) a user's data document in Firestore. */
export async function saveUserData(uid: string, data: UserData): Promise<void> {
  try {
    await setDoc(doc(db, 'users', uid), data, { merge: true });
  } catch (err) {
    console.error('Failed to save user data to Firestore:', err);
    throw err;
  }
}
