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
  assert.match(layout, /og-drive\.png/);
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
