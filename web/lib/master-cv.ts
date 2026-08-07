import type {
  CareerEvidenceConfidence,
  CareerPassportEvidence,
  CareerPassportSnapshot,
  CareerPassportSource,
  MasterCvContent,
  MasterCvCoverageStats,
  MasterCvLink,
  MasterCvSection,
  MasterCvSectionKind,
} from "./types";

const MAX_SECTIONS = 48;
const MAX_EVIDENCE = 240;
const MAX_SOURCES = 80;
const MAX_LINKS = 40;
const SECTION_KINDS: readonly MasterCvSectionKind[] = [
  "profile",
  "value",
  "experience",
  "projects",
  "skills",
  "education",
  "languages",
  "other",
];
const EXPERIENCE_DATE =
  /^(?:\d{2}[./]\d{4}|\d{4})\s*[-–—]\s*(?:\d{2}[./]\d{4}|\d{4}|heute|aktuell|present)$/i;

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function stringList(value: unknown, limit: number, itemMax = 400): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => text(item, itemMax))
    .filter(Boolean)
    .slice(0, limit);
}

function confidence(value: unknown): CareerEvidenceConfidence {
  return value === "user_confirmed" || value === "externally_corroborated"
    ? value
    : "source_only";
}

export function classifyMasterCvSection(value: string): MasterCvSectionKind {
  const heading = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLocaleLowerCase("de-DE");
  if (/\b(sprachen?|fremdsprachen?|languages?)\b/.test(heading)) {
    return "languages";
  }
  if (
    /\b(berufserfahrung|berufspraxis|beruflicher werdegang|professional experience|work experience|karriereverlauf)\b/.test(
      heading,
    )
  ) {
    return "experience";
  }
  if (/\b(projekte?|fallstudien?|cases?|prototypen?|portfolio)\b/.test(heading)) {
    return "projects";
  }
  if (
    /\b(kompetenz(?:en)?|kompetenzprofil|methoden?|tools?|arbeitsumfeld|arbeitsweise|starken|fachkenntnisse?|technologien?|skills?)\b/.test(
      heading,
    )
  ) {
    return "skills";
  }
  if (
    /\b(ausbildung|weiterbildung|qualifikation(?:en)?|zertifikate?|studium|hochschule|education|certifications?)\b/.test(
      heading,
    )
  ) {
    return "education";
  }
  if (/\b(kurzprofil|berufliches profil|profil|uber mich|about)\b/.test(heading)) {
    return "profile";
  }
  if (
    /\b(ergebnisse?|highlights?|rollen navigator|rollenpassung|schwerpunkte?|mehrwert|wertbeitrag)\b/.test(
      heading,
    )
  ) {
    return "value";
  }
  return "other";
}

function sectionKind(value: unknown, heading: string): MasterCvSectionKind {
  return typeof value === "string" &&
    SECTION_KINDS.includes(value as MasterCvSectionKind)
    ? (value as MasterCvSectionKind)
    : classifyMasterCvSection(heading);
}

function safeLink(value: unknown, index: number): MasterCvLink | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<MasterCvLink>;
  const label = text(candidate.label, 300);
  const rawUrl = text(candidate.url, 2_000);
  if (!label || !rawUrl) return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) {
    return null;
  }
  const kind: MasterCvLink["kind"] =
    url.protocol === "mailto:"
      ? "email"
      : url.protocol === "tel:"
        ? "phone"
        : /linkedin|github|portfolio|streamlit/i.test(`${label} ${rawUrl}`)
          ? "portfolio"
          : "web";
  return {
    id: text(candidate.id, 160) || `link-${index + 1}`,
    label,
    url: rawUrl,
    kind,
  };
}

function meaningfulLines(section: MasterCvSection): string[] {
  return section.content
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[•*-]\s*/, "").trim())
    .filter(Boolean);
}

export function masterCvCoverageStats(
  sections: MasterCvSection[],
  links: MasterCvLink[] = [],
  evidenceItems = 0,
): MasterCvCoverageStats {
  const sectionsByKind = Object.fromEntries(
    SECTION_KINDS.map((kind) => [kind, 0]),
  ) as Record<MasterCvSectionKind, number>;
  for (const section of sections) sectionsByKind[section.kind] += 1;
  const countLines = (kind: MasterCvSectionKind) =>
    sections
      .filter((section) => section.kind === kind)
      .flatMap(meaningfulLines).length;
  const experienceEntries = sections
    .filter((section) => section.kind === "experience")
    .flatMap(meaningfulLines)
    .filter((line) => EXPERIENCE_DATE.test(line)).length;
  return {
    totalWords: sections
      .map((section) => section.content)
      .join(" ")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length,
    evidenceItems,
    experienceEntries,
    projectItems: countLines("projects"),
    skillItems: countLines("skills"),
    educationItems: countLines("education"),
    languageItems: countLines("languages"),
    linkedContacts: links.length,
    sectionsByKind,
  };
}

function normalizeSource(value: unknown): CareerPassportSource | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CareerPassportSource>;
  const sourceId = text(candidate.sourceId, 160);
  const name = text(candidate.name, 300);
  if (!sourceId || !name) return null;
  return {
    sourceId,
    name,
    sourceType: text(candidate.sourceType, 100),
    isPrimary: candidate.isPrimary === true,
    notes: stringList(candidate.notes, 10, 600),
  };
}

function normalizeEvidence(value: unknown): CareerPassportEvidence | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CareerPassportEvidence>;
  const evidenceId = text(candidate.evidenceId, 160);
  const safeWording = text(candidate.safeWording, 4_000);
  if (!evidenceId || !safeWording) return null;
  return {
    evidenceId,
    claim: text(candidate.claim, 1_000),
    safeWording,
    sourceType: text(candidate.sourceType, 100),
    sourceName: text(candidate.sourceName, 300),
    confidence: confidence(candidate.confidence),
    restrictions: stringList(candidate.restrictions, 20, 1_000),
    roleRelevance: stringList(candidate.roleRelevance, 20, 300),
    capturedAt: text(candidate.capturedAt, 80) || null,
  };
}

function normalizePassport(value: unknown): CareerPassportSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CareerPassportSnapshot>;
  const schemaVersion = text(candidate.schemaVersion, 30);
  const profileName = text(candidate.profileName, 240);
  const importedAt = text(candidate.importedAt, 80);
  if (!schemaVersion || !profileName || !importedAt) return null;
  return {
    schemaVersion,
    profileName,
    targetDirections: stringList(candidate.targetDirections, 12, 300),
    sourceDocuments: Array.isArray(candidate.sourceDocuments)
      ? candidate.sourceDocuments
          .map(normalizeSource)
          .filter((item): item is CareerPassportSource => Boolean(item))
          .slice(0, MAX_SOURCES)
      : [],
    evidence: Array.isArray(candidate.evidence)
      ? candidate.evidence
          .map(normalizeEvidence)
          .filter((item): item is CareerPassportEvidence => Boolean(item))
          .slice(0, MAX_EVIDENCE)
      : [],
    documentVersionStatus:
      text(candidate.documentVersionStatus, 80) || null,
    importedAt,
  };
}

function normalizeSection(value: unknown, index: number): MasterCvSection | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<MasterCvSection>;
  const heading = text(candidate.heading, 180);
  const content = text(candidate.content, 30_000);
  if (!heading || !content) return null;
  return {
    id: text(candidate.id, 160) || `section-${index + 1}`,
    heading,
    content,
    kind: sectionKind(candidate.kind, heading),
  };
}

export function normalizeMasterCvContent(value: unknown): MasterCvContent | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<MasterCvContent>;
  const passport = normalizePassport(candidate.passport);
  const sourceDocumentId = text(candidate.sourceDocumentId, 200);
  const passportDocumentId = text(candidate.passportDocumentId, 200) || null;
  const name = text(candidate.name, 240);
  const importedAt = text(candidate.importedAt, 80);
  const schemaVersion = (candidate as { schemaVersion?: unknown }).schemaVersion;
  if (
    (schemaVersion !== 1 && schemaVersion !== 2) ||
    !passport ||
    !sourceDocumentId ||
    !name ||
    !importedAt
  ) {
    return null;
  }
  const sections = Array.isArray(candidate.sections)
    ? candidate.sections
        .map(normalizeSection)
        .filter((item): item is MasterCvSection => Boolean(item))
        .slice(0, MAX_SECTIONS)
    : [];
  if (!sections.length) return null;
  const links = Array.isArray(candidate.links)
    ? candidate.links
        .map(safeLink)
        .filter((item): item is MasterCvLink => Boolean(item))
        .slice(0, MAX_LINKS)
    : [];
  return {
    schemaVersion: 2,
    sourceDocumentId,
    passportDocumentId,
    name,
    headline: text(candidate.headline, 400),
    subheadline: text(candidate.subheadline, 500),
    contactLine: text(candidate.contactLine, 600),
    language: text(candidate.language, 30) || "en",
    sections,
    links,
    sourceFingerprint:
      text(candidate.sourceFingerprint, 200) ||
      `legacy-unverified:${sourceDocumentId}`,
    coverage: masterCvCoverageStats(
      sections,
      links,
      passport.evidence.length,
    ),
    passport,
    importedAt,
    updatedAt: text(candidate.updatedAt, 80) || importedAt,
    editRevision:
      typeof candidate.editRevision === "number" &&
      Number.isSafeInteger(candidate.editRevision) &&
      candidate.editRevision >= 0
        ? candidate.editRevision
        : 0,
  };
}

export function masterCvToPlainText(masterCv: MasterCvContent): string {
  const isGerman = masterCv.language.toLowerCase().startsWith("de");
  const confidenceLabels: Record<CareerEvidenceConfidence, string> = isGerman
    ? {
        source_only: "aus Quelle übernommen",
        user_confirmed: "vom Nutzer bestätigt",
        externally_corroborated: "extern belegt",
      }
    : {
        source_only: "source only",
        user_confirmed: "user confirmed",
        externally_corroborated: "externally corroborated",
      };
  const profile = [
    masterCv.name,
    masterCv.headline,
    masterCv.subheadline,
    masterCv.contactLine,
  ].filter(Boolean);
  const sections = masterCv.sections.flatMap((section) => [
    section.heading.toUpperCase(),
    section.content,
  ]);
  const links = masterCv.links.map((link) => `${link.label}: ${link.url}`);
  const evidence = masterCv.passport.evidence.flatMap((item) => {
    const restrictions = item.restrictions.length
      ? `${isGerman ? "Einschränkungen" : "Restrictions"}: ${item.restrictions.join(" | ")}`
      : "";
    return [
      `[${item.evidenceId}] ${item.safeWording}`,
      `${isGerman ? "Quelle" : "Source"}: ${item.sourceName || item.sourceType} · ${
        isGerman ? "Evidenzstatus" : "Confidence"
      }: ${confidenceLabels[item.confidence]}`,
      restrictions,
    ].filter(Boolean);
  });
  return [
    ...profile,
    "",
    ...sections,
    ...(links.length ? ["", isGerman ? "SICHERE LINKS" : "SAFE LINKS", ...links] : []),
    "",
    isGerman
      ? "BELEGREGISTER ZUM BERUFLICHEN PROFIL — NUR DIE NACHSTEHENDEN SICHEREN FORMULIERUNGEN VERWENDEN"
      : "CAREER EVIDENCE REGISTER — USE ONLY THE SAFE WORDING BELOW",
    ...evidence,
  ].join("\n");
}
