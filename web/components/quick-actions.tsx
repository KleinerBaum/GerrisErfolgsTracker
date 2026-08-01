"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { gmailDraftUrl } from "../lib/google-links";
import {
  CalendarClientError,
  listGoogleCalendars,
} from "../lib/google-calendar-client";
import { APP_TIME_ZONE } from "../lib/format";
import {
  type CalendarEvent,
  type ApplicationProcess,
  type DocumentKind,
  type DocumentRef,
  type GoogleCalendar,
  type IntegrationConfig,
} from "../lib/types";

export type QuickActionKind =
  | "upload"
  | "event"
  | "task"
  | "email"
  | "application";

const QUICK_ACTIONS: Array<{
  key: QuickActionKind;
  label: string;
  mark: string;
  tone: string;
}> = [
  { key: "upload", label: "Datei ablegen", mark: "↥", tone: "green" },
  { key: "event", label: "Termin", mark: "T", tone: "blue" },
  { key: "task", label: "Aufgabe", mark: "A", tone: "amber" },
  { key: "email", label: "E-Mail", mark: "@", tone: "violet" },
  { key: "application", label: "Bewerbung", mark: "B", tone: "rose" },
];

export function SidebarQuickActions({
  onAction,
}: {
  onAction: (kind: QuickActionKind) => void;
}) {
  return (
    <section className="sidebar-quick-actions" aria-labelledby="quick-actions-title">
      <span className="quick-actions-kicker" id="quick-actions-title">
        Schnell erledigt
      </span>
      <div className="quick-actions-grid">
        {QUICK_ACTIONS.map((action) => (
          <button
            className={`quick-action-pill tone-${action.tone}`}
            key={action.key}
            onClick={() => onAction(action.key)}
            title={action.label}
            type="button"
          >
            <span aria-hidden="true">{action.mark}</span>
            <span className="quick-action-copy">{action.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

type QuickActionDialogProps = {
  kind: Exclude<QuickActionKind, "task">;
  documents: DocumentRef[];
  applicationDraft: ApplicationProcess | null;
  masterCvDocumentId: string | null;
  integrations: IntegrationConfig;
  onClose: () => void;
  onSaveDocument: (document: DocumentRef) => void;
  onSaveEvent: (event: CalendarEvent) => void;
  toast: (message: string) => void;
};

const ACTION_COPY: Record<
  Exclude<QuickActionKind, "task">,
  { eyebrow: string; title: string }
> = {
  upload: {
    eyebrow: "Private Ablage",
    title: "Dateien sicher und auffindbar ablegen",
  },
  event: {
    eyebrow: "Zeit reservieren",
    title: "Termin erstellen",
  },
  email: {
    eyebrow: "Schreibassistenz",
    title: "E-Mail formulieren oder beantworten",
  },
  application: {
    eyebrow: "Bewerbungsstudio",
    title: "Ein stimmiges Bewerbungspaket erstellen",
  },
};

export function QuickActionDialog({
  kind,
  documents,
  applicationDraft,
  integrations,
  masterCvDocumentId,
  onClose,
  onSaveDocument,
  onSaveEvent,
  toast,
}: QuickActionDialogProps) {
  const copy = ACTION_COPY[kind];
  return (
    <div className="dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="quick-dialog-title"
        aria-modal="true"
        className={`capture-dialog quick-action-dialog action-${kind}`}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="dialog-handle" />
        <header className="dialog-heading">
          <div>
            <span className="eyebrow">{copy.eyebrow}</span>
            <h2 id="quick-dialog-title">{copy.title}</h2>
          </div>
          <button aria-label="Schließen" onClick={onClose} type="button">
            Schließen
          </button>
        </header>

        {kind === "upload" ? (
          <UploadForm
            documents={documents}
            integrations={integrations}
            onClose={onClose}
            onSave={onSaveDocument}
            toast={toast}
          />
        ) : null}
        {kind === "event" ? (
          <EventForm
            onClose={onClose}
            onSave={onSaveEvent}
            toast={toast}
          />
        ) : null}
        {kind === "email" ? (
          <EmailComposer
            account={integrations.gmailAccount}
            toast={toast}
          />
        ) : null}
        {kind === "application" ? (
          <ApplicationStudio
            account={integrations.gmailAccount}
            documents={documents}
            initialApplication={applicationDraft}
            masterCvDocumentId={masterCvDocumentId}
            toast={toast}
          />
        ) : null}
      </section>
    </div>
  );
}

function fileKind(fileName: string): DocumentKind {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (["doc", "docx", "odt", "rtf", "txt", "md"].includes(extension ?? "")) {
    return "document";
  }
  if (["csv", "xls", "xlsx"].includes(extension ?? "")) return "sheet";
  if (extension === "pdf") return "pdf";
  return "other";
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${Math.round(bytes / 1_024)} KB`;
  return `${(bytes / 1_048_576).toFixed(1).replace(".", ",")} MB`;
}

type UploadResponse = {
  fileId: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  destination: string;
  downloadUrl: string;
  error?: string;
};

function UploadForm({
  documents,
  integrations,
  onClose,
  onSave,
  toast,
}: {
  documents: DocumentRef[];
  integrations: IntegrationConfig;
  onClose: () => void;
  onSave: (document: DocumentRef) => void;
  toast: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [destination, setDestination] = useState(
    "Persönlich/Fotos & Dokumente",
  );
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");
  const [reviewAt, setReviewAt] = useState("");
  const [duplicateMode, setDuplicateMode] = useState<"rename" | "skip">("rename");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [savedCount, setSavedCount] = useState(0);
  const folderOptions = useMemo(
    () => [
      "Persönlich/Fotos & Dokumente",
      "Persönlich/Bewerbungen",
      "Persönlich/Finanzen & Verträge",
      "Persönlich/Wohnen",
      ...new Set(
        documents
          .filter((document) => document.kind !== "folder")
          .map((document) => document.folderPath),
      ),
    ],
    [documents],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!files.length || !destination.trim() || busy) return;
    setBusy(true);
    setError("");
    let saved = 0;
    const failed: string[] = [];
    const normalizedDestination = destination.trim().replace(/^\/+|\/+$/g, "");
    const tagList = tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 8);

    for (const [index, file] of files.entries()) {
      setProgress(`Datei ${index + 1} von ${files.length}: ${file.name}`);
      const duplicate = documents.some(
        (document) =>
          document.name.toLowerCase() === file.name.toLowerCase() &&
          document.folderPath.toLowerCase() ===
            normalizedDestination.toLowerCase(),
      );
      if (duplicate && duplicateMode === "skip") continue;
      if (file.size > 20 * 1024 * 1024) {
        failed.push(`${file.name} ist größer als 20 MB`);
        continue;
      }

      try {
        const form = new FormData();
        form.append("file", file);
        form.append("destination", normalizedDestination);
        const response = await fetch("/api/files", { method: "POST", body: form });
        const payload = (await response.json()) as UploadResponse;
        if (!response.ok) throw new Error(payload.error || "Upload fehlgeschlagen");
        const displayName =
          duplicate && duplicateMode === "rename"
            ? `${file.name.replace(/\.[^.]+$/, "")} – ${new Date()
                .toLocaleDateString("de-DE")
                .replace(/\./g, "-")}.${file.name.split(".").pop() ?? ""}`
            : file.name;
        onSave({
          id: `upload-${payload.fileId}`,
          name: displayName,
          folderPath: normalizedDestination,
          kind: fileKind(file.name),
          driveUrl: payload.downloadUrl,
          fileId: null,
          modifiedAt: new Date().toISOString(),
          tags: ["Private Ablage", ...tagList],
          confidential: true,
          storage: "upload",
          downloadUrl: payload.downloadUrl,
          contentType: payload.contentType,
          sizeBytes: payload.sizeBytes,
          note: note.trim(),
          reviewAt: reviewAt || null,
        });
        saved += 1;
      } catch (uploadError) {
        failed.push(
          `${file.name}: ${
            uploadError instanceof Error
              ? uploadError.message
              : "Upload fehlgeschlagen"
          }`,
        );
      }
    }

    setSavedCount(saved);
    setBusy(false);
    setProgress("");
    if (failed.length) setError(failed.join(" · "));
    if (saved) toast(`${saved} Datei${saved === 1 ? "" : "en"} sicher abgelegt`);
  };

  if (savedCount > 0 && !busy) {
    return (
      <div className="action-success" role="status">
        <span>{savedCount}</span>
        <h3>{savedCount === 1 ? "Datei abgelegt" : "Dateien abgelegt"}</h3>
        <p>
          Die Inhalte liegen in deiner privaten Ablage. Ordner, Schlagworte und
          Prüftermin sind im Kompass gespeichert.
        </p>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="button button-primary" onClick={onClose} type="button">
          Fertig
        </button>
      </div>
    );
  }

  return (
    <form className="capture-form action-form" onSubmit={submit}>
      <div className="source-path-card">
        <span>Vorgesehener Quellordner</span>
        <strong>{integrations.driveLocalPath}</strong>
        <small>
          Der Browser öffnet aus Sicherheitsgründen den Dateidialog; navigiere
          dort bei Bedarf zu diesem Ordner.
        </small>
      </div>

      <label
        className={`file-drop-field ${files.length ? "has-files" : ""}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          setFiles([...event.dataTransfer.files].slice(0, 6));
        }}
      >
        <input
          accept=".pdf,.doc,.docx,.odt,.rtf,.txt,.md,.csv,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.heic"
          className="visually-hidden"
          multiple
          onChange={(event) =>
            setFiles([...(event.target.files ?? [])].slice(0, 6))
          }
          ref={inputRef}
          type="file"
        />
        <span className="upload-mark" aria-hidden="true">↥</span>
        <strong>
          {files.length
            ? `${files.length} Datei${files.length === 1 ? "" : "en"} ausgewählt`
            : "Dateien auswählen oder hier ablegen"}
        </strong>
        <small>Bis zu 6 Dateien, jeweils maximal 20 MB</small>
        <button
          className="button button-soft"
          onClick={(event) => {
            event.preventDefault();
            inputRef.current?.click();
          }}
          type="button"
        >
          Dateidialog öffnen
        </button>
      </label>

      {files.length ? (
        <div className="selected-file-list">
          {files.map((file) => (
            <div key={`${file.name}-${file.lastModified}`}>
              <span>{fileKind(file.name).toUpperCase()}</span>
              <strong>{file.name}</strong>
              <small>{formatBytes(file.size)}</small>
            </div>
          ))}
        </div>
      ) : null}

      <div className="form-grid">
        <label>
          Zielordner in „Meine Ablage“
          <input
            list="destination-folders"
            onChange={(event) => setDestination(event.target.value)}
            required
            value={destination}
          />
          <datalist id="destination-folders">
            {folderOptions.map((folder) => (
              <option key={folder} value={folder} />
            ))}
          </datalist>
        </label>
        <label>
          Schlagworte
          <input
            onChange={(event) => setTags(event.target.value)}
            placeholder="z. B. Steuer, 2026, Vertrag"
            value={tags}
          />
        </label>
      </div>
      <div className="form-grid">
        <label>
          Erneut prüfen am
          <input
            onChange={(event) => setReviewAt(event.target.value)}
            type="date"
            value={reviewAt}
          />
        </label>
        <label>
          Bei gleichem Dateinamen
          <select
            onChange={(event) =>
              setDuplicateMode(event.target.value as "rename" | "skip")
            }
            value={duplicateMode}
          >
            <option value="rename">Als neue Version ablegen</option>
            <option value="skip">Duplikat überspringen</option>
          </select>
        </label>
      </div>
      <label>
        Notiz zur Ablage
        <textarea
          onChange={(event) => setNote(event.target.value)}
          placeholder="Warum ist die Datei wichtig, was ist als Nächstes zu tun?"
          rows={3}
          value={note}
        />
      </label>
      <p className="form-trust">
        Dateien werden privat und kontogebunden gespeichert. Unterstützte
        Formate werden geprüft; ausführbare Dateien sind ausgeschlossen.
      </p>
      {progress ? <p className="form-progress" role="status">{progress}</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="dialog-actions">
        <button className="button button-ghost" onClick={onClose} type="button">
          Abbrechen
        </button>
        <button
          className="button button-primary"
          disabled={!files.length || busy}
          type="submit"
        >
          {busy ? "Wird sicher abgelegt …" : "In Meine Ablage speichern"}
        </button>
      </div>
    </form>
  );
}

function todayInput(): string {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

const EVENT_DURATION_OPTIONS = [
  15,
  30,
  45,
  60,
  90,
  120,
  180,
  240,
  360,
  480,
  720,
  1_440,
  2_160,
  2_880,
  4_320,
  5_760,
  7_200,
  10_080,
  14_400,
  20_160,
] as const;

function addDaysToInput(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function eventDurationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} Minuten`;
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const remainingMinutes = minutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} ${days === 1 ? "Tag" : "Tage"}`);
  if (hours) parts.push(`${hours} ${hours === 1 ? "Stunde" : "Stunden"}`);
  if (remainingMinutes) parts.push(`${remainingMinutes} Minuten`);
  return parts.join(" ");
}

function eventEndLabel(date: string, time: string, duration: number): string {
  const start = new Date(`${date}T${time}:00`);
  if (Number.isNaN(start.getTime())) return "Ende wird automatisch berechnet";
  const end = new Date(start.getTime() + duration * 60_000);
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(end);
}

function EventForm({
  onClose,
  onSave,
  toast,
}: {
  onClose: () => void;
  onSave: (event: CalendarEvent) => void;
  toast: (message: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayInput());
  const [time, setTime] = useState("09:00");
  const [durationIndex, setDurationIndex] = useState(3);
  const [allDay, setAllDay] = useState(false);
  const [isPrivate, setIsPrivate] = useState(true);
  const [shareByEmail, setShareByEmail] = useState(false);
  const [attendeeEmail, setAttendeeEmail] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<CalendarEvent["kind"]>("job_interview");
  const [reminder, setReminder] = useState(30);
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [calendarId, setCalendarId] = useState("primary");
  const [calendarSelectionLoading, setCalendarSelectionLoading] = useState(true);
  const [calendarSelectionConnectUrl, setCalendarSelectionConnectUrl] =
    useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connectUrl, setConnectUrl] = useState("");
  const duration = EVENT_DURATION_OPTIONS[durationIndex] || 60;
  const durationSummary = allDay
    ? "Ganzer Tag"
    : `${eventDurationLabel(duration)} · Ende ${eventEndLabel(date, time, duration)}`;

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const loaded = (await listGoogleCalendars()).filter(
          (calendar) => calendar.accessRole === "owner",
        );
        if (!active) return;
        setCalendars(loaded);
        const preferred = loaded.find((calendar) => calendar.primary) || loaded[0];
        if (preferred) setCalendarId(preferred.id);
      } catch (caught) {
        if (active && caught instanceof CalendarClientError) {
          setCalendarSelectionConnectUrl(caught.connectUrl);
        }
      } finally {
        if (active) setCalendarSelectionLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (
      !title.trim() ||
      !date ||
      (!allDay && !time) ||
      (shareByEmail && !attendeeEmail.trim()) ||
      busy
    ) {
      return;
    }
    const allDayEndDate = addDaysToInput(date, 1);
    const start = new Date(`${date}T${allDay ? "00:00" : time}:00`);
    const end = allDay
      ? new Date(`${allDayEndDate}T00:00:00`)
      : new Date(start.getTime() + duration * 60_000);
    const calendarEvent = {
      title: title.trim(),
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      kind,
      private: isPrivate,
      allDay,
      startDate: allDay ? date : undefined,
      endDate: allDay ? allDayEndDate : undefined,
      attendeeEmail: shareByEmail ? attendeeEmail.trim() : undefined,
      timeZone: APP_TIME_ZONE,
      calendarId,
      location: location.trim(),
      note: note.trim(),
      reminderMinutes: reminder,
    };
    setBusy(true);
    setError("");
    setConnectUrl("");
    try {
      const response = await fetch("/api/calendar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(calendarEvent),
      });
      const payload = (await response.json()) as {
        event?: CalendarEvent;
        error?: string;
        connectUrl?: string;
      };
      if (!response.ok || !payload.event) {
        setConnectUrl(payload.connectUrl || "");
        throw new Error(
          payload.error || "Der Termin konnte nicht gespeichert werden.",
        );
      }
      onSave(payload.event);
      toast(
        shareByEmail
          ? "Termin gespeichert und Einladung per E-Mail versendet"
          : "Termin direkt in Google Kalender gespeichert",
      );
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Der Termin konnte nicht gespeichert werden.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="capture-form action-form" onSubmit={submit}>
      <label>
        Titel
        <input
          autoFocus
          onChange={(event) => setTitle(event.target.value)}
          placeholder="z. B. Gespräch mit Frau Müller"
          required
          value={title}
        />
      </label>
      <div className="event-switch-grid">
        <label className="event-switch">
          <input
            checked={allDay}
            onChange={(event) => setAllDay(event.target.checked)}
            role="switch"
            type="checkbox"
          />
          <span className="event-switch-copy">
            <strong>Ganztägig</strong>
            <small>Reserviert den gesamten ausgewählten Tag.</small>
          </span>
          <span aria-hidden="true" className="event-switch-track">
            <span />
          </span>
        </label>
        <label className="event-switch">
          <input
            checked={isPrivate}
            onChange={(event) => setIsPrivate(event.target.checked)}
            role="switch"
            type="checkbox"
          />
          <span className="event-switch-copy">
            <strong>Privater Termin</strong>
            <small>Verbirgt Details bei eingeschränkter Kalenderfreigabe.</small>
          </span>
          <span aria-hidden="true" className="event-switch-track">
            <span />
          </span>
        </label>
      </div>
      <div className="form-grid three">
        <label>
          Datum
          <input
            onChange={(event) => setDate(event.target.value)}
            required
            type="date"
            value={date}
          />
        </label>
        <label>
          Beginn
          <input
            disabled={allDay}
            onChange={(event) => setTime(event.target.value)}
            required={!allDay}
            type="time"
            value={time}
          />
        </label>
        <label>
          Erinnerung
          <select
            onChange={(event) => setReminder(Number(event.target.value))}
            value={reminder}
          >
            <option value="0">Keine</option>
            <option value="10">10 Minuten vorher</option>
            <option value="30">30 Minuten vorher</option>
            <option value="60">1 Stunde vorher</option>
            <option value="1440">1 Tag vorher</option>
          </select>
        </label>
      </div>
      <label className={`event-duration-field${allDay ? " is-disabled" : ""}`}>
        <span className="event-field-heading">
          <span>Dauer</span>
          <output htmlFor="event-duration">{durationSummary}</output>
        </span>
        <input
          aria-label="Termindauer einstellen"
          disabled={allDay}
          id="event-duration"
          max={EVENT_DURATION_OPTIONS.length - 1}
          min="0"
          onChange={(event) => setDurationIndex(Number(event.target.value))}
          step="1"
          type="range"
          value={durationIndex}
        />
        <span aria-hidden="true" className="event-duration-scale">
          <span>15 Min.</span>
          <span>1 Tag</span>
          <span>14 Tage</span>
        </span>
      </label>
      <div className="form-grid">
        <label>
          Zielkalender
          <select
            disabled={calendarSelectionLoading}
            onChange={(event) => setCalendarId(event.target.value)}
            value={calendarId}
          >
            {!calendars.length ? <option value="primary">Hauptkalender</option> : null}
            {calendars.map((calendar) => (
              <option key={calendar.id} value={calendar.id}>
                {calendar.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Art des Termins
          <select
            onChange={(event) =>
              setKind(event.target.value as CalendarEvent["kind"])
            }
            value={kind}
          >
            <option value="job_interview">Bewerbungsgespräch</option>
            <option value="employment_agency">Arbeitsagentur / Jobcenter</option>
            <option value="networking">Netzwerk / Karrierekontakt</option>
            <option value="learning">Weiterbildung / Lernen</option>
            <option value="family">Familie / Kinder</option>
            <option value="school_childcare">Schule / Kita</option>
            <option value="health">Gesundheit / Vorsorge</option>
            <option value="public_office">Behörde / Finanzen</option>
            <option value="appointment">Persönlicher Termin</option>
          </select>
        </label>
      </div>
      <label>
        Ort oder Videolink
        <input
          onChange={(event) => setLocation(event.target.value)}
          placeholder="Optional"
          value={location}
        />
      </label>
      <label>
        Notizen und Vorbereitung
        <textarea
          onChange={(event) => setNote(event.target.value)}
          placeholder="Agenda, Unterlagen, Gesprächsziel …"
          rows={3}
          value={note}
        />
      </label>
      <label className="event-share-switch event-switch">
        <input
          checked={shareByEmail}
          onChange={(event) => setShareByEmail(event.target.checked)}
          role="switch"
          type="checkbox"
        />
        <span className="event-switch-copy">
          <strong>Per E-Mail teilen</strong>
          <small>Google Kalender sendet der Person direkt eine Einladung.</small>
        </span>
        <span aria-hidden="true" className="event-switch-track">
          <span />
        </span>
      </label>
      {shareByEmail ? (
        <label>
          E-Mail-Adresse der eingeladenen Person
          <input
            autoComplete="email"
            onChange={(event) => setAttendeeEmail(event.target.value)}
            placeholder="name@beispiel.de"
            required
            type="email"
            value={attendeeEmail}
          />
        </label>
      ) : null}
      <p className="form-trust">
        Mit „Termin speichern“ wird der Eintrag sofort im Zielkalender angelegt –
        ohne weitere Bestätigung. {isPrivate
          ? "Die Termindetails bleiben für Personen mit eingeschränkter Kalenderfreigabe verborgen."
          : "Die Sichtbarkeit folgt den normalen Freigaben des Zielkalenders."}{" "}
        {shareByEmail
          ? "Die eingeladene Person erhält die Termindetails per Google-Kalender-Einladung."
          : "Es wird keine E-Mail versendet."}
      </p>
      {calendarSelectionConnectUrl ? (
        <p className="form-progress">
          Die Kalenderauswahl benötigt einmalig eine ergänzte Google-Freigabe. Bis
          dahin wird sicher der Hauptkalender verwendet.
        </p>
      ) : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="dialog-actions">
        <button className="button button-ghost" onClick={onClose} type="button">
          Abbrechen
        </button>
        {connectUrl ? (
          <a className="button button-soft" href={connectUrl}>
            Google Kalender verbinden
          </a>
        ) : null}
        {!connectUrl && calendarSelectionConnectUrl ? (
          <a className="button button-soft" href={calendarSelectionConnectUrl}>
            Kalenderauswahl freischalten
          </a>
        ) : null}
        <button className="button button-primary" disabled={busy} type="submit">
          {busy ? "Wird in Google gespeichert …" : "Termin speichern"}
        </button>
      </div>
    </form>
  );
}

type EmailDraft = {
  subject: string;
  body: string;
  followUpSuggestion: string;
  assumptions: string[];
};

function localEmailDraft({
  originalEmail,
  guidance,
  recipientName,
  senderName,
  addressStyle,
  goal,
}: {
  originalEmail: string;
  guidance: string;
  recipientName: string;
  senderName: string;
  addressStyle: string;
  goal: string;
}): EmailDraft {
  const subjectLine = originalEmail
    .split("\n")
    .find((line) => /^(betreff|subject)\s*:/i.test(line))
    ?.replace(/^[^:]+:\s*/, "");
  const formal = addressStyle !== "du";
  const greeting = recipientName
    ? `${formal ? "Guten Tag" : "Hallo"} ${recipientName},`
    : formal
      ? "Guten Tag,"
      : "Hallo,";
  const intent =
    goal === "zusagen"
      ? "vielen Dank für Ihre Nachricht. Gerne bestätige ich den vorgeschlagenen nächsten Schritt."
      : goal === "absagen"
        ? "vielen Dank für Ihre Nachricht. Leider kann ich dem Vorschlag diesmal nicht entsprechen."
        : goal === "nachfragen"
          ? "vielen Dank für Ihre Nachricht. Dazu habe ich noch eine kurze Rückfrage."
          : "vielen Dank für Ihre Nachricht. Ich melde mich gerne dazu zurück.";
  return {
    subject: subjectLine ? `AW: ${subjectLine}` : "Rückmeldung zu Ihrer Nachricht",
    body: [
      greeting,
      "",
      intent,
      guidance ? `\n${guidance.trim()}` : "",
      "",
      formal ? "Viele Grüße" : "Beste Grüße",
      senderName.trim() || "[Name]",
    ]
      .filter((line) => line !== undefined)
      .join("\n"),
    followUpSuggestion:
      "Vor dem Senden Namen, Termine und konkrete Zusagen noch einmal mit der Originalnachricht abgleichen.",
    assumptions: [
      "Lokaler Vorlagenentwurf: Fakten und gewünschte Tonalität bitte vor dem Senden prüfen.",
    ],
  };
}

function isEmailDraft(value: unknown): value is EmailDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<EmailDraft>;
  return (
    typeof draft.subject === "string" &&
    typeof draft.body === "string" &&
    typeof draft.followUpSuggestion === "string" &&
    Array.isArray(draft.assumptions)
  );
}

function GmailDraftAction({
  account,
  to,
  subject,
  body,
  toast,
}: {
  account: string;
  to: string;
  subject: string;
  body: string;
  toast: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connectUrl, setConnectUrl] = useState("");

  const createDraft = async () => {
    if (busy || !to.trim() || !subject.trim() || !body.trim()) return;
    setBusy(true);
    setError("");
    setConnectUrl("");
    try {
      const response = await fetch("/api/gmail/drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to, subject, body }),
      });
      const payload = (await response.json()) as {
        draftId?: string;
        draft?: { id?: string };
        webUrl?: string;
        error?: string;
        connectUrl?: string;
      };
      if (!response.ok || !(payload.draftId || payload.draft?.id)) {
        setConnectUrl(payload.connectUrl || "");
        throw new Error(
          payload.error || "Der Gmail-Entwurf konnte nicht gespeichert werden.",
        );
      }
      toast("Entwurf sicher in Gmail gespeichert");
      window.open(
        payload.webUrl ||
          `https://mail.google.com/mail/u/${encodeURIComponent(account)}/#drafts`,
        "_blank",
        "noopener",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Der Gmail-Entwurf konnte nicht gespeichert werden.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        className="button button-primary"
        disabled={busy || !to.trim() || !subject.trim() || !body.trim()}
        onClick={() => void createDraft()}
        title={
          to.trim()
            ? "Bearbeitbaren Gmail-Entwurf speichern"
            : "Zuerst eine Empfängeradresse eintragen"
        }
        type="button"
      >
        {busy ? "Wird in Gmail gespeichert …" : "Als Gmail-Entwurf speichern"}
      </button>
      {connectUrl ? (
        <a className="button button-soft" href={connectUrl}>
          Gmail verbinden
        </a>
      ) : null}
      {error ? (
        <span className="inline-action-error" role="alert">
          {error}
        </span>
      ) : !to.trim() ? (
        <span className="inline-action-hint">
          Für einen gespeicherten Gmail-Entwurf ist die Empfängeradresse nötig.
        </span>
      ) : null}
    </>
  );
}

function EmailComposer({
  account,
  toast,
}: {
  account: string;
  toast: (message: string) => void;
}) {
  const [originalEmail, setOriginalEmail] = useState("");
  const [guidance, setGuidance] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [senderName, setSenderName] = useState("");
  const [tone, setTone] = useState("freundlich-professionell");
  const [length, setLength] = useState("mittel");
  const [addressStyle, setAddressStyle] = useState("aus der E-Mail ableiten");
  const [goal, setGoal] = useState("antworten");
  const [draft, setDraft] = useState<EmailDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);

  const generate = async (event: FormEvent) => {
    event.preventDefault();
    if (!originalEmail.trim() || busy) return;
    setBusy(true);
    setUsedFallback(false);
    const input = {
      kind: "email" as const,
      originalEmail,
      guidance,
      recipientName,
      senderName,
      tone,
      length,
      addressStyle,
      goal,
    };
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const payload = (await response.json()) as {
        result?: unknown;
        error?: string;
      };
      if (!response.ok || !isEmailDraft(payload.result)) {
        throw new Error(payload.error || "Textassistenz nicht erreichbar");
      }
      setDraft(payload.result);
    } catch {
      setDraft(localEmailDraft(input));
      setUsedFallback(true);
      toast("Lokaler Entwurf erstellt · Textassistenz derzeit nicht erreichbar");
    } finally {
      setBusy(false);
    }
  };

  if (draft) {
    return (
      <div className="assistant-result">
        <div className="assistant-result-heading">
          <div>
            <span className={`assistant-mode ${usedFallback ? "local" : ""}`}>
              {usedFallback ? "Lokale Vorlage" : "Individueller Entwurf"}
            </span>
            <h3>Deine Antwort ist bereit zur Feinabstimmung</h3>
          </div>
          <button onClick={() => setDraft(null)} type="button">
            Angaben ändern
          </button>
        </div>
        <label>
          Betreff
          <input
            onChange={(event) =>
              setDraft((current) =>
                current ? { ...current, subject: event.target.value } : current,
              )
            }
            value={draft.subject}
          />
        </label>
        <label>
          Nachricht
          <textarea
            className="result-editor"
            onChange={(event) =>
              setDraft((current) =>
                current ? { ...current, body: event.target.value } : current,
              )
            }
            rows={14}
            value={draft.body}
          />
        </label>
        <div className="draft-note">
          <strong>Empfohlener letzter Check</strong>
          <p>{draft.followUpSuggestion}</p>
          {draft.assumptions.length ? (
            <ul>
              {draft.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="dialog-actions assistant-actions">
          <button
            className="button button-soft"
            onClick={async () => {
              await navigator.clipboard.writeText(
                `Betreff: ${draft.subject}\n\n${draft.body}`,
              );
              toast("E-Mail in die Zwischenablage kopiert");
            }}
            type="button"
          >
            Kopieren
          </button>
          <GmailDraftAction
            account={account}
            body={draft.body}
            subject={draft.subject}
            toast={toast}
            to={recipientEmail}
          />
          <a
            className="button button-ghost"
            href={gmailDraftUrl({
              account,
              to: recipientEmail,
              subject: draft.subject,
              body: draft.body,
            })}
            rel="noreferrer"
            target="_blank"
          >
            Nur im Gmail-Fenster öffnen
          </a>
        </div>
      </div>
    );
  }

  return (
    <form className="capture-form action-form" onSubmit={generate}>
      <label>
        Zu beantwortende E-Mail
        <textarea
          autoFocus
          onChange={(event) => setOriginalEmail(event.target.value)}
          placeholder="E-Mail mit Betreff, Absender und Nachricht hier einfügen …"
          required
          rows={8}
          value={originalEmail}
        />
      </label>
      <label>
        Dein Kommentar
        <textarea
          onChange={(event) => setGuidance(event.target.value)}
          placeholder="Was soll unbedingt hinein? Welche Haltung, Zusage, Grenze oder Rückfrage ist wichtig?"
          rows={4}
          value={guidance}
        />
      </label>
      <div className="form-grid">
        <label>
          Ansprechperson
          <input
            onChange={(event) => setRecipientName(event.target.value)}
            placeholder="Optional"
            value={recipientName}
          />
        </label>
        <label>
          Empfängeradresse
          <input
            onChange={(event) => setRecipientEmail(event.target.value)}
            placeholder="Optional für Gmail"
            type="email"
            value={recipientEmail}
          />
        </label>
      </div>
      <details className="customizing-panel" open>
        <summary>Stil und Ziel anpassen</summary>
        <div className="form-grid">
          <label>
            Ziel der Antwort
            <select onChange={(event) => setGoal(event.target.value)} value={goal}>
              <option value="antworten">Sachlich antworten</option>
              <option value="zusagen">Zusagen / bestätigen</option>
              <option value="absagen">Wertschätzend absagen</option>
              <option value="nachfragen">Präzise nachfragen</option>
            </select>
          </label>
          <label>
            Ton
            <select onChange={(event) => setTone(event.target.value)} value={tone}>
              <option>freundlich-professionell</option>
              <option>warm und persönlich</option>
              <option>klar und verbindlich</option>
              <option>selbstbewusst und direkt</option>
              <option>sehr formell</option>
            </select>
          </label>
          <label>
            Länge
            <select
              onChange={(event) => setLength(event.target.value)}
              value={length}
            >
              <option value="kurz">Kurz</option>
              <option value="mittel">Mittel</option>
              <option value="ausführlich">Ausführlich</option>
            </select>
          </label>
          <label>
            Anrede
            <select
              onChange={(event) => setAddressStyle(event.target.value)}
              value={addressStyle}
            >
              <option>aus der E-Mail ableiten</option>
              <option value="sie">Sie-Form</option>
              <option value="du">Du-Form</option>
            </select>
          </label>
        </div>
        <label>
          Dein Name für die Grußformel
          <input
            onChange={(event) => setSenderName(event.target.value)}
            placeholder="Optional"
            value={senderName}
          />
        </label>
      </details>
      <p className="form-trust">
        Die eingefügte E-Mail wird nur zur Erstellung dieses Entwurfs
        verarbeitet und nicht im Kompass gespeichert. Vor dem Senden behältst du
        die volle Kontrolle.
      </p>
      <div className="dialog-actions">
        <button className="button button-primary" disabled={busy} type="submit">
          {busy ? "Antwort wird formuliert …" : "Antwort generieren"}
        </button>
      </div>
    </form>
  );
}

type ApplicationPackage = {
  roleTitle: string;
  companyName: string;
  coverLetter: string;
  tailoredCv: string;
  companyBrief: string;
  applicationEmailSubject: string;
  applicationEmailBody: string;
  fitHighlights: string[];
  openQuestions: string[];
  sources: string[];
};

function isApplicationPackage(value: unknown): value is ApplicationPackage {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<ApplicationPackage>;
  return (
    typeof result.coverLetter === "string" &&
    typeof result.tailoredCv === "string" &&
    typeof result.companyBrief === "string" &&
    typeof result.applicationEmailSubject === "string" &&
    typeof result.applicationEmailBody === "string" &&
    Array.isArray(result.fitHighlights) &&
    Array.isArray(result.openQuestions) &&
    Array.isArray(result.sources)
  );
}

function localApplicationPackage(input: {
  companyName: string;
  roleTitle: string;
  contactPerson: string;
  motivation: string;
  achievements: string;
  strengths: string;
  availability: string;
  jobUrl: string;
}): ApplicationPackage {
  const greeting = input.contactPerson
    ? `Sehr geehrte${input.contactPerson.match(/frau/i) ? "" : "r"} ${input.contactPerson},`
    : "Guten Tag,";
  return {
    roleTitle: input.roleTitle,
    companyName: input.companyName,
    coverLetter: [
      `Bewerbung als ${input.roleTitle}`,
      "",
      greeting,
      "",
      input.motivation ||
        `die Position als ${input.roleTitle} bei ${input.companyName} spricht mich an, weil sie zu meinem nächsten beruflichen Schritt passt.`,
      "",
      input.achievements ||
        "[Hier einen konkreten, belegbaren Erfolg aus dem Lebenslauf ergänzen.]",
      "",
      input.strengths ||
        "[Hier zwei für die Rolle relevante Stärken mit kurzem Beleg ergänzen.]",
      "",
      input.availability ? `${input.availability}` : "",
      "",
      "Gerne erläutere ich Ihnen meine Motivation und Passung in einem persönlichen Gespräch.",
      "",
      "Mit freundlichen Grüßen",
      "[Name]",
    ]
      .filter(Boolean)
      .join("\n"),
    tailoredCv: [
      `# Lebenslauf – Zielrolle ${input.roleTitle}`,
      "",
      "## Kurzprofil",
      input.strengths ||
        "[3–4 Zeilen Profil mit den für die Zielrolle wichtigsten Kompetenzen]",
      "",
      "## Ausgewählte Erfolge",
      input.achievements || "[Belegbare Erfolge aus dem hochgeladenen CV priorisieren]",
      "",
      "## Berufserfahrung",
      "[Stationen aus dem Original-CV in unveränderter Chronologie übernehmen und relevante Punkte zuerst nennen]",
      "",
      "## Ausbildung und Qualifikationen",
      "[Unverändert aus dem Original-CV übernehmen]",
    ].join("\n"),
    companyBrief: [
      `# ${input.companyName} · ${input.roleTitle}`,
      "",
      `Stellenquelle: ${input.jobUrl}`,
      "",
      "Die Live-Recherche war nicht verfügbar. Vor dem Versand bitte Geschäftsmodell, Werte, aktuelle Schwerpunkte, Rollenanforderungen und Ansprechperson anhand der offiziellen Seite ergänzen.",
    ].join("\n"),
    applicationEmailSubject: `Bewerbung als ${input.roleTitle}`,
    applicationEmailBody: [
      greeting,
      "",
      `anbei übersende ich Ihnen meine Bewerbung als ${input.roleTitle}.`,
      "Die Position und die beschriebenen Aufgaben passen sehr gut zu meinem Profil und meinem gewünschten nächsten Schritt.",
      "",
      "Über die Gelegenheit zu einem persönlichen Gespräch freue ich mich.",
      "",
      "Mit freundlichen Grüßen",
      "[Name]",
    ].join("\n"),
    fitHighlights: [
      input.strengths || "Relevante Stärken aus dem CV auswählen",
      input.achievements || "Konkreten, messbaren Erfolg ergänzen",
    ],
    openQuestions: [
      "Kontaktdaten, Name und Anschrift prüfen",
      "Konkrete CV-Inhalte in den lokalen Entwurf übernehmen",
      "Unternehmensfakten anhand offizieller Quellen verifizieren",
    ],
    sources: [input.jobUrl],
  };
}

type ApplicationTab =
  | "coverLetter"
  | "tailoredCv"
  | "companyBrief"
  | "applicationEmailBody";

const APPLICATION_TABS: Array<{ key: ApplicationTab; label: string }> = [
  { key: "coverLetter", label: "Anschreiben" },
  { key: "tailoredCv", label: "CV" },
  { key: "companyBrief", label: "Firma & Rolle" },
  { key: "applicationEmailBody", label: "Bewerbungs-Mail" },
];

function downloadText(name: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function ApplicationStudio({
  account,
  documents,
  initialApplication,
  masterCvDocumentId,
  toast,
}: {
  account: string;
  documents: DocumentRef[];
  initialApplication: ApplicationProcess | null;
  masterCvDocumentId: string | null;
  toast: (message: string) => void;
}) {
  const cvRef = useRef<HTMLInputElement>(null);
  const masterCv = documents.find(
    (document) =>
      document.id === masterCvDocumentId && document.storage === "upload",
  );
  const [jobUrl, setJobUrl] = useState(initialApplication?.sourceUrl ?? "");
  const [companyName, setCompanyName] = useState(
    initialApplication?.company ?? "",
  );
  const [roleTitle, setRoleTitle] = useState(
    initialApplication?.jobTitle ?? "",
  );
  const [contactPerson, setContactPerson] = useState(
    initialApplication?.contactPerson ?? "",
  );
  const [recipientEmail, setRecipientEmail] = useState(
    initialApplication?.contactEmail ?? "",
  );
  const [cv, setCv] = useState<File | null>(null);
  const [useMasterCv, setUseMasterCv] = useState(Boolean(masterCv));
  const [motivation, setMotivation] = useState(
    initialApplication?.researchSummary ?? "",
  );
  const [achievements, setAchievements] = useState("");
  const [strengths, setStrengths] = useState("");
  const [constraints, setConstraints] = useState(
    initialApplication?.notes ?? "",
  );
  const [availability, setAvailability] = useState(
    initialApplication
      ? [initialApplication.publishedTerms, initialApplication.appliedTerms]
          .filter(Boolean)
          .join(" · ")
      : "",
  );
  const [style, setStyle] = useState("modern, präzise und professionell");
  const [language, setLanguage] = useState("Deutsch");
  const [result, setResult] = useState<ApplicationPackage | null>(null);
  const [activeTab, setActiveTab] = useState<ApplicationTab>("coverLetter");
  const [busy, setBusy] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);

  const generate = async (event: FormEvent) => {
    event.preventDefault();
    if (
      (!cv && !(useMasterCv && masterCv)) ||
      !jobUrl.trim() ||
      !companyName.trim() ||
      !roleTitle.trim() ||
      busy
    ) {
      return;
    }
    setBusy(true);
    setUsedFallback(false);
    const values = {
      jobUrl,
      companyName,
      roleTitle,
      contactPerson,
      motivation,
      achievements,
      strengths,
      constraints,
      availability,
      style,
      language,
    };
    try {
      let sourceCv = cv;
      if (!sourceCv && useMasterCv && masterCv?.downloadUrl) {
        const response = await fetch(masterCv.downloadUrl, {
          headers: { accept: masterCv.contentType || "application/octet-stream" },
        });
        if (!response.ok) {
          throw new Error("Der Master-CV konnte nicht geladen werden.");
        }
        const blob = await response.blob();
        sourceCv = new File([blob], masterCv.name, {
          type: masterCv.contentType || blob.type || "application/octet-stream",
        });
      }
      if (!sourceCv) throw new Error("Bitte einen Lebenslauf auswählen.");
      const form = new FormData();
      Object.entries(values).forEach(([key, value]) => form.append(key, value));
      form.append("kind", "application");
      form.append("cv", sourceCv);
      const response = await fetch("/api/assistant", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as {
        result?: unknown;
        error?: string;
      };
      if (!response.ok || !isApplicationPackage(payload.result)) {
        throw new Error(payload.error || "Bewerbungsstudio nicht erreichbar");
      }
      setResult(payload.result);
    } catch {
      setResult(localApplicationPackage(values));
      setUsedFallback(true);
      toast("Lokales Bewerbungspaket erstellt · Live-Recherche derzeit nicht erreichbar");
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const activeContent = result[activeTab];
    const fileNames: Record<ApplicationTab, string> = {
      coverLetter: `Anschreiben-${result.companyName}.txt`,
      tailoredCv: `CV-${result.roleTitle}.md`,
      companyBrief: `Briefing-${result.companyName}.md`,
      applicationEmailBody: `Bewerbungs-Mail-${result.companyName}.txt`,
    };
    return (
      <div className="application-result">
        <div className="assistant-result-heading">
          <div>
            <span className={`assistant-mode ${usedFallback ? "local" : ""}`}>
              {usedFallback ? "Lokales Paket" : "Recherchegestütztes Paket"}
            </span>
            <h3>
              {result.companyName} · {result.roleTitle}
            </h3>
          </div>
          <button onClick={() => setResult(null)} type="button">
            Angaben ändern
          </button>
        </div>
        <div className="fit-highlight-row">
          {result.fitHighlights.slice(0, 4).map((highlight) => (
            <span key={highlight}>{highlight}</span>
          ))}
        </div>
        <div className="result-tabs" role="tablist">
          {APPLICATION_TABS.map((tab) => (
            <button
              aria-selected={activeTab === tab.key}
              className={activeTab === tab.key ? "active" : ""}
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
        {activeTab === "applicationEmailBody" ? (
          <label>
            Betreff
            <input
              onChange={(event) =>
                setResult((current) =>
                  current
                    ? { ...current, applicationEmailSubject: event.target.value }
                    : current,
                )
              }
              value={result.applicationEmailSubject}
            />
          </label>
        ) : null}
        <textarea
          aria-label={`${APPLICATION_TABS.find((tab) => tab.key === activeTab)?.label} bearbeiten`}
          className="result-editor application-editor"
          onChange={(event) =>
            setResult((current) =>
              current
                ? { ...current, [activeTab]: event.target.value }
                : current,
            )
          }
          rows={19}
          value={activeContent}
        />
        <div className="artifact-actions">
          <button
            className="button button-soft"
            onClick={async () => {
              await navigator.clipboard.writeText(activeContent);
              toast("Text kopiert");
            }}
            type="button"
          >
            Kopieren
          </button>
          <button
            className="button button-ghost"
            onClick={() => downloadText(fileNames[activeTab], activeContent)}
            type="button"
          >
            Herunterladen
          </button>
          {activeTab === "applicationEmailBody" ? (
            <>
              <GmailDraftAction
                account={account}
                body={result.applicationEmailBody}
                subject={result.applicationEmailSubject}
                toast={toast}
                to={recipientEmail}
              />
              <a
                className="button button-ghost"
                href={gmailDraftUrl({
                  account,
                  to: recipientEmail,
                  subject: result.applicationEmailSubject,
                  body: result.applicationEmailBody,
                })}
                rel="noreferrer"
                target="_blank"
              >
                Nur im Gmail-Fenster öffnen
              </a>
            </>
          ) : null}
        </div>
        <details className="quality-check-panel" open={result.openQuestions.length > 0}>
          <summary>Qualitätscheck vor dem Versand</summary>
          {result.openQuestions.length ? (
            <ul>
              {result.openQuestions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          ) : (
            <p>Alle wesentlichen Angaben sind abgedeckt.</p>
          )}
          {result.sources.length ? (
            <div>
              <strong>Verwendete Quellen</strong>
              {result.sources.map((source) => {
                const href = safeHttpUrl(source);
                return href ? (
                  <a href={href} key={source} rel="noreferrer" target="_blank">
                    {source}
                  </a>
                ) : null;
              })}
            </div>
          ) : null}
        </details>
      </div>
    );
  }

  return (
    <form className="capture-form action-form application-form" onSubmit={generate}>
      <div className="studio-step">
        <span>1</span>
        <div>
          <strong>Stelle und Lebenslauf</strong>
          <small>Die Grundlage für Recherche und Abgleich</small>
        </div>
      </div>
      <label>
        URL der Stellenanzeige
        <input
          autoFocus
          onChange={(event) => setJobUrl(event.target.value)}
          placeholder="https://…"
          required
          type="url"
          value={jobUrl}
        />
      </label>
      <div className="form-grid">
        <label>
          Unternehmen
          <input
            onChange={(event) => setCompanyName(event.target.value)}
            placeholder="Name des Unternehmens"
            required
            value={companyName}
          />
        </label>
        <label>
          Zielrolle
          <input
            onChange={(event) => setRoleTitle(event.target.value)}
            placeholder="Exakte Stellenbezeichnung"
            required
            value={roleTitle}
          />
        </label>
      </div>
      <div className="form-grid">
        <label>
          Ansprechperson
          <input
            onChange={(event) => setContactPerson(event.target.value)}
            placeholder="Optional"
            value={contactPerson}
          />
        </label>
        <label>
          Bewerbungsadresse
          <input
            onChange={(event) => setRecipientEmail(event.target.value)}
            placeholder="Optional für Gmail"
            type="email"
            value={recipientEmail}
          />
        </label>
      </div>
      <label
        className={`cv-upload-field ${cv ? "has-file" : ""}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          setCv(event.dataTransfer.files[0] ?? null);
          setUseMasterCv(false);
        }}
      >
        <input
          accept=".pdf,.doc,.docx,.odt,.rtf,.txt,.md"
          className="visually-hidden"
          onChange={(event) => {
            setCv(event.target.files?.[0] ?? null);
            setUseMasterCv(false);
          }}
          ref={cvRef}
          required={!masterCv || !useMasterCv}
          type="file"
        />
        <span aria-hidden="true">CV</span>
        <div>
          <strong>{cv ? cv.name : "Lebenslauf hochladen"}</strong>
          <small>
            {cv ? formatBytes(cv.size) : "PDF, Word, ODT, RTF oder Text · max. 8 MB"}
          </small>
        </div>
        <button
          onClick={(event) => {
            event.preventDefault();
            cvRef.current?.click();
          }}
          type="button"
        >
          {cv ? "Ändern" : "Auswählen"}
        </button>
      </label>
      {masterCv ? (
        <button
          aria-pressed={useMasterCv && !cv}
          className={`master-cv-choice ${useMasterCv && !cv ? "active" : ""}`}
          onClick={() => {
            setCv(null);
            setUseMasterCv(true);
            if (cvRef.current) cvRef.current.value = "";
          }}
          type="button"
        >
          <span aria-hidden="true">M</span>
          <div>
            <strong>Master-CV verwenden</strong>
            <small>
              {masterCv.name} · privat hinterlegt und nur für dieses Paket geladen
            </small>
          </div>
          <b>{useMasterCv && !cv ? "Ausgewählt" : "Auswählen"}</b>
        </button>
      ) : null}

      <div className="studio-step">
        <span>2</span>
        <div>
          <strong>Deine Passung</strong>
          <small>Kurze Antworten machen das Ergebnis unverwechselbar</small>
        </div>
      </div>
      <label>
        Warum genau diese Rolle und dieses Unternehmen?
        <textarea
          onChange={(event) => setMotivation(event.target.value)}
          placeholder="Was reizt dich fachlich, persönlich und am Unternehmen?"
          rows={3}
          value={motivation}
        />
      </label>
      <label>
        Welche 2–3 Erfahrungen oder Erfolge beweisen deine Eignung?
        <textarea
          onChange={(event) => setAchievements(event.target.value)}
          placeholder="Kontext, dein Beitrag, möglichst konkretes Ergebnis"
          rows={3}
          value={achievements}
        />
      </label>
      <label>
        Welche Stärken sollen im Vordergrund stehen?
        <textarea
          onChange={(event) => setStrengths(event.target.value)}
          placeholder="Fachkompetenz, Arbeitsweise, Branchenwissen, Persönlichkeit"
          rows={3}
          value={strengths}
        />
      </label>
      <div className="form-grid">
        <label>
          Was soll betont, vermieden oder erklärt werden?
          <textarea
            onChange={(event) => setConstraints(event.target.value)}
            placeholder="z. B. Quereinstieg, Lücke, keine Gehaltsangabe"
            rows={3}
            value={constraints}
          />
        </label>
        <label>
          Verfügbarkeit und Rahmenbedingungen
          <textarea
            onChange={(event) => setAvailability(event.target.value)}
            placeholder="Startdatum, Standort, Remote, optional Gehalt"
            rows={3}
            value={availability}
          />
        </label>
      </div>

      <div className="studio-step">
        <span>3</span>
        <div>
          <strong>Stil des Pakets</strong>
          <small>Anschreiben, CV, Briefing und Mail aus einem Guss</small>
        </div>
      </div>
      <div className="form-grid">
        <label>
          Stil
          <select onChange={(event) => setStyle(event.target.value)} value={style}>
            <option>modern, präzise und professionell</option>
            <option>selbstbewusst und direkt</option>
            <option>warm, persönlich und glaubwürdig</option>
            <option>klassisch und formell</option>
          </select>
        </label>
        <label>
          Sprache
          <select
            onChange={(event) => setLanguage(event.target.value)}
            value={language}
          >
            <option>Deutsch</option>
            <option>Englisch</option>
          </select>
        </label>
      </div>
      <p className="form-trust">
        Der ausgewählte Lebenslauf und deine Antworten werden nur für dieses
        Paket verarbeitet. Der Master-CV bleibt unverändert in deiner privaten
        Ablage; generierte Texte werden nicht automatisch gespeichert. Das
        System erfindet keine Stationen oder Erfolge.
      </p>
      <div className="dialog-actions">
        <button
          className="button button-primary"
          disabled={busy || (!cv && !(useMasterCv && masterCv))}
          type="submit"
        >
          {busy ? "Bewerbungspaket wird erstellt …" : "Bewerbungspaket erstellen"}
        </button>
      </div>
    </form>
  );
}
