import {
  driveErrorResponse,
  driveFileResponse,
} from "../../../../../lib/google-drive-server";
import { ownerEmail } from "../../../../../lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  const email = ownerEmail(request);
  if (!email) return new Response("Anmeldung erforderlich.", { status: 401 });
  try {
    const { fileId } = await context.params;
    const download = new URL(request.url).searchParams.get("download") === "1";
    return await driveFileResponse(email, fileId, download);
  } catch (error) {
    return driveErrorResponse(error);
  }
}
