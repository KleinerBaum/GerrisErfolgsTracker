import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

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

async function importTypeScriptModule(url) {
  const source = await readFile(url, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
}

test("enthält den vollständigen privaten Organisationsbereich", async () => {
  const [page, app, finance, catalog, layout, css] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("components/life-os-app.tsx", root), "utf8"),
    readFile(new URL("components/finance-view.tsx", root), "utf8"),
    readFile(new URL("lib/finance-catalog.ts", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);

  assert.match(page, /createDemoState/);
  assert.match(app, /Gerris Kompass/);
  assert.match(app, /Heute im Blick/);
  assert.match(app, /Wichtige Unterlagen/);
  assert.match(app, /Kosten im Überblick/);
  assert.match(finance, /Einnahmen und Ausgaben/);
  assert.match(finance, /Laufende Kosten/);
  assert.match(finance, /PayPal/);
  assert.match(finance, /Revolut/);
  assert.equal((catalog.match(/\{ id: \d+, title:/g) ?? []).length, 48);
  assert.match(app, /DIN-A4-Ansicht/);
  assert.match(layout, /og-zentrale\.png/);
  assert.match(layout, /manifest\.webmanifest/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /aspect-ratio:\s*210\s*\/\s*297/);
  assert.doesNotMatch(page + app + layout, /codex-preview|Starter Project/);
});

test("liefert die Kompass-Marke auch über die Browser-Standardroute", async () => {
  const [layout, favicon] = await Promise.all([
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/favicon.ico/route.ts", root), "utf8"),
    access(new URL("app/icon.png", root)),
    access(new URL("app/apple-icon.png", root)),
  ]);

  assert.match(layout, /url: "\/icon\.png"/);
  assert.match(layout, /url: "\/apple-icon\.png"/);
  assert.match(layout, /shortcut: "\/favicon\.ico"/);
  assert.match(favicon, /content-type": "image\/svg\+xml/);
  assert.match(favicon, /x-content-type-options": "nosniff"/);
});

test("pflegt Kontakte zentral und importiert gängige CSV-Formate", async () => {
  const [app, view, types, state, contactsModule] = await Promise.all([
    readFile(new URL("components/life-os-app.tsx", root), "utf8"),
    readFile(new URL("components/contacts-view.tsx", root), "utf8"),
    readFile(new URL("lib/types.ts", root), "utf8"),
    readFile(new URL("lib/use-gerri-state.ts", root), "utf8"),
    importTypeScriptModule(new URL("lib/contacts.ts", root)),
  ]);

  assert.match(app, /key: "contacts", label: "Kontakte"/);
  assert.match(app, /<ContactsView/);
  assert.match(view, /CSV-Datei importieren/);
  assert.match(view, /Vorhandene Kontakte aktualisieren/);
  assert.match(view, /Kontakt anlegen/);
  assert.match(types, /contacts: Contact\[\]/);
  assert.match(state, /Array\.isArray\(candidate\.contacts\)/);

  const result = contactsModule.parseContactCsv(
    '\ufeffVorname;Nachname;E-Mail;Telefon;Firma;Geburtstag;Tags;Notizen\r\n"Ada";"Lovelace";ada@example.org;+49 30 123;Analytical Engines;10.12.1815;Arbeit|VIP;"Notiz; mit Semikolon"\r\nMax;Mustermann;max@example.org;;;;Freunde;',
  );
  assert.equal(result.contacts.length, 2);
  assert.deepEqual(result.contacts[0].tags, ["Arbeit", "VIP"]);
  assert.equal(result.contacts[0].birthday, "1815-12-10");
  assert.equal(result.contacts[0].notes, "Notiz; mit Semikolon");
  assert.equal(
    contactsModule.contactIdentity(result.contacts[0]),
    "email:ada@example.org",
  );
});

test("formatiert Termine in der festen deutschen App-Zeitzone", async () => {
  const format = await importTypeScriptModule(new URL("lib/format.ts", root));

  assert.equal(format.APP_TIME_ZONE, "Europe/Berlin");
  assert.equal(format.formatTime("2026-08-02T10:00:00.000Z"), "12:00");
  assert.equal(format.isoDateInput("2026-07-31T22:30:00.000Z"), "2026-08-01");
  assert.equal(
    format.calendarDayDifference(
      "2026-08-01T00:15:00.000+02:00",
      "2026-07-31T21:45:00.000Z",
    ),
    1,
  );
});

test("macht Heute zur konfigurierbaren bereichsübergreifenden Zentrale", async () => {
  const [app, today, css, types, state, dashboard, layout] = await Promise.all([
    readFile(new URL("components/life-os-app.tsx", root), "utf8"),
    readFile(new URL("components/today-view.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("lib/types.ts", root), "utf8"),
    readFile(new URL("lib/use-gerri-state.ts", root), "utf8"),
    importTypeScriptModule(new URL("lib/dashboard.ts", root)),
    readFile(new URL("app/layout.tsx", root), "utf8"),
  ]);

  assert.match(today, /Master-Dashboard/);
  assert.match(today, /Bereichsübergreifende Prioritäten/);
  assert.match(today, /Deine Zentrale: Was jetzt zählt/);
  assert.match(today, /Dashboard anpassen/);
  assert.match(today, /Langfristig in Bewegung/);
  assert.match(today, /Jeder Lebensbereich mit genügend Substanz/);
  assert.match(today, /title="Fokus & große Vorhaben"/);
  assert.match(today, /title="Zeit & Verbindlichkeit"/);
  assert.match(today, /title="Geld & Verpflichtungen"/);
  assert.match(today, /title="Chancen & nächste Schritte"/);
  assert.match(today, /title="Tagesabschluss & Muster"/);
  assert.doesNotMatch(today, /Deine Quellen|CoreKpiGroup/);
  assert.match(app, /Deine Quellen & Integrationen/);
  assert.match(app, /KPI-Ziele konfigurieren/);
  assert.match(types, /dashboardSettings: DashboardSettings/);
  assert.match(state, /normalizeDashboardSettings/);
  assert.match(css, /\.central-command/);
  assert.match(css, /\.priority-command-list/);
  assert.match(css, /\.dashboard-kpi-settings/);

  const defaults = dashboard.normalizeDashboardSettings(undefined, 2200);
  assert.equal(defaults.kpis.length, 6);
  assert.equal(
    defaults.kpis.find((kpi) => kpi.key === "monthly_spending_limit").target,
    2200,
  );
  const normalized = dashboard.normalizeDashboardSettings({
    kpis: [
      { key: "weekly_task_completions", enabled: false, target: 999 },
      { key: "unknown", enabled: true, target: 1 },
    ],
  });
  assert.equal(
    normalized.kpis.find((kpi) => kpi.key === "weekly_task_completions").enabled,
    false,
  );
  assert.equal(
    normalized.kpis.find((kpi) => kpi.key === "weekly_task_completions").target,
    50,
  );
  assert.match(layout, /og-zentrale\.png/);
  await access(new URL("public/og-zentrale.png", root));
});

test("integriert das Belohnungssystem in Einstellungen, Kopfzeile und Sidebar", async () => {
  const [app, engine, types, css] = await Promise.all([
    readFile(new URL("components/life-os-app.tsx", root), "utf8"),
    readFile(new URL("lib/gamification.ts", root), "utf8"),
    readFile(new URL("lib/types.ts", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);

  assert.doesNotMatch(app, /label: "Momentum Realm"/);
  assert.doesNotMatch(app, /<MomentumRealmView/);
  assert.match(app, /className="topbar-progress"/);
  assert.match(app, /className={`sidebar-reward-progress/);
  assert.match(app, /Belohnungssystem/);
  assert.match(app, /Erreichte Etappen als Pop-up feiern/);
  assert.match(app, /className={`milestone-celebration/);
  assert.match(app, /Bleibt aus, bis schriftlich freigegebene Inhalte/);
  assert.match(engine, /idempotencyKey = `task:\$\{task\.id\}:completion`/);
  assert.match(engine, /Math\.min\(\s*25,/);
  assert.match(types, /RewardMode = \(typeof REWARD_MODES\)\[number\]/);
  assert.match(types, /VerificationType = \(typeof VERIFICATION_TYPES\)\[number\]/);
  assert.match(css, /\.reward-mode-settings/);
  assert.match(css, /\.milestone-celebration/);
  assert.match(css, /\.reward-assessment-dialog/);
});

test("macht das Tagebuch zum abwärtskompatiblen täglichen Abschluss", async () => {
  const [app, diaryView, diaryModel, types, state, css, layout] =
    await Promise.all([
      readFile(new URL("components/life-os-app.tsx", root), "utf8"),
      readFile(new URL("components/diary-view.tsx", root), "utf8"),
      readFile(new URL("lib/diary.ts", root), "utf8"),
      readFile(new URL("lib/types.ts", root), "utf8"),
      readFile(new URL("lib/use-gerri-state.ts", root), "utf8"),
      readFile(new URL("app/globals.css", root), "utf8"),
      readFile(new URL("app/layout.tsx", root), "utf8"),
    ]);

  assert.match(app, /label: "Tagebuch", short: "Tagebuch", mark: "T"/);
  assert.match(app, /journal: "Tagebuch & Tagesabschluss"/);
  assert.doesNotMatch(app, /label: "Journal"|title="Journal"/);
  assert.match(diaryView, /3–5 Minuten am Abend/);
  assert.match(diaryView, /Was war heute\?/);
  assert.match(diaryView, /Ist alles Neue im Kompass\?/);
  assert.match(diaryView, /Was zählt morgen und diese Woche\?/);
  assert.match(diaryView, /Alle aktuell offenen Themen/);
  assert.match(diaryView, /Kritische Planungspunkte zuerst bearbeiten/);
  assert.match(diaryView, /Privat oder Fachkalender wählen/);
  assert.match(diaryView, /Bewerbungsakte aktualisieren/);
  assert.match(diaryView, /createEmptyApplication/);
  assert.match(diaryView, /onCreateApplication\(application\)/);
  assert.match(diaryView, /direkt in Google Tasks auf morgen datiert/);
  assert.match(diaryView, /Nur\s+ausdrücklich gewählte Aufgaben und Termine/);
  assert.match(
    diaryModel,
    /"tasks",\s*"calendar",\s*"applications",\s*"finance",\s*"documents"/,
  );
  assert.match(diaryModel, /upsertDiaryEntry/);
  assert.match(diaryModel, /existing\?\.id/);
  assert.match(types, /weekPlan\?: string/);
  assert.match(types, /reviewedAreas\?: DiaryReviewArea\[\]/);
  assert.match(types, /linkedApplicationIds\?: string\[\]/);
  assert.match(state, /normalizeDiaryEntries\(candidate\.journal\)/);
  assert.match(css, /\.diary-close-layout/);
  assert.match(css, /\.diary-review-checklist/);
  assert.match(layout, /Tagebuch im Blick/);
});

test("übernimmt alte Journal-Einträge und führt Nachträge ohne Datenverlust zusammen", async () => {
  const { DIARY_REVIEW_AREAS, normalizeDiaryEntries, upsertDiaryEntry } =
    await importTypeScriptModule(new URL("lib/diary.ts", root));
  const oldEntry = {
    id: "journal-alt",
    date: "2026-07-30",
    mood: 4,
    text: "Alter Tagesgedanke",
    win: "Etwas abgeschlossen",
    nextStep: "Morgen weiter",
  };

  const normalized = normalizeDiaryEntries([oldEntry]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].id, "journal-alt");
  assert.deepEqual(normalized[0].reviewedAreas, []);

  const closed = upsertDiaryEntry(
    normalized,
    {
      text: oldEntry.text,
      mood: oldEntry.mood,
      win: oldEntry.win,
      nextStep: oldEntry.nextStep,
      weekPlan: "Woche ordnen",
      reviewedAreas: [...DIARY_REVIEW_AREAS],
      closeDay: true,
      plannedTaskId: "task-1",
    },
    oldEntry.date,
    "2026-07-30T20:00:00.000Z",
    () => "darf-nicht-verwendet-werden",
  );
  assert.equal(closed.created, false);
  assert.equal(closed.entries.length, 1);
  assert.equal(closed.entries[0].id, oldEntry.id);
  assert.equal(closed.entries[0].closedAt, "2026-07-30T20:00:00.000Z");
  assert.deepEqual(closed.entries[0].reviewedAreas, DIARY_REVIEW_AREAS);

  const withQuickNote = upsertDiaryEntry(
    closed.entries,
    {
      text: "Später Nachtrag",
      mood: 3,
      win: "",
      nextStep: "",
      appendToDay: true,
    },
    oldEntry.date,
    "2026-07-30T21:00:00.000Z",
    () => "ebenfalls-nicht-verwendet",
  );
  assert.match(withQuickNote.entries[0].text, /Alter Tagesgedanke/);
  assert.match(withQuickNote.entries[0].text, /Später Nachtrag/);
  assert.equal(withQuickNote.entries[0].win, oldEntry.win);
  assert.equal(withQuickNote.entries[0].closedAt, closed.entries[0].closedAt);
  assert.deepEqual(
    withQuickNote.entries[0].reviewedAreas,
    DIARY_REVIEW_AREAS,
  );
});

test("liefert Sites-Metadaten, D1-Migration und Produktionsbundle", async () => {
  const hosting = JSON.parse(
    await readFile(new URL(".openai/hosting.json", root), "utf8"),
  );
  const migration = await readFile(
    new URL("drizzle/0000_unique_carnage.sql", root),
    "utf8",
  );

  assert.equal(hosting.d1, "DB");
  assert.equal(hosting.r2, "FILES");
  assert.match(migration, /CREATE TABLE `user_states`/);
  assert.match(migration, /`owner_email` text PRIMARY KEY NOT NULL/);
  await access(new URL("dist/server/index.js", root));
  await access(new URL("dist/.openai/hosting.json", root));
  await access(
    new URL("dist/.openai/drizzle/0002_lovely_steel_serpent.sql", root),
  );
  await access(
    new URL("dist/.openai/drizzle/0003_chunky_shooting_star.sql", root),
  );
  await access(new URL("public/og-drive.png", root));
});

test("bündelt vier Erfassungsarten und lässt nur E-Mail und Bewerbung in der Sidebar", async () => {
  const [app, actions, eventForm, assistantRoute, uploadRoute, types, hosting] =
    await Promise.all([
      readFile(new URL("components/life-os-app.tsx", root), "utf8"),
      readFile(new URL("components/quick-actions.tsx", root), "utf8"),
      readFile(new URL("components/calendar-event-form.tsx", root), "utf8"),
      readFile(new URL("app/api/assistant/route.ts", root), "utf8"),
      readFile(new URL("app/api/files/route.ts", root), "utf8"),
      readFile(new URL("lib/types.ts", root), "utf8"),
      readFile(new URL(".openai/hosting.json", root), "utf8"),
    ]);

  assert.match(app, /SidebarQuickActions/);
  const sidebarActions = actions.slice(
    actions.indexOf("const QUICK_ACTIONS"),
    actions.indexOf("export function SidebarQuickActions"),
  );
  assert.match(sidebarActions, /key: "email", label: "E-Mail"/);
  assert.match(sidebarActions, /key: "application", label: "Bewerbung"/);
  assert.doesNotMatch(sidebarActions, /key: "upload"/);
  assert.doesNotMatch(sidebarActions, /key: "event"/);
  assert.doesNotMatch(sidebarActions, /key: "task"/);
  assert.match(app, /\["task", "A", "Aufgabe", "Planen und erinnern"\]/);
  assert.match(app, /\["event", "T", "Termin", "Zeit oder Ereignis"\]/);
  assert.match(app, /\["income", "\+", "Einnahme", "Geldeingang erfassen"\]/);
  assert.match(app, /\["cost", "€", "Ausgabe", "Zahlung festhalten"\]/);
  assert.match(app, /onNewEvent=\{\(\) => openCapture\("event"\)\}/);
  assert.match(app, /onNewCost=\{\(\) => openCapture\("cost"\)\}/);
  assert.match(app, /onNewIncome=\{\(\) => openCapture\("income"\)\}/);
  assert.match(app, /onUpload=\{\(\) => openQuickAction\("upload"\)\}/);
  assert.match(app, /Datei hochladen/);
  assert.match(eventForm, /Geburtstagserinnerung/);
  assert.match(actions, /Bewerbungspaket erstellen/);
  assert.match(actions, /Lokale Vorlage/);
  assert.match(assistantRoute, /store:\s*false/);
  assert.match(assistantRoute, /json_schema/);
  assert.match(assistantRoute, /journal-analysis/);
  assert.match(assistantRoute, /redactObviousCredentials/);
  assert.doesNotMatch(assistantRoute, /type:\s*"web_search"/);
  assert.match(uploadRoute, /MAX_FILE_BYTES/);
  assert.match(types, /storage\?: "drive" \| "upload"/);
  assert.equal(JSON.parse(hosting).r2, "FILES");
});

test("liefert einen geschützten Live-Drive-Explorer mit Vollbild-Vorschau", async () => {
  const [explorer, server, schema, types, folderRoute, fileRoute] =
    await Promise.all([
      readFile(new URL("components/drive-explorer.tsx", root), "utf8"),
      readFile(new URL("lib/google-drive-server.ts", root), "utf8"),
      readFile(new URL("db/schema.ts", root), "utf8"),
      readFile(new URL("lib/types.ts", root), "utf8"),
      readFile(
        new URL("app/api/drive/folders/[folderId]/route.ts", root),
        "utf8",
      ),
      readFile(
        new URL("app/api/drive/files/[fileId]/route.ts", root),
        "utf8",
      ),
    ]);

  assert.match(explorer, /DriveSidebarTree/);
  assert.match(explorer, /Unterlagen und Dokumente/);
  assert.match(explorer, /Vollständige Vorschau/);
  assert.match(explorer, /Unterordner öffnen/);
  assert.match(server, /drive\.readonly/);
  assert.match(server, /assertInsideRoot/);
  assert.match(server, /nextPageToken/);
  assert.match(schema, /google_drive_connections/);
  assert.match(types, /export type DriveItem/);
  assert.match(folderRoute, /ownerEmail/);
  assert.match(fileRoute, /driveFileResponse/);
});

test("bündelt Google Workspace sicher und dokumentiert die Sites-Konfiguration", async () => {
  const [
    envExample,
    guide,
    workspaceServer,
    tasksServer,
    calendarServer,
    gmailServer,
    schema,
    googleConnectRoute,
    googleCallbackRoute,
    tasksRoute,
    taskRoute,
    taskStatusRoute,
    taskListsRoute,
    taskProvisionRoute,
    tasksClient,
    lifeOsApp,
    calendarRoute,
    gmailDraftRoute,
    taskMigration,
    accountBindingMigration,
    stateRoute,
  ] = await Promise.all([
    readFile(new URL(".env.example", root), "utf8"),
    readRepositoryGuide(),
    readFile(new URL("lib/google-workspace-server.ts", root), "utf8"),
    readFile(new URL("lib/google-tasks-server.ts", root), "utf8"),
    readFile(new URL("lib/google-calendar-server.ts", root), "utf8"),
    readFile(new URL("lib/google-gmail-server.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("app/api/google/connect/route.ts", root), "utf8"),
    readFile(new URL("app/api/google/callback/route.ts", root), "utf8"),
    readFile(new URL("app/api/tasks/route.ts", root), "utf8"),
    readFile(new URL("app/api/tasks/[taskId]/route.ts", root), "utf8"),
    readFile(new URL("app/api/tasks/status/route.ts", root), "utf8"),
    readFile(new URL("app/api/tasks/lists/route.ts", root), "utf8"),
    readFile(new URL("app/api/tasks/provision/route.ts", root), "utf8"),
    readFile(new URL("lib/google-tasks-client.ts", root), "utf8"),
    readFile(new URL("components/life-os-app.tsx", root), "utf8"),
    readFile(new URL("app/api/calendar/route.ts", root), "utf8"),
    readFile(new URL("app/api/gmail/drafts/route.ts", root), "utf8"),
    readFile(new URL("drizzle/0002_lovely_steel_serpent.sql", root), "utf8"),
    readFile(new URL("drizzle/0003_chunky_shooting_star.sql", root), "utf8"),
    readFile(new URL("app/api/state/route.ts", root), "utf8"),
  ]);

  assert.match(envExample, /^GOOGLE_CLIENT_ID=$/m);
  assert.match(
    envExample,
    /^GOOGLE_REDIRECT_URI=https:\/\/gerris-kompass\.gerri-f-aus-e\.chatgpt\.site\/api\/google\/callback$/m,
  );
  assert.match(envExample, /^GOOGLE_TASKS_LIST_NAME=Gerris Kompass$/m);
  assert.match(envExample, /^GOOGLE_CALENDAR_ID=primary$/m);
  assert.match(envExample, /^GOOGLE_CLIENT_SECRET=$/m);
  assert.match(envExample, /^GOOGLE_TOKEN_KEY=$/m);
  assert.match(envExample, /^OPENAI_API_KEY=$/m);
  assert.doesNotMatch(envExample, /GOOGLE_CALENDAR_ICAL_URL|@gmail\.com/i);

  for (const scope of [
    "https://www.googleapis.com/auth/tasks",
    "https://www.googleapis.com/auth/calendar.events.owned",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
  ]) {
    if (guide !== null) {
      assert.match(guide, new RegExp(scope.replaceAll(".", "\\.")));
    }
    assert.match(workspaceServer, new RegExp(scope.replaceAll(".", "\\.")));
  }
  if (guide !== null) {
    assert.match(guide, /sieben\s+Tagen/i);
    assert.match(guide, /Service Account/);
    assert.match(guide, /nur für den Eigentümer/i);
    assert.match(guide, /GOOGLE_CALENDAR_ICAL_URL/);
    assert.match(guide, /erneut \*\*privat\*\* bereitgestellt/);
  }

  assert.match(workspaceServer, /GOOGLE_CLIENT_ID/);
  assert.match(workspaceServer, /GOOGLE_CLIENT_SECRET/);
  assert.match(workspaceServer, /GOOGLE_REDIRECT_URI/);
  assert.match(workspaceServer, /GOOGLE_TOKEN_KEY/);
  assert.match(workspaceServer, /include_granted_scopes:\s*"true"/);
  assert.match(workspaceServer, /code_challenge_method:\s*"S256"/);
  assert.match(workspaceServer, /AES-GCM/);
  assert.match(workspaceServer, /crypto\.subtle\.verify/);
  assert.match(workspaceServer, /oauth2\.googleapis\.com\/revoke/);
  assert.match(workspaceServer, /existing\.googleSubject !== profileSubject/);
  assert.match(
    workspaceServer,
    /existing\.googleEmail\.trim\(\)\.toLowerCase\(\) !== profileEmail/,
  );
  assert.match(workspaceServer, /if \(identityChanged\)/);
  assert.match(
    workspaceServer,
    /\.delete\(googleTaskMetadata\)[\s\S]*\.delete\(googleTaskSettings\)/,
  );
  assert.match(tasksServer, /https:\/\/tasks\.googleapis\.com\/tasks\/v1/);
  assert.match(tasksServer, /process\.env\.GOOGLE_TASKS_LIST_NAME/);
  assert.match(tasksServer, /TASK_LIST_LEASE_PREFIX/);
  assert.match(tasksServer, /TASK_LIST_LEASE_MS = 120_000/);
  assert.match(tasksServer, /onConflictDoNothing\(\)/);
  assert.match(
    tasksServer,
    /eq\(googleTaskSettings\.taskListId,\s*observed\.taskListId\)/,
  );
  assert.match(
    tasksServer,
    /eq\(googleTaskSettings\.taskListId,\s*leaseMarker\)/,
  );
  assert.match(calendarServer, /https:\/\/www\.googleapis\.com\/calendar\/v3/);
  assert.match(calendarServer, /process\.env\.GOOGLE_CALENDAR_ID/);
  assert.match(gmailServer, /gmail\/v1\/users\/me\/drafts/);
  assert.doesNotMatch(gmailServer, /drafts\/send|messages\/send/);
  assert.match(schema, /google_task_settings/);
  assert.match(schema, /google_task_metadata/);
  assert.match(schema, /googleSubject:\s*text\("google_subject"\)/);
  assert.match(taskMigration, /CREATE TABLE `google_task_settings`/);
  assert.match(taskMigration, /CREATE TABLE `google_task_metadata`/);
  assert.match(
    accountBindingMigration,
    /ADD `google_subject` text/,
  );
  assert.match(stateRoute, /taskListId/);

  assert.match(googleConnectRoute, /createGoogleOAuthState/);
  assert.match(googleCallbackRoute, /finishGoogleOAuth/);
  assert.match(googleCallbackRoute, /let clearCookie = false/);
  assert.ok(
    googleCallbackRoute.indexOf("payload.state !== state") <
      googleCallbackRoute.indexOf('url.searchParams.get("error")'),
    "OAuth-State muss vor einer Provider-Fehlerantwort validiert werden",
  );
  assert.match(
    googleCallbackRoute,
    /clearCookie \? \{ "set-cookie": CLEAR_COOKIE \} : \{\}/,
  );
  assert.match(tasksRoute, /export async function GET/);
  assert.match(tasksRoute, /export async function POST/);
  assert.match(taskRoute, /export async function PATCH/);
  assert.match(taskRoute, /export async function DELETE/);
  assert.doesNotMatch(tasksRoute, /provisionGerrisTaskList/);
  assert.doesNotMatch(taskRoute, /provisionGerrisTaskList/);
  assert.doesNotMatch(taskStatusRoute, /provisionGerrisTaskList|ensureGerrisTaskList/);
  assert.doesNotMatch(taskListsRoute, /provisionGerrisTaskList|ensureGerrisTaskList/);
  assert.match(taskProvisionRoute, /export async function POST/);
  assert.doesNotMatch(taskProvisionRoute, /export async function GET/);
  assert.match(taskProvisionRoute, /sameOrigin\(request\)/);
  assert.match(taskProvisionRoute, /provisionGerrisTaskList/);
  assert.match(tasksClient, /fetch\("\/api\/tasks\/provision", \{ method: "POST" \}\)/);
  assert.match(lifeOsApp, /await provisionGoogleTasks\(\)/);
  const resolverStart = tasksServer.indexOf(
    "export async function findGerrisTaskList",
  );
  const reservationStart = tasksServer.indexOf(
    "async function reserveTaskListProvisioning",
  );
  assert.ok(resolverStart >= 0 && reservationStart > resolverStart);
  assert.doesNotMatch(
    tasksServer.slice(resolverStart, reservationStart),
    /\.insert\(|\.update\(|\.delete\(|method:\s*"POST"/,
    "Der von GET verwendete Listen-Resolver muss Google und D1 nur lesen.",
  );
  assert.match(calendarRoute, /export async function GET/);
  assert.match(calendarRoute, /export async function POST/);
  assert.doesNotMatch(calendarRoute, /calendar\/ical|GOOGLE_CALENDAR_ICAL_URL/);
  assert.match(gmailDraftRoute, /export async function POST/);
});

test("liefert das Bewerbungsdashboard mit 105 tagesaktuellen Recherchevakanzen", async () => {
  const [
    app,
    applications,
    research,
    researchData,
    types,
    stateHook,
    actions,
    jobResearchPanel,
    jobResearchRoute,
    assistantRoute,
    masterCvWorkspace,
    masterCvRoute,
  ] =
    await Promise.all([
      readFile(new URL("components/life-os-app.tsx", root), "utf8"),
      readFile(new URL("components/applications-view.tsx", root), "utf8"),
      readFile(new URL("lib/application-research.ts", root), "utf8"),
      readFile(new URL("lib/application-research-2026-08-01.ts", root), "utf8"),
      readFile(new URL("lib/types.ts", root), "utf8"),
      readFile(new URL("lib/use-gerri-state.ts", root), "utf8"),
      readFile(new URL("components/quick-actions.tsx", root), "utf8"),
      readFile(new URL("components/job-research-panel.tsx", root), "utf8"),
      readFile(new URL("app/api/job-research/route.ts", root), "utf8"),
      readFile(new URL("app/api/assistant/route.ts", root), "utf8"),
      readFile(new URL("components/master-cv-workspace.tsx", root), "utf8"),
      readFile(new URL("app/api/master-cv/route.ts", root), "utf8"),
    ]);

  assert.match(app, /label: "Bewerbungen"/);
  assert.match(app, /<ApplicationsView/);
  assert.match(applications, /Bewerbungskennzahlen/);
  assert.match(applications, /Konditionen meiner Bewerbung/);
  assert.match(applications, /Erwarteter nächster Schritt/);
  assert.match(applications, /Screenshot der Ausschreibung/);
  assert.match(masterCvWorkspace, /Master-CV/);
  assert.match(applications, /<JobResearchPanel/);
  assert.match(types, /applications: ApplicationProcess\[\]/);
  assert.match(types, /masterCvDocumentId: string \| null/);
  assert.match(types, /masterCvContent: MasterCvContent \| null/);
  assert.match(types, /careerPassportDocumentId: string \| null/);
  assert.match(types, /vacancyResearch: VacancyResearch \| null/);
  assert.match(stateHook, /mergeApplicationResearch/);
  assert.match(stateHook, /normalizeMasterCvContent/);
  assert.match(actions, /Master-CV verwenden/);
  assert.match(actions, /masterCvToPlainText\(masterCvContent\)/);
  assert.match(actions, /fetch\(masterCv\.downloadUrl/);
  assert.match(actions, /interviewPrep/);
  assert.match(actions, /<JobResearchPanel/);
  assert.match(jobResearchPanel, /Vakanz recherchieren/);
  assert.match(jobResearchPanel, /Bestätigen/);
  assert.match(jobResearchPanel, /Bearbeiten/);
  assert.match(jobResearchPanel, /Ablehnen/);
  assert.match(jobResearchPanel, /Für Aussagen verwendete Quellen/);
  assert.match(jobResearchRoute, /type: "web_search"/);
  assert.match(jobResearchRoute, /external_web_access: true/);
  assert.match(jobResearchRoute, /tool_choice: "required"/);
  assert.match(jobResearchRoute, /web_search_call\.action\.sources/);
  assert.match(jobResearchRoute, /store: false/);
  assert.match(jobResearchRoute, /background: true/);
  assert.match(jobResearchRoute, /verifyJobToken/);
  assert.match(jobResearchRoute, /payload\.status === "queued"/);
  assert.match(jobResearchPanel, /Recherche läuft im Hintergrund/);
  assert.match(jobResearchPanel, /job: \{ id: payload\.job\.id, token: payload\.job\.token \}/);
  assert.match(jobResearchRoute, /sameOrigin\(request\)/);
  assert.doesNotMatch(assistantRoute, /type: "web_search"/);
  assert.match(assistantRoute, /confirmedResearchContext/);
  assert.match(assistantRoute, /absichtlich keinen Webzugriff/);
  assert.match(masterCvWorkspace, /Inhalte bearbeiten/);
  assert.match(masterCvWorkspace, /Quellen & Evidenz ansehen/);
  assert.match(masterCvWorkspace, /Gemeinsam importieren/);
  assert.match(masterCvRoute, /parseMasterCvBundle/);
  assert.match(masterCvRoute, /env\.FILES\.put/);
  assert.match(masterCvRoute, /sameOrigin\(request\)/);
  assert.match(research, /JOB_RADAR_RECORDS/);
  assert.match(research, /LEGACY_ID_BY_SOURCE_ID/);
  assert.match(research, /refreshedSeedValue/);
  assert.equal((researchData.match(/"sourceId":/g) ?? []).length, 105);
  assert.match(researchData, /Sachbearbeiter\*in Kommunales Krisenmanagement/);
  assert.match(researchData, /Business Project Manager Conversational AI/);
  assert.match(researchData, /Product\/Service-orientierte Initiativbewerbung/);
});

test("normalisiert einen alten Zustand ohne Bewerbungsfelder abwärtskompatibel", async () => {
  const { APPLICATION_RESEARCH, mergeApplicationResearch } = await import(
    "../lib/application-research.ts"
  );
  const legacyState = {
    schemaVersion: 1,
    tasks: [],
    costs: [],
    documents: [],
    calendarEvents: [],
    journal: [],
  };
  const normalized = mergeApplicationResearch(legacyState.applications);

  assert.equal(normalized.length, 105);
  assert.equal(normalized.filter((item) => item.shortlisted).length, 24);
  assert.equal(
    new Set(normalized.map((item) => item.id)).size,
    APPLICATION_RESEARCH.length,
  );
  assert.equal(normalized[0].status, "research");
  assert.equal(normalized[0].artifacts.length, 0);
  assert.equal(normalized[0].vacancyResearch?.schemaVersion, 1);
  assert.equal(normalized[0].sourceVerifiedAt, "2026-08-01");
  assert.match(normalized[0].sourceUrl, /^https:\/\//);
});

test("aktualisiert alte Recherchefelder und bewahrt den persönlichen Bewerbungsstand", async () => {
  const { APPLICATION_RESEARCH, mergeApplicationResearch } = await import(
    "../lib/application-research.ts"
  );
  const current = APPLICATION_RESEARCH[0];
  const legacy = {
    ...current,
    jobTitle: "Sachbearbeitung Kommunales Krisenmanagement / Business Continuity",
    publishedTerms: "Unbefristet · Voll- oder Teilzeit · Homeoffice",
    compensation: "EG 10 TVöD / A 11",
    fitRating: "A",
    researchSummary:
      "BWL und Business Administration werden ausdrücklich akzeptiert. Prozesse, Risiken, Projektsteuerung, Beratung und Krisenorganisation passen sehr gut.",
    sourceUrl: "",
    sourceVerifiedAt: "2026-07-29",
    status: "submitted",
    appliedAt: "2026-07-31",
    nextStep: "Bewerbungsentscheidung treffen",
    notes: "Rückruf für Montag vereinbart",
    artifacts: [
      {
        id: "artifact-1",
        kind: "cover-letter",
        documentId: "document-1",
        label: "Anschreiben",
        createdAt: "2026-07-31T10:00:00.000Z",
      },
    ],
    vacancyResearch: null,
  };

  const [updated] = mergeApplicationResearch([legacy]);

  assert.match(updated.jobTitle, /Business Continuity Management/);
  assert.match(updated.sourceUrl, /^https:\/\//);
  assert.equal(updated.sourceVerifiedAt, "2026-08-01");
  assert.equal(updated.status, "submitted");
  assert.equal(updated.appliedAt, "2026-07-31");
  assert.equal(updated.notes, "Rückruf für Montag vereinbart");
  assert.equal(updated.artifacts.length, 1);
  assert.equal(updated.vacancyResearch?.schemaVersion, 1);
});

test("ersetzt unberührte Altrecherche ohne laufende Bewerbungsakten zu verlieren", async () => {
  const {
    APPLICATION_RESEARCH,
    LEGACY_APPLICATION_RESEARCH,
    mergeApplicationResearch,
  } = await import("../lib/application-research.ts");
  const untouched = mergeApplicationResearch(LEGACY_APPLICATION_RESEARCH);

  assert.equal(untouched.length, APPLICATION_RESEARCH.length);
  assert.equal(new Set(untouched.map((item) => item.id)).size, untouched.length);

  const startedLegacy = LEGACY_APPLICATION_RESEARCH.map((application) =>
    application.id === "vacancy-25"
      ? {
          ...application,
          status: "submitted",
          appliedAt: "2026-07-31",
          notes: "Bereits versendet und deshalb als eigene Akte behalten",
        }
      : application,
  );
  const withStartedProcess = mergeApplicationResearch(startedLegacy);
  const retained = withStartedProcess.find((item) => item.id === "vacancy-25");

  assert.equal(withStartedProcess.length, APPLICATION_RESEARCH.length + 1);
  assert.equal(retained?.status, "submitted");
  assert.equal(retained?.notes, "Bereits versendet und deshalb als eigene Akte behalten");
});

test("hält native Auswahlmenüs in allen App-Bereichen kontrastreich", async () => {
  const [css, app, actions, applications] = await Promise.all([
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("components/life-os-app.tsx", root), "utf8"),
    readFile(new URL("components/quick-actions.tsx", root), "utf8"),
    readFile(new URL("components/applications-view.tsx", root), "utf8"),
  ]);
  const selectCount = (app + actions + applications).match(/<select\b/g)?.length ?? 0;

  assert.equal(selectCount >= 20, true);
  assert.match(css, /select\s*\{\s*color-scheme:\s*dark/);
  assert.match(
    css,
    /select option,\s*select optgroup\s*\{[^}]*background-color:\s*Canvas[^}]*color:\s*CanvasText[^}]*color-scheme:\s*light/s,
  );
  assert.match(css, /select option:disabled\s*\{[^}]*color:\s*GrayText/s);
});
