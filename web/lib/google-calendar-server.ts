import {
  authorizedGoogleFetch,
  GoogleApiError,
  GoogleValidationError,
  type GoogleConnection,
} from "./google-workspace-server";
import type { CalendarEvent, GoogleCalendar } from "./types";
import type {
  ManagedCalendarKey,
  PlanningSourceType,
} from "./types";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const DEFAULT_TIME_ZONE = "Europe/Berlin";
const LOOKBACK_MILLISECONDS = 24 * 60 * 60 * 1_000;
const HORIZON_MILLISECONDS = 45 * 24 * 60 * 60 * 1_000;
const MAX_PAGE_RESULTS = 2_500;
const MAX_PAGES = 20;
const MAX_CALENDAR_PAGES = 10;

const EVENT_KINDS = new Set<CalendarEvent["kind"]>([
  "appointment",
  "focus",
  "payment",
  "job_interview",
  "employment_agency",
  "networking",
  "family",
  "school_childcare",
  "health",
  "public_office",
  "learning",
  "birthday",
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
  etag?: string;
  updated?: string;
  status?: string;
  visibility?: string;
  transparency?: string;
  summary?: string;
  description?: string;
  location?: string;
  attendees?: Array<{
    email?: string;
    responseStatus?: string;
  }>;
  start?: GoogleEventDate;
  end?: GoogleEventDate;
  extendedProperties?: {
    private?: Record<string, string>;
  };
  reminders?: {
    useDefault?: boolean;
    overrides?: GoogleEventReminder[];
  };
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: GoogleEventDate;
};

type GoogleCalendarPage = {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
  timeZone?: string;
};

type GoogleCalendarListEntry = {
  id?: string;
  summary?: string;
  description?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  primary?: boolean;
  selected?: boolean;
  accessRole?: string;
  timeZone?: string;
  deleted?: boolean;
};

type GoogleCalendarListPage = {
  items?: GoogleCalendarListEntry[];
  nextPageToken?: string;
};

export type CreateCalendarEventInput = {
  title: string;
  startAt: string;
  endAt: string;
  calendarId?: string;
  kind?: CalendarEvent["kind"];
  location?: string;
  note?: string;
  reminderMinutes?: number;
  reminderMethods?: Array<"popup" | "email">;
  timeZone?: string;
  allDay?: boolean;
  startDate?: string;
  endDate?: string;
  private?: boolean;
  attendeeEmail?: string;
  availability?: "busy" | "free";
  recurrence?: "none" | "yearly";
  sourceType?: PlanningSourceType;
  sourceId?: string;
  sourceOccurrence?: string;
  desiredHash?: string;
  managedCalendarKey?: ManagedCalendarKey;
};

export type UpdateCalendarEventInput = Partial<
  Omit<
    CreateCalendarEventInput,
    | "calendarId"
    | "sourceType"
    | "sourceId"
    | "allDay"
    | "startDate"
    | "endDate"
    | "private"
    | "attendeeEmail"
    | "availability"
    | "recurrence"
  >
> & {
  calendarId: string;
  etag?: string;
};

export type CreateGoogleCalendarInput = {
  name: string;
  description?: string;
  timeZone: string;
};

function calendarId(): string {
  return (
    process.env.GOOGLE_CALENDAR_ID?.trim() ||
    process.env.CAL_GERRI_ID?.trim() ||
    "primary"
  );
}

function calendarUrl(targetCalendarId = calendarId()): URL {
  return new URL(
    `${CALENDAR_API}/calendars/${encodeURIComponent(targetCalendarId)}/events`,
  );
}

function calendarEventUrl(targetCalendarId: string, eventId: string): URL {
  return new URL(
    `${CALENDAR_API}/calendars/${encodeURIComponent(
      targetCalendarId,
    )}/events/${encodeURIComponent(eventId)}`,
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

function validDateOnly(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new GoogleValidationError(`${fieldName} ist kein gültiges Datum.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new GoogleValidationError(`${fieldName} ist kein gültiges Datum.`);
  }
  return value;
}

function validOptionalBoolean(
  value: unknown,
  fieldName: string,
): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") {
    throw new GoogleValidationError(`${fieldName} ist ungültig.`);
  }
  return value;
}

function validAttendeeEmail(value: unknown): string | undefined {
  const email = optionalString(value, "Die E-Mail-Adresse", 254);
  if (!email) return undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new GoogleValidationError("Die E-Mail-Adresse ist ungültig.");
  }
  return email.toLowerCase();
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

function validCalendarId(value: unknown): string | undefined {
  return optionalString(value, "Der Zielkalender", 1_024);
}

function validMetadataString(
  value: unknown,
  fieldName: string,
): string | undefined {
  return optionalString(value, fieldName, 512);
}

const SOURCE_TYPES = new Set<PlanningSourceType>([
  "task",
  "cost",
  "document",
  "application",
  "day-intent",
  "open-topic",
  "calendar",
  "sync",
]);
const MANAGED_CALENDAR_KEYS = new Set<ManagedCalendarKey>([
  "focus",
  "applications",
  "birthdays_holidays",
  "private",
]);

function validSourceType(value: unknown): PlanningSourceType | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !SOURCE_TYPES.has(value as PlanningSourceType)) {
    throw new GoogleValidationError("Die Quellenart ist ungültig.");
  }
  return value as PlanningSourceType;
}

function validManagedCalendarKey(
  value: unknown,
): ManagedCalendarKey | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (
    typeof value !== "string" ||
    !MANAGED_CALENDAR_KEYS.has(value as ManagedCalendarKey)
  ) {
    throw new GoogleValidationError("Der verwaltete Kalender ist ungültig.");
  }
  return value as ManagedCalendarKey;
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

function validAvailability(value: unknown): "busy" | "free" {
  if (value === undefined || value === null || value === "") return "busy";
  if (value !== "busy" && value !== "free") {
    throw new GoogleValidationError("Die Verfügbarkeit ist ungültig.");
  }
  return value;
}

function validRecurrence(value: unknown): "none" | "yearly" {
  if (value === undefined || value === null || value === "") return "none";
  if (value !== "none" && value !== "yearly") {
    throw new GoogleValidationError("Die Wiederholung ist ungültig.");
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
  const kind = validKind(input.kind);
  const startAt = validIsoDate(input.startAt, "Der Beginn");
  const endAt = validIsoDate(input.endAt, "Das Ende");
  if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
    throw new GoogleValidationError("Das Ende muss nach dem Beginn liegen.");
  }
  const allDay =
    kind === "birthday"
      ? true
      : validOptionalBoolean(input.allDay, "Ganztägig") ?? false;
  const startDate = allDay
    ? validDateOnly(input.startDate, "Das Startdatum")
    : undefined;
  const endDate = allDay
    ? validDateOnly(input.endDate, "Das Enddatum")
    : undefined;
  if (
    allDay &&
    new Date(`${endDate}T00:00:00.000Z`).getTime() <=
      new Date(`${startDate}T00:00:00.000Z`).getTime()
  ) {
    throw new GoogleValidationError("Das Enddatum muss nach dem Startdatum liegen.");
  }
  return {
    title: nonEmptyString(input.title, "Der Titel", 1_024),
    startAt,
    endAt,
    calendarId: validCalendarId(input.calendarId),
    kind,
    location: optionalString(input.location, "Der Ort", 1_024),
    note: optionalString(input.note, "Die Notiz", 20_000),
    reminderMinutes: validReminder(input.reminderMinutes),
    timeZone: validTimeZone(input.timeZone),
    allDay,
    startDate,
    endDate,
    private:
      kind === "birthday"
        ? true
        : validOptionalBoolean(input.private, "Die Sichtbarkeit") ?? true,
    attendeeEmail:
      kind === "birthday" ? undefined : validAttendeeEmail(input.attendeeEmail),
    availability:
      kind === "birthday" ? "free" : validAvailability(input.availability),
    recurrence:
      kind === "birthday" ? "yearly" : validRecurrence(input.recurrence),
    sourceType: validSourceType(input.sourceType),
    sourceId: validMetadataString(input.sourceId, "Die Quellen-ID"),
    sourceOccurrence: validMetadataString(
      input.sourceOccurrence,
      "Das Quellenvorkommen",
    ),
    desiredHash: validMetadataString(input.desiredHash, "Der Soll-Hash"),
    managedCalendarKey: validManagedCalendarKey(input.managedCalendarKey),
  };
}

export function parseUpdateCalendarEventInput(
  value: unknown,
): UpdateCalendarEventInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GoogleValidationError("Die Terminänderungen fehlen.");
  }
  const input = value as Record<string, unknown>;
  const calendarIdValue = validCalendarId(input.calendarId);
  if (!calendarIdValue) {
    throw new GoogleValidationError("Der Zielkalender fehlt.");
  }
  const result: UpdateCalendarEventInput = { calendarId: calendarIdValue };
  if ("title" in input) {
    result.title = nonEmptyString(input.title, "Der Titel", 1_024);
  }
  if ("startAt" in input) {
    result.startAt = validIsoDate(input.startAt, "Der Beginn");
  }
  if ("endAt" in input) {
    result.endAt = validIsoDate(input.endAt, "Das Ende");
  }
  if (
    result.startAt &&
    result.endAt &&
    new Date(result.endAt).getTime() <= new Date(result.startAt).getTime()
  ) {
    throw new GoogleValidationError("Das Ende muss nach dem Beginn liegen.");
  }
  if ("kind" in input) result.kind = validKind(input.kind);
  if ("location" in input) {
    result.location = optionalString(input.location, "Der Ort", 1_024) || "";
  }
  if ("note" in input) {
    result.note = optionalString(input.note, "Die Notiz", 20_000) || "";
  }
  if ("reminderMinutes" in input) {
    result.reminderMinutes = validReminder(input.reminderMinutes);
  }
  if ("timeZone" in input) result.timeZone = validTimeZone(input.timeZone);
  if ("sourceOccurrence" in input) {
    result.sourceOccurrence = validMetadataString(
      input.sourceOccurrence,
      "Das Quellenvorkommen",
    );
  }
  if ("desiredHash" in input) {
    result.desiredHash = validMetadataString(input.desiredHash, "Der Soll-Hash");
  }
  if ("managedCalendarKey" in input) {
    result.managedCalendarKey = validManagedCalendarKey(
      input.managedCalendarKey,
    );
  }
  if ("etag" in input) {
    result.etag = validMetadataString(input.etag, "Der ETag");
  }
  if (Object.keys(result).length === 1) {
    throw new GoogleValidationError("Es wurde keine Terminänderung angegeben.");
  }
  return result;
}

export function parseCreateGoogleCalendarInput(
  value: unknown,
): CreateGoogleCalendarInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GoogleValidationError("Die Kalenderdaten fehlen.");
  }
  const input = value as Record<string, unknown>;
  return {
    name: nonEmptyString(input.name, "Der Kalendername", 160),
    description: optionalString(input.description, "Die Beschreibung", 1_000),
    timeZone: validTimeZone(input.timeZone) || DEFAULT_TIME_ZONE,
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
  targetCalendarId: string,
): CalendarEvent | null {
  if (!value.id || value.status === "cancelled") return null;
  const startAt = googleDateToIso(value.start, calendarTimeZone);
  const endAt = googleDateToIso(value.end, calendarTimeZone);
  if (!startAt || !endAt) return null;
  const location = value.location?.trim();
  const note = value.description?.trim();
  const reminder = reminderMinutes(value);
  const metadata = value.extendedProperties?.private ?? {};
  const managed = metadata.gerrisManaged === "1";
  const managedCalendarKey = MANAGED_CALENDAR_KEYS.has(
    metadata.gerrisCalendarKey as ManagedCalendarKey,
  )
    ? (metadata.gerrisCalendarKey as ManagedCalendarKey)
    : undefined;
  const sourceType = SOURCE_TYPES.has(
    metadata.gerrisSourceType as PlanningSourceType,
  )
    ? (metadata.gerrisSourceType as PlanningSourceType)
    : undefined;
  return {
    id: `google-${encodeURIComponent(targetCalendarId)}-${value.id}`,
    googleEventId: value.id,
    title: value.summary?.trim() || "Termin ohne Titel",
    startAt,
    endAt,
    source: managed ? "kompass" : "google",
    kind: eventKind(value),
    private: value.visibility === "private",
    calendarId: targetCalendarId,
    allDay: Boolean(value.start?.date),
    availability: value.transparency === "transparent" ? "free" : "busy",
    recurrence: value.recurrence?.some((rule) => /^RRULE:FREQ=YEARLY(?:;|$)/.test(rule))
      ? "yearly"
      : "none",
    ...(location ? { location } : {}),
    ...(note ? { note } : {}),
    ...(reminder === undefined ? {} : { reminderMinutes: reminder }),
    ...(value.etag ? { etag: value.etag } : {}),
    ...(value.updated ? { updatedAt: value.updated } : {}),
    ...(managed ? { managed: true } : {}),
    ...(managedCalendarKey ? { managedCalendarKey } : {}),
    ...(sourceType ? { sourceType } : {}),
    ...(metadata.gerrisSourceId
      ? { sourceId: metadata.gerrisSourceId }
      : {}),
    ...(metadata.gerrisOccurrence
      ? { sourceOccurrence: metadata.gerrisOccurrence }
      : {}),
    ...(metadata.gerrisDesiredHash
      ? { desiredHash: metadata.gerrisDesiredHash }
      : {}),
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
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function calendarAccessRole(
  value: string | undefined,
): GoogleCalendar["accessRole"] {
  return value === "freeBusyReader" ||
    value === "reader" ||
    value === "writer" ||
    value === "owner"
    ? value
    : "reader";
}

function fallbackCalendarColor(id: string): string {
  const colors = ["#2fb596", "#5e9fd6", "#aa88db", "#d6a657", "#d77a8e"];
  const seed = [...id].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return colors[seed % colors.length];
}

function toGoogleCalendar(value: GoogleCalendarListEntry): GoogleCalendar | null {
  const id = value.id?.trim();
  if (!id || value.deleted) return null;
  return {
    id,
    name: value.summary?.trim() || "Kalender ohne Namen",
    ...(value.description?.trim()
      ? { description: value.description.trim() }
      : {}),
    backgroundColor: value.backgroundColor || fallbackCalendarColor(id),
    foregroundColor: value.foregroundColor || "#ffffff",
    primary: Boolean(value.primary),
    selected: Boolean(value.selected || value.primary),
    accessRole: calendarAccessRole(value.accessRole),
    timeZone: value.timeZone || DEFAULT_TIME_ZONE,
  };
}

export async function listGoogleCalendars(
  connection: GoogleConnection,
): Promise<GoogleCalendar[]> {
  const calendars: GoogleCalendarListEntry[] = [];
  const seenPageTokens = new Set<string>();
  let pageToken = "";

  for (let pageNumber = 0; pageNumber < MAX_CALENDAR_PAGES; pageNumber += 1) {
    const url = new URL(`${CALENDAR_API}/users/me/calendarList`);
    url.searchParams.set("maxResults", "250");
    url.searchParams.set("showDeleted", "false");
    url.searchParams.set("showHidden", "false");
    url.searchParams.set(
      "fields",
      "nextPageToken,items(id,summary,description,backgroundColor,foregroundColor,primary,selected,accessRole,timeZone,deleted)",
    );
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const page = await calendarJson<GoogleCalendarListPage>(
      connection,
      url,
      { method: "GET", cache: "no-store" },
      "Die Google-Kalender konnten nicht geladen werden.",
    );
    calendars.push(...(page.items || []));
    const nextPageToken = page.nextPageToken?.trim() || "";
    if (!nextPageToken) break;
    if (seenPageTokens.has(nextPageToken)) {
      throw new GoogleApiError(
        "Die Kalenderliste konnte nicht vollständig geladen werden.",
        502,
      );
    }
    seenPageTokens.add(nextPageToken);
    pageToken = nextPageToken;
    if (pageNumber === MAX_CALENDAR_PAGES - 1) {
      throw new GoogleApiError(
        "Die Kalenderliste ist zu umfangreich.",
        503,
        true,
      );
    }
  }

  return calendars
    .map(toGoogleCalendar)
    .filter((calendar): calendar is GoogleCalendar => calendar !== null)
    .sort((left, right) =>
      left.primary === right.primary
        ? left.name.localeCompare(right.name, "de")
        : left.primary
          ? -1
          : 1,
    );
}

export async function createGoogleCalendar(
  connection: GoogleConnection,
  input: CreateGoogleCalendarInput,
): Promise<GoogleCalendar> {
  const url = new URL(`${CALENDAR_API}/calendars`);
  url.searchParams.set("fields", "id,summary,description,timeZone");
  const result = await calendarJson<GoogleCalendarListEntry>(
    connection,
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        summary: input.name,
        description: input.description,
        timeZone: input.timeZone,
      }),
    },
    "Der neue Google-Kalender konnte nicht angelegt werden.",
  );
  const calendar = toGoogleCalendar({
    ...result,
    accessRole: "owner",
    selected: true,
  });
  if (!calendar) {
    throw new GoogleApiError(
      "Google hat keinen vollständigen Kalender zurückgegeben.",
      502,
    );
  }
  return calendar;
}

export async function listCalendarEvents(
  connection: GoogleConnection,
  targetCalendarId = calendarId(),
  window?: { timeMin: string; timeMax: string },
): Promise<CalendarEvent[]> {
  const now = Date.now();
  const baseQuery = new URLSearchParams({
    singleEvents: "true",
    showDeleted: "false",
    orderBy: "startTime",
    timeMin:
      window?.timeMin || new Date(now - LOOKBACK_MILLISECONDS).toISOString(),
    timeMax:
      window?.timeMax || new Date(now + HORIZON_MILLISECONDS).toISOString(),
    maxResults: String(MAX_PAGE_RESULTS),
    fields:
      "nextPageToken,timeZone,items(id,etag,updated,status,visibility,transparency,summary,description,location,start,end,extendedProperties,reminders,recurrence,recurringEventId,originalStartTime)",
  });
  const googleEvents: GoogleCalendarEvent[] = [];
  const seenPageTokens = new Set<string>();
  let pageToken = "";
  let calendarTimeZone = DEFAULT_TIME_ZONE;

  for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber += 1) {
    const url = calendarUrl(targetCalendarId);
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
    .map((event) =>
      toCalendarEvent(event, calendarTimeZone, targetCalendarId),
    )
    .filter((event): event is CalendarEvent => event !== null)
    .sort((left, right) => left.startAt.localeCompare(right.startAt));
}

export async function createCalendarEvent(
  connection: GoogleConnection,
  input: CreateCalendarEventInput,
): Promise<CalendarEvent> {
  const targetCalendarId = input.calendarId || calendarId();
  const url = calendarUrl(targetCalendarId);
  if (input.attendeeEmail) url.searchParams.set("sendUpdates", "all");
  url.searchParams.set(
    "fields",
    "id,etag,updated,status,visibility,transparency,summary,description,location,start,end,extendedProperties,reminders,recurrence,recurringEventId,originalStartTime",
  );
  const sourceType = input.sourceType || "calendar";
  const sourceId = input.sourceId || crypto.randomUUID();
  const sourceOccurrence = input.sourceOccurrence || "main";
  const reminders =
    input.reminderMethods !== undefined
      ? {
          useDefault: false,
          overrides: input.reminderMethods.map((method) => ({
            method,
            minutes: input.reminderMinutes ?? 0,
          })),
        }
      : input.reminderMinutes === undefined
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
        visibility: input.private === false ? "default" : "private",
        transparency: input.availability === "free" ? "transparent" : "opaque",
        start:
          input.allDay && input.startDate
            ? { date: input.startDate }
            : {
                dateTime: input.startAt,
                ...(input.timeZone ? { timeZone: input.timeZone } : {}),
              },
        end:
          input.allDay && input.endDate
            ? { date: input.endDate }
            : {
                dateTime: input.endAt,
                ...(input.timeZone ? { timeZone: input.timeZone } : {}),
              },
        ...(input.attendeeEmail
          ? { attendees: [{ email: input.attendeeEmail }] }
          : {}),
        ...(input.recurrence === "yearly"
          ? { recurrence: ["RRULE:FREQ=YEARLY"] }
          : {}),
        reminders,
        extendedProperties: {
          private: {
            gerrisManaged: "1",
            gerrisKind: input.kind || "appointment",
            gerrisSourceType: sourceType,
            gerrisSourceId: sourceId,
            gerrisOccurrence: sourceOccurrence,
            ...(input.desiredHash
              ? { gerrisDesiredHash: input.desiredHash }
              : {}),
            ...(input.managedCalendarKey
              ? { gerrisCalendarKey: input.managedCalendarKey }
              : {}),
          },
        },
      }),
    },
    "Der Termin konnte nicht in Google Kalender gespeichert werden.",
  );
  const event = toCalendarEvent(
    response,
    input.timeZone || DEFAULT_TIME_ZONE,
    targetCalendarId,
  );
  if (!event) {
    throw new GoogleApiError(
      "Google Kalender hat keinen vollständigen Termin zurückgegeben.",
      502,
    );
  }
  return event;
}

export async function getCalendarEvent(
  connection: GoogleConnection,
  targetCalendarId: string,
  eventId: string,
): Promise<CalendarEvent> {
  const url = calendarEventUrl(targetCalendarId, eventId);
  url.searchParams.set(
    "fields",
    "id,etag,updated,status,visibility,transparency,summary,description,location,start,end,extendedProperties,reminders,recurrence,recurringEventId,originalStartTime",
  );
  const response = await calendarJson<GoogleCalendarEvent>(
    connection,
    url,
    { method: "GET", cache: "no-store" },
    "Der Kalendertermin konnte nicht geladen werden.",
  );
  const event = toCalendarEvent(response, DEFAULT_TIME_ZONE, targetCalendarId);
  if (!event) {
    throw new GoogleApiError("Der Kalendertermin wurde nicht gefunden.", 404);
  }
  return event;
}

function remindersForPatch(minutes: number | undefined) {
  if (minutes === undefined) return undefined;
  if (minutes === 0) return { useDefault: false, overrides: [] };
  return {
    useDefault: false,
    overrides: [{ method: "popup", minutes }],
  };
}

export async function updateCalendarEvent(
  connection: GoogleConnection,
  eventId: string,
  input: UpdateCalendarEventInput,
  requestEtag?: string | null,
): Promise<CalendarEvent> {
  const existing = await getCalendarEvent(connection, input.calendarId, eventId);
  if (!existing.managed) {
    throw new GoogleValidationError(
      "Nur von Gerris Kompass verwaltete Termine dürfen geändert werden.",
    );
  }
  const metadata: Record<string, string> = {
    gerrisManaged: "1",
    gerrisKind: input.kind || existing.kind,
    gerrisSourceType: existing.sourceType || "calendar",
    gerrisSourceId: existing.sourceId || eventId,
    gerrisOccurrence:
      input.sourceOccurrence || existing.sourceOccurrence || "main",
    ...(input.desiredHash || existing.desiredHash
      ? { gerrisDesiredHash: input.desiredHash || existing.desiredHash || "" }
      : {}),
    ...(input.managedCalendarKey || existing.managedCalendarKey
      ? {
          gerrisCalendarKey:
            input.managedCalendarKey || existing.managedCalendarKey || "focus",
        }
      : {}),
  };
  const body: Record<string, unknown> = {
    extendedProperties: { private: metadata },
  };
  if (input.title !== undefined) body.summary = input.title;
  if (input.location !== undefined) body.location = input.location;
  if (input.note !== undefined) body.description = input.note;
  if (input.startAt !== undefined) {
    body.start = {
      dateTime: input.startAt,
      ...(input.timeZone ? { timeZone: input.timeZone } : {}),
    };
  }
  if (input.endAt !== undefined) {
    body.end = {
      dateTime: input.endAt,
      ...(input.timeZone ? { timeZone: input.timeZone } : {}),
    };
  }
  const reminders = remindersForPatch(input.reminderMinutes);
  if (reminders) body.reminders = reminders;
  const url = calendarEventUrl(input.calendarId, eventId);
  url.searchParams.set(
    "fields",
    "id,etag,updated,status,visibility,transparency,summary,description,location,start,end,extendedProperties,reminders,recurrence",
  );
  const response = await calendarJson<GoogleCalendarEvent>(
    connection,
    url,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...(requestEtag?.trim() || input.etag
          ? { "if-match": requestEtag?.trim() || input.etag || "" }
          : {}),
      },
      body: JSON.stringify(body),
    },
    "Der Kalendertermin konnte nicht aktualisiert werden.",
  );
  const event = toCalendarEvent(
    response,
    input.timeZone || DEFAULT_TIME_ZONE,
    input.calendarId,
  );
  if (!event) {
    throw new GoogleApiError(
      "Google Kalender hat keinen vollständigen Termin zurückgegeben.",
      502,
    );
  }
  return event;
}

export async function deleteCalendarEvent(
  connection: GoogleConnection,
  targetCalendarId: string,
  eventId: string,
  requestEtag?: string | null,
): Promise<void> {
  const existing = await getCalendarEvent(connection, targetCalendarId, eventId);
  if (!existing.managed) {
    throw new GoogleValidationError(
      "Nur von Gerris Kompass verwaltete Termine dürfen gelöscht werden.",
    );
  }
  await calendarJson<void>(
    connection,
    calendarEventUrl(targetCalendarId, eventId),
    {
      method: "DELETE",
      headers: requestEtag?.trim()
        ? { "if-match": requestEtag.trim() }
        : undefined,
    },
    "Der Kalendertermin konnte nicht gelöscht werden.",
  );
}

export async function findManagedCalendarEvents(
  connection: GoogleConnection,
  targetCalendarId: string,
  sourceType: PlanningSourceType,
  sourceId: string,
  sourceOccurrence: string,
): Promise<CalendarEvent[]> {
  const url = calendarUrl(targetCalendarId);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("showDeleted", "false");
  url.searchParams.set("maxResults", "20");
  for (const property of [
    "gerrisManaged=1",
    `gerrisSourceType=${sourceType}`,
    `gerrisSourceId=${sourceId}`,
    `gerrisOccurrence=${sourceOccurrence}`,
  ]) {
    url.searchParams.append("privateExtendedProperty", property);
  }
  url.searchParams.set(
    "fields",
    "timeZone,items(id,etag,updated,status,visibility,transparency,summary,description,location,start,end,extendedProperties,reminders,recurrence)",
  );
  const page = await calendarJson<GoogleCalendarPage>(
    connection,
    url,
    { method: "GET", cache: "no-store" },
    "Verknüpfte Kalendertermine konnten nicht geprüft werden.",
  );
  return (page.items || [])
    .map((event) =>
      toCalendarEvent(event, page.timeZone || DEFAULT_TIME_ZONE, targetCalendarId),
    )
    .filter((event): event is CalendarEvent => event !== null);
}

type GoogleAclRule = {
  role?: string;
  scope?: { type?: string; value?: string };
};

export async function isCalendarExclusivelyPrivate(
  connection: GoogleConnection,
  targetCalendarId: string,
): Promise<boolean> {
  const url = new URL(
    `${CALENDAR_API}/calendars/${encodeURIComponent(targetCalendarId)}/acl`,
  );
  url.searchParams.set("maxResults", "250");
  url.searchParams.set("showDeleted", "false");
  url.searchParams.set("fields", "items(role,scope(type,value)),nextPageToken");
  const page = await calendarJson<{
    items?: GoogleAclRule[];
    nextPageToken?: string;
  }>(
    connection,
    url,
    { method: "GET", cache: "no-store" },
    "Die Freigaben des Privatkalenders konnten nicht geprüft werden.",
  );
  if (page.nextPageToken) return false;
  const owner = connection.googleEmail.trim().toLowerCase();
  return (page.items || []).every((rule) => {
    if (!rule.role || rule.role === "none") return true;
    return (
      rule.scope?.type === "user" &&
      rule.scope.value?.trim().toLowerCase() === owner &&
      rule.role === "owner"
    );
  });
}
