import {
  PLANNING_NO_STORE_HEADERS,
  planningErrorResponse,
} from "../../../../lib/planning-api";
import {
  deleteDayIntent,
  saveDayIntent,
} from "../../../../lib/planning-store";
import { ownerEmail, sameOrigin } from "../../../../lib/server-auth";

export const dynamic = "force-dynamic";

function authorized(request: Request): string | Response {
  const owner = ownerEmail(request);
  if (!owner) {
    return Response.json(
      { error: "Anmeldung erforderlich." },
      { status: 401, headers: PLANNING_NO_STORE_HEADERS },
    );
  }
  if (!sameOrigin(request)) {
    return Response.json(
      { error: "Ungültiger Ursprung." },
      { status: 403, headers: PLANNING_NO_STORE_HEADERS },
    );
  }
  return owner;
}

export async function PUT(request: Request) {
  const result = authorized(request);
  if (result instanceof Response) return result;
  try {
    const input = (await request.json()) as {
      date?: unknown;
      kind?: unknown;
      note?: unknown;
    };
    return Response.json(
      {
        intent: await saveDayIntent(result, {
          date: input.date,
          kind: input.kind,
          note: input.note,
        }),
      },
      { headers: PLANNING_NO_STORE_HEADERS },
    );
  } catch (error) {
    return planningErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const result = authorized(request);
  if (result instanceof Response) return result;
  try {
    const date = new URL(request.url).searchParams.get("date") || "";
    await deleteDayIntent(result, date);
    return Response.json(
      { ok: true, date },
      { headers: PLANNING_NO_STORE_HEADERS },
    );
  } catch (error) {
    return planningErrorResponse(error);
  }
}
