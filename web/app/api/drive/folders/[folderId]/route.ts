import {
  driveErrorResponse,
  listFolder,
} from "../../../../../lib/google-drive-server";
import { ownerEmail } from "../../../../../lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ folderId: string }> },
) {
  const email = ownerEmail(request);
  if (!email) {
    return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });
  }
  try {
    const { folderId } = await context.params;
    return Response.json(await listFolder(email, folderId), {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return driveErrorResponse(error);
  }
}
