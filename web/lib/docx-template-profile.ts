import { strFromU8, unzipSync } from "fflate";

export type DocxTemplateProfile = {
  sourceName: string;
  sourceFingerprint: string;
  status: "ready" | "adapted";
  warnings: string[];
  page: {
    width: number;
    height: number;
    margins: { top: number; right: number; bottom: number; left: number };
  };
  fonts: { body: string; title: string; heading: string };
  colors: { text: string; accent: string; muted: string; soft: string };
  sizes: { body: number; title: number; heading1: number; heading2: number };
  spacing: { bodyAfter: number; bodyLine: number; headingBefore: number; headingAfter: number };
};

export type DocxTemplateAnalysis =
  | { status: "blocked"; profile: null; warnings: string[]; error: string }
  | {
      status: "ready" | "adapted";
      profile: DocxTemplateProfile;
      warnings: string[];
      error: null;
    };

type ZipDirectory = { names: string[]; totalUncompressed: number };

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (
      bytes[offset] === 0x50 &&
      bytes[offset + 1] === 0x4b &&
      bytes[offset + 2] === 0x05 &&
      bytes[offset + 3] === 0x06
    ) {
      return offset;
    }
  }
  return -1;
}

function inspectZipDirectory(bytes: Uint8Array): ZipDirectory {
  const end = findEndOfCentralDirectory(bytes);
  if (end < 0) throw new Error("Die DOCX-Datei ist beschädigt.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  const directoryOffset = view.getUint32(end + 16, true);
  if (
    entries === 0 ||
    entries === 0xffff ||
    directoryOffset === 0xffffffff ||
    directorySize === 0xffffffff ||
    directoryOffset + directorySize > bytes.length
  ) {
    throw new Error("ZIP64- oder unvollständige DOCX-Dateien werden nicht unterstützt.");
  }
  const names: string[] = [];
  let totalUncompressed = 0;
  let totalCompressed = 0;
  let offset = directoryOffset;
  const decoder = new TextDecoder("utf-8");
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("Das DOCX-Inhaltsverzeichnis ist beschädigt.");
    }
    const flags = view.getUint16(offset + 8, true);
    const compressed = view.getUint32(offset + 20, true);
    const uncompressed = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    if (flags & 1) throw new Error("Verschlüsselte DOCX-Dateien werden nicht unterstützt.");
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > bytes.length) throw new Error("Das DOCX-Inhaltsverzeichnis ist unvollständig.");
    names.push(decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)));
    totalCompressed += compressed;
    totalUncompressed += uncompressed;
    offset = next;
  }
  if (
    totalUncompressed > 64 * 1024 * 1024 ||
    (totalCompressed > 0 && totalUncompressed / totalCompressed > 180)
  ) {
    throw new Error("Die entpackte DOCX-Datei überschreitet das sichere Größenlimit.");
  }
  return { names, totalUncompressed };
}

function clamp(value: number | null, minimum: number, maximum: number, fallback: number): number {
  return value === null || !Number.isFinite(value)
    ? fallback
    : Math.round(Math.min(maximum, Math.max(minimum, value)));
}

function xmlAttribute(fragment: string, name: string): string | null {
  return new RegExp(`\\b${name}=["']([^"']+)["']`, "i").exec(fragment)?.[1] ?? null;
}

function numericXmlAttribute(fragment: string, name: string): number | null {
  const raw = xmlAttribute(fragment, name);
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function tagAttribute(xml: string, tagName: string, attribute: string): string | null {
  const tag = new RegExp(`<${tagName}\\b[^>]*>`, "i").exec(xml)?.[0];
  return tag ? xmlAttribute(tag, attribute) : null;
}

function styleFragment(styles: string, ids: string[], names: RegExp): string {
  for (const match of styles.matchAll(/<w:style\b[\s\S]*?<\/w:style>/gi)) {
    const fragment = match[0];
    const id = xmlAttribute(fragment.slice(0, fragment.indexOf(">") + 1), "w:styleId") ?? "";
    const name = tagAttribute(fragment, "w:name", "w:val") ?? "";
    if (ids.includes(id) || names.test(name)) return fragment;
  }
  return "";
}

function safeFont(value: string | null, fallback: string): string {
  const candidate = value?.trim() ?? "";
  return /^[\p{L}\p{N} .,'&()+-]{1,80}$/u.test(candidate) ? candidate : fallback;
}

function fontFrom(fragment: string, theme: string, role: "major" | "minor", fallback: string): string {
  const direct = tagAttribute(fragment, "w:rFonts", "w:ascii") ||
    tagAttribute(fragment, "w:rFonts", "w:hAnsi");
  if (direct) return safeFont(direct, fallback);
  const themeBlock = new RegExp(`<a:${role}Font\\b[\\s\\S]*?<\\/a:${role}Font>`, "i").exec(theme)?.[0] ?? "";
  return safeFont(tagAttribute(themeBlock, "a:latin", "typeface"), fallback);
}

function colorFromTheme(theme: string, slot: string, fallback: string): string {
  const block = new RegExp(`<a:${slot}\\b[\\s\\S]*?<\\/a:${slot}>`, "i").exec(theme)?.[0] ?? "";
  return (
    tagAttribute(block, "a:srgbClr", "val") ||
    tagAttribute(block, "a:sysClr", "lastClr") ||
    fallback
  ).toUpperCase();
}

function colorFromStyle(fragment: string, theme: string, fallback: string): string {
  const direct = tagAttribute(fragment, "w:color", "w:val");
  if (direct && /^[0-9A-F]{6}$/i.test(direct)) return direct.toUpperCase();
  const themeColor = tagAttribute(fragment, "w:color", "w:themeColor");
  if (themeColor) return colorFromTheme(theme, themeColor.replace(/^accent/i, "accent"), fallback);
  return fallback;
}

function halfPoint(fragment: string): number | null {
  const value = Number(tagAttribute(fragment, "w:sz", "w:val"));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function spacing(fragment: string, key: string): number | null {
  const value = Number(tagAttribute(fragment, "w:spacing", key));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const owned = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", owned);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function analyzeDocxTemplate(
  bytes: Uint8Array,
  sourceName = "Formatvorlage.docx",
): Promise<DocxTemplateAnalysis> {
  const warnings: string[] = [];
  try {
    if (!sourceName.toLowerCase().endsWith(".docx")) {
      throw new Error("Als Formatvorlage wird ausschließlich DOCX unterstützt.");
    }
    const directory = inspectZipDirectory(bytes);
    const required = ["[Content_Types].xml", "word/document.xml", "word/styles.xml"];
    if (required.some((name) => !directory.names.includes(name))) {
      throw new Error("Die Datei enthält kein vollständiges Word-Dokument.");
    }
    if (
      directory.names.some((name) =>
        /(?:EncryptedPackage|EncryptionInfo|vbaProject\.bin)$/i.test(name),
      )
    ) {
      throw new Error("Verschlüsselte oder makrohaltige Vorlagen werden nicht unterstützt.");
    }
    const wanted = new Set([
      "[Content_Types].xml",
      "word/document.xml",
      "word/styles.xml",
      "word/settings.xml",
      "word/theme/theme1.xml",
      "word/_rels/document.xml.rels",
    ]);
    const archive = unzipSync(bytes, {
      filter: (entry) => wanted.has(entry.name),
    });
    const documentXml = strFromU8(archive["word/document.xml"]);
    const stylesXml = strFromU8(archive["word/styles.xml"]);
    const settingsXml = archive["word/settings.xml"]
      ? strFromU8(archive["word/settings.xml"])
      : "";
    const themeXml = archive["word/theme/theme1.xml"]
      ? strFromU8(archive["word/theme/theme1.xml"])
      : "";
    const relationshipsXml = archive["word/_rels/document.xml.rels"]
      ? strFromU8(archive["word/_rels/document.xml.rels"])
      : "";

    const riskChecks: Array<[RegExp | boolean, string]> = [
      [/<w:sdt\b/i.test(documentXml), "Inhaltssteuerelemente werden nicht übernommen."],
      [/<w:tbl\b/i.test(documentXml), "Layouttabellen werden nicht übernommen."],
      [/<w:drawing\b|<w:pict\b|<wp:anchor\b/i.test(documentXml), "Zeichnungen und schwebende Objekte werden nicht übernommen."],
      [/<w:vanish\b/i.test(documentXml), "Versteckte Inhalte werden nicht übernommen."],
      [/comments|customXml/i.test(directory.names.join("\n")), "Kommentare und benutzerdefinierte Daten werden nicht übernommen."],
      [/TargetMode=["']External["']/i.test(relationshipsXml), "Fremde Links und externe Beziehungen werden nicht übernommen."],
      [/<w:documentProtection\b/i.test(settingsXml), "Dokumentschutz wird nicht übernommen."],
      [directory.totalUncompressed > 8 * 1024 * 1024, "Große eingebettete Ressourcen werden nicht übernommen."],
    ];
    for (const [condition, warning] of riskChecks) {
      if (condition) warnings.push(warning);
    }

    const normal = styleFragment(stylesXml, ["Normal", "Standard"], /^(?:Normal|Standard)$/i);
    const title = styleFragment(stylesXml, ["Title", "Titel"], /^(?:Title|Titel)$/i);
    const heading1 = styleFragment(stylesXml, ["Heading1", "berschrift1", "Überschrift1"], /^(?:heading|überschrift)\s*1$/i);
    const heading2 = styleFragment(stylesXml, ["Heading2", "berschrift2", "Überschrift2"], /^(?:heading|überschrift)\s*2$/i);
    const defaults = /<w:docDefaults\b[\s\S]*?<\/w:docDefaults>/i.exec(stylesXml)?.[0] ?? "";
    const section = [...documentXml.matchAll(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/gi)].at(-1)?.[0] ?? "";
    const pageSize = /<w:pgSz\b[^>]*>/i.exec(section)?.[0] ?? "";
    const pageMargins = /<w:pgMar\b[^>]*>/i.exec(section)?.[0] ?? "";
    const bodyRaw = halfPoint(normal) ?? halfPoint(defaults);
    if (bodyRaw !== null && bodyRaw < 18) {
      warnings.push("Die Textgröße wurde aus Lesbarkeitsgründen auf mindestens 9 pt angehoben.");
    }
    const accent = colorFromTheme(themeXml, "accent2", colorFromStyle(heading1, themeXml, "17605E"));
    const text = colorFromStyle(normal, themeXml, colorFromTheme(themeXml, "dk1", "26343E"));
    const profile: DocxTemplateProfile = {
      sourceName: sourceName.slice(0, 240),
      sourceFingerprint: await sha256(bytes),
      status: warnings.length ? "adapted" : "ready",
      warnings,
      page: {
        width: clamp(numericXmlAttribute(pageSize, "w:w"), 9_000, 24_000, 11_906),
        height: clamp(numericXmlAttribute(pageSize, "w:h"), 12_000, 34_000, 16_838),
        margins: {
          top: clamp(numericXmlAttribute(pageMargins, "w:top"), 540, 2_880, 760),
          right: clamp(numericXmlAttribute(pageMargins, "w:right"), 540, 2_880, 900),
          bottom: clamp(numericXmlAttribute(pageMargins, "w:bottom"), 540, 2_880, 760),
          left: clamp(numericXmlAttribute(pageMargins, "w:left"), 540, 2_880, 900),
        },
      },
      fonts: {
        body: fontFrom(normal || defaults, themeXml, "minor", "Arial"),
        title: fontFrom(title || heading1, themeXml, "major", "Arial"),
        heading: fontFrom(heading1, themeXml, "major", "Arial"),
      },
      colors: {
        text,
        accent,
        muted: colorFromTheme(themeXml, "dk2", "60717C"),
        soft: "F7E9DF",
      },
      sizes: {
        body: clamp(bodyRaw, 18, 26, 20),
        title: clamp(halfPoint(title), 28, 64, 42),
        heading1: clamp(halfPoint(heading1), 20, 36, 24),
        heading2: clamp(halfPoint(heading2), 18, 32, 21),
      },
      spacing: {
        bodyAfter: clamp(spacing(normal, "w:after"), 20, 180, 48),
        bodyLine: clamp(spacing(normal, "w:line"), 216, 360, 240),
        headingBefore: clamp(spacing(heading1, "w:before"), 80, 280, 150),
        headingAfter: clamp(spacing(heading1, "w:after"), 30, 180, 64),
      },
    };
    return { status: profile.status, profile, warnings, error: null };
  } catch (error) {
    return {
      status: "blocked",
      profile: null,
      warnings,
      error: error instanceof Error ? error.message : "Die DOCX-Vorlage ist nicht lesbar.",
    };
  }
}
