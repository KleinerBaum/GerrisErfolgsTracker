import {
  disconnectGoogle,
  GoogleAuthorizationError,
  googleErrorResponse,
  ownerEmail,
  sameOrigin,
} from "../../../../lib/google-workspace-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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
  if (!sameOrigin(request)) {
    return Response.json(
      { error: "Ungültiger Ursprung.", code: "invalid_origin" },
      { status: 403, headers: { "cache-control": "private, no-store" } },
    );
  }
  try {
    await disconnectGoogle(email);
    return Response.json(
      { ok: true },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return googleErrorResponse(error);
  }
}
