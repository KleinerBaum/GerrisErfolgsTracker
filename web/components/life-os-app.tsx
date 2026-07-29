"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  QuickActionDialog,
  SidebarQuickActions,
  type QuickActionKind,
} from "./quick-actions";
import { createDemoState } from "../lib/demo-data";
import {
  COST_CATEGORIES,
  COST_SUGGESTIONS_BY_CATEGORY,
  toMonthlyAmount,
} from "../lib/finance-data";
import {
  formatCurrency,
  formatCurrencyRounded,
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
  type AccountBalances,
  type AppState,
  type CalendarEvent,
  type CaptureKind,
  type Cost,
  type CostCadence,
  type CostCategory,
  type CostPriority,
  type CostStatus,
  type CostType,
  type DocumentRef,
  type IntegrationConfig,
  type Income,
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

const formatFileSize = (bytes: number): string =>
  bytes < 1_048_576
    ? `${Math.max(1, Math.round(bytes / 1_024))} KB`
    : `${(bytes / 1_048_576).toFixed(1).replace(".", ",")} MB`;

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
  const [quickAction, setQuickAction] = useState<
    Exclude<QuickActionKind, "task"> | null
  >(null);
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
      setQuickAction(null);
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
    setQuickAction(null);
    setCaptureKind(kind);
    setCaptureOpen(true);
  };

  const openQuickAction = (kind: QuickActionKind) => {
    setMobileSidebarOpen(false);
    if (kind === "task") {
      openCapture("task");
      return;
    }
    setCaptureOpen(false);
    setQuickAction(kind);
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

  const saveIncome = (income: Income) => {
    updateState((current) => ({
      ...current,
      incomes: [income, ...current.incomes],
    }));
    setNotice("Einnahme gespeichert");
  };

  const updateAccountBalances = (balances: AccountBalances) => {
    updateState((current) => ({
      ...current,
      accountBalances: balances,
    }));
    setNotice("Kontostände aktualisiert");
  };

  const saveDocument = (document: DocumentRef) => {
    updateState((current) => ({
      ...current,
      documents: [document, ...current.documents],
    }));
    setNotice(
      document.storage === "upload"
        ? "Datei sicher abgelegt"
        : "Drive-Unterlage verknüpft",
    );
  };

  const saveEvent = (event: CalendarEvent) => {
    updateState((current) => ({
      ...current,
      calendarEvents: [event, ...current.calendarEvents],
    }));
    setNotice("Termin gespeichert");
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

        <SidebarQuickActions onAction={openQuickAction} />

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
              onAddIncome={saveIncome}
              onMarkPaid={markCostPaid}
              onNew={() => openCapture("cost")}
              onUpdateBalances={updateAccountBalances}
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

      {quickAction ? (
        <QuickActionDialog
          documents={state.documents}
          integrations={integrations}
          kind={quickAction}
          onClose={() => setQuickAction(null)}
          onSaveDocument={saveDocument}
          onSaveEvent={saveEvent}
          toast={setNotice}
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
                    {event.location ? ` · ${event.location}` : ""}
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
  onAddIncome,
  onMarkPaid,
  onNew,
  onUpdateBalances,
}: {
  state: AppState;
  integrations: IntegrationConfig;
  onAddIncome: (income: Income) => void;
  onMarkPaid: (costId: string) => void;
  onNew: () => void;
  onUpdateBalances: (balances: AccountBalances) => void;
}) {
  const [filter, setFilter] = useState<CostStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [balancesOpen, setBalancesOpen] = useState(false);
  const [zoomCategory, setZoomCategory] = useState<CostCategory | null>(null);
  const [zoomCostId, setZoomCostId] = useState<string | null>(null);
  const visible = state.costs
    .filter((cost) => filter === "all" || cost.status === filter)
    .filter((cost) =>
      `${cost.title} ${cost.category} ${cost.payee}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((left, right) => right.dueAt.localeCompare(left.dueAt));
  const sameMonth = (value: string): boolean => {
    const date = new Date(value);
    const now = new Date();
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth()
    );
  };
  const monthlyIncome = state.incomes.reduce(
    (sum, income) =>
      sum +
      (income.cadence === "once"
        ? sameMonth(income.receivedAt)
          ? income.amount
          : 0
        : toMonthlyAmount(income.amount, income.cadence)),
    0,
  );
  const recurringCosts = state.costs.filter((cost) => cost.cadence !== "once");
  const monthlyCosts = recurringCosts.reduce(
    (sum, cost) => sum + toMonthlyAmount(cost.amount, cost.cadence),
    0,
  );
  const monthlyBalance = monthlyIncome - monthlyCosts;
  const comparisonMax = Math.max(monthlyIncome, monthlyCosts, 1);
  const expenseGroups = COST_CATEGORIES.map((category) => {
    const items = recurringCosts.filter((cost) => cost.category === category);
    return {
      category,
      items,
      value: items.reduce(
        (sum, cost) => sum + toMonthlyAmount(cost.amount, cost.cadence),
        0,
      ),
    };
  })
    .filter((group) => group.value > 0)
    .sort((left, right) => right.value - left.value);
  const selectedGroup =
    expenseGroups.find((group) => group.category === zoomCategory) ?? null;
  const selectedCost =
    selectedGroup?.items.find((cost) => cost.id === zoomCostId) ?? null;
  const zoomAmount = selectedCost
    ? toMonthlyAmount(selectedCost.amount, selectedCost.cadence)
    : selectedGroup?.value ?? monthlyCosts;
  const zoomLabel = selectedCost
    ? selectedCost.title
    : selectedGroup?.category ?? "Laufende Kosten";
  const upcoming = state.costs
    .filter((cost) => cost.status !== "paid" && daysFromNow(cost.dueAt) >= 0)
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt))
    .slice(0, 6);
  const accountTotal =
    state.accountBalances.paypal + state.accountBalances.revolut;

  return (
    <div className="view-stack">
      <PageIntro
        eyebrow="Finanzielle Orientierung"
        title="Erst das Ganze sehen. Dann ins Detail gehen."
        copy="Einnahmen, laufende Kosten und verfügbare Kontostände bilden eine ruhige Gesamtansicht. Einzelbeträge erscheinen erst dort, wo du sie wirklich brauchst."
        action={
          <div className="button-group">
            <button
              className="button button-soft"
              onClick={() => setIncomeOpen(true)}
              type="button"
            >
              Einnahme hinzufügen
            </button>
            <button className="button button-primary" onClick={onNew} type="button">
              Laufende Kosten erfassen
            </button>
          </div>
        }
      />

      <section className="finance-overview-grid" aria-label="Finanzübersicht">
        <article className="panel cashflow-overview">
          <header className="finance-card-heading">
            <div>
              <span className="eyebrow">Monatlicher Rahmen</span>
              <h2>Einnahmen und laufende Ausgaben</h2>
            </div>
            <span className={`balance-chip ${monthlyBalance < 0 ? "negative" : ""}`}>
              {monthlyBalance >= 0 ? "Spielraum" : "Lücke"}{" "}
              {formatCurrencyRounded(Math.abs(monthlyBalance))}
            </span>
          </header>
          <div className="cashflow-comparison">
            <div className="cashflow-line income">
              <div>
                <span>Einnahmen</span>
                <strong>{formatCurrencyRounded(monthlyIncome)}</strong>
              </div>
              <div className="cashflow-track">
                <i style={{ width: `${(monthlyIncome / comparisonMax) * 100}%` }} />
              </div>
            </div>
            <div className="cashflow-line expense">
              <div>
                <span>Laufende Ausgaben</span>
                <strong>{formatCurrencyRounded(monthlyCosts)}</strong>
              </div>
              <div className="cashflow-track">
                <i style={{ width: `${(monthlyCosts / comparisonMax) * 100}%` }} />
              </div>
            </div>
          </div>
          <footer className="cashflow-footnote">
            <span>
              {state.incomes.length
                ? `${state.incomes.length} Einnahme${state.incomes.length === 1 ? "" : "n"} erfasst`
                : "Noch keine Einnahmen erfasst"}
            </span>
            <span>
              {recurringCosts.length} laufende{" "}
              {recurringCosts.length === 1 ? "Position" : "Positionen"}
            </span>
          </footer>
        </article>

        <article className="panel account-overview">
          <header className="finance-card-heading">
            <div>
              <span className="eyebrow">Verfügbar</span>
              <h2>Kontostände</h2>
            </div>
            <button
              className="text-button"
              onClick={() => setBalancesOpen(true)}
              type="button"
            >
              Bearbeiten
            </button>
          </header>
          <div className="account-list">
            <div>
              <span className="account-mark paypal">P</span>
              <div>
                <span>PayPal</span>
                <strong>{formatCurrencyRounded(state.accountBalances.paypal)}</strong>
              </div>
            </div>
            <div>
              <span className="account-mark revolut">R</span>
              <div>
                <span>Revolut</span>
                <strong>{formatCurrencyRounded(state.accountBalances.revolut)}</strong>
              </div>
            </div>
          </div>
          <footer>
            <span>Zusammen verfügbar</span>
            <strong>{formatCurrencyRounded(accountTotal)}</strong>
          </footer>
        </article>
      </section>

      <section className="panel expense-explorer">
        <header className="explorer-heading">
          <div>
            <span className="eyebrow">Kosten-Zoom</span>
            <h2>Von der Summe bis zum einzelnen Vertrag</h2>
            <p>
              Wähle eine Ebene. Die Übersicht bleibt gerundet, Details zeigen
              den exakten Betrag.
            </p>
          </div>
          <nav aria-label="Aktuelle Kostenebene" className="explorer-breadcrumbs">
            <button
              aria-current={!zoomCategory ? "page" : undefined}
              onClick={() => {
                setZoomCategory(null);
                setZoomCostId(null);
              }}
              type="button"
            >
              Gesamt
            </button>
            {selectedGroup ? (
              <>
                <span>/</span>
                <button
                  aria-current={!selectedCost ? "page" : undefined}
                  onClick={() => setZoomCostId(null)}
                  type="button"
                >
                  {selectedGroup.category}
                </button>
              </>
            ) : null}
            {selectedCost ? (
              <>
                <span>/</span>
                <strong>{selectedCost.title}</strong>
              </>
            ) : null}
          </nav>
        </header>

        <div
          aria-live="polite"
          className="expense-stage"
          key={`${zoomCategory ?? "total"}-${zoomCostId ?? "group"}`}
        >
          <div className="expense-orbit" aria-label={`${zoomLabel}: ${formatCurrencyRounded(zoomAmount)} pro Monat`}>
            <div className="orbit-pulse" />
            <div className="orbit-core">
              <span>{zoomLabel}</span>
              <strong>{formatCurrencyRounded(zoomAmount)}</strong>
              <small>pro Monat</small>
            </div>
          </div>

          <div className="explorer-results">
            {!selectedGroup ? (
              <div className="explorer-list">
                {expenseGroups.map((group, index) => (
                  <button
                    key={group.category}
                    onClick={() => {
                      setZoomCategory(group.category);
                      setZoomCostId(null);
                    }}
                    style={{ animationDelay: `${index * 45}ms` }}
                    type="button"
                  >
                    <span className="explorer-index">{String(index + 1).padStart(2, "0")}</span>
                    <span>
                      <strong>{group.category}</strong>
                      <small>
                        {group.items.length}{" "}
                        {group.items.length === 1 ? "Posten" : "Posten"}
                      </small>
                    </span>
                    <span className="explorer-share">
                      <i
                        style={{
                          width: `${monthlyCosts ? (group.value / monthlyCosts) * 100 : 0}%`,
                        }}
                      />
                    </span>
                    <strong>{formatCurrencyRounded(group.value)}</strong>
                    <span aria-hidden="true">›</span>
                  </button>
                ))}
                {!expenseGroups.length ? (
                  <EmptyState
                    copy="Erfasse deinen ersten wiederkehrenden Posten – die Kategorien entstehen automatisch."
                    title="Noch keine laufenden Kosten."
                  />
                ) : null}
              </div>
            ) : selectedCost ? (
              <article className="expense-detail-card">
                <div className="detail-amount">
                  <span>Exakter Zahlbetrag</span>
                  <strong>{formatCurrency(selectedCost.amount)}</strong>
                </div>
                <dl>
                  <div>
                    <dt>Monatswert</dt>
                    <dd>
                      {formatCurrency(
                        toMonthlyAmount(selectedCost.amount, selectedCost.cadence),
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Rhythmus</dt>
                    <dd>{COST_CADENCE_LABELS[selectedCost.cadence]}</dd>
                  </div>
                  <div>
                    <dt>Nächste Fälligkeit</dt>
                    <dd>{formatDateLong(selectedCost.dueAt)}</dd>
                  </div>
                  <div>
                    <dt>Art</dt>
                    <dd>{selectedCost.costType ?? "Nicht zugeordnet"}</dd>
                  </div>
                  <div>
                    <dt>Unterkategorie</dt>
                    <dd>{selectedCost.subcategory ?? selectedCost.category}</dd>
                  </div>
                  <div>
                    <dt>Anbieter</dt>
                    <dd>{selectedCost.payee || "Nicht hinterlegt"}</dd>
                  </div>
                </dl>
                <button
                  className="button button-soft"
                  onClick={() => setZoomCostId(null)}
                  type="button"
                >
                  Zurück zu {selectedGroup.category}
                </button>
              </article>
            ) : (
              <div className="explorer-list">
                {selectedGroup.items
                  .slice()
                  .sort(
                    (left, right) =>
                      toMonthlyAmount(right.amount, right.cadence) -
                      toMonthlyAmount(left.amount, left.cadence),
                  )
                  .map((cost, index) => (
                    <button
                      key={cost.id}
                      onClick={() => setZoomCostId(cost.id)}
                      style={{ animationDelay: `${index * 45}ms` }}
                      type="button"
                    >
                      <span className="explorer-index">{String(index + 1).padStart(2, "0")}</span>
                      <span>
                        <strong>{cost.title}</strong>
                        <small>
                          {cost.subcategory ?? COST_CADENCE_LABELS[cost.cadence]}
                        </small>
                      </span>
                      <span className="explorer-share">
                        <i
                          style={{
                            width: `${selectedGroup.value ? (toMonthlyAmount(cost.amount, cost.cadence) / selectedGroup.value) * 100 : 0}%`,
                          }}
                        />
                      </span>
                      <strong>
                        {formatCurrencyRounded(
                          toMonthlyAmount(cost.amount, cost.cadence),
                        )}
                      </strong>
                      <span aria-hidden="true">›</span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="panel upcoming-costs-panel">
        <div className="table-toolbar">
          <div>
            <span className="eyebrow">Als Nächstes</span>
            <h2>Anstehende Ausgaben</h2>
          </div>
          <span className="muted-label">
            {upcoming.length
              ? `${upcoming.length} Zahlungen im Blick`
              : "Keine offenen Zahlungen"}
          </span>
        </div>
        <div className="upcoming-costs-list">
          {upcoming.map((cost) => (
            <article key={cost.id}>
              <time dateTime={cost.dueAt}>
                <strong>{new Date(cost.dueAt).getDate()}</strong>
                <span>
                  {new Intl.DateTimeFormat("de-DE", { month: "short" }).format(
                    new Date(cost.dueAt),
                  )}
                </span>
              </time>
              <div>
                <strong>{cost.title}</strong>
                <span>
                  {cost.category} · {formatRelativeDate(cost.dueAt)}
                </span>
              </div>
              <strong>{formatCurrencyRounded(cost.amount)}</strong>
              <button onClick={() => onMarkPaid(cost.id)} type="button">
                Erledigt
              </button>
            </article>
          ))}
          {!upcoming.length ? (
            <EmptyState
              copy="Sobald ein offener Kostenposten fällig wird, erscheint er hier."
              title="Alles ist eingeplant."
            />
          ) : null}
        </div>
      </section>

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
                  {cost.category}
                  {cost.subcategory ? ` · ${cost.subcategory}` : ""}
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

      {incomeOpen ? (
        <IncomeDialog
          onClose={() => setIncomeOpen(false)}
          onSave={(income) => {
            onAddIncome(income);
            setIncomeOpen(false);
          }}
        />
      ) : null}
      {balancesOpen ? (
        <BalancesDialog
          balances={state.accountBalances}
          onClose={() => setBalancesOpen(false)}
          onSave={(balances) => {
            onUpdateBalances(balances);
            setBalancesOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function IncomeDialog({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (income: Income) => void;
}) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [receivedAt, setReceivedAt] = useState(isoDateInput());
  const [cadence, setCadence] = useState<CostCadence>("monthly");
  const [note, setNote] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const numericAmount = Number.parseFloat(amount.replace(",", "."));
    if (!title.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      return;
    }
    onSave({
      id: uid("income"),
      title: title.trim(),
      amount: numericAmount,
      receivedAt: dateAtNine(receivedAt),
      cadence,
      note: note.trim(),
      confidential: true,
    });
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="income-dialog-title"
        aria-modal="true"
        className="capture-dialog finance-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="dialog-heading">
          <div>
            <span className="eyebrow">Einnahmen</span>
            <h2 id="income-dialog-title">Einnahme hinzufügen</h2>
          </div>
          <button onClick={onClose} type="button">
            Schließen
          </button>
        </header>
        <form className="capture-form finance-entry-form" onSubmit={submit}>
          <label>
            Bezeichnung
            <input
              autoFocus
              onChange={(event) => setTitle(event.target.value)}
              placeholder="z. B. Gehalt oder Erstattung"
              value={title}
            />
          </label>
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
              Eingang am
              <input
                onChange={(event) => setReceivedAt(event.target.value)}
                type="date"
                value={receivedAt}
              />
            </label>
          </div>
          <label>
            Rhythmus
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
          <label>
            Notiz
            <textarea
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional"
              rows={3}
              value={note}
            />
          </label>
          <div className="dialog-actions">
            <button className="button button-ghost" onClick={onClose} type="button">
              Abbrechen
            </button>
            <button className="button button-primary" type="submit">
              Einnahme speichern
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function BalancesDialog({
  balances,
  onClose,
  onSave,
}: {
  balances: AccountBalances;
  onClose: () => void;
  onSave: (balances: AccountBalances) => void;
}) {
  const [paypal, setPaypal] = useState(String(balances.paypal));
  const [revolut, setRevolut] = useState(String(balances.revolut));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const paypalValue = Number.parseFloat(paypal.replace(",", "."));
    const revolutValue = Number.parseFloat(revolut.replace(",", "."));
    if (!Number.isFinite(paypalValue) || !Number.isFinite(revolutValue)) return;
    onSave({
      paypal: paypalValue,
      revolut: revolutValue,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="balances-dialog-title"
        aria-modal="true"
        className="capture-dialog finance-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="dialog-heading">
          <div>
            <span className="eyebrow">Kontostände</span>
            <h2 id="balances-dialog-title">Verfügbares Guthaben aktualisieren</h2>
          </div>
          <button onClick={onClose} type="button">
            Schließen
          </button>
        </header>
        <form className="capture-form finance-entry-form" onSubmit={submit}>
          <div className="form-grid">
            <label>
              PayPal in Euro
              <input
                autoFocus
                inputMode="decimal"
                onChange={(event) => setPaypal(event.target.value)}
                value={paypal}
              />
            </label>
            <label>
              Revolut in Euro
              <input
                inputMode="decimal"
                onChange={(event) => setRevolut(event.target.value)}
                value={revolut}
              />
            </label>
          </div>
          <p className="form-trust">
            Die Werte werden nur in deinem privaten Kompass gespeichert. Es
            findet keine automatische Kontoabfrage statt.
          </p>
          <div className="dialog-actions">
            <button className="button button-ghost" onClick={onClose} type="button">
              Abbrechen
            </button>
            <button className="button button-primary" type="submit">
              Kontostände speichern
            </button>
          </div>
        </form>
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
        eyebrow="Private Uploads · Google Drive · Meine Ablage"
        title="Wichtige Unterlagen – lesbar, sortiert, griffbereit."
        copy="Lege Dateien direkt privat ab oder verknüpfe bestehende Google-Drive-Unterlagen. Zielordner, Schlagworte, Notizen und Prüftermine halten alles auffindbar."
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
          const isUpload = document.storage === "upload";
          const preview = isUpload
            ? document.contentType === "application/pdf" ||
              document.contentType?.startsWith("image/")
              ? document.downloadUrl
              : null
            : drivePreviewUrl(document.driveUrl, document.fileId);
          const downloadUrl = isUpload
            ? `${document.downloadUrl ?? document.driveUrl}?download=1`
            : driveDownloadUrl(document.driveUrl, document.fileId);
          return (
            <article className="document-card" key={document.id}>
              <div className={`document-kind kind-${document.kind}`}>
                {document.kind === "folder"
                  ? "ORDNER"
                  : document.kind === "sheet"
                    ? "TABELLE"
                    : document.kind === "document"
                      ? "DOK"
                      : document.kind === "pdf"
                        ? "PDF"
                        : "DATEI"}
              </div>
              <div>
                <span className="eyebrow">
                  {document.folderPath.split("/").slice(-2).join(" / ")}
                </span>
                <h3>{document.name}</h3>
                <p>
                  Geändert {formatRelativeDate(document.modifiedAt)} ·{" "}
                  {document.sizeBytes ? `${formatFileSize(document.sizeBytes)} · ` : ""}
                  {document.tags.join(" · ")}
                </p>
              </div>
              <span className="private-chip">Privat</span>
              <div className="document-actions">
                <button onClick={() => onOpen(document)} type="button">
                  {preview ? "A4-Ansicht" : "Details"}
                </button>
                {!isUpload ? (
                  <a
                    href={document.driveUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    In Drive
                  </a>
                ) : null}
                <a
                  href={downloadUrl}
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
  const [category, setCategory] = useState<CostCategory>("Wohnen");
  const [subcategory, setSubcategory] = useState("");
  const [costType, setCostType] = useState<CostType>("Fix");
  const [costPriority, setCostPriority] =
    useState<CostPriority>("Notwendig");
  const [cadence, setCadence] = useState<CostCadence>("once");
  const [payee, setPayee] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [account, setAccount] = useState("");
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
        subcategory: subcategory.trim() || undefined,
        costType,
        priority: costPriority,
        amount: numericAmount,
        dueAt: dateAtNine(date),
        cadence,
        status: daysFromNow(dateAtNine(date)) <= 3 ? "due" : "planned",
        payee: payee.trim(),
        paymentMethod: paymentMethod || undefined,
        account: account || undefined,
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
              <label>
                Vorlage aus der Kosten-Tabelle
                <select
                  onChange={(event) => {
                    const selected = COST_SUGGESTIONS_BY_CATEGORY.flatMap(
                      (group) => group.items,
                    ).find((item) => item.id === event.target.value);
                    if (!selected) return;
                    setTitle(selected.title);
                    setCategory(selected.category);
                    setSubcategory(selected.subcategory);
                    setCostType(selected.costType);
                    setCostPriority(selected.priority);
                    setCadence(selected.cadence);
                  }}
                  value=""
                >
                  <option value="">Freie Eingabe</option>
                  {COST_SUGGESTIONS_BY_CATEGORY.map((group) => (
                    <optgroup key={group.category} label={group.category}>
                      {group.items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
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
                    {COST_CATEGORIES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
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
                  Unterkategorie
                  <input
                    onChange={(event) => setSubcategory(event.target.value)}
                    placeholder="Optional"
                    value={subcategory}
                  />
                </label>
                <label>
                  Kostenart
                  <select
                    onChange={(event) =>
                      setCostType(event.target.value as CostType)
                    }
                    value={costType}
                  >
                    <option value="Fix">Fix</option>
                    <option value="Variabel">Variabel</option>
                  </select>
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Priorität
                  <select
                    onChange={(event) =>
                      setCostPriority(event.target.value as CostPriority)
                    }
                    value={costPriority}
                  >
                    <option value="Notwendig">Notwendig</option>
                    <option value="Wichtig">Wichtig</option>
                    <option value="Optional">Optional</option>
                  </select>
                </label>
                <label>
                  Konto
                  <select
                    onChange={(event) => setAccount(event.target.value)}
                    value={account}
                  >
                    <option value="">Nicht festgelegt</option>
                    <option value="PayPal">PayPal</option>
                    <option value="Revolut">Revolut</option>
                    <option value="Girokonto">Girokonto</option>
                    <option value="Kreditkarte">Kreditkarte</option>
                    <option value="Bargeld">Bargeld</option>
                    <option value="Sonstiges">Sonstiges</option>
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
                  Zahlungsart
                  <select
                    onChange={(event) => setPaymentMethod(event.target.value)}
                    value={paymentMethod}
                  >
                    <option value="">Nicht festgelegt</option>
                    <option value="Lastschrift">Lastschrift</option>
                    <option value="Dauerauftrag">Dauerauftrag</option>
                    <option value="Überweisung">Überweisung</option>
                    <option value="Kreditkarte">Kreditkarte</option>
                    <option value="PayPal">PayPal</option>
                    <option value="Bar">Bar</option>
                    <option value="Sonstige">Sonstige</option>
                  </select>
                </label>
              </div>
              <div className="form-grid">
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
  const isUpload = document.storage === "upload";
  const preview = isUpload
    ? document.contentType === "application/pdf" ||
      document.contentType?.startsWith("image/")
      ? document.downloadUrl ?? null
      : null
    : drivePreviewUrl(document.driveUrl, document.fileId);
  const downloadUrl = isUpload
    ? `${document.downloadUrl ?? document.driveUrl}?download=1`
    : driveDownloadUrl(document.driveUrl, document.fileId);
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
            <span className="eyebrow">
              {isUpload ? "Private Dateiablage" : "DIN-A4-Ansicht"} · Privat
            </span>
            <h2 id="viewer-title">{document.name}</h2>
            <p>{document.folderPath}</p>
          </div>
          <div>
            <a
              className="button button-soft"
              href={downloadUrl}
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
                {isUpload
                  ? "Für dieses Dateiformat ist keine direkte Vorschau verfügbar. Der sichere Download bleibt jederzeit möglich."
                  : "Dieser Eintrag verweist aktuell auf den Ordner. Verknüpfe über „Unterlage verknüpfen“ den genauen Dateilink, um Vorschau und direkten Download zu aktivieren."}
              </p>
              <a
                className="button button-primary"
                href={isUpload ? downloadUrl : document.driveUrl}
                rel="noreferrer"
                target="_blank"
              >
                {isUpload ? "Datei herunterladen" : "In Google Drive öffnen"}
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
