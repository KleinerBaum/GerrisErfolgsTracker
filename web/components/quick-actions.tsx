"use client";

import {
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { JobResearchPanel } from "./job-research-panel";
import { gmailDraftUrl } from "../lib/google-links";
import {
  downloadEditableDocx,
  downloadTemplateBackedDocx,
} from "../lib/docx-export";
import {
  applicationPackageQualityIssues,
  buildLocalApplicationPackage,
  type ApplicationPackage,
  type CvContentSource,
} from "../lib/application-package";
import { applyConfirmedResearchClaim } from "../lib/job-research";
import { masterCvToPlainText } from "../lib/master-cv";
import { parseMasterCvDocument } from "../lib/server/master-cv-import";
import {
  addApplicationActivity,
  assessSalaryPreference,
  APPLICATION_FOCUS_THEMES,
  APPLICATION_OUTPUT_DEFINITIONS,
  APPLICATION_RESEARCH_SCOPE_DEFINITIONS,
  normalizeApplicationGenerationPreferences,
} from "../lib/application-workflow";
import {
  SALARY_OUTLOOK_LABELS,
  type ApplicationGenerationPreferences,
  type ApplicationOutputKind,
  type ApplicationProcess,
  type DocumentKind,
  type DocumentRef,
  type IntegrationConfig,
  type MasterCvContent,
  type VacancyResearch,
} from "../lib/types";

export type QuickActionKind = "upload" | "email" | "application";

const QUICK_ACTIONS: Array<{
  key: QuickActionKind;
  label: string;
  mark: string;
  tone: string;
}> = [
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
        Schnellzugriff
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
  kind: QuickActionKind;
  documents: DocumentRef[];
  applicationDraft: ApplicationProcess | null;
  masterCvDocumentId: string | null;
  masterCvContent: MasterCvContent | null;
  integrations: IntegrationConfig;
  onClose: () => void;
  onSaveDocument: (document: DocumentRef) => void;
  onUpdateApplication: (application: ApplicationProcess) => void;
  toast: (message: string) => void;
};

const ACTION_COPY: Record<
  QuickActionKind,
  { eyebrow: string; title: string }
> = {
  upload: {
    eyebrow: "Unterlagen",
    title: "Dateien ablegen",
  },
  email: {
    eyebrow: "E-Mail",
    title: "Antwort entwerfen",
  },
  application: {
    eyebrow: "Bewerbung",
    title: "Bewerbungspaket erstellen",
  },
};

export function QuickActionDialog({
  kind,
  documents,
  applicationDraft,
  integrations,
  masterCvDocumentId,
  masterCvContent,
  onClose,
  onSaveDocument,
  onUpdateApplication,
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
            masterCvContent={masterCvContent}
            onUpdateApplication={onUpdateApplication}
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
        <p>Ordner, Schlagworte und Prüftermin sind gespeichert.</p>
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
        <small>Wähle diesen Ordner bei Bedarf im Dateidialog.</small>
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
      <p className="form-trust">Privat gespeichert; ausführbare Dateien sind ausgeschlossen.</p>
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
            <h3>Entwurf bereit</h3>
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
      <p className="form-trust">Die E-Mail wird nicht gespeichert. Du prüfst vor dem Versand.</p>
      <div className="dialog-actions">
        <button className="button button-primary" disabled={busy} type="submit">
          {busy ? "Antwort wird formuliert …" : "Antwort entwerfen"}
        </button>
      </div>
    </form>
  );
}

function isApplicationPackage(value: unknown): value is ApplicationPackage {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<ApplicationPackage>;
  return (
    typeof result.coverLetter === "string" &&
    typeof result.tailoredCv === "string" &&
    typeof result.companyBrief === "string" &&
    typeof result.interviewPrep === "string" &&
    typeof result.applicationEmailSubject === "string" &&
    typeof result.applicationEmailBody === "string" &&
    Array.isArray(result.fitHighlights) &&
    Array.isArray(result.openQuestions) &&
    Array.isArray(result.sources)
  );
}

type ApplicationTab =
  | "coverLetter"
  | "tailoredCv"
  | "companyBrief"
  | "interviewPrep"
  | "applicationEmailBody";

const APPLICATION_TABS: Array<{ key: ApplicationTab; label: string }> = [
  { key: "coverLetter", label: "Anschreiben" },
  { key: "tailoredCv", label: "CV" },
  { key: "companyBrief", label: "Firma & Rolle" },
  { key: "interviewPrep", label: "Interview" },
  { key: "applicationEmailBody", label: "Bewerbungs-Mail" },
];

const OUTPUT_TAB_MAP: Record<ApplicationOutputKind, ApplicationTab> = {
  "cover-letter": "coverLetter",
  "tailored-cv": "tailoredCv",
  "company-brief": "companyBrief",
  "interview-prep": "interviewPrep",
  "application-email": "applicationEmailBody",
};

function previewInline(value: string) {
  return value
    .split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("*") && part.endsWith("*")) {
        return <em key={`${part}-${index}`}>{part.slice(1, -1)}</em>;
      }
      const label = /^([A-ZÄÖÜ0-9][A-ZÄÖÜ0-9 &/+.-]{2,42}:)\s*(.*)$/u.exec(part);
      return label ? (
        <span key={`${part}-${index}`}>
          <strong>{label[1]}</strong>
          {label[2] ? ` ${label[2]}` : ""}
        </span>
      ) : (
        part
      );
    });
}

function ApplicationDocumentPreview({
  content,
  kind,
}: {
  content: string;
  kind: ApplicationTab;
}) {
  return (
    <article
      aria-label="Formatierte Dokumentvorschau"
      className={`application-document-preview preview-${kind}`}
    >
      {content.replace(/\r\n?/g, "\n").split("\n").map((rawLine, index) => {
        const line = rawLine.trim();
        if (!line) return <div className="document-spacer" key={`space-${index}`} />;
        const heading = /^(#{1,3})\s+(.+)$/.exec(line);
        if (heading?.[1].length === 1) {
          return <h1 key={`line-${index}`}>{previewInline(heading[2])}</h1>;
        }
        if (heading?.[1].length === 2) {
          return <h2 key={`line-${index}`}>{previewInline(heading[2])}</h2>;
        }
        if (heading?.[1].length === 3) {
          return <h3 key={`line-${index}`}>{previewInline(heading[2])}</h3>;
        }
        if (/^BEWERBUNGSFASSUNG\s*\|/i.test(line)) {
          return <span className="document-kicker" key={`line-${index}`}>{line}</span>;
        }
        const bullet = /^\s*(?:[-•])\s+(.+)$/.exec(line);
        if (bullet) {
          return (
            <div className="document-bullet" key={`line-${index}`}>
              <span aria-hidden="true">•</span>
              <p>{previewInline(bullet[1])}</p>
            </div>
          );
        }
        if (/^\*\*.*\*\*$/.test(line) && /\d/.test(line)) {
          return <p className="document-date" key={`line-${index}`}>{previewInline(line)}</p>;
        }
        if (/^\*(?!\*)(.+)\*$/.test(line)) {
          return <p className="document-company" key={`line-${index}`}>{previewInline(line)}</p>;
        }
        if (/^[A-ZÄÖÜ0-9][A-ZÄÖÜ0-9 &/+.-]{2,42}:\s+/u.test(line)) {
          return <p className="document-proof" key={`line-${index}`}>{previewInline(line)}</p>;
        }
        return <p key={`line-${index}`}>{previewInline(line)}</p>;
      })}
    </article>
  );
}

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
  masterCvContent,
  onUpdateApplication,
  toast,
}: {
  account: string;
  documents: DocumentRef[];
  initialApplication: ApplicationProcess | null;
  masterCvDocumentId: string | null;
  masterCvContent: MasterCvContent | null;
  onUpdateApplication: (application: ApplicationProcess) => void;
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
  const [research, setResearch] = useState<VacancyResearch | null>(
    initialApplication?.vacancyResearch ?? null,
  );
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
  const [preferences, setPreferences] =
    useState<ApplicationGenerationPreferences>(() =>
      normalizeApplicationGenerationPreferences(
        initialApplication?.generationPreferences,
      ),
    );
  const [result, setResult] = useState<ApplicationPackage | null>(null);
  const [activeTab, setActiveTab] = useState<ApplicationTab>("coverLetter");
  const [editingResult, setEditingResult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);
  const confirmedClaims = useMemo(
    () =>
      research
        ? [...research.adFacts, ...research.enrichment].filter((claim) =>
            ["confirmed", "edited"].includes(claim.decision.status),
          )
        : [],
    [research],
  );
  const visibleTabs = APPLICATION_TABS.filter((tab) =>
    preferences.outputKinds.some((kind) => OUTPUT_TAB_MAP[kind] === tab.key),
  );
  const salaryAssessment = assessSalaryPreference({
    publishedCompensation: initialApplication?.compensation ?? "",
    salaryOutlook: initialApplication?.salaryOutlook ?? "open",
    desiredSalaryAnnual: preferences.desiredSalaryAnnual,
    minimumSalaryAnnual: preferences.minimumSalaryAnnual,
  });

  const toggleFocusTheme = (theme: string, enabled: boolean) => {
    setPreferences((current) => ({
      ...current,
      focusThemes: enabled
        ? [...new Set([...current.focusThemes, theme])]
        : current.focusThemes.filter((candidate) => candidate !== theme),
    }));
  };

  const toggleOutput = (kind: ApplicationOutputKind, enabled: boolean) => {
    setPreferences((current) => {
      const outputKinds = enabled
        ? [...new Set([...current.outputKinds, kind])]
        : current.outputKinds.filter((candidate) => candidate !== kind);
      return { ...current, outputKinds };
    });
  };

  const updateResearch = (nextResearch: VacancyResearch) => {
    setResearch(nextResearch);
    if (!initialApplication) return;
    let nextApplication: ApplicationProcess = {
      ...initialApplication,
      vacancyResearch: nextResearch,
      sourceVerifiedAt: nextResearch.researchedAt.slice(0, 10),
      sourceUrl:
        nextResearch.retrievalStatus === "exact_page_accessed" &&
        nextResearch.canonicalUrl
          ? nextResearch.canonicalUrl
          : initialApplication.sourceUrl,
    };
    for (const claim of [
      ...nextResearch.adFacts,
      ...nextResearch.enrichment,
    ]) {
      nextApplication = applyConfirmedResearchClaim(nextApplication, claim);
    }
    onUpdateApplication(nextApplication);
  };

  const generate = async (event: FormEvent) => {
    event.preventDefault();
    if (!preferences.outputKinds.length) {
      toast("Bitte mindestens ein gewünschtes Ergebnis auswählen");
      return;
    }
    if (
      (!cv && !(useMasterCv && masterCv)) ||
      !jobUrl.trim() ||
      !companyName.trim() ||
      !roleTitle.trim() ||
      busy
    ) {
      return;
    }
    const normalizedPreferences = normalizeApplicationGenerationPreferences(
      preferences,
    );
    setPreferences(normalizedPreferences);
    const firstTab = APPLICATION_TABS.find((tab) =>
      normalizedPreferences.outputKinds.some(
        (kind) => OUTPUT_TAB_MAP[kind] === tab.key,
      ),
    );
    if (firstTab) setActiveTab(firstTab.key);
    if (initialApplication) {
      onUpdateApplication({
        ...initialApplication,
        sourceUrl: jobUrl.trim(),
        company: companyName.trim(),
        jobTitle: roleTitle.trim(),
        contactPerson: contactPerson.trim(),
        contactEmail: recipientEmail.trim(),
        generationPreferences: normalizedPreferences,
        vacancyResearch: research,
      });
    }
    setBusy(true);
    setUsedFallback(false);
    setEditingResult(false);
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
      style:
        normalizedPreferences.formality === "formal"
          ? "klassisch und formell"
          : normalizedPreferences.formality === "modern"
            ? "modern, direkt und präzise"
            : "professionell, ausgewogen und glaubwürdig",
      formality: normalizedPreferences.formality,
      addressStyle: normalizedPreferences.addressStyle,
      language: normalizedPreferences.language,
      cvLength: normalizedPreferences.cvLength,
      focusThemes: JSON.stringify(normalizedPreferences.focusThemes),
      customFocus: normalizedPreferences.customFocus,
      outputKinds: JSON.stringify(normalizedPreferences.outputKinds),
      researchScopes: JSON.stringify(normalizedPreferences.researchScopes),
      researchSelectionMode: normalizedPreferences.researchSelectionMode,
      selectedResearchClaimIds: JSON.stringify(
        normalizedPreferences.selectedResearchClaimIds,
      ),
      desiredSalaryAnnual:
        normalizedPreferences.desiredSalaryAnnual?.toString() ?? "",
      minimumSalaryAnnual:
        normalizedPreferences.minimumSalaryAnnual?.toString() ?? "",
      publishedCompensation: initialApplication?.compensation ?? "",
      salaryOutlook: initialApplication?.salaryOutlook ?? "open",
      salaryFlexibility: normalizedPreferences.salaryFlexibility,
      mentionSalary: normalizedPreferences.mentionSalary,
      researchContext: JSON.stringify(research),
    };
    let sourceCv = cv;
    try {
      if (!sourceCv && useMasterCv && masterCvContent) {
        sourceCv = new File(
          [masterCvToPlainText(masterCvContent)],
          "Master-CV-bearbeitet.txt",
          { type: "text/plain;charset=utf-8" },
        );
      } else if (!sourceCv && useMasterCv && masterCv?.downloadUrl) {
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
        throw new Error(payload.error || "Bewerbungserstellung nicht erreichbar");
      }
      const qualityIssues = applicationPackageQualityIssues(
        payload.result,
        normalizedPreferences.outputKinds,
        normalizedPreferences.cvLength,
      );
      if (qualityIssues.length) {
        throw new Error(`Qualitätsprüfung fehlgeschlagen: ${qualityIssues.join("; ")}`);
      }
      setResult(payload.result);
    } catch {
      let fallbackSource: CvContentSource | null = masterCvContent;
      if (!fallbackSource && sourceCv) {
        const extension = sourceCv.name
          .split(".")
          .pop()
          ?.toLocaleLowerCase("de-DE");
        try {
          if (extension === "docx") {
            fallbackSource = parseMasterCvDocument(
              new Uint8Array(await sourceCv.arrayBuffer()),
            );
          } else if (extension === "txt" || extension === "md") {
            fallbackSource = {
              name: sourceCv.name.replace(/\.(?:txt|md)$/i, ""),
              headline: roleTitle,
              subheadline: "",
              contactLine: "",
              sections: [
                {
                  id: "hochgeladener-lebenslauf",
                  heading: "BERUFSPROFIL",
                  content: await sourceCv.text(),
                },
              ],
            };
          }
        } catch {
          fallbackSource = null;
        }
      }
      const confirmedFacts = confirmedClaims
        .map((claim) => claim.decision.value || claim.value)
        .filter((value): value is string => Boolean(value));
      const sources = [
        ...new Set(confirmedClaims.flatMap((claim) => claim.sourceUrls)),
      ];
      const fallback = buildLocalApplicationPackage({
        companyName: companyName.trim(),
        roleTitle: roleTitle.trim(),
        contactPerson: contactPerson.trim(),
        motivation: motivation.trim(),
        achievements: achievements.trim(),
        strengths: strengths.trim(),
        constraints: constraints.trim(),
        availability: availability.trim(),
        jobUrl: jobUrl.trim(),
        cvLength: normalizedPreferences.cvLength,
        focusThemes: normalizedPreferences.focusThemes,
        outputKinds: normalizedPreferences.outputKinds,
        confirmedFacts,
        sources,
        cvSource: fallbackSource,
      });
      setResult(fallback);
      setUsedFallback(true);
      toast(
        fallbackSource
          ? "Vollständiges Bewerbungspaket aus dem Master-CV erstellt"
          : "Teilpaket erstellt · CV-Inhalt lokal nicht lesbar",
      );
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const activeContent = result[activeTab];
    const activeWordCount = activeContent.trim()
      ? activeContent.trim().split(/\s+/).length
      : 0;
    const fileNames: Record<ApplicationTab, string> = {
      coverLetter: `Anschreiben-${result.companyName}.docx`,
      tailoredCv: `CV-${result.roleTitle}.docx`,
      companyBrief: `Briefing-${result.companyName}.docx`,
      interviewPrep: `Interview-${result.companyName}.docx`,
      applicationEmailBody: `Bewerbungs-Mail-${result.companyName}.txt`,
    };
    const downloadActiveDocument = async () => {
      if (activeTab === "applicationEmailBody") {
        downloadText(fileNames[activeTab], activeContent);
        return;
      }
      if (activeTab === "tailoredCv") {
        try {
          let templateBytes: Uint8Array | null = null;
          if (cv?.name.toLocaleLowerCase("de-DE").endsWith(".docx")) {
            templateBytes = new Uint8Array(await cv.arrayBuffer());
          } else if (useMasterCv && masterCv?.downloadUrl) {
            const response = await fetch(masterCv.downloadUrl, {
              headers: {
                accept:
                  masterCv.contentType ||
                  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              },
            });
            if (response.ok) {
              templateBytes = new Uint8Array(await response.arrayBuffer());
            }
          }
          if (templateBytes) {
            downloadTemplateBackedDocx(
              fileNames[activeTab],
              activeContent,
              templateBytes,
            );
            toast("Word-CV im Design des Master-CV erstellt");
            return;
          }
        } catch {
          toast("Master-Design nicht vollständig nutzbar · sicheres Word-Layout verwendet");
        }
      }
      downloadEditableDocx(fileNames[activeTab], activeContent);
    };
    return (
      <div className="application-result">
        <div className="assistant-result-heading">
          <div>
            <span className={`assistant-mode ${usedFallback ? "local" : ""}`}>
              {usedFallback
                ? "Aus Master-CV erstellt"
                : "Paket mit Recherche"}
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
          {visibleTabs.map((tab) => (
            <button
              aria-selected={activeTab === tab.key}
              className={activeTab === tab.key ? "active" : ""}
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setEditingResult(false);
              }}
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
        <div className="application-output-meta">
          <div>
            <span>{activeWordCount.toLocaleString("de-DE")} Wörter</span>
            <strong>
              {activeTab === "tailoredCv"
                ? preferences.cvLength === "compact"
                  ? "Kompakte Bewerbungsfassung"
                  : preferences.cvLength === "detailed"
                    ? "Ausführliche Bewerbungsfassung"
                    : "Fokussierte 2–3-Seiten-Fassung"
                : "Bearbeitbarer Inhalt"}
            </strong>
          </div>
          <button
            aria-pressed={editingResult}
            onClick={() => setEditingResult((current) => !current)}
            type="button"
          >
            {editingResult ? "Formatierte Vorschau" : "Inhalt bearbeiten"}
          </button>
        </div>
        {editingResult ? (
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
        ) : (
          <ApplicationDocumentPreview content={activeContent} kind={activeTab} />
        )}
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
            onClick={downloadActiveDocument}
            type="button"
          >
            {activeTab === "applicationEmailBody"
              ? "Text herunterladen"
              : "Als Word-Datei herunterladen"}
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
          {initialApplication ? (
            <button
              className="button button-primary"
              onClick={() => {
                const next = addApplicationActivity(
                  {
                    ...initialApplication,
                    generationPreferences: preferences,
                    vacancyResearch: research,
                  },
                  "application_pack_completed",
                );
                onUpdateApplication(next);
                toast("Bewerbungspaket als vollständig erfasst");
              }}
              type="button"
            >
              Paket als vollständig markieren
            </button>
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
          <small>Stelle und CV auswählen</small>
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
      <JobResearchPanel
        compact
        companyName={companyName}
        initialJobPostingText={initialApplication?.jobDescriptionText ?? ""}
        onChange={updateResearch}
        research={research}
        researchScopes={preferences.researchScopes}
        roleTitle={roleTitle}
        sourceUrl={jobUrl}
      />
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
            {cv ? formatBytes(cv.size) : "PDF, Word, ODT, RTF oder Text · max. 16 MB"}
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
              {masterCvContent
                ? `Bearbeitete Fassung · Version ${masterCvContent.editRevision + 1} · mit Belegen`
                : `${masterCv.name} · nur für dieses Paket geladen`}
            </small>
          </div>
          <b>{useMasterCv && !cv ? "Ausgewählt" : "Auswählen"}</b>
        </button>
      ) : null}

      <div className="studio-step">
        <span>2</span>
        <div>
          <strong>Deine Passung</strong>
          <small>Kurze, konkrete Antworten genügen</small>
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
          <strong>Auswahl für dein Paket</strong>
          <small>Inhalte, Ton, Recherche und Gehalt</small>
        </div>
      </div>
      <div className="form-grid studio-style-grid">
        <label>
          Grad der Förmlichkeit
          <select
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                formality: event.target.value as ApplicationGenerationPreferences["formality"],
              }))
            }
            value={preferences.formality}
          >
            <option value="modern">Modern und direkt</option>
            <option value="balanced">Ausgewogen professionell</option>
            <option value="formal">Klassisch formell</option>
          </select>
        </label>
        <label>
          Anrede
          <select
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                addressStyle: event.target.value as ApplicationGenerationPreferences["addressStyle"],
              }))
            }
            value={preferences.addressStyle}
          >
            <option value="auto">Aus Anzeige und Unternehmen ableiten</option>
            <option value="sie">Sie</option>
            <option value="du">Du</option>
          </select>
        </label>
        <label>
          Sprache
          <select
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                language: event.target.value as ApplicationGenerationPreferences["language"],
              }))
            }
            value={preferences.language}
          >
            <option>Deutsch</option>
            <option>Englisch</option>
          </select>
        </label>
        <label>
          Länge des angepassten CV
          <select
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                cvLength: event.target.value as ApplicationGenerationPreferences["cvLength"],
              }))
            }
            value={preferences.cvLength}
          >
            <option value="two_pages">Fokussiert · 2–3 gut gefüllte Seiten</option>
            <option value="compact">Kompakt · 1–2 Seiten</option>
            <option value="detailed">Ausführlich · 4–6 Seiten</option>
          </select>
        </label>
      </div>

      <fieldset className="studio-choice-panel">
        <legend>Welche Ergebnisse sollen entstehen?</legend>
        <div className="studio-choice-grid">
          {APPLICATION_OUTPUT_DEFINITIONS.map((definition) => (
            <label key={definition.key}>
              <input
                checked={preferences.outputKinds.includes(definition.key)}
                onChange={(event) => toggleOutput(definition.key, event.target.checked)}
                type="checkbox"
              />
              <span>
                <strong>{definition.label}</strong>
                <small>{definition.description}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="studio-choice-panel">
        <legend>Welche Schwerpunkte sollen sichtbar werden?</legend>
        <div className="studio-chip-grid">
          {APPLICATION_FOCUS_THEMES.map((theme) => (
            <label key={theme}>
              <input
                checked={preferences.focusThemes.includes(theme)}
                onChange={(event) => toggleFocusTheme(theme, event.target.checked)}
                type="checkbox"
              />
              <span>{theme}</span>
            </label>
          ))}
        </div>
        <label>
          Weitere Akzente oder bewusste Grenzen
          <textarea
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                customFocus: event.target.value,
              }))
            }
            placeholder="z. B. Führung nur zurückhaltend darstellen; Digitalisierungserfolge priorisieren"
            rows={3}
            value={preferences.customFocus}
          />
        </label>
      </fieldset>

      <fieldset className="studio-choice-panel">
        <legend>Was soll die Webrecherche abdecken?</legend>
        <div className="studio-choice-grid">
          {APPLICATION_RESEARCH_SCOPE_DEFINITIONS.map((definition) => (
            <label key={definition.key}>
              <input
                checked={preferences.researchScopes.includes(definition.key)}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    researchScopes: event.target.checked
                      ? [...new Set([...current.researchScopes, definition.key])]
                      : current.researchScopes.filter(
                          (candidate) => candidate !== definition.key,
                        ),
                  }))
                }
                type="checkbox"
              />
              <span>
                <strong>{definition.label}</strong>
                <small>{definition.description}</small>
              </span>
            </label>
          ))}
        </div>
        <label>
          Bestätigte Web-Ergebnisse für die Texte
          <select
            onChange={(event) =>
              setPreferences((current) => ({
                ...current,
                researchSelectionMode:
                  event.target.value as ApplicationGenerationPreferences["researchSelectionMode"],
              }))
            }
            value={preferences.researchSelectionMode}
          >
            <option value="all_confirmed">Alle von mir bestätigten Ergebnisse</option>
            <option value="selected_only">Nur einzeln ausgewählte Ergebnisse</option>
            <option value="none">Keine Web-Ergebnisse in den Texten</option>
          </select>
        </label>
        {preferences.researchSelectionMode === "selected_only" ? (
          <div className="studio-research-claims">
            {confirmedClaims.length ? confirmedClaims.map((claim) => (
              <label key={claim.id}>
                <input
                  checked={preferences.selectedResearchClaimIds.includes(claim.id)}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      selectedResearchClaimIds: event.target.checked
                        ? [...new Set([...current.selectedResearchClaimIds, claim.id])]
                        : current.selectedResearchClaimIds.filter(
                            (candidate) => candidate !== claim.id,
                          ),
                    }))
                  }
                  type="checkbox"
                />
                <span>{claim.decision.value || claim.value}</span>
              </label>
            )) : (
              <p>Bestätige zuerst Rechercheergebnisse, die du gezielt nutzen möchtest.</p>
            )}
          </div>
        ) : null}
      </fieldset>

      <fieldset className="studio-choice-panel salary-choice-panel">
        <legend>Gehaltswunsch und Verhandlungsspielraum</legend>
        <div className={`salary-assessment tone-${salaryAssessment.tone}`}>
          <strong>{salaryAssessment.title}</strong>
          <p>{salaryAssessment.detail}</p>
        </div>
        {initialApplication ? (
          <p className="salary-context-note">
            Recherchehinweis: {initialApplication.compensation || "keine Vergütung veröffentlicht"}
            {" · "}{SALARY_OUTLOOK_LABELS[initialApplication.salaryOutlook]}
          </p>
        ) : null}
        <div className="form-grid">
          <label>
            Wunschgehalt brutto pro Jahr
            <input
              min={1}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  desiredSalaryAnnual: event.target.value
                    ? Number(event.target.value)
                    : null,
                }))
              }
              placeholder="z. B. 58000"
              step={500}
              type="number"
              value={preferences.desiredSalaryAnnual ?? ""}
            />
          </label>
          <label>
            Persönliche Untergrenze
            <input
              min={1}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  minimumSalaryAnnual: event.target.value
                    ? Number(event.target.value)
                    : null,
                }))
              }
              placeholder="nur für die Strategie"
              step={500}
              type="number"
              value={preferences.minimumSalaryAnnual ?? ""}
            />
          </label>
          <label>
            Spielraum
            <select
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  salaryFlexibility:
                    event.target.value as ApplicationGenerationPreferences["salaryFlexibility"],
                }))
              }
              value={preferences.salaryFlexibility}
            >
              <option value="fixed">Fest</option>
              <option value="negotiable">Verhandelbar</option>
              <option value="open">Zunächst offen</option>
            </select>
          </label>
          <label>
            Im Anschreiben erwähnen
            <select
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  mentionSalary:
                    event.target.value as ApplicationGenerationPreferences["mentionSalary"],
                }))
              }
              value={preferences.mentionSalary}
            >
              <option value="never">Nie</option>
              <option value="if_requested">Nur wenn verlangt</option>
              <option value="always">Immer</option>
            </select>
          </label>
        </div>
        <small>
          Die Untergrenze dient nur der persönlichen Entscheidung und wird niemals
          automatisch in Anschreiben oder Mail übernommen.
        </small>
      </fieldset>
      <p className="form-trust">
        CV und Antworten werden nur für dieses Paket verarbeitet. Das Original bleibt
        unverändert; Texte werden nicht automatisch gespeichert oder um erfundene
        Angaben ergänzt.
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
