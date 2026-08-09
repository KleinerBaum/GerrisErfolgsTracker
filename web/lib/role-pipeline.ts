import type {
  ApplicationProcess,
  JobDiscoverySource,
  JobSearchProfile,
  RoleAssessment,
  RoleVerificationStatus,
  RoleWarmPath,
  SalaryBasis,
  VacancyResearch,
} from "./types";

export const DEFAULT_JOB_SEARCH_TRACKS = [
  "AI App Development",
  "Digitalisierung und Projektmanagement im öffentlichen Umfeld",
  "Beratung und Sales",
] as const;

export const ROLE_VERIFICATION_LABELS: Record<RoleVerificationStatus, string> = {
  unverified: "Entdeckt",
  verified: "Geprüft",
  stale: "Veraltet",
  closed: "Geschlossen",
};

export const SALARY_BASIS_LABELS: Record<SalaryBasis, string> = {
  listed: "Veröffentlicht",
  not_listed: "Nicht veröffentlicht",
  market_estimate: "Marktschätzung",
  unknown: "Noch offen",
};

const OPEN_STATUS_PATTERN = /\b(offen|aktiv|veröffentlicht|online|bewerbung(?:en)? möglich)\b/i;
const CLOSED_STATUS_PATTERN =
  /\b(geschlossen|abgelaufen|beendet|besetzt|offline|zurückgezogen|nicht mehr verfügbar)\b/i;

function text(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function stringList(value: unknown, maximumItems: number, maximumLength = 200): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => text(item, maximumLength))
        .filter(Boolean),
    ),
  ].slice(0, maximumItems);
}

export function safePublicUrl(value: unknown): string {
  const raw = text(value, 2_000);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    if (url.username || url.password) return "";
    const host = url.hostname
      .toLocaleLowerCase("en-US")
      .replace(/^\[|\]$/g, "");
    if (
      !host ||
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host === "::1" ||
      (host.includes(":") &&
        (host.startsWith("fc") ||
          host.startsWith("fd") ||
          host.startsWith("fe80:"))) ||
      /^(?:0|10|127)\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(?:1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return "";
    }
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

export function normalizedRoleIdentity(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-DE")
    .replace(/\b(?:gmbh|ag|se|kg|mbh|inc|ltd|llc)\b/g, " ")
    .replace(/(?:m|w|d)\s*[|/]\s*(?:m|w|d)(?:\s*[|/]\s*(?:m|w|d))?/g, " ")
    .replace(/\b(?:remote|hybrid|homeoffice)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function contentFingerprint(input: {
  employer: string;
  title: string;
  location?: string;
  description?: string;
}): string {
  const source = [
    normalizedRoleIdentity(input.employer),
    normalizedRoleIdentity(input.title),
    normalizedRoleIdentity(input.location ?? ""),
    normalizedRoleIdentity(input.description ?? ""),
  ].join("|");
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `role-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function validDateTime(value: unknown): string | null {
  const candidate = text(value, 100);
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : null;
}

function validDate(value: unknown): string | null {
  const candidate = text(value, 40);
  if (!candidate) return null;
  const match = /^\d{4}-\d{2}-\d{2}$/.exec(candidate);
  return match && Number.isFinite(Date.parse(`${candidate}T12:00:00Z`))
    ? candidate
    : null;
}

export function defaultJobSearchProfile(
  passportTracks: readonly string[] | undefined,
  now = new Date().toISOString(),
): JobSearchProfile {
  const tracks = stringList(passportTracks, 8, 240);
  return {
    schemaVersion: 1,
    targetTracks: tracks.length ? tracks : [...DEFAULT_JOB_SEARCH_TRACKS],
    locations: ["Deutschland"],
    remoteAllowed: true,
    employmentTypes: ["Unbefristet", "Vollzeit"],
    minimumSalaryAnnual: null,
    salaryCurrency: "EUR",
    hardExclusions: {
      employers: [],
      titles: [],
      keywords: [],
      contractTypes: [],
    },
    reviewedAt: null,
    updatedAt: now,
  };
}

export function normalizeJobSearchProfile(
  value: unknown,
  passportTracks?: readonly string[],
  now = new Date().toISOString(),
): JobSearchProfile {
  const fallback = defaultJobSearchProfile(passportTracks, now);
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<JobSearchProfile>;
  const exclusions: Partial<JobSearchProfile["hardExclusions"]> =
    candidate.hardExclusions && typeof candidate.hardExclusions === "object"
      ? candidate.hardExclusions
      : {};
  const minimumSalaryAnnual =
    typeof candidate.minimumSalaryAnnual === "number" &&
    Number.isFinite(candidate.minimumSalaryAnnual) &&
    candidate.minimumSalaryAnnual > 0
      ? Math.min(1_000_000, Math.round(candidate.minimumSalaryAnnual))
      : null;
  const targetTracks = stringList(candidate.targetTracks, 8, 240);
  const locations = stringList(candidate.locations, 12, 160);
  const employmentTypes = stringList(candidate.employmentTypes, 12, 160);
  return {
    schemaVersion: 1,
    targetTracks: targetTracks.length ? targetTracks : fallback.targetTracks,
    locations: locations.length ? locations : fallback.locations,
    remoteAllowed:
      typeof candidate.remoteAllowed === "boolean"
        ? candidate.remoteAllowed
        : fallback.remoteAllowed,
    employmentTypes: employmentTypes.length
      ? employmentTypes
      : fallback.employmentTypes,
    minimumSalaryAnnual,
    salaryCurrency: "EUR",
    hardExclusions: {
      employers: stringList(exclusions.employers, 40, 200),
      titles: stringList(exclusions.titles, 40, 200),
      keywords: stringList(exclusions.keywords, 80, 160),
      contractTypes: stringList(exclusions.contractTypes, 40, 160),
    },
    reviewedAt: validDateTime(candidate.reviewedAt),
    updatedAt: validDateTime(candidate.updatedAt) ?? now,
  };
}

export function normalizeDiscoverySources(value: unknown): JobDiscoverySource[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .map((item): JobDiscoverySource | null => {
      if (!item || typeof item !== "object") return null;
      const source = item as Partial<JobDiscoverySource>;
      const provider = [
        "indeed",
        "jooble",
        "linkedin",
        "employer",
        "recruiter",
        "manual",
      ].includes(source.provider ?? "")
        ? (source.provider as JobDiscoverySource["provider"])
        : null;
      const url = safePublicUrl(source.url);
      if (!provider || !url) return null;
      const key = `${provider}|${text(source.providerJobId, 300)}|${url}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        provider,
        providerJobId: text(source.providerJobId, 300) || null,
        url,
        sourceKind:
          source.sourceKind === "claimed_original"
            ? "claimed_original"
            : "discovery",
        capturedAt: validDateTime(source.capturedAt) ?? new Date().toISOString(),
        checkedAt: validDateTime(source.checkedAt),
      };
    })
    .filter((item): item is JobDiscoverySource => Boolean(item))
    .slice(0, 20);
}

export function preferredRoleResearchUrl(
  application: Pick<ApplicationProcess, "sourceUrl" | "discoverySources">,
): string {
  const canonical = safePublicUrl(application.sourceUrl);
  if (canonical) return canonical;
  const sources = normalizeDiscoverySources(application.discoverySources);
  const claimed = [...sources]
    .reverse()
    .find((source) => source.sourceKind === "claimed_original");
  return claimed?.url || sources.at(-1)?.url || "";
}

function normalizeAssessment(value: unknown): RoleAssessment | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<RoleAssessment>;
  if (!["apply", "maybe", "skip"].includes(candidate.recommendation ?? "")) {
    return null;
  }
  const boundedNumber = (input: unknown, maximum: number): number | null =>
    typeof input === "number" && Number.isFinite(input)
      ? Math.min(maximum, Math.max(0, input))
      : null;
  return {
    recommendation: candidate.recommendation as RoleAssessment["recommendation"],
    fitScore: boundedNumber(candidate.fitScore, 10),
    shortlistChancePercent: boundedNumber(candidate.shortlistChancePercent, 100),
    mainMatch: text(candidate.mainMatch, 2_000),
    mainRisk: text(candidate.mainRisk, 2_000),
    cvAngle: text(candidate.cvAngle, 2_000),
    evidenceUrls: stringList(candidate.evidenceUrls, 12, 2_000)
      .map(safePublicUrl)
      .filter(Boolean),
    hardExclusionMatches: stringList(candidate.hardExclusionMatches, 20, 300),
    importedAt: validDateTime(candidate.importedAt) ?? new Date().toISOString(),
    approvedAt: validDateTime(candidate.approvedAt),
  };
}

function normalizeWarmPath(value: unknown): RoleWarmPath | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<RoleWarmPath>;
  const normalized: RoleWarmPath = {
    personName: text(candidate.personName, 300),
    personRole: text(candidate.personRole, 300),
    sourceUrl: safePublicUrl(candidate.sourceUrl),
    publicContext: text(candidate.publicContext, 6_000),
    commonContactsNote: text(candidate.commonContactsNote, 4_000),
    commonContactsConfirmedAt: validDateTime(
      candidate.commonContactsConfirmedAt,
    ),
  };
  return Object.values(normalized).some(Boolean) ? normalized : null;
}

export function normalizeApplicationRoleFields(
  application: ApplicationProcess,
): ApplicationProcess {
  const candidate = application as ApplicationProcess &
    Partial<Pick<ApplicationProcess,
      | "discoverySources"
      | "checkedAt"
      | "publishedAt"
      | "contractType"
      | "salaryBasis"
      | "marketSalaryEstimate"
      | "verificationStatus"
      | "contentFingerprint"
      | "recommendation"
      | "assessment"
      | "warmPath"
    >>;
  const checkedAt =
    validDateTime(candidate.checkedAt) ??
    validDateTime(candidate.sourceVerifiedAt) ??
    "";
  const verificationStatus = [
    "unverified",
    "verified",
    "stale",
    "closed",
  ].includes(candidate.verificationStatus ?? "")
    ? (candidate.verificationStatus as RoleVerificationStatus)
    : "unverified";
  const salaryBasis = [
    "listed",
    "not_listed",
    "market_estimate",
    "unknown",
  ].includes(candidate.salaryBasis ?? "")
    ? (candidate.salaryBasis as SalaryBasis)
    : candidate.compensation?.trim()
      ? "listed"
      : "unknown";
  const rawSourceUrl = safePublicUrl(candidate.sourceUrl);
  const researchStatus = candidate.vacancyResearch
    ? verificationStatusFromResearch(candidate.vacancyResearch)
    : "unverified";
  const researchCanonicalUrl = candidate.vacancyResearch
    ? safePublicUrl(candidate.vacancyResearch.canonicalUrl)
    : "";
  const canonicalSourceTrusted = Boolean(
    rawSourceUrl &&
      researchCanonicalUrl === rawSourceUrl &&
      (researchStatus === verificationStatus ||
        (verificationStatus === "stale" && researchStatus === "verified")),
  );
  const initialDiscoverySources = normalizeDiscoverySources(
    candidate.discoverySources,
  );
  const discoverySources = canonicalSourceTrusted || !rawSourceUrl
    ? initialDiscoverySources
    : normalizeDiscoverySources([
        ...initialDiscoverySources,
        {
          provider: "manual",
          providerJobId: null,
          url: rawSourceUrl,
          sourceKind: "claimed_original",
          capturedAt: checkedAt || new Date().toISOString(),
          checkedAt: checkedAt || null,
        },
      ]);
  return {
    ...application,
    sourceUrl: canonicalSourceTrusted ? rawSourceUrl : "",
    discoverySources,
    checkedAt,
    publishedAt: validDate(candidate.publishedAt),
    contractType: text(candidate.contractType, 500),
    salaryBasis,
    marketSalaryEstimate: text(candidate.marketSalaryEstimate, 1_000),
    verificationStatus:
      verificationStatus === "verified" && !canonicalSourceTrusted
        ? "unverified"
        : verificationStatus,
    contentFingerprint:
      text(candidate.contentFingerprint, 200) ||
      contentFingerprint({
        employer: candidate.company ?? "",
        title: candidate.jobTitle ?? "",
        location: candidate.location ?? "",
        description: candidate.jobDescriptionText ?? "",
      }),
    recommendation: ["undecided", "apply", "maybe", "skip"].includes(
      candidate.recommendation ?? "",
    )
      ? (candidate.recommendation as ApplicationProcess["recommendation"])
      : "undecided",
    assessment: normalizeAssessment(candidate.assessment),
    warmPath: normalizeWarmPath(candidate.warmPath),
  };
}

function confirmedClaim(
  research: VacancyResearch | null | undefined,
  factKey: string,
) {
  return [...(research?.adFacts ?? []), ...(research?.enrichment ?? [])].find(
    (claim) =>
      claim.factKey === factKey &&
      ["confirmed", "edited"].includes(claim.decision.status),
  );
}

function claimValue(
  research: VacancyResearch | null | undefined,
  factKey: string,
): string {
  const claim = confirmedClaim(research, factKey);
  return (claim?.decision.value || claim?.value || "").trim();
}

export function verificationStatusFromResearch(
  research: VacancyResearch,
): RoleVerificationStatus {
  if (
    research.retrievalStatus !== "exact_page_accessed" ||
    !safePublicUrl(research.canonicalUrl)
  ) {
    return "unverified";
  }
  const status = claimValue(research, "process.posting_status");
  if (CLOSED_STATUS_PATTERN.test(status)) return "closed";
  return OPEN_STATUS_PATTERN.test(status) ? "verified" : "unverified";
}

export function salaryBasisFromResearch(research: VacancyResearch): SalaryBasis {
  const listed = claimValue(research, "offer.salary");
  if (listed) {
    return /nicht (?:veröffentlicht|genannt|angegeben)|keine angabe/i.test(listed)
      ? "not_listed"
      : "listed";
  }
  return claimValue(research, "market.salary")
    ? "market_estimate"
    : "unknown";
}

export function marketSalaryEstimateFromResearch(
  research: VacancyResearch,
): string {
  return claimValue(research, "market.salary").slice(0, 1_000);
}

export function contractTypeFromResearch(research: VacancyResearch): string {
  return claimValue(research, "offer.contract").slice(0, 500);
}

export function publishedAtFromResearch(research: VacancyResearch): string | null {
  const value = claimValue(research, "process.published_at");
  return validDate(/\b\d{4}-\d{2}-\d{2}\b/.exec(value)?.[0]);
}

export type RoleGate = { allowed: boolean; reasons: string[] };

export function documentGenerationGate(
  application: Pick<
    ApplicationProcess,
    | "sourceUrl"
    | "verificationStatus"
    | "recommendation"
    | "assessment"
    | "vacancyResearch"
  >,
): RoleGate {
  const reasons: string[] = [];
  const sourceUrl = safePublicUrl(application.sourceUrl);
  if (!sourceUrl) {
    reasons.push("Der verifizierte Original-Link fehlt.");
  }
  if (application.verificationStatus !== "verified") {
    reasons.push("Die Anzeige ist nicht als offen und geprüft bestätigt.");
  }
  if (
    !application.vacancyResearch ||
    verificationStatusFromResearch(application.vacancyResearch) !== "verified" ||
    safePublicUrl(application.vacancyResearch.canonicalUrl) !== sourceUrl
  ) {
    reasons.push("Der bestätigte Forschungsstand zur exakten Anzeige fehlt.");
  }
  if (application.recommendation === "undecided") {
    reasons.push("Apply oder Maybe muss sichtbar bestätigt sein.");
  }
  if (application.recommendation === "skip") {
    reasons.push("Die Rolle ist als Skip entschieden.");
  }
  if (application.assessment?.hardExclusionMatches.length) {
    reasons.push("Mindestens ein harter Ausschluss ist aktiv.");
  }
  return { allowed: reasons.length === 0, reasons };
}

export function applyRecommendationGate(
  application: Pick<
    ApplicationProcess,
    | "sourceUrl"
    | "verificationStatus"
    | "assessment"
    | "vacancyResearch"
  >,
): RoleGate {
  const reasons: string[] = [];
  const sourceUrl = safePublicUrl(application.sourceUrl);
  if (!sourceUrl) {
    reasons.push("Der verifizierte Original-Link fehlt.");
  }
  if (application.verificationStatus !== "verified") {
    reasons.push("Die Anzeige ist nicht als offen bestätigt.");
  }
  if (
    !application.vacancyResearch ||
    verificationStatusFromResearch(application.vacancyResearch) !== "verified" ||
    safePublicUrl(application.vacancyResearch.canonicalUrl) !== sourceUrl
  ) {
    reasons.push("Der bestätigte Forschungsstand zur Originalanzeige fehlt.");
  }
  if (application.assessment?.hardExclusionMatches.length) {
    reasons.push("Ein harter Ausschluss erzwingt Skip.");
  }
  return { allowed: reasons.length === 0, reasons };
}

export function hardExclusionMatches(
  profile: JobSearchProfile,
  role: {
    employer: string;
    title: string;
    contractType?: string;
    description?: string;
  },
): string[] {
  const haystacks = {
    employer: normalizedRoleIdentity(role.employer),
    title: normalizedRoleIdentity(role.title),
    contract: normalizedRoleIdentity(role.contractType ?? ""),
    description: normalizedRoleIdentity(role.description ?? ""),
  };
  const matches: string[] = [];
  const matchList = (
    values: readonly string[],
    haystack: string,
    label: string,
  ) => {
    for (const value of values) {
      const needle = normalizedRoleIdentity(value);
      if (needle && haystack.includes(needle)) matches.push(`${label}: ${value}`);
    }
  };
  matchList(profile.hardExclusions.employers, haystacks.employer, "Arbeitgeber");
  matchList(profile.hardExclusions.titles, haystacks.title, "Titel");
  matchList(
    profile.hardExclusions.contractTypes,
    haystacks.contract,
    "Vertragsart",
  );
  matchList(
    profile.hardExclusions.keywords,
    `${haystacks.title} ${haystacks.description}`,
    "Stichwort",
  );
  return [...new Set(matches)];
}
