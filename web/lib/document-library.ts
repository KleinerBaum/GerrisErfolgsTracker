import type { DocumentRef } from "./types";

export type DocumentSource = "drive" | "upload";

const PRIVATE_FILE_PATH =
  /^\/api\/files\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function documentSource(document: DocumentRef): DocumentSource {
  return document.storage === "upload" ? "upload" : "drive";
}

export function safePrivateFileUrl(value?: string | null): string | null {
  if (!value) return null;
  const path = value.split("?", 1)[0];
  return PRIVATE_FILE_PATH.test(path) ? path : null;
}

export function privateFileDownloadUrl(value?: string | null): string | null {
  const safeUrl = safePrivateFileUrl(value);
  return safeUrl ? `${safeUrl}?download=1` : null;
}

function safeDocumentDriveUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" &&
      ["drive.google.com", "docs.google.com"].includes(url.hostname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function documentOpenUrl(document?: DocumentRef | null): string | null {
  if (!document) return null;
  if (documentSource(document) === "upload") {
    return safePrivateFileUrl(document.downloadUrl || document.driveUrl);
  }
  return safeDocumentDriveUrl(document.driveUrl || document.downloadUrl);
}

export function documentFolderLabel(folderPath: string): string {
  return folderPath
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(1, 3)
    .join(" / ");
}

export function documentFolderOptions(documents: DocumentRef[]): string[] {
  return [
    "Alle",
    ...new Set(
      documents
        .map((document) => documentFolderLabel(document.folderPath))
        .filter(Boolean),
    ),
  ];
}

export function visibleDocuments(
  documents: DocumentRef[],
  query: string,
  folder: string,
): DocumentRef[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("de-DE");
  return documents
    .filter((document) => document.kind !== "folder")
    .filter((document) => {
      const searchable = [
        document.name,
        document.folderPath,
        ...document.tags,
      ]
        .join(" ")
        .toLocaleLowerCase("de-DE");
      const matchesQuery =
        !normalizedQuery || searchable.includes(normalizedQuery);
      const matchesFolder =
        folder === "Alle" || documentFolderLabel(document.folderPath) === folder;
      return matchesQuery && matchesFolder;
    })
    .sort((left, right) => {
      const byModifiedAt = right.modifiedAt.localeCompare(left.modifiedAt);
      return (
        byModifiedAt ||
        left.name.localeCompare(right.name, "de-DE", { numeric: true })
      );
    });
}
