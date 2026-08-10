import assert from "node:assert/strict";
import test from "node:test";

import {
  applicationDocumentDesignConfigurationIssues,
  applicationGenerationDesignPromptContext,
  buildApplicationGenerationDesignContext,
  normalizeApplicationGenerationDesignContext,
} from "../lib/application-generation-design.ts";
import { normalizeApplicationDocumentDesign } from "../lib/application-workflow.ts";

const outputKinds = ["tailored-cv", "cover-letter"];

function document(id, name, kind = "other") {
  return {
    id,
    name,
    folderPath: "Persönlich/Bewerbungen/Visualisierungen",
    kind,
    driveUrl: "",
    fileId: null,
    modifiedAt: "2026-08-10T08:00:00.000Z",
    tags: [],
    confidential: true,
    storage: "upload",
    downloadUrl: `/api/files/${id}`,
  };
}

const templateProfile = {
  sourceName: "Private Vorlage.docx",
  sourceFingerprint: "secret-template-fingerprint",
  status: "ready",
  warnings: [],
  page: {
    width: 11_906,
    height: 16_838,
    margins: { top: 760, right: 900, bottom: 760, left: 900 },
  },
  fonts: { body: "Carlito", title: "Caladea", heading: "Caladea" },
  colors: { text: "26343E", accent: "17605E", muted: "60717C", soft: "EAF1F2" },
  sizes: { body: 20, title: 34, heading1: 26, heading2: 22 },
  spacing: { bodyAfter: 100, bodyLine: 276, headingBefore: 220, headingAfter: 90 },
};

function confirmedDesign(overrides = {}) {
  return normalizeApplicationDocumentDesign({
    basePresetId: "modern-stylish",
    templateDocumentIds: { "tailored-cv": "template-private" },
    visualizationsEnabled: false,
    selectionConfirmedAt: "2026-08-10T08:05:00.000Z",
    visualizations: [],
    ...overrides,
  });
}

test("verlangt eine ausdrückliche Visualisierungsentscheidung und Designbestätigung", () => {
  const design = normalizeApplicationDocumentDesign(undefined);
  const issues = applicationDocumentDesignConfigurationIssues({
    analyses: {},
    design,
    documents: [],
    outputKinds,
  });

  assert.match(issues[0], /ausdrücklich/);
  assert.equal(
    buildApplicationGenerationDesignContext({
      analyses: {},
      design,
      documents: [],
      outputKinds,
    }),
    null,
  );
});
test("überträgt von einer privaten Vorlage ausschließlich sichere Layoutkennzahlen", () => {
  const design = confirmedDesign();
  const context = buildApplicationGenerationDesignContext({
    analyses: {
      "template-private": {
        status: "ready",
        profile: templateProfile,
        warnings: [],
        error: null,
      },
    },
    design,
    documents: [document("template-private", "Private Vorlage.docx", "cv")],
    outputKinds,
  });

  assert.ok(context);
  assert.equal(context.documents[0].customTemplateLayout.page.width, 11_906);
  const serialized = JSON.stringify(context);
  assert.doesNotMatch(serialized, /template-private|Private Vorlage|fingerprint|Carlito|17605E/);
  assert.doesNotMatch(serialized, /downloadUrl|sourceDocumentId|sourceName|sourceFingerprint/);
});

test("nimmt nur bestätigte Visualisierungen für ausgewählte Ergebnisse auf", () => {
  const design = confirmedDesign({
    templateDocumentIds: {},
    visualizationsEnabled: true,
    visualizations: [
      {
        id: "visual-internal-id",
        sourceDocumentId: "visual-private",
        title: "Kompetenzfelder",
        altText: "Vier belegte Kompetenzfelder in einer ruhigen Matrix",
        targetKinds: ["tailored-cv", "interview-prep"],
        placement: "after-skills",
        confirmedAt: "2026-08-10T08:04:00.000Z",
      },
    ],
  });
  const context = buildApplicationGenerationDesignContext({
    analyses: {},
    design,
    documents: [document("visual-private", "Kompetenzen.svg")],
    outputKinds,
  });

  assert.ok(context);
  assert.deepEqual(context.visualizations[0].targetKinds, ["tailored-cv"]);
  const serialized = JSON.stringify(context);
  assert.match(serialized, /Kompetenzfelder/);
  assert.doesNotMatch(serialized, /visual-private|Kompetenzen\.svg|visual-internal-id/);
});

test("normalisiert den API-Kontext streng und projiziert ihn artefaktspezifisch", () => {
  const context = normalizeApplicationGenerationDesignContext(
    {
      selectionConfirmedAt: "2026-08-10T08:05:00.000Z",
      documents: [
        { kind: "tailored-cv", presetId: "modern-stylish", layout: "manipuliert", customTemplateLayout: null },
        { kind: "cover-letter", presetId: "conservative-chic", layout: "manipuliert", customTemplateLayout: null },
      ],
      visualizationsEnabled: true,
      visualizations: [
        {
          title: "Kompetenzfelder",
          altText: "Matrix der Kompetenzfelder",
          targetKinds: ["tailored-cv"],
          placement: "after-skills",
          sourceDocumentId: "nicht-übernehmen",
        },
      ],
    },
    outputKinds,
  );

  assert.ok(context);
  assert.equal(context.documents[0].layout, "modern");
  assert.equal(context.documents[1].layout, "conservative");
  const coverLetter = applicationGenerationDesignPromptContext(context, "cover-letter");
  assert.equal(coverLetter.documents.length, 1);
  assert.deepEqual(coverLetter.visualizations, []);
  assert.doesNotMatch(JSON.stringify(context), /nicht-übernehmen/);
});
