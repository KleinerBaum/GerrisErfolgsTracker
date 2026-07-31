import { eq } from "drizzle-orm";

import { getDb } from "../db";
import {
  googleDriveConnections,
  googleTaskMetadata,
  googleTaskSettings,
} from "../db/schema";
import {
  ownerEmail as authenticatedOwnerEmail,
  sameOrigin as requestHasSameOrigin,
} from "./server-auth";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE = "https://oauth2.googleapis.com/revoke";
const GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";
const BASE_SCOPES = ["openid", "email"] as const;

export const GOOGLE_OAUTH_COOKIE = "gerri_google_oauth";

export type GoogleCapability = "drive" | "tasks" | "calendar" | "gmail";

export const GOOGLE_CALENDAR_OWN_EVENTS_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.owned";
export const GOOGLE_CALENDAR_READ_EVENTS_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.readonly";
export const GOOGLE_CALENDAR_LIST_SCOPE =
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly";
export const GOOGLE_CALENDAR_CREATE_SCOPE =
  "https://www.googleapis.com/auth/calendar.calendars";
export const GOOGLE_CALENDAR_ACL_READ_SCOPE =
  "https://www.googleapis.com/auth/calendar.acls.readonly";

const CAPABILITY_SCOPES: Record<GoogleCapability, readonly string[]> = {
  drive: ["https://www.googleapis.com/auth/drive.readonly"],
  tasks: ["https://www.googleapis.com/auth/tasks"],
  calendar: [
    GOOGLE_CALENDAR_OWN_EVENTS_SCOPE,
    GOOGLE_CALENDAR_READ_EVENTS_SCOPE,
    GOOGLE_CALENDAR_LIST_SCOPE,
    GOOGLE_CALENDAR_CREATE_SCOPE,
    GOOGLE_CALENDAR_ACL_READ_SCOPE,
  ],
  gmail: ["https://www.googleapis.com/auth/gmail.compose"],
};

type StoredConnection = typeof googleDriveConnections.$inferSelect;

export type GoogleConnection = {
  ownerEmail: string;
  googleEmail: string;
  grantedScopes: string[];
  capability: GoogleCapability;
  scope: string;
  accessToken?: string;
};

export type GoogleOAuthState = {
  ownerEmail: string;
  state: string;
  verifier: string;
  issuedAt: number;
  capabilities: GoogleCapability[];
  returnTo: string;
};

export type GoogleWorkspaceStatus = {
  configured: boolean;
  connected: boolean;
  googleEmail: string | null;
  capabilities: Record<
    GoogleCapability,
    { granted: boolean; connectUrl: string }
  >;
};

export class GoogleConfigurationError extends Error {}

export class GoogleAuthorizationError extends Error {
  constructor(
    message: string,
    public readonly capability: GoogleCapability,
    public readonly code:
      | "authentication_required"
      | "google_not_connected"
      | "google_scope_missing"
      | "google_reconnect" = "google_reconnect",
    public readonly reconnect = true,
  ) {
    super(message);
  }
}

export class GoogleValidationError extends Error {}

export class GoogleApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryable = status === 429 || status >= 500,
  ) {
    super(message);
  }
}

export { authenticatedOwnerEmail as ownerEmail };
export { requestHasSameOrigin as sameOrigin };

function configuredValue(primary: string, fallback: string): string | null {
  return process.env[primary]?.trim() || process.env[fallback]?.trim() || null;
}

function oauthConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenKey: string;
} {
  const clientId = configuredValue(
    "GOOGLE_CLIENT_ID",
    "GOOGLE_DRIVE_CLIENT_ID",
  );
  const clientSecret = configuredValue(
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_DRIVE_CLIENT_SECRET",
  );
  const redirectUri = configuredValue(
    "GOOGLE_REDIRECT_URI",
    "GOOGLE_DRIVE_REDIRECT_URI",
  );
  const tokenKey = configuredValue("GOOGLE_TOKEN_KEY", "GOOGLE_DRIVE_TOKEN_KEY");
  if (!clientId || !clientSecret || !redirectUri || !tokenKey) {
    throw new GoogleConfigurationError(
      "Die Google-Workspace-Verbindung ist noch nicht vollständig eingerichtet.",
    );
  }
  return { clientId, clientSecret, redirectUri, tokenKey };
}

export function googleWorkspaceConfigured(): boolean {
  try {
    oauthConfig();
    return true;
  } catch {
    return false;
  }
}

export function scopeForCapability(capability: GoogleCapability): string {
  return CAPABILITY_SCOPES[capability][0];
}

export function scopesForCapability(
  capability: GoogleCapability,
): readonly string[] {
  return CAPABILITY_SCOPES[capability];
}

export function connectUrl(capability: GoogleCapability): string {
  return `/api/google/connect?capability=${encodeURIComponent(capability)}`;
}

export function isGoogleCapability(
  value: string | null,
): value is GoogleCapability {
  return (
    value === "drive" ||
    value === "tasks" ||
    value === "calendar" ||
    value === "gmail"
  );
}

function scopeSet(value: string): Set<string> {
  return new Set(value.split(/\s+/).map((scope) => scope.trim()).filter(Boolean));
}

function safeReturnTo(value: string | null | undefined): string {
  if (!value || /[\u0000-\u001f\u007f\\]/.test(value)) return "/";
  try {
    const base = new URL("https://gerris-kompass.invalid/");
    const target = new URL(value, base);
    if (target.origin !== base.origin) return "/";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/";
  }
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

function base64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function aesKey(): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(oauthConfig().tokenKey),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(oauthConfig().tokenKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function encryptToken(token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await aesKey(),
    new TextEncoder().encode(token),
  );
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(cipher))}`;
}

async function decryptToken(
  value: string,
  capability: GoogleCapability,
): Promise<string> {
  const [ivValue, cipherValue] = value.split(".");
  if (!ivValue || !cipherValue) {
    throw new GoogleAuthorizationError(
      "Die gespeicherte Google-Verbindung ist ungültig.",
      capability,
    );
  }
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(ivValue) },
      await aesKey(),
      base64ToBytes(cipherValue),
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new GoogleAuthorizationError(
      "Die Google-Verbindung muss erneut hergestellt werden.",
      capability,
    );
  }
}

async function signedValue(payload: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(),
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
    const payloadBytes = base64ToBytes(payloadEncoded);
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(),
      base64ToBytes(signatureEncoded),
      payloadBytes,
    );
    return valid ? new TextDecoder().decode(payloadBytes) : null;
  } catch {
    return null;
  }
}

export async function googleConnectionFor(
  owner: string,
): Promise<StoredConnection | null> {
  const [connection] = await getDb()
    .select()
    .from(googleDriveConnections)
    .where(eq(googleDriveConnections.ownerEmail, owner))
    .limit(1);
  return connection ?? null;
}

export async function createGoogleOAuthState(
  owner: string,
  capabilities: GoogleCapability[],
  returnTo = "/?google=verbunden",
): Promise<{ authorizationUrl: string; cookieValue: string }> {
  const config = oauthConfig();
  const selected = [...new Set(capabilities)];
  if (selected.length === 0) {
    throw new GoogleValidationError("Mindestens eine Google-Funktion fehlt.");
  }
  const existing = await googleConnectionFor(owner);
  const scopes = new Set<string>(BASE_SCOPES);
  for (const scope of scopeSet(existing?.grantedScopes || "")) scopes.add(scope);
  for (const capability of selected) {
    for (const scope of scopesForCapability(capability)) scopes.add(scope);
  }

  const state = crypto.randomUUID();
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)));
  const challengeDigest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  const payload: GoogleOAuthState = {
    ownerEmail: owner,
    state,
    verifier,
    issuedAt: Date.now(),
    capabilities: selected,
    returnTo: safeReturnTo(returnTo),
  };
  const cookieValue = await signedValue(JSON.stringify(payload));
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: [...scopes].join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: base64Url(new Uint8Array(challengeDigest)),
    code_challenge_method: "S256",
  });
  return { authorizationUrl: `${GOOGLE_AUTH}?${params}`, cookieValue };
}

export async function parseGoogleOAuthState(
  signed: string,
): Promise<GoogleOAuthState | null> {
  const raw = await verifySignedValue(signed);
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as Partial<GoogleOAuthState>;
    if (
      typeof payload.ownerEmail !== "string" ||
      typeof payload.state !== "string" ||
      typeof payload.verifier !== "string" ||
      typeof payload.issuedAt !== "number" ||
      !Array.isArray(payload.capabilities) ||
      payload.capabilities.some(
        (capability) =>
          typeof capability !== "string" || !isGoogleCapability(capability),
      )
    ) {
      return null;
    }
    return {
      ownerEmail: payload.ownerEmail,
      state: payload.state,
      verifier: payload.verifier,
      issuedAt: payload.issuedAt,
      capabilities: payload.capabilities as GoogleCapability[],
      returnTo: safeReturnTo(payload.returnTo),
    };
  } catch {
    return null;
  }
}

export async function finishGoogleOAuth(
  owner: string,
  code: string,
  verifier: string,
  requestedCapabilities: GoogleCapability[] = [],
): Promise<string> {
  const config = oauthConfig();
  const errorCapability = requestedCapabilities[0] || "tasks";
  const response = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  if (!response.ok) {
    throw new GoogleAuthorizationError(
      "Die Google-Anmeldung ist fehlgeschlagen.",
      errorCapability,
    );
  }
  const token = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
  };
  if (!token.access_token) {
    throw new GoogleAuthorizationError(
      "Google hat kein Zugriffstoken geliefert.",
      errorCapability,
    );
  }

  const profileResponse = await fetch(GOOGLE_USERINFO, {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (!profileResponse.ok) {
    throw new GoogleAuthorizationError(
      "Das verbundene Google-Konto konnte nicht gelesen werden.",
      errorCapability,
    );
  }
  const profile = (await profileResponse.json()) as {
    email?: string;
    sub?: string;
  };
  const profileEmail = profile.email?.trim().toLowerCase();
  const profileSubject = profile.sub?.trim();
  if (!profileEmail || !profileSubject) {
    throw new GoogleAuthorizationError(
      "Google hat keine bestätigte Kontoidentität geliefert.",
      errorCapability,
    );
  }
  const existing = await googleConnectionFor(owner);
  const identityChanged = Boolean(
    existing &&
      (existing.googleSubject
        ? existing.googleSubject !== profileSubject
        : existing.googleEmail.trim().toLowerCase() !== profileEmail),
  );
  if (!token.refresh_token && identityChanged) {
    throw new GoogleAuthorizationError(
      "Für das gewählte Google-Konto fehlt ein neues dauerhaftes Zugriffstoken. Bitte zuerst die bisherige Google-Verbindung trennen.",
      errorCapability,
    );
  }
  const encryptedRefreshToken = token.refresh_token
    ? await encryptToken(token.refresh_token)
    : existing?.encryptedRefreshToken;
  if (!encryptedRefreshToken) {
    throw new GoogleAuthorizationError(
      "Google hat kein dauerhaftes Zugriffstoken geliefert. Bitte erneut erlauben.",
      errorCapability,
    );
  }

  const returnedScopes = scopeSet(token.scope || "");
  const grantedScopes =
    returnedScopes.size > 0
      ? returnedScopes
      : scopeSet(identityChanged ? "" : existing?.grantedScopes || "");
  if (returnedScopes.size === 0) {
    for (const capability of requestedCapabilities) {
      for (const scope of scopesForCapability(capability)) {
        grantedScopes.add(scope);
      }
    }
  }
  const now = new Date().toISOString();
  const db = getDb();
  const saveConnection = db
    .insert(googleDriveConnections)
    .values({
      ownerEmail: owner,
      googleSubject: profileSubject,
      googleEmail: profileEmail,
      encryptedRefreshToken,
      grantedScopes: [...grantedScopes].sort().join(" "),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: googleDriveConnections.ownerEmail,
      set: {
        googleSubject: profileSubject,
        googleEmail: profileEmail,
        encryptedRefreshToken,
        grantedScopes: [...grantedScopes].sort().join(" "),
        updatedAt: now,
      },
    });
  if (identityChanged) {
    await db.batch([
      saveConnection,
      db
        .delete(googleTaskMetadata)
        .where(eq(googleTaskMetadata.ownerEmail, owner)),
      db
        .delete(googleTaskSettings)
        .where(eq(googleTaskSettings.ownerEmail, owner)),
    ]);
  } else {
    await saveConnection;
  }
  return profileEmail;
}

async function refreshedAccessToken(
  owner: string,
  capability: GoogleCapability,
): Promise<string> {
  const config = oauthConfig();
  const connection = await googleConnectionFor(owner);
  if (!connection) {
    throw new GoogleAuthorizationError(
      "Google ist noch nicht verbunden.",
      capability,
      "google_not_connected",
    );
  }
  const response = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: await decryptToken(
        connection.encryptedRefreshToken,
        capability,
      ),
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    throw new GoogleAuthorizationError(
      "Die Google-Verbindung muss erneut hergestellt werden.",
      capability,
    );
  }
  const token = (await response.json()) as { access_token?: string };
  if (!token.access_token) {
    throw new GoogleAuthorizationError(
      "Google hat kein Zugriffstoken geliefert.",
      capability,
    );
  }
  return token.access_token;
}

export async function requireGoogleConnection(
  request: Request,
  options: { capability: GoogleCapability; scope?: string },
): Promise<GoogleConnection> {
  const owner = authenticatedOwnerEmail(request);
  if (!owner) {
    throw new GoogleAuthorizationError(
      "Anmeldung erforderlich.",
      options.capability,
      "authentication_required",
      false,
    );
  }
  return googleConnectionForOwner(owner, options);
}

export async function googleConnectionForOwner(
  owner: string,
  options: { capability: GoogleCapability; scope?: string },
): Promise<GoogleConnection> {
  if (!googleWorkspaceConfigured()) {
    throw new GoogleConfigurationError(
      "Die Google-Workspace-Verbindung ist noch nicht eingerichtet.",
    );
  }
  const connection = await googleConnectionFor(owner);
  if (!connection) {
    throw new GoogleAuthorizationError(
      "Google ist noch nicht verbunden.",
      options.capability,
      "google_not_connected",
    );
  }
  const requiredScope = options.scope || scopeForCapability(options.capability);
  const grantedScopes = [...scopeSet(connection.grantedScopes)];
  if (!grantedScopes.includes(requiredScope)) {
    throw new GoogleAuthorizationError(
      "Für diese Funktion fehlt noch die Google-Berechtigung.",
      options.capability,
      "google_scope_missing",
    );
  }
  return {
    ownerEmail: owner,
    googleEmail: connection.googleEmail,
    grantedScopes,
    capability: options.capability,
    scope: requiredScope,
    accessToken: await refreshedAccessToken(owner, options.capability),
  };
}

export async function authorizedGoogleFetch(
  connection: GoogleConnection,
  url: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set(
    "authorization",
    `Bearer ${
      connection.accessToken ||
      (await refreshedAccessToken(
        connection.ownerEmail,
        connection.capability,
      ))
    }`,
  );
  if (!headers.has("accept")) headers.set("accept", "application/json");
  const response = await fetch(url, { ...init, headers });
  if (response.status === 401 || response.status === 403) {
    throw new GoogleAuthorizationError(
      "Die Google-Berechtigung ist abgelaufen oder nicht ausreichend.",
      connection.capability,
    );
  }
  return response;
}

export async function googleApiJson<T>(
  connection: GoogleConnection,
  url: string | URL,
  init: RequestInit = {},
): Promise<T> {
  const response = await authorizedGoogleFetch(connection, url, init);
  if (!response.ok) {
    let detail = "";
    try {
      const payload = (await response.json()) as {
        error?: { message?: string };
      };
      detail = payload.error?.message?.trim() || "";
    } catch {
      detail = "";
    }
    throw new GoogleApiError(
      detail || `Google antwortete mit Status ${response.status}.`,
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function disconnectGoogle(owner: string): Promise<void> {
  const connection = await googleConnectionFor(owner);
  if (connection) {
    const refreshToken = await decryptToken(
      connection.encryptedRefreshToken,
      "tasks",
    );
    const response = await fetch(GOOGLE_REVOKE, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
    });
    if (!response.ok) {
      throw new GoogleApiError(
        "Die Google-Berechtigung konnte nicht widerrufen werden. Bitte erneut versuchen.",
        response.status,
        true,
      );
    }
  }
  const db = getDb();
  await db.batch([
    db
      .delete(googleTaskMetadata)
      .where(eq(googleTaskMetadata.ownerEmail, owner)),
    db
      .delete(googleTaskSettings)
      .where(eq(googleTaskSettings.ownerEmail, owner)),
    db
      .delete(googleDriveConnections)
      .where(eq(googleDriveConnections.ownerEmail, owner)),
  ]);
}

function hasScope(connection: StoredConnection | null, scope: string): boolean {
  return Boolean(connection && scopeSet(connection.grantedScopes).has(scope));
}

export async function googleWorkspaceStatus(
  owner: string,
): Promise<GoogleWorkspaceStatus> {
  const configured = googleWorkspaceConfigured();
  const connection = configured ? await googleConnectionFor(owner) : null;
  const statusFor = (capability: GoogleCapability) => ({
    granted: scopesForCapability(capability).every((scope) =>
      hasScope(connection, scope),
    ),
    connectUrl: connectUrl(capability),
  });
  return {
    configured,
    connected: Boolean(connection),
    googleEmail: connection?.googleEmail || null,
    capabilities: {
      drive: statusFor("drive"),
      tasks: statusFor("tasks"),
      calendar: statusFor("calendar"),
      gmail: statusFor("gmail"),
    },
  };
}

export function googleErrorResponse(
  error: unknown,
  capability: GoogleCapability = "tasks",
): Response {
  const headers = { "cache-control": "private, no-store" };
  if (error instanceof GoogleConfigurationError) {
    return Response.json(
      {
        error: error.message,
        code: "google_not_configured",
        connectUrl: connectUrl(capability),
      },
      { status: 503, headers },
    );
  }
  if (error instanceof GoogleAuthorizationError) {
    return Response.json(
      {
        error: error.message,
        code: error.code,
        reconnect: error.reconnect,
        ...(error.reconnect
          ? { connectUrl: connectUrl(error.capability) }
          : {}),
      },
      { status: 401, headers },
    );
  }
  if (error instanceof GoogleValidationError) {
    return Response.json(
      { error: error.message, code: "invalid_request" },
      { status: 400, headers },
    );
  }
  if (error instanceof GoogleApiError) {
    let status = 502;
    let code = "google_api_error";
    let message = "Google konnte die Anfrage momentan nicht verarbeiten.";
    if (error.status === 400) {
      status = 400;
      code = "google_invalid_request";
      message = "Google hat die Anfrage als ungültig abgelehnt.";
    } else if (error.status === 404) {
      status = 404;
      code = "google_not_found";
      message = "Der angeforderte Google-Eintrag wurde nicht gefunden.";
    } else if (error.status === 409 || error.status === 412) {
      status = 409;
      code = "google_conflict";
      message = "Der Google-Eintrag wurde zwischenzeitlich geändert.";
    } else if (error.status === 429 || error.status >= 500) {
      status = 503;
      message = "Google ist vorübergehend nicht erreichbar.";
    }
    return Response.json(
      {
        error: message,
        code,
        retryable: error.retryable,
        ...(error.status === 401 || error.status === 403
          ? { reconnect: true, connectUrl: connectUrl(capability) }
          : {}),
      },
      { status, headers },
    );
  }

  const message = error instanceof Error ? error.message : "";
  if (
    message.includes("D1-Binding") ||
    message.includes("no such table") ||
    message.includes("google_task_")
  ) {
    return Response.json(
      {
        error: "Der private Google-Speicher wird gerade vorbereitet.",
        code: "storage_preparing",
      },
      { status: 503, headers },
    );
  }
  return Response.json(
    {
      error: "Die Google-Funktion ist momentan nicht erreichbar.",
      code: "google_unavailable",
    },
    { status: 502, headers },
  );
}
