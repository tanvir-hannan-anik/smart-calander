import { getAccessToken } from './auth';

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
}

export const listUpcomingEvents = async (): Promise<CalendarEvent[]> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const timeMin = new Date().toISOString();
  
  // We specify timeMin to get upcoming events, maxResults to limit it, singleEvents to expand recurring
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&maxResults=20&orderBy=startTime&singleEvents=true`;
  
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!res.ok) {
    throw new Error('Failed to fetch calendar events');
  }

  const data = await res.json();
  return data.items || [];
};

export const createCalendarEvent = async (summary: string, start: Date, end: Date, description: string = '') => {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const event = {
    summary,
    description,
    start: {
      dateTime: start.toISOString(),
    },
    end: {
      dateTime: end.toISOString(),
    },
  };

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });

  if (!res.ok) {
    throw new Error('Failed to create event');
  }

  return await res.json();
};
