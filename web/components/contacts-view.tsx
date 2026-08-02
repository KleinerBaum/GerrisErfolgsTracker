"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { contactIdentity, parseContactCsv, type ContactCsvRow } from "../lib/contacts";
import type { Contact } from "../lib/types";

type ContactsViewProps = {
  contacts: Contact[];
  createRequest: number;
  onChange: (contacts: Contact[]) => void;
  toast: (message: string) => void;
};

type DuplicateMode = "skip" | "update";

const EMPTY_CONTACT: Omit<Contact, "id" | "createdAt" | "updatedAt"> = {
  firstName: "",
  lastName: "",
  organization: "",
  role: "",
  email: "",
  phone: "",
  mobile: "",
  street: "",
  postalCode: "",
  city: "",
  country: "",
  birthday: null,
  website: "",
  notes: "",
  tags: [],
  favorite: false,
};

const uid = (): string =>
  `contact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function displayName(contact: Pick<Contact, "firstName" | "lastName" | "organization">): string {
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.organization;
}

function initials(contact: Pick<Contact, "firstName" | "lastName" | "organization">): string {
  return displayName(contact)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("de-DE"))
    .join("");
}

function safeWebsite(value: string): string | null {
  if (!value.trim()) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(withProtocol);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function ContactEditor({
  contact,
  onClose,
  onSave,
}: {
  contact: Contact | null;
  onClose: () => void;
  onSave: (contact: Contact) => void;
}) {
  const now = new Date().toISOString();
  const [draft, setDraft] = useState<Contact>(() =>
    contact ?? { ...EMPTY_CONTACT, id: uid(), createdAt: now, updatedAt: now },
  );
  const set = (field: keyof Contact, value: Contact[keyof Contact]) =>
    setDraft((current) => ({ ...current, [field]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!displayName(draft).trim()) return;
    onSave({ ...draft, updatedAt: new Date().toISOString() });
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="contact-editor-title"
        aria-modal="true"
        className="contact-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="dialog-heading">
          <div>
            <span className="eyebrow">Kontakt</span>
            <h2 id="contact-editor-title">{contact ? "Kontakt bearbeiten" : "Kontakt anlegen"}</h2>
          </div>
          <button aria-label="Schließen" className="icon-button" onClick={onClose} type="button">×</button>
        </header>
        <form className="contact-form" onSubmit={submit}>
          <div className="contact-form-grid">
            <label><span>Vorname</span><input autoFocus value={draft.firstName} onChange={(e) => set("firstName", e.target.value)} /></label>
            <label><span>Nachname</span><input value={draft.lastName} onChange={(e) => set("lastName", e.target.value)} /></label>
            <label><span>Organisation / Firma</span><input value={draft.organization} onChange={(e) => set("organization", e.target.value)} /></label>
            <label><span>Position / Rolle</span><input value={draft.role} onChange={(e) => set("role", e.target.value)} /></label>
            <label><span>E-Mail</span><input inputMode="email" type="email" value={draft.email} onChange={(e) => set("email", e.target.value)} /></label>
            <label><span>Mobil</span><input inputMode="tel" type="tel" value={draft.mobile} onChange={(e) => set("mobile", e.target.value)} /></label>
            <label><span>Telefon</span><input inputMode="tel" type="tel" value={draft.phone} onChange={(e) => set("phone", e.target.value)} /></label>
            <label><span>Geburtstag</span><input type="date" value={draft.birthday ?? ""} onChange={(e) => set("birthday", e.target.value || null)} /></label>
            <label className="wide"><span>Straße und Hausnummer</span><input value={draft.street} onChange={(e) => set("street", e.target.value)} /></label>
            <label><span>Postleitzahl</span><input value={draft.postalCode} onChange={(e) => set("postalCode", e.target.value)} /></label>
            <label><span>Ort</span><input value={draft.city} onChange={(e) => set("city", e.target.value)} /></label>
            <label><span>Land</span><input value={draft.country} onChange={(e) => set("country", e.target.value)} /></label>
            <label><span>Webseite</span><input inputMode="url" value={draft.website} onChange={(e) => set("website", e.target.value)} /></label>
            <label className="wide"><span>Tags <small>mit Komma trennen</small></span><input value={draft.tags.join(", ")} onChange={(e) => set("tags", e.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))} /></label>
            <label className="wide"><span>Notizen</span><textarea rows={4} value={draft.notes} onChange={(e) => set("notes", e.target.value)} /></label>
          </div>
          <label className="contact-favorite"><input checked={draft.favorite} onChange={(e) => set("favorite", e.target.checked)} type="checkbox" /> Als Favorit markieren</label>
          <div className="dialog-actions">
            <button className="button secondary" onClick={onClose} type="button">Abbrechen</button>
            <button className="button primary" disabled={!displayName(draft).trim()} type="submit">Kontakt speichern</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function CsvImportDialog({
  contacts,
  onClose,
  onImport,
}: {
  contacts: Contact[];
  onClose: () => void;
  onImport: (rows: ContactCsvRow[], mode: DuplicateMode) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ContactCsvRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [skipped, setSkipped] = useState(0);
  const [mode, setMode] = useState<DuplicateMode>("skip");
  const existing = useMemo(() => new Set(contacts.map(contactIdentity)), [contacts]);
  const duplicates = rows.filter((row) => existing.has(contactIdentity(row))).length;

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    try {
      const result = parseContactCsv(await file.text());
      setRows(result.contacts);
      setSkipped(result.skippedRows);
      setFileName(file.name);
    } catch (caught) {
      setRows([]);
      setError(caught instanceof Error ? caught.message : "Die CSV-Datei konnte nicht gelesen werden.");
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section aria-labelledby="csv-import-title" aria-modal="true" className="contact-dialog csv-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <header className="dialog-heading">
          <div><span className="eyebrow">Kontakte übernehmen</span><h2 id="csv-import-title">CSV-Datei importieren</h2></div>
          <button aria-label="Schließen" className="icon-button" onClick={onClose} type="button">×</button>
        </header>
        <input accept=".csv,text/csv" hidden onChange={(e) => void readFile(e.target.files?.[0])} ref={inputRef} type="file" />
        <button className="csv-dropzone" onClick={() => inputRef.current?.click()} type="button">
          <span>CSV</span><strong>{fileName || "CSV-Datei auswählen"}</strong>
          <small>Erkannt werden u. a. Vorname, Nachname, Firma, E-Mail, Telefon, Adresse, Geburtstag, Tags und Notizen.</small>
        </button>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {rows.length ? (
          <>
            <div className="csv-import-summary"><strong>{rows.length} Kontakte erkannt</strong><span>{duplicates} mögliche Duplikate{skipped ? ` · ${skipped} leere Zeilen übersprungen` : ""}</span></div>
            <label className="csv-mode"><span>Bei Duplikaten</span><select value={mode} onChange={(e) => setMode(e.target.value as DuplicateMode)}><option value="skip">Vorhandene Kontakte behalten</option><option value="update">Vorhandene Kontakte aktualisieren</option></select></label>
            <div className="csv-preview" aria-label="Importvorschau">
              {rows.slice(0, 5).map((row, index) => <div key={`${contactIdentity(row)}-${index}`}><strong>{displayName(row)}</strong><span>{row.email || row.mobile || row.phone || "Keine Kontaktdaten"}</span>{existing.has(contactIdentity(row)) ? <small>Duplikat</small> : null}</div>)}
              {rows.length > 5 ? <p>… und {rows.length - 5} weitere</p> : null}
            </div>
          </>
        ) : null}
        <div className="dialog-actions"><button className="button secondary" onClick={onClose} type="button">Abbrechen</button><button className="button primary" disabled={!rows.length} onClick={() => onImport(rows, mode)} type="button">{rows.length} Kontakte importieren</button></div>
      </section>
    </div>
  );
}

export function ContactsView({ contacts, createRequest, onChange, toast }: ContactsViewProps) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("alle");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(contacts[0]?.id ?? null);
  const [editing, setEditing] = useState<Contact | null | undefined>(undefined);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    // Externer, bewusst inkrementierter Öffnungsimpuls aus der Hauptnavigation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (createRequest > 0) setEditing(null);
  }, [createRequest]);

  const tags = useMemo(() => [...new Set(contacts.flatMap((contact) => contact.tags))].sort((a, b) => a.localeCompare(b, "de")), [contacts]);
  const filtered = useMemo(() => contacts.filter((contact) => {
    const haystack = [displayName(contact), contact.organization, contact.role, contact.email, contact.phone, contact.mobile, contact.city, ...contact.tags].join(" ").toLocaleLowerCase("de-DE");
    return haystack.includes(query.trim().toLocaleLowerCase("de-DE")) && (tag === "alle" || contact.tags.includes(tag)) && (!favoritesOnly || contact.favorite);
  }).sort((a, b) => Number(b.favorite) - Number(a.favorite) || displayName(a).localeCompare(displayName(b), "de")), [contacts, favoritesOnly, query, tag]);
  const selected = contacts.find((contact) => contact.id === selectedId) ?? filtered[0] ?? null;

  const save = (contact: Contact) => {
    onChange(contacts.some((candidate) => candidate.id === contact.id) ? contacts.map((candidate) => candidate.id === contact.id ? contact : candidate) : [...contacts, contact]);
    setSelectedId(contact.id);
    setEditing(undefined);
    toast("Kontakt gespeichert");
  };
  const remove = (contact: Contact) => {
    if (!window.confirm(`${displayName(contact)} wirklich löschen?`)) return;
    onChange(contacts.filter((candidate) => candidate.id !== contact.id));
    setSelectedId(null);
    toast("Kontakt gelöscht");
  };
  const importRows = (rows: ContactCsvRow[], mode: DuplicateMode) => {
    const now = new Date().toISOString();
    const next = [...contacts];
    let imported = 0;
    let updated = 0;
    for (const row of rows) {
      const index = next.findIndex((contact) => contactIdentity(contact) === contactIdentity(row));
      if (index >= 0) {
        if (mode === "update") {
          next[index] = { ...next[index], ...row, favorite: next[index].favorite, updatedAt: now };
          updated += 1;
        }
        continue;
      }
      next.push({ ...row, id: uid(), favorite: false, createdAt: now, updatedAt: now });
      imported += 1;
    }
    onChange(next);
    setImportOpen(false);
    toast(`${imported} Kontakte importiert${updated ? ` · ${updated} aktualisiert` : ""}`);
  };
  const toggleFavorite = (contact: Contact) => onChange(contacts.map((candidate) => candidate.id === contact.id ? { ...candidate, favorite: !candidate.favorite, updatedAt: new Date().toISOString() } : candidate));
  const website = selected ? safeWebsite(selected.website) : null;

  return (
    <div className="contacts-view">
      <section className="contacts-hero">
        <div><span className="eyebrow">Adressbuch</span><h1>Kontakte</h1><p>Kontaktdaten, Geburtstage und Notizen.</p></div>
        <div className="contacts-hero-actions"><button className="button secondary" onClick={() => setImportOpen(true)} type="button">CSV importieren</button><button className="button primary" onClick={() => setEditing(null)} type="button">Kontakt anlegen</button></div>
      </section>
      <section className="contact-kpis" aria-label="Kontaktübersicht"><article><strong>{contacts.length}</strong><span>Kontakte gesamt</span></article><article><strong>{contacts.filter((contact) => contact.favorite).length}</strong><span>Favoriten</span></article><article><strong>{contacts.filter((contact) => contact.email).length}</strong><span>mit E-Mail</span></article><article><strong>{tags.length}</strong><span>Tags</span></article></section>
      <section className="contacts-workspace panel">
        <div className="contacts-list-pane">
          <div className="contacts-toolbar"><label className="search-field"><span className="sr-only">Kontakte durchsuchen</span><input placeholder="Name, Firma, Ort oder Tag suchen" value={query} onChange={(e) => setQuery(e.target.value)} /></label><select aria-label="Nach Tag filtern" value={tag} onChange={(e) => setTag(e.target.value)}><option value="alle">Alle Tags</option>{tags.map((value) => <option key={value} value={value}>{value}</option>)}</select><button aria-pressed={favoritesOnly} className={favoritesOnly ? "filter-chip active" : "filter-chip"} onClick={() => setFavoritesOnly((value) => !value)} type="button">Favoriten</button></div>
          <div className="contact-list" aria-label="Kontaktliste">
            {filtered.map((contact) => <button className={selected?.id === contact.id ? "active" : ""} key={contact.id} onClick={() => setSelectedId(contact.id)} type="button"><span className="contact-avatar">{initials(contact) || "K"}</span><span><strong>{displayName(contact)}</strong><small>{[contact.role, contact.organization].filter(Boolean).join(" · ") || contact.email || contact.mobile || "Kontaktdaten ergänzen"}</small></span>{contact.favorite ? <b aria-label="Favorit">★</b> : null}</button>)}
            {!filtered.length ? <div className="contacts-empty"><strong>{contacts.length ? "Keine Treffer" : "Noch keine Kontakte"}</strong><p>{contacts.length ? "Passe Suche oder Filter an." : "Lege den ersten Kontakt an oder importiere eine CSV-Datei."}</p></div> : null}
          </div>
        </div>
        <div className="contact-detail-pane">
          {selected ? <><header><span className="contact-avatar large">{initials(selected) || "K"}</span><div><span className="eyebrow">Kontakt</span><h2>{displayName(selected)}</h2><p>{[selected.role, selected.organization].filter(Boolean).join(" · ") || "Persönlicher Kontakt"}</p></div><button aria-label={selected.favorite ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen"} className="favorite-button" onClick={() => toggleFavorite(selected)} type="button">{selected.favorite ? "★" : "☆"}</button></header><div className="contact-detail-grid"><div><span>E-Mail</span>{selected.email ? <a href={`mailto:${selected.email}`}>{selected.email}</a> : <small>Nicht hinterlegt</small>}</div><div><span>Mobil</span>{selected.mobile ? <a href={`tel:${selected.mobile}`}>{selected.mobile}</a> : <small>Nicht hinterlegt</small>}</div><div><span>Telefon</span>{selected.phone ? <a href={`tel:${selected.phone}`}>{selected.phone}</a> : <small>Nicht hinterlegt</small>}</div><div><span>Geburtstag</span><strong>{selected.birthday ? new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${selected.birthday}T12:00:00Z`)) : "Nicht hinterlegt"}</strong></div><div className="wide"><span>Adresse</span><strong>{[selected.street, [selected.postalCode, selected.city].filter(Boolean).join(" "), selected.country].filter(Boolean).join(", ") || "Nicht hinterlegt"}</strong></div>{website ? <div className="wide"><span>Webseite</span><a href={website} rel="noreferrer" target="_blank">{selected.website}</a></div> : null}</div>{selected.tags.length ? <div className="contact-tags">{selected.tags.map((value) => <span key={value}>{value}</span>)}</div> : null}{selected.notes ? <div className="contact-notes"><span>Notizen</span><p>{selected.notes}</p></div> : null}<footer><button className="button secondary danger" onClick={() => remove(selected)} type="button">Löschen</button><button className="button primary" onClick={() => setEditing(selected)} type="button">Bearbeiten</button></footer></> : <div className="contacts-empty"><strong>Kontakt auswählen</strong><p>Wähle links einen Kontakt.</p></div>}
        </div>
      </section>
      {editing !== undefined ? <ContactEditor contact={editing} onClose={() => setEditing(undefined)} onSave={save} /> : null}
      {importOpen ? <CsvImportDialog contacts={contacts} onClose={() => setImportOpen(false)} onImport={importRows} /> : null}
    </div>
  );
}
