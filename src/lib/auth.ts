import { initializeApp } from 'firebase/app';
import {
  getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut,
  setPersistence, browserLocalPersistence,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Keep the user signed in across page refreshes / browser restarts until they
// explicitly log out. Without this the session can be dropped on reload.
setPersistence(auth, browserLocalPersistence).catch(err =>
  console.error('Failed to set auth persistence:', err)
);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/calendar.events');
// Only ask for consent if there is no valid token already stored.
// Using 'select_account' instead of 'consent' avoids forcing re-grant
// every single sign-in while still letting the user switch accounts.
provider.setCustomParameters({ prompt: 'select_account' });

const TOKEN_KEY = 'scm_gcal_token';
// Google OAuth implicit tokens officially last 3600s.
// We store them with a 58-minute TTL (a little under 1 hour) so the UI
// doesn't show a stale-token banner before the token actually expires.
const TOKEN_TTL_MS = 58 * 60 * 1000;

interface StoredToken {
  accessToken: string;
  expiresAt: number;
}

let isSigningIn = false;

// ─── Token persistence ───────────────────────────────────────────────────────

function saveToken(accessToken: string): void {
  const payload: StoredToken = { accessToken, expiresAt: Date.now() + TOKEN_TTL_MS };
  try { localStorage.setItem(TOKEN_KEY, JSON.stringify(payload)); } catch { /* ignore */ }
  notifyConnectionChange();
}

function readToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredToken;
    if (!parsed.accessToken || !parsed.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearCalendarToken(): void {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  notifyConnectionChange();
}

/** Returns a valid (non-expired) access token, or null if the user must reconnect. */
export const getAccessToken = async (): Promise<string | null> => {
  const stored = readToken();
  if (!stored) return null;
  if (Date.now() >= stored.expiresAt) {
    clearCalendarToken();
    return null;
  }
  return stored.accessToken;
};

/** True when we currently hold a usable Google Calendar token. */
export function isCalendarConnected(): boolean {
  const stored = readToken();
  return !!stored && Date.now() < stored.expiresAt;
}

// ─── Connection-change subscription (so the UI can react to expiry/401) ───────

type ConnectionListener = (connected: boolean) => void;
const connectionListeners = new Set<ConnectionListener>();

function notifyConnectionChange(): void {
  const connected = isCalendarConnected();
  connectionListeners.forEach(cb => { try { cb(connected); } catch { /* ignore */ } });
}

export function onCalendarConnectionChange(cb: ConnectionListener): () => void {
  connectionListeners.add(cb);
  return () => connectionListeners.delete(cb);
}

// ─── Auth flow ───────────────────────────────────────────────────────────────

export interface AuthState {
  user: User | null;
  calendarConnected: boolean;
  /** False until Firebase has restored (or confirmed no) session on load. */
  ready: boolean;
}

let authResolved = false;

// Track which user's data is currently loaded so a restored session + any
// re-fires of onAuthStateChanged don't re-hydrate (and clobber unsaved edits)
// for the same user.
let loadedUid: string | null = null;

async function loadUserSession(uid: string): Promise<void> {
  if (loadedUid === uid) return;
  loadedUid = uid;
  const { beginUserSession } = await import('./store');
  await beginUserSession(uid);
}

/**
 * Subscribes to auth changes. Fires on sign-in/out AND on token expiry so the
 * app can show a "Reconnect Google Calendar" prompt while the user stays
 * logged into Firebase. `ready` is false only during the initial restore.
 */
export const initAuth = (onChange: (state: AuthState) => void) => {
  const unsubConn = onCalendarConnectionChange(() => {
    onChange({ user: auth.currentUser, calendarConnected: isCalendarConnected(), ready: authResolved });
  });
  const unsubAuth = onAuthStateChanged(auth, (user: User | null) => {
    authResolved = true;
    if (!user) {
      clearCalendarToken();
      onChange({ user: null, calendarConnected: false, ready: true });
      return;
    }
    // Whether this is a fresh sign-in or a restored session, load THIS user's
    // data from the cloud. A brand-new user gets a completely empty workspace
    // (no demo data); a returning user gets exactly what they had on logout.
    void loadUserSession(user.uid);
    if (!isSigningIn) {
      // User session was restored from Firebase persistence.
      // Check if we have a valid calendar token in localStorage.
      const connected = isCalendarConnected();
      onChange({ user, calendarConnected: connected, ready: true });
    }
  });
  return () => { unsubConn(); unsubAuth(); };
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  // If we already have a valid token, reuse it — don't force a new consent popup.
  const existing = await getAccessToken();
  if (existing && auth.currentUser) {
    return { user: auth.currentUser, accessToken: existing };
  }

  // For reconnect, force consent so user can re-grant calendar access.
  const reconnectProvider = new GoogleAuthProvider();
  reconnectProvider.addScope('https://www.googleapis.com/auth/calendar.events');
  reconnectProvider.setCustomParameters({ prompt: 'consent' });

  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, reconnectProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google did not return a Calendar access token. Please try again and grant calendar access.');
    }
    saveToken(credential.accessToken);
    return { user: result.user, accessToken: credential.accessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/** Re-runs the Google consent popup to obtain a fresh calendar token. */
export const reconnectCalendar = async (): Promise<boolean> => {
  const result = await googleSignIn();
  return !!result;
};

export const logout = async () => {
  // Save the user's latest data to the cloud, then wipe local stores so the
  // next visitor (or the logged-out demo view) never sees this user's data.
  try {
    const { endUserSession } = await import('./store');
    await endUserSession();
  } catch (err) {
    console.error('Failed to persist data on logout:', err);
  }
  loadedUid = null;
  clearCalendarToken();
  await signOut(auth);
};
