import {
  createGoogleOAuthState,
  GoogleAuthorizationError,
  googleErrorResponse,
  GOOGLE_OAUTH_COOKIE,
  isGoogleCapability,
  ownerEmail,
} from "../../../../lib/google-workspace-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const capabilityValue = url.searchParams.get("capability");
  if (!isGoogleCapability(capabilityValue)) {
    return Response.json(
      {
        error: "Die gewünschte Google-Funktion ist ungültig.",
        code: "invalid_request",
      },
      { status: 400, headers: { "cache-control": "private, no-store" } },
    );
  }
  const email = ownerEmail(request);
  if (!email) {
    return googleErrorResponse(
      new GoogleAuthorizationError(
        "Anmeldung erforderlich.",
        capabilityValue,
        "authentication_required",
        false,
      ),
      capabilityValue,
    );
  }

  try {
    const defaultReturnTo = `/?google=verbunden&capability=${encodeURIComponent(
      capabilityValue,
    )}`;
    const { authorizationUrl, cookieValue } = await createGoogleOAuthState(
      email,
      [capabilityValue],
      url.searchParams.get("returnTo") || defaultReturnTo,
    );
    const headers = new Headers({
      location: authorizationUrl,
      "cache-control": "private, no-store",
    });
    headers.append(
      "set-cookie",
      `${GOOGLE_OAUTH_COOKIE}=${encodeURIComponent(
        cookieValue,
      )}; Path=/api; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
    );
    return new Response(null, { status: 302, headers });
  } catch (error) {
    return googleErrorResponse(error, capabilityValue);
  }
}
