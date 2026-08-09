import type { ViewKey } from "./types";

const VIEW_KEYS = new Set<ViewKey>([
  "today",
  "tasks",
  "calendar",
  "finance",
  "documents",
  "applications",
  "contacts",
  "journal",
]);

export const VIEW_QUERY_PARAMETER = "bereich";

export function parseViewKey(
  value: string | null | undefined,
  fallback: ViewKey = "today",
): ViewKey {
  const candidate = value?.trim().toLocaleLowerCase("de-DE") as ViewKey;
  return VIEW_KEYS.has(candidate) ? candidate : fallback;
}

export function viewFromUrl(
  value: string | URL,
  fallback: ViewKey = "today",
): ViewKey {
  const url = typeof value === "string" ? new URL(value) : value;
  return parseViewKey(url.searchParams.get(VIEW_QUERY_PARAMETER), fallback);
}

export function urlForView(value: string | URL, view: ViewKey): string {
  const url = typeof value === "string" ? new URL(value) : new URL(value);
  if (view === "today") {
    url.searchParams.delete(VIEW_QUERY_PARAMETER);
  } else {
    url.searchParams.set(VIEW_QUERY_PARAMETER, view);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
