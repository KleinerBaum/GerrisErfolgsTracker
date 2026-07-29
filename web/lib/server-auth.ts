export function ownerEmail(request: Request): string | null {
  const authenticated = request.headers
    .get("oai-authenticated-user-email")
    ?.trim()
    .toLowerCase();
  if (authenticated) return authenticated;

  const host = new URL(request.url).hostname;
  if (
    process.env.NODE_ENV !== "production" ||
    host === "localhost" ||
    host === "127.0.0.1"
  ) {
    return "lokale-vorschau@gerris-kompass";
  }
  return null;
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function ownerHash(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(email);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
