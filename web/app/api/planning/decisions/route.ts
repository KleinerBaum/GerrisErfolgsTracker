import {
  PLANNING_NO_STORE_HEADERS,
  planningErrorResponse,
} from "../../../../lib/planning-api";
import { recordDecision } from "../../../../lib/planning-store";
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
    const input = (await request.json()) as Record<string, unknown> & {
      title: unknown;
      decision: unknown;
    };
    return Response.json(
      { decision: await recordDecision(owner, input) },
      { status: 201, headers: PLANNING_NO_STORE_HEADERS },
    );
  } catch (error) {
    return planningErrorResponse(error);
  }
}
