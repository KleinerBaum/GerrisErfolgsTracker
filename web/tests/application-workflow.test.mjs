import assert from "node:assert/strict";
import test from "node:test";

import {
  addApplicationActivity,
  activeUploadedMasterCv,
  applicationKpiProgress,
  assessSalaryPreference,
  normalizeApplicationDocumentDesign,
  normalizeApplicationGenerationPreferences,
  normalizeApplicationKpiSettings,
} from "../lib/application-workflow.ts";

function documentRef(id, storage, name) {
  return {
    id,
    name,
    folderPath: "Bewerbungsunterlagen",
    kind: "cv",
    driveUrl: "",
    fileId: null,
    modifiedAt: "2026-08-06T08:00:00.000Z",
    tags: [],
    confidential: true,
    storage,
    downloadUrl: `/api/files/${id}`,
  };
}

test("verwendet bei mehreren CV-Fassungen genau den aktiven hochgeladenen Master-CV", () => {
  const documents = [
    documentRef("cv-alt-1", "upload", "Master-CV alt.docx"),
    documentRef("cv-aktiv", "upload", "Master-CV aktiv.docx"),
    documentRef("cv-alt-2", "drive", "Master-CV Entwurf.docx"),
  ];

  const selected = activeUploadedMasterCv(documents, "cv-aktiv");

  assert.equal(selected?.id, "cv-aktiv");
  assert.equal(selected?.name, "Master-CV aktiv.docx");
  assert.equal(activeUploadedMasterCv(documents, "cv-alt-2"), null);
});

function application(overrides = {}) {
  return {
    id: "application-1",
    sourceVerifiedAt: "",
    appliedAt: null,
    artifacts: [],
    activities: [],
    ...overrides,
  };
}

test("ergänzt alte Zustände um alle fünf Bewerbungsziele", () => {
  const settings = normalizeApplicationKpiSettings({
    goals: [
      {
        key: "sent_applications",
        enabled: false,
        targets: { day: 2, week: 8, month: 20 },
      },
    ],
  });

  assert.equal(settings.goals.length, 5);
  const sent = settings.goals.find((goal) => goal.key === "sent_applications");
  assert.equal(sent.enabled, false);
  assert.deepEqual(sent.targets, { day: 2, week: 8, month: 20 });
  assert.ok(settings.goals.find((goal) => goal.key === "phone_interviews"));
});

test("zählt Bewerbungsaktivitäten nach Berliner Tag, Woche und Monat", () => {
  const settings = normalizeApplicationKpiSettings(null);
  const apps = [
    application({
      activities: [
        {
          id: "sent-1",
          type: "application_sent",
          occurredAt: "2026-08-02T00:15:00+02:00",
          note: "",
        },
        {
          id: "phone-1",
          type: "phone_interview",
          occurredAt: "2026-08-01T12:00:00+02:00",
          note: "",
        },
      ],
    }),
  ];
  const progress = applicationKpiProgress(
    apps,
    settings,
    "2026-08-02T12:00:00+02:00",
  );

  const sent = progress.find((item) => item.key === "sent_applications");
  const phone = progress.find((item) => item.key === "phone_interviews");
  assert.deepEqual(sent.values, { day: 1, week: 1, month: 1 });
  assert.deepEqual(phone.values, { day: 0, week: 1, month: 1 });
});

test("erfasst einmalige Meilensteine nicht doppelt und Gespräche mehrfach", () => {
  const base = application();
  const completed = addApplicationActivity(
    base,
    "application_pack_completed",
    "2026-08-02T08:00:00.000Z",
  );
  const repeated = addApplicationActivity(
    completed,
    "application_pack_completed",
    "2026-08-02T09:00:00.000Z",
  );
  const firstCall = addApplicationActivity(
    repeated,
    "phone_interview",
    "2026-08-02T10:00:00.000Z",
  );
  const secondCall = addApplicationActivity(
    firstCall,
    "phone_interview",
    "2026-08-03T10:00:00.000Z",
  );

  assert.equal(
    repeated.activities.filter(
      (activity) => activity.type === "application_pack_completed",
    ).length,
    1,
  );
  assert.equal(
    secondCall.activities.filter((activity) => activity.type === "phone_interview")
      .length,
    2,
  );
});

test("normalisiert Generierungsfilter und verwirft unbekannte Werte", () => {
  const preferences = normalizeApplicationGenerationPreferences({
    formality: "formal",
    outputKinds: ["tailored-cv", "unknown"],
    researchScopes: ["company", "projects", "invalid"],
    selectedResearchClaimIds: ["claim-1"],
    desiredSalaryAnnual: 58_000,
    cvLength: "detailed",
  });

  assert.equal(preferences.formality, "formal");
  assert.deepEqual(preferences.outputKinds, ["tailored-cv"]);
  assert.deepEqual(preferences.researchScopes, ["company", "projects"]);
  assert.equal(preferences.desiredSalaryAnnual, 58_000);
  assert.equal(
    preferences.cvLength,
    "two_pages",
    "alte Längenvarianten werden auf den versandfertigen Zwei-Seiten-Vertrag migriert",
  );
});

test("ergänzt alte Bewerbungszustände abwärtskompatibel um das Dokumentdesign", () => {
  assert.deepEqual(normalizeApplicationDocumentDesign(undefined), {
    templateDocumentIds: {
      "tailored-cv": null,
      "cover-letter": null,
      "company-brief": null,
      "interview-prep": null,
    },
    visualizations: [],
  });
});

test("normalisiert Vorlagenauswahl und Visualisierungsziele je Dokumenttyp", () => {
  const design = normalizeApplicationDocumentDesign({
    templateDocumentIds: {
      "tailored-cv": " template-1 ",
      "cover-letter": "template-2",
      unknown: "ignored",
    },
    visualizations: [
      {
        id: "visual-1",
        sourceDocumentId: "image-1",
        title: "Technische Skills",
        altText: "Horizontales Balkendiagramm technischer Kompetenzen",
        targetKinds: ["tailored-cv", "interview-prep", "unknown"],
        placement: "after-skills",
        confirmedAt: "2026-08-06T10:00:00.000Z",
      },
    ],
  });

  assert.equal(design.templateDocumentIds["tailored-cv"], "template-1");
  assert.equal(design.templateDocumentIds["company-brief"], null);
  assert.deepEqual(design.visualizations[0].targetKinds, [
    "tailored-cv",
    "interview-prep",
  ]);
  assert.equal(design.visualizations[0].placement, "after-skills");
  assert.equal(design.visualizations[0].confirmedAt, "2026-08-06T10:00:00.000Z");
});

test("ordnet den Gehaltswunsch gegen eine veröffentlichte Spanne ein", () => {
  const inside = assessSalaryPreference({
    publishedCompensation: "Etwa 42.000–60.000 Euro brutto jährlich",
    salaryOutlook: "yes",
    desiredSalaryAnnual: 58_000,
    minimumSalaryAnnual: 52_000,
  });
  const above = assessSalaryPreference({
    publishedCompensation: "Etwa 42.000–50.000 Euro brutto jährlich",
    salaryOutlook: "borderline",
    desiredSalaryAnnual: 58_000,
    minimumSalaryAnnual: 52_000,
  });

  assert.equal(inside.tone, "positive");
  assert.deepEqual(inside.publishedRange, { minimum: 42_000, maximum: 60_000 });
  assert.equal(above.tone, "critical");
  assert.match(above.title, /Untergrenze/);
});
