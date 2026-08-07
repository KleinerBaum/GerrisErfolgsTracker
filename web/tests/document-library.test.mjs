import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);

async function importTypeScriptModule(path) {
  const source = await readFile(new URL(path, root), "utf8");
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

const documentRef = (changes = {}) => ({
  id: "doc-1",
  name: "Versicherung",
  folderPath: "Persönlich/Finanzen/Versicherung",
  kind: "pdf",
  driveUrl: "https://drive.google.com/file/d/abc_123/view",
  fileId: "abc_123",
  modifiedAt: "2026-08-05T08:00:00.000Z",
  tags: ["Wichtig"],
  confidential: true,
  ...changes,
});

test("führt ältere Drive-Verknüpfungen und Uploads gemeinsam, aber eindeutig", async () => {
  const {
    documentFolderOptions,
    documentSource,
    visibleDocuments,
  } = await importTypeScriptModule("lib/document-library.ts");
  const linked = documentRef();
  const upload = documentRef({
    id: "doc-2",
    name: "Arbeitsvertrag",
    folderPath: "Persönlich/Beruf/Verträge",
    modifiedAt: "2026-08-06T08:00:00.000Z",
    storage: "upload",
  });
  const folder = documentRef({ id: "folder", kind: "folder" });

  assert.equal(documentSource(linked), "drive");
  assert.equal(documentSource(upload), "upload");
  assert.deepEqual(
    visibleDocuments([linked, upload, folder], "", "Alle").map(
      (document) => document.id,
    ),
    ["doc-2", "doc-1"],
  );
  assert.deepEqual(documentFolderOptions([linked, upload]), [
    "Alle",
    "Finanzen / Versicherung",
    "Beruf / Verträge",
  ]);
  assert.deepEqual(
    visibleDocuments([linked, upload], "wichtig", "Finanzen / Versicherung"),
    [linked],
  );
  assert.deepEqual(
    visibleDocuments([linked], "", "Finanz"),
    [],
    "Ordnerfilter dürfen keine ähnlichen Teilpfade vermischen",
  );
});

test("akzeptiert nur eigene private Datei-Endpunkte", async () => {
  const { documentOpenUrl, privateFileDownloadUrl, safePrivateFileUrl } =
    await importTypeScriptModule("lib/document-library.ts");
  const path = "/api/files/ca1dcf16-5b3e-4b41-a54a-339a727f13cd";

  assert.equal(safePrivateFileUrl(path), path);
  assert.equal(privateFileDownloadUrl(path), `${path}?download=1`);
  assert.equal(safePrivateFileUrl("https://example.org/datei.pdf"), null);
  assert.equal(safePrivateFileUrl("/api/files/../../secret"), null);
  assert.equal(
    documentOpenUrl(
      documentRef({
        storage: "upload",
        driveUrl: "javascript:alert(1)",
        downloadUrl: "javascript:alert(1)",
      }),
    ),
    null,
  );
  assert.equal(documentOpenUrl(documentRef()), documentRef().driveUrl);
});

test("akzeptiert ausschließlich echte HTTPS-Links von Google Drive", async () => {
  const {
    driveDownloadUrl,
    drivePreviewUrl,
    extractDriveFileId,
    safeGoogleDriveUrl,
  } = await importTypeScriptModule("lib/google-links.ts");
  const link = "https://docs.google.com/document/d/abc_123/edit";

  assert.equal(extractDriveFileId(link), "abc_123");
  assert.equal(
    drivePreviewUrl(link, "abc_123"),
    "https://docs.google.com/document/d/abc_123/preview",
  );
  assert.equal(
    driveDownloadUrl(link, "abc_123"),
    "https://docs.google.com/document/d/abc_123/export?format=pdf",
  );
  for (const unsafe of [
    "http://drive.google.com/file/d/abc_123/view",
    "https://drive.google.com.example.org/file/d/abc_123/view",
    "javascript:alert(1)",
  ]) {
    assert.equal(safeGoogleDriveUrl(unsafe), null);
    assert.equal(extractDriveFileId(unsafe), null);
    assert.equal(driveDownloadUrl(unsafe, "abc_123"), null);
  }
});
