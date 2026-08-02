"use client";

import {
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { JobResearchPanel } from "./job-research-panel";
import {
  MasterCvWorkspace,
} from "./master-cv-workspace";
import {
  APPLICATION_RESEARCH,
  createEmptyApplication,
} from "../lib/application-research";
import {
  addApplicationActivity,
  applicationKpiProgress,
  APPLICATION_KPI_DEFINITIONS,
  APPLICATION_OUTPUT_DEFINITIONS,
  APPLICATION_RESEARCH_SCOPE_DEFINITIONS,
} from "../lib/application-workflow";
import { formatDate, formatRelativeDate } from "../lib/format";
import { applyConfirmedResearchClaim } from "../lib/job-research";
import {
  APPLICATION_STATUS_LABELS,
  SALARY_OUTLOOK_LABELS,
  type AppState,
  type ApplicationArtifact,
  type ApplicationArtifactKind,
  type ApplicationActivityType,
  type ApplicationProcess,
  type ApplicationStatus,
  type DocumentKind,
  type DocumentRef,
  type JobResearchClaim,
  type MasterCvContent,
  type MasterCvImportBundle,
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

const ACTIVITY_LABELS: Record<ApplicationActivityType, string> = {
  vacancy_added: "Vakanz hinzugefügt",
  application_pack_completed: "Bewerbungsunterlagen vollständig",
  application_sent: "Bewerbung versendet",
  phone_interview: "Telefoninterview",
  onsite_interview: "Vor-Ort-Gespräch",
};

const CLOSED_STATUSES = new Set<ApplicationStatus>([
  "rejected",
  "withdrawn",
  "closed",
]);

const APPLICATION_FILE_TYPES =
  ".pdf,.doc,.docx,.odt,.rtf,.txt,.md,.jpg,.jpeg,.png,.webp";

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
  onImportMasterCv: (bundle: MasterCvImportBundle) => void;
  onSaveMasterCvContent: (content: MasterCvContent) => void;
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

export function ApplicationsView({
  state,
  onCreateApplication,
  onUpdateApplication,
  onImportMasterCv,
  onSaveMasterCvContent,
  onAttachArtifact,
  onRemoveArtifact,
  onOpenStudio,
  toast,
}: ApplicationsViewProps) {
  const { applications } = state;
  const researchPoolCount = APPLICATION_RESEARCH.length;
  const researchVerifiedAt =
    APPLICATION_RESEARCH[0]?.sourceVerifiedAt ?? new Date().toISOString();
  const [selectedId, setSelectedId] = useState<string | null>(
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
  const kpiProgress = useMemo(
    () => applicationKpiProgress(applications, state.applicationKpiSettings),
    [applications, state.applicationKpiSettings],
  );

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
        {kpiProgress
          .filter((progress) => progress.enabled)
          .map((progress) => {
            const definition = APPLICATION_KPI_DEFINITIONS.find(
              (candidate) => candidate.key === progress.key,
            );
            if (!definition) return null;
            return (
              <article className="application-kpi-card" key={progress.key}>
                <span>{definition.label}</span>
                <strong>
                  {progress.values.week}
                  <small> / {progress.targets.week}</small>
                </strong>
                <div className="application-kpi-periods">
                  {(
                    [
                      ["day", "Tag"],
                      ["week", "Woche"],
                      ["month", "Monat"],
                    ] as const
                  ).map(([period, label]) => (
                    <div key={period}>
                      <span>
                        {label} · {progress.values[period]} / {progress.targets[period]}
                      </span>
                      <i aria-hidden="true">
                        <b
                          style={{
                            width: `${Math.min(100, progress.percentages[period])}%`,
                          }}
                        />
                      </i>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        {!kpiProgress.some((progress) => progress.enabled) ? (
          <article className="application-kpi-card application-kpi-empty">
            <span>Bewerbungskennzahlen</span>
            <strong>Ausgeblendet</strong>
            <small>In den Einstellungen kannst du deine Ziele auswählen.</small>
          </article>
        ) : null}
      </section>

      <MasterCvWorkspace
        documents={state.documents}
        key={
          state.masterCvContent
            ? `${state.masterCvContent.sourceDocumentId}-${state.masterCvContent.editRevision}`
            : state.masterCvDocumentId ?? "master-cv-empty"
        }
        masterCvDocumentId={state.masterCvDocumentId}
        masterCvContent={state.masterCvContent}
        onImport={onImportMasterCv}
        onSave={onSaveMasterCvContent}
        toast={toast}
      />

      <section className="applications-workbench">
        <div className="panel applications-list-panel">
          <div className="applications-list-heading">
            <div>
              <span className="eyebrow">Pipeline und Recherche</span>
              <h2>{visible.length} von {applications.length} Vakanzen</h2>
            </div>
            <span className="research-stamp">
              Stand {formatDate(researchVerifiedAt)}
            </span>
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
            {visible.map((application) => {
              const expanded = selectedId === application.id;
              return (
                <details
                  className="application-record"
                  key={application.id}
                  open={expanded}
                  role="listitem"
                >
                  <summary
                    aria-current={expanded ? "true" : undefined}
                    className={`application-row ${expanded ? "selected" : ""}`}
                    onClick={(event) => {
                      event.preventDefault();
                      setSelectedId(expanded ? null : application.id);
                    }}
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
                    <span className="application-expand-indicator" aria-hidden="true">
                      {expanded ? "−" : "+"}
                    </span>
                  </summary>
                  {expanded ? (
                    <ApplicationDetail
                      application={application}
                      documents={state.documents}
                      masterCvDocumentId={state.masterCvDocumentId}
                      onAttachArtifact={onAttachArtifact}
                      onOpenStudio={onOpenStudio}
                      onRemoveArtifact={onRemoveArtifact}
                      onUpdate={onUpdateApplication}
                      toast={toast}
                    />
                  ) : null}
                </details>
              );
            })}
          </div>
          {!visible.length ? (
            <div className="applications-empty">
              <strong>Keine passenden Einträge</strong>
              <p>Ändere einen Filter oder ergänze einen neuen Bewerbungsprozess.</p>
            </div>
          ) : null}
        </div>

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
  const primaryArtifacts = draft.artifacts.filter(
    (artifact) => artifact.kind !== "job-screenshot",
  );
  const screenshotArtifacts = draft.artifacts.filter(
    (artifact) => artifact.kind === "job-screenshot",
  );

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

  const recordActivity = (type: ApplicationActivityType, label: string) => {
    const today = new Date().toISOString();
    let next = addApplicationActivity(draft, type, today);
    if (type === "application_sent") {
      next = {
        ...next,
        appliedAt: next.appliedAt ?? today.slice(0, 10),
        status: ["research", "planned", "draft"].includes(next.status)
          ? "submitted"
          : next.status,
      };
    }
    if (type === "phone_interview" || type === "onsite_interview") {
      next = { ...next, status: "interview" };
    }
    setDraft(next);
    onUpdate(next);
    toast(`${label} für heute erfasst`);
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

      <div className="application-action-bar" aria-label="Schnellaktionen zur Vakanz">
        {safeHttpUrl(draft.sourceUrl) ? (
          <a href={draft.sourceUrl} rel="noreferrer" target="_blank">
            Ausschreibung öffnen
          </a>
        ) : null}
        <button onClick={() => onOpenStudio(draft)} type="button">
          Unterlagen generieren
        </button>
        <button
          onClick={() =>
            recordActivity("application_pack_completed", "Vollständiges Paket")
          }
          type="button"
        >
          Paket vollständig
        </button>
        <button
          onClick={() => recordActivity("application_sent", "Bewerbung versendet")}
          type="button"
        >
          Versand erfassen
        </button>
        <button
          onClick={() => recordActivity("phone_interview", "Telefoninterview")}
          type="button"
        >
          Telefoninterview
        </button>
        <button
          onClick={() => recordActivity("onsite_interview", "Vor-Ort-Gespräch")}
          type="button"
        >
          Vor-Ort-Gespräch
        </button>
      </div>

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
        {draft.tags.length ? (
          <div className="application-tags" aria-label="Stichworte zur Vakanz">
            {draft.tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        ) : null}
      </div>

      <details className="application-digital-job" open={Boolean(draft.jobDescriptionText)}>
        <summary>
          <span>
            <strong>Digitale Stellenbeschreibung</strong>
            <small>Durchsuchbare Arbeitsgrundlage für Recherche und Generierung</small>
          </span>
          <b>{draft.jobDescriptionText ? "Vorhanden" : "Noch ergänzen"}</b>
        </summary>
        <label>
          Veröffentlichter Text und strukturierte Angaben
          <textarea
            maxLength={30_000}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                jobDescriptionText: event.target.value,
              }))
            }
            placeholder="Aufgaben, Muss- und Kann-Anforderungen, Rahmenbedingungen sowie Auswahlprozess"
            rows={10}
            value={draft.jobDescriptionText}
          />
        </label>
      </details>

      <JobResearchPanel
        companyName={draft.company}
        initialJobPostingText={draft.jobDescriptionText}
        onChange={updateResearch}
        research={draft.vacancyResearch}
        researchScopes={draft.generationPreferences.researchScopes}
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
          <label>
            Kontakt-Telefon
            <input
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  contactPhone: event.target.value,
                }))
              }
              type="tel"
              value={draft.contactPhone}
            />
          </label>
        </div>
        {draft.contacts.length ? (
          <div className="application-contact-cards" aria-label="Erkannte Kontakte">
            {draft.contacts.map((contact) => (
              <article key={contact.id}>
                <span>
                  {contact.kind === "functional"
                    ? "Fachbereich"
                    : contact.kind === "recruiting"
                      ? "Recruiting"
                      : "Kontakt"}
                </span>
                <strong>{contact.name || "Name nicht veröffentlicht"}</strong>
                {contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : null}
                {contact.phone ? <a href={`tel:${contact.phone}`}>{contact.phone}</a> : null}
                {contact.note ? <small>{contact.note}</small> : null}
              </article>
            ))}
          </div>
        ) : null}
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
        <details className="application-generation-summary">
          <summary>Auswahl für die nächste Generierung</summary>
          <div>
            <p>
              <strong>Ergebnisse:</strong>{" "}
              {APPLICATION_OUTPUT_DEFINITIONS.filter((definition) =>
                draft.generationPreferences.outputKinds.includes(definition.key),
              ).map((definition) => definition.label).join(" · ") || "Noch keine"}
            </p>
            <p>
              <strong>Recherche:</strong>{" "}
              {APPLICATION_RESEARCH_SCOPE_DEFINITIONS.filter((definition) =>
                draft.generationPreferences.researchScopes.includes(definition.key),
              ).map((definition) => definition.label).join(" · ") || "Keine Webfakten"}
            </p>
            <p>
              <strong>Schwerpunkte:</strong>{" "}
              {[...draft.generationPreferences.focusThemes,
                draft.generationPreferences.customFocus]
                .filter(Boolean)
                .join(" · ") || "Im Studio festlegen"}
            </p>
          </div>
        </details>
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
          {primaryArtifacts.map((artifact) => {
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
        {!primaryArtifacts.length ? (
          <p className="artifact-empty">
            Noch keine primären vakanzbezogenen Dateien verknüpft. Füge die
            Stellenausschreibung oder deine finalen Unterlagen gezielt hinzu.
          </p>
        ) : null}
        {screenshotArtifacts.length ? (
          <details className="application-screenshot-backup">
            <summary>
              Screenshot-Backup · {screenshotArtifacts.length} Datei
              {screenshotArtifacts.length === 1 ? "" : "en"}
            </summary>
            <div className="artifact-list">
              {screenshotArtifacts.map((artifact) => {
                const document = documents.find(
                  (candidate) => candidate.id === artifact.documentId,
                );
                const openUrl = document?.downloadUrl || document?.driveUrl;
                return (
                  <article key={artifact.id}>
                    <span>Backup</span>
                    <p>
                      <strong>{artifact.label}</strong>
                      <small>{formatRelativeDate(artifact.createdAt)}</small>
                    </p>
                    <div>
                      {openUrl ? (
                        <a href={openUrl} rel="noreferrer" target="_blank">
                          Öffnen
                        </a>
                      ) : null}
                      <button onClick={() => removeArtifact(artifact.id)} type="button">
                        Lösen
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </details>
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
        {draft.activities.length ? (
          <details className="application-activity-log">
            <summary>Aktivitätsverlauf · {draft.activities.length}</summary>
            <ul>
              {[...draft.activities].reverse().map((activity) => (
                <li key={activity.id}>
                  <strong>{ACTIVITY_LABELS[activity.type]}</strong>
                  <span>{formatDate(activity.occurredAt)}</span>
                  {activity.note ? <small>{activity.note}</small> : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
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
