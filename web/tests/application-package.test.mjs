import assert from "node:assert/strict";
import test from "node:test";

import {
  applicationPackageQualityIssues,
  buildApplicationQualityReport,
  markApplicationPackageNeedsReview,
  readyApplicationPackage,
} from "../lib/application-package.ts";
import {
  allOutputKinds,
  makeValidDraft,
  preferencesFixture,
  qualityContextFixture,
} from "./fixtures/application-fixtures.mjs";

test("gibt nur ein vollständig belegtes Paket als ready frei", () => {
  const draft = makeValidDraft();
  const issues = applicationPackageQualityIssues(
    draft,
    allOutputKinds,
    "two_pages",
    qualityContextFixture,
  );

  assert.deepEqual(issues, []);
  const report = buildApplicationQualityReport(
    draft,
    allOutputKinds,
    "two_pages",
    qualityContextFixture,
    1,
  );
  assert.equal(report.status, "ready");
  assert.equal(report.metrics.expectedExperienceEntries, 7);
  assert.equal(report.metrics.coveredExperienceEntries, 7);
  assert.equal(report.metrics.evidenceCoveragePercent, 100);
  assert.equal(
    report.metrics.coveredSubstantiveClaims,
    report.metrics.substantiveClaims,
  );
  const ready = readyApplicationPackage(draft, report);
  assert.equal(ready.status, "ready");
});

test("verwirft unvollständigen Kurz-CV, Platzhalter und abgeschnittene Aussagen", () => {
  const draft = makeValidDraft();
  draft.tailoredCv =
    "# Lebenslauf\n## PROFIL\n[Aus dem Original-CV übernehmen]\n## BERUFSERFAHRUNG\nUnvollständig …";
  draft.evidenceMap = draft.evidenceMap.filter(
    (mapping) => mapping.artifact !== "tailoredCv",
  );

  const issues = applicationPackageQualityIssues(
    draft,
    allOutputKinds,
    "two_pages",
    qualityContextFixture,
  );

  assert.ok(issues.some((issue) => /Umfang/.test(issue)));
  assert.ok(issues.some((issue) => /Redaktionsplatzhalter/.test(issue)));
  assert.ok(issues.some((issue) => /Kürzungsellipsen/.test(issue)));
  assert.ok(issues.some((issue) => /belegte Station fehlt/.test(issue)));
  assert.ok(issues.some((issue) => /zu wenig intern belegte Aussagen/.test(issue)));
});

test("weist interne Fit-Bewertungen, kombinierte Kontaktlabels und Satzzeichenfehler ab", () => {
  const draft = makeValidDraft();
  draft.coverLetter = draft.coverLetter
    .replace(
      "Sehr geehrte Damen und Herren,",
      "Guten Tag Fachlich: Krisenmanagement HR: Personalservice,",
    )
    .replace(
      "Kommunale Krisenfestigkeit",
      "Passung 10/10. Hürde: Kommunale Krisenfestigkeit",
    )
    .replace("können", "können..");

  const issues = applicationPackageQualityIssues(
    draft,
    allOutputKinds,
    "two_pages",
    qualityContextFixture,
  );

  assert.ok(issues.some((issue) => /Anrede/.test(issue)));
  assert.ok(
    issues.some((issue) => /interne Bewertung oder Recherchelabel/.test(issue)),
  );
  assert.ok(issues.some((issue) => /doppelte Satzzeichen/.test(issue)));
});

test("akzeptiert die grammatisch korrekte männliche Anrede", () => {
  const draft = makeValidDraft();
  draft.coverLetter = draft.coverLetter.replace(
    "Sehr geehrte Damen und Herren,",
    "Sehr geehrter Herr Dr. Schulte,",
  );
  draft.applicationEmailBody = draft.applicationEmailBody.replace(
    "Sehr geehrte Damen und Herren,",
    "Sehr geehrter Herr Dr. Schulte,",
  );

  const issues = applicationPackageQualityIssues(
    draft,
    allOutputKinds,
    "two_pages",
    qualityContextFixture,
  );

  assert.deepEqual(issues, []);
});

test("verwirft grammatisch falsche Anreden und Arbeitgeberbedingungen im Kandidatentext", () => {
  const draft = makeValidDraft();
  draft.coverLetter = draft.coverLetter
    .replace(
      "Sehr geehrte Damen und Herren,",
      "Sehr geehrter Frau Dr. Schulte,",
    )
    .replace(
      "Kommunale Krisenfestigkeit",
      "Arbeitsmodell: Kommunale Krisenfestigkeit",
    );

  const issues = applicationPackageQualityIssues(
    draft,
    allOutputKinds,
    "two_pages",
    qualityContextFixture,
  );

  assert.ok(issues.some((issue) => /grammatisch fehlerhaft/.test(issue)));
  assert.ok(issues.some((issue) => /Arbeitgeberbedingungen/.test(issue)));
});

test("wendet den festen Zwei-Seiten-Vertrag auch auf alte Längeneinstellungen an", () => {
  const draft = makeValidDraft();

  for (const legacyLength of ["compact", "detailed"]) {
    const issues = applicationPackageQualityIssues(
      draft,
      allOutputKinds,
      legacyLength,
      qualityContextFixture,
    );
    assert.doesNotMatch(issues.join("\n"), /tailored-cv: Umfang/);
  }
});

test("akzeptiert Arbeitgeberbedingungen nicht als persönliche Verfügbarkeit", () => {
  const application = {
    researchSummary: "Passung 9/10: Fachlich interessant.",
    notes: "Interne Notiz zur Recherche.",
    publishedTerms: "Unbefristet · Homeoffice",
    appliedTerms: "EG 10",
  };
  const personalInputs = application.generationInputs ?? {
    motivation: "",
    achievements: "",
    strengths: "",
    constraints: "",
    availability: "",
  };

  assert.equal(personalInputs.motivation, "");
  assert.equal(personalInputs.constraints, "");
  assert.equal(personalInputs.availability, "");
  assert.doesNotMatch(
    JSON.stringify(personalInputs),
    /Passung|Interne Notiz|Homeoffice|EG 10/,
  );
});

test("verwirft ungültige oder sichtbare Evidenzreferenzen", () => {
  const draft = makeValidDraft();
  draft.evidenceMap[0].evidenceIds = ["CV-UNBEKANNT"];
  draft.applicationEmailBody += "\n[CV-EV-1]";

  const issues = applicationPackageQualityIssues(
    draft,
    allOutputKinds,
    preferencesFixture.cvLength,
    qualityContextFixture,
  );

  assert.ok(issues.some((issue) => /ungültige Evidenzreferenz/.test(issue)));
  assert.ok(issues.some((issue) => /interne Evidenz-ID ist sichtbar/.test(issue)));
});

test("verwirft einzelne substanzielle Aussagen ohne interne Belegzuordnung", () => {
  const draft = makeValidDraft();
  draft.evidenceMap = draft.evidenceMap.filter(
    (mapping) => !mapping.claim.startsWith("Für den Einstieg möchte ich"),
  );

  const issues = applicationPackageQualityIssues(
    draft,
    allOutputKinds,
    preferencesFixture.cvLength,
    qualityContextFixture,
  );

  assert.ok(
    issues.some(
      (issue) =>
        /coverLetter: substantielle Aussage ohne Evidenzzuordnung/.test(issue) &&
        /Für den Einstieg/.test(issue),
    ),
  );
});

test("setzt manuelle Änderungen bis zur erneuten Prüfung zurück", () => {
  const draft = makeValidDraft();
  const report = buildApplicationQualityReport(
    draft,
    allOutputKinds,
    "two_pages",
    qualityContextFixture,
    1,
  );
  const ready = readyApplicationPackage(draft, report);
  const edited = markApplicationPackageNeedsReview({
    ...ready,
    coverLetter: ready.coverLetter.replace(
      "Kommunale Krisenfestigkeit",
      "Nachhaltige Krisenfestigkeit",
    ),
  });

  assert.equal(edited.status, "needs_review");
  assert.equal(edited.qualityReport.status, "needs_review");
  assert.match(edited.qualityReport.issues[0], /erneut/);
});
