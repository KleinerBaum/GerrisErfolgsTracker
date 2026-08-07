import type { CalendarEvent, Cost, DocumentKind } from "./types";

const GOOGLE_DRIVE_HOSTS = new Set(["docs.google.com", "drive.google.com"]);
const DRIVE_FILE_ID = /^[a-zA-Z0-9_-]+$/;

export function safeGoogleDriveUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !GOOGLE_DRIVE_HOSTS.has(url.hostname)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function extractDriveFileId(url: string): string | null {
  const safeUrl = safeGoogleDriveUrl(url);
  if (!safeUrl) return null;
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /\/document\/d\/([a-zA-Z0-9_-]+)/,
    /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
    /\/presentation\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ];
  for (const pattern of patterns) {
    const match = safeUrl.match(pattern);
    if (match?.[1] && DRIVE_FILE_ID.test(match[1])) return match[1];
  }
  return null;
}

export function inferDocumentKind(url: string): DocumentKind {
  if (url.includes("/document/")) return "document";
  if (url.includes("/spreadsheets/")) return "sheet";
  if (url.includes("/folders/")) return "folder";
  return "pdf";
}

export function drivePreviewUrl(url: string, fileId: string | null): string | null {
  const safeUrl = safeGoogleDriveUrl(url);
  if (!safeUrl || !fileId || !DRIVE_FILE_ID.test(fileId)) return null;
  if (safeUrl.includes("/document/"))
    return `https://docs.google.com/document/d/${fileId}/preview`;
  if (safeUrl.includes("/spreadsheets/"))
    return `https://docs.google.com/spreadsheets/d/${fileId}/preview`;
  if (safeUrl.includes("/presentation/"))
    return `https://docs.google.com/presentation/d/${fileId}/preview`;
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

export function driveDownloadUrl(
  url: string,
  fileId: string | null,
): string | null {
  const safeUrl = safeGoogleDriveUrl(url);
  if (!safeUrl) return null;
  if (!fileId || !DRIVE_FILE_ID.test(fileId)) return safeUrl;
  if (safeUrl.includes("/document/"))
    return `https://docs.google.com/document/d/${fileId}/export?format=pdf`;
  if (safeUrl.includes("/spreadsheets/"))
    return `https://docs.google.com/spreadsheets/d/${fileId}/export?format=xlsx`;
  if (safeUrl.includes("/presentation/"))
    return `https://docs.google.com/presentation/d/${fileId}/export/pdf`;
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

const calendarStamp = (iso: string, hour = 9): string => {
  const date = new Date(iso);
  date.setHours(hour, 0, 0, 0);
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
};

export function paymentCalendarUrl(cost: Cost): string {
  const start = calendarStamp(cost.dueAt, 9);
  const end = calendarStamp(cost.dueAt, 9)
    .replace(/(\d{2})(\d{2})(\d{2})Z$/, (_match, h, m, s) => {
      const hour = String((Number(h) + 1) % 24).padStart(2, "0");
      return `${hour}${m}${s}Z`;
    });
  const parameters = new URLSearchParams({
    action: "TEMPLATE",
    text: `Zahlung: ${cost.title}`,
    dates: `${start}/${end}`,
    details: `Privater Zahlungstermin · ${cost.amount.toFixed(2)} EUR · ${cost.payee}\n\nAus Gerris Kompass vorbereitet. Bitte im Kalender die Sichtbarkeit „Privat“ prüfen.`,
    ctz: "Europe/Berlin",
  });
  return `https://calendar.google.com/calendar/render?${parameters.toString()}`;
}

export function gmailComposeUrl(cost: Cost, account: string): string {
  const parameters = new URLSearchParams({
    view: "cm",
    fs: "1",
    authuser: account,
    to: cost.contactEmail,
    su: `Rückfrage zu ${cost.title}`,
    body: `Guten Tag,\n\nich habe eine Rückfrage zu ${cost.title} (${cost.amount.toFixed(2)} EUR, fällig am ${new Intl.DateTimeFormat("de-DE").format(new Date(cost.dueAt))}).\n\nViele Grüße`,
  });
  return `https://mail.google.com/mail/?${parameters.toString()}`;
}

export function gmailDraftUrl({
  account,
  to,
  subject,
  body,
}: {
  account: string;
  to: string;
  subject: string;
  body: string;
}): string {
  const parameters = new URLSearchParams({
    view: "cm",
    fs: "1",
    authuser: account,
    to,
    su: subject,
    body,
  });
  return `https://mail.google.com/mail/?${parameters.toString()}`;
}

const eventStamp = (iso: string): string =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

export function calendarEventUrl(event: CalendarEvent): string {
  const parameters = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${eventStamp(event.startAt)}/${eventStamp(event.endAt)}`,
    details: [
      event.note,
      "Aus Gerris Kompass vorbereitet. Bitte Angaben und Sichtbarkeit vor dem Speichern prüfen.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    location: event.location ?? "",
    ctz: "Europe/Berlin",
  });
  return `https://calendar.google.com/calendar/render?${parameters.toString()}`;
}
