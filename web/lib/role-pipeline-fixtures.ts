import { createEmptyApplication } from "./application-research.ts";
import { contentFingerprint } from "./role-pipeline.ts";
import type {
  ApplicationProcess,
  JobResearchClaim,
  VacancyResearch,
} from "./types";

export const QA_ROLE_FIXTURE_VERSION = 1;

function syntheticClaim(
  id: string,
  factKey: JobResearchClaim["factKey"],
  value: string,
  sourceUrl: string,
  decidedAt: string,
): JobResearchClaim {
  return {
    id,
    factKey,
    value,
    evidenceClass: "job_ad_explicit",
    evidenceStatus: "supported",
    sourceUrls: [sourceUrl],
    asOf: decidedAt.slice(0, 10),
    whyItMatters: "Synthetischer QA-Fakt.",
    decision: {
      status: "confirmed",
      value: null,
      decidedAt,
    },
  };
}

function syntheticResearch(input: {
  company: string;
  title: string;
  sourceUrl: string;
  salary: string;
  checkedAt: string;
}): VacancyResearch {
  const adFacts = [
    syntheticClaim(
      `${input.title}-company`,
      "company.name",
      input.company,
      input.sourceUrl,
      input.checkedAt,
    ),
    syntheticClaim(
      `${input.title}-title`,
      "role.title",
      input.title,
      input.sourceUrl,
      input.checkedAt,
    ),
    syntheticClaim(
      `${input.title}-status`,
      "process.posting_status",
      "offen",
      input.sourceUrl,
      input.checkedAt,
    ),
    syntheticClaim(
      `${input.title}-salary`,
      "offer.salary",
      input.salary,
      input.sourceUrl,
      input.checkedAt,
    ),
  ];
  return {
    schemaVersion: 1,
    retrievalStatus: "exact_page_accessed",
    requestedUrl: input.sourceUrl,
    canonicalUrl: input.sourceUrl,
    adFacts,
    enrichment: [],
    gaps: [],
    conflicts: [],
    warnings: ["Synthetischer QA-Fall; keine reale Vakanz."],
    sources: [
      {
        url: input.sourceUrl,
        title: "Synthetische QA-Anzeige",
        domain: new URL(input.sourceUrl).hostname,
        discoveredBy: "both",
      },
    ],
    researchedAt: input.checkedAt,
    promptVersion: "qa-synthetic-v1",
    model: "synthetic",
    responseId: "synthetic",
    validation: {
      consultedSources: 1,
      totalClaims: adFacts.length,
      supportedClaims: adFacts.length,
      unsupportedClaims: 0,
      matchedSourceUrls: adFacts.length,
    },
  };
}

function fixture(
  id: string,
  input: Partial<ApplicationProcess> &
    Pick<ApplicationProcess, "company" | "jobTitle" | "location">,
): ApplicationProcess {
  const base = createEmptyApplication(id);
  const next = {
    ...base,
    status: "research" as const,
    researchTier: "own" as const,
    nextStep: "QA-Szenario prüfen",
    tags: ["Synthetischer QA-Fall"],
    ...input,
  };
  return {
    ...next,
    contentFingerprint: contentFingerprint({
      employer: next.company,
      title: next.jobTitle,
      location: next.location,
      description: next.jobDescriptionText,
    }),
  };
}

export function createQaRoleFixtures(now = new Date().toISOString()): ApplicationProcess[] {
  const checkedDate = now.slice(0, 10);
  return [
    fixture("qa-provider-duplicate", {
      company: "Nordlicht Digital GmbH (synthetisch)",
      jobTitle: "Product Owner AI-Anwendungen (synthetisch)",
      location: "Düsseldorf · Hybrid",
      sourceUrl: "https://example.com/jobs/ai-product-owner",
      sourceVerifiedAt: checkedDate,
      checkedAt: now,
      publishedAt: checkedDate,
      contractType: "Unbefristet · Vollzeit",
      compensation: "68.000–78.000 EUR brutto/Jahr",
      salaryBasis: "listed",
      marketSalaryEstimate: "",
      verificationStatus: "verified",
      recommendation: "maybe",
      vacancyResearch: syntheticResearch({
        company: "Nordlicht Digital GmbH (synthetisch)",
        title: "Product Owner AI-Anwendungen (synthetisch)",
        sourceUrl: "https://example.com/jobs/ai-product-owner",
        salary: "68.000–78.000 EUR brutto/Jahr",
        checkedAt: now,
      }),
      discoverySources: [
        {
          provider: "indeed",
          providerJobId: "qa-indeed-101",
          url: "https://de.indeed.com/viewjob?jk=qa-101",
          sourceKind: "discovery",
          capturedAt: now,
          checkedAt: now,
        },
        {
          provider: "jooble",
          providerJobId: "qa-jooble-202",
          url: "https://de.jooble.org/desc/qa-202",
          sourceKind: "discovery",
          capturedAt: now,
          checkedAt: now,
        },
      ],
      jobDescriptionText:
        "Synthetische Anzeige für die Dublettenprüfung. Verantwortet werden Produktsteuerung, AI-App-Backlog und Stakeholderabstimmung.",
    }),
    fixture("qa-salary-not-listed", {
      company: "Stadt Beispielhausen (synthetisch)",
      jobTitle: "Projektleitung Verwaltungsdigitalisierung (synthetisch)",
      location: "Beispielhausen · Teilweise remote",
      sourceUrl: "https://example.com/jobs/digitalisierung",
      sourceVerifiedAt: checkedDate,
      checkedAt: now,
      publishedAt: checkedDate,
      contractType: "Unbefristet · Vollzeit oder Teilzeit",
      compensation: "",
      salaryBasis: "not_listed",
      marketSalaryEstimate: "55.000–65.000 EUR brutto/Jahr (Marktspanne)",
      verificationStatus: "verified",
      recommendation: "undecided",
      vacancyResearch: syntheticResearch({
        company: "Stadt Beispielhausen (synthetisch)",
        title: "Projektleitung Verwaltungsdigitalisierung (synthetisch)",
        sourceUrl: "https://example.com/jobs/digitalisierung",
        salary: "nicht veröffentlicht",
        checkedAt: now,
      }),
      jobDescriptionText:
        "Synthetische Anzeige ohne Gehaltsangabe für die saubere Trennung von not_listed und market_estimate.",
    }),
    fixture("qa-stale-posting", {
      company: "Rheinwerk Beratung AG (synthetisch)",
      jobTitle: "Senior Consultant Prozessautomation (synthetisch)",
      location: "Köln · Hybrid",
      sourceUrl: "https://example.com/jobs/prozessautomation-alt",
      sourceVerifiedAt: "2026-05-01",
      checkedAt: "2026-05-01T10:00:00.000Z",
      publishedAt: "2026-04-15",
      contractType: "Unbefristet",
      compensation: "Marktspanne 70.000–82.000 EUR",
      salaryBasis: "market_estimate",
      marketSalaryEstimate: "60.000–70.000 EUR brutto/Jahr (Marktspanne)",
      verificationStatus: "stale",
      recommendation: "undecided",
      vacancyResearch: syntheticResearch({
        company: "Rheinwerk Beratung AG (synthetisch)",
        title: "Senior Consultant Prozessautomation (synthetisch)",
        sourceUrl: "https://example.com/jobs/prozessautomation-alt",
        salary: "nicht veröffentlicht",
        checkedAt: "2026-05-01T10:00:00.000Z",
      }),
      jobDescriptionText:
        "Synthetische veraltete Anzeige. Sie darf weder Apply noch Unterlagenerstellung freigeben.",
    }),
    fixture("qa-original-link-missing", {
      company: "Westfalen Vertrieb KG (synthetisch)",
      jobTitle: "Solution Sales Manager AI (synthetisch)",
      location: "Remote Deutschland",
      sourceUrl: "",
      sourceVerifiedAt: "",
      checkedAt: "",
      publishedAt: null,
      contractType: "",
      compensation: "",
      salaryBasis: "unknown",
      marketSalaryEstimate: "",
      verificationStatus: "unverified",
      recommendation: "undecided",
      discoverySources: [
        {
          provider: "jooble",
          providerJobId: "qa-jooble-303",
          url: "https://de.jooble.org/desc/qa-303",
          sourceKind: "discovery",
          capturedAt: now,
          checkedAt: null,
        },
      ],
      jobDescriptionText:
        "Synthetischer Discovery-Treffer ohne auflösbaren Arbeitgeber- oder ATS-Link.",
    }),
    fixture("qa-linkedin-warm-path", {
      company: "Morgenrot Plattformen SE (synthetisch)",
      jobTitle: "Programmmanagerin Digitale Services (synthetisch)",
      location: "Berlin · Hybrid",
      sourceUrl: "https://example.com/jobs/digitale-services",
      sourceVerifiedAt: checkedDate,
      checkedAt: now,
      publishedAt: checkedDate,
      contractType: "Unbefristet",
      compensation: "75.000–88.000 EUR brutto/Jahr",
      salaryBasis: "listed",
      marketSalaryEstimate: "",
      verificationStatus: "verified",
      recommendation: "maybe",
      vacancyResearch: syntheticResearch({
        company: "Morgenrot Plattformen SE (synthetisch)",
        title: "Programmmanagerin Digitale Services (synthetisch)",
        sourceUrl: "https://example.com/jobs/digitale-services",
        salary: "75.000–88.000 EUR brutto/Jahr",
        checkedAt: now,
      }),
      contactPerson: "Mara Beispiel (synthetisch)",
      warmPath: {
        personName: "Mara Beispiel",
        personRole: "Leitung Digitale Services",
        sourceUrl: "https://example.com/team/mara-beispiel",
        publicContext:
          "Synthetische öffentliche Quelle: Programm für serviceorientierte Prozessdigitalisierung.",
        commonContactsNote: "Gemeinsame Kontakte in LinkedIn noch manuell prüfen.",
        commonContactsConfirmedAt: null,
      },
      jobDescriptionText:
        "Synthetischer Warm-path-Fall mit namentlich bekannter Person aus einer öffentlichen Teamquelle.",
    }),
  ];
}
