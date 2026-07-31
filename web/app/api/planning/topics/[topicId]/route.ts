import {
  PLANNING_NO_STORE_HEADERS,
  planningErrorResponse,
} from "../../../../../lib/planning-api";
import { updateOpenTopic } from "../../../../../lib/planning-store";
import { ownerEmail, sameOrigin } from "../../../../../lib/server-auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ topicId: string }> },
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
    const topicId = (await context.params).topicId;
    if (!topicId || topicId.length > 512) {
      throw new Error("Die Themen-ID ist ungültig.");
    }
    const input = (await request.json()) as Record<string, unknown>;
    const topic = await updateOpenTopic(owner, topicId, input);
    return Response.json({ topic }, { headers: PLANNING_NO_STORE_HEADERS });
  } catch (error) {
    return planningErrorResponse(error);
  }
}
