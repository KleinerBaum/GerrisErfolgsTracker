import { analyzeDocxTemplate, type DocxTemplateAnalysis } from "./docx-template-profile";
import { safePrivateFileUrl } from "./document-library";
import { decodeAndSanitizeSvg, readPngDimensions } from "./safe-svg";
import type {
  ApplicationDocumentKind,
  ApplicationDocumentVisualization,
  DocumentRef,
} from "./types";
import type { DocxEmbeddedMedia } from "./docx-export";

export const APPLICATION_TEMPLATE_FOLDER =
  "Persönlich/Bewerbungen/Formatvorlagen";
export const APPLICATION_VISUAL_FOLDER =
  "Persönlich/Bewerbungen/Visualisierungen";

const fileExtension = (name: string): string =>
  name.split(".").pop()?.toLowerCase() ?? "";

export function applicationTemplateDocuments(
  documents: DocumentRef[],
): DocumentRef[] {
  return documents.filter(
    (document) =>
      document.storage === "upload" &&
      fileExtension(document.name) === "docx" &&
      (document.folderPath === APPLICATION_TEMPLATE_FOLDER ||
        document.tags.includes("Formatvorlage")),
  );
}

export function applicationVisualDocuments(
  documents: DocumentRef[],
): DocumentRef[] {
  return documents.filter(
    (document) =>
      document.storage === "upload" &&
      ["png", "svg"].includes(fileExtension(document.name)) &&
      (document.folderPath === APPLICATION_VISUAL_FOLDER ||
        document.tags.includes("Visualisierung")),
  );
}

export async function loadPrivateDocumentBytes(
  document: DocumentRef,
): Promise<Uint8Array> {
  const url = safePrivateFileUrl(document.downloadUrl || document.driveUrl);
  if (!url) throw new Error(`${document.name} ist nicht mehr sicher erreichbar.`);
  const response = await fetch(url, { headers: { accept: document.contentType || "*/*" } });
  if (!response.ok) throw new Error(`${document.name} konnte nicht geladen werden.`);
  return new Uint8Array(await response.arrayBuffer());
}

type UploadPayload = {
  fileId?: string;
  originalName?: string;
  contentType?: string;
  sizeBytes?: number;
  destination?: string;
  downloadUrl?: string;
  error?: string;
};

export async function uploadApplicationDesignFile(
  file: File,
  kind: "template" | "visual",
): Promise<{ document: DocumentRef; analysis: DocxTemplateAnalysis | null }> {
  const extension = fileExtension(file.name);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let analysis: DocxTemplateAnalysis | null = null;
  if (kind === "template") {
    if (extension !== "docx") {
      throw new Error("Formatvorlagen müssen DOCX-Dateien sein.");
    }
    analysis = await analyzeDocxTemplate(bytes, file.name);
    if (analysis.status === "blocked") throw new Error(analysis.error);
  } else if (extension === "png") {
    readPngDimensions(bytes);
  } else if (extension === "svg") {
    decodeAndSanitizeSvg(bytes);
  } else {
    throw new Error("Visualisierungen müssen PNG- oder SVG-Dateien sein.");
  }

  const destination =
    kind === "template" ? APPLICATION_TEMPLATE_FOLDER : APPLICATION_VISUAL_FOLDER;
  const form = new FormData();
  form.append("file", file);
  form.append("destination", destination);
  const response = await fetch("/api/files", { method: "POST", body: form });
  const payload = (await response.json()) as UploadPayload;
  if (
    !response.ok ||
    !payload.fileId ||
    !payload.downloadUrl ||
    !payload.contentType ||
    typeof payload.sizeBytes !== "number"
  ) {
    throw new Error(payload.error || "Die Datei konnte nicht sicher abgelegt werden.");
  }
  return {
    analysis,
    document: {
      id: `upload-${payload.fileId}`,
      name: file.name,
      folderPath: destination,
      kind: kind === "template" ? "document" : "other",
      driveUrl: payload.downloadUrl,
      fileId: null,
      modifiedAt: new Date().toISOString(),
      tags: ["Private Ablage", "Bewerbungen", kind === "template" ? "Formatvorlage" : "Visualisierung"],
      confidential: true,
      storage: "upload",
      downloadUrl: payload.downloadUrl,
      contentType: payload.contentType,
      sizeBytes: payload.sizeBytes,
      note:
        kind === "template"
          ? "Private Formatvorlage; ausschließlich das sichere Stilprofil wird verwendet."
          : "Private Visualisierung für Bewerbungsunterlagen.",
      reviewAt: null,
    },
  };
}

async function rasterizeSvg(
  svg: string,
  sourceWidth: number,
  sourceHeight: number,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    throw new Error("Die SVG-Vorschau kann in dieser Umgebung nicht rasterisiert werden.");
  }
  const scale = Math.min(1, 2_400 / sourceWidth, 2_400 / sourceHeight);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const sourceUrl = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const image = new Image();
    image.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Das bereinigte SVG konnte nicht dargestellt werden."));
      image.src = sourceUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Die PNG-Ersatzgrafik konnte nicht erzeugt werden.");
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(new Error("Die PNG-Ersatzgrafik konnte nicht gespeichert werden.")),
        "image/png",
      ),
    );
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export async function prepareDocxVisualization(
  source: DocumentRef,
  configuration: ApplicationDocumentVisualization,
): Promise<DocxEmbeddedMedia> {
  if (!configuration.confirmedAt) {
    throw new Error(`Der Inhalt von „${source.name}“ wurde noch nicht bestätigt.`);
  }
  if (!configuration.title.trim() || !configuration.altText.trim()) {
    throw new Error(`Titel und Alternativtext für „${source.name}“ sind erforderlich.`);
  }
  const bytes = await loadPrivateDocumentBytes(source);
  const extension = fileExtension(source.name);
  if (extension === "png") {
    const dimensions = readPngDimensions(bytes);
    return {
      id: configuration.id,
      title: configuration.title,
      altText: configuration.altText,
      placement: configuration.placement,
      pngBytes: bytes,
      width: dimensions.width,
      height: dimensions.height,
    };
  }
  if (extension === "svg") {
    const safe = decodeAndSanitizeSvg(bytes);
    const fallback = await rasterizeSvg(safe.svg, safe.width, safe.height);
    return {
      id: configuration.id,
      title: configuration.title,
      altText: configuration.altText,
      placement: configuration.placement,
      pngBytes: fallback.bytes,
      svgBytes: new TextEncoder().encode(safe.svg),
      width: fallback.width,
      height: fallback.height,
    };
  }
  throw new Error(`„${source.name}“ ist weder PNG noch SVG.`);
}

export function newVisualizationConfiguration(
  document: DocumentRef,
  outputKinds: ApplicationDocumentKind[],
): ApplicationDocumentVisualization {
  return {
    id: `visual-${crypto.randomUUID()}`,
    sourceDocumentId: document.id,
    title: document.name.replace(/\.(?:png|svg)$/i, "").replace(/[_-]+/g, " ").trim(),
    altText: "",
    targetKinds: outputKinds.length ? [...outputKinds] : ["tailored-cv"],
    placement: "after-skills",
    confirmedAt: null,
  };
}
