import assert from "node:assert/strict";
import test from "node:test";

import { strToU8, zipSync } from "fflate";

import {
  masterCvToPlainText,
  normalizeMasterCvContent,
} from "../lib/master-cv.ts";
import { parseMasterCvBundle } from "../lib/server/master-cv-import.ts";

function paragraph(style, value) {
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t xml:space="preserve">${value}</w:t></w:r></w:p>`;
}

function docxFixture() {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        ${paragraph("CvName", "Gerrit Fabisch")}
        ${paragraph("CvHeadline", "AI-Enabled Business Process &amp; Project Manager")}
        ${paragraph("CvSubheadline", "HR Digitalization | Applied Automation")}
        ${paragraph("CvContact", "Düsseldorf | gerrit@example.test")}
        ${paragraph("CvSection", "PROFESSIONAL SUMMARY")}
        ${paragraph("CvBody", "Evidence-safe profile text.")}
        ${paragraph("CvSection", "CAREER HIGHLIGHTS")}
        ${paragraph("CvBullet", "• Built a controlled workflow.")}
      </w:body>
    </w:document>`;
  return zipSync({ "word/document.xml": strToU8(xml) });
}

function passportFixture(overrides = {}) {
  return JSON.stringify({
    schema_version: "4.0",
    profile: {
      name: "Gerrit Fabisch",
      headline: "Fallback headline",
      location: "Düsseldorf",
      contact: [],
    },
    preferences: {
      target_directions: ["HR Digitalization / Applied AI"],
      document_preferences: { language: "en" },
    },
    source_documents: [
      {
        source_id: "SRC-CV-1",
        name: "Master-CV.docx",
        source_type: "current_cv",
        is_primary: true,
        notes: ["Primary source"],
      },
    ],
    document_versions: [{ status: "partial" }],
    evidence: [
      {
        evidence_id: "EV-1",
        claim: "Controlled workflow",
        safe_wording: "Built a controlled workflow.",
        source_type: "current_cv",
        source_name: "Master-CV.docx",
        confidence: "source_only",
        restrictions: ["Do not add unsupported metrics."],
        role_relevance: ["HR Digitalization / Applied AI"],
        captured_at: "2026-08-01T10:00:00.000Z",
      },
    ],
    ...overrides,
  });
}

test("liest DOCX und Career Passport als bearbeitbaren Master-CV", () => {
  const result = parseMasterCvBundle(
    docxFixture(),
    passportFixture(),
    "2026-08-02T08:00:00.000Z",
  );

  assert.equal(result.name, "Gerrit Fabisch");
  assert.equal(
    result.headline,
    "AI-Enabled Business Process & Project Manager",
  );
  assert.equal(result.sections.length, 2);
  assert.equal(result.sections[1].content, "• Built a controlled workflow.");
  assert.equal(result.passport.sourceDocuments.length, 1);
  assert.equal(result.passport.evidence[0].evidenceId, "EV-1");
  assert.deepEqual(result.passport.targetDirections, [
    "HR Digitalization / Applied AI",
  ]);
});
test("verweigert eine nicht zusammengehörige DOCX-/Passport-Kombination", () => {
  assert.throws(
    () =>
      parseMasterCvBundle(
        docxFixture(),
        passportFixture({
          profile: { name: "Andere Person", headline: "" },
        }),
      ),
    /nicht zur selben Person/,
  );
});

test("normalisiert gespeicherte Inhalte und gibt die bearbeitete Fassung mit Evidenz aus", () => {
  const parsed = parseMasterCvBundle(
    docxFixture(),
    passportFixture(),
    "2026-08-02T08:00:00.000Z",
  );
  const content = normalizeMasterCvContent({
    schemaVersion: 1,
    sourceDocumentId: "upload-cv",
    passportDocumentId: "upload-passport",
    ...parsed,
    importedAt: "2026-08-02T08:00:00.000Z",
    updatedAt: "2026-08-02T08:10:00.000Z",
    editRevision: 2,
  });

  assert.ok(content);
  const plainText = masterCvToPlainText(content);
  assert.match(plainText, /PROFESSIONAL SUMMARY/);
  assert.match(plainText, /\[EV-1\] Built a controlled workflow\./);
  assert.match(plainText, /Do not add unsupported metrics/);
});
