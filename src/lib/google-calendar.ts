import {
  clearWorkspaceAccessToken,
  connectGoogleWorkspace,
  getWorkspaceAccessToken,
  parseGoogleApiError,
  setWorkspaceAccessToken,
} from './google-workspace-auth';

export interface CalendarReminderOverride {
  method: 'popup' | 'email';
  minutes: number;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  htmlLink?: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  reminders?: {
    useDefault: boolean;
    overrides?: CalendarReminderOverride[];
  };
  colorId?: string;
  calendarId?: string;
  isReminder?: boolean;
  createdAt?: string;
}

export type CalendarEventPayload = {
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  reminderMinutes?: number[];
  colorId?: string;
  calendarId?: string;
};

export interface CalendarListEntry {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  backgroundColor?: string;
  foregroundColor?: string;
  timeZone?: string;
}

export function getCachedCalendarToken(): string | null {
  return getWorkspaceAccessToken();
}

export function setCachedCalendarToken(token: string | null): void {
  setWorkspaceAccessToken(token);
}

export async function connectGoogleCalendar(): Promise<{ accessToken: string; userEmail?: string } | null> {
  return connectGoogleWorkspace();
}

export function disconnectGoogleCalendar(): void {
  clearWorkspaceAccessToken();
}

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

async function fetchCalendarApi(endpoint: string, options: RequestInit = {}): Promise<any> {
  const token = getCachedCalendarToken();
  if (!token) {
    throw new Error('Google Calendar is not connected. Please sign in with Google.');
  }

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${CALENDAR_API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    clearWorkspaceAccessToken();
    throw new Error(await parseGoogleApiError(res, 'Google Calendar'));
  }

  if (res.status === 403) {
    const errMsg = await parseGoogleApiError(res, 'Google Calendar');
    if (errMsg.toLowerCase().includes('insufficient') || errMsg.toLowerCase().includes('scope')) {
      clearWorkspaceAccessToken();
    }
    throw new Error(errMsg);
  }

  if (res.status === 204) {
    return { success: true };
  }

  if (!res.ok) {
    throw new Error(await parseGoogleApiError(res, 'Google Calendar'));
  }

  return res.json();
}

export async function listUserCalendars(): Promise<CalendarListEntry[]> {
  const data = await fetchCalendarApi('/users/me/calendarList');
  return (data.items || []).map((item: any) => ({
    id: item.id,
    summary: item.summary,
    description: item.description,
    primary: item.primary,
    backgroundColor: item.backgroundColor,
    foregroundColor: item.foregroundColor,
    timeZone: item.timeZone,
  }));
}

export async function listCalendarEvents(params: {
  calendarId?: string;
  timeMin?: string;
  timeMax?: string;
  q?: string;
  maxResults?: number;
  singleEvents?: boolean;
  orderBy?: 'startTime' | 'updated';
} = {}): Promise<CalendarEvent[]> {
  const calendarId = encodeURIComponent(params.calendarId || 'primary');
  const queryParams = new URLSearchParams({
    singleEvents: params.singleEvents !== false ? 'true' : 'false',
    orderBy: params.orderBy || 'startTime',
    maxResults: String(params.maxResults || 250),
  });

  if (params.timeMin) queryParams.set('timeMin', params.timeMin);
  if (params.timeMax) queryParams.set('timeMax', params.timeMax);
  if (params.q) queryParams.set('q', params.q);

  const data = await fetchCalendarApi(`/calendars/${calendarId}/events?${queryParams.toString()}`);

  return (data.items || []).map((item: any) => ({
    id: item.id,
    summary: item.summary || 'Untitled',
    description: item.description,
    location: item.location,
    start: item.start || {},
    end: item.end || {},
    htmlLink: item.htmlLink,
    status: item.status,
    reminders: item.reminders,
    colorId: item.colorId,
    calendarId: params.calendarId || 'primary',
  }));
}

export async function createCalendarEvent(
  eventData: {
    summary: string;
    description?: string;
    location?: string;
    start: { dateTime?: string; date?: string; timeZone?: string };
    end: { dateTime?: string; date?: string; timeZone?: string };
    reminderMinutes?: number[];
    colorId?: string;
    calendarId?: string;
  }
): Promise<CalendarEvent> {
  const calendarId = encodeURIComponent(eventData.calendarId || 'primary');

  const payload: any = {
    summary: eventData.summary,
    description: eventData.description,
    location: eventData.location,
    start: eventData.start,
    end: eventData.end,
    colorId: eventData.colorId,
  };

  if (eventData.reminderMinutes && eventData.reminderMinutes.length > 0) {
    payload.reminders = {
      useDefault: false,
      overrides: eventData.reminderMinutes.map((mins) => ({
        method: 'popup',
        minutes: mins,
      })),
    };
  }

  const result = await fetchCalendarApi(`/calendars/${calendarId}/events`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return {
    id: result.id,
    summary: result.summary,
    description: result.description,
    location: result.location,
    start: result.start || {},
    end: result.end || {},
    htmlLink: result.htmlLink,
    status: result.status,
    reminders: result.reminders,
    colorId: result.colorId,
    calendarId: eventData.calendarId || 'primary',
  };
}

export async function updateCalendarEvent(
  eventId: string,
  eventData: Partial<{
    summary: string;
    description: string;
    location: string;
    start: { dateTime?: string; date?: string; timeZone?: string };
    end: { dateTime?: string; date?: string; timeZone?: string };
    reminderMinutes: number[];
    colorId: string;
  }>,
  calendarId: string = 'primary'
): Promise<CalendarEvent> {
  const encodedCalId = encodeURIComponent(calendarId);
  const payload: any = {};

  if (eventData.summary !== undefined) payload.summary = eventData.summary;
  if (eventData.description !== undefined) payload.description = eventData.description;
  if (eventData.location !== undefined) payload.location = eventData.location;
  if (eventData.start) payload.start = eventData.start;
  if (eventData.end) payload.end = eventData.end;
  if (eventData.colorId !== undefined) payload.colorId = eventData.colorId;

  if (eventData.reminderMinutes) {
    payload.reminders = {
      useDefault: false,
      overrides: eventData.reminderMinutes.map((mins) => ({
        method: 'popup',
        minutes: mins,
      })),
    };
  }

  const result = await fetchCalendarApi(`/calendars/${encodedCalId}/events/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

  return {
    id: result.id,
    summary: result.summary,
    description: result.description,
    location: result.location,
    start: result.start || {},
    end: result.end || {},
    htmlLink: result.htmlLink,
    status: result.status,
    reminders: result.reminders,
    colorId: result.colorId,
    calendarId,
  };
}

export async function deleteCalendarEvent(eventId: string, calendarId: string = 'primary'): Promise<boolean> {
  const encodedCalId = encodeURIComponent(calendarId);
  await fetchCalendarApi(`/calendars/${encodedCalId}/events/${eventId}`, {
    method: 'DELETE',
  });
  return true;
}

export async function checkCalendarFreeBusy(params: {
  timeMin: string;
  timeMax: string;
  calendarIds?: string[];
}): Promise<any> {
  const items = (params.calendarIds || ['primary']).map((id) => ({ id }));
  return fetchCalendarApi('/freeBusy', {
    method: 'POST',
    body: JSON.stringify({
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      items,
    }),
  });
}

const LOCAL_REMINDERS_KEY = 'igseek:local_reminders';

function normalizeLocalReminder(raw: any): CalendarEvent {
  const startIso =
    raw?.start?.dateTime ||
    raw?.start?.date ||
    raw?.startTime ||
    raw?.createdAt ||
    new Date().toISOString();
  const parsedStart = new Date(startIso);
  const safeStartIso = !Number.isNaN(parsedStart.getTime()) ? parsedStart.toISOString() : new Date().toISOString();
  const endRaw = raw?.end?.dateTime || raw?.end?.date || raw?.endTime;
  const parsedEnd = endRaw ? new Date(endRaw) : new Date(new Date(safeStartIso).getTime() + 3600_000);
  const safeEndIso = !Number.isNaN(parsedEnd.getTime())
    ? parsedEnd.toISOString()
    : new Date(new Date(safeStartIso).getTime() + 3600_000).toISOString();

  return {
    id: raw?.id || `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    summary: String(raw?.summary || 'Reminder'),
    description: raw?.description,
    location: raw?.location,
    start: raw?.start?.dateTime || raw?.start?.date ? raw.start : { dateTime: safeStartIso },
    end: raw?.end?.dateTime || raw?.end?.date ? raw.end : { dateTime: safeEndIso },
    reminders: raw?.reminders,
    colorId: raw?.colorId,
    calendarId: raw?.calendarId,
    isReminder: raw?.isReminder ?? true,
    createdAt: raw?.createdAt || new Date().toISOString(),
  };
}

export function getLocalReminders(): CalendarEvent[] {
  try {
    const raw = localStorage.getItem(LOCAL_REMINDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeLocalReminder);
  } catch {
    return [];
  }
}

export function saveLocalReminder(event: Omit<CalendarEvent, 'id'> & { id?: string }): CalendarEvent {
  const list = getLocalReminders();
  const newEvt = normalizeLocalReminder({
    ...event,
    id: event.id || `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    createdAt: new Date().toISOString(),
  });
  const updated = [newEvt, ...list.filter((item) => item.id !== newEvt.id)];
  try {
    localStorage.setItem(LOCAL_REMINDERS_KEY, JSON.stringify(updated));
  } catch {
  }
  window.dispatchEvent(new CustomEvent('igseek:local-reminders-updated'));
  return newEvt;
}

export function deleteLocalReminder(id: string): void {
  const list = getLocalReminders();
  const updated = list.filter((item) => item.id !== id);
  try {
    localStorage.setItem(LOCAL_REMINDERS_KEY, JSON.stringify(updated));
  } catch {
  }
  window.dispatchEvent(new CustomEvent('igseek:local-reminders-updated'));
}
