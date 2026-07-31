import {
  PLANNING_NO_STORE_HEADERS,
  planningErrorResponse,
} from "../../../../lib/planning-api";
import { reconcilePlanningOwner } from "../../../../lib/planning-server";
import { ownerEmail, sameOrigin } from "../../../../lib/server-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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
    const payload = (await request.json().catch(() => ({}))) as {
      reason?: unknown;
      forceDryRun?: unknown;
    };
    const reason =
      typeof payload.reason === "string"
        ? payload.reason.trim().slice(0, 120) || "manual"
        : "manual";
    const result = await reconcilePlanningOwner(owner, reason, {
      forceDryRun: payload.forceDryRun === true,
    });
    return Response.json(result, { headers: PLANNING_NO_STORE_HEADERS });
  } catch (error) {
    return planningErrorResponse(error);
  }
}
