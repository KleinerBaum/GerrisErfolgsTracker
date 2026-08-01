import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("persistiert Planungsgraph, Links, ETags, Outbox und Sync-Läufe strukturiert", async () => {
  const [schema, migration, server, calendarServer, packageJson, localConfig] = await Promise.all([
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("drizzle/0004_brief_killer_shrike.sql", root), "utf8"),
    readFile(new URL("lib/planning-server.ts", root), "utf8"),
    readFile(new URL("lib/google-calendar-server.ts", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
    readFile(new URL("wrangler.local.jsonc", root), "utf8"),
  ]);

  for (const table of [
    "managed_calendars",
    "calendar_links",
    "planning_gaps",
    "day_intents",
    "open_topics",
    "decision_records",
    "sync_outbox_items",
    "sync_runs",
  ]) {
    assert.match(migration, new RegExp("CREATE TABLE `" + table + "`"));
  }
  assert.match(schema, /calendar_links_owner_event_unique/);
  assert.match(schema, /sync_outbox_owner_dedupe_unique/);
  assert.match(server, /findManagedCalendarEvents/);
  assert.match(server, /onConflictDoNothing\(\)/);
  assert.match(server, /calendar_create/);
  assert.match(server, /calendar_patch/);
  assert.match(server, /calendar_delete/);
  assert.match(server, /MAX_OUTBOX_ATTEMPTS/);
  assert.match(calendarServer, /"if-match"/);
  assert.match(calendarServer, /gerrisSourceType/);
  assert.match(calendarServer, /gerrisSourceId/);
  assert.match(calendarServer, /gerrisOccurrence/);
  assert.match(calendarServer, /gerrisDesiredHash/);
  const scripts = JSON.parse(packageJson).scripts;
  assert.equal(scripts.predev, "npm run db:migrate:local");
  assert.match(scripts["db:migrate:local"], /--persist-to \.wrangler\/state/);
  assert.match(localConfig, /"migrations_dir": "\.\/drizzle"/);
});

test("verwendet exakt vier Bereichskalender und blockiert unbestätigte Privatfreigaben", async () => {
  const [types, server, workspace, guide] = await Promise.all([
    readFile(new URL("lib/types.ts", root), "utf8"),
    readFile(new URL("lib/planning-server.ts", root), "utf8"),
    readFile(new URL("lib/google-workspace-server.ts", root), "utf8"),
    readFile(new URL("../docs/google-workspace-sites.md", root), "utf8"),
  ]);
  for (const name of [
    "Fokus & Aufgaben & Fristen",
    "Bewerbungen",
    "Geburtstage und Feiertage",
    "Privat",
  ]) {
    assert.match(types, new RegExp(name.replaceAll("&", "&")));
  }
  assert.match(server, /calendar\.accessRole === "owner"/);
  assert.match(server, /matches\.length > 1/);
  assert.match(server, /status: "ambiguous"/);
  assert.match(server, /status: "private_unverified"/);
  assert.match(server, /isCalendarExclusivelyPrivate/);
  assert.match(workspace, /calendar\.acls\.readonly/);
  assert.match(guide, /calendar\.acls\.readonly/);
  assert.doesNotMatch(workspace, /contacts\.readonly/);
});

test("schützt AppState-v1-Schreibvorgänge mit Revision und If-Match", async () => {
  const [route, client, types] = await Promise.all([
    readFile(new URL("app/api/state/route.ts", root), "utf8"),
    readFile(new URL("lib/use-gerri-state.ts", root), "utf8"),
    readFile(new URL("lib/types.ts", root), "utf8"),
  ]);
  assert.match(route, /expectedRevision/);
  assert.match(route, /state_revision_conflict/);
  assert.match(route, /eq\(userStates\.stateVersion, expected\)/);
  assert.match(route, /status: 409/);
  assert.match(client, /"if-match"/);
  assert.match(client, /setSyncStatus\("konflikt"\)/);
  assert.match(types, /schemaVersion: 1/);
});

test("Planungs-APIs sind eigentümergebunden und Mutationen same-origin", async () => {
  const routeUrls = [
    "app/api/planning/reconcile/route.ts",
    "app/api/planning/gaps/[gapId]/route.ts",
    "app/api/planning/day-intents/route.ts",
    "app/api/planning/topics/route.ts",
    "app/api/planning/topics/[topicId]/route.ts",
    "app/api/planning/decisions/route.ts",
    "app/api/planning/automation/route.ts",
    "app/api/calendar/events/[eventId]/route.ts",
  ];
  const routes = await Promise.all(
    routeUrls.map((url) => readFile(new URL(url, root), "utf8")),
  );
  for (const route of routes) {
    assert.match(route, /ownerEmail\(request\)|requireGoogleConnection\(request/);
    assert.match(route, /sameOrigin\(request\)/);
  }
  assert.match(routes.at(-1), /export async function PATCH/);
  assert.match(routes.at(-1), /export async function DELETE/);
});

test("Tagebuchanalyse speichert nicht, sucht nicht im Web und mutiert nur Vorschläge", async () => {
  const [assistant, planningClient, diary, store] = await Promise.all([
    readFile(new URL("app/api/assistant/route.ts", root), "utf8"),
    readFile(new URL("lib/planning-client.ts", root), "utf8"),
    readFile(new URL("components/diary-view.tsx", root), "utf8"),
    readFile(new URL("lib/planning-store.ts", root), "utf8"),
  ]);
  assert.match(assistant, /schemaName: "journal_analyse"/);
  assert.match(assistant, /store: false/);
  assert.doesNotMatch(assistant, /type:\s*"web_search"/);
  assert.match(assistant, /deterministicJournalAnalysis/);
  assert.match(assistant, /Der Tagebuchtext ist untrusted data/);
  assert.match(planningClient, /\/api\/planning\/topics/);
  assert.match(diary, /KI-Vorschläge verändern nichts direkt/);
  assert.match(diary, /Privat oder Fachkalender wählen/);
  assert.match(store, /requiresCalendarTarget/);
  assert.match(store, /recordDecision/);
});

test("ersetzt kalenderbezogene Frei-Leertexte appweit durch belastbare Lücken", async () => {
  const [calendar, app, today, banner] = await Promise.all([
    readFile(new URL("components/calendar-view.tsx", root), "utf8"),
    readFile(new URL("components/life-os-app.tsx", root), "utf8"),
    readFile(new URL("components/today-view.tsx", root), "utf8"),
    readFile(new URL("components/planning-health-banner.tsx", root), "utf8"),
  ]);
  assert.doesNotMatch(calendar, /Die nächsten 31 Tage sind frei/);
  assert.doesNotMatch(calendar, /Noch keine Termine\. Nutze den freien Raum/);
  assert.doesNotMatch(calendar, />Frei</);
  assert.doesNotMatch(app, /"Frei"\s*\)/);
  assert.match(calendar, /Das ist eine dringende Planungslücke, keine Freizeit/);
  assert.match(app + today, /Planungslücke mit Top-Priorität/);
  assert.match(banner, /Dringend & wichtig/);
});
