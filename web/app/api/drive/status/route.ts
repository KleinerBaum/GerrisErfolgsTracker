import { driveErrorResponse, driveStatus } from "../../../../lib/google-drive-server";
import { ownerEmail } from "../../../../lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const email = ownerEmail(request);
  if (!email) {
    return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });
  }
  try {
    return Response.json(await driveStatus(email), {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return driveErrorResponse(error);
  }
}
