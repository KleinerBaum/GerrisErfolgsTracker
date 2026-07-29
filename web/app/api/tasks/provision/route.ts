import { provisionGerrisTaskList } from "../../../../lib/google-tasks-server";
import {
  googleErrorResponse,
  requireGoogleConnection,
  sameOrigin,
} from "../../../../lib/google-workspace-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return Response.json(
      { error: "Ungültiger Ursprung.", code: "invalid_origin" },
      { status: 403, headers: { "cache-control": "private, no-store" } },
    );
  }
  try {
    const connection = await requireGoogleConnection(request, {
      capability: "tasks",
    });
    const result = await provisionGerrisTaskList(connection);
    return Response.json(result, {
      status: result.created ? 201 : 200,
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return googleErrorResponse(error, "tasks");
  }
}
