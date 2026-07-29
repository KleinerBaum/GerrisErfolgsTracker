import {
  deleteGerrisTask,
  getGerrisTask,
  parseUpdateTaskInput,
  updateGerrisTask,
} from "../../../../lib/google-tasks-server";
import {
  googleErrorResponse,
  GoogleValidationError,
  requireGoogleConnection,
  sameOrigin,
} from "../../../../lib/google-workspace-server";

export const dynamic = "force-dynamic";

function validTaskId(value: string): string {
  if (!value || value.length > 1024) {
    throw new GoogleValidationError("Die Aufgaben-ID ist ungültig.");
  }
  return value;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  try {
    const connection = await requireGoogleConnection(request, {
      capability: "tasks",
    });
    const taskId = validTaskId((await context.params).taskId);
    return Response.json(
      { task: await getGerrisTask(connection, taskId) },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return googleErrorResponse(error, "tasks");
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
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
    const taskId = validTaskId((await context.params).taskId);
    const payload = await request.json().catch(() => {
      throw new GoogleValidationError("Die Aufgabendaten sind kein gültiges JSON.");
    });
    const task = await updateGerrisTask(
      connection,
      taskId,
      parseUpdateTaskInput(payload),
      request.headers.get("if-match"),
    );
    return Response.json(
      { task, updated: true },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return googleErrorResponse(error, "tasks");
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
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
    const taskId = validTaskId((await context.params).taskId);
    const confirmAssigned =
      new URL(request.url).searchParams.get("confirmAssigned") === "true";
    await deleteGerrisTask(
      connection,
      taskId,
      confirmAssigned,
      request.headers.get("if-match"),
    );
    return Response.json(
      { ok: true, id: taskId },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return googleErrorResponse(error, "tasks");
  }
}
