import { normalizeMasterCvContent } from "../master-cv.ts";
import type { AppState, DocumentRef, MasterCvContent } from "../types";
import { APPLICATION_MASTER_CV_CONTENT_TYPE } from "../application-generation-api.ts";

export const APPLICATION_MASTER_CV_MAX_BYTES = 16 * 1024 * 1024;
export { APPLICATION_MASTER_CV_CONTENT_TYPE };

const FILE_ID_PATTERN =
  /^upload-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const NOT_FOUND_MESSAGE = "Der gespeicherte Master-CV wurde nicht gefunden.";

type StoredApplicationState = Pick<
  AppState,
  "documents" | "masterCvDocumentId" | "masterCvContent"
>;

export type StoredMasterCvObject = {
  size: number;
  httpMetadata?: { contentType?: string } | null;
  customMetadata?: Record<string, string> | null;
};

export type ApplicationMasterCvResolver = {
  loadState(): Promise<unknown>;
  headObject(fileId: string): Promise<StoredMasterCvObject | null>;
};

export class ApplicationMasterCvReferenceError extends Error {
  readonly status: 404 | 409;

  constructor(message: string, status: 404 | 409) {
    super(message);
    this.name = "ApplicationMasterCvReferenceError";
    this.status = status;
  }
}

function notFound(): never {
  throw new ApplicationMasterCvReferenceError(NOT_FOUND_MESSAGE, 404);
}

function storedState(value: unknown): StoredApplicationState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<StoredApplicationState>;
  if (
    !Array.isArray(candidate.documents) ||
    typeof candidate.masterCvDocumentId !== "string"
  ) {
    return null;
  }
  return {
    documents: candidate.documents as DocumentRef[],
    masterCvDocumentId: candidate.masterCvDocumentId,
    masterCvContent: normalizeMasterCvContent(candidate.masterCvContent),
  };
}

export async function resolveApplicationMasterCv(
  reference: {
    documentId: string;
    fingerprint: string;
    editRevision: number;
    ownerHash: string;
  },
  resolver: ApplicationMasterCvResolver,
): Promise<MasterCvContent> {
  const fileId = FILE_ID_PATTERN.exec(reference.documentId)?.[1];
  if (!fileId) return notFound();

  const state = storedState(await resolver.loadState());
  if (!state || state.masterCvDocumentId !== reference.documentId) {
    return notFound();
  }
  const masterCv = state.masterCvContent;
  const document = state.documents.find(
    (candidate) => candidate.id === reference.documentId,
  );
  if (
    !masterCv ||
    masterCv.sourceDocumentId !== reference.documentId ||
    !document ||
    document.storage !== "upload" ||
    document.contentType !== APPLICATION_MASTER_CV_CONTENT_TYPE
  ) {
    return notFound();
  }
  const object = await resolver.headObject(fileId);
  if (
    !object ||
    object.customMetadata?.owner !== reference.ownerHash ||
    object.size <= 0 ||
    object.size > APPLICATION_MASTER_CV_MAX_BYTES ||
    object.httpMetadata?.contentType !== APPLICATION_MASTER_CV_CONTENT_TYPE
  ) {
    return notFound();
  }
  if (
    masterCv.sourceFingerprint !== reference.fingerprint ||
    masterCv.editRevision !== reference.editRevision
  ) {
    throw new ApplicationMasterCvReferenceError(
      "Der gespeicherte Master-CV wurde inzwischen geändert. Bitte neu laden und den Auftrag erneut starten.",
      409,
    );
  }
  return masterCv;
}
