export const PLANNING_NO_STORE_HEADERS = {
  "cache-control": "private, no-store",
};

function errorMessages(error: unknown): string[] {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (seen.has(current)) break;
    seen.add(current);
    if (current instanceof Error) messages.push(current.message);
    else if (typeof current === "object" && "message" in current) {
      messages.push(String(current.message));
    }
    current =
      typeof current === "object" && "cause" in current
        ? current.cause
        : null;
  }
  return messages;
}

export function planningErrorResponse(error: unknown): Response {
  const message = errorMessages(error).join("\n");
  const normalizedMessage = message.toLowerCase();
  const storageUnavailable =
    normalizedMessage.includes("d1-binding") ||
    normalizedMessage.includes("d1_") ||
    normalizedMessage.includes("database") ||
    normalizedMessage.includes("no such table") ||
    normalizedMessage.includes("planning_") ||
    normalizedMessage.includes("managed_calendars") ||
    normalizedMessage.includes("sync_") ||
    normalizedMessage.includes("open_topics") ||
    normalizedMessage.includes("day_intents") ||
    normalizedMessage.includes("calendar_links");
  const inputError =
    message.includes("ungültig") ||
    message.includes("benötigt") ||
    message.includes("nicht gefunden") ||
    message.includes("erst nach");
  return Response.json(
    {
      error: storageUnavailable
        ? "Der private Planungsspeicher wird gerade vorbereitet."
        : inputError
          ? message
          : "Die Planung konnte momentan nicht verarbeitet werden.",
      code: storageUnavailable
        ? "planning_storage_preparing"
        : inputError
          ? "planning_invalid_request"
          : "planning_unavailable",
    },
    {
      status: storageUnavailable ? 503 : inputError ? 400 : 502,
      headers: PLANNING_NO_STORE_HEADERS,
    },
  );
}
