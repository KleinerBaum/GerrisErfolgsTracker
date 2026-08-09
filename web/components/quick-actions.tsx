"use client";

import {
  Fragment,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";

import {
  ApplicationDesignPanel,
  ApplicationVisualPreview,
} from "./application-design-panel";
import { JobResearchPanel } from "./job-research-panel";
import { gmailDraftUrl } from "../lib/google-links";
import {
  downloadEditableDocx,
  resolveVisualizationPlacements,
  type DocxExportOptions,
} from "../lib/docx-export";
import {
  loadPrivateDocumentBytes,
  prepareDocxVisualization,
} from "../lib/application-document-design";
import {
  analyzeDocxTemplate,
  type DocxTemplateAnalysis,
  type DocxTemplateProfile,
} from "../lib/docx-template-profile";
import { responsePayload } from "../lib/http-response";
import {
  applicationGenerationStartPayload,
  isApplicationMasterCvReady,
} from "../lib/application-generation-api";
import {
  markApplicationPackageNeedsReview,
  type ApplicationPackage,
} from "../lib/application-package";
import { applyConfirmedResearchClaim } from "../lib/job-research";
import {
  contentFingerprint,
  contractTypeFromResearch,
  documentGenerationGate,
  marketSalaryEstimateFromResearch,
  preferredRoleResearchUrl,
  publishedAtFromResearch,
  safePublicUrl,
  salaryBasisFromResearch,
  verificationStatusFromResearch,
} from "../lib/role-pipeline";
import {
  LLM_MODEL_OPTIONS,
  LLM_REASONING_OPTIONS,
} from "../lib/llm-config";
import { useModalDialog } from "../lib/use-modal-dialog";
import {
  addApplicationActivity,
  assessSalaryPreference,
  APPLICATION_FOCUS_THEMES,
  APPLICATION_OUTPUT_DEFINITIONS,
  APPLICATION_RESEARCH_SCOPE_DEFINITIONS,
  normalizeApplicationDocumentDesign,
  normalizeApplicationGenerationInputs,
  normalizeApplicationGenerationPreferences,
} from "../lib/application-workflow";
import {
  SALARY_OUTLOOK_LABELS,
  type ApplicationDocumentKind,
  type ApplicationDocumentVisualization,
  type ApplicationGenerationPreferences,
  type ApplicationOutputKind,
  type ApplicationProcess,
  type DocumentKind,
  type DocumentRef,
  type IntegrationConfig,
  type LlmModelTier,
  type LlmReasoningEffort,
  type MasterCvContent,
  type JobResearchClaim,
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
  masterCvPersisted: boolean;
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
  masterCvDocumentId,
  masterCvContent,
  masterCvPersisted,
  integrations,
  onClose,
  onSaveDocument,
  onUpdateApplication,
  toast,
}: QuickActionDialogProps) {
  const copy = ACTION_COPY[kind];
  const dialogRef = useModalDialog<HTMLElement>(onClose);
  return (
    <div className="dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="quick-dialog-title"
        aria-modal="true"
        className={`capture-dialog quick-action-dialog action-${kind}`}
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
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
            masterCvPersisted={masterCvPersisted}
            onSaveDocument={onSaveDocument}
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
        const payload = await responsePayload<UploadResponse>(response);
        if (
          !response.ok ||
          !payload.fileId ||
          !payload.downloadUrl ||
          !payload.contentType ||
          typeof payload.sizeBytes !== "number"
        ) {
          throw new Error(payload.error || "Upload fehlgeschlagen");
        }
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
          accept=".pdf,.doc,.docx,.odt,.rtf,.txt,.md,.csv,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.svg,.webp,.heic"
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
      const payload = await responsePayload<{
        draftId?: string;
        draft?: { id?: string };
        webUrl?: string;
        error?: string;
        connectUrl?: string;
      }>(response);
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
      const payload = await responsePayload<{
        result?: unknown;
        error?: string;
      }>(response);
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
    Array.isArray(result.sources) &&
    Array.isArray(result.evidenceMap) &&
    result.status === "ready" &&
    Boolean(result.qualityReport) &&
    typeof result.qualityReport === "object" &&
    result.qualityReport.status === "ready" &&
    Array.isArray(result.qualityReport.issues) &&
    result.qualityReport.issues.length === 0
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

const TAB_OUTPUT_MAP: Record<ApplicationTab, ApplicationOutputKind> = {
  coverLetter: "cover-letter",
  tailoredCv: "tailored-cv",
  companyBrief: "company-brief",
  interviewPrep: "interview-prep",
  applicationEmailBody: "application-email",
};

const applicationOutputLabel = (kind: ApplicationOutputKind): string =>
  APPLICATION_OUTPUT_DEFINITIONS.find((definition) => definition.key === kind)
    ?.label ?? kind;

const reasoningEffortLabel = (effort: LlmReasoningEffort): string =>
  LLM_REASONING_OPTIONS.find((option) => option.key === effort)?.label ?? effort;

const TAB_DOCUMENT_KIND: Partial<Record<ApplicationTab, ApplicationDocumentKind>> = {
  coverLetter: "cover-letter",
  tailoredCv: "tailored-cv",
  companyBrief: "company-brief",
  interviewPrep: "interview-prep",
};

type ApplicationGenerationJobReference = {
  id: string;
  status: "queued" | "in_progress";
  stage: "draft" | "repair" | "manual_review";
  artifact: ApplicationOutputKind | null;
  completedArtifacts: number;
  totalArtifacts: number;
  startedAt: string;
  expiresAt: string;
};

type ApplicationGenerationApiPayload = {
  result?: unknown;
  job?: ApplicationGenerationJobReference;
  cancelled?: boolean;
  error?: string;
  issues?: string[];
  usage?: {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    cachedInputTokens: number;
    cacheWriteTokens: number;
    totalTokens: number;
    durationMs: number;
    stages: Array<{
      artifact: ApplicationOutputKind;
      stage: ApplicationGenerationJobReference["stage"];
      model: string;
      effort: LlmReasoningEffort;
      inputTokens: number;
      outputTokens: number;
      reasoningTokens: number;
      cachedInputTokens: number;
      cacheWriteTokens: number;
      totalTokens: number;
      durationMs: number;
    }>;
  };
};

const APPLICATION_GENERATION_POLL_DEADLINE_MS = 20 * 60_000;

function applicationGenerationProgress(
  job: ApplicationGenerationJobReference,
): string {
  const progress = `${job.completedArtifacts} von ${job.totalArtifacts}`;
  const artifact = job.artifact ? applicationOutputLabel(job.artifact) : "Paket";
  if (job.stage === "repair") {
    return `${artifact} gezielt korrigieren · ${progress} Ergebnisse fertig …`;
  }
  if (job.stage === "manual_review") {
    return `${artifact}: manuelle Änderungen prüfen · ${progress} Ergebnisse fertig …`;
  }
  return `${artifact} erstellen · ${progress} Ergebnisse fertig …`;
}

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
  documents,
  kind,
  profile,
  visualizations,
}: {
  content: string;
  documents: DocumentRef[];
  kind: ApplicationTab;
  profile: DocxTemplateProfile | null;
  visualizations: ApplicationDocumentVisualization[];
}) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const placements = resolveVisualizationPlacements(content, visualizations);
  const visualsByLine = new Map<number, Array<{
    visual: ApplicationDocumentVisualization;
    warning: string | null;
  }>>();
  placements.forEach((placement, index) => {
    const items = visualsByLine.get(placement.insertBeforeLine) ?? [];
    items.push({ visual: visualizations[index], warning: placement.warning });
    visualsByLine.set(placement.insertBeforeLine, items);
  });
  const previewStyle = profile
    ? ({
        "--document-body-font": profile.fonts.body,
        "--document-title-font": profile.fonts.title,
        "--document-heading-font": profile.fonts.heading,
        "--document-text": `#${profile.colors.text}`,
        "--document-accent": `#${profile.colors.accent}`,
        "--document-muted": `#${profile.colors.muted}`,
        "--document-soft": `#${profile.colors.soft}`,
      } as CSSProperties)
    : undefined;
  const renderVisuals = (lineIndex: number) =>
    (visualsByLine.get(lineIndex) ?? []).map(({ visual, warning }) => {
      const source = documents.find(
        (document) => document.id === visual.sourceDocumentId,
      );
      return (
        <figure className="document-visual-preview" key={visual.id}>
          {source ? (
            <ApplicationVisualPreview alt={visual.altText} source={source} />
          ) : (
            <div className="document-visual-missing">Ressource fehlt</div>
          )}
          <figcaption>{visual.title || source?.name || "Visualisierung"}</figcaption>
          {!visual.confirmedAt ? (
            <small>Vor dem Export ist die Inhaltsbestätigung erforderlich.</small>
          ) : null}
          {warning ? <small>{warning}</small> : null}
        </figure>
      );
    });
  return (
    <article
      aria-label="Formatierte Dokumentvorschau"
      className={`application-document-preview preview-${kind}`}
      style={previewStyle}
    >
      {lines.map((rawLine, index) => {
        const line = rawLine.trim();
        let lineNode;
        if (!line) {
          lineNode = <div className="document-spacer" />;
        } else {
        const heading = /^(#{1,3})\s+(.+)$/.exec(line);
        if (heading?.[1].length === 1) {
            lineNode = <h1>{previewInline(heading[2])}</h1>;
          } else if (heading?.[1].length === 2) {
            lineNode = <h2>{previewInline(heading[2])}</h2>;
          } else if (heading?.[1].length === 3) {
            lineNode = <h3>{previewInline(heading[2])}</h3>;
          } else if (/^BEWERBUNGSFASSUNG\s*\|/i.test(line)) {
            lineNode = <span className="document-kicker">{line}</span>;
          } else {
            const bullet = /^\s*(?:[-•])\s+(.+)$/.exec(line);
            if (bullet) {
              lineNode = (
            <div className="document-bullet" key={`line-${index}`}>
              <span aria-hidden="true">•</span>
              <p>{previewInline(bullet[1])}</p>
            </div>
              );
            } else if (/^\*\*.*\*\*$/.test(line) && /\d/.test(line)) {
              lineNode = <p className="document-date">{previewInline(line)}</p>;
            } else if (/^\*(?!\*)(.+)\*$/.test(line)) {
              lineNode = <p className="document-company">{previewInline(line)}</p>;
            } else if (/^[A-ZÄÖÜ0-9][A-ZÄÖÜ0-9 &/+.-]{2,42}:\s+/u.test(line)) {
              lineNode = <p className="document-proof">{previewInline(line)}</p>;
            } else {
              lineNode = <p>{previewInline(line)}</p>;
            }
          }
        }
        return (
          <Fragment key={`line-${index}`}>
            {renderVisuals(index)}
            {lineNode}
          </Fragment>
        );
      })}
      {renderVisuals(lines.length)}
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

function ApplicationStudio({
  account,
  documents,
  initialApplication,
  masterCvDocumentId,
  masterCvContent,
  masterCvPersisted,
  onSaveDocument,
  onUpdateApplication,
  toast,
}: {
  account: string;
  documents: DocumentRef[];
  initialApplication: ApplicationProcess | null;
  masterCvDocumentId: string | null;
  masterCvContent: MasterCvContent | null;
  masterCvPersisted: boolean;
  onSaveDocument: (document: DocumentRef) => void;
  onUpdateApplication: (application: ApplicationProcess) => void;
  toast: (message: string) => void;
}) {
  const [jobUrl, setJobUrl] = useState(
    initialApplication ? preferredRoleResearchUrl(initialApplication) : "",
  );
  const [jobText, setJobText] = useState(
    initialApplication?.jobDescriptionText ?? "",
  );
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
  const [research, setResearch] = useState<VacancyResearch | null>(
    initialApplication?.vacancyResearch ?? null,
  );
  const initialGenerationInputs = normalizeApplicationGenerationInputs(
    initialApplication?.generationInputs,
  );
  const [motivation, setMotivation] = useState(
    initialGenerationInputs.motivation,
  );
  const [achievements, setAchievements] = useState(
    initialGenerationInputs.achievements,
  );
  const [strengths, setStrengths] = useState(initialGenerationInputs.strengths);
  const [constraints, setConstraints] = useState(
    initialGenerationInputs.constraints,
  );
  const [availability, setAvailability] = useState(
    initialGenerationInputs.availability,
  );
  const [preferences, setPreferences] =
    useState<ApplicationGenerationPreferences>(() =>
      normalizeApplicationGenerationPreferences(
        initialApplication?.generationPreferences,
      ),
    );
  const [documentDesign, setDocumentDesign] = useState(() =>
    normalizeApplicationDocumentDesign(initialApplication?.documentDesign),
  );
  const [templateAnalyses, setTemplateAnalyses] = useState<
    Record<string, DocxTemplateAnalysis>
  >({});
  const [result, setResult] = useState<ApplicationPackage | null>(null);
  const [activeTab, setActiveTab] = useState<ApplicationTab>("coverLetter");
  const [editingResult, setEditingResult] = useState(false);
  const [editedOutputKinds, setEditedOutputKinds] = useState<
    ApplicationOutputKind[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [generationError, setGenerationError] = useState<string[]>([]);
  const [generationProgress, setGenerationProgress] = useState("");
  const [generationUsage, setGenerationUsage] = useState<
    ApplicationGenerationApiPayload["usage"]
  >(undefined);
  const [activeGenerationJobId, setActiveGenerationJobId] = useState<
    string | null
  >(null);
  const activeGenerationJobIdRef = useRef<string | null>(null);
  const generationCancelRequested = useRef(false);
  const storedMasterCvDocument = documents.find(
    (document) => document.id === masterCvDocumentId,
  );
  const masterCvReady = isApplicationMasterCvReady({
    document: storedMasterCvDocument,
    documentId: masterCvDocumentId,
    content: masterCvContent,
    persisted: masterCvPersisted,
  });
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
  const researchScopeSummary = `${preferences.researchScopes.length} von ${APPLICATION_RESEARCH_SCOPE_DEFINITIONS.length} Bereichen`;
  const researchUseSummary =
    preferences.researchSelectionMode === "none"
      ? "nicht für Texte verwenden"
      : preferences.researchSelectionMode === "selected_only"
        ? "nur einzeln ausgewählte Ergebnisse"
        : "alle bestätigten Ergebnisse";
  const additionalFitDetailsCount = [
    strengths,
    constraints,
    availability,
  ].filter((value) => value.trim()).length;
  const styleSummary = `${preferences.language} · ${
    preferences.formality === "formal"
      ? "klassisch formell"
      : preferences.formality === "modern"
        ? "modern und direkt"
        : "ausgewogen professionell"
  } · ${
    preferences.addressStyle === "auto"
      ? "Anrede automatisch"
      : `Anrede ${preferences.addressStyle === "sie" ? "Sie" : "Du"}`
  }`;
  const focusSummary = preferences.focusThemes.length
    ? `${preferences.focusThemes.length} Schwerpunkte${preferences.customFocus.trim() ? " · eigener Hinweis" : ""}`
    : preferences.customFocus.trim()
      ? "Eigener Schwerpunkt hinterlegt"
      : "Keine zusätzlichen Schwerpunkte";
  const salarySummary = preferences.desiredSalaryAnnual
    ? `${preferences.desiredSalaryAnnual.toLocaleString("de-DE")} € Wunschgehalt`
    : "Keine Gehaltsangabe hinterlegt";
  const researchedCanonicalUrl =
    research?.retrievalStatus === "exact_page_accessed"
      ? safePublicUrl(research.canonicalUrl)
      : "";
  const effectiveVerificationStatus = research
    ? verificationStatusFromResearch(research)
    : initialApplication?.verificationStatus ?? "unverified";
  const generationRoleGate = documentGenerationGate({
    sourceUrl: researchedCanonicalUrl || initialApplication?.sourceUrl || "",
    verificationStatus: effectiveVerificationStatus,
    recommendation: initialApplication?.recommendation ?? "undecided",
    assessment: initialApplication?.assessment ?? null,
    vacancyResearch: research ?? initialApplication?.vacancyResearch ?? null,
  });

  const updateDocumentDesign = (
    value: Parameters<typeof normalizeApplicationDocumentDesign>[0],
  ) => {
    const normalized = normalizeApplicationDocumentDesign(value);
    setDocumentDesign(normalized);
    if (!initialApplication) return;
    onUpdateApplication({
      ...initialApplication,
      generationInputs: normalizeApplicationGenerationInputs({
        motivation,
        achievements,
        strengths,
        constraints,
        availability,
      }),
      generationPreferences: normalizeApplicationGenerationPreferences(
        preferences,
      ),
      documentDesign: normalized,
    });
  };

  const recordTemplateAnalysis = (
    documentId: string,
    analysis: DocxTemplateAnalysis,
  ) => {
    setTemplateAnalyses((current) => ({ ...current, [documentId]: analysis }));
  };

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

  const updateArtifactModel = (
    kind: ApplicationOutputKind,
    field: "model" | "effort",
    value: LlmModelTier | LlmReasoningEffort,
  ) => {
    setPreferences((current) => ({
      ...current,
      modelSettings: {
        ...current.modelSettings,
        [kind]: {
          ...current.modelSettings[kind],
          [field]: value,
        },
      },
    }));
  };

  const updateResearch = (
    nextResearch: VacancyResearch,
    decidedClaim?: JobResearchClaim,
  ) => {
    setResearch(nextResearch);
    if (!initialApplication) return;
    let nextApplication: ApplicationProcess = {
      ...initialApplication,
      vacancyResearch: nextResearch,
      documentDesign,
    };
    for (const claim of [
      ...nextResearch.adFacts,
      ...nextResearch.enrichment,
    ]) {
      nextApplication = applyConfirmedResearchClaim(nextApplication, claim);
    }
    if (decidedClaim) {
      const canonicalUrl = safePublicUrl(nextResearch.canonicalUrl);
      if (nextResearch.retrievalStatus === "exact_page_accessed" && canonicalUrl) {
        setJobUrl(canonicalUrl);
      }
      nextApplication = {
        ...nextApplication,
        sourceVerifiedAt: nextResearch.researchedAt.slice(0, 10),
        checkedAt: nextResearch.researchedAt,
        sourceUrl:
          nextResearch.retrievalStatus === "exact_page_accessed" && canonicalUrl
            ? canonicalUrl
            : nextApplication.sourceUrl,
        publishedAt:
          publishedAtFromResearch(nextResearch) ?? nextApplication.publishedAt,
        contractType:
          contractTypeFromResearch(nextResearch) || nextApplication.contractType,
        salaryBasis: salaryBasisFromResearch(nextResearch),
        marketSalaryEstimate:
          marketSalaryEstimateFromResearch(nextResearch) ||
          nextApplication.marketSalaryEstimate,
        verificationStatus: verificationStatusFromResearch(nextResearch),
        contentFingerprint: contentFingerprint({
          employer: nextApplication.company,
          title: nextApplication.jobTitle,
          location: nextApplication.location,
          description: nextApplication.jobDescriptionText,
        }),
      };
    }
    onUpdateApplication(nextApplication);
  };

  const persistGenerationSettings = (
    generationInputs: ReturnType<typeof normalizeApplicationGenerationInputs>,
    normalizedPreferences: ApplicationGenerationPreferences,
    announce = false,
  ) => {
    if (!initialApplication) return;
    onUpdateApplication({
      ...initialApplication,
      generationInputs,
      generationPreferences: normalizedPreferences,
      documentDesign,
    });
    if (announce) toast("Persönliche Angaben und Paketauswahl gespeichert");
  };

  const cancelApplicationGeneration = async () => {
    const jobId = activeGenerationJobIdRef.current;
    if (!jobId || generationCancelRequested.current) return;
    generationCancelRequested.current = true;
    setGenerationProgress("Erstellung wird abgebrochen …");
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "application_generation",
          action: "cancel",
          jobId,
        }),
      });
      const payload = await responsePayload<ApplicationGenerationApiPayload>(
        response,
      );
      if (!response.ok || !payload.cancelled) {
        throw new Error(
          payload.error || "Die Erstellung konnte nicht abgebrochen werden.",
        );
      }
      activeGenerationJobIdRef.current = null;
      setActiveGenerationJobId(null);
      setGenerationProgress("");
      setBusy(false);
      toast("Bewerbungserstellung abgebrochen");
    } catch (error) {
      generationCancelRequested.current = false;
      const message =
        error instanceof Error
          ? error.message
          : "Die Erstellung konnte nicht abgebrochen werden.";
      setGenerationError([message]);
      setGenerationProgress("Erstellung läuft weiter …");
      toast(message);
    }
  };


  const submitApplicationGeneration = async (
    action: "generate" | "manual_review",
    draft: ApplicationPackage | null = null,
  ) => {
    if (!generationRoleGate.allowed) {
      toast(generationRoleGate.reasons[0]);
      return;
    }
    if (!preferences.outputKinds.length) {
      toast("Bitte mindestens ein gewünschtes Ergebnis auswählen");
      return;
    }
    if (
      !masterCvReady ||
      (!jobUrl.trim() && !jobText.trim()) ||
      busy
    ) {
      if (!masterCvReady) {
        toast("Der gespeicherte Master-CV fehlt oder wird noch synchronisiert");
      } else if (!jobUrl.trim() && !jobText.trim()) {
        toast("Bitte Stellen-URL oder vollständigen Anzeigentext angeben");
      }
      return;
    }
    const normalizedPreferences = {
      ...normalizeApplicationGenerationPreferences(preferences),
      language: "Deutsch" as const,
      cvLength: "two_pages" as const,
      outputKinds: [
        "tailored-cv",
        "cover-letter",
        ...preferences.outputKinds.filter(
          (kind) => !["tailored-cv", "cover-letter"].includes(kind),
        ),
      ] as ApplicationOutputKind[],
    };
    const generationInputs = normalizeApplicationGenerationInputs({
      motivation,
      achievements,
      strengths,
      constraints,
      availability,
    });
    setPreferences(normalizedPreferences);
    const firstTab = APPLICATION_TABS.find((tab) =>
      normalizedPreferences.outputKinds.some(
        (kind) => OUTPUT_TAB_MAP[kind] === tab.key,
      ),
    );
    if (firstTab) setActiveTab(firstTab.key);
    persistGenerationSettings(generationInputs, normalizedPreferences);

    setBusy(true);
    setGenerationError([]);
    setGenerationUsage(undefined);
    setGenerationProgress(
      action === "manual_review"
        ? "Erneute Prüfung wird gestartet …"
        : "Anzeige und Unternehmen prüfen: Auftrag wird vorbereitet …",
    );
    setEditingResult(false);
    if (action === "generate") setEditedOutputKinds([]);
    generationCancelRequested.current = false;
    try {
      const values = {
        jobUrl: researchedCanonicalUrl || initialApplication?.sourceUrl || "",
        jobText,
        companyName,
        roleTitle,
        contactPerson,
        motivation: generationInputs.motivation,
        achievements: generationInputs.achievements,
        strengths: generationInputs.strengths,
        constraints: generationInputs.constraints,
        availability: generationInputs.availability,
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
        modelSettings: JSON.stringify(normalizedPreferences.modelSettings),
        editedOutputKinds: JSON.stringify(
          action === "manual_review" ? editedOutputKinds : [],
        ),
        researchScopes: JSON.stringify(normalizedPreferences.researchScopes),
        researchSelectionMode: normalizedPreferences.researchSelectionMode,
        selectedResearchClaimIds: JSON.stringify(
          normalizedPreferences.selectedResearchClaimIds,
        ),
        desiredSalaryAnnual:
          normalizedPreferences.desiredSalaryAnnual?.toString() ?? "",
        minimumSalaryAnnual:
          normalizedPreferences.minimumSalaryAnnual?.toString() ?? "",
        salaryFlexibility: normalizedPreferences.salaryFlexibility,
        mentionSalary: normalizedPreferences.mentionSalary,
        researchContext: JSON.stringify(research),
        roleVerificationStatus: effectiveVerificationStatus,
        roleRecommendation: initialApplication?.recommendation ?? "undecided",
        roleHardExclusionCount:
          initialApplication?.assessment?.hardExclusionMatches.length ?? 0,
        generationAction: action,
        generationRequestId: crypto.randomUUID(),
        draftPackage: draft ? JSON.stringify(draft) : "",
      };
      const startPayload = applicationGenerationStartPayload(values, {
        masterCvDocumentId: masterCvDocumentId!,
        masterCvFingerprint: masterCvContent!.sourceFingerprint,
        masterCvEditRevision: masterCvContent!.editRevision,
      });

      let packageResponse = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(startPayload),
      });
      const pollingStartedAt = Date.now();
      let pollingDelay = 2_000;
      let payload: ApplicationGenerationApiPayload;
      for (;;) {
        payload = await responsePayload<ApplicationGenerationApiPayload>(
          packageResponse,
        );
        if (!packageResponse.ok) {
          const issues = Array.isArray(payload.issues) ? payload.issues : [];
          setGenerationError(
            issues.length
              ? issues
              : [payload.error || "Bewerbungserstellung nicht erreichbar"],
          );
          throw new Error(
            payload.error || "Bewerbungserstellung nicht erreichbar",
          );
        }
        if (isApplicationPackage(payload.result)) break;
        if (packageResponse.status !== 202 || !payload.job) {
          throw new Error(
            "Die Bewerbungserstellung hat kein Ergebnis geliefert.",
          );
        }
        if (
          Date.now() - pollingStartedAt >
          APPLICATION_GENERATION_POLL_DEADLINE_MS
        ) {
          throw new Error(
            "Die Bewerbungserstellung dauert ungewöhnlich lange. Bitte später neu starten.",
          );
        }
        activeGenerationJobIdRef.current = payload.job.id;
        setActiveGenerationJobId(payload.job.id);
        setGenerationProgress(applicationGenerationProgress(payload.job));
        await new Promise((resolve) => setTimeout(resolve, pollingDelay));
        pollingDelay = Math.min(8_000, Math.ceil(pollingDelay * 1.5));
        if (generationCancelRequested.current) return;
        packageResponse = await fetch("/api/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "application_generation",
            action: "poll",
            jobId: payload.job.id,
          }),
        });
      }
      setGenerationProgress("Qualität prüfen: Das verbindliche Gate ist bestanden …");
      setResult(payload.result);
      setGenerationUsage(payload.usage);
      setEditedOutputKinds([]);
      toast(
        action === "manual_review"
          ? "Änderungen erneut geprüft und freigegeben"
          : "Versandfertiges Bewerbungspaket geprüft und freigegeben",
      );
    } catch (error) {
      if (!generationError.length) {
        const message =
          error instanceof Error
            ? error.message
            : "Bewerbungserstellung nicht erreichbar";
        setGenerationError((current) => (current.length ? current : [message]));
      }
      toast(
        error instanceof Error
          ? error.message
          : "Bewerbungserstellung nicht erreichbar",
      );
    } finally {
      activeGenerationJobIdRef.current = null;
      setActiveGenerationJobId(null);
      setGenerationProgress("");
      setBusy(false);
    }
  };

  const generate = async (event: FormEvent) => {
    event.preventDefault();
    await submitApplicationGeneration("generate");
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
    const artifactKinds = {
      coverLetter: "cover-letter",
      tailoredCv: "tailored-cv",
      companyBrief: "company-brief",
      interviewPrep: "interview-prep",
    } as const;
    const activeDocumentKind = TAB_DOCUMENT_KIND[activeTab];
    const selectedTemplateId = activeDocumentKind
      ? documentDesign.templateDocumentIds[activeDocumentKind]
      : null;
    const activeTemplateAnalysis = selectedTemplateId
      ? templateAnalyses[selectedTemplateId]
      : null;
    const activeTemplateProfile =
      activeTemplateAnalysis?.status === "ready" ||
      activeTemplateAnalysis?.status === "adapted"
        ? activeTemplateAnalysis.profile
        : null;
    const activeVisualizations = activeDocumentKind
      ? documentDesign.visualizations.filter((visual) =>
          visual.targetKinds.includes(activeDocumentKind),
        )
      : [];
    const packageReady =
      result.status === "ready" && result.qualityReport.status === "ready";
    const updateResultContent = (
      key: ApplicationTab | "applicationEmailSubject",
      value: string,
    ) => {
      setResult((current) =>
        current
          ? markApplicationPackageNeedsReview({ ...current, [key]: value })
          : current,
      );
      const outputKind =
        key === "applicationEmailSubject"
          ? "application-email"
          : TAB_OUTPUT_MAP[key];
      setEditedOutputKinds((current) =>
        current.includes(outputKind) ? current : [...current, outputKind],
      );
      setGenerationError([]);
    };
    const downloadActiveDocument = async () => {
      if (!packageReady) {
        toast("Vor dem Download müssen die Änderungen erneut geprüft werden");
        return;
      }
      if (activeTab === "applicationEmailBody") {
        downloadText(fileNames[activeTab], activeContent);
        return;
      }
      if (!activeDocumentKind || exportBusy) return;
      setExportBusy(true);
      try {
        const options: DocxExportOptions = {};
        const templateId = documentDesign.templateDocumentIds[activeDocumentKind];
        if (templateId) {
          const template = documents.find((document) => document.id === templateId);
          if (!template) throw new Error("Die ausgewählte Formatvorlage fehlt.");
          const bytes = await loadPrivateDocumentBytes(template);
          const analysis = await analyzeDocxTemplate(bytes, template.name);
          recordTemplateAnalysis(template.id, analysis);
          if (analysis.status === "blocked") throw new Error(analysis.error);
          options.templateProfile = analysis.profile;
        }
        const selectedVisuals = documentDesign.visualizations.filter((visual) =>
          visual.targetKinds.includes(activeDocumentKind),
        );
        const unconfirmed = selectedVisuals.find((visual) => !visual.confirmedAt);
        if (unconfirmed) {
          throw new Error(
            `Bitte „${unconfirmed.title || "Visualisierung"}“ inhaltlich bestätigen oder entfernen.`,
          );
        }
        options.media = await Promise.all(
          selectedVisuals.map(async (visual) => {
            const source = documents.find(
              (document) => document.id === visual.sourceDocumentId,
            );
            if (!source) throw new Error(`Die Visualisierung „${visual.title}“ fehlt.`);
            return prepareDocxVisualization(source, visual);
          }),
        );
        const placementWarnings = resolveVisualizationPlacements(
          activeContent,
          options.media,
        )
          .map((placement) => placement.warning)
          .filter((warning): warning is string => Boolean(warning));
        downloadEditableDocx(
          fileNames[activeTab],
          activeContent,
          artifactKinds[activeTab],
          [],
          options,
        );
        toast(
          placementWarnings[0] ||
            (options.templateProfile?.status === "adapted"
              ? "DOCX-Datei mit sicher adaptierter Vorlage erstellt"
              : "DOCX-Datei im deutschen Bewerbungsstandard erstellt"),
        );
      } catch (error) {
        toast(error instanceof Error ? error.message : "DOCX-Export fehlgeschlagen");
      } finally {
        setExportBusy(false);
      }
    };
    return (
      <div className="application-result">
        <div className="assistant-result-heading">
          <div>
            <span className={`assistant-mode ${packageReady ? "" : "local"}`}>
              {packageReady ? "KI- und evidenzgeprüft" : "Prüfung erforderlich"}
            </span>
            <h3>
              {result.companyName} · {result.roleTitle}
            </h3>
          </div>
          <button
            onClick={() => {
              setResult(null);
              setGenerationUsage(undefined);
              setEditedOutputKinds([]);
            }}
            type="button"
          >
            Angaben ändern
          </button>
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
                updateResultContent(
                  "applicationEmailSubject",
                  event.target.value,
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
                    : "Fokussierte Zwei-Seiten-Fassung"
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
        {activeTemplateAnalysis ? (
          <div className={`template-preview-status ${activeTemplateAnalysis.status}`}>
            <strong>
              {activeTemplateAnalysis.status === "ready"
                ? "Formatvorlage geprüft"
                : activeTemplateAnalysis.status === "adapted"
                  ? "Formatvorlage sicher adaptiert"
                  : "Formatvorlage blockiert"}
            </strong>
            <small>
              {activeTemplateAnalysis.status === "blocked"
                ? activeTemplateAnalysis.error
                : activeTemplateAnalysis.warnings[0] ||
                  "Seitenformat, Typografie, Farben und Abstände werden verwendet."}
            </small>
          </div>
        ) : null}
        <details className="studio-option-group">
          <summary>Erweitert: Vorlage und Visualisierungen</summary>
          <ApplicationDesignPanel
            analyses={templateAnalyses}
            design={documentDesign}
            documents={documents}
            onAnalysis={recordTemplateAnalysis}
            onChange={updateDocumentDesign}
            onSaveDocument={onSaveDocument}
            outputKinds={preferences.outputKinds}
            toast={toast}
          />
        </details>
        {editingResult ? (
          <textarea
            aria-label={`${APPLICATION_TABS.find((tab) => tab.key === activeTab)?.label} bearbeiten`}
            className="result-editor application-editor"
            onChange={(event) =>
              updateResultContent(activeTab, event.target.value)
            }
            rows={19}
            value={activeContent}
          />
        ) : (
          <ApplicationDocumentPreview
            content={activeContent}
            documents={documents}
            kind={activeTab}
            profile={activeTemplateProfile}
            visualizations={activeVisualizations}
          />
        )}
        <div className="artifact-actions">
          <button
            className="button button-soft"
            disabled={!packageReady}
            onClick={async () => {
              if (!packageReady) return;
              await navigator.clipboard.writeText(activeContent);
              toast("Text kopiert");
            }}
            type="button"
          >
            Kopieren
          </button>
          <button
            className="button button-ghost"
            disabled={!packageReady || exportBusy}
            onClick={() => void downloadActiveDocument()}
            type="button"
          >
            {activeTab === "applicationEmailBody"
              ? "Text herunterladen"
              : exportBusy
                ? "DOCX-Datei wird vorbereitet …"
                : "Als DOCX herunterladen"}
          </button>
          {activeTab === "applicationEmailBody" && packageReady ? (
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
          ) : activeTab === "applicationEmailBody" ? (
            <button className="button button-ghost" disabled type="button">
              Gmail nach erneuter Prüfung
            </button>
          ) : null}
          {!packageReady ? (
            <button
              className="button button-primary"
              disabled={busy}
              onClick={() =>
                void submitApplicationGeneration("manual_review", result)
              }
              type="button"
            >
              {busy ? "Änderungen werden geprüft …" : "Änderungen mit KI & Evidenz prüfen"}
            </button>
          ) : null}
          {activeGenerationJobId ? (
            <button
              className="button button-ghost"
              onClick={() => void cancelApplicationGeneration()}
              type="button"
            >
              Erstellung abbrechen
            </button>
          ) : null}
          {initialApplication ? (
            <button
              className="button button-primary"
              disabled={!packageReady}
              onClick={() => {
                if (!packageReady) return;
                const next = addApplicationActivity(
                  {
                    ...initialApplication,
                    generationInputs: normalizeApplicationGenerationInputs({
                      motivation,
                      achievements,
                      strengths,
                      constraints,
                      availability,
                    }),
                    generationPreferences: preferences,
                    documentDesign,
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
        {generationProgress ? (
          <p aria-live="polite" className="form-trust">
            {generationProgress}
          </p>
        ) : null}
        <details
          className="quality-check-panel"
          open={!packageReady || result.openQuestions.length > 0}
        >
          <summary>Qualitätscheck vor dem Versand</summary>
          <p>
            <strong>
              {packageReady ? "Freigegeben" : "Erneute Prüfung erforderlich"}
            </strong>{" "}
            · Versuch {result.qualityReport.attempt} · Evidenzzuordnung{" "}
            {result.qualityReport.metrics.evidenceCoveragePercent}%
          </p>
          {generationUsage ? (
            <div className="model-usage-summary">
              <p>
                {generationUsage.calls} Modellaufruf
                {generationUsage.calls === 1 ? "" : "e"} ·{" "}
                {generationUsage.totalTokens.toLocaleString("de-DE")} Tokens ·{" "}
                {(generationUsage.durationMs / 1_000).toLocaleString("de-DE", {
                  maximumFractionDigits: 1,
                })}{" "}
                s Modelllaufzeit
              </p>
              <div className="model-usage-list">
                {generationUsage.stages.map((usage, index) => (
                  <div
                    key={`${usage.artifact}-${usage.stage}-${index}`}
                  >
                    <strong>{applicationOutputLabel(usage.artifact)}</strong>
                    <span>
                      {usage.model} · {reasoningEffortLabel(usage.effort)} ·{" "}
                      {usage.inputTokens.toLocaleString("de-DE")} ein /{" "}
                      {usage.outputTokens.toLocaleString("de-DE")} aus
                      {usage.reasoningTokens
                        ? ` · ${usage.reasoningTokens.toLocaleString("de-DE")} Reasoning`
                        : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {generationError.length ? (
            <ul>
              {generationError.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
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
                const href = safePublicUrl(source);
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
          <strong>Stelle, Recherche und Lebenslauf</strong>
          <small>Basisdaten zuerst; Recherche nur einmal einstellen</small>
        </div>
      </div>
      <label>
        URL der Stellenanzeige (alternativ zum eingefügten Text)
        <input
          autoFocus
          onChange={(event) => setJobUrl(event.target.value)}
          placeholder="https://…"
          type="url"
          value={jobUrl}
        />
      </label>
      <div className="form-grid">
        <label>
          Unternehmen (optional bei eingefügtem Text)
          <input
            onChange={(event) => setCompanyName(event.target.value)}
            placeholder="Name des Unternehmens"
            value={companyName}
          />
        </label>
        <label>
          Zielrolle (optional bei eingefügtem Text)
          <input
            onChange={(event) => setRoleTitle(event.target.value)}
            placeholder="Exakte Stellenbezeichnung"
            value={roleTitle}
          />
        </label>
      </div>
      <details className="studio-option-group studio-research-options">
        <summary>
          <span>
            <strong>Webrecherche einstellen</strong>
            <small>{researchScopeSummary} · {researchUseSummary}</small>
          </span>
          <b aria-hidden="true">Anpassen</b>
        </summary>
        <div className="studio-option-content">
          <fieldset className="studio-choice-panel studio-choice-panel-nested">
            <legend>Rechercheumfang</legend>
            <div className="studio-choice-grid studio-choice-grid-compact">
              {APPLICATION_RESEARCH_SCOPE_DEFINITIONS.map((definition) => (
                <label key={definition.key}>
                  <input
                    checked={preferences.researchScopes.includes(definition.key)}
                    onChange={(event) =>
                      setPreferences((current) => ({
                        ...current,
                        researchScopes: event.target.checked
                          ? [
                              ...new Set([
                                ...current.researchScopes,
                                definition.key,
                              ]),
                            ]
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
          </fieldset>
          <label>
            Bestätigte Rechercheergebnisse für die Texte
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
              <option value="none">Keine Rechercheergebnisse in den Texten</option>
            </select>
          </label>
          {preferences.researchSelectionMode === "selected_only" ? (
            <div className="studio-research-claims">
              {confirmedClaims.length ? (
                confirmedClaims.map((claim) => (
                  <label key={claim.id}>
                    <input
                      checked={preferences.selectedResearchClaimIds.includes(
                        claim.id,
                      )}
                      onChange={(event) =>
                        setPreferences((current) => ({
                          ...current,
                          selectedResearchClaimIds: event.target.checked
                            ? [
                                ...new Set([
                                  ...current.selectedResearchClaimIds,
                                  claim.id,
                                ]),
                              ]
                            : current.selectedResearchClaimIds.filter(
                                (candidate) => candidate !== claim.id,
                              ),
                        }))
                      }
                      type="checkbox"
                    />
                    <span>{claim.decision.value || claim.value}</span>
                  </label>
                ))
              ) : (
                <p>
                  Bestätige zuerst Rechercheergebnisse, die du gezielt nutzen
                  möchtest.
                </p>
              )}
            </div>
          ) : null}
        </div>
      </details>
      <JobResearchPanel
        compact
        companyName={companyName}
        initialJobPostingText={initialApplication?.jobDescriptionText ?? ""}
        onJobPostingTextChange={setJobText}
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
      <div className="master-cv-choice active">
        <span aria-hidden="true">M</span>
        <div>
          <strong>Gespeicherter Master-CV</strong>
          <small>
            {masterCvReady
              ? `${storedMasterCvDocument!.name} · Version ${masterCvContent!.editRevision + 1}`
              : "Master-CV fehlt, ist ungültig oder wird noch synchronisiert"}
          </small>
        </div>
        <b>{masterCvReady ? "Bereit" : "Nicht bereit"}</b>
      </div>

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
      <details className="studio-option-group">
        <summary>
          <span>
            <strong>Weitere persönliche Hinweise</strong>
            <small>
              {additionalFitDetailsCount
                ? `${additionalFitDetailsCount} von 3 Angaben ergänzt`
                : "Optional: Stärken, Grenzen und Verfügbarkeit"}
            </small>
          </span>
          <b aria-hidden="true">Ergänzen</b>
        </summary>
        <div className="studio-option-content">
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
        </div>
      </details>

      <div className="studio-step">
        <span>3</span>
        <div>
          <strong>Auswahl für dein Paket</strong>
          <small>Ergebnisse auswählen; Details nur bei Bedarf anpassen</small>
        </div>
      </div>
      <div className="master-cv-choice active">
        <span aria-hidden="true">2</span>
        <div>
          <strong>Deutscher ATS-Standard</strong>
          <small>
            Lebenslauf (zwei Seiten) und Anschreiben (eine Seite) · Carlito und
            Caladea · DOCX für LibreOffice/OpenOffice
          </small>
        </div>
        <b>Standard</b>
      </div>
      <details className="studio-option-group">
        <summary>
          <span>
            <strong>Erweitert: Zusatzunterlagen</strong>
            <small>Briefing, Bewerbungs-Mail oder Interviewvorbereitung</small>
          </span>
          <b aria-hidden="true">Optional</b>
        </summary>
        <fieldset className="studio-choice-panel studio-output-panel studio-option-content">
          <legend>Zusätzliche Ergebnisse</legend>
          <div className="studio-choice-grid">
            {APPLICATION_OUTPUT_DEFINITIONS.filter(
              (definition) =>
                !["tailored-cv", "cover-letter"].includes(definition.key),
            ).map((definition) => (
              <label key={definition.key}>
                <input
                  checked={preferences.outputKinds.includes(definition.key)}
                  onChange={(event) =>
                    toggleOutput(definition.key, event.target.checked)
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
        </fieldset>
      </details>
      <details className="studio-option-group model-settings-panel">
        <summary>
          <span>
            <strong>Modell & Aufwand</strong>
            <small>Für jedes ausgewählte Ergebnis separat festlegen</small>
          </span>
          <b aria-hidden="true">Anpassen</b>
        </summary>
        <div className="studio-option-content">
          <p className="model-settings-intro">
            Luna ist sparsam und schnell, Terra balanciert Qualität und Kosten,
            Sol ist für besonders wichtige Texte gedacht. Sol wird nie automatisch
            ausgewählt.
          </p>
          <div className="model-settings-grid">
            {preferences.outputKinds.map((kind) => (
              <div className="model-setting-row" key={kind}>
                <strong>{applicationOutputLabel(kind)}</strong>
                <label>
                  Modell
                  <select
                    aria-label={`Modell für ${applicationOutputLabel(kind)}`}
                    onChange={(event) =>
                      updateArtifactModel(
                        kind,
                        "model",
                        event.target.value as LlmModelTier,
                      )
                    }
                    value={preferences.modelSettings[kind].model}
                  >
                    {LLM_MODEL_OPTIONS.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label} · {option.description}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Aufwand
                  <select
                    aria-label={`Aufwand für ${applicationOutputLabel(kind)}`}
                    onChange={(event) =>
                      updateArtifactModel(
                        kind,
                        "effort",
                        event.target.value as LlmReasoningEffort,
                      )
                    }
                    value={preferences.modelSettings[kind].effort}
                  >
                    {LLM_REASONING_OPTIONS.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          </div>
        </div>
      </details>
      <details className="studio-option-group">
        <summary>
          <span>
            <strong>Sprache und Stil</strong>
            <small>{styleSummary} · fokussierter Zwei-Seiten-CV</small>
          </span>
          <b aria-hidden="true">Anpassen</b>
        </summary>
        <div className="studio-option-content">
          <div className="form-grid studio-style-grid">
            <label>
              Grad der Förmlichkeit
              <select
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    formality:
                      event.target.value as ApplicationGenerationPreferences["formality"],
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
                    addressStyle:
                      event.target.value as ApplicationGenerationPreferences["addressStyle"],
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
                disabled
                value="Deutsch"
              >
                <option>Deutsch</option>
              </select>
            </label>
            <div className="master-cv-choice active">
              <span aria-hidden="true">2</span>
              <div>
                <strong>Fokussierter Zwei-Seiten-CV</strong>
                <small>
                  ATS-sicher · 750–1.150 Wörter · vollständige Chronologie
                </small>
              </div>
              <b>Fest</b>
            </div>
          </div>
        </div>
      </details>

      <details className="studio-option-group">
        <summary>
          <span>
            <strong>Inhaltliche Schwerpunkte</strong>
            <small>{focusSummary}</small>
          </span>
          <b aria-hidden="true">Anpassen</b>
        </summary>
        <div className="studio-option-content">
          <div className="studio-chip-grid">
            {APPLICATION_FOCUS_THEMES.map((theme) => (
              <label key={theme}>
                <input
                  checked={preferences.focusThemes.includes(theme)}
                  onChange={(event) =>
                    toggleFocusTheme(theme, event.target.checked)
                  }
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
        </div>
      </details>

      <details className="studio-option-group salary-choice-panel">
        <summary>
          <span>
            <strong>Gehalt und Verhandlung</strong>
            <small>{salarySummary} · nur bei Bedarf</small>
          </span>
          <b aria-hidden="true">Anpassen</b>
        </summary>
        <div className="studio-option-content">
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
            Die Untergrenze dient nur der persönlichen Entscheidung und wird
            niemals automatisch in Anschreiben oder Mail übernommen.
          </small>
        </div>
      </details>
      <details className="studio-option-group">
        <summary>
          <span>
            <strong>Erweitert: eigene Vorlagen und Visualisierungen</strong>
            <small>Der Standardexport bleibt einspaltig und ATS-sicher</small>
          </span>
          <b aria-hidden="true">Optional</b>
        </summary>
        <ApplicationDesignPanel
          analyses={templateAnalyses}
          design={documentDesign}
          documents={documents}
          onAnalysis={recordTemplateAnalysis}
          onChange={updateDocumentDesign}
          onSaveDocument={onSaveDocument}
          outputKinds={preferences.outputKinds}
          toast={toast}
        />
      </details>
      <p className="form-trust">
        Der ausgewählte Master-CV gilt nur für diesen Auftrag. Die Binärdatei
        wird weder in D1 noch in R2 oder der Dokumentbibliothek gespeichert;
        für die nächste Bewerbung wählst du sie erneut aus.
      </p>
      {!generationRoleGate.allowed ? (
        <div className="quality-check-panel" role="status">
          <strong>Unterlagen noch gesperrt</strong>
          <ul>
            {generationRoleGate.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {generationError.length ? (
        <div className="quality-check-panel" role="alert">
          <strong>Keine Freigabe</strong>
          <ul>
            {generationError.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {generationProgress ? (
        <p aria-live="polite" className="form-trust">
          {generationProgress}
        </p>
      ) : null}
      <div className="dialog-actions">
        {initialApplication ? (
          <button
            className="button button-soft"
            disabled={busy}
            onClick={() => {
              const generationInputs = normalizeApplicationGenerationInputs({
                motivation,
                achievements,
                strengths,
                constraints,
                availability,
              });
              const normalizedPreferences =
                normalizeApplicationGenerationPreferences(preferences);
              setPreferences(normalizedPreferences);
              persistGenerationSettings(
                generationInputs,
                normalizedPreferences,
                true,
              );
            }}
            type="button"
          >
            Angaben speichern
          </button>
        ) : null}
        {activeGenerationJobId ? (
          <button
            className="button button-ghost"
            onClick={() => void cancelApplicationGeneration()}
            type="button"
          >
            Erstellung abbrechen
          </button>
        ) : null}
        <button
          className="button button-primary"
          disabled={
            busy ||
            !masterCvReady ||
            !generationRoleGate.allowed
          }
          type="submit"
        >
          {busy ? "Unterlagen werden erstellt …" : "Lebenslauf & Anschreiben erstellen"}
        </button>
      </div>
    </form>
  );
}
