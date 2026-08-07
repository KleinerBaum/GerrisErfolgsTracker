/**
 * Liest einen HTTP-Antwortkörper fehlertolerant als JSON.
 *
 * Externe Dienste und Proxies liefern bei Fehlern gelegentlich HTML oder einen
 * leeren Körper. UI-Aktionen sollen dann ihren verständlichen deutschen
 * Fallback anzeigen, statt mit einem JSON-Syntaxfehler abzubrechen.
 */
export async function responsePayload<T extends object>(
  response: Response,
): Promise<T> {
  const body = await response.text();
  if (!body.trim()) return {} as T;
  try {
    const parsed: unknown = JSON.parse(body);
    return parsed && typeof parsed === "object" ? (parsed as T) : ({} as T);
  } catch {
    return {} as T;
  }
}
