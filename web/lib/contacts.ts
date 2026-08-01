import type { Contact } from "./types";

export type ContactCsvRow = Omit<
  Contact,
  "id" | "favorite" | "createdAt" | "updatedAt"
>;

export type ContactCsvResult = {
  contacts: ContactCsvRow[];
  skippedRows: number;
  headers: string[];
};

const FIELD_ALIASES: Record<keyof ContactCsvRow, string[]> = {
  firstName: ["vorname", "first name", "firstname", "given name"],
  lastName: ["nachname", "last name", "lastname", "surname", "family name"],
  organization: ["organisation", "organization", "firma", "unternehmen", "company"],
  role: ["rolle", "position", "funktion", "job title", "title"],
  email: ["e-mail", "email", "email address", "e-mail-adresse"],
  phone: ["telefon", "phone", "telefonnummer", "phone number"],
  mobile: ["mobil", "mobile", "handy", "mobiltelefon"],
  street: ["straße", "strasse", "street", "adresse", "address"],
  postalCode: ["plz", "postleitzahl", "postal code", "zip", "zip code"],
  city: ["ort", "stadt", "city"],
  country: ["land", "country"],
  birthday: ["geburtstag", "geburtsdatum", "birthday", "date of birth"],
  website: ["webseite", "website", "url"],
  notes: ["notizen", "notiz", "notes", "note", "bemerkung"],
  tags: ["tags", "kategorien", "gruppen", "labels"],
};

function normalizeHeader(value: string): string {
  return value.trim().toLocaleLowerCase("de-DE").replace(/^\ufeff/, "");
}

function detectDelimiter(raw: string): string {
  const firstRecord = raw.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [";", ",", "\t"];
  return candidates.reduce((best, candidate) =>
    firstRecord.split(candidate).length > firstRecord.split(best).length
      ? candidate
      : best,
  );
}

function parseRecords(raw: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    const next = raw[index + 1];
    if (character === '"') {
      if (quoted && next === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      record.push(field.trim());
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      record.push(field.trim());
      if (record.some(Boolean)) records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }
  record.push(field.trim());
  if (record.some(Boolean)) records.push(record);
  return records;
}

function normalizedBirthday(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const german = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed);
  if (!german) return null;
  return `${german[3]}-${german[2].padStart(2, "0")}-${german[1].padStart(2, "0")}`;
}

export function parseContactCsv(raw: string): ContactCsvResult {
  const records = parseRecords(raw.replace(/^\ufeff/, ""), detectDelimiter(raw));
  if (records.length < 2) {
    throw new Error("Die CSV-Datei enthält keine Kontakte.");
  }
  const headers = records[0].map(normalizeHeader);
  const indexes = Object.fromEntries(
    Object.entries(FIELD_ALIASES).map(([field, aliases]) => [
      field,
      headers.findIndex((header) => aliases.includes(header)),
    ]),
  ) as Record<keyof ContactCsvRow, number>;
  if (indexes.firstName < 0 && indexes.lastName < 0 && indexes.organization < 0) {
    throw new Error(
      "Es wurde keine Namensspalte erkannt. Verwende z. B. Vorname, Nachname oder Firma.",
    );
  }
  const value = (record: string[], field: keyof ContactCsvRow): string =>
    indexes[field] >= 0 ? (record[indexes[field]] ?? "").trim() : "";
  let skippedRows = 0;
  const contacts = records.slice(1).flatMap((record) => {
    const firstName = value(record, "firstName");
    const lastName = value(record, "lastName");
    const organization = value(record, "organization");
    if (!firstName && !lastName && !organization) {
      skippedRows += 1;
      return [];
    }
    return [{
      firstName,
      lastName,
      organization,
      role: value(record, "role"),
      email: value(record, "email"),
      phone: value(record, "phone"),
      mobile: value(record, "mobile"),
      street: value(record, "street"),
      postalCode: value(record, "postalCode"),
      city: value(record, "city"),
      country: value(record, "country"),
      birthday: normalizedBirthday(value(record, "birthday")),
      website: value(record, "website"),
      notes: value(record, "notes"),
      tags: value(record, "tags").split(/[|,]/).map((tag) => tag.trim()).filter(Boolean),
    }];
  });
  return { contacts, skippedRows, headers };
}

export function contactIdentity(contact: Pick<Contact, "email" | "phone" | "mobile" | "firstName" | "lastName" | "organization">): string {
  const email = contact.email.trim().toLocaleLowerCase("de-DE");
  if (email) return `email:${email}`;
  const phone = (contact.mobile || contact.phone).replace(/\D/g, "");
  if (phone) return `phone:${phone}`;
  return `name:${[contact.firstName, contact.lastName, contact.organization]
    .join("|")
    .trim()
    .toLocaleLowerCase("de-DE")}`;
}
