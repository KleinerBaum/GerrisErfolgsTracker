import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const NAVY = "142A3A";
const TEAL = "17605E";
const TEXT = "26343E";
const MUTED = "60717C";
const GOLD = "C29A4A";

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
    .replace(/^\*\*(.+)\*\*$/, "$1")
    .replace(/^\*(.+)\*$/, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .trim();
}

function categoryColor(value: string): string {
  if (/^(?:DIGITAL & SYSTEME|AI & DATA|PRODUCT|ORGANISATION)/i.test(value)) {
    return "1A7F79";
  }
  if (/^(?:PROJEKT & PROZESS|DELIVERY|STEUERN|PERSÖNLICHE STEUERUNG)/i.test(value)) {
    return "486E86";
  }
  if (/^(?:PEOPLE & ENABLEMENT|TRAINING|VERMITTELN|ENABLEMENT)/i.test(value)) {
    return "A67019";
  }
  if (/^(?:SALES & CONSULTING|BUSINESS|ABSCHLIESSEN|CONTENT)/i.test(value)) {
    return "765F83";
  }
  return TEAL;
}

function run(
  value: string,
  options: { bold?: boolean; italic?: boolean; color?: string } = {},
): string {
  const properties = [
    '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial"/>',
    options.bold ? "<w:b/>" : "",
    options.italic ? "<w:i/>" : "",
    options.color ? `<w:color w:val="${options.color}"/>` : "",
    '<w:lang w:val="de-DE"/>',
  ].join("");
  return `<w:r><w:rPr>${properties}</w:rPr><w:t xml:space="preserve">${xml(value)}</w:t></w:r>`;
}

function inlineRuns(value: string, options: { labelColor?: string } = {}): string {
  const cleanValue = value.trim();
  const label = /^([A-ZÄÖÜ0-9][A-ZÄÖÜ0-9 &/+.-]{2,42}:)\s*(.*)$/u.exec(cleanValue);
  if (label) {
    return `${run(label[1], {
      bold: true,
      color: options.labelColor || categoryColor(label[1]),
    })}${label[2] ? run(` ${label[2]}`) : ""}`;
  }
  const parts = cleanValue.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return parts
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

function paragraph(
  style: string,
  value: string,
  options: {
    bullet?: boolean;
    proof?: boolean;
    keepNext?: boolean;
    pageBreakBefore?: boolean;
    rightInsetTwips?: number;
  } = {},
): string {
  const color = categoryColor(value);
  const direct = options.bullet
    ? '<w:ind w:left="360" w:hanging="180"/>'
    : options.proof
      ? `<w:ind w:left="120" w:right="80"/><w:shd w:val="clear" w:color="auto" w:fill="EAF1F2"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="5" w:color="${color}"/></w:pBdr>`
      : "";
  const layout = `${options.keepNext ? "<w:keepNext/>" : ""}${
    options.pageBreakBefore ? "<w:pageBreakBefore/>" : ""
  }${
    options.rightInsetTwips
      ? `<w:ind w:right="${options.rightInsetTwips}"/>`
      : ""
  }`;
  const content = options.bullet
    ? `${run("•", { bold: true, color })}${run("  ")}${inlineRuns(value, { labelColor: color })}`
    : inlineRuns(value, { labelColor: color });
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/>${direct}${layout}</w:pPr>${content}</w:p>`;
}

function bodyXml(content: string, topRightInsetTwips = 0): string {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const isCv = lines.some((line) => /^BEWERBUNGSFASSUNG\s*\|/i.test(line));
  const isLongCv = isCv && content.trim().split(/\s+/).length >= 900;
  let titleSeen = false;
  let firstSectionSeen = false;
  let cvHeaderIndex = 0;
  let roleHeadingSeen = false;
  const paragraphs: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const value = stripMarkdown(heading[2]);
      if (level === 1 && !titleSeen) {
        titleSeen = true;
        paragraphs.push(
          paragraph("Title", value, { rightInsetTwips: topRightInsetTwips }),
        );
      } else if (level <= 2) {
        firstSectionSeen = true;
        roleHeadingSeen = false;
        paragraphs.push(
          paragraph("Heading1", value, {
            pageBreakBefore: isLongCv && /^KERNKOMPETENZEN$/i.test(value),
          }),
        );
      } else {
        roleHeadingSeen = true;
        paragraphs.push(paragraph("Heading2", value));
      }
      continue;
    }
    if (/^BEWERBUNGSFASSUNG\s*\|/i.test(line)) {
      paragraphs.push(
        paragraph("CVKicker", stripMarkdown(line), {
          rightInsetTwips: topRightInsetTwips,
        }),
      );
      continue;
    }
    const cleanLine = stripMarkdown(line);
    if (/^\*\*.*\*\*$/.test(line) && /\d/.test(cleanLine)) {
      paragraphs.push(paragraph("CVDate", cleanLine));
      roleHeadingSeen = false;
      continue;
    }
    if (/^\*(?!\*)(.+)\*$/.test(line) && roleHeadingSeen) {
      paragraphs.push(paragraph("CVCompany", cleanLine));
      roleHeadingSeen = false;
      continue;
    }
    const bullet = /^\s*(?:[-•])\s+(.+)$/.exec(line);
    if (bullet) {
      paragraphs.push(paragraph("CVBullet", bullet[1], { bullet: true }));
      continue;
    }
    if (/^MANDAT\s*&\s*KONTEXT:/i.test(cleanLine)) {
      paragraphs.push(paragraph("CVSmall", cleanLine, { keepNext: true }));
      continue;
    }
    if (isCv && titleSeen && !firstSectionSeen) {
      const style =
        cvHeaderIndex === 0
          ? "Subtitle"
          : cvHeaderIndex === 1
            ? "CVTagline"
            : "CVContact";
      cvHeaderIndex += 1;
      paragraphs.push(
        paragraph(style, cleanLine, { rightInsetTwips: topRightInsetTwips }),
      );
      continue;
    }
    if (
      isCv &&
      firstSectionSeen &&
      /^[A-ZÄÖÜ0-9][A-ZÄÖÜ0-9 &/+.-]{2,42}:\s+/u.test(cleanLine)
    ) {
      paragraphs.push(paragraph("CVProof", cleanLine, { proof: true }));
      continue;
    }
    paragraphs.push(paragraph("Normal", cleanLine));
  }
  return paragraphs.join("\n");
}

const DEFAULT_SECTION_PROPERTIES = `<w:sectPr>
  <w:headerReference w:type="default" r:id="rId2"/>
  <w:footerReference w:type="default" r:id="rId3"/>
  <w:pgSz w:w="11906" w:h="16838"/>
  <w:pgMar w:top="850" w:right="850" w:bottom="794" w:left="850" w:header="227" w:footer="397" w:gutter="0"/>
  <w:cols w:space="708"/>
  <w:docGrid w:linePitch="360"/>
</w:sectPr>`;

function documentXml(
  content: string,
  sectionProperties = DEFAULT_SECTION_PROPERTIES,
  topRightInsetTwips = 0,
): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyXml(content, topRightInsetTwips)}
    ${sectionProperties}
  </w:body>
</w:document>`;
}

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial"/><w:sz w:val="19"/><w:szCs w:val="19"/><w:color w:val="${TEXT}"/><w:lang w:val="de-DE"/></w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="48" w:line="252" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="19"/><w:szCs w:val="19"/><w:color w:val="${TEXT}"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="20" w:line="228" w:lineRule="auto"/><w:keepNext/></w:pPr><w:rPr><w:b/><w:color w:val="${NAVY}"/><w:sz w:val="50"/><w:szCs w:val="50"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="40"/><w:keepNext/></w:pPr><w:rPr><w:b/><w:color w:val="${TEAL}"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="160" w:after="90" w:line="240" w:lineRule="auto"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="${NAVY}"/><w:sz w:val="25"/><w:szCs w:val="25"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="120" w:after="20"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="${NAVY}"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="CVKicker"><w:name w:val="CV Kicker"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:after="20"/></w:pPr><w:rPr><w:b/><w:color w:val="${GOLD}"/><w:sz w:val="18"/><w:szCs w:val="18"/><w:caps/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="CVTagline"><w:name w:val="CV Tagline"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/></w:pPr><w:rPr><w:color w:val="${MUTED}"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="CVContact"><w:name w:val="CV Contact"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="20"/></w:pPr><w:rPr><w:color w:val="${MUTED}"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="CVDate"><w:name w:val="CV Date"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="120" w:after="10"/></w:pPr><w:rPr><w:b/><w:color w:val="${TEAL}"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="CVCompany"><w:name w:val="CV Company"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:after="30"/></w:pPr><w:rPr><w:color w:val="${MUTED}"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="CVSmall"><w:name w:val="CV Small"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="30"/></w:pPr><w:rPr><w:color w:val="${MUTED}"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="CVBullet"><w:name w:val="CV Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360" w:hanging="180"/><w:spacing w:after="25" w:line="247" w:lineRule="auto"/></w:pPr><w:rPr><w:color w:val="${TEXT}"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="CVProof"><w:name w:val="CV Proof"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="120" w:right="80"/><w:spacing w:after="60" w:line="245" w:lineRule="auto"/></w:pPr><w:rPr><w:color w:val="${TEXT}"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0"/></w:pPr><w:rPr><w:color w:val="${MUTED}"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0"/></w:pPr><w:rPr><w:color w:val="${MUTED}"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
</w:styles>`;

function titleFromContent(content: string): string {
  return stripMarkdown(
    content
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .find((line) => /^#\s+/.test(line))
      ?.replace(/^#\s+/, "") || "Bewerbungsunterlage",
  );
}

function headerXml(content: string): string {
  const title = titleFromContent(content).toLocaleUpperCase("de-DE");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:pStyle w:val="Header"/><w:jc w:val="right"/></w:pPr>${run(title, { bold: true, color: MUTED })}</w:p></w:hdr>`;
}

function footerXml(): string {
  const stand = new Intl.DateTimeFormat("de-DE", {
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Berlin",
  })
    .format(new Date())
    .replace(".", "/");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:pStyle w:val="Footer"/><w:tabs><w:tab w:val="right" w:pos="10205"/></w:tabs></w:pPr>${run(`Bewerbungsunterlage  |  Stand ${stand}`, { color: MUTED })}${run("\tSeite ", { color: MUTED })}<w:fldSimple w:instr=" PAGE ">${run("1", { color: MUTED })}</w:fldSimple>${run(" / ", { color: MUTED })}<w:fldSimple w:instr=" NUMPAGES ">${run("1", { color: MUTED })}</w:fldSimple></w:p></w:ftr>`;
}

const settingsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:updateFields w:val="true"/><w:defaultTabStop w:val="708"/><w:compat/></w:settings>`;

function corePropertiesXml(content: string): string {
  const title = titleFromContent(content);
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(title)}</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
}

function appPropertiesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Gerris Kompass</Application><AppVersion>1.0</AppVersion></Properties>`;
}

export function createEditableDocx(content: string): Uint8Array {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>`;
  return zipSync(
    {
      "[Content_Types].xml": strToU8(contentTypes),
      "_rels/.rels": strToU8(rootRels),
      "docProps/core.xml": strToU8(corePropertiesXml(content)),
      "docProps/app.xml": strToU8(appPropertiesXml()),
      "word/document.xml": strToU8(documentXml(content)),
      "word/styles.xml": strToU8(stylesXml),
      "word/settings.xml": strToU8(settingsXml),
      "word/header1.xml": strToU8(headerXml(content)),
      "word/footer1.xml": strToU8(footerXml()),
      "word/_rels/document.xml.rels": strToU8(documentRels),
    },
    { level: 6 },
  );
}

function raiseMinimumFontSize(value: string): string {
  return value.replace(
    /<w:(sz|szCs)\b([^>]*?)w:val="(\d+)"([^>]*)\/>/g,
    (match, tag: string, before: string, size: string, after: string) =>
      Number(size) < 18
        ? `<w:${tag}${before}w:val="18"${after}/>`
        : match,
  );
}

function removeHyperlinkRelationships(value: string): string {
  return value.replace(
    /\s*<Relationship\b[^>]*Type="[^"]*\/hyperlink"[^>]*\/>/g,
    "",
  );
}

function patchTemplateFooter(value: string): string {
  const stand = new Intl.DateTimeFormat("de-DE", {
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Berlin",
  })
    .format(new Date())
    .replace(".", "/");
  return raiseMinimumFontSize(value)
    .replace(/Master-Langfassung/g, "Bewerbungsfassung")
    .replace(/Stand\s+\d{2}\/\d{4}/g, `Stand ${stand}`)
    .replace(
      /Gerrit Fabisch\s+\|\s+Bewerbungsfassung\s+\|\s+Stand\s+\d{2}\/\d{4}/g,
      "Gerrit Fabisch  |  Bewerbungsfassung",
    );
}

function enableFieldUpdates(value: string): string {
  const withoutDuplicate = value.replace(/<w:updateFields\b[^>]*\/>/g, "");
  if (/<\/w:settings>/.test(withoutDuplicate)) {
    return withoutDuplicate.replace(
      /<\/w:settings>/,
      '<w:updateFields w:val="true"/></w:settings>',
    );
  }
  return withoutDuplicate.replace(
    /<w:settings\b([^>]*)\/>/,
    '<w:settings$1><w:updateFields w:val="true"/></w:settings>',
  );
}

export function createTemplateBackedDocx(
  content: string,
  templateBytes: Uint8Array,
): Uint8Array {
  const archive = unzipSync(templateBytes);
  const originalDocument = archive["word/document.xml"];
  const originalStyles = archive["word/styles.xml"];
  if (!originalDocument || !originalStyles) {
    throw new Error("Die DOCX-Vorlage enthält keine nutzbare Dokumentstruktur.");
  }
  const styles = strFromU8(originalStyles);
  for (const styleId of [
    "Title",
    "Subtitle",
    "Heading1",
    "Heading2",
    "CVKicker",
    "CVTagline",
    "CVContact",
    "CVDate",
    "CVCompany",
    "CVSmall",
    "CVBullet",
    "CVProof",
  ]) {
    if (!styles.includes(`w:styleId="${styleId}"`)) {
      throw new Error("Die DOCX-Vorlage verwendet kein kompatibles Master-CV-Design.");
    }
  }
  const originalXml = strFromU8(originalDocument);
  const sectionProperties = [...originalXml.matchAll(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)].at(-1)?.[0];
  if (!sectionProperties) {
    throw new Error("Die Seiteneinstellungen der DOCX-Vorlage fehlen.");
  }
  archive["word/document.xml"] = strToU8(
    documentXml(content, sectionProperties, 3_000),
  );
  archive["word/styles.xml"] = strToU8(raiseMinimumFontSize(styles));
  if (archive["word/stylesWithEffects.xml"]) {
    archive["word/stylesWithEffects.xml"] = strToU8(
      raiseMinimumFontSize(strFromU8(archive["word/stylesWithEffects.xml"])),
    );
  }
  for (const part of ["word/header1.xml", "word/header2.xml"]) {
    if (archive[part]) {
      archive[part] = strToU8(raiseMinimumFontSize(strFromU8(archive[part])));
    }
  }
  for (const part of ["word/footer1.xml", "word/footer2.xml"]) {
    if (archive[part]) {
      archive[part] = strToU8(patchTemplateFooter(strFromU8(archive[part])));
    }
  }
  if (archive["word/_rels/document.xml.rels"]) {
    archive["word/_rels/document.xml.rels"] = strToU8(
      removeHyperlinkRelationships(
        strFromU8(archive["word/_rels/document.xml.rels"]),
      ),
    );
  }
  archive["word/settings.xml"] = strToU8(
    archive["word/settings.xml"]
      ? enableFieldUpdates(strFromU8(archive["word/settings.xml"]))
      : settingsXml,
  );
  archive["docProps/core.xml"] = strToU8(corePropertiesXml(content));
  return zipSync(archive, { level: 6 });
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
    : `${safeName}.docx`;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadEditableDocx(fileName: string, content: string): void {
  downloadBytes(fileName, createEditableDocx(content));
}

export function downloadTemplateBackedDocx(
  fileName: string,
  content: string,
  templateBytes: Uint8Array,
): void {
  downloadBytes(fileName, createTemplateBackedDocx(content, templateBytes));
}
