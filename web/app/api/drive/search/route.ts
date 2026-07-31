import {
  driveErrorResponse,
  searchDriveFolders,
} from "../../../../lib/google-drive-server";
import {
  GoogleAuthorizationError,
  googleErrorResponse,
} from "../../../../lib/google-workspace-server";
import { ownerEmail } from "../../../../lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const email = ownerEmail(request);
  if (!email) {
    return googleErrorResponse(
      new GoogleAuthorizationError(
        "Anmeldung erforderlich.",
        "drive",
        "authentication_required",
        false,
      ),
      "drive",
    );
  }
  try {
    const query = new URL(request.url).searchParams.get("q") || "";
    return Response.json(
      { items: await searchDriveFolders(email, query) },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return driveErrorResponse(error);
  }
}
