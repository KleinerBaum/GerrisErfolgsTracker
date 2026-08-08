import type { DocumentRef, MasterCvContent } from "./types";

export const APPLICATION_MASTER_CV_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type ApplicationMasterCvReference = {
  masterCvDocumentId: string;
  masterCvFingerprint: string;
  masterCvEditRevision: number;
};

export function isApplicationMasterCvReady(input: {
  document: DocumentRef | undefined;
  documentId: string | null;
  content: MasterCvContent | null;
  persisted: boolean;
}): boolean {
  const { document, documentId, content, persisted } = input;
  return Boolean(
    persisted &&
      documentId &&
      document?.id === documentId &&
      document.storage === "upload" &&
      document.name.toLocaleLowerCase("de-DE").endsWith(".docx") &&
      document.contentType === APPLICATION_MASTER_CV_CONTENT_TYPE &&
      typeof document.sizeBytes === "number" &&
      document.sizeBytes > 0 &&
      content?.sourceDocumentId === documentId &&
      content.sourceFingerprint.trim(),
  );
}

export function applicationGenerationStartPayload(
  values: Record<string, string>,
  reference: ApplicationMasterCvReference,
): Record<string, string | number> &
  ApplicationMasterCvReference & { kind: "application" } {
  return {
    ...values,
    kind: "application",
    masterCvDocumentId: reference.masterCvDocumentId,
    masterCvFingerprint: reference.masterCvFingerprint,
    masterCvEditRevision: reference.masterCvEditRevision,
  };
}
