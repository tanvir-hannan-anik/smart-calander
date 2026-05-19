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
// Ask for offline-ish consent every time we explicitly reconnect so the user
// can re-grant calendar access when the short-lived token expires.
provider.setCustomParameters({ prompt: 'consent' });

const TOKEN_KEY = 'scm_gcal_token';
// Google OAuth implicit tokens last ~3600s; refresh a little early for safety.
const TOKEN_TTL_MS = 55 * 60 * 1000;

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
    if (!user) clearCalendarToken();
    if (!isSigningIn) {
      onChange({ user, calendarConnected: !!user && isCalendarConnected(), ready: true });
    }
  });
  return () => { unsubConn(); unsubAuth(); };
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
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
  clearCalendarToken();
  await signOut(auth);
};
