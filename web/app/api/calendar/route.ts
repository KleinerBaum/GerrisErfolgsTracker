import {
  createCalendarEvent,
  listCalendarEvents,
  parseCreateCalendarEventInput,
} from "../../../lib/google-calendar-server";
import {
  GOOGLE_CALENDAR_READ_EVENTS_SCOPE,
  googleErrorResponse,
  GoogleValidationError,
  requireGoogleConnection,
  sameOrigin,
} from "../../../lib/google-workspace-server";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "cache-control": "private, no-store" };
const MAX_SELECTED_CALENDARS = 12;

async function requestJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new GoogleValidationError("Die Termindaten sind kein gültiges JSON.");
  }
}

function selectedCalendarIds(request: Request): string[] {
  const values = new URL(request.url).searchParams
    .getAll("calendarId")
    .map((value) => value.trim())
    .filter(Boolean);
  const ids = [...new Set(values)];
  if (ids.length > MAX_SELECTED_CALENDARS) {
    throw new GoogleValidationError(
      `Es können höchstens ${MAX_SELECTED_CALENDARS} Kalender gleichzeitig angezeigt werden.`,
    );
  }
  if (ids.some((id) => id.length > 1_024)) {
    throw new GoogleValidationError("Mindestens eine Kalender-ID ist ungültig.");
  }
  return ids;
}

function selectedWindow(request: Request):
  | { timeMin: string; timeMax: string }
  | undefined {
  const url = new URL(request.url);
  const timeMinValue = url.searchParams.get("timeMin");
  const timeMaxValue = url.searchParams.get("timeMax");
  if (!timeMinValue && !timeMaxValue) return undefined;
  if (!timeMinValue || !timeMaxValue) {
    throw new GoogleValidationError(
      "Für einen Kalenderzeitraum werden Beginn und Ende benötigt.",
    );
  }
  const timeMin = new Date(timeMinValue);
  const timeMax = new Date(timeMaxValue);
  const duration = timeMax.getTime() - timeMin.getTime();
  if (
    Number.isNaN(timeMin.getTime()) ||
    Number.isNaN(timeMax.getTime()) ||
    duration <= 0 ||
    duration > 370 * 86_400_000
  ) {
    throw new GoogleValidationError(
      "Der angeforderte Kalenderzeitraum ist ungültig oder zu groß.",
    );
  }
  return { timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString() };
}

export async function GET(request: Request) {
  try {
    const calendarIds = selectedCalendarIds(request);
    const window = selectedWindow(request);
    const connection = await requireGoogleConnection(request, {
      capability: "calendar",
      ...(calendarIds.length
        ? { scope: GOOGLE_CALENDAR_READ_EVENTS_SCOPE }
        : {}),
    });
    const events = (
      await Promise.all(
        calendarIds.length
          ? calendarIds.map((calendarId) =>
              listCalendarEvents(connection, calendarId, window),
            )
          : [listCalendarEvents(connection, undefined, window)],
      )
    )
      .flat()
      .sort((left, right) => left.startAt.localeCompare(right.startAt));
    return Response.json(
      {
        events,
        calendarIds,
        source: "google-calendar",
        fetchedAt: new Date().toISOString(),
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return googleErrorResponse(error, "calendar");
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return Response.json(
      {
        error: "Die Anfrage stammt nicht aus Gerris Kompass.",
        code: "forbidden_origin",
      },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }
  try {
    const connection = await requireGoogleConnection(request, {
      capability: "calendar",
    });
    const input = parseCreateCalendarEventInput(await requestJson(request));
    const event = await createCalendarEvent(connection, {
      ...input,
      sourceType: "calendar",
      sourceId: crypto.randomUUID(),
      sourceOccurrence: "main",
      desiredHash: undefined,
      managedCalendarKey: undefined,
    });
    return Response.json(
      { event, source: "google-calendar" },
      { status: 201, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return googleErrorResponse(error, "calendar");
  }
}
