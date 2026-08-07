import { strFromU8, unzipSync } from "fflate";

import {
  classifyMasterCvSection,
  masterCvCoverageStats,
} from "../master-cv.ts";
import type {
  CareerPassportEvidence,
  CareerPassportSnapshot,
  MasterCvCoverageStats,
  MasterCvLink,
  MasterCvSection,
  MasterCvSectionKind,
} from "../types";

const MAX_DOCUMENT_XML_BYTES = 4 * 1024 * 1024;
const MAX_RELATIONSHIPS_XML_BYTES = 512 * 1024;
const MAX_SECTIONS = 48;
const MAX_EVIDENCE = 320;
const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

export type ParsedMasterCvDocument = {
  name: string;
  headline: string;
  subheadline: string;
  contactLine: string;
  language: string;
  sections: MasterCvSection[];
  links: MasterCvLink[];
  sourceFingerprint: string;
  coverage: MasterCvCoverageStats;
  passport: CareerPassportSnapshot;
};

type ParagraphBlock = {
  type: "paragraph";
  style: string;
  value: string;
  links: MasterCvLink[];
};

type TableBlock = {
  type: "table";
  rows: string[];
  links: MasterCvLink[];
};

type DocumentBlock = ParagraphBlock | TableBlock;

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
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function attribute(xml: string, name: string): string {
  for (const match of xml.matchAll(/\b([^\s=]+)="([^"]*)"/g)) {
    if (match[1] === name) return decodeXmlEntities(match[2]);
  }
  return "";
}

function styleKey(style: string): string {
  return style.replace(/[^a-z0-9]+/gi, "").toLocaleLowerCase("en-US");
}

function slug(value: string, index: number): string {
  const result = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return result ? result + "-" + (index + 1) : "section-" + (index + 1);
}

function safeLink(
  label: string,
  rawUrl: string,
  index: number,
): MasterCvLink | null {
  const cleanLabel = label.replace(/\s+/g, " ").trim().slice(0, 300);
  const cleanUrl = rawUrl.trim().slice(0, 2_000);
  if (!cleanLabel || !cleanUrl) return null;
  let url: URL;
  try {
    url = new URL(cleanUrl);
  } catch {
    return null;
  }
  if (!SAFE_LINK_PROTOCOLS.has(url.protocol)) return null;
  const kind: MasterCvLink["kind"] =
    url.protocol === "mailto:"
      ? "email"
      : url.protocol === "tel:"
        ? "phone"
        : /linkedin|github|portfolio|streamlit/i.test(
              cleanLabel + " " + cleanUrl,
            )
          ? "portfolio"
          : "web";
  return {
    id: "link-" + (index + 1),
    label: cleanLabel,
    url: cleanUrl,
    kind,
  };
}

function relationshipTargets(xml: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const match of xml.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)) {
    const attributes = match[1];
    if (!attribute(attributes, "Type").endsWith("/hyperlink")) continue;
    const id = attribute(attributes, "Id");
    const target = attribute(attributes, "Target");
    if (id && target) result.set(id, target);
  }
  return result;
}

function hyperlinks(
  xml: string,
  targets: Map<string, string>,
  offset: number,
): MasterCvLink[] {
  const result: MasterCvLink[] = [];
  for (const match of xml.matchAll(
    /<w:hyperlink\b([^>]*)>([\s\S]*?)<\/w:hyperlink>/g,
  )) {
    const target = targets.get(attribute(match[1], "r:id"));
    if (!target) continue;
    const link = safeLink(paragraphText(match[0]), target, offset + result.length);
    if (link) result.push(link);
  }
  return result;
}

function parseParagraph(
  xml: string,
  targets: Map<string, string>,
  linkOffset: number,
): ParagraphBlock {
  return {
    type: "paragraph",
    style:
      /<w:pStyle\b[^>]*w:val="([^"]+)"[^>]*\/?\s*>/.exec(xml)?.[1] ?? "",
    value: paragraphText(xml),
    links: hyperlinks(xml, targets, linkOffset),
  };
}

function coherentTableRow(cells: string[]): string {
  const values = cells
    .map((cell) => cell.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (!values.length) return "";
  const joined = values.join(" ").toLocaleLowerCase("de-DE");
  if (
    /^(?:kompetenz|einordnung|evidenz|anwendung|nachweis|schwerpunkt|niveau)(?:\s|$)/.test(
      joined,
    ) &&
    values.length >= 2
  ) {
    return "";
  }
  if (values.every((value) => /^[1-5]$/.test(value))) return "";
  if (values.length === 1) return values[0];
  if (values.length === 2) return values[0] + ": " + values[1];
  return (
    values[0] +
    ": " +
    values[1] +
    " — " +
    values.slice(2).join(" · ")
  );
}

function parseTable(
  xml: string,
  targets: Map<string, string>,
  linkOffset: number,
): TableBlock {
  const rows: string[] = [];
  for (const rowMatch of xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)) {
    const cells = [...rowMatch[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map(
      (cellMatch) =>
        [...cellMatch[0].matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
          .map((paragraphMatch) => paragraphText(paragraphMatch[0]))
          .filter(Boolean)
          .join(" · "),
    );
    const row = coherentTableRow(cells);
    if (row) rows.push(row);
  }
  return {
    type: "table",
    rows,
    links: hyperlinks(xml, targets, linkOffset),
  };
}

function documentBlocks(
  documentXml: string,
  targets: Map<string, string>,
): DocumentBlock[] {
  const body =
    /<w:body\b[^>]*>([\s\S]*?)<\/w:body>/.exec(documentXml)?.[1] ?? "";
  const blocks: DocumentBlock[] = [];
  let linkOffset = 0;
  for (const match of body.matchAll(/<w:(p|tbl)\b[\s\S]*?<\/w:\1>/g)) {
    const block =
      match[1] === "p"
        ? parseParagraph(match[0], targets, linkOffset)
        : parseTable(match[0], targets, linkOffset);
    linkOffset += block.links.length;
    blocks.push(block);
  }
  return blocks;
}

function headingLevel(block: ParagraphBlock): number {
  const key = styleKey(block.style);
  if (["cvsection", "heading1"].includes(key)) return 1;
  if (key === "heading2") return 2;
  const value = block.value.trim();
  const uppercaseLetters = value.match(/[A-ZÄÖÜ]/g)?.length ?? 0;
  const words = value.split(/\s+/).length;
  const conventional =
    !block.style &&
    /^[A-ZÄÖÜ]/.test(value) &&
    uppercaseLetters >= 4 &&
    value === value.toLocaleUpperCase("de-DE") &&
    words <= 10 &&
    classifyMasterCvSection(value) !== "other";
  return conventional ? 1 : 0;
}

function isLayoutNoise(value: string, currentKind: MasterCvSectionKind): boolean {
  const line = value.trim();
  if (!line || /^\d$/.test(line)) return true;
  return (
    currentKind === "value" &&
    /^[A-ZÄÖÜ]{3,18}$/.test(line) &&
    classifyMasterCvSection(line) === "other"
  );
}

function uniqueLinks(links: MasterCvLink[]): MasterCvLink[] {
  const seen = new Set<string>();
  const result: MasterCvLink[] = [];
  for (const link of links) {
    const key =
      link.label.toLocaleLowerCase("de-DE") + "\u0000" + link.url;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...link, id: "link-" + (result.length + 1) });
  }
  return result;
}

function extractDocx(bytes: Uint8Array) {
  const archive = unzipSync(bytes, {
    filter(file) {
      if (
        !["word/document.xml", "word/_rels/document.xml.rels"].includes(
          file.name,
        )
      ) {
        return false;
      }
      const limit =
        file.name === "word/document.xml"
          ? MAX_DOCUMENT_XML_BYTES
          : MAX_RELATIONSHIPS_XML_BYTES;
      if (file.originalSize > limit) {
        throw new Error("Der DOCX-Inhalt ist ungewöhnlich groß.");
      }
      return true;
    },
  });
  const documentPart = archive["word/document.xml"];
  if (!documentPart) {
    throw new Error("Die DOCX-Datei enthält keinen lesbaren Text.");
  }
  const documentXml = strFromU8(documentPart);
  const relationshipsXml = archive["word/_rels/document.xml.rels"]
    ? strFromU8(archive["word/_rels/document.xml.rels"])
    : "";
  const blocks = documentBlocks(
    documentXml,
    relationshipTargets(relationshipsXml),
  );
  const paragraphs = blocks.filter(
    (block): block is ParagraphBlock =>
      block.type === "paragraph" && Boolean(block.value),
  );
  if (!paragraphs.length) {
    throw new Error("Die DOCX-Datei enthält keinen auswählbaren Text.");
  }

  const byStyle = (...styles: string[]) => {
    const accepted = new Set(styles.map(styleKey));
    return (
      paragraphs.find((paragraph) => accepted.has(styleKey(paragraph.style)))
        ?.value ?? ""
    );
  };
  const firstSectionBlock = blocks.findIndex(
    (block) => block.type === "paragraph" && headingLevel(block) > 0,
  );
  const profileParagraphs = blocks
    .slice(0, firstSectionBlock < 0 ? 8 : firstSectionBlock)
    .filter((block): block is ParagraphBlock => block.type === "paragraph")
    .filter(
      (paragraph) =>
        paragraph.value &&
        !/MASTER-LANGFASSUNG|CONTENT-POOL|BEWERBUNGSFASSUNG/i.test(
          paragraph.value,
        ),
    );
  const name = byStyle("CvName", "Title") || profileParagraphs[0]?.value || "";
  const headline =
    byStyle("CvHeadline", "Subtitle") || profileParagraphs[1]?.value || "";
  const subheadline =
    byStyle("CvSubheadline", "CvTagline") || profileParagraphs[2]?.value || "";
  const contactLine =
    byStyle("CvContact") || profileParagraphs[3]?.value || "";

  const drafts: Array<{
    heading: string;
    kind: MasterCvSectionKind;
    lines: string[];
  }> = [];
  let current: (typeof drafts)[number] | null = null;
  const collectedLinks: MasterCvLink[] = blocks.flatMap((block) => block.links);

  for (const block of blocks) {
    if (block.type === "table") {
      if (current) current.lines.push(...block.rows);
      continue;
    }
    const level = headingLevel(block);
    if (level > 0) {
      const kind = classifyMasterCvSection(block.value);
      const startsCanonicalSubsection =
        level === 1 ||
        (level === 2 &&
          kind !== "other" &&
          (!current || current.kind !== kind || kind === "languages"));
      if (startsCanonicalSubsection) {
        current = { heading: block.value, kind, lines: [] };
        drafts.push(current);
        continue;
      }
    }
    if (!current || isLayoutNoise(block.value, current.kind)) continue;
    const key = styleKey(block.style);
    const isBullet = ["cvbullet", "listbullet", "listparagraph"].includes(key);
    current.lines.push(
      isBullet && !/^\s*•/.test(block.value) ? "• " + block.value : block.value,
    );
  }

  const sections = drafts
    .map((section, index) => ({
      id: slug(section.heading, index),
      heading: section.heading.slice(0, 180),
      content: section.lines.join("\n").trim().slice(0, 30_000),
      kind: section.kind,
    }))
    .filter((section) => section.content)
    .slice(0, MAX_SECTIONS);
  if (!sections.length) {
    throw new Error("Die Abschnitte des Master-CV konnten nicht erkannt werden.");
  }
  return {
    name,
    headline,
    subheadline,
    contactLine,
    sections,
    links: uniqueLinks(collectedLinks),
  };
}

function evidenceFromDocument(
  document: Pick<
    ParsedMasterCvDocument,
    "name" | "headline" | "subheadline" | "contactLine" | "sections" | "links"
  >,
  importedAt: string,
): CareerPassportEvidence[] {
  const evidence: CareerPassportEvidence[] = [];
  const add = (
    evidenceId: string,
    wording: string,
    roleRelevance: string[],
    sourceType = "current_cv",
  ) => {
    const safeWording = wording.trim();
    if (!safeWording || evidence.length >= MAX_EVIDENCE) return;
    evidence.push({
      evidenceId,
      claim: safeWording.slice(0, 1_000),
      safeWording: safeWording.slice(0, 4_000),
      sourceType,
      sourceName: "Importierter Master-CV (DOCX)",
      confidence: "source_only",
      restrictions: [],
      roleRelevance,
      capturedAt: importedAt,
    });
  };
  add("CV-PROFILE-1", document.name, ["Identität"]);
  add("CV-PROFILE-2", document.headline, ["Positionierung"]);
  add("CV-PROFILE-3", document.subheadline, ["Positionierung"]);
  add("CV-PROFILE-4", document.contactLine, ["Kontakt"]);
  for (const [sectionIndex, section] of document.sections.entries()) {
    const lines = section.content
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*•\s*/, "").trim())
      .filter(Boolean);
    for (const [lineIndex, line] of lines.entries()) {
      add(
        "CV-SECTION-" + (sectionIndex + 1) + "-" + (lineIndex + 1),
        line,
        [section.kind, section.heading],
      );
    }
  }
  for (const [index, link] of document.links.entries()) {
    add(
      "CV-LINK-" + (index + 1),
      link.label + ": " + link.url,
      ["Kontakt"],
      "current_cv",
    );
  }
  return evidence;
}

function inferLanguage(sections: MasterCvSection[]): string {
  const sample = sections
    .slice(0, 12)
    .map((section) => section.heading + " " + section.content)
    .join(" ")
    .toLocaleLowerCase("de-DE");
  return /\b(berufserfahrung|ausbildung|kompetenzen|profil|weiterbildung|sprachen)\b/.test(
    sample,
  )
    ? "de-DE"
    : "de-DE";
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function parseMasterCvDocument(
  docxBytes: Uint8Array,
  importedAt = new Date().toISOString(),
): Promise<ParsedMasterCvDocument> {
  const docx = extractDocx(docxBytes);
  const evidence = evidenceFromDocument(docx, importedAt);
  const passport: CareerPassportSnapshot = {
    schemaVersion: "master-cv-evidence-v2",
    profileName: docx.name,
    targetDirections: [],
    sourceDocuments: [
      {
        sourceId: "master-cv-docx",
        name: "Importierter Master-CV (DOCX)",
        sourceType: "current_cv",
        isPrimary: true,
        notes: [
          "Evidenz wurde ausschließlich aus dem frisch eingelesenen Original-Master-CV übernommen.",
        ],
      },
    ],
    evidence,
    documentVersionStatus: "source_only",
    importedAt,
  };
  return {
    ...docx,
    language: inferLanguage(docx.sections),
    sourceFingerprint: await sha256(docxBytes),
    coverage: masterCvCoverageStats(docx.sections, docx.links, evidence.length),
    passport,
  };
}
