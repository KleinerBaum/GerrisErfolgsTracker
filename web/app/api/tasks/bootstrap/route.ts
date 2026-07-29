import {
  bootstrapGerrisTasks,
  parseBootstrapTasks,
} from "../../../../lib/google-tasks-server";
import {
  googleErrorResponse,
  GoogleValidationError,
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
    const payload = await request.json().catch(() => {
      throw new GoogleValidationError(
        "Die zu importierenden Aufgaben sind kein gültiges JSON.",
      );
    });
    const result = await bootstrapGerrisTasks(
      connection,
      parseBootstrapTasks(payload),
    );
    return Response.json(result, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return googleErrorResponse(error, "tasks");
  }
}
