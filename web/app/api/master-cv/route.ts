import { env } from "cloudflare:workers";

import { ownerEmail, ownerHash, sameOrigin } from "../../../lib/server-auth";
import { parseMasterCvBundle } from "../../../lib/server/master-cv-import";
import type { DocumentRef, MasterCvContent } from "../../../lib/types";

export const dynamic = "force-dynamic";

const MAX_CV_BYTES = 8 * 1024 * 1024;
const MAX_PASSPORT_BYTES = 2 * 1024 * 1024;
const CV_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PASSPORT_CONTENT_TYPE = "application/json";

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
  let passportKey = "";
  try {
    const form = await request.formData();
    const cv = form.get("cv");
    const passport = form.get("passport");
    if (!(cv instanceof File) || cv.size === 0) {
      return Response.json(
        { error: "Bitte den Master-CV als DOCX auswählen." },
        { status: 400 },
      );
    }
    if (!(passport instanceof File) || passport.size === 0) {
      return Response.json(
        { error: "Bitte den Career Passport als JSON auswählen." },
        { status: 400 },
      );
    }
    if (!cv.name.toLowerCase().endsWith(".docx")) {
      return Response.json(
        { error: "Der bearbeitbare Import unterstützt DOCX-Dateien." },
        { status: 415 },
      );
    }
    if (!passport.name.toLowerCase().endsWith(".json")) {
      return Response.json(
        { error: "Der Career Passport muss eine JSON-Datei sein." },
        { status: 415 },
      );
    }
    if (cv.size > MAX_CV_BYTES) {
      return Response.json(
        { error: "Der Master-CV darf höchstens 8 MB groß sein." },
        { status: 413 },
      );
    }
    if (passport.size > MAX_PASSPORT_BYTES) {
      return Response.json(
        { error: "Der Career Passport darf höchstens 2 MB groß sein." },
        { status: 413 },
      );
    }

    const cvBytes = new Uint8Array(await cv.arrayBuffer());
    let passportJson = "";
    try {
      passportJson = new TextDecoder("utf-8", { fatal: true }).decode(
        await passport.arrayBuffer(),
      );
    } catch {
      return Response.json(
        { error: "Der Career Passport ist keine gültige UTF-8-Datei." },
        { status: 400 },
      );
    }
    const importedAt = new Date().toISOString();
    let parsed: ReturnType<typeof parseMasterCvBundle>;
    try {
      parsed = parseMasterCvBundle(cvBytes, passportJson, importedAt);
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Master-CV und Career Passport konnten nicht gelesen werden.",
        },
        { status: 400 },
      );
    }

    const hash = await ownerHash(email);
    const cvFileId = crypto.randomUUID();
    const passportFileId = crypto.randomUUID();
    cvKey = `${hash}/${cvFileId}`;
    passportKey = `${hash}/${passportFileId}`;
    const cvName = cleanName(cv.name, "Master-CV.docx");
    const passportName = cleanName(passport.name, "Career_Passport.json");
    const cvDestination = "Persönlich/Bewerbungen/Master-CV";
    const passportDestination = "Persönlich/Bewerbungen/Career Passport";

    try {
      await env.FILES.put(cvKey, cvBytes, {
        httpMetadata: { contentType: CV_CONTENT_TYPE },
        customMetadata: {
          owner: hash,
          originalName: cvName,
          destination: cvDestination,
        },
      });
      await env.FILES.put(
        passportKey,
        new TextEncoder().encode(passportJson),
        {
          httpMetadata: { contentType: PASSPORT_CONTENT_TYPE },
          customMetadata: {
            owner: hash,
            originalName: passportName,
            destination: passportDestination,
          },
        },
      );
    } catch {
      await Promise.allSettled([
        env.FILES.delete(cvKey),
        env.FILES.delete(passportKey),
      ]);
      return Response.json(
        { error: "Die Dateien konnten nicht sicher abgelegt werden." },
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
    const passportDocument = documentRef({
      fileId: passportFileId,
      name: passportName,
      destination: passportDestination,
      contentType: PASSPORT_CONTENT_TYPE,
      sizeBytes: passport.size,
      tags: ["Bewerbungen", "Career Passport", "Evidenz"],
      note: "Quellen- und Evidenzregister des Master-CV",
      modifiedAt: importedAt,
    });
    const masterCvContent: MasterCvContent = {
      schemaVersion: 1,
      sourceDocumentId: cvDocument.id,
      passportDocumentId: passportDocument.id,
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
      passportDocument,
      masterCvContent,
    });
  } catch {
    if (cvKey || passportKey) {
      await Promise.allSettled(
        [cvKey, passportKey]
          .filter(Boolean)
          .map((key) => env.FILES.delete(key)),
      );
    }
    return Response.json(
      { error: "Der Master-CV-Import konnte nicht abgeschlossen werden." },
      { status: 500 },
    );
  }
}
