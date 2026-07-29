import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

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
  assert.match(uploadRoute, /MAX_FILE_BYTES/);
  assert.match(types, /storage\?: "drive" \| "upload"/);
  assert.equal(JSON.parse(hosting).r2, "FILES");
});

test("liefert einen geschützten Live-Drive-Explorer mit Inline-Vorschau", async () => {
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
  assert.match(explorer, /Direkte Vorschau/);
  assert.match(explorer, /Unterordner öffnen/);
  assert.match(server, /drive\.readonly/);
  assert.match(server, /AES-GCM/);
  assert.match(server, /assertInsideRoot/);
  assert.match(server, /nextPageToken/);
  assert.match(schema, /google_drive_connections/);
  assert.match(types, /export type DriveItem/);
  assert.match(folderRoute, /ownerEmail/);
  assert.match(fileRoute, /driveFileResponse/);
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
