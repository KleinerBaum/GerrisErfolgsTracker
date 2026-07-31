import {
  createGoogleCalendar,
  listGoogleCalendars,
  parseCreateGoogleCalendarInput,
} from "../../../../lib/google-calendar-server";
import {
  GOOGLE_CALENDAR_CREATE_SCOPE,
  GOOGLE_CALENDAR_LIST_SCOPE,
  googleErrorResponse,
  GoogleValidationError,
  requireGoogleConnection,
  sameOrigin,
} from "../../../../lib/google-workspace-server";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "cache-control": "private, no-store" };

async function requestJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new GoogleValidationError("Die Kalenderdaten sind kein gültiges JSON.");
  }
}

export async function GET(request: Request) {
  try {
    const connection = await requireGoogleConnection(request, {
      capability: "calendar",
      scope: GOOGLE_CALENDAR_LIST_SCOPE,
    });
    return Response.json(
      {
        calendars: await listGoogleCalendars(connection),
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
      scope: GOOGLE_CALENDAR_CREATE_SCOPE,
    });
    const input = parseCreateGoogleCalendarInput(await requestJson(request));
    return Response.json(
      {
        calendar: await createGoogleCalendar(connection, input),
        source: "google-calendar",
      },
      { status: 201, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return googleErrorResponse(error, "calendar");
  }
}
