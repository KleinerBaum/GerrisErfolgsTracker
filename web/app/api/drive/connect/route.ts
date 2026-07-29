import {
  createOAuthState,
  driveConfigured,
} from "../../../../lib/google-drive-server";
import { ownerEmail } from "../../../../lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const email = ownerEmail(request);
  if (!email) return new Response("Anmeldung erforderlich.", { status: 401 });
  if (!driveConfigured()) {
    return new Response("Google Drive ist noch nicht eingerichtet.", { status: 503 });
  }
  const { authorizationUrl, cookieValue } = await createOAuthState(email);
  const headers = new Headers({ location: authorizationUrl });
  headers.append(
    "set-cookie",
    `gerri_drive_oauth=${encodeURIComponent(cookieValue)}; Path=/api/drive/callback; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
  );
  return new Response(null, { status: 302, headers });
}
