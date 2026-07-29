import {
  createCalendarEvent,
  listCalendarEvents,
  parseCreateCalendarEventInput,
} from "../../../lib/google-calendar-server";
import {
  googleErrorResponse,
  GoogleValidationError,
  requireGoogleConnection,
  sameOrigin,
} from "../../../lib/google-workspace-server";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "cache-control": "private, no-store" };

async function requestJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new GoogleValidationError("Die Termindaten sind kein gültiges JSON.");
  }
}

export async function GET(request: Request) {
  try {
    const connection = await requireGoogleConnection(request, {
      capability: "calendar",
    });
    const events = await listCalendarEvents(connection);
    return Response.json(
      {
        events,
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
    const event = await createCalendarEvent(connection, input);
    return Response.json(
      { event, source: "google-calendar" },
      { status: 201, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return googleErrorResponse(error, "calendar");
  }
}
