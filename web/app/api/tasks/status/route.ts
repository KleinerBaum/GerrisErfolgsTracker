import { findGerrisTaskList } from "../../../../lib/google-tasks-server";
import {
  connectUrl,
  GoogleAuthorizationError,
  googleErrorResponse,
  googleWorkspaceStatus,
  ownerEmail,
  requireGoogleConnection,
} from "../../../../lib/google-workspace-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const email = ownerEmail(request);
  if (!email) {
    return googleErrorResponse(
      new GoogleAuthorizationError(
        "Anmeldung erforderlich.",
        "tasks",
        "authentication_required",
        false,
      ),
      "tasks",
    );
  }
  try {
    const workspace = await googleWorkspaceStatus(email);
    const authorized = workspace.capabilities.tasks.granted;
    if (!workspace.configured || !workspace.connected || !authorized) {
      return Response.json(
        {
          configured: workspace.configured,
          connected: workspace.connected,
          authorized,
          googleEmail: workspace.googleEmail,
          connectUrl: connectUrl("tasks"),
          taskList: null,
        },
        { headers: { "cache-control": "private, no-store" } },
      );
    }
    const connection = await requireGoogleConnection(request, {
      capability: "tasks",
    });
    const taskList = await findGerrisTaskList(connection);
    return Response.json(
      {
        configured: true,
        connected: true,
        authorized: true,
        googleEmail: connection.googleEmail,
        connectUrl: connectUrl("tasks"),
        taskList: taskList
          ? { id: taskList.id, title: taskList.title }
          : null,
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return googleErrorResponse(error, "tasks");
  }
}
