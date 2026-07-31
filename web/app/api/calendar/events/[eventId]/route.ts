import {
  deleteCalendarEvent,
  getCalendarEvent,
  parseUpdateCalendarEventInput,
  updateCalendarEvent,
} from "../../../../../lib/google-calendar-server";
import {
  googleErrorResponse,
  GoogleValidationError,
  requireGoogleConnection,
  sameOrigin,
} from "../../../../../lib/google-workspace-server";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "cache-control": "private, no-store" };

function validEventId(value: string): string {
  if (!value || value.length > 1_024) {
    throw new GoogleValidationError("Die Termin-ID ist ungültig.");
  }
  return value;
}

function calendarIdFrom(request: Request): string {
  const value = new URL(request.url).searchParams.get("calendarId")?.trim();
  if (!value || value.length > 1_024) {
    throw new GoogleValidationError("Der Zielkalender fehlt oder ist ungültig.");
  }
  return value;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  try {
    const connection = await requireGoogleConnection(request, {
      capability: "calendar",
    });
    const eventId = validEventId((await context.params).eventId);
    const calendarId = calendarIdFrom(request);
    return Response.json(
      { event: await getCalendarEvent(connection, calendarId, eventId) },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return googleErrorResponse(error, "calendar");
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  if (!sameOrigin(request)) {
    return Response.json(
      { error: "Ungültiger Ursprung.", code: "invalid_origin" },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }
  try {
    const connection = await requireGoogleConnection(request, {
      capability: "calendar",
    });
    const eventId = validEventId((await context.params).eventId);
    const payload = await request.json().catch(() => {
      throw new GoogleValidationError(
        "Die Terminänderungen sind kein gültiges JSON.",
      );
    });
    const event = await updateCalendarEvent(
      connection,
      eventId,
      parseUpdateCalendarEventInput(payload),
      request.headers.get("if-match"),
    );
    return Response.json(
      { event, updated: true },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return googleErrorResponse(error, "calendar");
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  if (!sameOrigin(request)) {
    return Response.json(
      { error: "Ungültiger Ursprung.", code: "invalid_origin" },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }
  try {
    const connection = await requireGoogleConnection(request, {
      capability: "calendar",
    });
    const eventId = validEventId((await context.params).eventId);
    const calendarId = calendarIdFrom(request);
    await deleteCalendarEvent(
      connection,
      calendarId,
      eventId,
      request.headers.get("if-match"),
    );
    return Response.json(
      { ok: true, id: eventId },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return googleErrorResponse(error, "calendar");
  }
}
