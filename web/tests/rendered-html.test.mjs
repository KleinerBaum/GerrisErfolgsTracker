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
  assert.match(layout, /og\.png/);
  assert.match(layout, /manifest\.webmanifest/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /aspect-ratio:\s*210\s*\/\s*297/);
  assert.doesNotMatch(page + app + layout, /codex-preview|Starter Project/);
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

test("stellt die Kernkennzahlen als sechs semantisch unterschiedliche Bereiche dar", async () => {
  const [app, css, layout] = await Promise.all([
    readFile(new URL("components/life-os-app.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
  ]);

  const groups = [
    ...app.matchAll(/<CoreKpiGroup[\s\S]*?<\/CoreKpiGroup>/g),
  ].map((match) => match[0]);

  assert.equal(groups.length, 6);
  assert.match(app, /aria-label="Kernkennzahlen nach Bereichen"/);
  assert.match(app, /eyebrow="Gerri Coach"/);
  assert.match(app, /title="Ziele & Fokus"/);
  assert.match(app, /title="Kalender"/);
  assert.match(app, /title="Finanzen"/);
  assert.match(app, /title="Unterlagen"/);
  assert.match(app, /title="Bewerbungen"/);
  assert.match(app, /title="Tagebuch"/);
  assert.match(app, /className="kpi-target-ring"/);
  assert.match(app, /className="kpi-deadline"/);
  assert.match(app, /kpi-money-segments/);
  assert.match(app, /className="kpi-folder-shape"/);
  assert.match(app, /className="kpi-application-pipeline"/);
  assert.match(app, /className="kpi-mood-ring"/);
  assert.match(app, /className="kpi-rhythm-dots"/);
  assert.match(css, /\.core-kpi-grid/);
  assert.match(css, /\.core-kpi-group/);
  assert.match(css, /grid-template-columns: repeat\(auto-fit/);
  assert.match(layout, /og\.png/);
  await access(new URL("public/og.png", root));
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

test("liefert die fünf privaten Schnellaktionen mit Upload und Textassistenz", async () => {
  const [app, actions, assistantRoute, uploadRoute, types, hosting] =
    await Promise.all([
      readFile(new URL("components/life-os-app.tsx", root), "utf8"),
      readFile(new URL("components/quick-actions.tsx", root), "utf8"),
      readFile(new URL("app/api/assistant/route.ts", root), "utf8"),
      readFile(new URL("app/api/files/route.ts", root), "utf8"),
      readFile(new URL("lib/types.ts", root), "utf8"),
      readFile(new URL(".openai/hosting.json", root), "utf8"),
    ]);

  assert.match(app, /SidebarQuickActions/);
  assert.match(actions, /Datei ablegen/);
  assert.match(actions, /Termin/);
  assert.match(actions, /Aufgabe/);
  assert.match(actions, /E-Mail/);
  assert.match(actions, /Bewerbung/);
  assert.match(actions, /Bewerbungspaket erstellen/);
  assert.match(actions, /Lokale Vorlage/);
  assert.match(assistantRoute, /store:\s*false/);
  assert.match(assistantRoute, /json_schema/);
  assert.match(assistantRoute, /journal-analysis/);
  assert.match(assistantRoute, /redactObviousCredentials/);
  assert.match(assistantRoute, /useWebSearch:\s*false/);
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
    /^GOOGLE_REDIRECT_URI=https:\/\/gerris-kompass\.gerrit22\.chatgpt\.site\/api\/google\/callback$/m,
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

test("liefert das Bewerbungsdashboard mit 72 echten Recherchevakanzen", async () => {
  const [app, applications, research, types, stateHook, actions] =
    await Promise.all([
      readFile(new URL("components/life-os-app.tsx", root), "utf8"),
      readFile(new URL("components/applications-view.tsx", root), "utf8"),
      readFile(new URL("lib/application-research.ts", root), "utf8"),
      readFile(new URL("lib/types.ts", root), "utf8"),
      readFile(new URL("lib/use-gerri-state.ts", root), "utf8"),
      readFile(new URL("components/quick-actions.tsx", root), "utf8"),
    ]);

  assert.match(app, /label: "Bewerbungen"/);
  assert.match(app, /<ApplicationsView/);
  assert.match(applications, /Bewerbungskennzahlen/);
  assert.match(applications, /Konditionen meiner Bewerbung/);
  assert.match(applications, /Erwarteter nächster Schritt/);
  assert.match(applications, /Screenshot der Ausschreibung/);
  assert.match(applications, /Master-CV/);
  assert.match(types, /applications: ApplicationProcess\[\]/);
  assert.match(types, /masterCvDocumentId: string \| null/);
  assert.match(stateHook, /mergeApplicationResearch/);
  assert.match(actions, /Master-CV verwenden/);
  assert.match(actions, /fetch\(masterCv\.downloadUrl/);
  assert.equal((research.match(/^\s+\[\s*$/gm) ?? []).length >= 72, true);
  assert.match(research, /Sachbearbeitung Kommunales Krisenmanagement/);
  assert.match(research, /Business Project Manager Conversational AI/);
  assert.match(research, /Informationssicherheitsbeauftragter/);
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

  assert.equal(normalized.length, 72);
  assert.equal(normalized.filter((item) => item.shortlisted).length, 15);
  assert.equal(
    new Set(normalized.map((item) => item.id)).size,
    APPLICATION_RESEARCH.length,
  );
  assert.equal(normalized[0].status, "research");
  assert.equal(normalized[0].artifacts.length, 0);
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
