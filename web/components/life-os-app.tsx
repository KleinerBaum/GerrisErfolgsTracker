"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { createDemoState } from "../lib/demo-data";
import {
  formatCurrency,
  formatDate,
  formatDateLong,
  formatRelativeDate,
  formatTime,
  isoDateInput,
} from "../lib/format";
import {
  driveDownloadUrl,
  drivePreviewUrl,
  extractDriveFileId,
  gmailComposeUrl,
  inferDocumentKind,
  paymentCalendarUrl,
} from "../lib/google-links";
import {
  COST_CADENCE_LABELS,
  LIFE_AREA_LABELS,
  QUADRANT_LABELS,
  type AppState,
  type CalendarEvent,
  type CaptureKind,
  type Cost,
  type CostCadence,
  type CostStatus,
  type DocumentRef,
  type IntegrationConfig,
  type LifeArea,
  type Task,
  type TaskQuadrant,
  type ViewKey,
} from "../lib/types";
import { useGerriState } from "../lib/use-gerri-state";

const NAV_ITEMS: Array<{
  key: ViewKey;
  label: string;
  short: string;
  mark: string;
}> = [
  { key: "today", label: "Heute", short: "Heute", mark: "H" },
  { key: "tasks", label: "Aufgaben", short: "Aufgaben", mark: "A" },
  { key: "calendar", label: "Kalender", short: "Kalender", mark: "K" },
  { key: "finance", label: "Finanzen", short: "Kosten", mark: "€" },
  { key: "documents", label: "Unterlagen", short: "Ablage", mark: "U" },
  { key: "journal", label: "Journal", short: "Journal", mark: "J" },
];

const VIEW_TITLES: Record<ViewKey, string> = {
  today: "Heute im Blick",
  tasks: "Aufgaben & Fokus",
  calendar: "Kalender & Erinnerungen",
  finance: "Kosten im Überblick",
  documents: "Wichtige Unterlagen",
  journal: "Journal & Reflexion",
};

const uid = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const dateAtNine = (value: string): string =>
  new Date(`${value}T09:00:00`).toISOString();

const daysFromNow = (value: string): number => {
  const target = new Date(value);
  const today = new Date();
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
};

type LifeOsAppProps = {
  initialState: AppState;
  integrations: IntegrationConfig;
};

export function LifeOsApp({
  initialState,
  integrations,
}: LifeOsAppProps) {
  const [view, setView] = useState<ViewKey>("today");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureKind, setCaptureKind] = useState<CaptureKind>("task");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] =
    useState<DocumentRef | null>(null);
  const [notice, setNotice] = useState("");
  const [externalEvents, setExternalEvents] = useState<CalendarEvent[]>([]);
  const [calendarLive, setCalendarLive] = useState(false);
  const {
    state,
    syncStatus,
    updateState,
    exportBackup,
    importBackup,
  } = useGerriState(initialState);

  useEffect(() => {
    let active = true;
    const loadCalendar = async () => {
      try {
        const response = await fetch("/api/calendar");
        const payload = (await response.json()) as {
          events?: CalendarEvent[];
          source?: string;
        };
        if (!active) return;
        setExternalEvents(Array.isArray(payload.events) ? payload.events : []);
        setCalendarLive(payload.source === "google-ical");
      } catch {
        if (active) setCalendarLive(false);
      }
    };
    void loadCalendar();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setCaptureOpen(false);
      setSettingsOpen(false);
      setSelectedDocument(null);
      setMobileSidebarOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const navigate = (next: ViewKey) => {
    setView(next);
    setMobileSidebarOpen(false);
    window.setTimeout(
      () => document.querySelector<HTMLElement>("main h1")?.focus(),
      0,
    );
  };

  const openCapture = (kind: CaptureKind) => {
    setCaptureKind(kind);
    setCaptureOpen(true);
  };

  const completeTask = (taskId: string) => {
    updateState((current) => ({
      ...current,
      points: current.points + 15,
      tasks: current.tasks.map((task) =>
        task.id === taskId
          ? { ...task, completed: true, progress: 100 }
          : task,
      ),
    }));
    setNotice("Aufgabe erledigt · 15 Punkte gesammelt");
  };

  const markCostPaid = (costId: string) => {
    updateState((current) => ({
      ...current,
      points: current.points + 8,
      costs: current.costs.map((cost) =>
        cost.id === costId ? { ...cost, status: "paid" } : cost,
      ),
    }));
    setNotice("Zahlung als erledigt markiert");
  };

  const saveTask = (task: Task) => {
    updateState((current) => ({
      ...current,
      tasks: [task, ...current.tasks],
    }));
    setNotice("Aufgabe gespeichert");
  };

  const saveCost = (cost: Cost) => {
    updateState((current) => ({
      ...current,
      costs: [cost, ...current.costs],
    }));
    setNotice("Kostenposten gespeichert");
  };

  const saveDocument = (document: DocumentRef) => {
    updateState((current) => ({
      ...current,
      documents: [document, ...current.documents],
    }));
    setNotice("Drive-Unterlage verknüpft");
  };

  const saveJournal = (
    text: string,
    mood: number,
    win: string,
    nextStep: string,
  ) => {
    updateState((current) => ({
      ...current,
      points: current.points + 10,
      journal: [
        {
          id: uid("journal"),
          date: isoDateInput(),
          mood,
          text,
          win,
          nextStep,
        },
        ...current.journal,
      ],
    }));
    setNotice("Reflexion gespeichert · 10 Punkte gesammelt");
  };

  const openDocument = (document: DocumentRef) => {
    setSelectedDocument(document);
  };

  const syncCopy =
    syncStatus === "synchronisiert"
      ? "Privat synchronisiert"
      : syncStatus === "lade"
        ? "Daten werden geladen"
        : syncStatus === "fehler"
          ? "Sync wird wiederholt"
          : "Auf diesem Gerät gespeichert";

  return (
    <div
      className={`app-shell ${sidebarCollapsed ? "sidebar-is-collapsed" : ""}`}
    >
      {mobileSidebarOpen ? (
        <button
          aria-label="Navigation schließen"
          className="mobile-scrim"
          onClick={() => setMobileSidebarOpen(false)}
          type="button"
        />
      ) : null}

      <aside
        aria-label="Navigation und Unterlagen"
        className={`sidebar ${mobileSidebarOpen ? "mobile-open" : ""}`}
      >
        <div className="sidebar-brand">
          <button
            aria-label={
              sidebarCollapsed ? "Seitenleiste ausklappen" : "Seitenleiste einklappen"
            }
            className="brand-button"
            onClick={() => setSidebarCollapsed((current) => !current)}
            type="button"
          >
            <span className="brand-glyph">G</span>
            <span className="brand-copy">
              <strong>Gerris Kompass</strong>
              <small>Ein Ort. Ein klarer nächster Schritt.</small>
            </span>
            <span className="collapse-mark" aria-hidden="true">
              {sidebarCollapsed ? "›" : "‹"}
            </span>
          </button>
        </div>

        <nav className="primary-nav" aria-label="Hauptnavigation">
          {NAV_ITEMS.map((item) => (
            <button
              aria-current={view === item.key ? "page" : undefined}
              className={view === item.key ? "active" : ""}
              key={item.key}
              onClick={() => navigate(item.key)}
              title={item.label}
              type="button"
            >
              <span className="nav-mark">{item.mark}</span>
              <span className="nav-label">{item.label}</span>
              {item.key === "finance" &&
              state.costs.some((cost) => cost.status === "due") ? (
                <span className="nav-alert" aria-label="Offene Zahlungen">
                  {state.costs.filter((cost) => cost.status === "due").length}
                </span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-divider" />

        <DocumentTree
          collapsed={sidebarCollapsed}
          documents={state.documents}
          integrations={integrations}
          onOpen={(document) => {
            navigate("documents");
            openDocument(document);
          }}
        />

        <div className="sidebar-footer">
          <div className="level-block">
            <span>
              Level {Math.floor(state.points / 250) + 1}
              <strong>{state.points.toLocaleString("de-DE")} Punkte</strong>
            </span>
            <div className="level-track">
              <span style={{ width: `${(state.points % 250) / 2.5}%` }} />
            </div>
          </div>
          <button
            className="privacy-button"
            onClick={() => setSettingsOpen(true)}
            title="Einstellungen und Datenschutz"
            type="button"
          >
            <span className="nav-mark">P</span>
            <span className="nav-label">
              <strong>Privater Bereich</strong>
              <small>Nur für dich freigegeben</small>
            </span>
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button
            aria-label="Navigation öffnen"
            className="mobile-menu"
            onClick={() => setMobileSidebarOpen(true)}
            type="button"
          >
            Menü
          </button>
          <div>
            <span className="dayline">
              {formatDateLong(new Date().toISOString())}
            </span>
            <strong>{VIEW_TITLES[view]}</strong>
          </div>
          <div className="topbar-actions">
            <span className={`sync-state sync-${syncStatus}`}>
              <span aria-hidden="true" />
              {syncCopy}
            </span>
            <button
              aria-label="Einstellungen öffnen"
              className="avatar-button"
              onClick={() => setSettingsOpen(true)}
              type="button"
            >
              {state.ownerName.slice(0, 2).toUpperCase()}
            </button>
          </div>
        </header>

        <main id="main-content">
          {view === "today" ? (
            <TodayView
              externalEvents={externalEvents}
              integrations={integrations}
              onCompleteTask={completeTask}
              onNavigate={navigate}
              state={state}
            />
          ) : null}
          {view === "tasks" ? (
            <TasksView
              onCompleteTask={completeTask}
              onNew={() => openCapture("task")}
              state={state}
            />
          ) : null}
          {view === "calendar" ? (
            <CalendarView
              calendarLive={calendarLive}
              externalEvents={externalEvents}
              integrations={integrations}
              state={state}
            />
          ) : null}
          {view === "finance" ? (
            <FinanceView
              integrations={integrations}
              onMarkPaid={markCostPaid}
              onNew={() => openCapture("cost")}
              state={state}
            />
          ) : null}
          {view === "documents" ? (
            <DocumentsView
              integrations={integrations}
              onNew={() => openCapture("document")}
              onOpen={openDocument}
              state={state}
              toast={setNotice}
            />
          ) : null}
          {view === "journal" ? (
            <JournalView
              onSave={saveJournal}
              onNew={() => openCapture("journal")}
              state={state}
            />
          ) : null}
        </main>
      </section>

      <button
        className="quick-capture-button"
        onClick={() => openCapture(view === "finance" ? "cost" : "task")}
        type="button"
      >
        <span>+</span>
        Neu erfassen
      </button>

      <nav className="mobile-nav" aria-label="Mobile Hauptnavigation">
        {NAV_ITEMS.map((item) => (
          <button
            aria-current={view === item.key ? "page" : undefined}
            className={view === item.key ? "active" : ""}
            key={item.key}
            onClick={() => navigate(item.key)}
            type="button"
          >
            <span>{item.mark}</span>
            {item.short}
          </button>
        ))}
      </nav>

      {captureOpen ? (
        <CaptureDialog
          initialKind={captureKind}
          integrations={integrations}
          onClose={() => setCaptureOpen(false)}
          onSaveCost={saveCost}
          onSaveDocument={saveDocument}
          onSaveJournal={saveJournal}
          onSaveTask={saveTask}
        />
      ) : null}

      {selectedDocument ? (
        <DocumentViewer
          document={selectedDocument}
          onClose={() => setSelectedDocument(null)}
        />
      ) : null}

      {settingsOpen ? (
        <SettingsDialog
          integrations={integrations}
          onClose={() => setSettingsOpen(false)}
          onExport={exportBackup}
          onImport={(raw) => {
            try {
              importBackup(raw);
              setNotice("Backup erfolgreich importiert");
            } catch {
              setNotice("Dieses Backup konnte nicht gelesen werden");
            }
          }}
          onReset={() => {
            const confirmed = window.confirm(
              "Beispieldaten wirklich zurücksetzen? Dein aktueller Stand wird ersetzt.",
            );
            if (!confirmed) return;
            const reset = createDemoState(state.ownerName);
            updateState(() => reset);
            setNotice("Beispieldaten zurückgesetzt");
          }}
          syncCopy={syncCopy}
        />
      ) : null}

      {notice ? (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button
            aria-label="Hinweis schließen"
            onClick={() => setNotice("")}
            type="button"
          >
            Schließen
          </button>
        </div>
      ) : null}
    </div>
  );
}

type DocumentTreeProps = {
  collapsed: boolean;
  documents: DocumentRef[];
  integrations: IntegrationConfig;
  onOpen: (document: DocumentRef) => void;
};

function DocumentTree({
  collapsed,
  documents,
  integrations,
  onOpen,
}: DocumentTreeProps) {
  const groups = useMemo(() => {
    const result = new Map<string, DocumentRef[]>();
    documents
      .filter((document) => document.kind !== "folder")
      .forEach((document) => {
        const parts = document.folderPath.split("/");
        const key = parts.slice(1, 3).join(" / ") || "Allgemein";
        result.set(key, [...(result.get(key) ?? []), document]);
      });
    return [...result.entries()];
  }, [documents]);

  if (collapsed) {
    return (
      <button
        className="collapsed-files-button"
        onClick={() => window.open(integrations.driveFolderUrl, "_blank", "noopener")}
        title="Persönlichen Drive-Ordner öffnen"
        type="button"
      >
        <span className="nav-mark">D</span>
      </button>
    );
  }

  return (
    <section className="folder-tree" aria-labelledby="folder-tree-title">
      <div className="tree-heading">
        <span id="folder-tree-title">Wichtige Unterlagen</span>
        <a
          href={integrations.driveFolderUrl}
          rel="noreferrer"
          target="_blank"
          title="Google Drive öffnen"
        >
          Drive
        </a>
      </div>
      <details open>
        <summary>
          <span className="folder-mark">▾</span>
          Meine Ablage
        </summary>
        <div className="tree-branch">
          <details open>
            <summary>
              <span className="folder-mark">▾</span>
              Persönlich
            </summary>
            <div className="tree-branch">
              {groups.map(([name, items]) => (
                <details key={name}>
                  <summary>
                    <span className="folder-mark">›</span>
                    {name}
                    <small>{items.length}</small>
                  </summary>
                  <div className="tree-files">
                    {items.map((document) => (
                      <button
                        key={document.id}
                        onClick={() => onOpen(document)}
                        type="button"
                      >
                        <span>{document.kind === "pdf" ? "PDF" : "DOC"}</span>
                        {document.name}
                      </button>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </details>
        </div>
      </details>
    </section>
  );
}

type TodayViewProps = {
  state: AppState;
  externalEvents: CalendarEvent[];
  integrations: IntegrationConfig;
  onCompleteTask: (taskId: string) => void;
  onNavigate: (view: ViewKey) => void;
};

function TodayView({
  state,
  externalEvents,
  integrations,
  onCompleteTask,
  onNavigate,
}: TodayViewProps) {
  const [now] = useState(() => Date.now());
  const openTasks = state.tasks.filter((task) => !task.completed);
  const focusTasks = openTasks
    .filter((task) => task.quadrant === "do" || task.quadrant === "plan")
    .sort((left, right) =>
      (left.dueAt ?? "9999").localeCompare(right.dueAt ?? "9999"),
    )
    .slice(0, 3);
  const upcomingCosts = state.costs
    .filter(
      (cost) =>
        cost.status !== "paid" &&
        daysFromNow(cost.dueAt) >= 0 &&
        daysFromNow(cost.dueAt) <= 14,
    )
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt));
  const paidThisMonth = state.costs
    .filter(
      (cost) =>
        cost.status === "paid" &&
        new Date(cost.dueAt).getMonth() === new Date().getMonth(),
    )
    .reduce((sum, cost) => sum + cost.amount, 0);
  const nextEvents = [...externalEvents, ...state.calendarEvents]
    .filter((event) => new Date(event.endAt).getTime() >= now)
    .sort((left, right) => left.startAt.localeCompare(right.startAt))
    .slice(0, 3);
  const focusMinutes = focusTasks.reduce(
    (sum, task) => sum + task.estimateMinutes,
    0,
  );

  return (
    <div className="view-stack">
      <section className="welcome-grid">
        <div className="welcome-copy">
          <span className="eyebrow">Guten Tag, {state.ownerName}</span>
          <h1 tabIndex={-1}>Ein klarer Tag beginnt mit dem nächsten Schritt.</h1>
          <p>
            {focusTasks.length
              ? `${focusTasks.length} sinnvolle Aufgaben, etwa ${focusMinutes} Minuten Fokus und ${upcomingCosts.length} anstehende Zahlungen sind für dich vorbereitet.`
              : "Heute ist Raum für einen ruhigen Neustart. Erfasse genau einen nächsten Schritt."}
          </p>
          <div className="welcome-actions">
            <button
              className="button button-primary"
              onClick={() => onNavigate("tasks")}
              type="button"
            >
              Fokus öffnen
            </button>
            <button
              className="button button-soft"
              onClick={() => onNavigate("calendar")}
              type="button"
            >
              Tag ansehen
            </button>
          </div>
        </div>
        <div className="coach-card">
          <span className="coach-label">Gerri Coach</span>
          <blockquote>
            „Nicht alles heute. Aber das Richtige als Nächstes.“
          </blockquote>
          <p>
            Beginne mit „{focusTasks[0]?.title ?? "einem kleinen Schritt"}“. Danach
            darfst du neu entscheiden.
          </p>
          <div className="rhythm-row">
            <span>{state.rhythmDays}/7 Tage im Rhythmus</span>
            <div>
              {Array.from({ length: 7 }, (_, index) => (
                <i
                  className={index < state.rhythmDays ? "done" : ""}
                  key={index}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="metric-grid" aria-label="Tagesüberblick">
        <Metric
          label="Offene Aufgaben"
          note={`${focusTasks.length} im Fokus`}
          tone="green"
          value={String(openTasks.length)}
        />
        <Metric
          label="Nächste 14 Tage"
          note={`${upcomingCosts.length} Zahlungen`}
          tone="amber"
          value={formatCurrency(
            upcomingCosts.reduce((sum, cost) => sum + cost.amount, 0),
          )}
        />
        <Metric
          label="Diesen Monat bezahlt"
          note="Fortschritt dokumentiert"
          tone="blue"
          value={formatCurrency(paidThisMonth)}
        />
        <Metric
          label="Tagesrhythmus"
          note="Jeder kleine Schritt zählt"
          tone="violet"
          value={`${state.rhythmDays}/7`}
        />
      </section>

      <div className="content-grid two-one">
        <section className="panel" aria-labelledby="focus-title">
          <PanelHeading
            eyebrow="Jetzt wichtig"
            title="Deine Fokusliste"
            action={
              <button onClick={() => onNavigate("tasks")} type="button">
                Alle Aufgaben
              </button>
            }
          />
          <div className="focus-list">
            {focusTasks.map((task, index) => (
              <article className="focus-row" key={task.id}>
                <button
                  aria-label={`${task.title} erledigen`}
                  className="complete-control"
                  onClick={() => onCompleteTask(task.id)}
                  type="button"
                >
                  {index + 1}
                </button>
                <div>
                  <strong>{task.title}</strong>
                  <span>
                    {LIFE_AREA_LABELS[task.area]} ·{" "}
                    {task.dueAt ? formatRelativeDate(task.dueAt) : "Ohne Frist"} ·{" "}
                    {task.estimateMinutes} Min.
                  </span>
                </div>
                <div
                  aria-label={`${task.progress} Prozent Fortschritt`}
                  className="task-progress"
                >
                  <span style={{ width: `${task.progress}%` }} />
                </div>
              </article>
            ))}
            {!focusTasks.length ? (
              <EmptyState
                copy="Deine Fokusliste ist frei. Plane einen kleinen nächsten Schritt."
                title="Heute ist Platz."
              />
            ) : null}
          </div>
        </section>

        <section className="panel" aria-labelledby="payments-title">
          <PanelHeading
            eyebrow="Privat"
            title="Zahlungen im Blick"
            action={
              <button onClick={() => onNavigate("finance")} type="button">
                Finanzen
              </button>
            }
          />
          <div className="payment-mini-list">
            {upcomingCosts.slice(0, 4).map((cost) => (
              <article key={cost.id}>
                <span
                  className={
                    cost.status === "due" ? "status-dot urgent" : "status-dot"
                  }
                />
                <div>
                  <strong>{cost.title}</strong>
                  <small>{formatRelativeDate(cost.dueAt)}</small>
                </div>
                <b>{formatCurrency(cost.amount)}</b>
              </article>
            ))}
            {!upcomingCosts.length ? (
              <p className="quiet-copy">Keine Zahlungen in den nächsten 14 Tagen.</p>
            ) : null}
          </div>
        </section>
      </div>

      <div className="content-grid equal">
        <section className="panel" aria-labelledby="agenda-title">
          <PanelHeading
            eyebrow="Zeit"
            title="Deine nächste Agenda"
            action={
              <button onClick={() => onNavigate("calendar")} type="button">
                Kalender
              </button>
            }
          />
          <div className="timeline-list">
            {nextEvents.map((event) => (
              <article key={event.id}>
                <time dateTime={event.startAt}>
                  {formatTime(event.startAt)}
                </time>
                <span />
                <div>
                  <strong>{event.title}</strong>
                  <small>
                    {formatRelativeDate(event.startAt)} ·{" "}
                    {event.source === "google" ? "Google Kalender" : "Kompass"}
                  </small>
                </div>
              </article>
            ))}
            {!nextEvents.length ? (
              <p className="quiet-copy">Dein nächster Termin erscheint hier.</p>
            ) : null}
          </div>
        </section>

        <section className="panel integration-overview" aria-labelledby="sources-title">
          <PanelHeading eyebrow="Verbunden" title="Deine Quellen" />
          <IntegrationRow
            action="Öffnen"
            detail="Persönlich · Dateien bleiben in Drive"
            href={integrations.driveFolderUrl}
            label="Google Drive"
            status="verknüpft"
          />
          <IntegrationRow
            action="Ansehen"
            detail={integrations.calendarId}
            href={integrations.calendarEmbedUrl}
            label="Google Kalender"
            status={externalEvents.length ? "aktuell" : "bereit"}
          />
          <IntegrationRow
            action="Postfach"
            detail={integrations.gmailAccount}
            href={`https://mail.google.com/mail/u/${encodeURIComponent(integrations.gmailAccount)}/#inbox`}
            label="Gmail"
            status="direkt"
          />
        </section>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: string;
}) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function PanelHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="panel-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {action ? <div className="panel-action">{action}</div> : null}
    </header>
  );
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  );
}

function IntegrationRow({
  label,
  detail,
  status,
  action,
  href,
}: {
  label: string;
  detail: string;
  status: string;
  action: string;
  href: string;
}) {
  return (
    <article className="integration-row">
      <span className="integration-initial">{label.slice(0, 1)}</span>
      <div>
        <strong>{label}</strong>
        <small>{detail}</small>
      </div>
      <span className="status-chip">{status}</span>
      <a href={href} rel="noreferrer" target="_blank">
        {action}
      </a>
    </article>
  );
}

function TasksView({
  state,
  onCompleteTask,
  onNew,
}: {
  state: AppState;
  onCompleteTask: (taskId: string) => void;
  onNew: () => void;
}) {
  const [filter, setFilter] = useState<TaskQuadrant | "all">("all");
  const visible = state.tasks.filter(
    (task) => !task.completed && (filter === "all" || task.quadrant === filter),
  );

  return (
    <div className="view-stack">
      <PageIntro
        action={
          <button className="button button-primary" onClick={onNew} type="button">
            Aufgabe erfassen
          </button>
        }
        eyebrow="Fokus statt Überforderung"
        title="Was ist der sinnvollste nächste Schritt?"
        copy="Aufgaben werden nach Wirkung und Dringlichkeit sortiert. Erledigen aktualisiert Fortschritt und Rhythmus automatisch."
      />

      <div className="filter-row" role="group" aria-label="Aufgaben filtern">
        <button
          className={filter === "all" ? "active" : ""}
          onClick={() => setFilter("all")}
          type="button"
        >
          Alle offenen
        </button>
        {(Object.keys(QUADRANT_LABELS) as TaskQuadrant[]).map((quadrant) => (
          <button
            className={filter === quadrant ? "active" : ""}
            key={quadrant}
            onClick={() => setFilter(quadrant)}
            type="button"
          >
            {QUADRANT_LABELS[quadrant]}
          </button>
        ))}
      </div>

      <section className="task-board" aria-label="Eisenhower-Aufgaben">
        {(filter === "all"
          ? (Object.keys(QUADRANT_LABELS) as TaskQuadrant[])
          : [filter]
        ).map((quadrant) => {
          const tasks = visible.filter((task) => task.quadrant === quadrant);
          return (
            <div className={`task-column quadrant-${quadrant}`} key={quadrant}>
              <header>
                <div>
                  <span>{QUADRANT_LABELS[quadrant]}</span>
                  <small>
                    {quadrant === "do"
                      ? "Wichtig und dringend"
                      : quadrant === "plan"
                        ? "Wichtig, bewusst terminieren"
                        : quadrant === "delegate"
                          ? "Andere einbeziehen"
                          : "Bewusst nicht tun"}
                  </small>
                </div>
                <b>{tasks.length}</b>
              </header>
              <div className="task-card-list">
                {tasks.map((task) => (
                  <article className="task-card" key={task.id}>
                    <div className="task-card-top">
                      <span>{LIFE_AREA_LABELS[task.area]}</span>
                      {task.confidential ? <small>Privat</small> : null}
                    </div>
                    <h3>{task.title}</h3>
                    <p>
                      {task.dueAt ? formatRelativeDate(task.dueAt) : "Ohne Frist"} ·{" "}
                      {task.estimateMinutes} Minuten
                    </p>
                    <div className="task-progress labeled">
                      <span style={{ width: `${task.progress}%` }} />
                      <small>{task.progress}%</small>
                    </div>
                    <button
                      className="button button-soft button-full"
                      onClick={() => onCompleteTask(task.id)}
                      type="button"
                    >
                      Als erledigt markieren
                    </button>
                  </article>
                ))}
                {!tasks.length ? (
                  <EmptyState
                    copy="Hier ist gerade nichts offen."
                    title="Dieser Bereich ist frei."
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </section>

      <section className="panel completed-panel">
        <PanelHeading
          eyebrow="Fortschritt"
          title={`${state.tasks.filter((task) => task.completed).length} erledigte Aufgaben`}
        />
        <p>
          Erledigte Aufgaben bleiben im Verlauf erhalten und fließen in deinen
          Rhythmus ein.
        </p>
      </section>
    </div>
  );
}

function CalendarView({
  state,
  externalEvents,
  integrations,
  calendarLive,
}: {
  state: AppState;
  externalEvents: CalendarEvent[];
  integrations: IntegrationConfig;
  calendarLive: boolean;
}) {
  const [embedOpen, setEmbedOpen] = useState(false);
  const [now] = useState(() => Date.now());
  const events = [...externalEvents, ...state.calendarEvents]
    .filter((event) => new Date(event.endAt).getTime() >= now - 86_400_000)
    .sort((left, right) => left.startAt.localeCompare(right.startAt));
  const upcomingCosts = state.costs
    .filter((cost) => cost.status !== "paid" && daysFromNow(cost.dueAt) >= 0)
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt))
    .slice(0, 5);

  return (
    <div className="view-stack">
      <PageIntro
        eyebrow="Termine und private Erinnerungen"
        title="Zeit sehen, ohne den Überblick zu verlieren."
        copy="Google Kalender liefert deine Termine. Zahlungserinnerungen bleiben im privaten Kompass und werden erst nach deiner Bestätigung an Google übergeben."
        action={
          <a
            className="button button-soft"
            href={integrations.calendarEmbedUrl}
            rel="noreferrer"
            target="_blank"
          >
            Google Kalender öffnen
          </a>
        }
      />

      <section className="calendar-status-grid" aria-label="Kalenderstatus">
        <Metric
          label="Nächster Termin"
          note={events[0] ? formatRelativeDate(events[0].startAt) : "Keine Termine"}
          tone="green"
          value={events[0] ? formatTime(events[0].startAt) : "Frei"}
        />
        <Metric
          label="Zahlungserinnerungen"
          note="Maximal vertraulich"
          tone="amber"
          value={String(upcomingCosts.length)}
        />
        <Metric
          label="Google-Abgleich"
          note={calendarLive ? "iCal-Lesezugriff aktiv" : "Embed ist verfügbar"}
          tone="blue"
          value={calendarLive ? "Aktuell" : "Bereit"}
        />
      </section>

      <div className="content-grid calendar-layout">
        <section className="panel agenda-panel">
          <PanelHeading
            eyebrow="Agenda"
            title="Kommende Termine"
            action={<span className="private-chip">Nur für dich</span>}
          />
          <div className="agenda-list">
            {events.slice(0, 10).map((event) => (
              <article key={event.id}>
                <div className="agenda-day">
                  <span>{formatRelativeDate(event.startAt)}</span>
                  <strong>{formatTime(event.startAt)}</strong>
                </div>
                <div className={`agenda-line event-${event.kind}`} />
                <div className="agenda-copy">
                  <span>
                    {event.source === "google" ? "Google Kalender" : "Kompass"} ·{" "}
                    {event.private ? "Privat" : "Standard"}
                  </span>
                  <h3>{event.title}</h3>
                  <p>
                    {formatTime(event.startAt)}–{formatTime(event.endAt)}
                  </p>
                </div>
              </article>
            ))}
            {!events.length ? (
              <EmptyState
                title="Kein Termin drängt."
                copy="Öffne die Google-Ansicht oder plane einen Fokusblock."
              />
            ) : null}
          </div>
        </section>

        <section className="panel reminder-panel">
          <PanelHeading eyebrow="Privat" title="Zahlungen einplanen" />
          <div className="confidential-note">
            <strong>Maximaler Vertraulichkeitsfaktor</strong>
            <p>
              Beträge und Zahlungsdetails werden hier gespeichert. Der
              Kalender-Link öffnet nur einen Entwurf; prüfe dort vor dem Speichern
              die Sichtbarkeit „Privat“.
            </p>
          </div>
          <div className="reminder-list">
            {upcomingCosts.map((cost) => (
              <article key={cost.id}>
                <div>
                  <span>{formatRelativeDate(cost.dueAt)}</span>
                  <strong>{cost.title}</strong>
                  <small>{formatCurrency(cost.amount)}</small>
                </div>
                <a
                  href={paymentCalendarUrl(cost)}
                  rel="noreferrer"
                  target="_blank"
                >
                  In Kalender vorbereiten
                </a>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="panel embed-panel">
        <div className="embed-heading">
          <div>
            <span className="eyebrow">Google Kalender</span>
            <h2>Eingebettete Monatsansicht</h2>
            <p>
              Diese Ansicht wird direkt von Google geladen und ist standardmäßig
              geschlossen.
            </p>
          </div>
          <button
            className="button button-soft"
            onClick={() => setEmbedOpen((current) => !current)}
            type="button"
          >
            {embedOpen ? "Ansicht schließen" : "Ansicht laden"}
          </button>
        </div>
        {embedOpen ? (
          <div className="calendar-embed-wrap">
            <iframe
              loading="lazy"
              src={integrations.calendarEmbedUrl}
              title="Google Kalender von Gerri"
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}

function FinanceView({
  state,
  integrations,
  onMarkPaid,
  onNew,
}: {
  state: AppState;
  integrations: IntegrationConfig;
  onMarkPaid: (costId: string) => void;
  onNew: () => void;
}) {
  const [filter, setFilter] = useState<CostStatus | "all">("all");
  const [query, setQuery] = useState("");
  const visible = state.costs
    .filter((cost) => filter === "all" || cost.status === filter)
    .filter((cost) =>
      `${cost.title} ${cost.category} ${cost.payee}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((left, right) => right.dueAt.localeCompare(left.dueAt));
  const paid = state.costs
    .filter(
      (cost) =>
        cost.status === "paid" &&
        new Date(cost.dueAt).getMonth() === new Date().getMonth(),
    )
    .reduce((sum, cost) => sum + cost.amount, 0);
  const planned = state.costs
    .filter((cost) => cost.status !== "paid")
    .reduce((sum, cost) => sum + cost.amount, 0);
  const fixedMonthly = state.costs
    .filter((cost) => cost.cadence === "monthly")
    .reduce((sum, cost) => sum + cost.amount, 0);
  const budgetLeft = Math.max(0, state.monthlyBudget - paid);
  const categories = useMemo(() => {
    const totals = new Map<string, number>();
    state.costs
      .filter((cost) => cost.status === "paid")
      .forEach((cost) =>
        totals.set(cost.category, (totals.get(cost.category) ?? 0) + cost.amount),
      );
    const max = Math.max(...totals.values(), 1);
    return [...totals.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([name, value]) => ({ name, value, width: (value / max) * 100 }));
  }, [state.costs]);

  return (
    <div className="view-stack">
      <PageIntro
        eyebrow="Vergangenheit, Gegenwart und Planung"
        title="Dein Geld, ruhig und nachvollziehbar."
        copy="Einmal erfassen, überall wiederfinden: vergangene Ausgaben, laufende Fixkosten und geplante Zahlungen greifen direkt mit Erinnerungen und Kalender zusammen."
        action={
          <button className="button button-primary" onClick={onNew} type="button">
            Kosten erfassen
          </button>
        }
      />

      <section className="metric-grid">
        <Metric
          label="Diesen Monat bezahlt"
          note={`${Math.round((paid / state.monthlyBudget) * 100)} % deines Budgets`}
          tone="green"
          value={formatCurrency(paid)}
        />
        <Metric
          label="Noch eingeplant"
          note="Alle offenen und geplanten Posten"
          tone="amber"
          value={formatCurrency(planned)}
        />
        <Metric
          label="Monatliche Fixkosten"
          note={`${state.costs.filter((cost) => cost.cadence === "monthly").length} laufende Posten`}
          tone="blue"
          value={formatCurrency(fixedMonthly)}
        />
        <Metric
          label="Budget verfügbar"
          note={`von ${formatCurrency(state.monthlyBudget)}`}
          tone="violet"
          value={formatCurrency(budgetLeft)}
        />
      </section>

      <div className="content-grid finance-insights">
        <section className="panel budget-panel">
          <PanelHeading eyebrow="Monatsrahmen" title="Budgetverlauf" />
          <div className="budget-visual">
            <div className="budget-ring">
              <strong>{Math.min(100, Math.round((paid / state.monthlyBudget) * 100))}%</strong>
              <span>genutzt</span>
            </div>
            <div>
              <strong>{formatCurrency(budgetLeft)}</strong>
              <span>noch verfügbar</span>
              <div className="budget-track">
                <span
                  style={{
                    width: `${Math.min(100, (paid / state.monthlyBudget) * 100)}%`,
                  }}
                />
              </div>
              <small>
                Budget lässt sich im nächsten Ausbau individuell je Kategorie
                steuern.
              </small>
            </div>
          </div>
        </section>
        <section className="panel category-panel">
          <PanelHeading eyebrow="Verteilung" title="Bezahlte Kosten nach Bereich" />
          <div className="category-bars">
            {categories.map((category) => (
              <div key={category.name}>
                <span>{category.name}</span>
                <div>
                  <i style={{ width: `${category.width}%` }} />
                </div>
                <strong>{formatCurrency(category.value)}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel cost-table-panel">
        <div className="table-toolbar">
          <div>
            <span className="eyebrow">Kostenbuch</span>
            <h2>Alle Posten</h2>
          </div>
          <label className="search-field">
            <span className="visually-hidden">Kosten durchsuchen</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Kosten durchsuchen"
              type="search"
              value={query}
            />
          </label>
        </div>
        <div className="filter-row compact" role="group" aria-label="Kosten filtern">
          {(
            [
              ["all", "Alle"],
              ["paid", "Bezahlt"],
              ["due", "Offen"],
              ["planned", "Geplant"],
            ] as const
          ).map(([key, label]) => (
            <button
              className={filter === key ? "active" : ""}
              key={key}
              onClick={() => setFilter(key)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="cost-table" role="table" aria-label="Kostenübersicht">
          <div className="cost-head" role="row">
            <span>Posten</span>
            <span>Fälligkeit</span>
            <span>Rhythmus</span>
            <span>Status</span>
            <span>Betrag</span>
            <span>Aktion</span>
          </div>
          {visible.map((cost) => (
            <article className="cost-row" key={cost.id} role="row">
              <div>
                <strong>{cost.title}</strong>
                <small>
                  {cost.category} · {cost.payee || "Kein Empfänger"}
                </small>
              </div>
              <span data-label="Fälligkeit">{formatDate(cost.dueAt)}</span>
              <span data-label="Rhythmus">
                {COST_CADENCE_LABELS[cost.cadence]}
              </span>
              <span data-label="Status">
                <i className={`cost-status status-${cost.status}`}>
                  {cost.status === "paid"
                    ? "Bezahlt"
                    : cost.status === "due"
                      ? "Offen"
                      : "Geplant"}
                </i>
              </span>
              <strong data-label="Betrag">{formatCurrency(cost.amount)}</strong>
              <div className="row-actions">
                {cost.status !== "paid" ? (
                  <button onClick={() => onMarkPaid(cost.id)} type="button">
                    Erledigt
                  </button>
                ) : null}
                {cost.status !== "paid" ? (
                  <a
                    href={paymentCalendarUrl(cost)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Kalender
                  </a>
                ) : null}
                {cost.contactEmail ? (
                  <a
                    href={gmailComposeUrl(cost, integrations.gmailAccount)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Gmail
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function DocumentsView({
  state,
  integrations,
  onOpen,
  onNew,
  toast,
}: {
  state: AppState;
  integrations: IntegrationConfig;
  onOpen: (document: DocumentRef) => void;
  onNew: () => void;
  toast: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("Alle");
  const folderNames = [
    "Alle",
    ...new Set(
      state.documents
        .filter((document) => document.kind !== "folder")
        .map((document) => document.folderPath.split("/").slice(1, 3).join(" / ")),
    ),
  ];
  const visible = state.documents.filter((document) => {
    const matchesQuery = `${document.name} ${document.folderPath} ${document.tags.join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase());
    const matchesFolder =
      folder === "Alle" || document.folderPath.includes(folder);
    return matchesQuery && matchesFolder;
  });

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(integrations.driveLocalPath);
      toast("Lokalen Drive-Pfad kopiert");
    } catch {
      toast(integrations.driveLocalPath);
    }
  };

  return (
    <div className="view-stack">
      <PageIntro
        eyebrow="Google Drive · Meine Ablage"
        title="Wichtige Unterlagen – lesbar, sortiert, griffbereit."
        copy="Die Dateien bleiben in deinem Google Drive. Im Kompass werden nur Verweise und Ordnungsinformationen gespeichert; Downloads kommen direkt von Google."
        action={
          <div className="button-group">
            <a
              className="button button-soft"
              href={integrations.driveFolderUrl}
              rel="noreferrer"
              target="_blank"
            >
              Drive-Ordner öffnen
            </a>
            <button className="button button-primary" onClick={onNew} type="button">
              Unterlage verknüpfen
            </button>
          </div>
        }
      />

      <section className="drive-location-bar" aria-label="Drive-Speicherorte">
        <div>
          <span className="integration-initial">G</span>
          <p>
            <strong>Online auf allen Geräten</strong>
            <small>Google Drive · Ordner „Persönlich“</small>
          </p>
          <a
            href={integrations.driveFolderUrl}
            rel="noreferrer"
            target="_blank"
          >
            Öffnen
          </a>
        </div>
        <div>
          <span className="integration-initial">PC</span>
          <p>
            <strong>Drive für Desktop</strong>
            <small>{integrations.driveLocalPath}</small>
          </p>
          <button onClick={copyPath} type="button">
            Pfad kopieren
          </button>
        </div>
      </section>

      <div className="document-toolbar">
        <label className="search-field wide">
          <span className="visually-hidden">Unterlagen durchsuchen</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Unterlagen, Ordner oder Schlagwort suchen"
            type="search"
            value={query}
          />
        </label>
        <select
          aria-label="Ordner auswählen"
          onChange={(event) => setFolder(event.target.value)}
          value={folder}
        >
          {folderNames.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </div>

      <section className="document-grid" aria-label="Unterlagen">
        {visible.map((document) => {
          const preview = drivePreviewUrl(document.driveUrl, document.fileId);
          return (
            <article className="document-card" key={document.id}>
              <div className={`document-kind kind-${document.kind}`}>
                {document.kind === "folder"
                  ? "ORDNER"
                  : document.kind === "sheet"
                    ? "TABELLE"
                    : document.kind === "document"
                      ? "DOK"
                      : "PDF"}
              </div>
              <div>
                <span className="eyebrow">
                  {document.folderPath.split("/").slice(-2).join(" / ")}
                </span>
                <h3>{document.name}</h3>
                <p>
                  Geändert {formatRelativeDate(document.modifiedAt)} ·{" "}
                  {document.tags.join(" · ")}
                </p>
              </div>
              <span className="private-chip">Privat</span>
              <div className="document-actions">
                <button onClick={() => onOpen(document)} type="button">
                  {preview ? "A4-Ansicht" : "Details"}
                </button>
                <a
                  href={document.driveUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  In Drive
                </a>
                <a
                  href={driveDownloadUrl(document.driveUrl, document.fileId)}
                  rel="noreferrer"
                  target="_blank"
                >
                  Download
                </a>
              </div>
            </article>
          );
        })}
      </section>

      <section className="a4-explainer">
        <div className="a4-mini">
          <span>DIN A4</span>
        </div>
        <div>
          <span className="eyebrow">Optimierte Vorschau</span>
          <h2>Lesbar auf Handy und PC</h2>
          <p>
            Verknüpfte Drive-Dateien öffnen in einer zentrierten A4-Fläche.
            Zoomen, Scrollen und Download bleiben über die Google-Vorschau
            verfügbar.
          </p>
        </div>
        <button className="button button-soft" onClick={onNew} type="button">
          Drive-Datei hinzufügen
        </button>
      </section>
    </div>
  );
}

function JournalView({
  state,
  onSave,
  onNew,
}: {
  state: AppState;
  onSave: (text: string, mood: number, win: string, nextStep: string) => void;
  onNew: () => void;
}) {
  const [text, setText] = useState("");
  const [win, setWin] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [mood, setMood] = useState(3);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim() && !win.trim()) return;
    onSave(text.trim(), mood, win.trim(), nextStep.trim());
    setText("");
    setWin("");
    setNextStep("");
    setMood(3);
  };

  return (
    <div className="view-stack">
      <PageIntro
        eyebrow="Kurz innehalten"
        title="Reflexion, die deinen Alltag leichter macht."
        copy="Ein paar ehrliche Sätze reichen. Erfolge, Stimmung und nächster Schritt bleiben privat und geben deinem Coach hilfreichen Kontext."
        action={
          <button className="button button-soft" onClick={onNew} type="button">
            Kompakt erfassen
          </button>
        }
      />
      <div className="content-grid journal-layout">
        <form className="panel journal-form" onSubmit={submit}>
          <PanelHeading eyebrow="Heute" title="Wie war dein Tag?" />
          <fieldset className="mood-field">
            <legend>Wie fühlst du dich?</legend>
            <div>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  aria-pressed={mood === value}
                  className={mood === value ? "active" : ""}
                  key={value}
                  onClick={() => setMood(value)}
                  type="button"
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>
          <label>
            Was beschäftigt dich?
            <textarea
              onChange={(event) => setText(event.target.value)}
              placeholder="Ein Gedanke, ein Gefühl oder eine Beobachtung …"
              rows={5}
              value={text}
            />
          </label>
          <label>
            Was ist heute gelungen?
            <input
              onChange={(event) => setWin(event.target.value)}
              placeholder="Auch ein kleiner Schritt zählt."
              value={win}
            />
          </label>
          <label>
            Was ist morgen der nächste gute Schritt?
            <input
              onChange={(event) => setNextStep(event.target.value)}
              placeholder="Klein, konkret und machbar."
              value={nextStep}
            />
          </label>
          <button
            className="button button-primary button-full"
            disabled={!text.trim() && !win.trim()}
            type="submit"
          >
            Reflexion speichern
          </button>
        </form>

        <section className="panel journal-history">
          <PanelHeading
            eyebrow="Verlauf"
            title={`${state.journal.length} Einträge`}
          />
          <div>
            {state.journal.map((entry) => (
              <article key={entry.id}>
                <div>
                  <time dateTime={entry.date}>{formatDate(entry.date)}</time>
                  <span>Stimmung {entry.mood}/5</span>
                </div>
                {entry.text ? <p>{entry.text}</p> : null}
                {entry.win ? (
                  <blockquote>
                    <strong>Gelungen:</strong> {entry.win}
                  </blockquote>
                ) : null}
                {entry.nextStep ? (
                  <small>Nächster Schritt: {entry.nextStep}</small>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function PageIntro({
  eyebrow,
  title,
  copy,
  action,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="page-intro">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1 tabIndex={-1}>{title}</h1>
        <p>{copy}</p>
      </div>
      {action ? <div className="page-intro-action">{action}</div> : null}
    </header>
  );
}

type CaptureDialogProps = {
  initialKind: CaptureKind;
  integrations: IntegrationConfig;
  onClose: () => void;
  onSaveTask: (task: Task) => void;
  onSaveCost: (cost: Cost) => void;
  onSaveDocument: (document: DocumentRef) => void;
  onSaveJournal: (
    text: string,
    mood: number,
    win: string,
    nextStep: string,
  ) => void;
};

function CaptureDialog({
  initialKind,
  integrations,
  onClose,
  onSaveTask,
  onSaveCost,
  onSaveDocument,
  onSaveJournal,
}: CaptureDialogProps) {
  const [kind, setKind] = useState<CaptureKind>(initialKind);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(isoDateInput());
  const [area, setArea] = useState<LifeArea>("persoenlich");
  const [quadrant, setQuadrant] = useState<TaskQuadrant>("do");
  const [minutes, setMinutes] = useState(20);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<Cost["category"]>("Alltag");
  const [cadence, setCadence] = useState<CostCadence>("once");
  const [payee, setPayee] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [driveUrl, setDriveUrl] = useState("");
  const [folderPath, setFolderPath] = useState("Persönlich/Wichtige Unterlagen");
  const [mood, setMood] = useState(3);
  const [win, setWin] = useState("");
  const [nextStep, setNextStep] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (kind === "task") {
      if (!title.trim()) return;
      onSaveTask({
        id: uid("task"),
        title: title.trim(),
        area,
        quadrant,
        dueAt: date ? dateAtNine(date) : null,
        estimateMinutes: minutes,
        progress: 0,
        completed: false,
        confidential: area !== "alltag",
      });
    } else if (kind === "cost") {
      const numericAmount = Number.parseFloat(amount.replace(",", "."));
      if (!title.trim() || !Number.isFinite(numericAmount)) return;
      onSaveCost({
        id: uid("cost"),
        title: title.trim(),
        category,
        amount: numericAmount,
        dueAt: dateAtNine(date),
        cadence,
        status: daysFromNow(dateAtNine(date)) <= 3 ? "due" : "planned",
        payee: payee.trim(),
        contactEmail: contactEmail.trim(),
        note: "Über Schnellerfassung angelegt",
        confidential: true,
      });
    } else if (kind === "document") {
      if (!title.trim() || !driveUrl.trim()) return;
      const fileId = extractDriveFileId(driveUrl.trim());
      onSaveDocument({
        id: uid("doc"),
        name: title.trim(),
        folderPath: folderPath.trim() || "Persönlich/Wichtige Unterlagen",
        kind: inferDocumentKind(driveUrl.trim()),
        driveUrl: driveUrl.trim(),
        fileId,
        modifiedAt: new Date().toISOString(),
        tags: ["Google Drive"],
        confidential: true,
      });
    } else {
      if (!title.trim() && !win.trim()) return;
      onSaveJournal(title.trim(), mood, win.trim(), nextStep.trim());
    }
    onClose();
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="capture-title"
        aria-modal="true"
        className="capture-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="dialog-handle" />
        <header className="dialog-heading">
          <div>
            <span className="eyebrow">Einmal erfassen</span>
            <h2 id="capture-title">Was möchtest du festhalten?</h2>
          </div>
          <button aria-label="Schließen" onClick={onClose} type="button">
            Schließen
          </button>
        </header>
        <div className="capture-tabs" role="tablist">
          {(
            [
              ["task", "Aufgabe"],
              ["cost", "Kosten"],
              ["document", "Unterlage"],
              ["journal", "Reflexion"],
            ] as const
          ).map(([key, label]) => (
            <button
              aria-selected={kind === key}
              className={kind === key ? "active" : ""}
              key={key}
              onClick={() => setKind(key)}
              role="tab"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        <form className="capture-form" onSubmit={submit}>
          <label>
            {kind === "journal"
              ? "Was beschäftigt dich?"
              : kind === "document"
                ? "Name der Unterlage"
                : kind === "cost"
                  ? "Bezeichnung"
                  : "Aufgabe"}
            {kind === "journal" ? (
              <textarea
                autoFocus
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ein Gedanke reicht …"
                rows={4}
                value={title}
              />
            ) : (
              <input
                autoFocus
                onChange={(event) => setTitle(event.target.value)}
                placeholder={
                  kind === "document"
                    ? "z. B. Haftpflichtversicherung"
                    : kind === "cost"
                      ? "z. B. Stromabschlag"
                      : "z. B. Versicherungsunterlagen prüfen"
                }
                value={title}
              />
            )}
          </label>

          {kind === "task" ? (
            <>
              <div className="form-grid">
                <label>
                  Bereich
                  <select
                    onChange={(event) =>
                      setArea(event.target.value as LifeArea)
                    }
                    value={area}
                  >
                    {(Object.keys(LIFE_AREA_LABELS) as LifeArea[]).map((value) => (
                      <option key={value} value={value}>
                        {LIFE_AREA_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Priorität
                  <select
                    onChange={(event) =>
                      setQuadrant(event.target.value as TaskQuadrant)
                    }
                    value={quadrant}
                  >
                    {(Object.keys(QUADRANT_LABELS) as TaskQuadrant[]).map(
                      (value) => (
                        <option key={value} value={value}>
                          {QUADRANT_LABELS[value]}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Fällig am
                  <input
                    onChange={(event) => setDate(event.target.value)}
                    type="date"
                    value={date}
                  />
                </label>
                <label>
                  Zeitbedarf in Minuten
                  <input
                    min="5"
                    onChange={(event) => setMinutes(Number(event.target.value))}
                    step="5"
                    type="number"
                    value={minutes}
                  />
                </label>
              </div>
            </>
          ) : null}

          {kind === "cost" ? (
            <>
              <div className="form-grid">
                <label>
                  Betrag in Euro
                  <input
                    inputMode="decimal"
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0,00"
                    value={amount}
                  />
                </label>
                <label>
                  Fälligkeit
                  <input
                    onChange={(event) => setDate(event.target.value)}
                    type="date"
                    value={date}
                  />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Kategorie
                  <select
                    onChange={(event) =>
                      setCategory(event.target.value as Cost["category"])
                    }
                    value={category}
                  >
                    {[
                      "Wohnen",
                      "Versicherungen",
                      "Mobilität",
                      "Alltag",
                      "Gesundheit",
                      "Sonstiges",
                    ].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Wiederholung
                  <select
                    onChange={(event) =>
                      setCadence(event.target.value as CostCadence)
                    }
                    value={cadence}
                  >
                    {(Object.keys(COST_CADENCE_LABELS) as CostCadence[]).map(
                      (value) => (
                        <option key={value} value={value}>
                          {COST_CADENCE_LABELS[value]}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Empfänger
                  <input
                    onChange={(event) => setPayee(event.target.value)}
                    placeholder="Optional"
                    value={payee}
                  />
                </label>
                <label>
                  Kontakt-E-Mail
                  <input
                    onChange={(event) => setContactEmail(event.target.value)}
                    placeholder="Optional für Gmail-Entwurf"
                    type="email"
                    value={contactEmail}
                  />
                </label>
              </div>
              <p className="form-trust">
                Dieser Posten wird als „Privat“ gespeichert. Eine
                Kalendererinnerung wird erst nach deiner Bestätigung angelegt.
              </p>
            </>
          ) : null}

          {kind === "document" ? (
            <>
              <label>
                Google-Drive-Dateilink
                <input
                  onChange={(event) => setDriveUrl(event.target.value)}
                  placeholder="https://drive.google.com/file/d/…"
                  type="url"
                  value={driveUrl}
                />
              </label>
              <label>
                Ordnerpfad im Kompass
                <input
                  onChange={(event) => setFolderPath(event.target.value)}
                  value={folderPath}
                />
              </label>
              <div className="form-trust">
                <strong>So funktioniert es:</strong> Öffne{" "}
                <a
                  href={integrations.driveFolderUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  deinen Drive-Ordner
                </a>
                , wähle eine Datei und kopiere ihren Link. Die Datei selbst wird
                nicht in den Kompass geladen.
              </div>
            </>
          ) : null}

          {kind === "journal" ? (
            <>
              <fieldset className="mood-field compact">
                <legend>Stimmung</legend>
                <div>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      aria-pressed={mood === value}
                      className={mood === value ? "active" : ""}
                      key={value}
                      onClick={() => setMood(value)}
                      type="button"
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label>
                Das ist heute gelungen
                <input
                  onChange={(event) => setWin(event.target.value)}
                  value={win}
                />
              </label>
              <label>
                Nächster kleiner Schritt
                <input
                  onChange={(event) => setNextStep(event.target.value)}
                  value={nextStep}
                />
              </label>
            </>
          ) : null}

          <div className="dialog-actions">
            <button className="button button-ghost" onClick={onClose} type="button">
              Abbrechen
            </button>
            <button className="button button-primary" type="submit">
              Speichern
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function DocumentViewer({
  document,
  onClose,
}: {
  document: DocumentRef;
  onClose: () => void;
}) {
  const preview = drivePreviewUrl(document.driveUrl, document.fileId);
  return (
    <div className="viewer-backdrop" role="presentation">
      <section
        aria-labelledby="viewer-title"
        aria-modal="true"
        className="document-viewer"
        role="dialog"
      >
        <header>
          <div>
            <span className="eyebrow">DIN-A4-Ansicht · Privat</span>
            <h2 id="viewer-title">{document.name}</h2>
            <p>{document.folderPath}</p>
          </div>
          <div>
            <a
              className="button button-soft"
              href={driveDownloadUrl(document.driveUrl, document.fileId)}
              rel="noreferrer"
              target="_blank"
            >
              Herunterladen
            </a>
            <button className="button button-ghost" onClick={onClose} type="button">
              Schließen
            </button>
          </div>
        </header>
        <div className="viewer-stage">
          {preview ? (
            <div className="a4-page">
              <iframe
                loading="lazy"
                src={preview}
                title={`Vorschau von ${document.name}`}
              />
            </div>
          ) : (
            <div className="viewer-empty">
              <span>DIN A4</span>
              <h3>Noch keine einzelne Drive-Datei verknüpft</h3>
              <p>
                Dieser Eintrag verweist aktuell auf den Ordner. Verknüpfe über
                „Unterlage verknüpfen“ den genauen Dateilink, um Vorschau und
                direkten Download zu aktivieren.
              </p>
              <a
                className="button button-primary"
                href={document.driveUrl}
                rel="noreferrer"
                target="_blank"
              >
                In Google Drive öffnen
              </a>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function SettingsDialog({
  integrations,
  syncCopy,
  onClose,
  onExport,
  onImport,
  onReset,
}: {
  integrations: IntegrationConfig;
  syncCopy: string;
  onClose: () => void;
  onExport: () => void;
  onImport: (raw: string) => void;
  onReset: () => void;
}) {
  const importRef = useRef<HTMLInputElement>(null);
  return (
    <div className="dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="settings-title"
        aria-modal="true"
        className="settings-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="dialog-heading">
          <div>
            <span className="eyebrow">Einstellungen & Datenschutz</span>
            <h2 id="settings-title">Dein privater Kompass</h2>
          </div>
          <button aria-label="Schließen" onClick={onClose} type="button">
            Schließen
          </button>
        </header>
        <div className="settings-section privacy-hero">
          <span className="privacy-seal">P</span>
          <div>
            <strong>Nur für dich freigegeben</strong>
            <p>
              {syncCopy}. Aufgaben, Kosten und Journal bleiben im privaten
              Sites-Speicher. Drive-Dateien verbleiben bei Google.
            </p>
          </div>
        </div>
        <div className="settings-section">
          <span className="eyebrow">Integrationen</span>
          <IntegrationRow
            action="Ordner"
            detail="Referenzen und direkte Downloads"
            href={integrations.driveFolderUrl}
            label="Google Drive"
            status="verknüpft"
          />
          <IntegrationRow
            action="Kalender"
            detail={integrations.calendarId}
            href={integrations.calendarEmbedUrl}
            label="Google Kalender"
            status="Lesezugriff"
          />
          <IntegrationRow
            action="Gmail"
            detail="Entwürfe öffnen erst nach deiner Aktion"
            href={`https://mail.google.com/mail/u/${encodeURIComponent(integrations.gmailAccount)}/#inbox`}
            label="Gmail"
            status="direkt"
          />
        </div>
        <div className="settings-section">
          <span className="eyebrow">Datensicherung</span>
          <h3>Deine Daten mitnehmen</h3>
          <p>
            Exportiere jederzeit ein lesbares JSON-Backup. Beim Import wird das
            Format geprüft, bevor etwas ersetzt wird.
          </p>
          <div className="button-group">
            <button className="button button-soft" onClick={onExport} type="button">
              Backup exportieren
            </button>
            <button
              className="button button-ghost"
              onClick={() => importRef.current?.click()}
              type="button"
            >
              Backup importieren
            </button>
            <input
              accept="application/json"
              className="visually-hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) onImport(await file.text());
              }}
              ref={importRef}
              type="file"
            />
          </div>
        </div>
        <div className="settings-section danger-zone">
          <div>
            <strong>Beispieldaten zurücksetzen</strong>
            <p>Ersetzt den aktuellen Stand nach einer Sicherheitsabfrage.</p>
          </div>
          <button onClick={onReset} type="button">
            Zurücksetzen
          </button>
        </div>
      </section>
    </div>
  );
}
