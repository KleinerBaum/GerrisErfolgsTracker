import {
  authorizedGoogleFetch,
  connectUrl,
  createGoogleOAuthState,
  disconnectGoogle,
  finishGoogleOAuth,
  type GoogleConnection,
  GoogleApiError,
  GoogleAuthorizationError,
  googleConnectionFor,
  googleConnectionForOwner,
  googleErrorResponse,
  googleWorkspaceConfigured,
  verifySignedValue,
} from "./google-workspace-server";
import type {
  DriveConnectionStatus,
  DriveFolderContent,
  DriveItem,
  DrivePreviewKind,
} from "./types";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const GOOGLE_DOC_MIMES = new Set([
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
]);

type GoogleFile = {
  id?: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
  parents?: string[];
  trashed?: boolean;
};

export class DriveConfigurationError extends Error {}
export class DriveBoundaryError extends Error {}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new DriveConfigurationError(`${name} fehlt.`);
  return value;
}

export function driveConfigured(): boolean {
  return Boolean(
    googleWorkspaceConfigured() &&
      process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim(),
  );
}

export function driveRootId(): string {
  return required("GOOGLE_DRIVE_ROOT_FOLDER_ID");
}

export { verifySignedValue };

export async function createOAuthState(
  ownerEmail: string,
): Promise<{ authorizationUrl: string; cookieValue: string }> {
  return createGoogleOAuthState(
    ownerEmail,
    ["drive"],
    "/?drive=verbunden",
  );
}

export async function finishOAuth(
  ownerEmail: string,
  code: string,
  verifier: string,
): Promise<string> {
  return finishGoogleOAuth(ownerEmail, code, verifier, ["drive"]);
}

export async function disconnectDrive(ownerEmail: string): Promise<void> {
  await disconnectGoogle(ownerEmail);
}

async function driveJson<T>(
  connection: GoogleConnection,
  path: string,
): Promise<T> {
  const response = await authorizedGoogleFetch(
    connection,
    `${DRIVE_API}${path}`,
  );
  if (!response.ok) {
    throw new GoogleApiError(
      `Google Drive antwortete mit ${response.status}.`,
      response.status,
    );
  }
  return (await response.json()) as T;
}

function previewKind(mimeType: string): DrivePreviewKind {
  if (mimeType === "application/pdf" || GOOGLE_DOC_MIMES.has(mimeType)) return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml"
  ) {
    return "text";
  }
  return null;
}

function toDriveItem(file: GoogleFile): DriveItem {
  const mimeType = file.mimeType || "application/octet-stream";
  const id = file.id || "";
  return {
    id,
    name: file.name || "Unbenannt",
    kind: mimeType === FOLDER_MIME ? "folder" : "file",
    mimeType,
    modifiedAt: file.modifiedTime || null,
    sizeBytes: file.size ? Number(file.size) : null,
    webViewLink:
      file.webViewLink ||
      (mimeType === FOLDER_MIME
        ? `https://drive.google.com/drive/folders/${id}`
        : `https://drive.google.com/open?id=${id}`),
    previewKind: mimeType === FOLDER_MIME ? null : previewKind(mimeType),
  };
}

async function metadata(
  connection: GoogleConnection,
  fileId: string,
): Promise<GoogleFile> {
  return driveJson<GoogleFile>(
    connection,
    `/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,name,mimeType,modifiedTime,size,webViewLink,parents,trashed`,
  );
}

async function assertInsideRoot(
  connection: GoogleConnection,
  fileId: string,
): Promise<GoogleFile> {
  const rootId = driveRootId();
  let currentId = fileId;
  let first: GoogleFile | null = null;
  const visited = new Set<string>();
  for (let depth = 0; depth < 40; depth += 1) {
    if (currentId === rootId) return first || metadata(connection, currentId);
    if (visited.has(currentId)) break;
    visited.add(currentId);
    const current = await metadata(connection, currentId);
    first ??= current;
    if (current.trashed) break;
    const parents = current.parents || [];
    if (parents.includes(rootId)) return first;
    if (!parents[0]) break;
    currentId = parents[0];
  }
  throw new DriveBoundaryError("Dieser Eintrag liegt außerhalb von „Unterlagen und Dokumente“.");
}

async function breadcrumbs(
  connection: GoogleConnection,
  folderId: string,
): Promise<DriveItem[]> {
  const rootId = driveRootId();
  const path: DriveItem[] = [];
  let currentId = folderId;
  const visited = new Set<string>();
  for (let depth = 0; depth < 40; depth += 1) {
    if (visited.has(currentId)) break;
    visited.add(currentId);
    const current = await metadata(connection, currentId);
    path.unshift(toDriveItem(current));
    if (currentId === rootId) return path;
    const parent = current.parents?.[0];
    if (!parent) break;
    currentId = parent;
  }
  throw new DriveBoundaryError("Ordnerpfad liegt außerhalb der freigegebenen Ablage.");
}

export async function driveStatus(
  ownerEmail: string,
): Promise<DriveConnectionStatus> {
  if (!driveConfigured()) {
    return { configured: false, connected: false, googleEmail: null, root: null };
  }
  const storedConnection = await googleConnectionFor(ownerEmail);
  if (!storedConnection) {
    return { configured: true, connected: false, googleEmail: null, root: null };
  }
  try {
    const connection = await googleConnectionForOwner(ownerEmail, {
      capability: "drive",
    });
    const root = toDriveItem(await metadata(connection, driveRootId()));
    return {
      configured: true,
      connected: true,
      googleEmail: storedConnection.googleEmail,
      root,
    };
  } catch (error) {
    if (error instanceof GoogleAuthorizationError) {
      return {
        configured: true,
        connected: false,
        googleEmail: storedConnection.googleEmail,
        root: null,
      };
    }
    throw error;
  }
}

export async function listFolder(
  ownerEmail: string,
  folderId: string,
): Promise<DriveFolderContent> {
  const connection = await googleConnectionForOwner(ownerEmail, {
    capability: "drive",
  });
  const folderFile = await assertInsideRoot(connection, folderId);
  if (folderFile.mimeType !== FOLDER_MIME) {
    throw new DriveBoundaryError("Der ausgewählte Eintrag ist kein Ordner.");
  }
  const files: GoogleFile[] = [];
  let pageToken = "";
  do {
    const query = new URLSearchParams({
      q: `'${folderId.replaceAll("'", "\\'")}' in parents and trashed = false`,
      orderBy: "folder,name_natural",
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      fields:
        "nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink,parents,trashed)",
    });
    if (pageToken) query.set("pageToken", pageToken);
    const page = await driveJson<{ files?: GoogleFile[]; nextPageToken?: string }>(
      connection,
      `/files?${query}`,
    );
    files.push(...(page.files || []));
    pageToken = page.nextPageToken || "";
  } while (pageToken);
  const items = files.map(toDriveItem).sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "folder" ? -1 : 1;
    return left.name.localeCompare(right.name, "de", { numeric: true });
  });
  return {
    folder: toDriveItem(folderFile),
    breadcrumbs: await breadcrumbs(connection, folderId),
    items,
  };
}

function driveQueryLiteral(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

export async function searchDriveFolders(
  ownerEmail: string,
  rawQuery: string,
): Promise<DriveItem[]> {
  const query = rawQuery.trim().normalize("NFC").slice(0, 80);
  if (query.length < 2) return [];
  const connection = await googleConnectionForOwner(ownerEmail, {
    capability: "drive",
  });
  const candidates: GoogleFile[] = [];
  let pageToken = "";
  let pageCount = 0;
  do {
    const parameters = new URLSearchParams({
      q: `mimeType = '${FOLDER_MIME}' and trashed = false and name contains '${driveQueryLiteral(query)}'`,
      orderBy: "name_natural",
      pageSize: "100",
      spaces: "drive",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      fields:
        "nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink,parents,trashed)",
    });
    if (pageToken) parameters.set("pageToken", pageToken);
    const page = await driveJson<{
      files?: GoogleFile[];
      nextPageToken?: string;
    }>(connection, `/files?${parameters}`);
    candidates.push(...(page.files || []));
    pageToken = page.nextPageToken || "";
    pageCount += 1;
  } while (pageToken && pageCount < 3);

  const matches: GoogleFile[] = [];
  for (let offset = 0; offset < candidates.length; offset += 10) {
    const batch = await Promise.all(
      candidates.slice(offset, offset + 10).map(async (candidate) => {
        if (!candidate.id) return null;
        try {
          await assertInsideRoot(connection, candidate.id);
          return candidate;
        } catch (error) {
          if (error instanceof DriveBoundaryError) return null;
          throw error;
        }
      }),
    );
    matches.push(...batch.filter((item): item is GoogleFile => Boolean(item)));
    if (matches.length >= 30) break;
  }

  return matches
    .map(toDriveItem)
    .sort((left, right) =>
      left.name.localeCompare(right.name, "de", { numeric: true }),
    )
    .slice(0, 30);
}

export async function driveFileResponse(
  ownerEmail: string,
  fileId: string,
  download: boolean,
): Promise<Response> {
  const connection = await googleConnectionForOwner(ownerEmail, {
    capability: "drive",
  });
  const file = await assertInsideRoot(connection, fileId);
  if (file.mimeType === FOLDER_MIME) {
    return new Response("Ordner können nicht als Datei geöffnet werden.", { status: 400 });
  }
  const mimeType = file.mimeType || "application/octet-stream";
  const exportPdf = GOOGLE_DOC_MIMES.has(mimeType);
  const url = exportPdf
    ? `${DRIVE_API}/files/${encodeURIComponent(fileId)}/export?mimeType=application%2Fpdf`
    : `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
  const response = await authorizedGoogleFetch(connection, url);
  if (!response.ok) {
    const status = response.status === 403 ? 403 : 502;
    return new Response("Die Datei konnte nicht von Google geladen werden.", { status });
  }
  const headers = new Headers();
  const responseType = exportPdf
    ? "application/pdf"
    : response.headers.get("content-type") || mimeType;
  headers.set("content-type", responseType);
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  const safeName = encodeURIComponent(exportPdf ? `${file.name || "Dokument"}.pdf` : file.name || "Datei");
  headers.set(
    "content-disposition",
    `${download ? "attachment" : "inline"}; filename*=UTF-8''${safeName}`,
  );
  return new Response(response.body, { status: response.status, headers });
}

export function driveErrorResponse(error: unknown): Response {
  if (error instanceof DriveConfigurationError) {
    return Response.json(
      {
        error: "Google Drive ist noch nicht eingerichtet.",
        code: "google_not_configured",
        connectUrl: connectUrl("drive"),
      },
      { status: 503, headers: { "cache-control": "private, no-store" } },
    );
  }
  if (error instanceof DriveBoundaryError) {
    return Response.json(
      { error: error.message, code: "drive_boundary" },
      { status: 403, headers: { "cache-control": "private, no-store" } },
    );
  }
  return googleErrorResponse(error, "drive");
}

export async function hasConnection(ownerEmail: string): Promise<boolean> {
  const connection = await googleConnectionFor(ownerEmail);
  return Boolean(
    connection &&
      connection.grantedScopes.split(/\s+/).includes(DRIVE_SCOPE),
  );
}
