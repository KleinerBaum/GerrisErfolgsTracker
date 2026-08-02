import assert from "node:assert/strict";
import test from "node:test";

import { strToU8, zipSync } from "fflate";

import {
  masterCvToPlainText,
  normalizeMasterCvContent,
} from "../lib/master-cv.ts";
import { parseMasterCvDocument } from "../lib/server/master-cv-import.ts";

function paragraph(style, value) {
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t xml:space="preserve">${value}</w:t></w:r></w:p>`;
}

function paragraphWithBreak(style, first, second) {
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t>${first}</w:t><w:br/><w:t>${second}</w:t></w:r></w:p>`;
}

function docxFixture() {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        ${paragraph("CvName", "Gerrit Fabisch")}
        ${paragraph("CvHeadline", "KI-gestütztes Prozess- und Projektmanagement")}
        ${paragraph("CvSubheadline", "HR-Digitalisierung | Angewandte Automatisierung")}
        ${paragraph("CvContact", "Düsseldorf | gerrit@example.test")}
        ${paragraph("CvSection", "BERUFLICHES PROFIL")}
        ${paragraph("CvBody", "Belegbares Profil für digitale Geschäftsprozesse.")}
        ${paragraph("CvSection", "AUSGEWÄHLTE ERGEBNISSE")}
        ${paragraph("CvBullet", "• Entwicklung eines kontrollierten Workflows.")}
      </w:body>
    </w:document>`;
  return zipSync({ "word/document.xml": strToU8(xml) });
}

test("liest einen DOCX-Master-CV ohne zusätzliches Passport-Dokument", () => {
  const result = parseMasterCvDocument(
    docxFixture(),
    "2026-08-02T08:00:00.000Z",
  );

  assert.equal(result.name, "Gerrit Fabisch");
  assert.equal(result.headline, "KI-gestütztes Prozess- und Projektmanagement");
  assert.equal(result.language, "de-DE");
  assert.equal(result.sections.length, 2);
  assert.equal(
    result.sections[1].content,
    "• Entwicklung eines kontrollierten Workflows.",
  );
  assert.equal(result.passport.sourceDocuments.length, 1);
  assert.equal(result.passport.evidence[0].evidenceId, "CV-1-1");
  assert.equal(result.passport.evidence[1].evidenceId, "CV-2-1");
  assert.equal(result.passport.evidence[1].confidence, "source_only");
});

test("normalisiert den DOCX-Import abwärtskompatibel ohne Passport-Dateiverweis", () => {
  const parsed = parseMasterCvDocument(
    docxFixture(),
    "2026-08-02T08:00:00.000Z",
  );
  const content = normalizeMasterCvContent({
    schemaVersion: 1,
    sourceDocumentId: "upload-cv",
    passportDocumentId: null,
    ...parsed,
    importedAt: "2026-08-02T08:00:00.000Z",
    updatedAt: "2026-08-02T08:10:00.000Z",
    editRevision: 2,
  });

  assert.ok(content);
  assert.equal(content.passportDocumentId, null);
  const plainText = masterCvToPlainText(content);
  assert.match(plainText, /BERUFLICHES PROFIL/);
  assert.match(
    plainText,
    /\[CV-2-1\] Entwicklung eines kontrollierten Workflows\./,
  );
  assert.match(plainText, /BELEGREGISTER ZUM BERUFLICHEN PROFIL/);
  assert.doesNotMatch(plainText, /CAREER PASSPORT/i);
});

test("verwirft DOCX-Dateien ohne erkennbaren Lebenslaufabschnitt", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>${paragraph("CvName", "Gerrit Fabisch")}</w:body>
    </w:document>`;
  const bytes = zipSync({ "word/document.xml": strToU8(xml) });

  assert.throws(
    () => parseMasterCvDocument(bytes),
    /Abschnitte des Master-CV konnten nicht erkannt werden/,
  );
});

test("liest die Formatrollen der modularen Master-Langfassung vollständig", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        ${paragraph("CVKicker", "MASTER-LANGFASSUNG | MODULARER CONTENT-POOL")}
        ${paragraph("Title", "Gerrit Fabisch")}
        ${paragraph("Subtitle", "Business Transformation &amp; AI Solutions")}
        ${paragraph("CVTagline", "AI-Webapps | Projekt- und Prozessmanagement")}
        ${paragraph("CVContact", "Düsseldorf | gerrit@example.test")}
        ${paragraph("Heading1", "KURZPROFIL")}
        ${paragraph("Normal", "Belegbares Profil für digitale Geschäftsprozesse.")}
        ${paragraph("Heading1", "ROLLEN-NAVIGATOR")}
        ${paragraphWithBreak("Normal", "PROJEKT &amp; PROZESS", "Anforderungen, Rollouts, KPIs und Risiken")}
        ${paragraph("", "4")}
        ${paragraph("", "TÜFTELN")}
      </w:body>
    </w:document>`;
  const result = parseMasterCvDocument(
    zipSync({ "word/document.xml": strToU8(xml) }),
    "2026-08-02T08:00:00.000Z",
  );

  assert.equal(result.name, "Gerrit Fabisch");
  assert.equal(result.headline, "Business Transformation & AI Solutions");
  assert.equal(
    result.subheadline,
    "AI-Webapps | Projekt- und Prozessmanagement",
  );
  assert.equal(result.sections.length, 2);
  assert.match(result.sections[1].content, /PROJEKT & PROZESS\nAnforderungen/);
  assert.doesNotMatch(
    result.sections.map((section) => section.heading).join(" | "),
    /TÜFTELN|(?:^|\| )4(?: \||$)/,
  );
});
