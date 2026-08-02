import { strFromU8, unzipSync } from "fflate";

import type {
  CareerPassportEvidence,
  CareerPassportSnapshot,
  MasterCvSection,
} from "../types";

const MAX_DOCUMENT_XML_BYTES = 4 * 1024 * 1024;
const MAX_SECTIONS = 24;
const MAX_EVIDENCE = 240;

type ParsedMasterCvDocument = {
  name: string;
  headline: string;
  subheadline: string;
  contactLine: string;
  language: string;
  sections: MasterCvSection[];
  passport: CareerPassportSnapshot;
};

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
  return [
    ...xml.matchAll(
      /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?\s*>|<w:(br|cr)\b[^>]*\/?\s*>/g,
    ),
  ]
    .map((match) =>
      typeof match[1] === "string"
        ? decodeXmlEntities(match[1])
        : match[2]
          ? "\n"
          : "\t",
    )
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

  const styleKey = (style: string) =>
    style.replace(/[^a-z0-9]+/gi, "").toLocaleLowerCase("en-US");
  const byStyle = (...styles: string[]) => {
    const accepted = new Set(styles.map(styleKey));
    return (
      paragraphs.find((paragraph) => accepted.has(styleKey(paragraph.style)))
        ?.value ?? ""
    );
  };
  const isSectionStyle = (style: string) =>
    ["cvsection", "heading1"].includes(styleKey(style));
  const isBulletStyle = (style: string) =>
    ["cvbullet", "listbullet", "listparagraph"].includes(styleKey(style));
  const firstSection = paragraphs.findIndex(
    (paragraph) => isSectionStyle(paragraph.style),
  );
  const profileParagraphs = paragraphs.slice(0, firstSection < 0 ? 4 : firstSection);
  const name = byStyle("CvName", "Title") || profileParagraphs[0]?.value || "";
  const headline =
    byStyle("CvHeadline", "Subtitle") || profileParagraphs[1]?.value || "";
  const subheadline =
    byStyle("CvSubheadline", "CvTagline") || profileParagraphs[2]?.value || "";
  const contactLine =
    byStyle("CvContact") || profileParagraphs[3]?.value || "";

  const sectionDrafts: Array<{ heading: string; lines: string[] }> = [];
  let current: { heading: string; lines: string[] } | null = null;
  for (const paragraph of paragraphs) {
    const headingLetters = paragraph.value.match(/[A-ZÄÖÜ]/g)?.length ?? 0;
    const headingWordCount = paragraph.value.split(/\s+/).length;
    const conventionalHeading =
      !paragraph.style &&
      /^[A-ZÄÖÜ]/.test(paragraph.value) &&
      headingLetters >= 5 &&
      paragraph.value === paragraph.value.toUpperCase() &&
      headingWordCount <= 8 &&
      (headingWordCount > 1 ||
        /^(?:PROFIL|KURZPROFIL|BERUFSERFAHRUNG|AUSBILDUNG|WEITERBILDUNG|QUALIFIKATIONEN|KOMPETENZEN|PROJEKTE|SPRACHEN)$/i.test(
          paragraph.value,
        ));
    if (isSectionStyle(paragraph.style) || conventionalHeading) {
      current = { heading: paragraph.value, lines: [] };
      sectionDrafts.push(current);
      continue;
    }
    if (!current) continue;
    const value =
      isBulletStyle(paragraph.style) && !paragraph.value.startsWith("•")
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

function evidenceFromSections(
  sections: MasterCvSection[],
  importedAt: string,
): CareerPassportEvidence[] {
  const evidence: CareerPassportEvidence[] = [];
  for (const [sectionIndex, section] of sections.entries()) {
    const lines = section.content
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*•\s*/, "").trim())
      .filter(Boolean);
    for (const [lineIndex, line] of lines.entries()) {
      evidence.push({
        evidenceId: `CV-${sectionIndex + 1}-${lineIndex + 1}`,
        claim: line.slice(0, 1_000),
        safeWording: line.slice(0, 4_000),
        sourceType: "current_cv",
        sourceName: "Importierter Master-CV (DOCX)",
        confidence: "source_only",
        restrictions: [],
        roleRelevance: [section.heading],
        capturedAt: importedAt,
      });
      if (evidence.length >= MAX_EVIDENCE) return evidence;
    }
  }
  return evidence;
}

function inferLanguage(sections: MasterCvSection[]): string {
  const sample = sections
    .slice(0, 8)
    .map((section) => `${section.heading} ${section.content}`)
    .join(" ")
    .toLocaleLowerCase("de-DE");
  return /\b(berufserfahrung|ausbildung|kompetenzen|profil|weiterbildung|sprachen)\b/.test(
    sample,
  )
    ? "de-DE"
    : "de-DE";
}

export function parseMasterCvDocument(
  docxBytes: Uint8Array,
  importedAt = new Date().toISOString(),
): ParsedMasterCvDocument {
  const docx = extractDocx(docxBytes);
  const evidence = evidenceFromSections(docx.sections, importedAt);
  const passport: CareerPassportSnapshot = {
    schemaVersion: "master-cv-evidence-v1",
    profileName: docx.name,
    targetDirections: [],
    sourceDocuments: [
      {
        sourceId: "master-cv-docx",
        name: "Importierter Master-CV (DOCX)",
        sourceType: "current_cv",
        isPrimary: true,
        notes: ["Evidenz wurde ausschließlich aus dem importierten Master-CV übernommen."],
      },
    ],
    evidence,
    documentVersionStatus: "source_only",
    importedAt,
  };
  return {
    ...docx,
    language: inferLanguage(docx.sections),
    passport,
  };
}
