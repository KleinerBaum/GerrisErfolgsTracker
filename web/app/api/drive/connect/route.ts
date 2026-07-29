import {
  createOAuthState,
  DriveConfigurationError,
  driveErrorResponse,
  driveConfigured,
} from "../../../../lib/google-drive-server";
import {
  GoogleAuthorizationError,
  GOOGLE_OAUTH_COOKIE,
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
  if (!driveConfigured()) {
    return driveErrorResponse(
      new DriveConfigurationError("Google Drive ist noch nicht eingerichtet."),
    );
  }
  try {
    const { authorizationUrl, cookieValue } = await createOAuthState(email);
    const headers = new Headers({ location: authorizationUrl });
    headers.append(
      "set-cookie",
      `${GOOGLE_OAUTH_COOKIE}=${encodeURIComponent(
        cookieValue,
      )}; Path=/api; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
    );
    return new Response(null, { status: 302, headers });
  } catch (error) {
    return driveErrorResponse(error);
  }
}
