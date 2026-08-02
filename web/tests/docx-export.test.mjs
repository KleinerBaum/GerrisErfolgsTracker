import assert from "node:assert/strict";
import test from "node:test";

import { strFromU8, unzipSync } from "fflate";

import { createEditableDocx } from "../lib/docx-export.ts";

test("erzeugt eine bearbeitbare Word-Datei aus generierten Bewerbungstexten", () => {
  const bytes = createEditableDocx(
    "# Lebenslauf\n\n## Kurzprofil\nBelegbarer Text & konkrete Wirkung.\n- Ergebnis eins",
  );
  const archive = unzipSync(bytes);

  assert.ok(archive["[Content_Types].xml"]);
  assert.ok(archive["word/document.xml"]);
  assert.ok(archive["word/styles.xml"]);
  const documentXml = strFromU8(archive["word/document.xml"]);
  assert.match(documentXml, /Heading1/);
  assert.match(documentXml, /Heading2/);
  assert.match(documentXml, /Belegbarer Text &amp; konkrete Wirkung/);
  assert.match(documentXml, /• Ergebnis eins/);
});
