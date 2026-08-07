import { analyzeDocxTemplate } from "./docx-template-profile.ts";
import { decodeAndSanitizeSvg, readPngDimensions } from "./safe-svg.ts";

export type UploadSecurityResult =
  | { ok: true; contentType: string }
  | { ok: false; error: string };

const MIME_BY_EXTENSION: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png: "image/png",
  svg: "image/svg+xml",
};

export async function validateUploadedBytes(
  fileName: string,
  declaredContentType: string,
  bytes: Uint8Array,
): Promise<UploadSecurityResult> {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  try {
    if (extension === "docx") {
      const analysis = await analyzeDocxTemplate(bytes, fileName);
      if (analysis.status === "blocked") throw new Error(analysis.error);
    } else if (extension === "png") {
      readPngDimensions(bytes);
    } else if (extension === "svg") {
      decodeAndSanitizeSvg(bytes);
    } else if (/^(?:text\/html|application\/xhtml\+xml)$/i.test(declaredContentType)) {
      throw new Error("HTML-Dateien werden nicht unterstützt.");
    }
    return {
      ok: true,
      contentType:
        MIME_BY_EXTENSION[extension] ||
        declaredContentType ||
        "application/octet-stream",
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Dateityp und Dateiinhalt stimmen nicht überein.",
    };
  }
}
