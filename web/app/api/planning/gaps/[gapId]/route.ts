import {
  PLANNING_NO_STORE_HEADERS,
  planningErrorResponse,
} from "../../../../../lib/planning-api";
import { setGapAction } from "../../../../../lib/planning-store";
import { ownerEmail, sameOrigin } from "../../../../../lib/server-auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ gapId: string }> },
) {
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
  try {
    const gapId = (await context.params).gapId;
    if (!gapId || gapId.length > 1_024) {
      throw new Error("Die Gap-ID ist ungültig.");
    }
    const payload = (await request.json()) as {
      action?: unknown;
      snoozedUntil?: unknown;
      note?: unknown;
    };
    if (
      payload.action !== "reopen" &&
      payload.action !== "snooze" &&
      payload.action !== "resolve"
    ) {
      throw new Error("Die Gap-Aktion ist ungültig.");
    }
    const gap = await setGapAction(owner, gapId, {
      action: payload.action,
      snoozedUntil:
        typeof payload.snoozedUntil === "string"
          ? payload.snoozedUntil
          : null,
      note: typeof payload.note === "string" ? payload.note : "",
    });
    return Response.json({ gap }, { headers: PLANNING_NO_STORE_HEADERS });
  } catch (error) {
    return planningErrorResponse(error);
  }
}
