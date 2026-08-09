import type { AppState } from "./types";

/**
 * Minimum contract shared by the browser cache, the D1 state route and
 * server-side planning. A valid-looking object is not enough: revisions
 * must be monotonic integers and every consumer-critical collection must exist.
 */
export function isPersistedAppState(value: unknown): value is AppState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Partial<AppState>;
  return (
    state.schemaVersion === 1 &&
    typeof state.revision === "number" &&
    Number.isSafeInteger(state.revision) &&
    state.revision >= 0 &&
    typeof state.updatedAt === "string" &&
    state.updatedAt.length > 0 &&
    Array.isArray(state.tasks) &&
    Array.isArray(state.costs) &&
    Array.isArray(state.documents) &&
    Array.isArray(state.calendarEvents) &&
    Array.isArray(state.applications) &&
    Array.isArray(state.journal)
  );
}
