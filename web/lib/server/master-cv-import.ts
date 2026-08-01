import { strFromU8, unzipSync } from "fflate";

import type {
  CareerEvidenceConfidence,
  CareerPassportEvidence,
  CareerPassportSnapshot,
  CareerPassportSource,
  MasterCvSection,
} from "../types";

const MAX_DOCUMENT_XML_BYTES = 4 * 1024 * 1024;
const MAX_SECTIONS = 24;

type JsonRecord = Record<string, unknown>;

type ParsedMasterCvBundle = {
  name: string;
  headline: string;
  subheadline: string;
  contactLine: string;
  language: string;
  sections: MasterCvSection[];
  passport: CareerPassportSnapshot;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}
function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function strings(value: unknown, limit: number, max = 600): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => text(item, max))
    .filter(Boolean)
    .slice(0, limit);
}

function confidence(value: unknown): CareerEvidenceConfidence {
  return value === "user_confirmed" || value === "externally_corroborated"
    ? value
    : "source_only";
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function paragraphText(xml: string): string {
  const prepared = xml
    .replace(/<w:tab\b[^>]*\/?\s*>/g, "\t")
    .replace(/<w:(?:br|cr)\b[^>]*\/?\s*>/g, "\n");
  return [...prepared.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map((match) => decodeXmlEntities(match[1]))
    .join("")
    .replace(/\u0000/g, "")
    .trim();
}

function slug(value: string, index: number): string {
  const result = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return result ? `${result}-${index + 1}` : `section-${index + 1}`;
}

function extractDocx(bytes: Uint8Array) {
  const archive = unzipSync(bytes, {
    filter(file) {
      if (file.name !== "word/document.xml") return false;
      if (file.originalSize > MAX_DOCUMENT_XML_BYTES) {
        throw new Error("Der DOCX-Inhalt ist ungewöhnlich groß.");
      }
      return true;
    },
  });
  const documentXml = archive["word/document.xml"];
  if (!documentXml) throw new Error("Die DOCX-Datei enthält keinen lesbaren Text.");
  const xml = strFromU8(documentXml);
  const paragraphs = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
    .map((match) => {
      const body = match[0];
      const style =
        /<w:pStyle\b[^>]*w:val="([^"]+)"[^>]*\/?\s*>/.exec(body)?.[1] ?? "";
      const value = paragraphText(body);
      return { style, value };
    })
    .filter((paragraph) => paragraph.value);
  if (!paragraphs.length) {
    throw new Error("Die DOCX-Datei enthält keinen auswählbaren Text.");
  }

  const byStyle = (style: string) =>
    paragraphs.find((paragraph) => paragraph.style === style)?.value ?? "";
  const firstSection = paragraphs.findIndex(
    (paragraph) => paragraph.style === "CvSection",
  );
  const profileParagraphs = paragraphs.slice(0, firstSection < 0 ? 4 : firstSection);
  const name = byStyle("CvName") || profileParagraphs[0]?.value || "";
  const headline = byStyle("CvHeadline") || profileParagraphs[1]?.value || "";
  const subheadline =
    byStyle("CvSubheadline") || profileParagraphs[2]?.value || "";
  const contactLine = byStyle("CvContact") || profileParagraphs[3]?.value || "";

  const sectionDrafts: Array<{ heading: string; lines: string[] }> = [];
  let current: { heading: string; lines: string[] } | null = null;
  for (const paragraph of paragraphs) {
    const conventionalHeading =
      !paragraph.style &&
      paragraph.value === paragraph.value.toUpperCase() &&
      paragraph.value.split(/\s+/).length <= 8;
    if (paragraph.style === "CvSection" || conventionalHeading) {
      current = { heading: paragraph.value, lines: [] };
      sectionDrafts.push(current);
      continue;
    }
    if (!current) continue;
    const value =
      paragraph.style === "CvBullet" && !paragraph.value.startsWith("•")
        ? `• ${paragraph.value}`
        : paragraph.value;
    current.lines.push(value);
  }
  const sections = sectionDrafts
    .map((section, index) => ({
      id: slug(section.heading, index),
      heading: section.heading.slice(0, 180),
      content: section.lines.join("\n").slice(0, 30_000),
    }))
    .filter((section) => section.content)
    .slice(0, MAX_SECTIONS);
  if (!sections.length) {
    throw new Error("Die Abschnitte des Master-CV konnten nicht erkannt werden.");
  }
  return { name, headline, subheadline, contactLine, sections };
}

function passportSource(value: unknown): CareerPassportSource | null {
  const source = record(value);
  const sourceId = text(source.source_id, 160);
  const name = text(source.name, 300);
  if (!sourceId || !name) return null;
  return {
    sourceId,
    name,
    sourceType: text(source.source_type, 100),
    isPrimary: source.is_primary === true,
    notes: strings(source.notes, 10),
  };
}

function passportEvidence(value: unknown): CareerPassportEvidence | null {
  const evidence = record(value);
  const evidenceId = text(evidence.evidence_id, 160);
  const safeWording = text(evidence.safe_wording, 4_000);
  if (!evidenceId || !safeWording) return null;
  return {
    evidenceId,
    claim: text(evidence.claim, 1_000),
    safeWording,
    sourceType: text(evidence.source_type, 100),
    sourceName: text(evidence.source_name, 300),
    confidence: confidence(evidence.confidence),
    restrictions: strings(evidence.restrictions, 20, 1_000),
    roleRelevance: strings(evidence.role_relevance, 20, 300),
    capturedAt: text(evidence.captured_at, 80) || null,
  };
}

function extractPassport(raw: string, importedAt: string): CareerPassportSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Der Career Passport ist keine gültige JSON-Datei.");
  }
  const passport = record(parsed);
  const profile = record(passport.profile);
  const profileName = text(profile.name, 240);
  const schemaVersion = text(passport.schema_version, 30);
  if (!profileName || !schemaVersion) {
    throw new Error("Der Career Passport hat kein unterstütztes Format.");
  }
  const sources = Array.isArray(passport.source_documents)
    ? passport.source_documents
        .map(passportSource)
        .filter((item): item is CareerPassportSource => Boolean(item))
        .slice(0, 80)
    : [];
  const evidence = Array.isArray(passport.evidence)
    ? passport.evidence
        .map(passportEvidence)
        .filter((item): item is CareerPassportEvidence => Boolean(item))
        .slice(0, 240)
    : [];
  if (!sources.length || !evidence.length) {
    throw new Error("Im Career Passport fehlen Quellen oder Evidenzangaben.");
  }
  const preferences = record(passport.preferences);
  const versions = Array.isArray(passport.document_versions)
    ? passport.document_versions.map(record)
    : [];
  return {
    schemaVersion,
    profileName,
    targetDirections: strings(preferences.target_directions, 12, 300),
    sourceDocuments: sources,
    evidence,
    documentVersionStatus: text(versions[0]?.status, 80) || null,
    importedAt,
  };
}

export function parseMasterCvBundle(
  docxBytes: Uint8Array,
  passportJson: string,
  importedAt = new Date().toISOString(),
): ParsedMasterCvBundle {
  const docx = extractDocx(docxBytes);
  const passport = extractPassport(passportJson, importedAt);
  if (
    docx.name &&
    passport.profileName &&
    docx.name.localeCompare(passport.profileName, undefined, {
      sensitivity: "base",
    }) !== 0
  ) {
    throw new Error("Master-CV und Career Passport gehören nicht zur selben Person.");
  }
  const parsedPassport = JSON.parse(passportJson) as JsonRecord;
  const profile = record(parsedPassport.profile);
  const preferences = record(parsedPassport.preferences);
  const documentPreferences = record(preferences.document_preferences);
  const contact = Array.isArray(profile.contact)
    ? profile.contact
        .map((entry) => text(record(entry).text, 300))
        .filter(Boolean)
    : [];
  return {
    name: docx.name || passport.profileName,
    headline: docx.headline || text(profile.headline, 400),
    subheadline: docx.subheadline,
    contactLine:
      docx.contactLine ||
      [text(profile.location, 300), ...contact].filter(Boolean).join(" | "),
    language: text(documentPreferences.language, 30) || "en",
    sections: docx.sections,
    passport,
  };
}
