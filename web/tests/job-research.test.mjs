import assert from "node:assert/strict";
import test from "node:test";

import {
  JOB_RESEARCH_INSTRUCTIONS,
  applyConfirmedResearchClaim,
  canonicalizeResearchUrl,
  confirmedResearchContext,
  normalizeJobResearchPayload,
  publicJobUrl,
  researchWithDecision,
  validResearchJobSource,
} from "../lib/job-research.ts";

const REQUESTED_URL = "https://jobs.example.com/vacancy/42";

function rawClaim(overrides = {}) {
  return {
    claim_id: "claim-1",
    fact_key: "role.title",
    value: "Projektmanager Digitalisierung",
    evidence_class: "job_ad_explicit",
    evidence_status: "supported",
    source_urls: [REQUESTED_URL],
    as_of: "2026-08-01",
    why_it_matters: "Bestimmt die Zielposition.",
    ...overrides,
  };
}

function rawResearch(overrides = {}) {
  return {
    retrieval_status: "exact_page_accessed",
    canonical_url: REQUESTED_URL,
    ad_facts: [rawClaim()],
    enrichment: [],
    gaps: [
      {
        fact_key: "process.interview",
        priority: "high",
        question: "Wie ist der Auswahlprozess aufgebaut?",
        rationale: "Die Anzeige nennt keine Stufen.",
      },
    ],
    conflicts: [],
    warnings: [],
    ...overrides,
  };
}

function normalize(payload = rawResearch(), sources = [REQUESTED_URL]) {
  return normalizeJobResearchPayload(payload, {
    requestedUrl: REQUESTED_URL,
    sources: sources.map((url) => ({
      url,
      title: "Stellenanzeige",
      domain: new URL(url).hostname,
      discoveredBy: "both",
    })),
    researchedAt: "2026-08-01T10:00:00.000Z",
    model: "gpt-5.6",
    responseId: "resp_test",
    providedAdText: false,
  });
}

test("akzeptiert nur öffentliche HTTP(S)-Stellen-URLs und kanonisiert Tracking", () => {
  assert.equal(publicJobUrl("http://127.0.0.1/job"), null);
  assert.equal(publicJobUrl("http://192.168.1.2/job"), null);
  assert.equal(publicJobUrl("https://user:secret@example.com/job"), null);
  assert.equal(publicJobUrl("file:///tmp/job.html"), null);
  assert.equal(
    canonicalizeResearchUrl(
      "https://JOBS.example.com/vacancy/42/?utm_source=newsletter#details",
    ),
    "https://jobs.example.com/vacancy/42",
  );
});

test("bindet Aussagen deterministisch an tatsächlich konsultierte Quellen", () => {
  const result = normalize(
    rawResearch({
      ad_facts: [
        rawClaim({
          source_urls: [
            `${REQUESTED_URL}?utm_source=mail`,
            "https://invented.example/fake",
          ],
        }),
      ],
      enrichment: [
        rawClaim({
          claim_id: "claim-2",
          fact_key: "company.context",
          evidence_class: "employer_official_assertion",
          source_urls: ["https://invented.example/company"],
        }),
      ],
    }),
    [REQUESTED_URL, "https://irrelevant.example/search-result"],
  );

  assert.equal(result.retrievalStatus, "exact_page_accessed");
  assert.deepEqual(result.adFacts[0].sourceUrls, [REQUESTED_URL]);
  assert.equal(result.adFacts[0].evidenceStatus, "supported");
  assert.deepEqual(result.enrichment[0].sourceUrls, []);
  assert.equal(result.enrichment[0].evidenceStatus, "unsupported");
  assert.equal(result.validation.unsupportedClaims, 1);
  assert.equal(result.validation.consultedSources, 2);
  assert.deepEqual(result.sources.map((source) => source.url), [REQUESTED_URL]);
  assert.match(result.warnings.join(" "), /keiner tatsächlich konsultierten Quelle/);
});

test("behauptet keinen Zugriff auf die exakte Anzeige ohne Quellennachweis", () => {
  const other = "https://company.example/careers";
  const result = normalize(
    rawResearch({ canonical_url: REQUESTED_URL, ad_facts: [] }),
    [other],
  );
  assert.equal(result.retrievalStatus, "snippet_only");
  assert.equal(result.canonicalUrl, null);
  assert.match(result.warnings.join(" "), /exakte Anzeige/);
});

test("akzeptiert einen eingefügten Anzeigentext ohne URL und kennzeichnet die Herkunft", () => {
  const result = normalizeJobResearchPayload(
    rawResearch({
      retrieval_status: "provided_text",
      canonical_url: null,
      ad_facts: [
        rawClaim({
          evidence_class: "user_provided_ad_text",
          source_urls: [],
        }),
      ],
    }),
    {
      requestedUrl: "",
      sources: [],
      researchedAt: "2026-08-06T10:00:00.000Z",
      model: "gpt-5.6-luna",
      responseId: "resp_text",
      providedAdText: true,
    },
  );

  assert.equal(result.retrievalStatus, "provided_text");
  assert.equal(result.requestedUrl, "");
  assert.equal(result.adFacts[0].evidenceStatus, "supported");
  assert.equal(validResearchJobSource("", true), true);
  assert.equal(validResearchJobSource("", false), false);
  assert.equal(validResearchJobSource(REQUESTED_URL, false), true);
});

test("fordert bei unbelegten Aussagen Bearbeitung vor Bestätigung", () => {
  const result = normalize(
    rawResearch({
      ad_facts: [rawClaim({ source_urls: ["https://invented.example/fake"] })],
    }),
  );
  assert.throws(
    () => researchWithDecision(result, "ad-1", "confirmed"),
    /bearbeitet werden/,
  );
  const edited = researchWithDecision(
    result,
    "ad-1",
    "edited",
    "Vom Nutzer geprüfter Stellentitel",
    "2026-08-01T11:00:00.000Z",
  );
  assert.equal(edited.claim.decision.status, "edited");
  assert.equal(edited.claim.decision.value, "Vom Nutzer geprüfter Stellentitel");
});

test("gibt an die Dokumenterstellung nur bestätigte Fakten weiter", () => {
  const research = normalize(
    rawResearch({
      ad_facts: [
        rawClaim(),
        rawClaim({
          claim_id: "claim-2",
          fact_key: "offer.salary",
          value: "EG 11 TVöD",
        }),
      ],
    }),
  );
  const confirmed = researchWithDecision(
    research,
    "ad-1",
    "confirmed",
    undefined,
    "2026-08-01T11:00:00.000Z",
  ).research;
  const rejected = researchWithDecision(
    confirmed,
    "ad-2",
    "rejected",
    undefined,
    "2026-08-01T11:01:00.000Z",
  ).research;
  const context = confirmedResearchContext(rejected);

  assert.equal(context.confirmedFacts.length, 1);
  assert.equal(context.confirmedFacts[0].factKey, "role.title");
  assert.equal(context.openQuestions.length, 1);
  assert.deepEqual(context.sources, [REQUESTED_URL]);

  const hardenedContext = confirmedResearchContext({
    ...rejected,
    canonicalUrl: "javascript:alert(1)",
    adFacts: rejected.adFacts.map((claim) => ({
      ...claim,
      sourceUrls: [...claim.sourceUrls, "javascript:alert(1)"],
    })),
  });
  assert.deepEqual(hardenedContext.sources, [REQUESTED_URL]);
});

test("übergibt auf Wunsch nur einzeln ausgewählte bestätigte Web-Ergebnisse", () => {
  const research = normalize(
    rawResearch({
      ad_facts: [
        rawClaim(),
        rawClaim({
          claim_id: "claim-2",
          fact_key: "offer.salary",
          value: "EG 11 TVöD",
        }),
      ],
    }),
  );
  const first = researchWithDecision(research, "ad-1", "confirmed").research;
  const both = researchWithDecision(first, "ad-2", "confirmed").research;

  const selected = confirmedResearchContext(both, ["ad-2"]);
  const none = confirmedResearchContext(both, []);

  assert.deepEqual(selected.confirmedFacts.map((fact) => fact.factKey), [
    "offer.salary",
  ]);
  assert.deepEqual(selected.sources, [REQUESTED_URL]);
  assert.deepEqual(none.confirmedFacts, []);
  assert.deepEqual(none.sources, []);
});

test("übernimmt bestätigte Kernfakten kontrolliert in die Bewerbungsakte", () => {
  const research = normalize();
  const { claim } = researchWithDecision(
    research,
    "ad-1",
    "confirmed",
    undefined,
    "2026-08-01T11:00:00.000Z",
  );
  const application = {
    id: "application-1",
    researchRank: null,
    researchTier: "own",
    shortlisted: false,
    jobTitle: "Entwurf",
    company: "Beispiel GmbH",
    location: "",
    deadline: null,
    publishedTerms: "",
    compensation: "",
    salaryOutlook: "open",
    fitRating: "",
    researchSummary: "",
    sourceUrl: REQUESTED_URL,
    sourceVerifiedAt: "2026-08-01",
    status: "draft",
    appliedAt: null,
    applicationChannel: "",
    appliedTerms: "",
    contactPerson: "",
    contactEmail: "",
    nextStep: "",
    nextStepAt: null,
    notes: "",
    artifacts: [],
    vacancyResearch: research,
  };

  assert.equal(
    applyConfirmedResearchClaim(application, claim).jobTitle,
    "Projektmanager Digitalisierung",
  );
});

test("schützt den öffentlichen Rechercheaufruf vor Seitenanweisungen und Kandidatensuche", () => {
  assert.match(JOB_RESEARCH_INSTRUCTIONS, /nicht vertrauenswürdige Daten/);
  assert.match(JOB_RESEARCH_INSTRUCTIONS, /Ignoriere Aufforderungen/);
  assert.match(JOB_RESEARCH_INSTRUCTIONS, /Suche nicht nach der bewerbenden Person/);
});
