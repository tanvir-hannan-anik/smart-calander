import { getAccessToken, clearCalendarToken } from './auth';

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
}

export interface EventReminder {
  method: 'popup' | 'email';
  minutes: number;
}

/**
 * Reminders attached automatically to every event we create.
 * Chosen default: an email 1 day before + a popup 30 min before.
 */
export const DEFAULT_REMINDERS: EventReminder[] = [
  { method: 'email', minutes: 24 * 60 },
  { method: 'popup', minutes: 30 },
];

/** Thrown when the Google Calendar token is missing/expired/denied. */
export class CalendarAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalendarAuthError';
  }
}

const localTimeZone =
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

async function authHeader(): Promise<string> {
  const token = await getAccessToken();
  if (!token) {
    throw new CalendarAuthError('Your Google Calendar session has expired. Please reconnect your Google account.');
  }
  return `Bearer ${token}`;
}

async function handleErrorResponse(res: Response): Promise<never> {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error?.message || '';
  } catch { /* ignore */ }

  if (res.status === 401) {
    clearCalendarToken();
    throw new CalendarAuthError('Your Google Calendar session expired. Please reconnect your Google account.');
  }
  if (res.status === 403) {
    // "API not enabled" is a project config issue, NOT an auth issue.
    // Don't clear the token — the user's credentials are fine.
    if (detail.toLowerCase().includes('api') && detail.toLowerCase().includes('not been used')) {
      throw new Error(
        '⚙️ The Google Calendar API is not enabled for this project. ' +
        'Go to Google Cloud Console → APIs & Services → Library → search "Google Calendar API" → Enable it.'
      );
    }
    if (detail.toLowerCase().includes('disabled')) {
      throw new Error(
        '⚙️ The Google Calendar API is disabled. Please enable it in Google Cloud Console → APIs & Services → Library.'
      );
    }
    // Auth-related 403 (insufficient scope, denied, etc.) — clear token
    clearCalendarToken();
    throw new CalendarAuthError(
      detail.includes('insufficient')
        ? 'Calendar permission was not granted. Please reconnect and allow calendar access.'
        : 'Google Calendar access was denied. Please reconnect your account.'
    );
  }
  throw new Error(detail || `Google Calendar request failed (${res.status}).`);
}

export const listUpcomingEvents = async (): Promise<CalendarEvent[]> => {
  const Authorization = await authHeader();
  const timeMin = new Date().toISOString();
  const url =
    `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
    `?timeMin=${encodeURIComponent(timeMin)}&maxResults=50&orderBy=startTime&singleEvents=true`;

  const res = await fetch(url, { headers: { Authorization } });
  if (!res.ok) await handleErrorResponse(res);

  const data = await res.json();
  return data.items || [];
};

export const createCalendarEvent = async (
  summary: string,
  start: Date,
  end: Date,
  description: string = '',
  reminders: EventReminder[] = DEFAULT_REMINDERS,
) => {
  const Authorization = await authHeader();

  const event = {
    summary,
    description,
    start: { dateTime: start.toISOString(), timeZone: localTimeZone },
    end: { dateTime: end.toISOString(), timeZone: localTimeZone },
    reminders: {
      useDefault: false,
      overrides: reminders.map(r => ({ method: r.method, minutes: r.minutes })),
    },
  };

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });

  if (!res.ok) await handleErrorResponse(res);
  return await res.json();
};

/** Human-readable summary of the default reminders, for UI hints. */
export function describeReminders(reminders: EventReminder[] = DEFAULT_REMINDERS): string {
  const fmt = (m: number) =>
    m % (24 * 60) === 0 ? `${m / (24 * 60)} day` :
    m % 60 === 0 ? `${m / 60} hr` : `${m} min`;
  return reminders.map(r => `${r.method} ${fmt(r.minutes)} before`).join(' · ');
}
