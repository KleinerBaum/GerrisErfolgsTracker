import {
  disconnectDrive,
  driveErrorResponse,
} from "../../../../lib/google-drive-server";
import { ownerEmail, sameOrigin } from "../../../../lib/server-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const email = ownerEmail(request);
  if (!email) {
    return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return Response.json({ error: "Ungültiger Ursprung." }, { status: 403 });
  }
  try {
    await disconnectDrive(email);
    return Response.json(
      { ok: true },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return driveErrorResponse(error);
  }
}
