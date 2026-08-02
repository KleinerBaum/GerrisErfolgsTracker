import { env } from "cloudflare:workers";

import { ownerEmail, ownerHash, sameOrigin } from "../../../lib/server-auth";
import { parseMasterCvDocument } from "../../../lib/server/master-cv-import";
import type { DocumentRef, MasterCvContent } from "../../../lib/types";

export const dynamic = "force-dynamic";

const MAX_CV_BYTES = 8 * 1024 * 1024;
const CV_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function cleanName(value: string, fallback: string): string {
  return (
    value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 240) ||
    fallback
  );
}
function documentRef({
  fileId,
  name,
  destination,
  contentType,
  sizeBytes,
  tags,
  note,
  modifiedAt,
}: {
  fileId: string;
  name: string;
  destination: string;
  contentType: string;
  sizeBytes: number;
  tags: string[];
  note: string;
  modifiedAt: string;
}): DocumentRef {
  const downloadUrl = `/api/files/${fileId}`;
  return {
    id: `upload-${fileId}`,
    name,
    folderPath: destination,
    kind: contentType === CV_CONTENT_TYPE ? "document" : "other",
    driveUrl: downloadUrl,
    fileId: null,
    modifiedAt,
    tags: ["Private Ablage", ...tags],
    confidential: true,
    storage: "upload",
    downloadUrl,
    contentType,
    sizeBytes,
    note,
    reviewAt: null,
  };
}

export async function POST(request: Request) {
  const email = ownerEmail(request);
  if (!email) {
    return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return Response.json({ error: "Ungültiger Ursprung." }, { status: 403 });
  }
  if (!env.FILES) {
    return Response.json(
      { error: "Die private Dateiablage wird gerade vorbereitet." },
      { status: 503 },
    );
  }

  let cvKey = "";
  try {
    const form = await request.formData();
    const cv = form.get("cv");
    if (!(cv instanceof File) || cv.size === 0) {
      return Response.json(
        { error: "Bitte den Master-CV als DOCX auswählen." },
        { status: 400 },
      );
    }
    if (!cv.name.toLowerCase().endsWith(".docx")) {
      return Response.json(
        { error: "Der bearbeitbare Import unterstützt DOCX-Dateien." },
        { status: 415 },
      );
    }
    if (cv.size > MAX_CV_BYTES) {
      return Response.json(
        { error: "Der Master-CV darf höchstens 8 MB groß sein." },
        { status: 413 },
      );
    }
    const cvBytes = new Uint8Array(await cv.arrayBuffer());
    const importedAt = new Date().toISOString();
    let parsed: ReturnType<typeof parseMasterCvDocument>;
    try {
      parsed = parseMasterCvDocument(cvBytes, importedAt);
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Der Master-CV konnte nicht gelesen werden.",
        },
        { status: 400 },
      );
    }

    const hash = await ownerHash(email);
    const cvFileId = crypto.randomUUID();
    cvKey = `${hash}/${cvFileId}`;
    const cvName = cleanName(cv.name, "Master-CV.docx");
    const cvDestination = "Persönlich/Bewerbungen/Master-CV";

    try {
      await env.FILES.put(cvKey, cvBytes, {
        httpMetadata: { contentType: CV_CONTENT_TYPE },
        customMetadata: {
          owner: hash,
          originalName: cvName,
          destination: cvDestination,
        },
      });
    } catch {
      await env.FILES.delete(cvKey);
      return Response.json(
        { error: "Der Master-CV konnte nicht sicher abgelegt werden." },
        { status: 503 },
      );
    }

    const cvDocument = documentRef({
      fileId: cvFileId,
      name: cvName,
      destination: cvDestination,
      contentType: CV_CONTENT_TYPE,
      sizeBytes: cv.size,
      tags: ["Bewerbungen", "Master-CV", "Original"],
      note: "Originalquelle für den bearbeitbaren Master-CV",
      modifiedAt: importedAt,
    });
    const masterCvContent: MasterCvContent = {
      schemaVersion: 1,
      sourceDocumentId: cvDocument.id,
      passportDocumentId: null,
      name: parsed.name,
      headline: parsed.headline,
      subheadline: parsed.subheadline,
      contactLine: parsed.contactLine,
      language: parsed.language,
      sections: parsed.sections,
      passport: parsed.passport,
      importedAt,
      updatedAt: importedAt,
      editRevision: 0,
    };
    return Response.json({
      cvDocument,
      masterCvContent,
    });
  } catch {
    if (cvKey) await env.FILES.delete(cvKey);
    return Response.json(
      { error: "Der Master-CV-Import konnte nicht abgeschlossen werden." },
      { status: 500 },
    );
  }
}
