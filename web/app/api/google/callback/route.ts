import {
  finishGoogleOAuth,
  GOOGLE_OAUTH_COOKIE,
  type GoogleCapability,
  type GoogleOAuthState,
  googleErrorResponse,
  GoogleValidationError,
  ownerEmail,
  parseGoogleOAuthState,
} from "../../../../lib/google-workspace-server";

export const dynamic = "force-dynamic";

function cookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.get("cookie") || "";
  for (const item of cookies.split(";")) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return null;
}

const CLEAR_COOKIE = `${GOOGLE_OAUTH_COOKIE}=; Path=/api; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

export async function GET(request: Request) {
  const email = ownerEmail(request);
  const url = new URL(request.url);
  let payload: GoogleOAuthState | null = null;
  let capability: GoogleCapability = "tasks";
  let clearCookie = false;

  try {
    payload = await parseGoogleOAuthState(
      cookieValue(request, GOOGLE_OAUTH_COOKIE) || "",
    );
    capability = payload?.capabilities[0] || "tasks";
    if (!email) throw new GoogleValidationError("Anmeldung erforderlich.");
    const state = url.searchParams.get("state");
    if (
      !payload ||
      !state ||
      payload.ownerEmail !== email ||
      payload.state !== state ||
      Date.now() - payload.issuedAt > 10 * 60 * 1000
    ) {
      throw new GoogleValidationError(
        "Die Google-Anmeldung ist abgelaufen oder ungültig.",
      );
    }
    clearCookie = true;
    const providerError = url.searchParams.get("error");
    if (providerError) {
      throw new GoogleValidationError(
        providerError === "access_denied"
          ? "Die Google-Berechtigung wurde nicht erteilt."
          : "Die Google-Anmeldung wurde abgebrochen.",
      );
    }
    const code = url.searchParams.get("code");
    if (!code) {
      throw new GoogleValidationError(
        "Die Google-Anmeldung ist abgelaufen oder ungültig.",
      );
    }
    await finishGoogleOAuth(
      email,
      code,
      payload.verifier,
      payload.capabilities,
    );
    return new Response(null, {
      status: 302,
      headers: {
        location: payload.returnTo,
        "set-cookie": CLEAR_COOKIE,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    const errorResponse = googleErrorResponse(error, capability);
    let errorCode = "google_oauth_failed";
    try {
      const body = (await errorResponse.clone().json()) as { code?: string };
      errorCode = body.code || errorCode;
    } catch {
      // Keep the stable generic redirect code.
    }
    return new Response(null, {
      status: 302,
      headers: {
        location: `/?google=fehler&code=${encodeURIComponent(errorCode)}`,
        ...(clearCookie ? { "set-cookie": CLEAR_COOKIE } : {}),
        "cache-control": "private, no-store",
      },
    });
  }
}
