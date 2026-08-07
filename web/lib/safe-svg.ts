export type SafeSvgAsset = {
  svg: string;
  width: number;
  height: number;
  warnings: string[];
};

const SVG_ACTIVE_ELEMENT =
  /<(?:script|foreignObject|iframe|object|embed|audio|video|animate|animateMotion|animateTransform|set)\b/i;
const SVG_EVENT_ATTRIBUTE = /\son[a-z][\w:-]*\s*=/i;
const SVG_DANGEROUS_CSS = /@import|expression\s*\(|-moz-binding/i;
const SVG_HREF_ATTRIBUTE = /\s(?:href|xlink:href)\s*=\s*(["'])(.*?)\1/gi;
const SVG_CSS_URL = /url\(\s*(["']?)(.*?)\1\s*\)/gi;

function parseSvgLength(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^\s*(\d+(?:\.\d+)?)\s*(px|pt|in|cm|mm)?\s*$/i.exec(value);
  if (!match) return null;
  const amount = Number(match[1]);
  const multiplier: Record<string, number> = {
    px: 1,
    pt: 96 / 72,
    in: 96,
    cm: 96 / 2.54,
    mm: 96 / 25.4,
  };
  const pixels = amount * (multiplier[(match[2] || "px").toLowerCase()] ?? 1);
  return Number.isFinite(pixels) && pixels > 0 && pixels <= 20_000
    ? pixels
    : null;
}

function rootAttribute(root: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, "i").exec(root);
  return match?.[2];
}

function svgDimensions(svg: string): { width: number; height: number } {
  const root = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? "";
  let width = parseSvgLength(rootAttribute(root, "width"));
  let height = parseSvgLength(rootAttribute(root, "height"));
  const viewBox = rootAttribute(root, "viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    (!width || !height) &&
    viewBox?.length === 4 &&
    viewBox.every(Number.isFinite) &&
    viewBox[2] > 0 &&
    viewBox[3] > 0
  ) {
    width ||= Math.min(20_000, viewBox[2]);
    height ||= Math.min(20_000, viewBox[3]);
  }
  if (!width || !height) {
    throw new Error("Die SVG-Datei enthält keine sichere Größenangabe.");
  }
  return { width: Math.round(width), height: Math.round(height) };
}

export function sanitizeSvg(svgInput: string): SafeSvgAsset {
  let svg = svgInput.replace(/^\uFEFF/, "").trim();
  const warnings: string[] = [];
  if (!svg || svg.length > 8_000_000) {
    throw new Error("Die SVG-Datei ist leer oder zu groß.");
  }
  if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(svg)) {
    throw new Error("SVG-Dateien mit Entitäten sind nicht erlaubt.");
  }
  svg = svg.replace(/<!DOCTYPE[^>]*>\s*/gi, () => {
    warnings.push("Der SVG-Dokumenttyp wurde entfernt.");
    return "";
  });
  const withoutProlog = svg
    .replace(/^<\?xml[\s\S]*?\?>\s*/i, "")
    .replace(/^(?:<!--[\s\S]*?-->\s*)+/, "");
  if (!/^<svg(?:\s|>)/i.test(withoutProlog) || !/<\/svg>\s*$/i.test(withoutProlog)) {
    throw new Error("Die Datei ist kein eigenständiges SVG.");
  }
  if (SVG_ACTIVE_ELEMENT.test(svg) || SVG_EVENT_ATTRIBUTE.test(svg)) {
    throw new Error("Aktive SVG-Inhalte sind nicht erlaubt.");
  }
  if (SVG_DANGEROUS_CSS.test(svg)) {
    throw new Error("Aktive oder externe SVG-Styles sind nicht erlaubt.");
  }
  for (const match of svg.matchAll(SVG_HREF_ATTRIBUTE)) {
    if (!/^#[A-Za-z_][\w:.-]*$/.test(match[2].trim())) {
      throw new Error("Externe SVG-Ressourcen sind nicht erlaubt.");
    }
  }
  for (const match of svg.matchAll(SVG_CSS_URL)) {
    if (!/^#[A-Za-z_][\w:.-]*$/.test(match[2].trim())) {
      throw new Error("Externe SVG-Ressourcen sind nicht erlaubt.");
    }
  }
  const cleaned = svg
    .replace(/<metadata\b[\s\S]*?<\/metadata>\s*/gi, () => {
      warnings.push("SVG-Metadaten wurden entfernt.");
      return "";
    })
    .replace(/<!--([\s\S]*?)-->/g, () => {
      if (!warnings.includes("SVG-Kommentare wurden entfernt.")) {
        warnings.push("SVG-Kommentare wurden entfernt.");
      }
      return "";
    })
    .trim();
  const dimensions = svgDimensions(cleaned);
  return { svg: cleaned, ...dimensions, warnings };
}

export function decodeAndSanitizeSvg(bytes: Uint8Array): SafeSvgAsset {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Die SVG-Datei ist nicht gültig UTF-8-kodiert.");
  }
  return sanitizeSvg(text);
}

export function readPngDimensions(bytes: Uint8Array): {
  width: number;
  height: number;
} {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.length < 24 ||
    signature.some((value, index) => bytes[index] !== value) ||
    new TextDecoder().decode(bytes.subarray(12, 16)) !== "IHDR"
  ) {
    throw new Error("Die Datei besitzt keine gültige PNG-Signatur.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (!width || !height || width > 20_000 || height > 20_000 || width * height > 100_000_000) {
    throw new Error("Die PNG-Abmessungen sind ungültig oder zu groß.");
  }
  return { width, height };
}
