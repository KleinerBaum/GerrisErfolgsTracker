import {
  GoogleAuthorizationError,
  googleErrorResponse,
  googleWorkspaceStatus,
  ownerEmail,
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
    );
  }
  try {
    return Response.json(await googleWorkspaceStatus(email), {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return googleErrorResponse(error);
  }
}
