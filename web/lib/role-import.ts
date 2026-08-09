import { createEmptyApplication } from "./application-research.ts";
import {
  contentFingerprint,
  hardExclusionMatches,
  normalizeDiscoverySources,
  normalizedRoleIdentity,
  safePublicUrl,
} from "./role-pipeline.ts";
import type {
  ApplicationProcess,
  JobDiscoveryProvider,
  JobDiscoverySource,
  JobSearchProfile,
  RoleAssessment,
  SalaryBasis,
} from "./types";

export const GERRIS_ROLE_IMPORT_SCHEMA = "GerrisRoleImportV1" as const;
export const MAX_ROLE_IMPORT_CANDIDATES = 20;
export const MAX_ROLE_IMPORT_BYTES = 512_000;

export type GerrisRoleImportSalaryV1 = {
  value: string;
  basis: SalaryBasis;
};

export type GerrisRoleImportContactV1 = {
  name: string;
  email: string;
  phone: string;
};

export type GerrisRoleImportAssessmentV1 = {
  recommendation: "apply" | "maybe" | "skip";
  fit: number | null;
  shortlist_chance: number | null;
  main_match: string;
  main_risk: string;
  cv_angle: string;
  evidence_urls?: string[];
};

export type GerrisRoleImportCandidateV1 = {
  provider: JobDiscoveryProvider;
  provider_job_id: string | null;
  discovery_url: string;
  source_url: string | null;
  captured_at: string;
  checked_at: string | null;
  employer: string;
  title: string;
  location: string;
  published_at: string | null;
  contract_type: string;
  salary: GerrisRoleImportSalaryV1;
  contact: GerrisRoleImportContactV1;
  description: string;
  assessment?: GerrisRoleImportAssessmentV1;
};

export type GerrisRoleImportV1 = {
  schema: typeof GERRIS_ROLE_IMPORT_SCHEMA;
  indeed_profile_status: "available" | "missing";
  candidates: GerrisRoleImportCandidateV1[];
};

export type RoleDuplicateMatch = {
  applicationId: string;
  reason: "provider_job_id" | "exact_url" | "employer_title" | "description";
};

export type RoleImportCandidatePreview = {
  id: string;
  candidate: GerrisRoleImportCandidateV1;
  errors: string[];
  warnings: string[];
  completenessPercent: number;
  originalLinkStatus: "missing" | "provider_link" | "claimed_original";
  duplicate: RoleDuplicateMatch | null;
  hardExclusionMatches: string[];
};

export type RoleImportPreview = {
  indeedProfileStatus: "available" | "missing" | null;
  candidates: RoleImportCandidatePreview[];
  errors: string[];
};

const PROVIDERS = new Set<JobDiscoveryProvider>([
  "indeed",
  "jooble",
  "linkedin",
  "employer",
  "recruiter",
  "manual",
]);

const REQUIRED_CANDIDATE_FIELDS = [
  "provider",
  "provider_job_id",
  "discovery_url",
  "source_url",
  "captured_at",
  "checked_at",
  "employer",
  "title",
  "location",
  "published_at",
  "contract_type",
  "salary",
  "contact",
  "description",
] as const;

const PROHIBITED_PRIVACY_FIELDS = new Set([
  "applicant",
  "applicant_contact",
  "applicant_email",
  "applicant_name",
  "applicant_phone",
  "application_history",
  "application_status_history",
  "candidate",
  "candidate_contact",
  "candidate_email",
  "candidate_name",
  "candidate_phone",
  "contact_information",
  "cover_letter",
  "cv",
  "education_history",
  "indeed_profile",
  "job_seeker_profile",
  "personal_data",
  "personal_details",
  "profile",
  "profile_summary",
  "resume",
  "user_contact",
  "user_email",
  "user_name",
  "user_phone",
  "work_experience",
]);

function text(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function overlong(value: unknown, maximum: number): boolean {
  return typeof value === "string" && value.trim().length > maximum;
}

function dateTime(value: unknown): string | null {
  const candidate = text(value, 100);
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : null;
}

function dateOnly(value: unknown): string | null {
  const candidate = text(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  const parsed = new Date(`${candidate}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === candidate
    ? candidate
    : null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function privacyFields(value: unknown, path = ""): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => privacyFields(item, `${path}[${index}]`));
  }
  const found: string[] = [];
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLocaleLowerCase("en-US");
    const nextPath = path ? `${path}.${key}` : key;
    if (PROHIBITED_PRIVACY_FIELDS.has(normalized)) found.push(nextPath);
    found.push(...privacyFields(nested, nextPath));
  }
  return found;
}

function providerFromUrl(value: string): JobDiscoveryProvider {
  try {
    const host = new URL(value).hostname.toLocaleLowerCase("en-US");
    if (host === "indeed.com" || host.startsWith("indeed.") || host.includes(".indeed.")) {
      return "indeed";
    }
    if (host === "jooble.org" || host.endsWith(".jooble.org")) return "jooble";
    if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return "linkedin";
    return "manual";
  } catch {
    return "manual";
  }
}

function isProviderUrl(value: string): boolean {
  return ["indeed", "jooble", "linkedin"].includes(providerFromUrl(value));
}

function salaryValue(value: unknown): GerrisRoleImportSalaryV1 {
  if (typeof value === "string") {
    return {
      value: text(value, 1_000),
      basis: value.trim() ? "listed" : "unknown",
    };
  }
  const candidate = objectValue(value) ?? {};
  const basis = ["listed", "not_listed", "market_estimate", "unknown"].includes(
    text(candidate.basis, 40),
  )
    ? (text(candidate.basis, 40) as SalaryBasis)
    : "unknown";
  return { value: text(candidate.value, 1_000), basis };
}

function contactValue(value: unknown): GerrisRoleImportContactV1 {
  const candidate = objectValue(value) ?? {};
  return {
    name: text(candidate.name, 300),
    email: text(candidate.email, 320),
    phone: text(candidate.phone, 200),
  };
}

function assessmentValue(value: unknown): GerrisRoleImportAssessmentV1 | undefined {
  const candidate = objectValue(value);
  if (!candidate) return undefined;
  const recommendation = text(candidate.recommendation, 40);
  if (!["apply", "maybe", "skip"].includes(recommendation)) return undefined;
  const bounded = (input: unknown, maximum: number): number | null =>
    typeof input === "number" && Number.isFinite(input)
      ? Math.min(maximum, Math.max(0, input))
      : null;
  const evidenceUrls = Array.isArray(candidate.evidence_urls)
    ? candidate.evidence_urls
        .map(safePublicUrl)
        .filter(Boolean)
        .slice(0, 12)
    : [];
  return {
    recommendation: recommendation as GerrisRoleImportAssessmentV1["recommendation"],
    fit: bounded(candidate.fit, 10),
    shortlist_chance: bounded(candidate.shortlist_chance, 100),
    main_match: text(candidate.main_match, 2_000),
    main_risk: text(candidate.main_risk, 2_000),
    cv_angle: text(candidate.cv_angle, 2_000),
    evidence_urls: evidenceUrls,
  };
}

function normalizeCandidate(
  value: unknown,
): { candidate: GerrisRoleImportCandidateV1; errors: string[]; warnings: string[] } {
  const raw = objectValue(value) ?? {};
  const errors: string[] = [];
  const warnings: string[] = [];
  const missingFields = REQUIRED_CANDIDATE_FIELDS.filter((field) => !(field in raw));
  if (missingFields.length) {
    errors.push(`Pflichtfelder fehlen: ${missingFields.join(", ")}`);
  }
  const provider = text(raw.provider, 40) as JobDiscoveryProvider;
  if (!PROVIDERS.has(provider)) errors.push("Unbekannter Provider.");
  if (overlong(raw.discovery_url, 2_000)) errors.push("discovery_url ist zu lang.");
  if (overlong(raw.source_url, 2_000)) errors.push("source_url ist zu lang.");
  const discoveryUrl = safePublicUrl(raw.discovery_url);
  const sourceUrl = safePublicUrl(raw.source_url);
  if (!discoveryUrl) errors.push("discovery_url muss eine gültige HTTP(S)-URL sein.");
  if (
    discoveryUrl &&
    ["indeed", "jooble", "linkedin"].includes(provider) &&
    providerFromUrl(discoveryUrl) !== provider
  ) {
    errors.push("provider passt nicht zur discovery_url.");
  }
  if (raw.source_url && !sourceUrl) {
    errors.push("source_url muss leer oder eine gültige HTTP(S)-URL sein.");
  }
  const capturedAt = dateTime(raw.captured_at);
  const checkedAt = raw.checked_at ? dateTime(raw.checked_at) : null;
  if (!capturedAt) errors.push("captured_at muss ein gültiger Zeitpunkt sein.");
  if (raw.checked_at && !checkedAt) errors.push("checked_at ist ungültig.");
  const publishedAt = raw.published_at ? dateOnly(raw.published_at) : null;
  if (raw.published_at && !publishedAt) {
    errors.push("published_at muss YYYY-MM-DD oder leer sein.");
  }
  const limits: Array<[unknown, number, string]> = [
    [raw.provider_job_id, 300, "provider_job_id"],
    [raw.employer, 300, "employer"],
    [raw.title, 300, "title"],
    [raw.location, 500, "location"],
    [raw.contract_type, 500, "contract_type"],
    [raw.description, 30_000, "description"],
  ];
  for (const [candidate, maximum, field] of limits) {
    if (overlong(candidate, maximum)) errors.push(`${field} ist zu lang.`);
  }
  const salary = salaryValue(raw.salary);
  const salaryRaw = objectValue(raw.salary);
  if (!salaryRaw) errors.push("salary muss ein Objekt mit value und basis sein.");
  if (overlong(objectValue(raw.salary)?.value, 1_000)) errors.push("salary.value ist zu lang.");
  if (salary.basis === "not_listed" && salary.value) {
    errors.push("salary.value muss bei basis not_listed leer sein.");
  }
  if (["listed", "market_estimate"].includes(salary.basis) && !salary.value) {
    warnings.push("salary.value fehlt für die angegebene Gehaltsbasis.");
  }
  const contact = contactValue(raw.contact);
  const contactRaw = objectValue(raw.contact);
  if (!contactRaw) {
    errors.push("contact muss ein Objekt mit name, email und phone sein.");
  } else {
    if (overlong(contactRaw.name, 300)) errors.push("contact.name ist zu lang.");
    if (overlong(contactRaw.email, 320)) errors.push("contact.email ist zu lang.");
    if (overlong(contactRaw.phone, 200)) errors.push("contact.phone ist zu lang.");
  }
  const assessmentRaw = objectValue(raw.assessment);
  if (raw.assessment && !assessmentRaw) {
    errors.push("assessment muss ein Objekt sein.");
  }
  if (
    assessmentRaw &&
    !["apply", "maybe", "skip"].includes(text(assessmentRaw.recommendation, 40))
  ) {
    errors.push("assessment.recommendation muss apply, maybe oder skip sein.");
  }
  if (Array.isArray(assessmentRaw?.evidence_urls)) {
    if (
      assessmentRaw.evidence_urls.some(
        (url) => typeof url !== "string" || !safePublicUrl(url),
      )
    ) {
      errors.push("assessment.evidence_urls enthält eine ungültige HTTP(S)-URL.");
    }
  }
  const candidate: GerrisRoleImportCandidateV1 = {
    provider: PROVIDERS.has(provider) ? provider : "manual",
    provider_job_id: text(raw.provider_job_id, 300) || null,
    discovery_url: discoveryUrl,
    source_url: sourceUrl || null,
    captured_at: capturedAt ?? new Date().toISOString(),
    checked_at: checkedAt,
    employer: text(raw.employer, 300),
    title: text(raw.title, 300),
    location: text(raw.location, 500),
    published_at: publishedAt,
    contract_type: text(raw.contract_type, 500),
    salary,
    contact,
    description: text(raw.description, 30_000),
    assessment: assessmentValue(raw.assessment),
  };
  if (!candidate.employer) warnings.push("Arbeitgeber fehlt.");
  if (!candidate.title) warnings.push("Stellentitel fehlt.");
  if (!candidate.location) warnings.push("Arbeitsort fehlt.");
  if (!candidate.source_url) warnings.push("Verifizierter Original-Link fehlt.");
  if (candidate.source_url && isProviderUrl(candidate.source_url)) {
    warnings.push("source_url verweist auf einen Provider und gilt nicht als Original-Link.");
  }
  if (!candidate.description) warnings.push("Anzeigentext fehlt.");
  return { candidate, errors, warnings };
}

function canonicalUrl(value: string | null | undefined): string {
  const safe = safePublicUrl(value);
  if (!safe) return "";
  const url = new URL(safe);
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_|trk|tracking|ref|source)/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.toString();
}

function descriptionTokens(value: string): Set<string> {
  return new Set(
    normalizedRoleIdentity(value)
      .split(" ")
      .filter((token) => token.length >= 4)
      .slice(0, 600),
  );
}

export function descriptionSimilarity(left: string, right: string): number {
  const a = descriptionTokens(left);
  const b = descriptionTokens(right);
  if (a.size < 12 || b.size < 12) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

export function findRoleDuplicate(
  candidate: GerrisRoleImportCandidateV1,
  applications: readonly ApplicationProcess[],
): RoleDuplicateMatch | null {
  if (candidate.provider_job_id) {
    const match = applications.find((application) =>
      application.discoverySources?.some(
        (source) =>
          source.provider === candidate.provider &&
          source.providerJobId === candidate.provider_job_id,
      ),
    );
    if (match) return { applicationId: match.id, reason: "provider_job_id" };
  }
  const urls = [candidate.discovery_url, candidate.source_url]
    .map(canonicalUrl)
    .filter(Boolean);
  const urlMatch = applications.find((application) => {
    const known = [
      application.sourceUrl,
      ...(application.discoverySources ?? []).map((source) => source.url),
    ]
      .map(canonicalUrl)
      .filter(Boolean);
    return urls.some((url) => known.includes(url));
  });
  if (urlMatch) return { applicationId: urlMatch.id, reason: "exact_url" };
  const employer = normalizedRoleIdentity(candidate.employer);
  const title = normalizedRoleIdentity(candidate.title);
  if (employer && title) {
    const identityMatch = applications.find(
      (application) =>
        normalizedRoleIdentity(application.company) === employer &&
        normalizedRoleIdentity(application.jobTitle) === title,
    );
    if (identityMatch) {
      return { applicationId: identityMatch.id, reason: "employer_title" };
    }
  }
  if (candidate.description) {
    const descriptionMatch = applications.find(
      (application) =>
        descriptionSimilarity(candidate.description, application.jobDescriptionText) >= 0.72,
    );
    if (descriptionMatch) {
      return { applicationId: descriptionMatch.id, reason: "description" };
    }
  }
  return null;
}

function previewCandidate(
  normalized: ReturnType<typeof normalizeCandidate>,
  index: number,
  applications: readonly ApplicationProcess[],
  profile: JobSearchProfile,
): RoleImportCandidatePreview {
  const { candidate } = normalized;
  const completeFields = [
    candidate.employer,
    candidate.title,
    candidate.location,
    candidate.description,
    candidate.contract_type,
    candidate.salary.basis !== "unknown" ? candidate.salary.basis : "",
    candidate.source_url ?? "",
  ].filter(Boolean).length;
  const originalLinkStatus = !candidate.source_url
    ? "missing"
    : isProviderUrl(candidate.source_url)
      ? "provider_link"
      : "claimed_original";
  return {
    id: `import-${index + 1}-${contentFingerprint({
      employer: candidate.employer,
      title: candidate.title,
      location: candidate.location,
      description: candidate.description,
    })}`,
    candidate,
    errors: normalized.errors,
    warnings: normalized.warnings,
    completenessPercent: Math.round((completeFields / 7) * 100),
    originalLinkStatus,
    duplicate: findRoleDuplicate(candidate, applications),
    hardExclusionMatches: hardExclusionMatches(profile, {
      employer: candidate.employer,
      title: candidate.title,
      contractType: candidate.contract_type,
      description: candidate.description,
    }),
  };
}

function urlOnlyPreview(
  urls: string[],
  applications: readonly ApplicationProcess[],
  profile: JobSearchProfile,
  now: string,
): RoleImportPreview {
  const comparisonApplications = [...applications];
  const candidates = urls
    .slice(0, MAX_ROLE_IMPORT_CANDIDATES)
    .map((url, index) => {
      const preview = previewCandidate(
        normalizeCandidate(
          {
            provider: providerFromUrl(url),
            provider_job_id: null,
            discovery_url: url,
            source_url: null,
            captured_at: now,
            checked_at: null,
            employer: "",
            title: "",
            location: "",
            published_at: null,
            contract_type: "",
            salary: { value: "", basis: "unknown" },
            contact: { name: "", email: "", phone: "" },
            description: "",
          },
        ),
        index,
        comparisonApplications,
        profile,
      );
      if (!preview.errors.length) {
        comparisonApplications.push(applicationFromImportedCandidate(preview, now));
      }
      return preview;
    });
  return {
    indeedProfileStatus: null,
    candidates,
    errors:
      urls.length > MAX_ROLE_IMPORT_CANDIDATES
        ? [`Maximal ${MAX_ROLE_IMPORT_CANDIDATES} URLs pro Import.`]
        : [],
  };
}

export function stageRoleImport(
  raw: string,
  applications: readonly ApplicationProcess[],
  profile: JobSearchProfile,
  now = new Date().toISOString(),
): RoleImportPreview {
  if (new TextEncoder().encode(raw).byteLength > MAX_ROLE_IMPORT_BYTES) {
    return {
      indeedProfileStatus: null,
      candidates: [],
      errors: ["Der Import ist größer als 500 KB."],
    };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      indeedProfileStatus: null,
      candidates: [],
      errors: ["Bitte JSON oder Stellen-URLs einfügen."],
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const lines = trimmed
      .split(/[\r\n,]+/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length && lines.every((line) => Boolean(safePublicUrl(line)))) {
      return urlOnlyPreview(lines.map(safePublicUrl), applications, profile, now);
    }
    return {
      indeedProfileStatus: null,
      candidates: [],
      errors: ["Das JSON ist ungültig; alternativ je Zeile eine HTTP(S)-URL einfügen."],
    };
  }
  const privacy = privacyFields(parsed);
  if (privacy.length) {
    return {
      indeedProfileStatus: null,
      candidates: [],
      errors: [
        `Nicht erlaubte Kandidaten- oder Bewerbungsdaten: ${privacy.slice(0, 8).join(", ")}`,
      ],
    };
  }
  const root = objectValue(parsed);
  if (!root || root.schema !== GERRIS_ROLE_IMPORT_SCHEMA) {
    return {
      indeedProfileStatus: null,
      candidates: [],
      errors: [`schema muss ${GERRIS_ROLE_IMPORT_SCHEMA} sein.`],
    };
  }
  const profileStatus = text(root.indeed_profile_status, 40);
  const errors: string[] = [];
  if (!["available", "missing"].includes(profileStatus)) {
    errors.push("indeed_profile_status muss available oder missing sein.");
  }
  if (!Array.isArray(root.candidates)) errors.push("candidates muss eine Liste sein.");
  const values = Array.isArray(root.candidates) ? root.candidates : [];
  if (values.length > MAX_ROLE_IMPORT_CANDIDATES) {
    errors.push(`Maximal ${MAX_ROLE_IMPORT_CANDIDATES} Kandidaten pro Import.`);
  }
  const comparisonApplications = [...applications];
  const candidates = values
    .slice(0, MAX_ROLE_IMPORT_CANDIDATES)
    .map((value, index) => {
      const preview = previewCandidate(
        normalizeCandidate(value),
        index,
        comparisonApplications,
        profile,
      );
      if (!preview.errors.length) {
        comparisonApplications.push(applicationFromImportedCandidate(preview, now));
      }
      return preview;
    });
  return {
    indeedProfileStatus: ["available", "missing"].includes(profileStatus)
      ? (profileStatus as RoleImportPreview["indeedProfileStatus"])
      : null,
    candidates,
    errors,
  };
}

function importedAssessment(
  candidate: GerrisRoleImportCandidateV1,
  exclusions: string[],
  now: string,
): RoleAssessment | null {
  if (!candidate.assessment && !exclusions.length) return null;
  const assessment = candidate.assessment;
  return {
    recommendation: exclusions.length
      ? "skip"
      : assessment?.recommendation ?? "maybe",
    fitScore: assessment?.fit ?? null,
    shortlistChancePercent: assessment?.shortlist_chance ?? null,
    mainMatch: assessment?.main_match ?? "",
    mainRisk:
      exclusions.length > 0
        ? `Harter Ausschluss: ${exclusions.join(" · ")}`
        : assessment?.main_risk ?? "",
    cvAngle: assessment?.cv_angle ?? "",
    evidenceUrls: assessment?.evidence_urls ?? [],
    hardExclusionMatches: exclusions,
    importedAt: now,
    approvedAt: null,
  };
}

function candidateSources(candidate: GerrisRoleImportCandidateV1): JobDiscoverySource[] {
  const sources: JobDiscoverySource[] = [
    {
      provider: candidate.provider,
      providerJobId: candidate.provider_job_id,
      url: candidate.discovery_url,
      sourceKind: "discovery",
      capturedAt: candidate.captured_at,
      checkedAt: candidate.checked_at,
    },
  ];
  if (candidate.source_url && candidate.source_url !== candidate.discovery_url) {
    sources.push({
      provider: candidate.provider,
      providerJobId: candidate.provider_job_id,
      url: candidate.source_url,
      sourceKind: "claimed_original",
      capturedAt: candidate.captured_at,
      checkedAt: candidate.checked_at,
    });
  }
  return normalizeDiscoverySources(sources);
}

function uniqueId(): string {
  const id = globalThis.crypto?.randomUUID?.();
  return id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function applicationFromImportedCandidate(
  preview: RoleImportCandidatePreview,
  now = new Date().toISOString(),
): ApplicationProcess {
  const candidate = preview.candidate;
  const application = createEmptyApplication(`application-import-${uniqueId()}`);
  return {
    ...application,
    researchRank: null,
    researchTier: "own",
    shortlisted: false,
    jobTitle: candidate.title || "Rolle noch prüfen",
    company: candidate.employer || "Arbeitgeber noch prüfen",
    location: candidate.location,
    publishedTerms: candidate.contract_type,
    compensation:
      candidate.salary.basis === "market_estimate" ? "" : candidate.salary.value,
    sourceUrl: "",
    sourceVerifiedAt: "",
    discoverySources: candidateSources(candidate),
    checkedAt: "",
    publishedAt: candidate.published_at,
    contractType: candidate.contract_type,
    salaryBasis: candidate.salary.basis,
    marketSalaryEstimate:
      candidate.salary.basis === "market_estimate" ? candidate.salary.value : "",
    verificationStatus: "unverified",
    contentFingerprint: contentFingerprint({
      employer: candidate.employer,
      title: candidate.title,
      location: candidate.location,
      description: candidate.description,
    }),
    recommendation: "undecided",
    assessment: importedAssessment(candidate, preview.hardExclusionMatches, now),
    warmPath: null,
    status: "research",
    contactPerson: candidate.contact.name,
    contactEmail: candidate.contact.email,
    contactPhone: candidate.contact.phone,
    contacts:
      candidate.contact.name || candidate.contact.email || candidate.contact.phone
        ? [
            {
              id: `contact-import-${uniqueId()}`,
              kind: "general",
              name: candidate.contact.name,
              email: candidate.contact.email,
              phone: candidate.contact.phone,
              note: "Öffentlicher Kontakt aus dem Stellentreffer",
            },
          ]
        : [],
    jobDescriptionText: candidate.description,
    tags: [`Quelle: ${candidate.provider}`],
    nextStep: "Originalanzeige öffnen und verifizieren",
    nextStepAt: null,
    activities: [
      {
        id: `activity-vacancy-added-${uniqueId()}`,
        type: "vacancy_added",
        occurredAt: now,
        note: `Aus ${candidate.provider} vorgemerkt`,
      },
    ],
  };
}

function mergeCandidateIntoApplication(
  application: ApplicationProcess,
  preview: RoleImportCandidatePreview,
  now: string,
): ApplicationProcess {
  const candidate = preview.candidate;
  const sources = normalizeDiscoverySources([
    ...(application.discoverySources ?? []),
    ...candidateSources(candidate),
  ]);
  const placeholderTitle = ["", "Neue Bewerbung", "Rolle noch prüfen"].includes(
    application.jobTitle,
  );
  const placeholderEmployer = ["", "Arbeitgeber noch prüfen"].includes(
    application.company,
  );
  return {
    ...application,
    discoverySources: sources,
    jobTitle: placeholderTitle && candidate.title ? candidate.title : application.jobTitle,
    company:
      placeholderEmployer && candidate.employer
        ? candidate.employer
        : application.company,
    location: application.location || candidate.location,
    publishedAt: application.publishedAt ?? candidate.published_at,
    contractType: application.contractType || candidate.contract_type,
    compensation:
      application.compensation ||
      (candidate.salary.basis === "market_estimate" ? "" : candidate.salary.value),
    salaryBasis:
      application.salaryBasis === "unknown"
        ? candidate.salary.basis
        : application.salaryBasis,
    marketSalaryEstimate:
      application.marketSalaryEstimate ||
      (candidate.salary.basis === "market_estimate" ? candidate.salary.value : ""),
    contactPerson: application.contactPerson || candidate.contact.name,
    contactEmail: application.contactEmail || candidate.contact.email,
    contactPhone: application.contactPhone || candidate.contact.phone,
    jobDescriptionText: application.jobDescriptionText || candidate.description,
    contentFingerprint:
      application.contentFingerprint ||
      contentFingerprint({
        employer: candidate.employer,
        title: candidate.title,
        location: candidate.location,
        description: candidate.description,
      }),
    assessment:
      application.assessment?.approvedAt
        ? application.assessment
        : importedAssessment(candidate, preview.hardExclusionMatches, now) ??
          application.assessment,
  };
}

export function acceptRoleImportCandidates(
  applications: readonly ApplicationProcess[],
  previews: readonly RoleImportCandidatePreview[],
  now = new Date().toISOString(),
): { applications: ApplicationProcess[]; createdIds: string[]; mergedIds: string[] } {
  const next = [...applications];
  const createdIds: string[] = [];
  const mergedIds: string[] = [];
  for (const preview of previews) {
    if (preview.errors.length) continue;
    const duplicate = findRoleDuplicate(preview.candidate, next);
    if (duplicate) {
      const index = next.findIndex((application) => application.id === duplicate.applicationId);
      if (index >= 0) {
        next[index] = mergeCandidateIntoApplication(next[index], preview, now);
        mergedIds.push(next[index].id);
      }
      continue;
    }
    const created = applicationFromImportedCandidate(preview, now);
    next.push(created);
    createdIds.push(created.id);
  }
  return {
    applications: next,
    createdIds,
    mergedIds: [...new Set(mergedIds)],
  };
}

function lines(values: readonly string[]): string {
  return values.length ? values.join("; ") : "keine";
}

export function buildRoleSearchPrompt(
  profile: JobSearchProfile,
  includeJooble: boolean,
): string {
  const locations = profile.locations.length ? profile.locations : ["Deutschland"];
  const searchRuns = profile.targetTracks.flatMap((track) =>
    locations.map((location) => `${track} · ${location}`),
  );
  return [
    "Führe eine datensparsame, kostenlose Stellenentdeckung für Gerris Kompass durch.",
    "Nutze Indeed als Discovery-Quelle und sein eigenes verbundenes Profil. Kopiere keine Profildaten in die Antwort.",
    includeJooble
      ? "Nutze zusätzlich Jooble als Discovery-Schicht und kennzeichne mögliche Dubletten."
      : "Nutze Jooble in diesem Lauf nicht.",
    "LinkedIn darf erst nach der Rollenprüfung für namentlich bekannte Personen und manuelle Warm-path-Hinweise dienen.",
    "Keine Premiumfunktion, kein Scraping, keine Bewerbung und keine Nachricht ausführen.",
    "Behandle jeden folgenden Suchlauf getrennt und führe Treffer erst im Ergebnis zusammen:",
    ...searchRuns.map((run, index) => `${index + 1}. ${run}`),
    `Remote-Regel: ${profile.remoteAllowed ? "Remote und Hybrid einbeziehen" : "nicht zusätzlich nach Remote suchen"}`,
    `Beschäftigung: ${lines(profile.employmentTypes)}`,
    `Gehaltsuntergrenze: ${profile.minimumSalaryAnnual ? `${profile.minimumSalaryAnnual} EUR brutto/Jahr` : "nicht gesetzt"}`,
    `Ausschluss Arbeitgeber: ${lines(profile.hardExclusions.employers)}`,
    `Ausschluss Titel: ${lines(profile.hardExclusions.titles)}`,
    `Ausschluss Stichwörter: ${lines(profile.hardExclusions.keywords)}`,
    `Ausschluss Vertragsarten: ${lines(profile.hardExclusions.contractTypes)}`,
    `Gib höchstens ${MAX_ROLE_IMPORT_CANDIDATES} Kandidaten als reines JSON im Vertrag ${GERRIS_ROLE_IMPORT_SCHEMA} zurück.`,
    "Setze indeed_profile_status auf available oder missing. Übernimm niemals Kontaktdaten oder Bewerbungshistorie der kandidierenden Person.",
    "Prüfe die harten Ausschlüsse vor jeder Fit-Einschätzung; bei einem Treffer muss assessment.recommendation skip sein.",
    "source_url darf nur die exakte Arbeitgeber-, ATS- oder autorisierte Recruiteranzeige enthalten; sonst null. Providerlinks gehören ausschließlich in discovery_url.",
    "Für salary verwende {value, basis} mit listed, not_listed, market_estimate oder unknown. Schätzungen niemals als veröffentlicht kennzeichnen.",
    "Jeder Kandidat benötigt die Felder provider, provider_job_id, discovery_url, source_url, captured_at, checked_at, employer, title, location, published_at, contract_type, salary, contact und description; assessment ist optional.",
  ].join("\n");
}
