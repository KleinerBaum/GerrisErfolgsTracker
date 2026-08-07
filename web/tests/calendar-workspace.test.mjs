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
  const [view, styles, app, eventForm, types] = await Promise.all([
    readFile(new URL("components/calendar-view.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("components/life-os-app.tsx", root), "utf8"),
    readFile(new URL("components/calendar-event-form.tsx", root), "utf8"),
    readFile(new URL("lib/types.ts", root), "utf8"),
  ]);

  for (const label of ["Tag", "Woche", "Monat", "Agenda"]) {
    assert.match(view, new RegExp(`label: "${label}"`));
  }
  assert.match(view, /Planungscheck/);
  assert.match(view, /eyebrow="Tag"/);
  assert.match(view, /eyebrow="Fokus"/);
  assert.match(view, /eyebrow="Fristen"/);
  assert.match(view, /Meine Kalender/);
  assert.match(view, /Google-Kalender anlegen/);
  assert.match(view, /MAX_SELECTED_CALENDARS = 12/);
  assert.match(view, /gerri-calendar-selection-v1/);
  assert.match(view, /zonedDateTimeToIso\(key, "00:00"\)/);
  assert.match(view, /zonedDateTimeInput\(now\)/);
  assert.doesNotMatch(
    view,
    /\.getHours\(|\.getMinutes\(|\.getFullYear\(|\.getMonth\(|\.getDate\(|\.getDay\(/,
  );
  assert.match(styles, /\.calendar-day-focus/);
  assert.match(styles, /\.calendar-month/);
  assert.match(styles, /\.calendar-week-body/);
  assert.match(styles, /\.calendar-day-timeline/);
  assert.match(styles, /\.calendar-agenda-view/);
  assert.match(app, /<CalendarWorkspace/);
  assert.match(app, /onEventsChange=\{setExternalEvents\}/);
  assert.match(eventForm, /Art des Termins/);
  assert.match(eventForm, /Zielkalender/);
  assert.match(eventForm, /calendarId,/);
  assert.match(eventForm, /type="range"/);
  assert.match(eventForm, /Ganztägig/);
  assert.match(eventForm, /Privater Termin/);
  assert.match(eventForm, /Per E-Mail teilen/);
  assert.match(eventForm, /Bewerbungsgespräch/);
  assert.match(eventForm, /Arbeitsagentur \/ Jobcenter/);
  assert.match(eventForm, /Familie \/ Kinder/);
  assert.match(eventForm, /Gesundheit \/ Vorsorge/);
  assert.match(eventForm, /Geburtstagserinnerung/);
  assert.match(eventForm, /Name der Person/);
  assert.match(eventForm, /Geburtsdatum/);
  assert.match(eventForm, /recurrence: isBirthday \? "yearly" : "none"/);
  assert.match(eventForm, /availability: isBirthday \? "free" : "busy"/);
  assert.match(eventForm, /Keine Einladung, kein Zeitblock/);
  assert.match(styles, /\.event-duration-field/);
  assert.match(styles, /\.event-switch-track/);
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
  assert.match(server, /url\.searchParams\.set\("sendUpdates", "all"\)/);
  assert.match(server, /attendees: \[\{ email: input\.attendeeEmail \}\]/);
  assert.match(server, /input\.private === false \? "default" : "private"/);
  assert.match(server, /kind === "birthday" \? "free"/);
  assert.match(server, /transparency: input\.availability === "free" \? "transparent" : "opaque"/);
  assert.match(server, /recurrence: \["RRULE:FREQ=YEARLY"\]/);
  assert.match(server, /\? \{ date: input\.startDate \}/);
  assert.match(server, /\? \{ date: input\.endDate \}/);
  assert.match(server, /export async function updateCalendarEvent/);
  assert.match(server, /export async function deleteCalendarEvent/);
});
