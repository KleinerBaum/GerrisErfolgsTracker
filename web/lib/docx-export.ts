import { strToU8, zipSync } from "fflate";

import { applicationDocumentPreset } from "./application-document-presets.ts";
import type { DocxTemplateProfile } from "./docx-template-profile";
import type {
  ApplicationDocumentKind,
  ApplicationDocumentPresetId,
  ApplicationVisualizationPlacement,
  MasterCvLink,
} from "./types";

const CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Gerris Application Line v1: bewusstes, benutzerdefiniertes A4-Preset.
// Schriftgrößen sind OOXML-Halbpunktwerte, Abstände und Ränder Twips.

export type DocxArtifactKind = ApplicationDocumentKind;

export type DocxEmbeddedMedia = {
  id: string;
  title: string;
  altText: string;
  placement: ApplicationVisualizationPlacement;
  pngBytes: Uint8Array;
  svgBytes?: Uint8Array;
  width: number;
  height: number;
};

export type DocxExportOptions = {
  presetId?: ApplicationDocumentPresetId;
  templateProfile?: DocxTemplateProfile | null;
  media?: DocxEmbeddedMedia[];
};

export type VisualizationPlacementReport = {
  id: string;
  requestedPlacement: ApplicationVisualizationPlacement;
  resolvedPlacement: ApplicationVisualizationPlacement | "end-fallback";
  insertBeforeLine: number;
  warning: string | null;
};

type ArtifactConfig = {
  label: string;
  bodySize: number;
  bodyLine: number;
  bodyAfter: number;
  titleSize: number;
  heading1Size: number;
  heading2Size: number;
  margins: { top: number; right: number; bottom: number; left: number };
};

type ResolvedArtifactConfig = ArtifactConfig & {
  presetId: ApplicationDocumentPresetId;
  layout: "gerris" | "modern" | "professional" | "conservative";
  page: { width: number; height: number };
  fonts: { body: string; title: string; heading: string };
  colors: {
    title: string;
    heading: string;
    accent: string;
    rule: string;
    text: string;
    muted: string;
    soft: string;
  };
  headingBefore: number;
  headingAfter: number;
};

const CONFIG: Record<DocxArtifactKind, ArtifactConfig> = {
  "tailored-cv": {
    label: "FOKUSSIERTER LEBENSLAUF",
    bodySize: 20,
    bodyLine: 228,
    bodyAfter: 30,
    titleSize: 42,
    heading1Size: 22,
    heading2Size: 20,
    margins: { top: 650, right: 820, bottom: 650, left: 820 },
  },
  "cover-letter": {
    label: "ANSCHREIBEN",
    bodySize: 20,
    bodyLine: 240,
    bodyAfter: 90,
    titleSize: 22,
    heading1Size: 22,
    heading2Size: 20,
    margins: { top: 850, right: 1_134, bottom: 1_134, left: 1_417 },
  },
  "company-brief": {
    label: "ROLLENBRIEFING",
    bodySize: 20,
    bodyLine: 232,
    bodyAfter: 36,
    titleSize: 36,
    heading1Size: 21,
    heading2Size: 19,
    margins: { top: 650, right: 820, bottom: 650, left: 820 },
  },
  "interview-prep": {
    label: "INTERVIEWMAPPE",
    bodySize: 20,
    bodyLine: 246,
    bodyAfter: 70,
    titleSize: 38,
    heading1Size: 23,
    heading2Size: 20,
    margins: { top: 760, right: 900, bottom: 760, left: 900 },
  },
};

function artifactConfig(
  content: string,
  kind: DocxArtifactKind,
  presetId: ApplicationDocumentPresetId,
  templateProfile?: DocxTemplateProfile | null,
): ResolvedArtifactConfig {
  const base = CONFIG[kind];
  const preset = applicationDocumentPreset(presetId);
  let sized = base;
  if (kind === "tailored-cv") {
    const words = content.trim().split(/\s+/).filter(Boolean).length;
    sized = words <= 850
      ? { ...base, bodySize: 21, bodyLine: 244, bodyAfter: 36 }
      : words <= 1_000
        ? { ...base, bodySize: 20, bodyLine: 232, bodyAfter: 32 }
        : { ...base, bodySize: 20, bodyLine: 224, bodyAfter: 26 };
  }
  if (!templateProfile) {
    const margins =
      kind === "cover-letter"
        ? sized.margins
        : preset.layout === "modern"
          ? { top: 680, right: 780, bottom: 680, left: 820 }
          : preset.layout === "conservative"
            ? { top: 760, right: 900, bottom: 760, left: 900 }
            : sized.margins;
    return {
      ...sized,
      margins,
      presetId,
      layout: preset.layout,
      page: { width: 11_906, height: 16_838 },
      fonts: { ...preset.fonts },
      colors: { ...preset.colors },
      headingBefore: preset.layout === "modern" ? 138 : 150,
      headingAfter: preset.layout === "conservative" ? 54 : 64,
    };
  }
  return {
    ...sized,
    presetId,
    layout: "gerris",
    bodySize: Math.max(20, templateProfile.sizes.body),
    bodyLine: templateProfile.spacing.bodyLine,
    bodyAfter: templateProfile.spacing.bodyAfter,
    titleSize: Math.max(20, templateProfile.sizes.title),
    heading1Size: Math.max(20, templateProfile.sizes.heading1),
    heading2Size: Math.max(20, templateProfile.sizes.heading2),
    margins: { ...templateProfile.page.margins },
    page: {
      width: templateProfile.page.width,
      height: templateProfile.page.height,
    },
    fonts: { ...templateProfile.fonts },
    colors: {
      title: templateProfile.colors.accent,
      heading: templateProfile.colors.accent,
      accent: templateProfile.colors.accent,
      rule: templateProfile.colors.accent,
      text: templateProfile.colors.text,
      muted: templateProfile.colors.muted,
      soft: templateProfile.colors.soft,
    },
    headingBefore: templateProfile.spacing.headingBefore,
    headingAfter: templateProfile.spacing.headingAfter,
  };
}

function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stripMarkdown(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|mailto:|tel:)[^)]+\)/gi, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .trim();
}

function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

class DocumentRelationships {
  private readonly byUrl = new Map<string, string>();
  private readonly mediaRelationships: string[] = [];
  private nextId = 7;

  idFor(rawUrl: string): string | null {
    const url = safeExternalUrl(rawUrl);
    if (!url) return null;
    const existing = this.byUrl.get(url);
    if (existing) return existing;
    const id = "rId" + this.nextId++;
    this.byUrl.set(url, id);
    return id;
  }

  mediaFor(index: number, hasSvg: boolean): { pngId: string; svgId: string | null } {
    const pngId = "rId" + this.nextId++;
    this.mediaRelationships.push(
      `<Relationship Id="${pngId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/visual-${index + 1}.png"/>`,
    );
    let svgId: string | null = null;
    if (hasSvg) {
      svgId = "rId" + this.nextId++;
      this.mediaRelationships.push(
        `<Relationship Id="${svgId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/visual-${index + 1}.svg"/>`,
      );
    }
    return { pngId, svgId };
  }

  xml(): string {
    const hyperlinks = [...this.byUrl.entries()]
      .map(
        ([url, id]) =>
          '<Relationship Id="' +
          id +
          '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="' +
          xml(url) +
          '" TargetMode="External"/>',
      )
      .join("");
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' +
      '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
      '<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>' +
      '<Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' +
      hyperlinks +
      this.mediaRelationships.join("") +
      "</Relationships>"
    );
  }
}

function run(
  value: string,
  options: {
    bold?: boolean;
    italic?: boolean;
    color?: string;
    underline?: boolean;
  } = {},
): string {
  const properties = [
    options.bold ? "<w:b/>" : "",
    options.italic ? "<w:i/>" : "",
    options.color ? '<w:color w:val="' + options.color + '"/>' : "",
    options.underline ? '<w:u w:val="single"/>' : "",
    '<w:lang w:val="de-DE"/>',
  ].join("");
  return (
    "<w:r><w:rPr>" +
    properties +
    '</w:rPr><w:t xml:space="preserve">' +
    xml(value) +
    "</w:t></w:r>"
  );
}

function hyperlinkRun(
  label: string,
  url: string,
  relationships: DocumentRelationships,
  color: string,
): string {
  const id = relationships.idFor(url);
  if (!id) return run(label);
  return (
    '<w:hyperlink r:id="' +
    id +
    '">' +
    run(label, { color, underline: true }) +
    "</w:hyperlink>"
  );
}

function formattedRuns(value: string): string {
  return value
    .split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return run(part.slice(2, -2), { bold: true });
      }
      if (part.startsWith("*") && part.endsWith("*")) {
        return run(part.slice(1, -1), { italic: true });
      }
      return run(part);
    })
    .join("");
}

function knownLinkRuns(
  value: string,
  links: MasterCvLink[],
  relationships: DocumentRelationships,
  color: string,
): string {
  let cursor = 0;
  let output = "";
  const normalized = value.toLocaleLowerCase("de-DE");
  while (cursor < value.length) {
    let best:
      | { index: number; link: MasterCvLink }
      | undefined;
    for (const link of links) {
      if (!link.label || !safeExternalUrl(link.url)) continue;
      const index = normalized.indexOf(
        link.label.toLocaleLowerCase("de-DE"),
        cursor,
      );
      if (index >= 0 && (!best || index < best.index)) best = { index, link };
    }
    if (!best) {
      output += formattedRuns(value.slice(cursor));
      break;
    }
    output += formattedRuns(value.slice(cursor, best.index));
    output += hyperlinkRun(
      value.slice(best.index, best.index + best.link.label.length),
      best.link.url,
      relationships,
      color,
    );
    cursor = best.index + best.link.label.length;
  }
  return output;
}

function inlineRuns(
  value: string,
  links: MasterCvLink[],
  relationships: DocumentRelationships,
  color: string,
): string {
  const pattern =
    /\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:)[^)]+)\)|((?:https?:\/\/|mailto:|tel:)[^\s)]+)/gi;
  let cursor = 0;
  let output = "";
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    output += knownLinkRuns(
      value.slice(cursor, index),
      links,
      relationships,
      color,
    );
    const label = match[1] || match[3];
    const url = match[2] || match[3];
    output += hyperlinkRun(label, url, relationships, color);
    cursor = index + match[0].length;
  }
  output += knownLinkRuns(value.slice(cursor), links, relationships, color);
  return output;
}

function paragraph(
  style: string,
  content: string,
  config: ResolvedArtifactConfig,
  options: {
    bullet?: boolean;
    keepNext?: boolean;
    pageBreakBefore?: boolean;
    callout?: boolean;
  } = {},
): string {
  const bullet = options.bullet
    ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'
    : "";
  const callout = options.callout
    ? config.layout === "conservative"
      ? '<w:ind ' +
        (options.bullet ? 'w:right="120"' : 'w:left="140" w:right="120"') +
        '/><w:pBdr><w:left w:val="single" w:sz="6" w:space="6" w:color="' +
        config.colors.rule +
        '"/></w:pBdr>'
      : '<w:ind ' +
        (options.bullet ? 'w:right="120"' : 'w:left="160" w:right="120"') +
        '/><w:shd w:val="clear" w:color="auto" w:fill="' +
        config.colors.soft +
        '"/><w:pBdr><w:left w:val="single" w:sz="' +
        (config.layout === "modern" ? "16" : "12") +
        '" w:space="6" w:color="' +
        config.colors.accent +
        '"/></w:pBdr>'
    : "";
  const properties =
    '<w:pStyle w:val="' +
    style +
    '"/>' +
    bullet +
    callout +
    (options.keepNext ? "<w:keepNext/>" : "") +
    (options.pageBreakBefore ? "<w:pageBreakBefore/>" : "");
  return "<w:p><w:pPr>" + properties + "</w:pPr>" + content + "</w:p>";
}

function visualLineEstimate(rawLine: string): number {
  const line = rawLine.trim();
  if (!line) return 0.22;
  const plain = stripMarkdown(line.replace(/^#{1,3}\s+|^(?:[-•])\s+/, ""));
  const wrappedLines = Math.max(1, Math.ceil(plain.length / 92));
  if (/^#\s+/.test(line)) return 2.5;
  if (/^##\s+/.test(line)) return 1.75;
  if (/^###\s+/.test(line)) return 1.35;
  if (/^\*\*.*\d.*\*\*$/.test(line)) return 1.3;
  if (/^\*(?!\*)/.test(line)) return 1.05;
  if (/^(?:[-•])\s+/.test(line)) return wrappedLines * 1.08 + 0.18;
  return wrappedLines + 0.28;
}

export function cvPageBreakIndex(lines: string[]): number {
  const estimates = lines.map(visualLineEstimate);
  const totalVisualLines = estimates.reduce((sum, value) => sum + value, 0);
  if (totalVisualLines < 54) return -1;
  let running = 0;
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (
      (/^#{2,3}\s+/.test(line) || /^\*\*.*\d.*\*\*$/.test(line)) &&
      index > 4
    ) {
      const ratio = running / totalVisualLines;
      if (ratio >= 0.36 && ratio <= 0.54) {
        const distance = Math.abs(ratio - 0.44);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      }
    }
    running += estimates[index];
  }
  return bestIndex;
}

function normalizedHeading(value: string): string {
  return stripMarkdown(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-DE");
}

export function resolveVisualizationPlacements(
  content: string,
  media: ReadonlyArray<Pick<DocxEmbeddedMedia, "id" | "placement">>,
): VisualizationPlacementReport[] {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const headings = lines.flatMap((line, index) => {
    const match = /^(#{1,3})\s+(.+)$/.exec(line.trim());
    return match
      ? [{ index, level: match[1].length, label: normalizedHeading(match[2]) }]
      : [];
  });
  const patterns: Record<Exclude<ApplicationVisualizationPlacement, "end">, RegExp> = {
    "after-profile": /profil|professional summary|summary|uber mich/,
    "after-skills": /skills?|kompetenz|kenntnis|technolog|tools?|werkzeug/,
  };
  return media.map((visual) => {
    if (visual.placement === "end") {
      return {
        id: visual.id,
        requestedPlacement: visual.placement,
        resolvedPlacement: "end",
        insertBeforeLine: lines.length,
        warning: null,
      };
    }
    const semanticPlacement = visual.placement;
    const headingIndex = headings.findIndex((heading) =>
      patterns[semanticPlacement].test(heading.label),
    );
    if (headingIndex < 0) {
      const target = visual.placement === "after-profile" ? "Profil" : "Skills";
      return {
        id: visual.id,
        requestedPlacement: visual.placement,
        resolvedPlacement: "end-fallback",
        insertBeforeLine: lines.length,
        warning: `Abschnitt „${target}“ fehlt; die Visualisierung wird am Ende eingefügt.`,
      };
    }
    const heading = headings[headingIndex];
    const next = headings
      .slice(headingIndex + 1)
      .find((candidate) => candidate.level <= heading.level);
    return {
      id: visual.id,
      requestedPlacement: visual.placement,
      resolvedPlacement: visual.placement,
      insertBeforeLine: next?.index ?? lines.length,
      warning: null,
    };
  });
}

function drawingParagraph(
  media: DocxEmbeddedMedia,
  mediaIndex: number,
  relationships: DocumentRelationships,
  config: ResolvedArtifactConfig,
): string {
  if (
    !media.title.trim() ||
    !media.altText.trim() ||
    media.width <= 0 ||
    media.height <= 0 ||
    media.pngBytes.length < 24
  ) {
    throw new Error("Visualisierungen benötigen Titel, Alternativtext und einen gültigen PNG-Fallback.");
  }
  const relation = relationships.mediaFor(mediaIndex, Boolean(media.svgBytes?.length));
  const maximumWidth = Math.max(
    914_400,
    (config.page.width - config.margins.left - config.margins.right) * 635,
  );
  const maximumHeight = Math.max(
    914_400,
    (config.page.height - config.margins.top - config.margins.bottom - 720) * 635,
  );
  const nativeWidth = media.width * 9_525;
  const nativeHeight = media.height * 9_525;
  const scale = Math.min(1, maximumWidth / nativeWidth, maximumHeight / nativeHeight);
  const width = Math.max(1, Math.round(nativeWidth * scale));
  const height = Math.max(1, Math.round(nativeHeight * scale));
  const drawingId = 1_000 + mediaIndex;
  const svgExtension = relation.svgId
    ? '<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}">' +
      '<asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="' +
      relation.svgId +
      '"/></a:ext></a:extLst>'
    : "";
  return (
    '<w:p><w:pPr><w:pStyle w:val="Figure"/><w:keepNext/></w:pPr><w:r><w:drawing>' +
    '<wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0">' +
    `<wp:extent cx="${width}" cy="${height}"/>` +
    '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
    `<wp:docPr id="${drawingId}" name="${xml(media.title)}" descr="${xml(media.altText)}"/>` +
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr>' +
    `<pic:cNvPr id="${drawingId}" name="${xml(media.title)}" descr="${xml(media.altText)}"/>` +
    '<pic:cNvPicPr><a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></pic:cNvPicPr></pic:nvPicPr>' +
    '<pic:blipFill><a:blip r:embed="' +
    relation.pngId +
    '">' +
    svgExtension +
    '</a:blip><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
    '<pic:spPr bwMode="auto"><a:xfrm><a:off x="0" y="0"/>' +
    `<a:ext cx="${width}" cy="${height}"/>` +
    '</a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></pic:spPr>' +
    '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>' +
    paragraph("Caption", run(media.title, { color: config.colors.muted }), config)
  );
}

function bodyXml(
  content: string,
  kind: DocxArtifactKind,
  links: MasterCvLink[],
  relationships: DocumentRelationships,
  config: ResolvedArtifactConfig,
  media: DocxEmbeddedMedia[],
): string {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const pageBreakIndex =
    kind === "tailored-cv" && media.length === 0
      ? cvPageBreakIndex(lines)
      : -1;
  const paragraphs: string[] = [];
  let titleSeen = false;
  let sectionHeading = "";
  let preSectionLine = 0;
  let calloutPending = false;
  const placements = resolveVisualizationPlacements(content, media);
  const mediaByLine = new Map<number, number[]>();
  placements.forEach((placement, mediaIndex) => {
    const indexes = mediaByLine.get(placement.insertBeforeLine) ?? [];
    indexes.push(mediaIndex);
    mediaByLine.set(placement.insertBeforeLine, indexes);
  });
  const appendMedia = (lineIndex: number) => {
    for (const mediaIndex of mediaByLine.get(lineIndex) ?? []) {
      paragraphs.push(
        drawingParagraph(media[mediaIndex], mediaIndex, relationships, config),
      );
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    appendMedia(index);
    const line = lines[index].trim();
    if (!line) continue;
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const value = heading[2].trim();
      if (level === 1 && !titleSeen) {
        titleSeen = true;
        paragraphs.push(
          paragraph(
            kind === "cover-letter" ? "CoverSubject" : "Title",
            inlineRuns(value, links, relationships, config.colors.accent),
            config,
            {
              keepNext: true,
            },
          ),
        );
      } else if (level <= 2) {
        sectionHeading = stripMarkdown(value).toLocaleUpperCase("de-DE");
        calloutPending =
          kind === "interview-prep" &&
          /KERNBOTSCHAFT/.test(sectionHeading);
        paragraphs.push(
          paragraph(
            "Heading1",
            inlineRuns(value, links, relationships, config.colors.accent),
            config,
            {
              keepNext: true,
              pageBreakBefore: index === pageBreakIndex,
            },
          ),
        );
      } else {
        paragraphs.push(
          paragraph(
            "Heading2",
            inlineRuns(value, links, relationships, config.colors.accent),
            config,
            {
              keepNext: true,
              pageBreakBefore: index === pageBreakIndex,
            },
          ),
        );
      }
      continue;
    }
    if (
      kind === "tailored-cv" &&
      /^BEWERBUNGSFASSUNG\s*\|/i.test(line)
    ) {
      paragraphs.push(
        paragraph(
          "Kicker",
          inlineRuns(stripMarkdown(line), links, relationships, config.colors.accent),
          config,
          { keepNext: true },
        ),
      );
      continue;
    }
    const cleanLine = stripMarkdown(line);
    if (
      kind === "tailored-cv" &&
      /^\*\*.*\*\*$/.test(line) &&
      /\d/.test(cleanLine)
    ) {
      paragraphs.push(
        paragraph("Date", inlineRuns(cleanLine, links, relationships, config.colors.accent), config, {
          keepNext: true,
          pageBreakBefore: index === pageBreakIndex,
        }),
      );
      continue;
    }
    if (
      kind === "tailored-cv" &&
      /^\*(?!\*)(.+)\*$/.test(line)
    ) {
      paragraphs.push(
        paragraph("Company", inlineRuns(cleanLine, links, relationships, config.colors.accent), config, {
          keepNext: true,
        }),
      );
      continue;
    }
    const bullet = /^(?:[-•])\s+(.+)$/.exec(line);
    if (bullet) {
      paragraphs.push(
        paragraph(
          "Bullet",
          inlineRuns(bullet[1], links, relationships, config.colors.accent),
          config,
          {
            bullet: true,
            callout:
              kind === "interview-prep" &&
              /OFFENE RISIKEN|RISIKEN UND LERNFELDER/.test(sectionHeading),
          },
        ),
      );
      continue;
    }
    if (kind === "cover-letter" && /^(?:Sehr geehrte|Guten Tag|Hallo|Dear)\b/i.test(cleanLine)) {
      sectionHeading = "LETTER_BODY";
      paragraphs.push(
        paragraph("Greeting", inlineRuns(cleanLine, links, relationships, config.colors.accent), config, {
          keepNext: true,
        }),
      );
      continue;
    }
    if (titleSeen && !sectionHeading && preSectionLine < 6) {
      const letterDate =
        kind === "cover-letter" &&
        /(?:\b\d{1,2}\.\s*[A-Za-zÄÖÜäöüß]+\s+\d{4}\b|\b\d{1,2}\.\d{1,2}\.\d{4}\b)/.test(
          cleanLine,
        );
      const style =
        kind === "tailored-cv"
          ? preSectionLine === 0
            ? "Subtitle"
            : preSectionLine === 1
              ? "Tagline"
              : "Contact"
          : letterDate
            ? "LetterDate"
            : preSectionLine === 0
            ? "Contact"
            : "Recipient";
      preSectionLine += 1;
      paragraphs.push(
        paragraph(
          style,
          inlineRuns(line, links, relationships, config.colors.accent),
          config,
          { keepNext: true },
        ),
      );
      continue;
    }
    paragraphs.push(
      paragraph(
        calloutPending ? "Callout" : "Normal",
        inlineRuns(line, links, relationships, config.colors.accent),
        config,
        { callout: calloutPending },
      ),
    );
    calloutPending = false;
  }
  appendMedia(lines.length);
  return paragraphs.join("\n");
}

function style(
  id: string,
  name: string,
  basedOn: string,
  paragraphProperties: string,
  runProperties: string,
  isDefault = false,
): string {
  return (
    '<w:style w:type="paragraph"' +
    (isDefault ? ' w:default="1"' : "") +
    ' w:styleId="' +
    id +
    '"><w:name w:val="' +
    name +
    '"/><w:basedOn w:val="' +
    basedOn +
    '"/><w:qFormat/><w:pPr>' +
    paragraphProperties +
    "</w:pPr><w:rPr>" +
    runProperties +
    "</w:rPr></w:style>"
  );
}

function fontProperties(
  size: number,
  font: string,
  color: string,
  extra = "",
): string {
  return (
    '<w:rFonts w:ascii="' +
    xml(font) +
    '" w:hAnsi="' +
    xml(font) +
    '" w:eastAsia="' +
    xml(font) +
    '" w:cs="' +
    xml(font) +
    '"/>' +
    '<w:sz w:val="' +
    size +
    '"/><w:szCs w:val="' +
    size +
    '"/><w:color w:val="' +
    color +
    '"/><w:lang w:val="de-DE" w:eastAsia="de-DE" w:bidi="de-DE"/>' +
    extra
  );
}

function stylesXml(
  kind: DocxArtifactKind,
  config: ResolvedArtifactConfig,
): string {
  const titleParagraph =
    config.layout === "modern"
      ? '<w:ind w:left="150"/><w:spacing w:before="0" w:after="86"/><w:keepNext/><w:pBdr><w:left w:val="single" w:sz="22" w:space="7" w:color="' +
        config.colors.accent +
        '"/></w:pBdr>'
      : config.layout === "professional"
        ? '<w:spacing w:before="0" w:after="92"/><w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="6" w:color="' +
          config.colors.rule +
          '"/></w:pBdr>'
        : '<w:spacing w:before="0" w:after="80"/><w:keepNext/>';
  const headingBorder =
    config.layout === "modern"
      ? '<w:ind w:left="110"/><w:pBdr><w:left w:val="single" w:sz="14" w:space="5" w:color="' +
        config.colors.accent +
        '"/></w:pBdr>'
      : '<w:pBdr><w:bottom w:val="single" w:sz="' +
        (config.layout === "conservative" ? "4" : "8") +
        '" w:space="4" w:color="' +
        config.colors.rule +
        '"/></w:pBdr>';
  const calloutParagraph =
    '<w:ind w:left="' +
    (config.layout === "conservative" ? "140" : "160") +
    '" w:right="120"/><w:spacing w:before="20" w:after="90" w:line="' +
    config.bodyLine +
    '" w:lineRule="auto"/>' +
    (config.layout === "conservative"
      ? ""
      : '<w:shd w:val="clear" w:color="auto" w:fill="' +
        config.colors.soft +
        '"/>');
  const normal = style(
    "Normal",
    "Normal",
    "Normal",
    '<w:spacing w:before="0" w:after="' +
      config.bodyAfter +
      '" w:line="' +
      config.bodyLine +
      '" w:lineRule="auto"/><w:widowControl/>',
    fontProperties(config.bodySize, config.fonts.body, config.colors.text),
    true,
  );
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:docDefaults><w:rPrDefault><w:rPr>' +
    fontProperties(config.bodySize, config.fonts.body, config.colors.text) +
    "</w:rPr></w:rPrDefault></w:docDefaults>" +
    normal +
    style(
      "Title",
      "Dokumenttitel",
      "Normal",
      titleParagraph,
      fontProperties(config.titleSize, config.fonts.title, config.colors.title, "<w:b/>"),
    ) +
    style(
      "CoverSubject",
      "Anschreiben Betreff",
      "Normal",
      '<w:spacing w:before="160" w:after="120"/><w:keepNext/>',
      fontProperties(22, config.fonts.heading, config.colors.text, "<w:b/>"),
    ) +
    style(
      "Subtitle",
      "CV Positionierung",
      "Normal",
      '<w:spacing w:before="0" w:after="36"/><w:keepNext/>',
      fontProperties(23, config.fonts.heading, config.colors.accent, "<w:b/>"),
    ) +
    style(
      "Tagline",
      "CV Schwerpunkte",
      "Normal",
      '<w:spacing w:before="0" w:after="44"/><w:keepNext/>',
      fontProperties(20, config.fonts.body, config.colors.muted),
    ) +
    style(
      "Contact",
      "Kontakt",
      "Normal",
      '<w:spacing w:before="0" w:after="52"/><w:keepNext/>',
      fontProperties(20, config.fonts.body, config.colors.muted),
    ) +
    style(
      "Recipient",
      "Empfänger",
      "Normal",
      '<w:spacing w:before="0" w:after="24"/><w:keepNext/>',
      fontProperties(20, config.fonts.body, config.colors.text),
    ) +
    style(
      "LetterDate",
      "Ort und Datum",
      "Normal",
      '<w:jc w:val="right"/><w:spacing w:before="80" w:after="80"/><w:keepNext/>',
      fontProperties(20, config.fonts.body, config.colors.text),
    ) +
    style(
      "Greeting",
      "Anrede",
      "Normal",
      '<w:spacing w:before="120" w:after="120"/><w:keepNext/>',
      fontProperties(Math.max(20, config.bodySize), config.fonts.body, config.colors.text),
    ) +
    style(
      "Heading1",
      "Überschrift 1",
      "Normal",
      '<w:spacing w:before="' +
        config.headingBefore +
        '" w:after="' +
        config.headingAfter +
        '"/><w:keepNext/><w:keepLines/><w:outlineLvl w:val="0"/>' +
        headingBorder,
      fontProperties(Math.max(20, config.heading1Size), config.fonts.heading, config.colors.heading, "<w:b/>"),
    ) +
    style(
      "Heading2",
      "Überschrift 2",
      "Normal",
      '<w:spacing w:before="92" w:after="24"/><w:keepNext/><w:keepLines/><w:outlineLvl w:val="1"/>',
      fontProperties(Math.max(20, config.heading2Size), config.fonts.heading, config.colors.accent, "<w:b/>"),
    ) +
    style(
      "Kicker",
      "Dokumenttyp",
      "Normal",
      '<w:spacing w:before="0" w:after="24"/><w:keepNext/>',
      fontProperties(20, config.fonts.body, config.colors.rule, "<w:b/><w:caps/>"),
    ) +
    style(
      "Date",
      "CV Datum",
      "Normal",
      '<w:spacing w:before="78" w:after="12"/><w:keepNext/>',
      fontProperties(20, config.fonts.body, config.colors.accent, "<w:b/>"),
    ) +
    style(
      "Company",
      "CV Unternehmen",
      "Normal",
      '<w:spacing w:before="0" w:after="24"/><w:keepNext/>',
      fontProperties(20, config.fonts.body, config.colors.muted, "<w:i/>"),
    ) +
    style(
      "Bullet",
      "Aufzählung",
      "Normal",
      '<w:spacing w:before="0" w:after="' +
        Math.max(24, config.bodyAfter - 12) +
        '" w:line="' +
        config.bodyLine +
        '" w:lineRule="auto"/>',
      fontProperties(config.bodySize, config.fonts.body, config.colors.text),
    ) +
    style(
      "Callout",
      "Kernbotschaft",
      "Normal",
      calloutParagraph,
      fontProperties(config.bodySize, config.fonts.body, config.colors.text),
    ) +
    style(
      "Header",
      "Kopfzeile",
      "Normal",
      '<w:spacing w:after="0"/>',
      fontProperties(20, config.fonts.body, config.colors.muted),
    ) +
    style(
      "Footer",
      "Fußzeile",
      "Normal",
      '<w:spacing w:after="0"/>',
      fontProperties(20, config.fonts.body, config.colors.muted),
    ) +
    style(
      "Figure",
      "Inline-Visualisierung",
      "Normal",
      '<w:jc w:val="center"/><w:spacing w:before="100" w:after="28"/><w:keepNext/>',
      fontProperties(config.bodySize, config.fonts.body, config.colors.text),
    ) +
    style(
      "Caption",
      "Visualisierungstitel",
      "Normal",
      '<w:jc w:val="center"/><w:spacing w:before="0" w:after="100"/><w:keepLines/>',
      fontProperties(20, config.fonts.body, config.colors.muted, "<w:i/>"),
    ) +
    "</w:styles>"
  );
}

function titleFromContent(content: string): string {
  return stripMarkdown(
    content
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .find((line) => /^#\s+/.test(line))
      ?.replace(/^#\s+/, "") || "Bewerbungsunterlage",
  );
}

function headerXml(
  content: string,
  kind: DocxArtifactKind,
  config: ResolvedArtifactConfig,
): string {
  if (kind === "cover-letter") {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p/></w:hdr>'
    );
  }
  const title = titleFromContent(content).slice(0, 90);
  const tabPosition = config.page.width - config.margins.left - config.margins.right;
  const mastheadBorder =
    config.layout === "gerris"
      ? ""
      : '<w:pBdr><w:bottom w:val="single" w:sz="' +
        (config.layout === "modern" ? "12" : config.layout === "professional" ? "8" : "4") +
        '" w:space="5" w:color="' +
        (config.layout === "professional" ? config.colors.rule : config.colors.accent) +
        '"/></w:pBdr>';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:p><w:pPr><w:pStyle w:val="Header"/><w:tabs><w:tab w:val="right" w:pos="' +
    tabPosition +
    '"/></w:tabs>' +
    mastheadBorder +
    '</w:pPr>' +
    run(CONFIG[kind].label, { bold: true, color: config.colors.accent }) +
    run("\t" + title, { color: config.colors.muted }) +
    "</w:p></w:hdr>"
  );
}

function footerXml(
  kind: DocxArtifactKind,
  config: ResolvedArtifactConfig,
): string {
  if (kind === "cover-letter") {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p/></w:ftr>'
    );
  }
  const tabPosition = config.page.width - config.margins.left - config.margins.right;
  const footerBorder =
    config.layout === "professional" || config.layout === "conservative"
      ? '<w:pBdr><w:top w:val="single" w:sz="4" w:space="5" w:color="' +
        config.colors.rule +
        '"/></w:pBdr>'
      : "";
  const stand = new Intl.DateTimeFormat("de-DE", {
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Berlin",
  })
    .format(new Date())
    .replace(".", "/");
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:p><w:pPr><w:pStyle w:val="Footer"/><w:tabs><w:tab w:val="right" w:pos="' +
    tabPosition +
    '"/></w:tabs>' +
    footerBorder +
    '</w:pPr>' +
    run(CONFIG[kind].label + "  |  Stand " + stand, { color: config.colors.muted }) +
    run("\tSeite ", { color: config.colors.muted }) +
    '<w:fldSimple w:instr=" PAGE ">' +
    run("1", { color: config.colors.muted }) +
    "</w:fldSimple>" +
    run(" / ", { color: config.colors.muted }) +
    '<w:fldSimple w:instr=" NUMPAGES ">' +
    run("1", { color: config.colors.muted }) +
    "</w:fldSimple></w:p></w:ftr>"
  );
}

function documentXml(
  content: string,
  kind: DocxArtifactKind,
  links: MasterCvLink[],
  relationships: DocumentRelationships,
  config: ResolvedArtifactConfig,
  media: DocxEmbeddedMedia[],
): string {
  const margins = config.margins;
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    "<w:body>" +
    bodyXml(content, kind, links, relationships, config, media) +
    "<w:sectPr>" +
    '<w:headerReference w:type="default" r:id="rId2"/>' +
    '<w:footerReference w:type="default" r:id="rId3"/>' +
    '<w:pgSz w:w="' +
    config.page.width +
    '" w:h="' +
    config.page.height +
    '"/>' +
    '<w:pgMar w:top="' +
    margins.top +
    '" w:right="' +
    margins.right +
    '" w:bottom="' +
    margins.bottom +
    '" w:left="' +
    margins.left +
    '" w:header="300" w:footer="360" w:gutter="0"/>' +
    '<w:cols w:space="708"/><w:docGrid w:linePitch="360"/>' +
    "</w:sectPr></w:body></w:document>"
  );
}

function corePropertiesXml(content: string): string {
  const now = new Date().toISOString();
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    "<dc:title>" +
    xml(titleFromContent(content)) +
    '</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">' +
    now +
    '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' +
    now +
    "</dcterms:modified></cp:coreProperties>"
  );
}

function contentTypesXml(media: DocxEmbeddedMedia[]): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    (media.length ? '<Default Extension="png" ContentType="image/png"/>' : "") +
    (media.some((item) => item.svgBytes?.length)
      ? '<Default Extension="svg" ContentType="image/svg+xml"/>'
      : "") +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
    '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' +
    '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
    '<Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>' +
    '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    "</Types>"
  );
}

const rootRelationships =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
  '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
  "</Relationships>";

const settingsXml =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:updateFields w:val="true"/><w:defaultTabStop w:val="708"/>' +
  '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>' +
  "</w:settings>";

function fontTableXml(config: ResolvedArtifactConfig): string {
  const fonts = [...new Set(Object.values(config.fonts))];
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    fonts
      .map((font) => {
        const family = /Georgia|Times|Cambria|Caladea|Garamond|Baskerville/i.test(font)
          ? "roman"
          : "swiss";
        const alternative =
          font === "Carlito"
            ? "Calibri"
            : font === "Caladea"
              ? "Cambria"
              : "";
        return (
          '<w:font w:name="' +
          xml(font) +
          '"><w:family w:val="' +
          family +
          '"/>' +
          (alternative ? `<w:altName w:val="${alternative}"/>` : "") +
          '<w:charset w:val="00"/><w:pitch w:val="variable"/></w:font>'
        );
      })
      .join("") +
    "</w:fonts>"
  );
}

function numberingXml(config: ResolvedArtifactConfig): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/>' +
    '<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/>' +
    '<w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:suff w:val="tab"/>' +
    '<w:pPr><w:tabs><w:tab w:val="num" w:pos="340"/></w:tabs>' +
    '<w:ind w:left="340" w:hanging="200"/></w:pPr>' +
    '<w:rPr><w:rFonts w:ascii="' +
    xml(config.fonts.body) +
    '" w:hAnsi="' +
    xml(config.fonts.body) +
    '" w:eastAsia="' +
    xml(config.fonts.body) +
    '" w:cs="' +
    xml(config.fonts.body) +
    '"/><w:color w:val="' +
    config.colors.accent +
    '"/><w:lang w:val="de-DE" w:eastAsia="de-DE" w:bidi="de-DE"/></w:rPr></w:lvl></w:abstractNum>' +
    '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>' +
    "</w:numbering>"
  );
}

const appPropertiesXml =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
  "<Application>Gerris Kompass</Application><AppVersion>2.0</AppVersion>" +
  "</Properties>";

export function createEditableDocx(
  content: string,
  kind: DocxArtifactKind = "company-brief",
  links: MasterCvLink[] = [],
  options: DocxExportOptions = {},
): Uint8Array {
  const media = options.media ? [...options.media] : [];
  const config = artifactConfig(
    content,
    kind,
    options.presetId ?? "gerris",
    options.templateProfile,
  );
  const relationships = new DocumentRelationships();
  const document = documentXml(
    content,
    kind,
    links,
    relationships,
    config,
    media,
  );
  const packageParts: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(contentTypesXml(media)),
    "_rels/.rels": strToU8(rootRelationships),
    "docProps/core.xml": strToU8(corePropertiesXml(content)),
    "docProps/app.xml": strToU8(appPropertiesXml),
    "word/document.xml": strToU8(document),
    "word/styles.xml": strToU8(stylesXml(kind, config)),
    "word/settings.xml": strToU8(settingsXml),
    "word/fontTable.xml": strToU8(fontTableXml(config)),
    "word/numbering.xml": strToU8(numberingXml(config)),
    "word/header1.xml": strToU8(headerXml(content, kind, config)),
    "word/footer1.xml": strToU8(footerXml(kind, config)),
    "word/_rels/document.xml.rels": strToU8(relationships.xml()),
  };
  media.forEach((item, index) => {
    packageParts[`word/media/visual-${index + 1}.png`] = item.pngBytes;
    if (item.svgBytes?.length) {
      packageParts[`word/media/visual-${index + 1}.svg`] = item.svgBytes;
    }
  });
  return zipSync(
    packageParts,
    { level: 6 },
  );
}

function downloadBytes(fileName: string, bytes: Uint8Array): void {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const url = URL.createObjectURL(new Blob([buffer], { type: CONTENT_TYPE }));
  const link = document.createElement("a");
  link.href = url;
  const safeName = fileName.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 180);
  link.download = safeName.toLowerCase().endsWith(".docx")
    ? safeName
    : safeName + ".docx";
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadEditableDocx(
  fileName: string,
  content: string,
  kind: DocxArtifactKind = "company-brief",
  links: MasterCvLink[] = [],
  options: DocxExportOptions = {},
): void {
  downloadBytes(fileName, createEditableDocx(content, kind, links, options));
}
