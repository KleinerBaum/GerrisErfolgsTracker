import { eq } from "drizzle-orm";

import { getDb } from "../db";
import { googleDriveConnections } from "../db/schema";
import type {
  DriveConnectionStatus,
  DriveFolderContent,
  DriveItem,
  DrivePreviewKind,
} from "./types";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const GOOGLE_DOC_MIMES = new Set([
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
]);

type StoredConnection = typeof googleDriveConnections.$inferSelect;

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
export class DriveAuthorizationError extends Error {}
export class DriveBoundaryError extends Error {}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new DriveConfigurationError(`${name} fehlt.`);
  return value;
}

export function driveConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_DRIVE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_DRIVE_REDIRECT_URI?.trim() &&
      process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim() &&
      process.env.GOOGLE_DRIVE_TOKEN_KEY?.trim(),
  );
}

export function driveRootId(): string {
  return required("GOOGLE_DRIVE_ROOT_FOLDER_ID");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function encryptionKey(): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(required("GOOGLE_DRIVE_TOKEN_KEY")),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

async function encryptToken(token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(token),
  );
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(cipher))}`;
}

async function decryptToken(value: string): Promise<string> {
  const [ivValue, cipherValue] = value.split(".");
  if (!ivValue || !cipherValue) throw new DriveAuthorizationError("Ungültige Verbindung.");
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(ivValue) },
      await encryptionKey(),
      base64ToBytes(cipherValue),
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new DriveAuthorizationError("Die Google-Verbindung ist ungültig.");
  }
}

async function signedValue(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(required("GOOGLE_DRIVE_TOKEN_KEY")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return `${bytesToBase64(new TextEncoder().encode(payload))}.${bytesToBase64(
    new Uint8Array(signature),
  )}`;
}

export async function verifySignedValue(value: string): Promise<string | null> {
  const [payloadEncoded, signatureEncoded] = value.split(".");
  if (!payloadEncoded || !signatureEncoded) return null;
  try {
    const payload = new TextDecoder().decode(base64ToBytes(payloadEncoded));
    const expected = await signedValue(payload);
    return expected === value ? payload : null;
  } catch {
    return null;
  }
}

export async function createOAuthState(
  ownerEmail: string,
): Promise<{ authorizationUrl: string; cookieValue: string }> {
  const state = crypto.randomUUID();
  const verifier = bytesToBase64(crypto.getRandomValues(new Uint8Array(48)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  const challengeDigest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  const challenge = bytesToBase64(new Uint8Array(challengeDigest))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  const cookieValue = await signedValue(
    JSON.stringify({ ownerEmail, state, verifier, issuedAt: Date.now() }),
  );
  const params = new URLSearchParams({
    client_id: required("GOOGLE_DRIVE_CLIENT_ID"),
    redirect_uri: required("GOOGLE_DRIVE_REDIRECT_URI"),
    response_type: "code",
    scope: `openid email ${DRIVE_SCOPE}`,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return { authorizationUrl: `${GOOGLE_AUTH}?${params}`, cookieValue };
}

export async function finishOAuth(
  ownerEmail: string,
  code: string,
  verifier: string,
): Promise<string> {
  const response = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: required("GOOGLE_DRIVE_CLIENT_ID"),
      client_secret: required("GOOGLE_DRIVE_CLIENT_SECRET"),
      redirect_uri: required("GOOGLE_DRIVE_REDIRECT_URI"),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  if (!response.ok) throw new DriveAuthorizationError("Google-Anmeldung fehlgeschlagen.");
  const token = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
  };
  if (!token.access_token) throw new DriveAuthorizationError("Google hat kein Zugriffstoken geliefert.");
  const profileResponse = await fetch(GOOGLE_USERINFO, {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (!profileResponse.ok) throw new DriveAuthorizationError("Google-Konto nicht lesbar.");
  const profile = (await profileResponse.json()) as { email?: string };
  const existing = await connectionFor(ownerEmail);
  const refreshToken = token.refresh_token
    ? await encryptToken(token.refresh_token)
    : existing?.encryptedRefreshToken;
  if (!refreshToken) {
    throw new DriveAuthorizationError(
      "Google hat kein dauerhaftes Zugriffstoken geliefert. Bitte die Verbindung erneut erlauben.",
    );
  }
  const now = new Date().toISOString();
  await getDb()
    .insert(googleDriveConnections)
    .values({
      ownerEmail,
      googleEmail: profile.email || ownerEmail,
      encryptedRefreshToken: refreshToken,
      grantedScopes: token.scope || DRIVE_SCOPE,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: googleDriveConnections.ownerEmail,
      set: {
        googleEmail: profile.email || ownerEmail,
        encryptedRefreshToken: refreshToken,
        grantedScopes: token.scope || DRIVE_SCOPE,
        updatedAt: now,
      },
    });
  return profile.email || ownerEmail;
}

export async function disconnectDrive(ownerEmail: string): Promise<void> {
  await getDb()
    .delete(googleDriveConnections)
    .where(eq(googleDriveConnections.ownerEmail, ownerEmail));
}

async function connectionFor(ownerEmail: string): Promise<StoredConnection | null> {
  const [connection] = await getDb()
    .select()
    .from(googleDriveConnections)
    .where(eq(googleDriveConnections.ownerEmail, ownerEmail))
    .limit(1);
  return connection ?? null;
}

async function accessToken(ownerEmail: string): Promise<string> {
  const connection = await connectionFor(ownerEmail);
  if (!connection) throw new DriveAuthorizationError("Google Drive ist nicht verbunden.");
  const response = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: required("GOOGLE_DRIVE_CLIENT_ID"),
      client_secret: required("GOOGLE_DRIVE_CLIENT_SECRET"),
      refresh_token: await decryptToken(connection.encryptedRefreshToken),
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new DriveAuthorizationError("Google Drive muss erneut verbunden werden.");
  const token = (await response.json()) as { access_token?: string };
  if (!token.access_token) throw new DriveAuthorizationError("Google-Zugriff nicht verfügbar.");
  return token.access_token;
}

async function driveJson<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`${DRIVE_API}${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  if (response.status === 401 || response.status === 403) {
    throw new DriveAuthorizationError("Google Drive muss erneut verbunden werden.");
  }
  if (!response.ok) throw new Error(`Google Drive antwortete mit ${response.status}.`);
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

async function metadata(token: string, fileId: string): Promise<GoogleFile> {
  return driveJson<GoogleFile>(
    token,
    `/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,name,mimeType,modifiedTime,size,webViewLink,parents,trashed`,
  );
}

async function assertInsideRoot(token: string, fileId: string): Promise<GoogleFile> {
  const rootId = driveRootId();
  let currentId = fileId;
  let first: GoogleFile | null = null;
  const visited = new Set<string>();
  for (let depth = 0; depth < 40; depth += 1) {
    if (currentId === rootId) return first || metadata(token, currentId);
    if (visited.has(currentId)) break;
    visited.add(currentId);
    const current = await metadata(token, currentId);
    first ??= current;
    if (current.trashed) break;
    const parents = current.parents || [];
    if (parents.includes(rootId)) return first;
    if (!parents[0]) break;
    currentId = parents[0];
  }
  throw new DriveBoundaryError("Dieser Eintrag liegt außerhalb von „Unterlagen und Dokumente“.");
}

async function breadcrumbs(token: string, folderId: string): Promise<DriveItem[]> {
  const rootId = driveRootId();
  const path: DriveItem[] = [];
  let currentId = folderId;
  const visited = new Set<string>();
  for (let depth = 0; depth < 40; depth += 1) {
    if (visited.has(currentId)) break;
    visited.add(currentId);
    const current = await metadata(token, currentId);
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
  const connection = await connectionFor(ownerEmail);
  if (!connection) {
    return { configured: true, connected: false, googleEmail: null, root: null };
  }
  try {
    const token = await accessToken(ownerEmail);
    const root = toDriveItem(await metadata(token, driveRootId()));
    return {
      configured: true,
      connected: true,
      googleEmail: connection.googleEmail,
      root,
    };
  } catch (error) {
    if (error instanceof DriveAuthorizationError) {
      return {
        configured: true,
        connected: false,
        googleEmail: connection.googleEmail,
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
  const token = await accessToken(ownerEmail);
  const folderFile = await assertInsideRoot(token, folderId);
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
      token,
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
    breadcrumbs: await breadcrumbs(token, folderId),
    items,
  };
}

export async function driveFileResponse(
  ownerEmail: string,
  fileId: string,
  download: boolean,
): Promise<Response> {
  const token = await accessToken(ownerEmail);
  const file = await assertInsideRoot(token, fileId);
  if (file.mimeType === FOLDER_MIME) {
    return new Response("Ordner können nicht als Datei geöffnet werden.", { status: 400 });
  }
  const mimeType = file.mimeType || "application/octet-stream";
  const exportPdf = GOOGLE_DOC_MIMES.has(mimeType);
  const url = exportPdf
    ? `${DRIVE_API}/files/${encodeURIComponent(fileId)}/export?mimeType=application%2Fpdf`
    : `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
  });
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
    return Response.json({ error: "Google Drive ist noch nicht eingerichtet." }, { status: 503 });
  }
  if (error instanceof DriveAuthorizationError) {
    return Response.json({ error: error.message, reconnect: true }, { status: 401 });
  }
  if (error instanceof DriveBoundaryError) {
    return Response.json({ error: error.message }, { status: 403 });
  }
  return Response.json(
    { error: "Google Drive ist momentan nicht erreichbar." },
    { status: 502 },
  );
}

export async function hasConnection(ownerEmail: string): Promise<boolean> {
  const [connection] = await getDb()
    .select({ ownerEmail: googleDriveConnections.ownerEmail })
    .from(googleDriveConnections)
    .where(eq(googleDriveConnections.ownerEmail, ownerEmail))
    .limit(1);
  return Boolean(connection);
}
