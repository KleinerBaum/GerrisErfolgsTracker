import {
  PLANNING_NO_STORE_HEADERS,
  planningErrorResponse,
} from "../../../../lib/planning-api";
import {
  activateSafeAutomation,
  pauseAutomation,
} from "../../../../lib/planning-store";
import { ownerEmail, sameOrigin } from "../../../../lib/server-auth";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
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
    const payload = (await request.json()) as { mode?: unknown };
    if (payload.mode === "safe") {
      await activateSafeAutomation(owner);
    } else if (payload.mode === "dry-run") {
      await pauseAutomation(owner);
    } else {
      throw new Error("Der Automatikmodus ist ungültig.");
    }
    return Response.json(
      { ok: true, mode: payload.mode },
      { headers: PLANNING_NO_STORE_HEADERS },
    );
  } catch (error) {
    return planningErrorResponse(error);
  }
}
