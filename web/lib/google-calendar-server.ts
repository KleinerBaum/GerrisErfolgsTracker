import {
  authorizedGoogleFetch,
  GoogleApiError,
  GoogleValidationError,
  type GoogleConnection,
} from "./google-workspace-server";
import type { CalendarEvent } from "./types";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const DEFAULT_TIME_ZONE = "Europe/Berlin";
const LOOKBACK_MILLISECONDS = 24 * 60 * 60 * 1_000;
const HORIZON_MILLISECONDS = 45 * 24 * 60 * 60 * 1_000;
const MAX_PAGE_RESULTS = 2_500;
const MAX_PAGES = 20;

const EVENT_KINDS = new Set<CalendarEvent["kind"]>([
  "appointment",
  "focus",
  "payment",
]);

type GoogleEventDate = {
  date?: string;
  dateTime?: string;
  timeZone?: string;
};

type GoogleEventReminder = {
  method?: string;
  minutes?: number;
};

type GoogleCalendarEvent = {
  id?: string;
  status?: string;
  visibility?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleEventDate;
  end?: GoogleEventDate;
  extendedProperties?: {
    private?: Record<string, string>;
  };
  reminders?: {
    useDefault?: boolean;
    overrides?: GoogleEventReminder[];
  };
};

type GoogleCalendarPage = {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
  timeZone?: string;
};

export type CreateCalendarEventInput = {
  title: string;
  startAt: string;
  endAt: string;
  kind?: CalendarEvent["kind"];
  location?: string;
  note?: string;
  reminderMinutes?: number;
  timeZone?: string;
};

function calendarId(): string {
  return (
    process.env.GOOGLE_CALENDAR_ID?.trim() ||
    process.env.CAL_GERRI_ID?.trim() ||
    "primary"
  );
}

function calendarUrl(): URL {
  return new URL(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId())}/events`,
  );
}

function nonEmptyString(
  value: unknown,
  fieldName: string,
  maximumLength: number,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new GoogleValidationError(`${fieldName} fehlt.`);
  }
  const result = value.trim();
  if (result.length > maximumLength) {
    throw new GoogleValidationError(
      `${fieldName} darf höchstens ${maximumLength} Zeichen enthalten.`,
    );
  }
  return result;
}

function optionalString(
  value: unknown,
  fieldName: string,
  maximumLength: number,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new GoogleValidationError(`${fieldName} ist ungültig.`);
  }
  const result = value.trim();
  if (result.length > maximumLength) {
    throw new GoogleValidationError(
      `${fieldName} darf höchstens ${maximumLength} Zeichen enthalten.`,
    );
  }
  return result || undefined;
}

function validIsoDate(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new GoogleValidationError(`${fieldName} fehlt.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new GoogleValidationError(`${fieldName} ist kein gültiger Zeitpunkt.`);
  }
  return date.toISOString();
}

function validTimeZone(value: unknown): string | undefined {
  const timeZone = optionalString(value, "Die Zeitzone", 100);
  if (!timeZone) return undefined;
  try {
    new Intl.DateTimeFormat("de-DE", { timeZone }).format();
    return timeZone;
  } catch {
    throw new GoogleValidationError("Die Zeitzone ist ungültig.");
  }
}

function validKind(value: unknown): CalendarEvent["kind"] {
  if (value === undefined || value === null || value === "") {
    return "appointment";
  }
  if (typeof value !== "string" || !EVENT_KINDS.has(value as CalendarEvent["kind"])) {
    throw new GoogleValidationError("Die Terminart ist ungültig.");
  }
  return value as CalendarEvent["kind"];
}

function validReminder(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 40_320
  ) {
    throw new GoogleValidationError(
      "Die Erinnerung muss zwischen 0 und 40.320 Minuten liegen.",
    );
  }
  return value;
}

export function parseCreateCalendarEventInput(
  value: unknown,
): CreateCalendarEventInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GoogleValidationError("Die Termindaten fehlen.");
  }
  const input = value as Record<string, unknown>;
  const startAt = validIsoDate(input.startAt, "Der Beginn");
  const endAt = validIsoDate(input.endAt, "Das Ende");
  if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
    throw new GoogleValidationError("Das Ende muss nach dem Beginn liegen.");
  }
  return {
    title: nonEmptyString(input.title, "Der Titel", 1_024),
    startAt,
    endAt,
    kind: validKind(input.kind),
    location: optionalString(input.location, "Der Ort", 1_024),
    note: optionalString(input.note, "Die Notiz", 20_000),
    reminderMinutes: validReminder(input.reminderMinutes),
    timeZone: validTimeZone(input.timeZone),
  };
}

function zonedMidnight(date: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const desired = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  let candidate = desired;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    for (let index = 0; index < 2; index += 1) {
      const parts = formatter
        .formatToParts(new Date(candidate))
        .reduce<Record<string, string>>((result, part) => {
          if (part.type !== "literal") result[part.type] = part.value;
          return result;
        }, {});
      const displayed = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
        Number(parts.second),
      );
      candidate += desired - displayed;
    }
    return new Date(candidate).toISOString();
  } catch {
    return new Date(desired).toISOString();
  }
}

function googleDateToIso(
  value: GoogleEventDate | undefined,
  calendarTimeZone: string,
): string | null {
  if (value?.dateTime) {
    const parsed = new Date(value.dateTime);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (value?.date) {
    return zonedMidnight(
      value.date,
      value.timeZone || calendarTimeZone || DEFAULT_TIME_ZONE,
    );
  }
  return null;
}

function eventKind(value: GoogleCalendarEvent): CalendarEvent["kind"] {
  const kind = value.extendedProperties?.private?.gerrisKind;
  return typeof kind === "string" &&
    EVENT_KINDS.has(kind as CalendarEvent["kind"])
    ? (kind as CalendarEvent["kind"])
    : "appointment";
}

function reminderMinutes(value: GoogleCalendarEvent): number | undefined {
  const reminder = value.reminders?.overrides?.find(
    (candidate) =>
      (candidate.method === "popup" || candidate.method === "email") &&
      typeof candidate.minutes === "number",
  );
  return reminder?.minutes;
}

function toCalendarEvent(
  value: GoogleCalendarEvent,
  calendarTimeZone: string,
): CalendarEvent | null {
  if (!value.id || value.status === "cancelled") return null;
  const startAt = googleDateToIso(value.start, calendarTimeZone);
  const endAt = googleDateToIso(value.end, calendarTimeZone);
  if (!startAt || !endAt) return null;
  const location = value.location?.trim();
  const note = value.description?.trim();
  const reminder = reminderMinutes(value);
  return {
    id: `google-${value.id}`,
    title: value.summary?.trim() || "Termin ohne Titel",
    startAt,
    endAt,
    source: "google",
    kind: eventKind(value),
    private: value.visibility === "private",
    ...(location ? { location } : {}),
    ...(note ? { note } : {}),
    ...(reminder === undefined ? {} : { reminderMinutes: reminder }),
  };
}

async function calendarJson<T>(
  connection: GoogleConnection,
  url: string | URL,
  init: RequestInit,
  failureMessage: string,
): Promise<T> {
  const response = await authorizedGoogleFetch(connection, url, init);
  if (!response.ok) {
    throw new GoogleApiError(failureMessage, response.status);
  }
  return (await response.json()) as T;
}

export async function listCalendarEvents(
  connection: GoogleConnection,
): Promise<CalendarEvent[]> {
  const now = Date.now();
  const baseQuery = new URLSearchParams({
    singleEvents: "true",
    showDeleted: "false",
    orderBy: "startTime",
    timeMin: new Date(now - LOOKBACK_MILLISECONDS).toISOString(),
    timeMax: new Date(now + HORIZON_MILLISECONDS).toISOString(),
    maxResults: String(MAX_PAGE_RESULTS),
    fields:
      "nextPageToken,timeZone,items(id,status,visibility,summary,description,location,start,end,extendedProperties,reminders)",
  });
  const googleEvents: GoogleCalendarEvent[] = [];
  const seenPageTokens = new Set<string>();
  let pageToken = "";
  let calendarTimeZone = DEFAULT_TIME_ZONE;

  for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber += 1) {
    const url = calendarUrl();
    url.search = baseQuery.toString();
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const page = await calendarJson<GoogleCalendarPage>(
      connection,
      url,
      { method: "GET", cache: "no-store" },
      "Die Kalendertermine konnten nicht geladen werden.",
    );
    googleEvents.push(...(page.items || []));
    calendarTimeZone = page.timeZone || calendarTimeZone;
    const nextPageToken = page.nextPageToken?.trim() || "";
    if (!nextPageToken) break;
    if (seenPageTokens.has(nextPageToken)) {
      throw new GoogleApiError(
        "Die Kalenderseiten konnten nicht vollständig geladen werden.",
        502,
      );
    }
    seenPageTokens.add(nextPageToken);
    pageToken = nextPageToken;
    if (pageNumber === MAX_PAGES - 1) {
      throw new GoogleApiError(
        "Der Kalender enthält für diesen Zeitraum zu viele Einträge.",
        503,
        true,
      );
    }
  }

  return googleEvents
    .map((event) => toCalendarEvent(event, calendarTimeZone))
    .filter((event): event is CalendarEvent => event !== null)
    .sort((left, right) => left.startAt.localeCompare(right.startAt));
}

export async function createCalendarEvent(
  connection: GoogleConnection,
  input: CreateCalendarEventInput,
): Promise<CalendarEvent> {
  const url = calendarUrl();
  url.searchParams.set(
    "fields",
    "id,status,visibility,summary,description,location,start,end,extendedProperties,reminders",
  );
  const reminders =
    input.reminderMinutes === undefined
      ? { useDefault: true }
      : input.reminderMinutes === 0
        ? { useDefault: false, overrides: [] }
        : {
            useDefault: false,
            overrides: [{ method: "popup", minutes: input.reminderMinutes }],
          };
  const response = await calendarJson<GoogleCalendarEvent>(
    connection,
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        summary: input.title,
        description: input.note,
        location: input.location,
        visibility: "private",
        start: {
          dateTime: input.startAt,
          ...(input.timeZone ? { timeZone: input.timeZone } : {}),
        },
        end: {
          dateTime: input.endAt,
          ...(input.timeZone ? { timeZone: input.timeZone } : {}),
        },
        reminders,
        extendedProperties: {
          private: { gerrisKind: input.kind || "appointment" },
        },
      }),
    },
    "Der Termin konnte nicht in Google Kalender gespeichert werden.",
  );
  const event = toCalendarEvent(
    response,
    input.timeZone || DEFAULT_TIME_ZONE,
  );
  if (!event) {
    throw new GoogleApiError(
      "Google Kalender hat keinen vollständigen Termin zurückgegeben.",
      502,
    );
  }
  return event;
}
