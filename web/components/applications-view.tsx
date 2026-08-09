"use client";

import {
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { JobResearchPanel } from "./job-research-panel";
import { JobDiscoveryPanel } from "./job-discovery-panel";
import {
  MasterCvWorkspace,
} from "./master-cv-workspace";
import {
  createEmptyApplication,
  legacyApplicationResearchSummary,
} from "../lib/application-research";
import {
  addApplicationActivity,
  applicationKpiProgress,
  APPLICATION_KPI_DEFINITIONS,
  APPLICATION_OUTPUT_DEFINITIONS,
  APPLICATION_RESEARCH_SCOPE_DEFINITIONS,
} from "../lib/application-workflow";
import {
  calendarDayDifference,
  formatDate,
  formatRelativeDate,
} from "../lib/format";
import { applyConfirmedResearchClaim } from "../lib/job-research";
import {
  acceptRoleImportCandidates,
  type RoleImportCandidatePreview,
} from "../lib/role-import";
import {
  applyRecommendationGate,
  contentFingerprint,
  contractTypeFromResearch,
  documentGenerationGate,
  marketSalaryEstimateFromResearch,
  normalizeDiscoverySources,
  preferredRoleResearchUrl,
  publishedAtFromResearch,
  ROLE_VERIFICATION_LABELS,
  safePublicUrl,
  SALARY_BASIS_LABELS,
  salaryBasisFromResearch,
  verificationStatusFromResearch,
} from "../lib/role-pipeline";
import { responsePayload } from "../lib/http-response";
import { documentOpenUrl } from "../lib/document-library";
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
  type GerrisSiteRole,
  type JobResearchClaim,
  type JobSearchProfile,
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
  onReplaceApplications: (applications: ApplicationProcess[]) => void;
  onUpdateJobSearchProfile: (profile: JobSearchProfile) => void;
  onExportBackup: () => void;
  onArchiveLegacyResearch: () => void;
  siteRole: GerrisSiteRole;
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
  return calendarDayDifference(value);
}

function deadlineCopy(value: string | null): string {
  if (!value) return "Keine Frist veröffentlicht";
  const days = dayDistance(value);
  if (days < 0) return `Frist abgelaufen · ${formatDate(value)}`;
  if (days === 0) return "Frist heute";
  if (days === 1) return "Frist morgen";
  return `${formatDate(value)} · noch ${days} Tage`;
}

function hasNamedWarmPathPerson(value: string): boolean {
  const normalized = value.trim();
  return Boolean(
    normalized.length >= 2 &&
      !/^(?:(?:hr|human resources|recruiting|personal(?:abteilung)?|kontakt|team|ansprechperson)(?: team)?|nicht veröffentlicht)$/i.test(
        normalized,
      ),
  );
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
  const payload = await responsePayload<UploadResponse>(response);
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
  onReplaceApplications,
  onUpdateJobSearchProfile,
  onExportBackup,
  onArchiveLegacyResearch,
  siteRole,
  toast,
}: ApplicationsViewProps) {
  const { applications } = state;
  const researchPoolCount = applications.filter(
    (application) => application.status === "research",
  ).length;
  const researchVerifiedAt =
    applications
      .map((application) => application.checkedAt || application.sourceVerifiedAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? state.updatedAt;
  const legacyMigration = legacyApplicationResearchSummary(applications);
  const migrationPending =
    siteRole === "production" &&
    state.applicationResearchMigration?.status !== "completed" &&
    legacyMigration.candidates > 0;
  const [backupDownloaded, setBackupDownloaded] = useState(false);
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
  >("all");

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
  const selectedDocumentGate = selected
    ? documentGenerationGate(selected)
    : { allowed: false, reasons: ["Wähle zuerst eine geprüfte Rolle aus."] };
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

  const acceptImportedCandidates = (
    candidates: RoleImportCandidatePreview[],
  ) => {
    const result = acceptRoleImportCandidates(applications, candidates);
    onReplaceApplications(result.applications);
    setPoolFilter("all");
    setStatusFilter("all");
    setSalaryFilter("all");
    setSelectedId(result.createdIds[0] ?? result.mergedIds[0] ?? selectedId);
    return { createdIds: result.createdIds, mergedIds: result.mergedIds };
  };

  return (
    <div className="view-stack applications-view">
      <section className="page-intro applications-intro">
        <div>
          <span className="eyebrow">
            Bewerbungen · Stand {formatDate(researchVerifiedAt)}
          </span>
          <h1 tabIndex={-1}>Chancen im Blick</h1>
          <p>
            {researchPoolCount} recherchierte Vakanzen, Fristen und nächste Schritte.
            Als Bewerbung zählt nur, was du tatsächlich versendet hast.
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
              disabled={!selectedDocumentGate.allowed}
              onClick={() => (selected ? onOpenStudio(selected) : undefined)}
              title={selectedDocumentGate.reasons[0]}
              type="button"
            >
              Bewerbung erstellen
            </button>
          </div>
        </div>
      </section>

      {siteRole === "qa" ? (
        <section className="qa-channel-note" role="status">
          <strong>Privater QA-Kanal</strong>
          <span>
            Nur synthetische Rollenfälle; keine Synchronisation mit Gerris Kompass.
          </span>
        </section>
      ) : null}

      {migrationPending ? (
        <section className="legacy-research-migration" role="status">
          <div>
            <span className="eyebrow">Einmalige Bereinigung</span>
            <h2>Alten Recherchepool archivieren</h2>
            <p>
              {legacyMigration.archive} unberührte Rechercheeinträge werden aus der
              aktiven Ansicht entfernt. {legacyMigration.retain} bearbeitete Prozesse
              bleiben erhalten und werden als veraltet markiert.
            </p>
          </div>
          <div className="button-group">
            <button
              className="button button-soft"
              onClick={() => {
                onExportBackup();
                setBackupDownloaded(true);
                toast("Backup heruntergeladen");
              }}
              type="button"
            >
              Backup herunterladen
            </button>
            <button
              className="button button-primary"
              disabled={!backupDownloaded}
              onClick={onArchiveLegacyResearch}
              type="button"
            >
              Altbestand archivieren
            </button>
          </div>
        </section>
      ) : null}

      <JobDiscoveryPanel
        applications={applications}
        masterCvContent={state.masterCvContent}
        onAccept={acceptImportedCandidates}
        onProfileChange={onUpdateJobSearchProfile}
        profile={state.jobSearchProfile}
        toast={toast}
      />

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
              <span className="eyebrow">Übersicht</span>
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
            <span>Prozess · Quelle</span>
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
                    <span className="application-status-stack">
                      <span className={`application-status ${statusClass(application.status)}`}>
                        {APPLICATION_STATUS_LABELS[application.status]}
                      </span>
                      <span className={`role-verification-mini ${application.verificationStatus}`}>
                        {ROLE_VERIFICATION_LABELS[application.verificationStatus]}
                      </span>
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
  const [researchUrl, setResearchUrl] = useState(() =>
    preferredRoleResearchUrl(application),
  );
  const [artifactKind, setArtifactKind] =
    useState<ApplicationArtifactKind>("job-posting");
  const [uploading, setUploading] = useState(false);
  const masterCv = documents.find((document) => document.id === masterCvDocumentId);
  const masterCvOpenUrl = documentOpenUrl(masterCv);
  const primaryArtifacts = draft.artifacts.filter(
    (artifact) => artifact.kind !== "job-screenshot",
  );
  const screenshotArtifacts = draft.artifacts.filter(
    (artifact) => artifact.kind === "job-screenshot",
  );
  const generationGate = documentGenerationGate(draft);
  const applyGate = applyRecommendationGate(draft);
  const hardExclusionActive = Boolean(
    draft.assessment?.hardExclusionMatches.length,
  );
  const warmPathPerson = draft.warmPath?.personName || draft.contactPerson;
  const warmPathAvailable = hasNamedWarmPathPerson(warmPathPerson);

  const save = (event: FormEvent) => {
    event.preventDefault();
    const stagedUrl = researchUrl.trim() ? safePublicUrl(researchUrl) : "";
    if (researchUrl.trim() && !stagedUrl) {
      toast("Bitte nur eine öffentliche HTTP(S)-Stellen-URL verwenden");
      return;
    }
    const canonicalUrl = safePublicUrl(draft.sourceUrl);
    const sourceChanged = stagedUrl !== preferredRoleResearchUrl(draft);
    const now = new Date().toISOString();
    const sourceCandidates = sourceChanged
      ? normalizeDiscoverySources([
          ...draft.discoverySources,
          ...(canonicalUrl
            ? [
                {
                  provider: "employer" as const,
                  providerJobId: null,
                  url: canonicalUrl,
                  sourceKind: "claimed_original" as const,
                  capturedAt: draft.checkedAt || now,
                  checkedAt: draft.checkedAt || null,
                },
              ]
            : []),
          ...(stagedUrl &&
          !draft.discoverySources.some(
            (source) => safePublicUrl(source.url) === stagedUrl,
          )
            ? [
                {
                  provider: "manual" as const,
                  providerJobId: null,
                  url: stagedUrl,
                  sourceKind: "claimed_original" as const,
                  capturedAt: now,
                  checkedAt: null,
                },
              ]
            : []),
        ])
      : draft.discoverySources;
    const sourceSafeDraft: ApplicationProcess = sourceChanged
      ? {
          ...draft,
          sourceUrl: "",
          sourceVerifiedAt: "",
          discoverySources: sourceCandidates,
          checkedAt: "",
          verificationStatus: "unverified",
          recommendation: "undecided",
          assessment: draft.assessment
            ? { ...draft.assessment, approvedAt: null }
            : null,
          vacancyResearch: null,
        }
      : draft;
    const processStates = new Set<ApplicationStatus>([
      "submitted",
      "interview",
      "offer",
      "rejected",
      "closed",
    ]);
    const nextBase =
      processStates.has(sourceSafeDraft.status) && !sourceSafeDraft.appliedAt
        ? { ...sourceSafeDraft, appliedAt: now.slice(0, 10) }
        : sourceSafeDraft;
    const next = {
      ...nextBase,
      contentFingerprint: contentFingerprint({
        employer: nextBase.company,
        title: nextBase.jobTitle,
        location: nextBase.location,
        description: nextBase.jobDescriptionText,
      }),
    };
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
    };
    if (decidedClaim) {
      next = applyConfirmedResearchClaim(next, decidedClaim);
      const canonicalUrl = safePublicUrl(research.canonicalUrl);
      if (research.retrievalStatus === "exact_page_accessed" && canonicalUrl) {
        setResearchUrl(canonicalUrl);
      }
      next = {
        ...next,
        sourceVerifiedAt: research.researchedAt.slice(0, 10),
        checkedAt: research.researchedAt,
        sourceUrl:
          research.retrievalStatus === "exact_page_accessed" && canonicalUrl
            ? canonicalUrl
            : next.sourceUrl,
        publishedAt: publishedAtFromResearch(research) ?? next.publishedAt,
        contractType: contractTypeFromResearch(research) || next.contractType,
        salaryBasis: salaryBasisFromResearch(research),
        marketSalaryEstimate:
          marketSalaryEstimateFromResearch(research) || next.marketSalaryEstimate,
        verificationStatus: verificationStatusFromResearch(research),
        contentFingerprint: contentFingerprint({
          employer: next.company,
          title: next.jobTitle,
          location: next.location,
          description: next.jobDescriptionText,
        }),
      };
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

  const setRecommendation = (
    recommendation: ApplicationProcess["recommendation"],
  ) => {
    if (recommendation === "apply" && !applyGate.allowed) {
      toast(applyGate.reasons[0]);
      return;
    }
    if (recommendation === "maybe" && hardExclusionActive) {
      toast("Ein harter Ausschluss lässt nur Skip zu");
      return;
    }
    const next = {
      ...draft,
      recommendation,
      assessment: draft.assessment
        ? {
            ...draft.assessment,
            approvedAt: new Date().toISOString(),
          }
        : null,
    };
    setDraft(next);
    onUpdate(next);
    toast(
      recommendation === "apply"
        ? "Apply bestätigt"
        : recommendation === "maybe"
          ? "Maybe bestätigt"
          : recommendation === "skip"
            ? "Skip bestätigt"
            : "Entscheidung zurückgesetzt",
    );
  };

  return (
    <form className="panel application-detail" onSubmit={save}>
      <header className="application-detail-heading">
        <div>
          <span className="eyebrow">
            {draft.researchRank
              ? `Rechercheplatz ${draft.researchRank}`
              : "Eigener Bewerbungsprozess"}
          </span>
          <h2>{draft.company || "Arbeitgeber ergänzen"}</h2>
          <p>{draft.jobTitle}</p>
        </div>
        <div className="application-heading-badges">
          <span
            className={`role-verification-badge ${draft.verificationStatus}`}
          >
            {ROLE_VERIFICATION_LABELS[draft.verificationStatus]}
          </span>
          <span className={`fit-badge fit-${draft.fitRating.slice(0, 1).toLowerCase() || "open"}`}>
            Passung {draft.fitRating || "offen"}
          </span>
        </div>
      </header>

      <div className="application-action-bar" aria-label="Schnellaktionen zur Vakanz">
        {safePublicUrl(draft.sourceUrl) ? (
          <a href={draft.sourceUrl} rel="noreferrer" target="_blank">
            Ausschreibung öffnen
          </a>
        ) : null}
        <button
          disabled={!generationGate.allowed}
          onClick={() => onOpenStudio(draft)}
          title={generationGate.reasons[0]}
          type="button"
        >
          Unterlagen erstellen
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
            <span className="eyebrow">Stelle</span>
            <h3>Rolle und Konditionen</h3>
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
          <label>
            Veröffentlicht am
            <input
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  publishedAt: event.target.value || null,
                }))
              }
              type="date"
              value={draft.publishedAt ?? ""}
            />
          </label>
          <label>
            Vertragsart
            <input
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  contractType: event.target.value,
                }))
              }
              placeholder="Unbefristet, Vollzeit …"
              value={draft.contractType}
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
            Vergütung oder Spanne
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
            Gehaltsbasis
            <select
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  salaryBasis: event.target.value as ApplicationProcess["salaryBasis"],
                }))
              }
              value={draft.salaryBasis}
            >
              {Object.entries(SALARY_BASIS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="wide">
            Marktspanne · getrennte Schätzung
            <input
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  marketSalaryEstimate: event.target.value,
                }))
              }
              placeholder="Nur als Marktschätzung, nie als veröffentlichte Vergütung"
              value={draft.marketSalaryEstimate}
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
            Link zur Prüfung
            <input
              onChange={(event) => {
                const value = event.target.value;
                setResearchUrl(value);
                setDraft((current) => ({
                  ...current,
                  verificationStatus:
                    safePublicUrl(value) === safePublicUrl(current.sourceUrl) &&
                    current.vacancyResearch
                      ? verificationStatusFromResearch(current.vacancyResearch)
                      : "unverified",
                }));
              }}
              placeholder="Discovery- oder vermuteter Original-Link zur Prüfung"
              type="url"
              value={researchUrl}
            />
          </label>
        </div>
        <div className="application-source-actions">
          <span>
            {draft.checkedAt || draft.sourceVerifiedAt
              ? `Geprüft am ${formatDate(draft.checkedAt || draft.sourceVerifiedAt)}`
              : "Originalanzeige noch nicht geprüft"}
          </span>
          {safePublicUrl(draft.sourceUrl) ? (
            <a href={draft.sourceUrl} rel="noreferrer" target="_blank">
              Ausschreibung öffnen
            </a>
          ) : null}
        </div>
        {draft.discoverySources.length ? (
          <details className="application-discovery-sources">
            <summary>
              Entdeckungsquellen · {draft.discoverySources.length}
            </summary>
            <ul>
              {draft.discoverySources.map((source) => (
                <li key={`${source.provider}-${source.providerJobId}-${source.url}`}>
                  <span>{source.provider}</span>
                  <a href={source.url} rel="noreferrer" target="_blank">
                    {source.sourceKind === "claimed_original"
                      ? "Behaupteten Original-Link prüfen"
                      : "Discovery-Link öffnen"}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {draft.tags.length ? (
          <div className="application-tags" aria-label="Stichworte zur Vakanz">
            {draft.tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        ) : null}
      </div>

      <details className="application-digital-job" open={Boolean(draft.jobDescriptionText)}>
        <summary>
          <span>
            <strong>Stellenbeschreibung</strong>
            <small>Grundlage für Recherche und Unterlagen</small>
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
        sourceUrl={researchUrl}
      />

      <div className="application-detail-section">
        <div className="application-section-heading">
          <div>
            <span className="eyebrow">Stand</span>
            <h3>Nächster Schritt</h3>
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
        {warmPathAvailable ? (
          <details className="application-warm-path">
            <summary>
              <span>
                <strong>LinkedIn-Warm-path</strong>
                <small>Erst nach namentlich belegter Ansprechperson</small>
              </span>
              <b>Privat prüfen</b>
            </summary>
            <div className="application-form-grid">
              <label>
                Person
                <input
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      warmPath: {
                        personName: event.target.value,
                        personRole: current.warmPath?.personRole ?? "",
                        sourceUrl: current.warmPath?.sourceUrl ?? "",
                        publicContext: current.warmPath?.publicContext ?? "",
                        commonContactsNote:
                          current.warmPath?.commonContactsNote ?? "",
                        commonContactsConfirmedAt:
                          current.warmPath?.commonContactsConfirmedAt ?? null,
                      },
                    }))
                  }
                  value={warmPathPerson}
                />
              </label>
              <label>
                Rolle im Unternehmen
                <input
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      warmPath: {
                        personName:
                          current.warmPath?.personName || current.contactPerson,
                        personRole: event.target.value,
                        sourceUrl: current.warmPath?.sourceUrl ?? "",
                        publicContext: current.warmPath?.publicContext ?? "",
                        commonContactsNote:
                          current.warmPath?.commonContactsNote ?? "",
                        commonContactsConfirmedAt:
                          current.warmPath?.commonContactsConfirmedAt ?? null,
                      },
                    }))
                  }
                  value={draft.warmPath?.personRole ?? ""}
                />
              </label>
              <label className="wide">
                Öffentliche Quelle
                <input
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      warmPath: {
                        personName:
                          current.warmPath?.personName || current.contactPerson,
                        personRole: current.warmPath?.personRole ?? "",
                        sourceUrl: event.target.value,
                        publicContext: current.warmPath?.publicContext ?? "",
                        commonContactsNote:
                          current.warmPath?.commonContactsNote ?? "",
                        commonContactsConfirmedAt:
                          current.warmPath?.commonContactsConfirmedAt ?? null,
                      },
                    }))
                  }
                  placeholder="Arbeitgeberseite oder öffentliches Profil"
                  type="url"
                  value={draft.warmPath?.sourceUrl ?? ""}
                />
              </label>
              <label className="wide">
                Belegter Unternehmenskontext
                <textarea
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      warmPath: {
                        personName:
                          current.warmPath?.personName || current.contactPerson,
                        personRole: current.warmPath?.personRole ?? "",
                        sourceUrl: current.warmPath?.sourceUrl ?? "",
                        publicContext: event.target.value,
                        commonContactsNote:
                          current.warmPath?.commonContactsNote ?? "",
                        commonContactsConfirmedAt:
                          current.warmPath?.commonContactsConfirmedAt ?? null,
                      },
                    }))
                  }
                  placeholder="Projekte, Technologien oder Themen – jeweils mit öffentlicher Quelle"
                  rows={3}
                  value={draft.warmPath?.publicContext ?? ""}
                />
              </label>
              <label className="wide">
                Gemeinsame Kontakte · private Notiz
                <textarea
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      warmPath: {
                        personName:
                          current.warmPath?.personName || current.contactPerson,
                        personRole: current.warmPath?.personRole ?? "",
                        sourceUrl: current.warmPath?.sourceUrl ?? "",
                        publicContext: current.warmPath?.publicContext ?? "",
                        commonContactsNote: event.target.value,
                        commonContactsConfirmedAt: null,
                      },
                    }))
                  }
                  placeholder="Nur nach eigener LinkedIn-Prüfung; nie Kandidatenevidenz"
                  rows={2}
                  value={draft.warmPath?.commonContactsNote ?? ""}
                />
              </label>
              <label className="warm-path-confirmation wide">
                <input
                  checked={Boolean(draft.warmPath?.commonContactsConfirmedAt)}
                  disabled={!draft.warmPath?.commonContactsNote.trim()}
                  onChange={(event) =>
                    setDraft((current) =>
                      current.warmPath
                        ? {
                            ...current,
                            warmPath: {
                              ...current.warmPath,
                              commonContactsConfirmedAt: event.target.checked
                                ? new Date().toISOString()
                                : null,
                            },
                          }
                        : current,
                    )
                  }
                  type="checkbox"
                />
                <span>Von mir manuell geprüft und als private Notiz bestätigt</span>
              </label>
            </div>
          </details>
        ) : (
          <p className="application-warm-path-hint">
            Warm-path wird verfügbar, sobald eine namentlich bekannte Person aus
            der Anzeige oder einer offiziellen Arbeitgeberquelle eingetragen ist.
          </p>
        )}
      </div>

      <div className="application-detail-section research-detail">
        <div className="application-section-heading">
          <div>
            <span className="eyebrow">Einschätzung</span>
            <h3>Passung</h3>
          </div>
          <span className={`salary-chip ${salaryClass(draft.salaryOutlook)}`}>
            {SALARY_OUTLOOK_LABELS[draft.salaryOutlook]}
          </span>
        </div>
        <p>{draft.researchSummary || "Noch keine Rechercheeinschätzung hinterlegt."}</p>
        {draft.assessment ? (
          <div className="role-assessment-card">
            <div>
              <span>Beratende Einschätzung</span>
              <strong>
                {draft.assessment.recommendation === "apply"
                  ? "Apply"
                  : draft.assessment.recommendation === "maybe"
                    ? "Maybe"
                    : "Skip"}
              </strong>
              <small>
                {draft.assessment.fitScore === null
                  ? "Fit offen"
                  : `Fit ${draft.assessment.fitScore}/10`}
                {draft.assessment.shortlistChancePercent === null
                  ? ""
                  : ` · Shortlist ${draft.assessment.shortlistChancePercent}%`}
              </small>
            </div>
            <dl>
              {draft.assessment.mainMatch ? (
                <>
                  <dt>Hauptpassung</dt>
                  <dd>{draft.assessment.mainMatch}</dd>
                </>
              ) : null}
              {draft.assessment.mainRisk ? (
                <>
                  <dt>Hauptrisiko</dt>
                  <dd>{draft.assessment.mainRisk}</dd>
                </>
              ) : null}
              {draft.assessment.cvAngle ? (
                <>
                  <dt>CV-Winkel</dt>
                  <dd>{draft.assessment.cvAngle}</dd>
                </>
              ) : null}
            </dl>
            {hardExclusionActive ? (
              <p className="role-assessment-critical">
                Harter Ausschluss: {draft.assessment.hardExclusionMatches.join(" · ")}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="role-recommendation" aria-label="Entscheidung zur Rolle">
          <span>Deine Entscheidung</span>
          <div className="button-group">
            <button
              aria-pressed={draft.recommendation === "apply"}
              disabled={!applyGate.allowed}
              onClick={() => setRecommendation("apply")}
              title={applyGate.reasons[0]}
              type="button"
            >
              Apply
            </button>
            <button
              aria-pressed={draft.recommendation === "maybe"}
              disabled={hardExclusionActive}
              onClick={() => setRecommendation("maybe")}
              title={hardExclusionActive ? "Ein harter Ausschluss erzwingt Skip." : undefined}
              type="button"
            >
              Maybe
            </button>
            <button
              aria-pressed={draft.recommendation === "skip"}
              onClick={() => setRecommendation("skip")}
              type="button"
            >
              Skip
            </button>
          </div>
          {draft.recommendation === "undecided" ? (
            <small>Eine importierte Einschätzung ändert deinen Status nicht.</small>
          ) : null}
        </div>
        {!generationGate.allowed ? (
          <div className="role-generation-gate" role="status">
            <strong>Unterlagen noch gesperrt</strong>
            <ul>
              {generationGate.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="role-generation-ready">Geprüfte Rolle für Unterlagen freigegeben.</p>
        )}
        <details className="application-generation-summary">
          <summary>Für neue Unterlagen verwenden</summary>
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
            <span className="eyebrow">Unterlagen</span>
            <h3>Bewerbungsakte</h3>
          </div>
          <span>{draft.artifacts.length} Unterlagen</span>
        </div>
        {masterCv ? (
          <div className="application-master-reference">
            <span>MASTER-CV</span>
            <p>
              <strong>{masterCv.name}</strong>
              <small>Basis für neue Bewerbungspakete · bleibt unverändert</small>
            </p>
            {masterCvOpenUrl ? (
              <a href={masterCvOpenUrl} rel="noreferrer" target="_blank">
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
            const openUrl = documentOpenUrl(document);
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
            Noch keine Unterlagen verknüpft. Füge Ausschreibung, CV oder
            Anschreiben hinzu.
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
                const openUrl = documentOpenUrl(document);
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
            <summary>Verlauf · {draft.activities.length}</summary>
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
          disabled={!generationGate.allowed}
          onClick={() => onOpenStudio(draft)}
          title={generationGate.reasons[0]}
          type="button"
        >
          Unterlagen erstellen
        </button>
        <button className="button button-primary" type="submit">
          Änderungen speichern
        </button>
      </div>
    </form>
  );
}
