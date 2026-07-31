import type { CalendarEvent, GoogleCalendar } from "./types";

type CalendarErrorPayload = {
  error?: string;
  code?: string;
  reconnect?: boolean;
  connectUrl?: string;
};

export class CalendarClientError extends Error {
  readonly code: string;
  readonly reconnect: boolean;
  readonly connectUrl: string;

  constructor(payload: CalendarErrorPayload, fallback: string) {
    super(payload.error || fallback);
    this.name = "CalendarClientError";
    this.code = payload.code || "calendar_error";
    this.reconnect = Boolean(payload.reconnect);
    this.connectUrl = payload.connectUrl || "";
  }
}

async function json<T>(response: Response, fallback: string): Promise<T> {
  let payload: (T & CalendarErrorPayload) | CalendarErrorPayload = {};
  try {
    payload = (await response.json()) as T & CalendarErrorPayload;
  } catch {
    // Die API antwortet üblicherweise mit JSON; der deutsche Fallback bleibt lesbar.
  }
  if (!response.ok) throw new CalendarClientError(payload, fallback);
  return payload as T;
}

export async function listGoogleCalendars(): Promise<GoogleCalendar[]> {
  const payload = await json<{ calendars: GoogleCalendar[] }>(
    await fetch("/api/calendar/calendars", { cache: "no-store" }),
    "Die Google-Kalender konnten nicht geladen werden.",
  );
  return Array.isArray(payload.calendars) ? payload.calendars : [];
}

export async function createGoogleCalendar(input: {
  name: string;
  description?: string;
  timeZone?: string;
}): Promise<GoogleCalendar> {
  const payload = await json<{ calendar: GoogleCalendar }>(
    await fetch("/api/calendar/calendars", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Der neue Google-Kalender konnte nicht angelegt werden.",
  );
  return payload.calendar;
}

export async function listSelectedCalendarEvents(
  calendarIds: string[],
  window?: { timeMin: string; timeMax: string },
): Promise<CalendarEvent[]> {
  const query = new URLSearchParams();
  for (const calendarId of calendarIds.slice(0, 12)) {
    query.append("calendarId", calendarId);
  }
  if (window) {
    query.set("timeMin", window.timeMin);
    query.set("timeMax", window.timeMax);
  }
  const payload = await json<{ events: CalendarEvent[] }>(
    await fetch(`/api/calendar?${query.toString()}`, { cache: "no-store" }),
    "Die ausgewählten Kalender konnten nicht geladen werden.",
  );
  return Array.isArray(payload.events) ? payload.events : [];
}

export async function updateGoogleCalendarEvent(
  event: CalendarEvent,
  update: Partial<
    Pick<
      CalendarEvent,
      | "title"
      | "startAt"
      | "endAt"
      | "kind"
      | "location"
      | "note"
      | "reminderMinutes"
      | "desiredHash"
      | "sourceOccurrence"
      | "managedCalendarKey"
    >
  >,
): Promise<CalendarEvent> {
  if (!event.calendarId || !event.googleEventId) {
    throw new CalendarClientError(
      { error: "Dem Termin fehlt seine sichere Google-Verknüpfung." },
      "Der Termin konnte nicht aktualisiert werden.",
    );
  }
  const payload = await json<{ event: CalendarEvent }>(
    await fetch(
      `/api/calendar/events/${encodeURIComponent(event.googleEventId)}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...(event.etag ? { "if-match": event.etag } : {}),
        },
        body: JSON.stringify({ ...update, calendarId: event.calendarId }),
      },
    ),
    "Der Termin konnte nicht aktualisiert werden.",
  );
  return payload.event;
}

export async function deleteGoogleCalendarEvent(
  event: CalendarEvent,
): Promise<void> {
  if (!event.calendarId || !event.googleEventId) {
    throw new CalendarClientError(
      { error: "Dem Termin fehlt seine sichere Google-Verknüpfung." },
      "Der Termin konnte nicht gelöscht werden.",
    );
  }
  const query = new URLSearchParams({ calendarId: event.calendarId });
  await json<{ ok: true }>(
    await fetch(
      `/api/calendar/events/${encodeURIComponent(event.googleEventId)}?${query}`,
      {
        method: "DELETE",
        headers: event.etag ? { "if-match": event.etag } : undefined,
      },
    ),
    "Der Termin konnte nicht gelöscht werden.",
  );
}
