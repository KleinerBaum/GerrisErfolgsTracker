import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("bietet eine root-begrenzte Ordnersuche und öffnet gefundene Pfade", async () => {
  const [component, server, route] = await Promise.all([
    readFile(new URL("components/drive-explorer.tsx", root), "utf8"),
    readFile(new URL("lib/google-drive-server.ts", root), "utf8"),
    readFile(new URL("app/api/drive/search/route.ts", root), "utf8"),
  ]);

  assert.match(component, /Ordner im gesamten Bereich suchen/);
  assert.match(component, /\/api\/drive\/search\?q=/);
  assert.match(component, /selectedContent\.breadcrumbs/);
  assert.match(server, /export async function searchDriveFolders/);
  assert.match(server, /name contains/);
  assert.match(server, /await assertInsideRoot\(connection, candidate\.id\)/);
  assert.match(route, /searchDriveFolders\(email, query\)/);
  assert.match(route, /cache-control.*private, no-store/);
});

test("zeigt Dateien in einer scrollfreien, eingepassten Vollbildvorschau", async () => {
  const [component, css, server] = await Promise.all([
    readFile(new URL("components/drive-explorer.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("lib/google-drive-server.ts", root), "utf8"),
  ]);

  assert.match(component, /aria-modal="true"/);
  assert.match(component, /#page=1&view=Fit&toolbar=1&navpanes=0/);
  assert.match(component, /document\.body\.classList\.add\("drive-preview-open"\)/);
  assert.match(component, /event\.key === "Escape"/);
  assert.match(component, /ganze Seite im Original-Layout eingepasst/);
  assert.match(css, /\.drive-preview-backdrop\s*\{[\s\S]*position: fixed/);
  assert.match(css, /body\.drive-preview-open\s*\{\s*overflow: hidden/);
  assert.match(css, /\.drive-preview-stage\s*\{[\s\S]*overflow: hidden/);
  assert.match(css, /\.drive-preview-stage iframe\s*\{[\s\S]*height: 100%/);
  assert.match(css, /\.drive-preview-stage img\s*\{[\s\S]*object-fit: contain/);
  assert.match(server, /GOOGLE_DOC_MIMES\.has\(mimeType\)/);
  assert.match(server, /export\?mimeType=application%2Fpdf/);
});
