import {
  createGerrisTask,
  listGerrisTasks,
  parseCreateTaskInput,
} from "../../../lib/google-tasks-server";
import {
  googleErrorResponse,
  GoogleValidationError,
  requireGoogleConnection,
  sameOrigin,
} from "../../../lib/google-workspace-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const connection = await requireGoogleConnection(request, {
      capability: "tasks",
    });
    const result = await listGerrisTasks(connection);
    return Response.json(
      {
        ...result,
        source: "google-tasks",
        fetchedAt: new Date().toISOString(),
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return googleErrorResponse(error, "tasks");
  }
}

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
      throw new GoogleValidationError("Die Aufgabendaten sind kein gültiges JSON.");
    });
    const result = await createGerrisTask(
      connection,
      parseCreateTaskInput(payload),
    );
    return Response.json(
      { task: result.task, created: result.created },
      {
        status: result.created ? 201 : 200,
        headers: { "cache-control": "private, no-store" },
      },
    );
  } catch (error) {
    return googleErrorResponse(error, "tasks");
  }
}
