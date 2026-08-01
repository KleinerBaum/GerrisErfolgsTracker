"use client";

import {
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { JobResearchPanel } from "./job-research-panel";
import {
  APPLICATION_RESEARCH,
  createEmptyApplication,
} from "../lib/application-research";
import { formatDate, formatRelativeDate } from "../lib/format";
import { applyConfirmedResearchClaim } from "../lib/job-research";
import {
  APPLICATION_STATUS_LABELS,
  SALARY_OUTLOOK_LABELS,
  type AppState,
  type ApplicationArtifact,
  type ApplicationArtifactKind,
  type ApplicationProcess,
  type ApplicationStatus,
  type DocumentKind,
  type DocumentRef,
  type JobResearchClaim,
  type SalaryOutlook,
  type VacancyResearch,
} from "../lib/types";

const ARTIFACT_LABELS: Record<ApplicationArtifactKind, string> = {
  "cover-letter": "Anschreiben",
  "tailored-cv": "Maßgeschneiderter CV",
  research: "Recherche",
  "job-posting": "Stellenausschreibung",
  "job-screenshot": "Screenshot der Ausschreibung",
  certificate: "Nachweis oder Zeugnis",
  other: "Weitere Unterlage",
};

const STATUS_OPTIONS = Object.entries(APPLICATION_STATUS_LABELS) as Array<
  [ApplicationStatus, string]
>;

const SALARY_OPTIONS = Object.entries(SALARY_OUTLOOK_LABELS) as Array<
  [SalaryOutlook, string]
>;

const CLOSED_STATUSES = new Set<ApplicationStatus>([
  "rejected",
  "withdrawn",
  "closed",
]);

const ACTIVE_STATUSES = new Set<ApplicationStatus>([
  "submitted",
  "interview",
  "offer",
]);

const APPLICATION_FILE_TYPES =
  ".pdf,.doc,.docx,.odt,.rtf,.txt,.md,.jpg,.jpeg,.png,.webp";
const MASTER_CV_FILE_TYPES = ".pdf,.doc,.docx,.odt,.rtf,.txt,.md";

type UploadResponse = {
  fileId?: string;
  originalName?: string;
  contentType?: string;
  sizeBytes?: number;
  destination?: string;
  downloadUrl?: string;
  error?: string;
};

type ApplicationsViewProps = {
  state: AppState;
  onCreateApplication: (application: ApplicationProcess) => void;
  onUpdateApplication: (application: ApplicationProcess) => void;
  onSaveMasterCv: (document: DocumentRef) => void;
  onSetMasterCv: (documentId: string | null) => void;
  onAttachArtifact: (
    applicationId: string,
    document: DocumentRef,
    artifact: ApplicationArtifact,
  ) => void;
  onRemoveArtifact: (applicationId: string, artifactId: string) => void;
  onOpenStudio: (application: ApplicationProcess) => void;
  toast: (message: string) => void;
};

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

function dayDistance(value: string): number {
  const target = new Date(`${value.slice(0, 10)}T12:00:00`);
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86_400_000);
}

function deadlineCopy(value: string | null): string {
  if (!value) return "Keine Frist veröffentlicht";
  const days = dayDistance(value);
  if (days < 0) return `Frist abgelaufen · ${formatDate(value)}`;
  if (days === 0) return "Frist heute";
  if (days === 1) return "Frist morgen";
  return `${formatDate(value)} · noch ${days} Tage`;
}

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

async function uploadPrivateFile({
  file,
  destination,
  tags,
  note,
}: {
  file: File;
  destination: string;
  tags: string[];
  note: string;
}): Promise<DocumentRef> {
  const form = new FormData();
  form.append("file", file);
  form.append("destination", destination);
  const response = await fetch("/api/files", { method: "POST", body: form });
  const payload = (await response.json()) as UploadResponse;
  if (
    !response.ok ||
    !payload.fileId ||
    !payload.downloadUrl ||
    !payload.contentType ||
    typeof payload.sizeBytes !== "number"
  ) {
    throw new Error(payload.error || "Die Datei konnte nicht abgelegt werden.");
  }
  return {
    id: `upload-${payload.fileId}`,
    name: file.name,
    folderPath: destination,
    kind: fileKind(file.name),
    driveUrl: payload.downloadUrl,
    fileId: null,
    modifiedAt: new Date().toISOString(),
    tags: ["Private Ablage", ...tags],
    confidential: true,
    storage: "upload",
    downloadUrl: payload.downloadUrl,
    contentType: payload.contentType,
    sizeBytes: payload.sizeBytes,
    note,
    reviewAt: null,
  };
}

function statusClass(status: ApplicationStatus): string {
  if (status === "offer") return "positive";
  if (status === "interview") return "conversation";
  if (status === "submitted") return "submitted";
  if (CLOSED_STATUSES.has(status)) return "closed";
  if (status === "draft" || status === "planned") return "preparing";
  return "research";
}

function salaryClass(outlook: SalaryOutlook): string {
  if (outlook === "yes") return "positive";
  if (outlook === "borderline") return "warning";
  if (outlook === "no") return "closed";
  return "open";
}

function MasterCvPanel({
  documents,
  masterCvDocumentId,
  onSaveMasterCv,
  onSetMasterCv,
  toast,
}: {
  documents: DocumentRef[];
  masterCvDocumentId: string | null;
  onSaveMasterCv: (document: DocumentRef) => void;
  onSetMasterCv: (documentId: string | null) => void;
  toast: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const masterCv = documents.find(
    (document) => document.id === masterCvDocumentId,
  );
  const cvDocuments = documents.filter(
    (document) =>
      document.storage === "upload" &&
      document.kind !== "folder" &&
      /\.(pdf|doc|docx|odt|rtf|txt|md)$/i.test(document.name),
  );

  const upload = async (file: File | undefined) => {
    if (!file || busy) return;
    if (file.size > 8 * 1024 * 1024) {
      toast("Der Master-CV darf für die Generierung höchstens 8 MB groß sein");
      return;
    }
    setBusy(true);
    try {
      const document = await uploadPrivateFile({
        file,
        destination: "Persönlich/Bewerbungen/Master-CV",
        tags: ["Bewerbungen", "Master-CV"],
        note: "Orientierungsgrundlage für maßgeschneiderte Lebensläufe",
      });
      onSaveMasterCv(document);
      toast("Master-CV privat hinterlegt");
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Der Master-CV konnte nicht hinterlegt werden",
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <section className="panel master-cv-panel">
      <div className="master-cv-mark" aria-hidden="true">
        CV
      </div>
      <div className="master-cv-copy">
        <span className="eyebrow">Orientierungsgrundlage</span>
        <h2>Master-CV</h2>
        {masterCv ? (
          <p>
            <strong>{masterCv.name}</strong> ·{" "}
            {masterCv.sizeBytes ? formatBytes(masterCv.sizeBytes) : "privat abgelegt"} ·
            aktualisiert {formatRelativeDate(masterCv.modifiedAt)}
          </p>
        ) : (
          <p>
            Hinterlege deinen vollständigen Lebenslauf einmal. Das
            Bewerbungsstudio nutzt ihn dann auf Wunsch als private Grundlage und
            erfindet keine Stationen.
          </p>
        )}
      </div>
      <div className="master-cv-actions">
        {cvDocuments.length ? (
          <label>
            <span className="visually-hidden">Vorhandenen Master-CV auswählen</span>
            <select
              aria-label="Vorhandenen Master-CV auswählen"
              onChange={(event) => onSetMasterCv(event.target.value || null)}
              value={masterCvDocumentId ?? ""}
            >
              <option value="">Kein Master-CV ausgewählt</option>
              {cvDocuments.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <input
          accept={MASTER_CV_FILE_TYPES}
          className="visually-hidden"
          onChange={(event) => void upload(event.target.files?.[0])}
          ref={inputRef}
          type="file"
        />
        <button
          className="button button-soft"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          {busy ? "CV wird geschützt abgelegt …" : masterCv ? "Neue Version" : "CV hinterlegen"}
        </button>
        {masterCv?.downloadUrl ? (
          <a
            className="button button-ghost"
            href={masterCv.downloadUrl}
            rel="noreferrer"
            target="_blank"
          >
            Öffnen
          </a>
        ) : null}
      </div>
    </section>
  );
}

export function ApplicationsView({
  state,
  onCreateApplication,
  onUpdateApplication,
  onSaveMasterCv,
  onSetMasterCv,
  onAttachArtifact,
  onRemoveArtifact,
  onOpenStudio,
  toast,
}: ApplicationsViewProps) {
  const { applications } = state;
  const researchPoolCount = APPLICATION_RESEARCH.length;
  const researchVerifiedAt =
    APPLICATION_RESEARCH[0]?.sourceVerifiedAt ?? new Date().toISOString();
  const [selectedId, setSelectedId] = useState(
    applications.find((application) => application.shortlisted)?.id ??
      applications[0]?.id ??
      null,
  );
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "all">(
    "all",
  );
  const [salaryFilter, setSalaryFilter] = useState<SalaryOutlook | "all">("all");
  const [poolFilter, setPoolFilter] = useState<
    "shortlist" | "all" | "top" | "plausible" | "stretch" | "own"
  >("shortlist");

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return applications.filter((application) => {
      const matchesQuery =
        !normalizedQuery ||
        `${application.jobTitle} ${application.company} ${application.location} ${application.researchSummary}`
          .toLowerCase()
          .includes(normalizedQuery);
      const matchesStatus =
        statusFilter === "all" || application.status === statusFilter;
      const matchesSalary =
        salaryFilter === "all" || application.salaryOutlook === salaryFilter;
      const matchesPool =
        poolFilter === "all" ||
        (poolFilter === "shortlist"
          ? application.shortlisted
          : application.researchTier === poolFilter);
      return matchesQuery && matchesStatus && matchesSalary && matchesPool;
    });
  }, [applications, poolFilter, query, salaryFilter, statusFilter]);

  const selected =
    applications.find((application) => application.id === selectedId) ?? null;
  const submitted = applications.filter(
    (application) =>
      Boolean(application.appliedAt) || ACTIVE_STATUSES.has(application.status),
  ).length;
  const active = applications.filter((application) =>
    ACTIVE_STATUSES.has(application.status),
  ).length;
  const conversations = applications.filter(
    (application) => application.status === "interview",
  ).length;
  const upcomingAction = applications
    .filter(
      (application) =>
        application.nextStepAt &&
        dayDistance(application.nextStepAt) >= 0 &&
        !CLOSED_STATUSES.has(application.status),
    )
    .sort((left, right) =>
      (left.nextStepAt ?? "9999").localeCompare(right.nextStepAt ?? "9999"),
    )[0];

  const createApplication = () => {
    const application = createEmptyApplication(
      `application-${crypto.randomUUID()}`,
    );
    onCreateApplication(application);
    setQuery("");
    setStatusFilter("all");
    setSalaryFilter("all");
    setPoolFilter("all");
    setSelectedId(application.id);
    toast("Neue Bewerbungsakte angelegt");
  };

  return (
    <div className="view-stack applications-view">
      <section className="page-intro applications-intro">
        <div>
          <span className="eyebrow">
            Bewerbungssteuerung · Recherche vom {formatDate(researchVerifiedAt)}
          </span>
          <h1 tabIndex={-1}>Jede Chance. Jeder nächste Schritt. Eine klare Akte.</h1>
          <p>
            Verfolge Bewerbungen, Fristen, Konditionen und Gespräche. Alle{" "}
            {researchPoolCount} recherchierten Vakanzen sind bereits enthalten;
            nur tatsächlich versendete Bewerbungen zählen als Bewerbung.
          </p>
        </div>
        <div className="page-intro-action">
          <div className="button-group">
            <button
              className="button button-soft"
              onClick={createApplication}
              type="button"
            >
              Prozess hinzufügen
            </button>
            <button
              className="button button-primary"
              onClick={() =>
                onOpenStudio(
                  selected ??
                    createEmptyApplication(`application-${crypto.randomUUID()}`),
                )
              }
              type="button"
            >
              Bewerbung erstellen
            </button>
          </div>
        </div>
      </section>

      <section className="application-kpi-grid" aria-label="Bewerbungskennzahlen">
        <article className="application-kpi-card">
          <span>Recherchepool</span>
          <strong>{applications.length}</strong>
          <small>{applications.filter((item) => item.shortlisted).length} in der engsten Auswahl</small>
        </article>
        <article className="application-kpi-card">
          <span>Versendet</span>
          <strong>{submitted}</strong>
          <small>mit Bewerbungsdatum oder aktivem Prozess</small>
        </article>
        <article className="application-kpi-card">
          <span>Aktive Prozesse</span>
          <strong>{active}</strong>
          <small>Bewerbung, Gespräch oder Angebot</small>
        </article>
        <article className="application-kpi-card application-kpi-next">
          <span>Nächster Schritt</span>
          <strong>
            {upcomingAction?.nextStepAt
              ? formatDate(upcomingAction.nextStepAt)
              : "Noch offen"}
          </strong>
          <small>
            {upcomingAction
              ? `${upcomingAction.company} · ${upcomingAction.nextStep}`
              : `${conversations} Gespräche aktuell`}
          </small>
        </article>
      </section>

      <MasterCvPanel
        documents={state.documents}
        masterCvDocumentId={state.masterCvDocumentId}
        onSaveMasterCv={onSaveMasterCv}
        onSetMasterCv={onSetMasterCv}
        toast={toast}
      />

      <section className="applications-workbench">
        <div className="panel applications-list-panel">
          <div className="applications-list-heading">
            <div>
              <span className="eyebrow">Pipeline und Recherche</span>
              <h2>{visible.length} von {applications.length} Vakanzen</h2>
            </div>
            <span className="research-stamp">Stand 29.07.2026</span>
          </div>

          <div className="applications-toolbar">
            <label className="applications-search">
              <span className="visually-hidden">Bewerbungen durchsuchen</span>
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rolle, Arbeitgeber, Ort oder Stichwort"
                type="search"
                value={query}
              />
            </label>
            <select
              aria-label="Rechercheauswahl filtern"
              onChange={(event) =>
                setPoolFilter(
                  event.target.value as typeof poolFilter,
                )
              }
              value={poolFilter}
            >
              <option value="shortlist">Engste Auswahl</option>
              <option value="all">Alle Vakanzen</option>
              <option value="top">Besonders relevant</option>
              <option value="plausible">Plausible Ziele</option>
              <option value="stretch">Hohe formale Hürde</option>
              <option value="own">Eigene Einträge</option>
            </select>
            <select
              aria-label="Bewerbungsstatus filtern"
              onChange={(event) =>
                setStatusFilter(event.target.value as ApplicationStatus | "all")
              }
              value={statusFilter}
            >
              <option value="all">Alle Status</option>
              {STATUS_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label="50k-Potenzial filtern"
              onChange={(event) =>
                setSalaryFilter(event.target.value as SalaryOutlook | "all")
              }
              value={salaryFilter}
            >
              <option value="all">Alle 50k-Einschätzungen</option>
              {SALARY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="application-table-head" aria-hidden="true">
            <span>Vakanz</span>
            <span>Status</span>
            <span>Frist</span>
            <span>Nächster Schritt</span>
          </div>
          <div className="application-table" role="list">
            {visible.map((application) => (
              <button
                aria-current={selectedId === application.id ? "true" : undefined}
                className={`application-row ${
                  selectedId === application.id ? "selected" : ""
                }`}
                key={application.id}
                onClick={() => setSelectedId(application.id)}
                role="listitem"
                type="button"
              >
                <div className="application-role">
                  <span>
                    {application.researchRank
                      ? `#${application.researchRank}`
                      : "EIGEN"}
                  </span>
                  <p>
                    <strong>{application.jobTitle}</strong>
                    <small>
                      {application.company} · {application.location}
                    </small>
                  </p>
                </div>
                <span className={`application-status ${statusClass(application.status)}`}>
                  {APPLICATION_STATUS_LABELS[application.status]}
                </span>
                <span className={`application-deadline ${
                  application.deadline && dayDistance(application.deadline) <= 7
                    ? "urgent"
                    : ""
                }`}>
                  {deadlineCopy(application.deadline)}
                </span>
                <span className="application-next">
                  <strong>{application.nextStep}</strong>
                  <small>
                    {application.nextStepAt
                      ? formatDate(application.nextStepAt)
                      : "Termin noch festlegen"}
                  </small>
                </span>
              </button>
            ))}
          </div>
          {!visible.length ? (
            <div className="applications-empty">
              <strong>Keine passenden Einträge</strong>
              <p>Ändere einen Filter oder ergänze einen neuen Bewerbungsprozess.</p>
            </div>
          ) : null}
        </div>

        {selected ? (
          <ApplicationDetail
            application={selected}
            documents={state.documents}
            key={selected.id}
            masterCvDocumentId={state.masterCvDocumentId}
            onAttachArtifact={onAttachArtifact}
            onOpenStudio={onOpenStudio}
            onRemoveArtifact={onRemoveArtifact}
            onUpdate={onUpdateApplication}
            toast={toast}
          />
        ) : (
          <section className="panel application-detail-empty">
            <span>AKTE</span>
            <h2>Wähle eine Vakanz aus.</h2>
            <p>
              Hier erscheinen Konditionen, Recherche, nächster Schritt und alle
              zugeordneten Unterlagen.
            </p>
          </section>
        )}
      </section>
    </div>
  );
}

function ApplicationDetail({
  application,
  documents,
  masterCvDocumentId,
  onAttachArtifact,
  onRemoveArtifact,
  onOpenStudio,
  onUpdate,
  toast,
}: {
  application: ApplicationProcess;
  documents: DocumentRef[];
  masterCvDocumentId: string | null;
  onAttachArtifact: (
    applicationId: string,
    document: DocumentRef,
    artifact: ApplicationArtifact,
  ) => void;
  onRemoveArtifact: (applicationId: string, artifactId: string) => void;
  onOpenStudio: (application: ApplicationProcess) => void;
  onUpdate: (application: ApplicationProcess) => void;
  toast: (message: string) => void;
}) {
  const attachmentRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(application);
  const [artifactKind, setArtifactKind] =
    useState<ApplicationArtifactKind>("job-posting");
  const [uploading, setUploading] = useState(false);
  const masterCv = documents.find((document) => document.id === masterCvDocumentId);

  const save = (event: FormEvent) => {
    event.preventDefault();
    const processStates = new Set<ApplicationStatus>([
      "submitted",
      "interview",
      "offer",
      "rejected",
      "closed",
    ]);
    const next =
      processStates.has(draft.status) && !draft.appliedAt
        ? { ...draft, appliedAt: new Date().toISOString().slice(0, 10) }
        : draft;
    setDraft(next);
    onUpdate(next);
    toast("Bewerbungsakte aktualisiert");
  };

  const uploadArtifact = async (file: File | undefined) => {
    if (!file || uploading) return;
    if (file.size > 20 * 1024 * 1024) {
      toast("Eine Unterlage darf höchstens 20 MB groß sein");
      return;
    }
    setUploading(true);
    try {
      const document = await uploadPrivateFile({
        file,
        destination: `Persönlich/Bewerbungen/${application.company || "Neue Bewerbung"}`,
        tags: ["Bewerbungen", ARTIFACT_LABELS[artifactKind]],
        note: `${ARTIFACT_LABELS[artifactKind]} · ${application.company} · ${application.jobTitle}`,
      });
      const artifact: ApplicationArtifact = {
        id: `artifact-${crypto.randomUUID()}`,
        kind: artifactKind,
        documentId: document.id,
        label: file.name,
        createdAt: new Date().toISOString(),
      };
      onAttachArtifact(application.id, document, artifact);
      setDraft((current) => ({
        ...current,
        artifacts: [...current.artifacts, artifact],
      }));
      toast(`${ARTIFACT_LABELS[artifactKind]} zur Akte hinzugefügt`);
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Die Unterlage konnte nicht hinzugefügt werden",
      );
    } finally {
      setUploading(false);
      if (attachmentRef.current) attachmentRef.current.value = "";
    }
  };

  const removeArtifact = (artifactId: string) => {
    onRemoveArtifact(application.id, artifactId);
    setDraft((current) => ({
      ...current,
      artifacts: current.artifacts.filter((artifact) => artifact.id !== artifactId),
    }));
    toast("Verknüpfung aus der Bewerbungsakte entfernt");
  };

  const updateResearch = (
    research: VacancyResearch,
    decidedClaim?: JobResearchClaim,
  ) => {
    let next: ApplicationProcess = {
      ...draft,
      vacancyResearch: research,
      sourceVerifiedAt: research.researchedAt.slice(0, 10),
      sourceUrl:
        research.retrievalStatus === "exact_page_accessed" && research.canonicalUrl
          ? research.canonicalUrl
          : draft.sourceUrl,
    };
    if (decidedClaim) {
      next = applyConfirmedResearchClaim(next, decidedClaim);
    }
    setDraft(next);
    onUpdate(next);
    toast(
      decidedClaim
        ? "Rechercheentscheidung in der Bewerbungsakte gespeichert"
        : "Vakanzrecherche in der Bewerbungsakte gespeichert",
    );
  };

  return (
    <form className="panel application-detail" onSubmit={save}>
      <header className="application-detail-heading">
        <div>
          <span className="eyebrow">
            {application.researchRank
              ? `Rechercheplatz ${application.researchRank}`
              : "Eigener Bewerbungsprozess"}
          </span>
          <h2>{application.company || "Arbeitgeber ergänzen"}</h2>
          <p>{application.jobTitle}</p>
        </div>
        <span className={`fit-badge fit-${application.fitRating.slice(0, 1).toLowerCase() || "open"}`}>
          Passung {application.fitRating || "offen"}
        </span>
      </header>

      <div className="application-detail-section application-status-section">
        <label>
          Status
          <select
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                status: event.target.value as ApplicationStatus,
              }))
            }
            value={draft.status}
          >
            {STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Beworben am
          <input
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                appliedAt: event.target.value || null,
              }))
            }
            type="date"
            value={draft.appliedAt ?? ""}
          />
        </label>
        <label>
          Bewerbungsweg
          <input
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                applicationChannel: event.target.value,
              }))
            }
            placeholder="Portal, E-Mail, Empfehlung …"
            value={draft.applicationChannel}
          />
        </label>
      </div>

      <div className="application-detail-section">
        <div className="application-section-heading">
          <div>
            <span className="eyebrow">Vakanz</span>
            <h3>Rolle und veröffentlichte Konditionen</h3>
          </div>
          <label className="shortlist-toggle">
            <input
              checked={draft.shortlisted}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  shortlisted: event.target.checked,
                }))
              }
              type="checkbox"
            />
            Engste Auswahl
          </label>
        </div>
        <div className="application-form-grid">
          <label>
            Stellentitel
            <input
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  jobTitle: event.target.value,
                }))
              }
              required
              value={draft.jobTitle}
            />
          </label>
          <label>
            Arbeitgeber
            <input
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  company: event.target.value,
                }))
              }
              required
              value={draft.company}
            />
          </label>
          <label>
            Arbeitsort
            <input
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  location: event.target.value,
                }))
              }
              value={draft.location}
            />
          </label>
          <label>
            Bewerbungsfrist
            <input
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  deadline: event.target.value || null,
                }))
              }
              type="date"
              value={draft.deadline ?? ""}
            />
          </label>
          <label className="wide">
            Rahmen
            <input
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  publishedTerms: event.target.value,
                }))
              }
              value={draft.publishedTerms}
            />
          </label>
          <label>
            Vergütung
            <input
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  compensation: event.target.value,
                }))
              }
              value={draft.compensation}
            />
          </label>
          <label>
            50k-Einschätzung
            <select
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  salaryOutlook: event.target.value as SalaryOutlook,
                }))
              }
              value={draft.salaryOutlook}
            >
              {SALARY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="wide">
            Link zur Ausschreibung
            <input
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  sourceUrl: event.target.value,
                }))
              }
              placeholder="Im Rechercheanhang nicht mitgeliefert – hier ergänzen"
              type="url"
              value={draft.sourceUrl}
            />
          </label>
        </div>
        <div className="application-source-actions">
          <span>
            Recherche geprüft am {formatDate(draft.sourceVerifiedAt)}
          </span>
          {safeHttpUrl(draft.sourceUrl) ? (
            <a href={draft.sourceUrl} rel="noreferrer" target="_blank">
              Ausschreibung öffnen
            </a>
          ) : null}
        </div>
      </div>

      <JobResearchPanel
        companyName={draft.company}
        onChange={updateResearch}
        research={draft.vacancyResearch}
        roleTitle={draft.jobTitle}
        sourceUrl={draft.sourceUrl}
      />

      <div className="application-detail-section">
        <div className="application-section-heading">
          <div>
            <span className="eyebrow">Bewerbungsstand</span>
            <h3>Konditionen und nächster Schritt</h3>
          </div>
        </div>
        <label>
          Konditionen meiner Bewerbung
          <textarea
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                appliedTerms: event.target.value,
              }))
            }
            placeholder="Gehaltswunsch, Wochenstunden, Startdatum, Remote-Anteil oder weitere Vereinbarungen"
            rows={3}
            value={draft.appliedTerms}
          />
        </label>
        <div className="application-form-grid next-step-grid">
          <label>
            Erwarteter nächster Schritt
            <input
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  nextStep: event.target.value,
                }))
              }
              value={draft.nextStep}
            />
          </label>
          <label>
            Erwartet am
            <input
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  nextStepAt: event.target.value || null,
                }))
              }
              type="date"
              value={draft.nextStepAt ?? ""}
            />
          </label>
          <label>
            Ansprechperson
            <input
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  contactPerson: event.target.value,
                }))
              }
              value={draft.contactPerson}
            />
          </label>
          <label>
            Kontakt-E-Mail
            <input
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  contactEmail: event.target.value,
                }))
              }
              type="email"
              value={draft.contactEmail}
            />
          </label>
        </div>
      </div>

      <div className="application-detail-section research-detail">
        <div className="application-section-heading">
          <div>
            <span className="eyebrow">Rechercheergebnis</span>
            <h3>Passung und entscheidender Punkt</h3>
          </div>
          <span className={`salary-chip ${salaryClass(draft.salaryOutlook)}`}>
            {SALARY_OUTLOOK_LABELS[draft.salaryOutlook]}
          </span>
        </div>
        <p>{draft.researchSummary || "Noch keine Rechercheeinschätzung hinterlegt."}</p>
        <label>
          Eigene Notizen
          <textarea
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                notes: event.target.value,
              }))
            }
            placeholder="Gesprächsnotizen, Rückfragen, Risiken oder Argumentationspunkte"
            rows={4}
            value={draft.notes}
          />
        </label>
      </div>

      <div className="application-detail-section application-artifacts">
        <div className="application-section-heading">
          <div>
            <span className="eyebrow">Private Bewerbungsakte</span>
            <h3>Anschreiben, CV, Recherche und Ausschreibung</h3>
          </div>
          <span>{draft.artifacts.length} Unterlagen</span>
        </div>
        {masterCv ? (
          <div className="application-master-reference">
            <span>MASTER-CV</span>
            <p>
              <strong>{masterCv.name}</strong>
              <small>Globale Orientierungsgrundlage · wird nicht verändert</small>
            </p>
            {masterCv.downloadUrl ? (
              <a href={masterCv.downloadUrl} rel="noreferrer" target="_blank">
                Öffnen
              </a>
            ) : null}
          </div>
        ) : null}
        <div className="artifact-list">
          {draft.artifacts.map((artifact) => {
            const document = documents.find(
              (candidate) => candidate.id === artifact.documentId,
            );
            const openUrl = document?.downloadUrl || document?.driveUrl;
            return (
              <article key={artifact.id}>
                <span>{ARTIFACT_LABELS[artifact.kind]}</span>
                <p>
                  <strong>{artifact.label}</strong>
                  <small>
                    {document?.sizeBytes ? `${formatBytes(document.sizeBytes)} · ` : ""}
                    {formatRelativeDate(artifact.createdAt)}
                  </small>
                </p>
                <div>
                  {openUrl ? (
                    <a href={openUrl} rel="noreferrer" target="_blank">
                      Öffnen
                    </a>
                  ) : null}
                  <button
                    onClick={() => removeArtifact(artifact.id)}
                    type="button"
                  >
                    Lösen
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        {!draft.artifacts.length ? (
          <p className="artifact-empty">
            Noch keine vakanzbezogenen Dateien verknüpft. Füge die
            Stellenausschreibung, einen Screenshot oder deine finalen Unterlagen
            gezielt hinzu.
          </p>
        ) : null}
        <div className="artifact-upload-row">
          <select
            aria-label="Art der Bewerbungsunterlage"
            onChange={(event) =>
              setArtifactKind(event.target.value as ApplicationArtifactKind)
            }
            value={artifactKind}
          >
            {Object.entries(ARTIFACT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            accept={APPLICATION_FILE_TYPES}
            className="visually-hidden"
            onChange={(event) => void uploadArtifact(event.target.files?.[0])}
            ref={attachmentRef}
            type="file"
          />
          <button
            className="button button-soft"
            disabled={uploading}
            onClick={() => attachmentRef.current?.click()}
            type="button"
          >
            {uploading ? "Unterlage wird abgelegt …" : "Unterlage hinzufügen"}
          </button>
        </div>
      </div>

      <div className="application-detail-actions">
        <button
          className="button button-soft"
          onClick={() => onOpenStudio(draft)}
          type="button"
        >
          Bewerbungsstudio öffnen
        </button>
        <button className="button button-primary" type="submit">
          Änderungen speichern
        </button>
      </div>
    </form>
  );
}
