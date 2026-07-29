import type { CalendarEvent } from "../../../lib/types";

export const dynamic = "force-dynamic";

const DEFAULT_ICAL_URL =
  "https://calendar.google.com/calendar/ical/gerrit.fabisch2024%40gmail.com/public/basic.ics";

const unfold = (value: string): string =>
  value.replace(/\r?\n[ \t]/g, "").replace(/\r/g, "");

const unescapeIcs = (value: string): string =>
  value
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();

function berlinDate(
  year: string,
  month: string,
  day: string,
  hour: string,
  minute: string,
  second: string,
): string {
  const utcGuess = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(new Date(utcGuess))
    .reduce<Record<string, string>>((result, part) => {
      if (part.type !== "literal") result[part.type] = part.value;
      return result;
    }, {});
  const displayedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return new Date(utcGuess - (displayedAsUtc - utcGuess)).toISOString();
}

function parseIcsDate(value: string): string | null {
  const dateOnly = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    return berlinDate(dateOnly[1], dateOnly[2], dateOnly[3], "09", "00", "00");
  }
  const match = value.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/,
  );
  if (!match) return null;
  const [, year, month, day, hour, minute, second, utc] = match;
  if (!utc) return berlinDate(year, month, day, hour, minute, second);
  const parsed = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function property(block: string, name: string): string | null {
  const match = block.match(new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, "m"));
  return match?.[1] ? unescapeIcs(match[1]) : null;
}

function parseCalendar(raw: string): CalendarEvent[] {
  const now = Date.now() - 86_400_000;
  const horizon = Date.now() + 45 * 86_400_000;
  return unfold(raw)
    .split("BEGIN:VEVENT")
    .slice(1)
    .map((block): CalendarEvent | null => {
      const id = property(block, "UID");
      const title = property(block, "SUMMARY");
      const startRaw = property(block, "DTSTART");
      const endRaw = property(block, "DTEND");
      if (!id || !title || !startRaw) return null;
      const startAt = parseIcsDate(startRaw);
      const endAt = parseIcsDate(endRaw ?? startRaw);
      if (!startAt || !endAt) return null;
      const timestamp = new Date(startAt).getTime();
      if (timestamp < now || timestamp > horizon) return null;
      return {
        id: `google-${id}`,
        title,
        startAt,
        endAt,
        source: "google",
        kind: "appointment",
        private: true,
      };
    })
    .filter((event): event is CalendarEvent => event !== null)
    .sort((left, right) => left.startAt.localeCompare(right.startAt))
    .slice(0, 40);
}

export async function GET() {
  const calendarUrl =
    process.env.GOOGLE_CALENDAR_ICAL_URL?.trim() || DEFAULT_ICAL_URL;
  try {
    const response = await fetch(calendarUrl, {
      headers: { accept: "text/calendar" },
      cf: { cacheTtl: 300, cacheEverything: false },
    } as RequestInit);
    if (!response.ok) {
      throw new Error(`Kalenderantwort ${response.status}`);
    }
    const events = parseCalendar(await response.text());
    return Response.json(
      { events, source: "google-ical", fetchedAt: new Date().toISOString() },
      { headers: { "cache-control": "private, max-age=300" } },
    );
  } catch {
    return Response.json(
      {
        events: [],
        source: "unavailable",
        fetchedAt: new Date().toISOString(),
      },
      { status: 200, headers: { "cache-control": "private, max-age=60" } },
    );
  }
}
