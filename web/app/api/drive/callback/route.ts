import {
  driveErrorResponse,
  finishOAuth,
  verifySignedValue,
} from "../../../../lib/google-drive-server";
import { ownerEmail } from "../../../../lib/server-auth";

export const dynamic = "force-dynamic";

function cookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.get("cookie") || "";
  for (const item of cookies.split(";")) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return null;
}

export async function GET(request: Request) {
  const email = ownerEmail(request);
  if (!email) return new Response("Anmeldung erforderlich.", { status: 401 });
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const signed = cookieValue(request, "gerri_drive_oauth");
  const payload = signed ? await verifySignedValue(signed) : null;
  const clearCookie =
    "gerri_drive_oauth=; Path=/api/drive/callback; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
  try {
    if (!payload || !code || !state) throw new Error("Anmeldung unvollständig.");
    const parsed = JSON.parse(payload) as {
      ownerEmail?: string;
      state?: string;
      verifier?: string;
      issuedAt?: number;
    };
    if (
      parsed.ownerEmail !== email ||
      parsed.state !== state ||
      !parsed.verifier ||
      !parsed.issuedAt ||
      Date.now() - parsed.issuedAt > 10 * 60 * 1000
    ) {
      throw new Error("Anmeldung abgelaufen oder ungültig.");
    }
    await finishOAuth(email, code, parsed.verifier);
    const headers = new Headers({
      location: "/?drive=verbunden",
      "set-cookie": clearCookie,
    });
    return new Response(null, { status: 302, headers });
  } catch (error) {
    const response = driveErrorResponse(error);
    const headers = new Headers(response.headers);
    headers.set("set-cookie", clearCookie);
    headers.set("location", "/?drive=fehler");
    return new Response(null, { status: 302, headers });
  }
}
