import { env } from "cloudflare:workers";

import { ownerEmail, ownerHash } from "../../../../lib/server-auth";

export const dynamic = "force-dynamic";

const safeFileId = (value: string): string | null =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
    ? value
    : null;

export async function GET(
  request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  const email = ownerEmail(request);
  if (!email) return new Response("Anmeldung erforderlich.", { status: 401 });
  const fileId = safeFileId((await context.params).fileId);
  if (!fileId) return new Response("Datei nicht gefunden.", { status: 404 });

  try {
    const hash = await ownerHash(email);
    const object = await env.FILES.get(`${hash}/${fileId}`);
    if (!object || object.customMetadata?.owner !== hash) {
      return new Response("Datei nicht gefunden.", { status: 404 });
    }

    const name = object.customMetadata?.originalName || "unterlage";
    const encodedName = encodeURIComponent(name);
    const download = new URL(request.url).searchParams.get("download") === "1";
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("cache-control", "private, no-store");
    headers.set(
      "content-disposition",
      `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodedName}`,
    );
    headers.set("x-content-type-options", "nosniff");
    headers.set("content-length", String(object.size));
    return new Response(object.body, { headers });
  } catch {
    return new Response("Datei derzeit nicht verfügbar.", { status: 503 });
  }
}
