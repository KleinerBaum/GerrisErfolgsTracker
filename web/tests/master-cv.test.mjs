import assert from "node:assert/strict";
import test from "node:test";

import { strToU8, zipSync } from "fflate";

import {
  masterCvToPlainText,
  normalizeMasterCvContent,
} from "../lib/master-cv.ts";
import { parseMasterCvDocument } from "../lib/server/master-cv-import.ts";

function paragraph(style, value) {
  return `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}</w:pPr><w:r><w:t xml:space="preserve">${value}</w:t></w:r></w:p>`;
}

function paragraphWithBreak(style, first, second) {
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t>${first}</w:t><w:br/><w:t>${second}</w:t></w:r></w:p>`;
}

function hyperlinkParagraph(style, label, relationshipId) {
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:hyperlink r:id="${relationshipId}"><w:r><w:t>${label}</w:t></w:r></w:hyperlink></w:p>`;
}

function table(rows) {
  return `<w:tbl>${rows
    .map(
      (row) =>
        `<w:tr>${row
          .map(
            (cell) =>
              `<w:tc><w:p><w:r><w:t xml:space="preserve">${cell}</w:t></w:r></w:p></w:tc>`,
          )
          .join("")}</w:tr>`,
    )
    .join("")}</w:tbl>`;
}

function docxFixture() {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <w:body>
        ${paragraph("CvName", "Alex Beispiel")}
        ${paragraph("CvHeadline", "KI-gestütztes Prozess- und Projektmanagement")}
        ${paragraph("CvSubheadline", "HR-Digitalisierung | Angewandte Automatisierung")}
        ${hyperlinkParagraph("CvContact", "Portfolio", "rId7")}
        ${paragraph("CvSection", "BERUFLICHES PROFIL")}
        ${paragraph("CvBody", "Belegbares Profil für digitale Geschäftsprozesse.")}
        ${paragraph("CvSection", "AUSGEWÄHLTE ERGEBNISSE")}
        ${paragraph("CvBullet", "• Entwicklung eines kontrollierten Workflows.")}
      </w:body>
    </w:document>`;
  const relationships = `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://portfolio.example.test" TargetMode="External"/>
    </Relationships>`;
  return zipSync({
    "word/document.xml": strToU8(xml),
    "word/_rels/document.xml.rels": strToU8(relationships),
  });
}

test("liest einen DOCX-Master-CV als normalisierte Evidenzquelle", async () => {
  const result = await parseMasterCvDocument(
    docxFixture(),
    "2026-08-02T08:00:00.000Z",
  );

  assert.equal(result.name, "Alex Beispiel");
  assert.equal(result.headline, "KI-gestütztes Prozess- und Projektmanagement");
  assert.equal(result.language, "de-DE");
  assert.equal(result.sections.length, 2);
  assert.equal(result.sections[0].kind, "profile");
  assert.equal(result.sections[1].kind, "value");
  assert.equal(
    result.sections[1].content,
    "• Entwicklung eines kontrollierten Workflows.",
  );
  assert.equal(result.links[0].label, "Portfolio");
  assert.equal(result.links[0].kind, "portfolio");
  assert.equal(result.sourceFingerprint.length, 64);
  assert.equal(result.passport.sourceDocuments.length, 1);
  assert.equal(result.passport.evidence[0].evidenceId, "CV-PROFILE-1");
  assert.match(
    result.passport.evidence.at(-1).evidenceId,
    /^CV-LINK-1$/,
  );
});

test("klassifiziert alte Zustände abwärtskompatibel als Schema 2", async () => {
  const parsed = await parseMasterCvDocument(
    docxFixture(),
    "2026-08-02T08:00:00.000Z",
  );
  const content = normalizeMasterCvContent({
    schemaVersion: 1,
    sourceDocumentId: "upload-cv",
    passportDocumentId: null,
    name: parsed.name,
    headline: parsed.headline,
    subheadline: parsed.subheadline,
    contactLine: parsed.contactLine,
    language: parsed.language,
    sections: parsed.sections.map(({ id, heading, content: sectionContent }) => ({
      id,
      heading,
      content: sectionContent,
    })),
    passport: parsed.passport,
    importedAt: "2026-08-02T08:00:00.000Z",
    updatedAt: "2026-08-02T08:10:00.000Z",
    editRevision: 2,
  });

  assert.ok(content);
  assert.equal(content.schemaVersion, 2);
  assert.equal(content.sections[0].kind, "profile");
  assert.equal(content.sections[1].kind, "value");
  assert.match(content.sourceFingerprint, /^legacy-unverified:/);
  assert.equal(content.coverage.evidenceItems, parsed.passport.evidence.length);
  const plainText = masterCvToPlainText(content);
  assert.match(plainText, /BERUFLICHES PROFIL/);
  assert.match(
    plainText,
    /\[CV-SECTION-2-1\] Entwicklung eines kontrollierten Workflows\./,
  );
  assert.match(plainText, /BELEGREGISTER ZUM BERUFLICHEN PROFIL/);
});

test("verwirft DOCX-Dateien ohne erkennbaren Lebenslaufabschnitt", async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>${paragraph("CvName", "Alex Beispiel")}</w:body>
    </w:document>`;
  const bytes = zipSync({ "word/document.xml": strToU8(xml) });

  await assert.rejects(
    () => parseMasterCvDocument(bytes),
    /Abschnitte des Master-CV konnten nicht erkannt werden/,
  );
});

test("erkennt geteilte Chronologie, Sprachen-Unterabschnitt und Kompetenzentabelle", async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        ${paragraph("Title", "Alex Beispiel")}
        ${paragraph("Subtitle", "Transformation &amp; Prozesse")}
        ${paragraph("CVContact", "Köln | alex@example.test")}
        ${paragraph("Heading1", "BERUFSERFAHRUNG | 2020 BIS HEUTE")}
        ${paragraph("CVDate", "01/2020 - heute")}
        ${paragraph("Heading2", "Senior Prozessmanager")}
        ${paragraph("CVCompany", "Beispiel AG | Köln")}
        ${paragraph("CVBullet", "Steuerung funktionsübergreifender Verbesserungen.")}
        ${paragraph("Heading1", "BERUFSERFAHRUNG | 2014 BIS 2019")}
        ${paragraph("CVDate", "01/2014 - 12/2019")}
        ${paragraph("Heading2", "Projektkoordinator")}
        ${paragraph("CVCompany", "Muster GmbH | Bonn")}
        ${paragraph("CVBullet", "Koordination von Anforderungen und Risiken.")}
        ${paragraph("Heading1", "KOMPETENZPROFIL | EVIDENZBASIERT")}
        ${table([
          ["Kompetenz", "Einordnung", "Evidenz / Anwendung"],
          ["Prozessmanagement", "Kernkompetenz", "Roadmaps, KPIs und Risiken"],
          ["Datenanalyse", "Projektpraxis", "Python und Visualisierung"],
        ])}
        ${paragraph("Heading1", "METHODEN, TOOLS & ARBEITSUMFELD")}
        ${paragraph("Normal", "DELIVERY: Requirements Engineering und Prozessmapping.")}
        ${paragraph("Heading2", "Sprachen")}
        ${table([
          ["Deutsch", "Muttersprache"],
          ["Englisch", "Verhandlungssicher"],
        ])}
      </w:body>
    </w:document>`;
  const result = await parseMasterCvDocument(
    zipSync({ "word/document.xml": strToU8(xml) }),
    "2026-08-02T08:00:00.000Z",
  );

  assert.equal(
    result.sections.filter((section) => section.kind === "experience").length,
    2,
  );
  assert.equal(result.coverage.experienceEntries, 2);
  assert.match(
    result.sections.find((section) => /KOMPETENZPROFIL/.test(section.heading))
      .content,
    /Prozessmanagement: Kernkompetenz — Roadmaps, KPIs und Risiken/,
  );
  const languages = result.sections.find(
    (section) => section.kind === "languages",
  );
  assert.ok(languages);
  assert.match(languages.content, /Deutsch: Muttersprache/);
  assert.match(languages.content, /Englisch: Verhandlungssicher/);
});

test("liest die Formatrollen der modularen Master-Langfassung vollständig", async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        ${paragraph("CVKicker", "MASTER-LANGFASSUNG | MODULARER CONTENT-POOL")}
        ${paragraph("Title", "Alex Beispiel")}
        ${paragraph("Subtitle", "Business Transformation &amp; AI Solutions")}
        ${paragraph("CVTagline", "AI-Webapps | Projekt- und Prozessmanagement")}
        ${paragraph("CVContact", "Köln | alex@example.test")}
        ${paragraph("Heading1", "KURZPROFIL")}
        ${paragraph("Normal", "Belegbares Profil für digitale Geschäftsprozesse.")}
        ${paragraph("Heading1", "ROLLEN-NAVIGATOR")}
        ${paragraphWithBreak("Normal", "PROJEKT &amp; PROZESS", "Anforderungen, Rollouts, KPIs und Risiken")}
        ${paragraph("", "4")}
        ${paragraph("", "TÜFTELN")}
      </w:body>
    </w:document>`;
  const result = await parseMasterCvDocument(
    zipSync({ "word/document.xml": strToU8(xml) }),
    "2026-08-02T08:00:00.000Z",
  );

  assert.equal(result.name, "Alex Beispiel");
  assert.equal(result.headline, "Business Transformation & AI Solutions");
  assert.equal(result.sections[1].kind, "value");
  assert.match(result.sections[1].content, /PROJEKT & PROZESS\nAnforderungen/);
  assert.doesNotMatch(result.sections[1].content, /TÜFTELN|(?:^|\n)4(?:\n|$)/);
});
