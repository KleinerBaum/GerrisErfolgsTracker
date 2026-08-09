import assert from "node:assert/strict";
import test from "node:test";

import {
  APPLICATION_RESEARCH,
  archiveLegacyApplicationResearch,
  createEmptyApplication,
  legacyApplicationResearchSummary,
  mergeApplicationResearch,
  normalizeApplicationResearchMigration,
} from "../lib/application-research.ts";
import { applyConfirmedResearchClaim } from "../lib/job-research.ts";
import { createQaRoleFixtures } from "../lib/role-pipeline-fixtures.ts";
import {
  acceptRoleImportCandidates,
  buildRoleSearchPrompt,
  findRoleDuplicate,
  stageRoleImport,
} from "../lib/role-import.ts";
import {
  applyRecommendationGate,
  defaultJobSearchProfile,
  documentGenerationGate,
  marketSalaryEstimateFromResearch,
  safePublicUrl,
  salaryBasisFromResearch,
  verificationStatusFromResearch,
} from "../lib/role-pipeline.ts";

const NOW = "2026-08-09T09:00:00.000Z";
const ORIGINAL_URL = "https://jobs.example.com/roles/ai-product-builder";

function profile(overrides = {}) {
  return {
    ...defaultJobSearchProfile([], NOW),
    reviewedAt: NOW,
    ...overrides,
  };
}

function candidate(overrides = {}) {
  return {
    provider: "indeed",
    provider_job_id: "indeed-synthetic-1",
    discovery_url: "https://de.indeed.com/viewjob?jk=synthetic-1",
    source_url: ORIGINAL_URL,
    captured_at: NOW,
    checked_at: "2026-08-09T08:55:00.000Z",
    employer: "Beispiel Digital GmbH",
    title: "AI Product Builder",
    location: "Berlin · hybrid",
    published_at: "2026-08-05",
    contract_type: "Unbefristet · Vollzeit",
    salary: { value: "", basis: "not_listed" },
    contact: { name: "Alex Beispiel", email: "", phone: "" },
    description:
      "Synthetische Anzeige mit Produktentwicklung, Prozessautomatisierung, Beratung, Prototyping, Tests, Stakeholderarbeit, Datenanalyse, Dokumentation, Governance, Rollout, Betrieb, Wirkungsmessung und Teamarbeit.",
    assessment: {
      recommendation: "maybe",
      fit: 8,
      shortlist_chance: 55,
      main_match: "Angewandte AI- und Prozessautomatisierung.",
      main_risk: "Domänenkenntnis noch belegen.",
      cv_angle: "Messbare Automatisierungsergebnisse.",
      evidence_urls: [ORIGINAL_URL],
    },
    ...overrides,
  };
}

function payload(candidates, overrides = {}) {
  return JSON.stringify({
    schema: "GerrisRoleImportV1",
    indeed_profile_status: "missing",
    candidates,
    ...overrides,
  });
}

function claim(id, factKey, value) {
  return {
    id,
    factKey,
    value,
    evidenceClass: "job_ad_explicit",
    evidenceStatus: "supported",
    sourceUrls: [ORIGINAL_URL],
    asOf: "2026-08-09",
    whyItMatters: "Kanonischer Rollenfakt.",
    decision: {
      status: "confirmed",
      value: null,
      decidedAt: NOW,
    },
  };
}

function verifiedResearch(overrides = {}) {
  return {
    schemaVersion: 1,
    retrievalStatus: "exact_page_accessed",
    requestedUrl: ORIGINAL_URL,
    canonicalUrl: ORIGINAL_URL,
    adFacts: [
      claim("company", "company.name", "Beispiel Digital GmbH"),
      claim("title", "role.title", "AI Product Builder"),
      claim("status", "process.posting_status", "offen"),
      claim("salary", "offer.salary", "nicht veröffentlicht"),
      claim("market", "market.salary", "60.000–70.000 EUR brutto/Jahr"),
    ],
    enrichment: [],
    gaps: [],
    conflicts: [],
    warnings: [],
    sources: [
      {
        url: ORIGINAL_URL,
        title: "Synthetische Stellenanzeige",
        domain: "jobs.example.com",
        discoveredBy: "both",
      },
    ],
    researchedAt: NOW,
    promptVersion: "test",
    model: "test",
    responseId: "resp_test",
    validation: {
      consultedSources: 1,
      totalClaims: 5,
      supportedClaims: 5,
      unsupportedClaims: 0,
      matchedSourceUrls: 5,
    },
    ...overrides,
  };
}

test("prüft GerrisRoleImportV1 vor Persistenz und führt Indeed/Jooble-Dubletten zusammen", () => {
  const indeed = candidate();
  const jooble = candidate({
    provider: "jooble",
    provider_job_id: "jooble-synthetic-99",
    discovery_url: "https://de.jooble.org/desc/synthetic-99",
  });
  const preview = stageRoleImport(payload([indeed, jooble]), [], profile(), NOW);

  assert.equal(preview.errors.length, 0);
  assert.equal(preview.indeedProfileStatus, "missing");
  assert.equal(preview.candidates.length, 2);
  assert.equal(preview.candidates[0].originalLinkStatus, "claimed_original");
  assert.equal(preview.candidates[1].duplicate?.reason, "exact_url");

  const accepted = acceptRoleImportCandidates([], preview.candidates, NOW);
  assert.equal(accepted.applications.length, 1);
  assert.equal(accepted.createdIds.length, 1);
  assert.equal(accepted.mergedIds.length, 1);
  const [application] = accepted.applications;
  assert.equal(application.status, "research");
  assert.equal(application.recommendation, "undecided");
  assert.equal(application.verificationStatus, "unverified");
  assert.equal(application.sourceUrl, "");
  assert.equal(application.checkedAt, "");
  assert.deepEqual(
    new Set(application.discoverySources.map((source) => source.provider)),
    new Set(["indeed", "jooble"]),
  );
});

test("weist Kandidatenprofil, Kontaktdaten und Bewerbungshistorie vollständig zurück", () => {
  const privatePayload = JSON.stringify({
    schema: "GerrisRoleImportV1",
    indeed_profile_status: "available",
    applicantEmail: "private@example.com",
    candidates: [
      {
        ...candidate(),
        applicationHistory: [{ status: "submitted" }],
      },
    ],
  });
  const preview = stageRoleImport(privatePayload, [], profile(), NOW);

  assert.equal(preview.candidates.length, 0);
  assert.match(preview.errors.join(" "), /applicantEmail/);
  assert.match(preview.errors.join(" "), /applicationHistory/);
});

test("weist unbekannte Provider, private oder falsche URLs und überlange Inhalte zurück", () => {
  const malformed = candidate({
    provider: "unknown-provider",
    discovery_url: "http://127.0.0.1/private",
    source_url: "javascript:alert(1)",
    published_at: "2026-02-30",
    description: "x".repeat(30_001),
    salary: { value: "60.000 EUR", basis: "not_listed" },
    contact: null,
  });
  const preview = stageRoleImport(payload([malformed]), [], profile(), NOW);
  const errors = preview.candidates[0].errors.join(" ");

  assert.match(errors, /Unbekannter Provider/);
  assert.match(errors, /discovery_url/);
  assert.match(errors, /source_url/);
  assert.match(errors, /published_at/);
  assert.match(errors, /description ist zu lang/);
  assert.match(errors, /not_listed/);
  assert.match(errors, /contact muss ein Objekt/);
  assert.equal(safePublicUrl("https://user:secret@example.com/job"), "");
});

test("erkennt Dubletten in der festgelegten Reihenfolge", () => {
  const preview = stageRoleImport(payload([candidate()]), [], profile(), NOW);
  const [existing] = acceptRoleImportCandidates([], preview.candidates, NOW).applications;
  const longDescription = candidate().description;

  assert.equal(
    findRoleDuplicate(
      candidate({
        employer: "Anderer Arbeitgeber",
        title: "Andere Rolle",
        discovery_url: "https://de.indeed.com/viewjob?jk=other-url",
        source_url: "https://other.example.com/jobs/other",
      }),
      [existing],
    )?.reason,
    "provider_job_id",
  );
  assert.equal(
    findRoleDuplicate(
      candidate({
        provider_job_id: "other-id",
        employer: "Anderer Arbeitgeber",
        title: "Andere Rolle",
      }),
      [existing],
    )?.reason,
    "exact_url",
  );
  assert.equal(
    findRoleDuplicate(
      candidate({
        provider_job_id: "identity-id",
        discovery_url: "https://de.indeed.com/viewjob?jk=identity",
        source_url: "https://jobs.example.com/roles/identity",
        description: "Völlig anderer kurzer Text.",
      }),
      [existing],
    )?.reason,
    "employer_title",
  );
  assert.equal(
    findRoleDuplicate(
      candidate({
        provider_job_id: "description-id",
        discovery_url: "https://de.indeed.com/viewjob?jk=description",
        source_url: "https://jobs.example.com/roles/description",
        employer: "Neuer Name GmbH",
        title: "Neue Bezeichnung",
        description: `${longDescription} Ergänzung`,
      }),
      [existing],
    )?.reason,
    "description",
  );
});

test("markiert fehlende Pflichtfelder im Kandidaten", () => {
  const incomplete = candidate();
  delete incomplete.provider;
  delete incomplete.contact;
  const preview = stageRoleImport(payload([incomplete]), [], profile(), NOW);
  const errors = preview.candidates[0].errors.join(" ");

  assert.match(errors, /Pflichtfelder fehlen: provider, contact/);
  assert.match(errors, /Unbekannter Provider/);
  assert.match(errors, /contact muss ein Objekt/);
});

test("begrenzt Importe auf 20 Kandidaten und akzeptiert einzelne öffentliche URLs", () => {
  const many = Array.from({ length: 21 }, (_, index) =>
    candidate({ provider_job_id: `job-${index}` }),
  );
  const oversized = stageRoleImport(payload(many), [], profile(), NOW);
  assert.equal(oversized.candidates.length, 20);
  assert.match(oversized.errors.join(" "), /Maximal 20/);

  const urls = stageRoleImport(
    "https://de.indeed.com/viewjob?jk=url-only\nhttps://jobs.example.com/roles/manual",
    [],
    profile(),
    NOW,
  );
  assert.equal(urls.errors.length, 0);
  assert.equal(urls.candidates.length, 2);
  assert.equal(urls.candidates[0].candidate.provider, "indeed");
  assert.equal(urls.candidates[1].candidate.provider, "manual");
});

test("erzwingt harte Ausschlüsse vor der beratenden Fit-Einschätzung", () => {
  const excludedProfile = profile({
    hardExclusions: {
      employers: ["Beispiel Digital"],
      titles: [],
      keywords: [],
      contractTypes: [],
    },
  });
  const preview = stageRoleImport(
    payload([candidate()]),
    [],
    excludedProfile,
    NOW,
  );
  const accepted = acceptRoleImportCandidates([], preview.candidates, NOW);
  const application = accepted.applications[0];

  assert.match(preview.candidates[0].hardExclusionMatches[0], /Arbeitgeber/);
  assert.equal(application.assessment?.recommendation, "skip");
  assert.equal(application.recommendation, "undecided");
  assert.equal(applyRecommendationGate(application).allowed, false);
  assert.equal(documentGenerationGate(application).allowed, false);
});

test("trennt nicht veröffentlichtes Gehalt von einer Marktspanne", () => {
  const research = verifiedResearch();
  let application = createEmptyApplication("salary-separation");
  for (const researchClaim of research.adFacts) {
    application = applyConfirmedResearchClaim(application, researchClaim);
  }

  assert.equal(salaryBasisFromResearch(research), "not_listed");
  assert.equal(application.salaryBasis, "not_listed");
  assert.equal(application.compensation, "");
  assert.equal(
    application.marketSalaryEstimate,
    "60.000–70.000 EUR brutto/Jahr",
  );
  assert.equal(
    marketSalaryEstimateFromResearch(research),
    "60.000–70.000 EUR brutto/Jahr",
  );
});

test("lässt Unterlagen nur für offen verifizierte Apply- oder Maybe-Rollen zu", () => {
  const base = createEmptyApplication("gate");
  assert.equal(documentGenerationGate(base).allowed, false);

  const allowed = {
    ...base,
    sourceUrl: ORIGINAL_URL,
    verificationStatus: "verified",
    recommendation: "maybe",
    vacancyResearch: verifiedResearch(),
  };
  assert.equal(documentGenerationGate(allowed).allowed, true);
  assert.equal(verificationStatusFromResearch(verifiedResearch()), "verified");
  assert.equal(
    verificationStatusFromResearch(
      verifiedResearch({
        adFacts: [claim("status", "process.posting_status", "geschlossen")],
      }),
    ),
    "closed",
  );
  assert.equal(
    documentGenerationGate({ ...allowed, verificationStatus: "stale" }).allowed,
    false,
  );
});

test("hält den QA-Kanal auf fünf synthetische, voneinander getrennte Fälle begrenzt", () => {
  const fixtures = createQaRoleFixtures(NOW);
  assert.equal(fixtures.length, 5);
  assert.equal(fixtures.every((item) => item.tags.includes("Synthetischer QA-Fall")), true);
  assert.equal(
    fixtures.find((item) => item.id === "qa-provider-duplicate")?.discoverySources.length,
    2,
  );
  assert.equal(
    fixtures.find((item) => item.id === "qa-original-link-missing")?.sourceUrl,
    "",
  );
  assert.equal(
    documentGenerationGate(
      fixtures.find((item) => item.id === "qa-provider-duplicate"),
    ).allowed,
    true,
  );
});

test("archiviert den 105er Altbestand einmalig und erhält echte Prozesse", () => {
  assert.equal(APPLICATION_RESEARCH.length, 105);
  assert.deepEqual(mergeApplicationResearch(undefined), []);
  assert.deepEqual(legacyApplicationResearchSummary(APPLICATION_RESEARCH), {
    candidates: 105,
    archive: 105,
    retain: 0,
  });

  const touched = {
    ...APPLICATION_RESEARCH[0],
    status: "submitted",
    appliedAt: "2026-08-08",
    notes: "Echte Bewerbung bleibt erhalten.",
  };
  const own = createEmptyApplication("own-process");
  const result = archiveLegacyApplicationResearch([
    touched,
    ...APPLICATION_RESEARCH.slice(1),
    own,
  ]);

  assert.equal(result.archivedCount, 104);
  assert.equal(result.retainedCount, 1);
  assert.equal(result.applications.length, 2);
  const retained = result.applications.find((item) => item.id === touched.id);
  assert.equal(retained?.verificationStatus, "stale");
  assert.equal(retained?.status, "submitted");
  assert.equal(retained?.notes, "Echte Bewerbung bleibt erhalten.");
  assert.equal(
    normalizeApplicationResearchMigration(undefined, APPLICATION_RESEARCH).status,
    "pending",
  );
});

test("normalisiert sourceVerifiedAt aus alten Zuständen ohne erneutes Aussäen", () => {
  const legacy = createEmptyApplication("legacy-normalization");
  delete legacy.discoverySources;
  delete legacy.checkedAt;
  delete legacy.publishedAt;
  delete legacy.contractType;
  delete legacy.salaryBasis;
  delete legacy.marketSalaryEstimate;
  delete legacy.verificationStatus;
  delete legacy.contentFingerprint;
  delete legacy.recommendation;
  delete legacy.assessment;
  delete legacy.warmPath;
  legacy.sourceVerifiedAt = "2026-08-01";
  legacy.sourceUrl = ORIGINAL_URL;

  const [normalized] = mergeApplicationResearch([legacy]);
  assert.equal(normalized.checkedAt, "2026-08-01");
  assert.equal(normalized.verificationStatus, "unverified");
  assert.equal(normalized.recommendation, "undecided");
  assert.equal(normalized.sourceUrl, "");
  assert.equal(normalized.discoverySources.length, 1);
  assert.equal(normalized.discoverySources[0].url, ORIGINAL_URL);
});

test("erzeugt je Track und Ort einen datensparsamen kostenlosen Suchlauf", () => {
  const searchProfile = profile({
    targetTracks: ["AI App Development", "Beratung und Sales"],
    locations: ["Berlin", "Remote Deutschland"],
  });
  const prompt = buildRoleSearchPrompt(searchProfile, false);

  assert.match(prompt, /1\. AI App Development · Berlin/);
  assert.match(prompt, /4\. Beratung und Sales · Remote Deutschland/);
  assert.match(prompt, /Nutze Jooble in diesem Lauf nicht/);
  assert.match(prompt, /indeed_profile_status/);
  assert.match(prompt, /Kopiere keine Profildaten/);
  assert.doesNotMatch(prompt, /Master-CV|Bewerbungshistorie:/);
});
