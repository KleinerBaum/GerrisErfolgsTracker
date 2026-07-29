import {
  authorizedGoogleFetch,
  GoogleApiError,
  GoogleValidationError,
  type GoogleConnection,
} from "./google-workspace-server";

const GMAIL_DRAFTS_API =
  "https://gmail.googleapis.com/gmail/v1/users/me/drafts";
const MAX_SUBJECT_BYTES = 998;
const MAX_BODY_BYTES = 500_000;
const EMAIL_ADDRESS =
  /^[^\s@<>(),;:"\\]+@[^\s@<>(),;:"\\]+\.[^\s@<>(),;:"\\]+$/;

type GoogleGmailDraft = {
  id?: string;
  message?: {
    id?: string;
    threadId?: string;
  };
};

export type CreateGmailDraftInput = {
  to: string;
  subject: string;
  body: string;
};

export type GmailDraftResult = {
  draftId: string;
  messageId?: string;
  threadId?: string;
};

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function emailAddress(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new GoogleValidationError("Die Empfängeradresse fehlt.");
  }
  const result = value.trim();
  if (
    result.length > 320 ||
    /[\r\n]/.test(result) ||
    !EMAIL_ADDRESS.test(result)
  ) {
    throw new GoogleValidationError("Die Empfängeradresse ist ungültig.");
  }
  return result;
}

function subject(value: unknown): string {
  if (typeof value !== "string") {
    throw new GoogleValidationError("Der Betreff fehlt.");
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new GoogleValidationError("Der Betreff enthält ungültige Zeichen.");
  }
  const result = value.trim();
  if (utf8Length(result) > MAX_SUBJECT_BYTES) {
    throw new GoogleValidationError("Der Betreff ist zu lang.");
  }
  return result;
}

function body(value: unknown): string {
  if (typeof value !== "string") {
    throw new GoogleValidationError("Der Nachrichtentext fehlt.");
  }
  if (utf8Length(value) > MAX_BODY_BYTES) {
    throw new GoogleValidationError(
      "Der Nachrichtentext darf höchstens 500 KB groß sein.",
    );
  }
  return value;
}

export function parseCreateGmailDraftInput(
  value: unknown,
): CreateGmailDraftInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GoogleValidationError("Die E-Mail-Daten fehlen.");
  }
  const input = value as Record<string, unknown>;
  return {
    to: emailAddress(input.to),
    subject: subject(input.subject),
    body: body(input.body),
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function utf8ToBase64(value: string): string {
  return bytesToBase64(new TextEncoder().encode(value));
}

function utf8ToBase64Url(value: string): string {
  return utf8ToBase64(value)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function encodedSubject(value: string): string {
  if (!value) return "";
  const chunks: string[] = [];
  let current = "";
  for (const character of value) {
    if (current && utf8Length(current + character) > 42) {
      chunks.push(current);
      current = "";
    }
    current += character;
  }
  if (current) chunks.push(current);
  return chunks
    .map((chunk) => `=?UTF-8?B?${utf8ToBase64(chunk)}?=`)
    .join("\r\n ");
}

function wrappedBase64(value: string): string {
  return value.match(/.{1,76}/g)?.join("\r\n") || "";
}

function mimeMessage(
  input: CreateGmailDraftInput,
  googleEmail: string,
): string {
  const normalizedBody = input.body.replace(/\r\n|\r|\n/g, "\r\n");
  const headers = [
    `To: ${input.to}`,
    ...(EMAIL_ADDRESS.test(googleEmail) ? [`From: ${googleEmail}`] : []),
    `Subject: ${encodedSubject(input.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  return `${headers.join("\r\n")}\r\n\r\n${wrappedBase64(
    utf8ToBase64(normalizedBody),
  )}\r\n`;
}

export async function createGmailDraft(
  connection: GoogleConnection,
  input: CreateGmailDraftInput,
): Promise<GmailDraftResult> {
  const raw = utf8ToBase64Url(mimeMessage(input, connection.googleEmail));
  const url = new URL(GMAIL_DRAFTS_API);
  url.searchParams.set("fields", "id,message(id,threadId)");
  const response = await authorizedGoogleFetch(connection, url, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ message: { raw } }),
  });
  if (!response.ok) {
    throw new GoogleApiError(
      "Der Entwurf konnte nicht in Gmail gespeichert werden.",
      response.status,
    );
  }
  const draft = (await response.json()) as GoogleGmailDraft;
  if (!draft.id) {
    throw new GoogleApiError(
      "Gmail hat keine Entwurfs-ID zurückgegeben.",
      502,
    );
  }
  return {
    draftId: draft.id,
    ...(draft.message?.id ? { messageId: draft.message.id } : {}),
    ...(draft.message?.threadId ? { threadId: draft.message.threadId } : {}),
  };
}
