import { env } from "cloudflare:workers";

import { ownerEmail, ownerHash, sameOrigin } from "../../../lib/server-auth";
import { validateUploadedBytes } from "../../../lib/upload-security";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "odt",
  "rtf",
  "txt",
  "md",
  "csv",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "jpg",
  "jpeg",
  "png",
  "svg",
  "webp",
  "heic",
]);

const value = (entry: FormDataEntryValue | null, max: number): string =>
  typeof entry === "string" ? entry.trim().slice(0, max) : "";

function inferredContentType(file: File, extension: string): string {
  if (file.type) return file.type;
  const known: Record<string, string> = {
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    svg: "image/svg+xml",
    webp: "image/webp",
  };
  return known[extension] ?? "application/octet-stream";
}

export async function POST(request: Request) {
  const email = ownerEmail(request);
  if (!email) {
    return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return Response.json({ error: "Ungültiger Ursprung." }, { status: 403 });
  }

  try {
    if (!env.FILES) {
      return Response.json(
        { error: "Die private Dateiablage wird gerade vorbereitet." },
        { status: 503 },
      );
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return Response.json({ error: "Bitte eine Datei auswählen." }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return Response.json(
        { error: "Eine Datei darf höchstens 20 MB groß sein." },
        { status: 413 },
      );
    }
    const originalName = file.name.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 240);
    const extension = originalName.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return Response.json(
        {
          error:
            "Unterstützt werden Dokumente, Tabellen, Präsentationen und gängige Bilddateien.",
        },
        { status: 415 },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = await validateUploadedBytes(
      originalName,
      file.type,
      bytes,
    );
    if (!validation.ok) {
      return Response.json({ error: validation.error }, { status: 415 });
    }

    const fileId = crypto.randomUUID();
    const hash = await ownerHash(email);
    const contentType =
      validation.contentType || inferredContentType(file, extension);
    const destination = value(form.get("destination"), 400) || "Persönlich/Fotos & Dokumente";
    await env.FILES.put(`${hash}/${fileId}`, bytes, {
      httpMetadata: { contentType },
      customMetadata: {
        owner: hash,
        originalName,
        destination,
      },
    });

    return Response.json({
      fileId,
      originalName,
      contentType,
      sizeBytes: file.size,
      destination,
      downloadUrl: `/api/files/${fileId}`,
    });
  } catch {
    return Response.json(
      { error: "Die Datei konnte nicht sicher abgelegt werden." },
      { status: 500 },
    );
  }
}
