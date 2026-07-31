export const PLANNING_NO_STORE_HEADERS = {
  "cache-control": "private, no-store",
};

export function planningErrorResponse(error: unknown): Response {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "";
  const storageUnavailable =
    message.includes("D1-Binding") ||
    message.includes("D1_") ||
    message.includes("database") ||
    message.includes("no such table") ||
    message.includes("planning_") ||
    message.includes("managed_calendars") ||
    message.includes("sync_") ||
    message.includes("open_topics") ||
    message.includes("day_intents") ||
    message.includes("calendar_links");
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
