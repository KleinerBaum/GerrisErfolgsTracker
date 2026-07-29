import {
  findGerrisTaskList,
  listGoogleTaskLists,
} from "../../../../lib/google-tasks-server";
import {
  googleErrorResponse,
  requireGoogleConnection,
} from "../../../../lib/google-workspace-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const connection = await requireGoogleConnection(request, {
      capability: "tasks",
    });
    const [lists, selected] = await Promise.all([
      listGoogleTaskLists(connection),
      findGerrisTaskList(connection),
    ]);
    return Response.json(
      { lists, selectedTaskListId: selected?.id || null },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return googleErrorResponse(error, "tasks");
  }
}
