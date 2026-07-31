import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function readRepositoryGuide() {
  try {
    await access(new URL("../pyproject.toml", root));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
  return readFile(new URL("../docs/google-workspace-sites.md", root), "utf8");
}

test("liefert die informative Kalenderzentrale mit vier Ansichten", async () => {
  const [view, styles, app, actions, types] = await Promise.all([
    readFile(new URL("components/calendar-view.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("components/life-os-app.tsx", root), "utf8"),
    readFile(new URL("components/quick-actions.tsx", root), "utf8"),
    readFile(new URL("lib/types.ts", root), "utf8"),
  ]);

  for (const label of ["Tag", "Woche", "Monat", "Agenda"]) {
    assert.match(view, new RegExp(`label: "${label}"`));
  }
  assert.match(view, /Heute zentral/);
  assert.match(view, /Tageslage/);
  assert.match(view, /Fokus-Guide/);
  assert.match(view, /Fristen-Guide/);
  assert.match(view, /Meine Kalender/);
  assert.match(view, /Google-Kalender anlegen/);
  assert.match(view, /MAX_SELECTED_CALENDARS = 12/);
  assert.match(view, /gerri-calendar-selection-v1/);
  assert.match(styles, /\.calendar-day-focus/);
  assert.match(styles, /\.calendar-month/);
  assert.match(styles, /\.calendar-week-body/);
  assert.match(styles, /\.calendar-day-timeline/);
  assert.match(styles, /\.calendar-agenda-view/);
  assert.match(app, /<CalendarWorkspace/);
  assert.match(app, /onEventsChange=\{setExternalEvents\}/);
  assert.match(actions, /Zielkalender/);
  assert.match(actions, /calendarId,/);
  assert.match(types, /export type GoogleCalendar/);
  assert.match(types, /calendarId\?: string/);
});

test("verwaltet Google-Kalender mit begrenzten Scopes und schreibgeschützten GETs", async () => {
  const [
    workspace,
    server,
    eventRoute,
    calendarRoute,
    client,
    guide,
  ] = await Promise.all([
    readFile(new URL("lib/google-workspace-server.ts", root), "utf8"),
    readFile(new URL("lib/google-calendar-server.ts", root), "utf8"),
    readFile(new URL("app/api/calendar/route.ts", root), "utf8"),
    readFile(new URL("app/api/calendar/calendars/route.ts", root), "utf8"),
    readFile(new URL("lib/google-calendar-client.ts", root), "utf8"),
    readRepositoryGuide(),
  ]);

  for (const scope of [
    "calendar.events.owned",
    "calendar.events.readonly",
    "calendar.calendarlist.readonly",
    "calendar.calendars",
    "calendar.acls.readonly",
  ]) {
    assert.match(workspace, new RegExp(scope.replaceAll(".", "\\.")));
    if (guide !== null) {
      assert.match(guide, new RegExp(scope.replaceAll(".", "\\.")));
    }
  }
  assert.match(workspace, /scopesForCapability\(capability\)\.every/);
  assert.match(server, /users\/me\/calendarList/);
  assert.match(server, /new URL\(`\$\{CALENDAR_API\}\/calendars`\)/);
  assert.match(server, /targetCalendarId/);
  assert.match(eventRoute, /MAX_SELECTED_CALENDARS = 12/);
  assert.match(eventRoute, /GOOGLE_CALENDAR_READ_EVENTS_SCOPE/);
  assert.match(calendarRoute, /export async function GET/);
  assert.match(calendarRoute, /export async function POST/);
  assert.match(calendarRoute, /sameOrigin\(request\)/);
  assert.doesNotMatch(calendarRoute.split("export async function POST")[0], /method:\s*"POST"/);
  assert.match(client, /fetch\("\/api\/calendar\/calendars"/);
  assert.match(client, /query\.append\("calendarId"/);
  assert.match(server, /isCalendarExclusivelyPrivate/);
  assert.match(server, /gerrisDesiredHash/);
  assert.match(server, /export async function updateCalendarEvent/);
  assert.match(server, /export async function deleteCalendarEvent/);
});
