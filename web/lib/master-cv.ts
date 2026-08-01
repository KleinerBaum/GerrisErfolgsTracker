import type {
  CareerEvidenceConfidence,
  CareerPassportEvidence,
  CareerPassportSnapshot,
  CareerPassportSource,
  MasterCvContent,
  MasterCvSection,
} from "./types";

const MAX_SECTIONS = 24;
const MAX_EVIDENCE = 240;
const MAX_SOURCES = 80;

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
  };
}

export function normalizeMasterCvContent(value: unknown): MasterCvContent | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<MasterCvContent>;
  const passport = normalizePassport(candidate.passport);
  const sourceDocumentId = text(candidate.sourceDocumentId, 200);
  const passportDocumentId = text(candidate.passportDocumentId, 200);
  const name = text(candidate.name, 240);
  const importedAt = text(candidate.importedAt, 80);
  if (
    candidate.schemaVersion !== 1 ||
    !passport ||
    !sourceDocumentId ||
    !passportDocumentId ||
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
  return {
    schemaVersion: 1,
    sourceDocumentId,
    passportDocumentId,
    name,
    headline: text(candidate.headline, 400),
    subheadline: text(candidate.subheadline, 500),
    contactLine: text(candidate.contactLine, 600),
    language: text(candidate.language, 30) || "en",
    sections,
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
    "",
    isGerman
      ? "EVIDENZREGISTER ZUM BERUFLICHEN PROFIL — NUR DIE NACHSTEHENDEN SICHEREN FORMULIERUNGEN VERWENDEN"
      : "CAREER EVIDENCE REGISTER — USE ONLY THE SAFE WORDING BELOW",
    ...evidence,
  ].join("\n");
}
