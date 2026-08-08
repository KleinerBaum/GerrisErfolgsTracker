"use client";

import {
  useCallback,
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
import { CalendarEventForm } from "./calendar-event-form";
import {
  DriveExplorer,
  DriveSidebarTree,
  useDriveExplorer,
  type DriveExplorerController,
} from "./drive-explorer";
import { FinanceView } from "./finance-view";
import { ApplicationsView } from "./applications-view";
import { ContactsView } from "./contacts-view";
import { DiaryView } from "./diary-view";
import { CalendarView as CalendarWorkspace } from "./calendar-view";
import { TodayView } from "./today-view";
import { PlanningHealthBanner } from "./planning-health-banner";
import { RewardAssessmentDialog } from "./reward-assessment-dialog";
import { createDemoState } from "../lib/demo-data";
import {
  DASHBOARD_KPI_DEFINITIONS,
} from "../lib/dashboard";
import {
  APPLICATION_KPI_DEFINITIONS,
} from "../lib/application-workflow";
import { COST_TEMPLATES } from "../lib/finance-catalog";
import { parseEuroInput } from "../lib/finance-data";
import { diaryRhythmDays, upsertDiaryEntry } from "../lib/diary";
import type { DiaryPlanningSuggestion } from "../lib/diary-planning";
import {
  applyCostPaymentReward,
  applyDayCloseReward,
  applyTaskCompletionReward,
  buildWorldUpgrade,
  completionMessage,
  createDefaultGamification,
  ledgerTotals,
  levelForXp,
  markTaskCompletionForRhythm,
  redeemPersonalReward,
  REWARD_MODE_LABELS,
  upsertTaskProfile,
  withGamification,
  WORLD_DISTRICT_LABELS,
  WORLD_UPGRADE_COSTS,
  XP_GOAL_LIMITS,
  xpProgressByPeriod,
  type XpGoalProgress,
  type XpProgressByPeriod,
} from "../lib/gamification";
import {
  calendarDayDifference,
  formatDate,
  formatDateLong,
  formatRelativeDate,
  formatTime,
  isoDateInput,
  zonedDateTimeInput,
  zonedDateTimeToIso,
} from "../lib/format";
import {
  driveDownloadUrl,
  drivePreviewUrl,
  extractDriveFileId,
  inferDocumentKind,
  safeGoogleDriveUrl,
} from "../lib/google-links";
import {
  documentFolderOptions,
  documentSource,
  privateFileDownloadUrl,
  safePrivateFileUrl,
  visibleDocuments,
} from "../lib/document-library";
import { responsePayload } from "../lib/http-response";
import {
  bootstrapGoogleTasks,
  createGoogleTask,
  deleteGoogleTask,
  getGoogleTasksStatus,
  getGoogleWorkspaceStatus,
  GoogleClientError,
  listGoogleTaskLists,
  listGoogleTasks,
  provisionGoogleTasks,
  updateGoogleTask,
  type GoogleTasksStatus,
  type GoogleTaskList,
  type GoogleWorkspaceStatus,
} from "../lib/google-tasks-client";
import {
  analyzeAndStoreJournal,
  getPlanningReport,
  reconcilePlanning,
  removePlanningDayIntent,
  savePlanningDayIntent,
  setPlanningAutomationMode,
  updatePlanningGap,
  updatePlanningTopic,
} from "../lib/planning-client";
import {
  COST_CATEGORIES,
  COST_CADENCE_LABELS,
  LIFE_AREA_LABELS,
  QUADRANT_LABELS,
  REWARD_MODES,
  type AccountBalances,
  type AppState,
  type ApplicationArtifact,
  type ApplicationKpiKey,
  type ApplicationKpiPeriod,
  type ApplicationKpiSettings,
  type ApplicationProcess,
  type CalendarEvent,
  type CaptureKind,
  type Cost,
  type CostCadence,
  type DiarySaveInput,
  type DocumentRef,
  type IntegrationConfig,
  type Income,
  type GamificationState,
  type MasterCvContent,
  type MasterCvImportBundle,
  type Task,
  type RewardMode,
  type SyncStatus,
  type TaskGamificationProfile,
  type TaskQuadrant,
  type WorldDistrictKey,
  type WorldUpgradeKind,
  type DayIntentKind,
  type DashboardKpiKey,
  type DashboardSettings,
  type PlanningHealthReport,
  type ViewKey,
  type XpGoals,
} from "../lib/types";
import { useGerriState } from "../lib/use-gerri-state";
import { useModalDialog } from "../lib/use-modal-dialog";
import { orderCompletedTasks, orderOpenTasks } from "../lib/task-order";
import { urlForView, viewFromUrl } from "../lib/view-navigation";

const NAV_ITEMS: Array<{
  key: ViewKey;
  label: string;
  short: string;
  mark: string;
}> = [
  { key: "today", label: "Zentrale", short: "Zentrale", mark: "Z" },
  { key: "tasks", label: "Aufgaben", short: "Aufgaben", mark: "A" },
  { key: "calendar", label: "Kalender", short: "Kalender", mark: "K" },
  { key: "finance", label: "Finanzen", short: "Kosten", mark: "€" },
  { key: "documents", label: "Unterlagen", short: "Ablage", mark: "U" },
  {
    key: "applications",
    label: "Bewerbungen",
    short: "Bewerbung",
    mark: "B",
  },
  { key: "contacts", label: "Kontakte", short: "Kontakte", mark: "P" },
  { key: "journal", label: "Tagebuch", short: "Tagebuch", mark: "T" },
];

const MOBILE_PRIMARY_NAV_KEYS: ViewKey[] = [
  "today",
  "tasks",
  "calendar",
  "applications",
];
const SIDEBAR_PREFERENCE_KEY = "gerris-kompass-sidebar-v1";
const WORLD_DISTRICTS = Object.keys(WORLD_DISTRICT_LABELS) as WorldDistrictKey[];
const WORLD_UPGRADE_KINDS = Object.keys(WORLD_UPGRADE_COSTS) as WorldUpgradeKind[];

function mobileNavigationItems(view: ViewKey) {
  const primary = MOBILE_PRIMARY_NAV_KEYS.map(
    (key) => NAV_ITEMS.find((item) => item.key === key)!,
  );
  if (MOBILE_PRIMARY_NAV_KEYS.includes(view)) return primary;
  return [
    ...primary.slice(0, primary.length - 1),
    NAV_ITEMS.find((item) => item.key === view)!,
  ];
}

const VIEW_TITLES: Record<ViewKey, string> = {
  today: "Zentrale",
  tasks: "Aufgaben",
  calendar: "Kalender",
  finance: "Finanzen",
  documents: "Unterlagen",
  applications: "Bewerbungen",
  contacts: "Kontakte",
  journal: "Tagebuch",
};

const XP_GOAL_FIELDS: Array<{
  key: keyof XpGoals;
  progressKey: keyof XpProgressByPeriod;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    key: "daily",
    progressKey: "day",
    label: "Tagesziel",
    shortLabel: "Heute",
    description: "XP seit Mitternacht in Berliner Zeit.",
  },
  {
    key: "weekly",
    progressKey: "week",
    label: "Wochenziel",
    shortLabel: "Woche",
    description: "XP seit Montagmorgen.",
  },
  {
    key: "monthly",
    progressKey: "month",
    label: "Monatsziel",
    shortLabel: "Monat",
    description: "XP seit dem ersten Tag des Monats.",
  },
];

const uid = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const dateAtNine = (value: string): string | null =>
  zonedDateTimeToIso(value, "09:00");

const localDateTimeInput = (minutesFromNow = 60): string => {
  return zonedDateTimeInput(Date.now() + minutesFromNow * 60_000);
};

const daysFromNow = (value: string): number => calendarDayDifference(value);

function reconcileCompletedTaskRewards(
  state: AppState,
  tasks: Task[],
): AppState {
  let gamification =
    state.gamification ?? createDefaultGamification(state.points, state.updatedAt);
  for (const task of tasks
    .filter((candidate) => candidate.completed)
    .sort((left, right) =>
      (left.completedAt ?? left.updatedAt ?? "").localeCompare(
        right.completedAt ?? right.updatedAt ?? "",
      ),
    )) {
    gamification = markTaskCompletionForRhythm(gamification, task.id);
    const profile = gamification.profiles.find(
      (candidate) => candidate.taskId === task.id && candidate.confirmedAt,
    );
    if (!profile) continue;
    gamification = applyTaskCompletionReward({
      gamification,
      task,
      allTasks: tasks,
      profile,
      completedAt: task.completedAt ?? task.updatedAt ?? state.updatedAt,
    }).gamification;
  }
  return { ...withGamification(state, gamification), tasks };
}

const formatFileSize = (bytes: number): string =>
  bytes === 0
    ? "0 KB"
    : bytes < 1_048_576
      ? `${Math.max(1, Math.round(bytes / 1_024))} KB`
      : `${(bytes / 1_048_576).toFixed(1).replace(".", ",")} MB`;

function XpGoalMeter({
  className,
  label,
  period,
  progress,
  showDetail = false,
}: {
  className: string;
  label: string;
  period: keyof XpProgressByPeriod;
  progress: XpGoalProgress;
  showDetail?: boolean;
}) {
  const visiblePercentage = Math.min(100, progress.percentage);
  const remainingXp = Math.max(0, progress.goalXp - progress.earnedXp);
  return (
    <div
      aria-label={`${label}: ${progress.earnedXp} von ${progress.goalXp} XP`}
      className={`${className} ${progress.goalReached ? "goal-reached" : ""}`}
      data-period={period}
    >
      <div className="xp-goal-meter-heading">
        <span>{label}</span>
        <small>{progress.percentage} %</small>
      </div>
      <strong>
        {progress.earnedXp.toLocaleString("de-DE")}
        <small> / {progress.goalXp.toLocaleString("de-DE")} XP</small>
      </strong>
      <div
        aria-label={`${label}: ${visiblePercentage} Prozent des Ziels erreicht`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={visiblePercentage}
        className="xp-goal-track"
        role="progressbar"
      >
        <span style={{ width: `${visiblePercentage}%` }} />
      </div>
      {showDetail ? (
        <p>
          {progress.goalReached
            ? progress.earnedXp > progress.goalXp
              ? `Ziel erreicht · ${(
                  progress.earnedXp - progress.goalXp
                ).toLocaleString("de-DE")} XP darüber`
              : "Ziel erreicht"
            : `${remainingXp.toLocaleString("de-DE")} XP bis zum Ziel`}
        </p>
      ) : null}
    </div>
  );
}

function MilestoneCelebrationDialog({
  celebration,
  gamification,
  onClose,
}: {
  celebration: { title: string; detail: string; reachedXp: number };
  gamification: GamificationState;
  onClose: () => void;
}) {
  const dialogRef = useModalDialog<HTMLElement>(onClose);
  return (
    <div
      className="milestone-celebration-backdrop"
      onMouseDown={onClose}
      role="presentation"
    >
      <section
        aria-labelledby="milestone-celebration-title"
        aria-modal="true"
        className={`milestone-celebration mode-${gamification.rewardMode.toLowerCase()}`}
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="celebration-burst" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <span className="eyebrow">Fortschrittsetappe erreicht</span>
        <strong className="celebration-score">
          {celebration.reachedXp.toLocaleString("de-DE")} XP
        </strong>
        <h2 id="milestone-celebration-title">{celebration.title}</h2>
        <p>{celebration.detail}</p>
        <small>
          {REWARD_MODE_LABELS[gamification.rewardMode]} · dein gemeinsamer
          Fortschritt bleibt erhalten
        </small>
        <button
          className="button button-primary"
          data-dialog-initial-focus
          onClick={onClose}
          type="button"
        >
          Weiter im Flow
        </button>
      </section>
    </div>
  );
}

type LifeOsAppProps = {
  initialState: AppState;
  integrations: IntegrationConfig;
};

export function LifeOsApp({
  initialState,
  integrations,
}: LifeOsAppProps) {
  const [view, setView] = useState<ViewKey>(() =>
    typeof window === "undefined" ? "today" : viewFromUrl(window.location.href),
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        window.localStorage.getItem(SIDEBAR_PREFERENCE_KEY) === "collapsed"
      );
    } catch {
      return false;
    }
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureKind, setCaptureKind] = useState<CaptureKind>("task");
  const [taskDraft, setTaskDraft] = useState<Task | null>(null);
  const [quickAction, setQuickAction] = useState<QuickActionKind | null>(null);
  const [applicationDraft, setApplicationDraft] =
    useState<ApplicationProcess | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contactCreateRequest, setContactCreateRequest] = useState(0);
  const [milestoneCelebration, setMilestoneCelebration] = useState<{
    title: string;
    detail: string;
    reachedXp: number;
  } | null>(null);
  const [selectedDocument, setSelectedDocument] =
    useState<DocumentRef | null>(null);
  const [notice, setNotice] = useState("");
  const [externalEvents, setExternalEvents] = useState<CalendarEvent[]>([]);
  const [calendarLive, setCalendarLive] = useState(false);
  const [planningReport, setPlanningReport] =
    useState<PlanningHealthReport | null>(null);
  const [planningLoading, setPlanningLoading] = useState(false);
  const [planningError, setPlanningError] = useState("");
  const [taskStatus, setTaskStatus] = useState<GoogleTasksStatus | null>(null);
  const [taskLists, setTaskLists] = useState<GoogleTaskList[]>([]);
  const [workspaceStatus, setWorkspaceStatus] =
    useState<GoogleWorkspaceStatus | null>(null);
  const [workspaceStatusError, setWorkspaceStatusError] = useState("");
  const [taskSyncing, setTaskSyncing] = useState(false);
  const [taskError, setTaskError] = useState("");
  const [taskConnectUrl, setTaskConnectUrl] = useState("");
  const [taskActionId, setTaskActionId] = useState("");
  const [rewardTaskId, setRewardTaskId] = useState("");
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const taskInitialLoadStarted = useRef(false);
  const planningInitialLoadStarted = useRef(false);
  const planningRequestActive = useRef(false);
  const planningReconciledRevision = useRef(initialState.revision);
  const driveExplorer = useDriveExplorer();
  const clearSelectedDriveFile = driveExplorer.selectFile;
  const {
    state,
    ready,
    syncStatus,
    persistedRevision,
    updateState,
    exportBackup,
    importBackup,
    acceptRemoteState,
  } = useGerriState(initialState);
  const pendingLegacyTasks = state.pendingTaskImports ?? [];

  useEffect(() => {
    const syncViewFromHistory = () => setView(viewFromUrl(window.location.href));
    window.addEventListener("popstate", syncViewFromHistory);
    return () => window.removeEventListener("popstate", syncViewFromHistory);
  }, []);

  useEffect(() => {
    document.title = `${VIEW_TITLES[view]} – Gerris Kompass`;
  }, [view]);

  useEffect(() => {
    const refreshCurrentTime = () => setCurrentTime(Date.now());
    const refreshVisibleTime = () => {
      if (document.visibilityState === "visible") refreshCurrentTime();
    };
    refreshCurrentTime();
    const timer = window.setInterval(refreshCurrentTime, 60_000);
    window.addEventListener("focus", refreshCurrentTime);
    document.addEventListener("visibilitychange", refreshVisibleTime);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshCurrentTime);
      document.removeEventListener("visibilitychange", refreshVisibleTime);
    };
  }, []);

  const refreshPlanning = useCallback(
    async (reason: string, forceDryRun = false) => {
      if (planningRequestActive.current) return null;
      planningRequestActive.current = true;
      setPlanningLoading(true);
      setPlanningError("");
      try {
        const result = await reconcilePlanning(reason, forceDryRun);
        setPlanningReport(result.report);
        return result.report;
      } catch (caught) {
        setPlanningError(
          caught instanceof Error
            ? caught.message
            : "Der Planungsstand konnte nicht aktualisiert werden.",
        );
        try {
          const report = await getPlanningReport();
          setPlanningReport(report);
          return report;
        } catch {
          return null;
        }
      } finally {
        planningRequestActive.current = false;
        setPlanningLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!ready || planningInitialLoadStarted.current) return;
    planningInitialLoadStarted.current = true;
    planningReconciledRevision.current = state.revision;
    void refreshPlanning("app-start");
  }, [ready, refreshPlanning, state.revision]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(
      () => void refreshPlanning("freshness-check"),
      10 * 60 * 1_000,
    );
    return () => window.clearInterval(timer);
  }, [ready, refreshPlanning]);

  useEffect(() => {
    if (!ready || !planningInitialLoadStarted.current) return;
    if (planningReconciledRevision.current === state.revision) return;
    const revision = state.revision;
    const timer = window.setTimeout(() => {
      planningReconciledRevision.current = revision;
      void refreshPlanning("source-change");
    }, 1_100);
    return () => window.clearTimeout(timer);
  }, [ready, refreshPlanning, state.revision]);

  const replaceTasks = useCallback(
    (tasks: Task[]) => {
      updateState((current) => reconcileCompletedTaskRewards(current, tasks));
    },
    [updateState],
  );

  const rememberGoogleError = useCallback(
    (caught: unknown, fallback: string) => {
      setTaskError(caught instanceof Error ? caught.message : fallback);
      if (caught instanceof GoogleClientError && caught.connectUrl) {
        setTaskConnectUrl(caught.connectUrl);
      }
    },
    [],
  );

  const refreshWorkspaceStatus = useCallback(async () => {
    setWorkspaceStatusError("");
    try {
      setWorkspaceStatus(await getGoogleWorkspaceStatus());
    } catch (caught) {
      setWorkspaceStatusError(
        caught instanceof Error
          ? caught.message
          : "Der Google-Status konnte nicht geladen werden.",
      );
    }
  }, []);

  const refreshTasks = useCallback(async () => {
    setTaskSyncing(true);
    setTaskError("");
    try {
      let nextStatus = await getGoogleTasksStatus();
      if (nextStatus.authorized) {
        const provisioned = await provisionGoogleTasks();
        nextStatus = { ...nextStatus, taskList: provisioned.taskList };
      }
      setTaskStatus(nextStatus);
      setTaskConnectUrl(nextStatus.connectUrl);
      if (!nextStatus.authorized) return;
      const [tasks, taskListPayload] = await Promise.all([
        listGoogleTasks(),
        listGoogleTaskLists(),
      ]);
      setTaskLists(taskListPayload.lists);
      replaceTasks(tasks);
    } catch (caught) {
      rememberGoogleError(caught, "Google Tasks konnte nicht geladen werden.");
    } finally {
      setTaskSyncing(false);
    }
  }, [rememberGoogleError, replaceTasks]);

  useEffect(() => {
    if (!ready || taskInitialLoadStarted.current) return;
    taskInitialLoadStarted.current = true;
    let active = true;
    const load = async () => {
      setTaskSyncing(true);
      const cachedTasks = [
        ...state.tasks,
        ...(state.pendingTaskImports ?? []),
      ].filter(
        (task, index, tasks) =>
          tasks.findIndex((candidate) => candidate.id === task.id) === index,
      );
      try {
        const [taskStatusResult, workspaceStatusResult] = await Promise.allSettled([
          getGoogleTasksStatus(),
          getGoogleWorkspaceStatus(),
        ]);
        if (taskStatusResult.status === "rejected") {
          throw taskStatusResult.reason;
        }
        const loadedTaskStatus = taskStatusResult.value;
        const nextWorkspaceStatus =
          workspaceStatusResult.status === "fulfilled"
            ? workspaceStatusResult.value
            : null;
        let nextStatus = loadedTaskStatus;
        if (!active) return;
        setWorkspaceStatusError(
          workspaceStatusResult.status === "rejected"
            ? workspaceStatusResult.reason instanceof Error
              ? workspaceStatusResult.reason.message
              : "Der Google-Status konnte nicht geladen werden."
            : "",
        );
        if (nextStatus.authorized) {
          const provisioned = await provisionGoogleTasks();
          nextStatus = { ...nextStatus, taskList: provisioned.taskList };
        }
        if (!active) return;
        setTaskStatus(nextStatus);
        setWorkspaceStatus(nextWorkspaceStatus);
        setTaskConnectUrl(nextStatus.connectUrl);
        if (!nextStatus.authorized) return;
        const [googleTasks, taskListPayload] = await Promise.all([
          listGoogleTasks(),
          listGoogleTaskLists(),
        ]);
        if (!active) return;
        setTaskLists(taskListPayload.lists);
        const googleIds = new Set(
          googleTasks.flatMap((task) =>
            [task.id, task.legacyId].filter(
              (value): value is string => typeof value === "string" && value.length > 0,
            ),
          ),
        );
        const pendingTasks = cachedTasks.filter(
          (task) => !task.taskListId && !googleIds.has(task.id),
        );
        updateState((current) => ({
          ...reconcileCompletedTaskRewards(current, googleTasks),
          pendingTaskImports: pendingTasks,
        }));
        setTaskError("");
      } catch (caught) {
        if (active) {
          rememberGoogleError(
            caught,
            "Google Tasks konnte nicht geladen werden.",
          );
        }
      } finally {
        if (active) setTaskSyncing(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [
    ready,
    rememberGoogleError,
    state.pendingTaskImports,
    state.tasks,
    updateState,
  ]);

  useEffect(() => {
    let active = true;
    const loadCalendar = async () => {
      try {
        const response = await fetch("/api/calendar");
        const payload = await responsePayload<{
          events?: CalendarEvent[];
          source?: string;
          error?: string;
        }>(response);
        if (!response.ok || !Array.isArray(payload.events)) {
          throw new Error(payload.error || "Der Kalender konnte nicht geladen werden.");
        }
        if (!active) return;
        setExternalEvents(Array.isArray(payload.events) ? payload.events : []);
        setCalendarLive(
          payload.source === "google-calendar" ||
            payload.source === "google-calendar-api",
        );
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
      setTaskDraft(null);
      setQuickAction(null);
      setApplicationDraft(null);
      setSettingsOpen(false);
      setMilestoneCelebration(null);
      setSelectedDocument(null);
      setRewardTaskId("");
      clearSelectedDriveFile(null);
      setMobileSidebarOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [clearSelectedDriveFile]);

  const navigate = (next: ViewKey) => {
    if (next !== view) {
      window.history.pushState(
        { gerrisView: next },
        "",
        urlForView(window.location.href, next),
      );
    }
    setView(next);
    setMobileSidebarOpen(false);
    window.setTimeout(
      () => document.querySelector<HTMLElement>("main h1")?.focus(),
      0,
    );
  };

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(
          SIDEBAR_PREFERENCE_KEY,
          next ? "collapsed" : "expanded",
        );
      } catch {
        // Die App bleibt ohne lokale Darstellungspräferenz vollständig nutzbar.
      }
      return next;
    });
  };

  const openCapture = (kind: CaptureKind) => {
    setQuickAction(null);
    setTaskDraft(null);
    setCaptureKind(kind);
    setCaptureOpen(true);
  };

  const openTaskEditor = (task: Task) => {
    setQuickAction(null);
    setTaskDraft(task);
    setCaptureKind("task");
    setCaptureOpen(true);
  };

  const openQuickAction = (kind: QuickActionKind) => {
    setMobileSidebarOpen(false);
    if (kind === "application") setApplicationDraft(null);
    setCaptureOpen(false);
    setQuickAction(kind);
  };

  const openApplicationStudio = (application: ApplicationProcess) => {
    setMobileSidebarOpen(false);
    setCaptureOpen(false);
    setApplicationDraft(application);
    setQuickAction("application");
  };

  const finishTask = async (
    taskId: string,
    profile: TaskGamificationProfile | null,
  ) => {
    const task = state.tasks.find((candidate) => candidate.id === taskId);
    if (!task || task.completed || taskActionId) return;
    setTaskActionId(taskId);
    setTaskError("");
    try {
      const updated = await updateGoogleTask(task, {
        completed: true,
        progress: 100,
      });
      const completedAt = updated.completedAt || new Date().toISOString();
      updateState((current) => {
        const tasks = current.tasks.map((candidate) =>
          candidate.id === taskId ? updated : candidate,
        );
        const baseGamification =
          current.gamification ??
          createDefaultGamification(current.points, current.updatedAt);
        const withProfile = profile
          ? upsertTaskProfile(baseGamification, profile)
          : baseGamification;
        const reward = profile
          ? applyTaskCompletionReward({
              gamification: withProfile,
              task: updated,
              allTasks: tasks,
              profile,
              completedAt,
            }).gamification
          : markTaskCompletionForRhythm(withProfile, taskId);
        return { ...withGamification(current, reward), tasks };
      });
      setRewardTaskId("");
      setNotice(
        profile
          ? "In Google Tasks erledigt · Belohnung gespeichert"
          : "In Google Tasks erledigt · bewusst ohne Belohnung",
      );
    } catch (caught) {
      setNotice(
        caught instanceof Error
          ? caught.message
          : "Die Aufgabe konnte nicht abgeschlossen werden.",
      );
      rememberGoogleError(
        caught,
        "Die Aufgabe konnte nicht abgeschlossen werden.",
      );
    } finally {
      setTaskActionId("");
    }
  };

  const completeTask = async (taskId: string) => {
    const task = state.tasks.find((candidate) => candidate.id === taskId);
    if (!task || task.completed || taskActionId) return;
    const profile = state.gamification?.profiles.find(
      (candidate) => candidate.taskId === taskId,
    );
    if (!profile?.confirmedAt) {
      setRewardTaskId(taskId);
      return;
    }
    await finishTask(taskId, profile);
  };

  const reopenTask = async (taskId: string) => {
    const task = state.tasks.find((candidate) => candidate.id === taskId);
    if (!task || !task.completed || taskActionId) return;
    setTaskActionId(taskId);
    setTaskError("");
    try {
      const updated = await updateGoogleTask(task, {
        completed: false,
        progress: 0,
      });
      updateState((current) => ({
        ...current,
        tasks: current.tasks.map((candidate) =>
          candidate.id === taskId ? updated : candidate,
        ),
      }));
      setNotice("Aufgabe in Google Tasks wieder geöffnet · Fortschritt auf 0 % gesetzt");
    } catch (caught) {
      rememberGoogleError(caught, "Die Aufgabe konnte nicht geöffnet werden.");
    } finally {
      setTaskActionId("");
    }
  };

  const removeTask = async (taskId: string) => {
    const task = state.tasks.find((candidate) => candidate.id === taskId);
    if (!task || taskActionId) return;
    const deletePrompt = task.assigned
      ? `„${task.title}“ wurde dir über einen anderen Google-Dienst zugewiesen. Wirklich auch aus Google Tasks löschen?`
      : `„${task.title}“ dauerhaft aus Google Tasks löschen?`;
    if (!window.confirm(deletePrompt)) {
      return;
    }
    setTaskActionId(taskId);
    setTaskError("");
    try {
      await deleteGoogleTask(task);
      updateState((current) => ({
        ...current,
        tasks: current.tasks.filter((candidate) => candidate.id !== taskId),
      }));
      setNotice("Aufgabe aus Google Tasks gelöscht");
    } catch (caught) {
      rememberGoogleError(caught, "Die Aufgabe konnte nicht gelöscht werden.");
    } finally {
      setTaskActionId("");
    }
  };

  const markCostPaid = (costId: string) => {
    const cost = state.costs.find((candidate) => candidate.id === costId);
    if (!cost || cost.status === "paid") return;
    const gamification =
      state.gamification ?? createDefaultGamification(state.points, state.updatedAt);
    const reward = applyCostPaymentReward(
      gamification,
      costId,
      cost.title,
      new Date().toISOString(),
    );
    updateState((current) => ({
      ...withGamification(current, reward.gamification),
      costs: current.costs.map((candidate) =>
        candidate.id === costId ? { ...candidate, status: "paid" } : candidate,
      ),
    }));
    setNotice(
      reward.entry
        ? `Zahlung als erledigt markiert · ${reward.entry.xpDelta} XP`
        : "Zahlung als erledigt markiert",
    );
  };

  const saveTask = async (task: Task): Promise<boolean> => {
    if (taskActionId) return false;
    setTaskActionId("neu");
    setTaskError("");
    try {
      const created = await createGoogleTask(task);
      updateState((current) => ({
        ...current,
        tasks: [created, ...current.tasks],
      }));
      setNotice("Aufgabe in Google Tasks gespeichert");
      return true;
    } catch (caught) {
      rememberGoogleError(
        caught,
        "Die Aufgabe konnte nicht in Google Tasks gespeichert werden.",
      );
      return false;
    } finally {
      setTaskActionId("");
    }
  };

  const saveTaskChanges = async (task: Task): Promise<boolean> => {
    const existing = state.tasks.find((candidate) => candidate.id === task.id);
    if (!existing || taskActionId) return false;
    setTaskActionId(task.id);
    setTaskError("");
    try {
      const updated = await updateGoogleTask(existing, {
        title: task.title,
        dueAt: task.dueAt,
        quadrant: task.quadrant,
        estimateMinutes: task.estimateMinutes,
      });
      updateState((current) => ({
        ...current,
        tasks: current.tasks.map((candidate) =>
          candidate.id === updated.id ? updated : candidate,
        ),
      }));
      setNotice("Aufgabe in Google Tasks aktualisiert");
      return true;
    } catch (caught) {
      rememberGoogleError(
        caught,
        "Die Aufgabe konnte nicht in Google Tasks aktualisiert werden.",
      );
      return false;
    } finally {
      setTaskActionId("");
    }
  };

  const migrateLegacyTasks = async () => {
    if (!pendingLegacyTasks.length || taskActionId) return;
    setTaskActionId("migration");
    setTaskError("");
    try {
      const result = await bootstrapGoogleTasks(pendingLegacyTasks);
      const googleTasks = await listGoogleTasks();
      updateState((current) => ({
        ...current,
        tasks: googleTasks,
        pendingTaskImports: [],
      }));
      setNotice(
        `${result.imported} Aufgaben in Google Tasks übernommen · ${result.reused} wiederverwendet`,
      );
    } catch (caught) {
      rememberGoogleError(
        caught,
        "Die bisherigen Aufgaben konnten nicht übernommen werden.",
      );
    } finally {
      setTaskActionId("");
    }
  };

  const saveCost = (cost: Cost) => {
    updateState((current) => ({
      ...current,
      costs: [cost, ...current.costs],
    }));
    setNotice("Ausgabe gespeichert");
  };

  const saveIncome = (income: Income) => {
    updateState((current) => ({
      ...current,
      incomes: [income, ...(current.incomes ?? [])],
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
    setExternalEvents((current) => [
      event,
      ...current.filter((candidate) => candidate.id !== event.id),
    ]);
    setCalendarLive(true);
  };

  const planCostInGoogleCalendar = async (cost: Cost) => {
    const date = isoDateInput(cost.dueAt);
    const startAt = zonedDateTimeToIso(date, "09:00");
    if (!startAt) {
      setNotice("Die Zahlungserinnerung hat kein gültiges Berliner Datum.");
      return;
    }
    const start = new Date(startAt);
    const event: CalendarEvent = {
      id: uid("event"),
      title: `Zahlung erinnern: ${cost.title}`,
      startAt,
      endAt: new Date(start.getTime() + 15 * 60_000).toISOString(),
      source: "kompass",
      kind: "payment",
      private: true,
      note: "Private Erinnerung aus Gerris Kompass",
      reminderMinutes: 1_440,
    };
    try {
      const response = await fetch("/api/calendar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
      });
      const payload = await responsePayload<{
        event?: CalendarEvent;
        error?: string;
      }>(response);
      if (!response.ok || !payload.event) {
        throw new Error(
          payload.error || "Die Erinnerung konnte nicht gespeichert werden.",
        );
      }
      saveEvent(payload.event);
      setNotice("Private Zahlungserinnerung in Google Kalender gespeichert");
    } catch (caught) {
      setNotice(
        caught instanceof Error
          ? caught.message
          : "Die Erinnerung konnte nicht gespeichert werden.",
      );
    }
  };

  const createApplication = (application: ApplicationProcess) => {
    updateState((current) => ({
      ...current,
      applications: [...current.applications, application],
    }));
  };

  const updateApplication = (application: ApplicationProcess) => {
    updateState((current) => ({
      ...current,
      applications: current.applications.map((candidate) =>
        candidate.id === application.id ? application : candidate,
      ),
    }));
  };

  const updateContacts = (contacts: AppState["contacts"]) => {
    updateState((current) => ({ ...current, contacts }));
  };

  const importMasterCv = (bundle: MasterCvImportBundle) => {
    updateState((current) => ({
      ...current,
      documents: [
        bundle.cvDocument,
        ...current.documents.filter(
          (document) => document.id !== bundle.cvDocument.id,
        ),
      ],
      masterCvDocumentId: bundle.cvDocument.id,
      careerPassportDocumentId: null,
      masterCvContent: bundle.masterCvContent,
    }));
    setNotice("Master-CV importiert");
  };

  const saveMasterCvContent = (content: MasterCvContent) => {
    updateState((current) => ({
      ...current,
      masterCvContent: content,
    }));
    setNotice("Bearbeiteter Master-CV gespeichert");
  };

  const attachApplicationArtifact = (
    applicationId: string,
    document: DocumentRef,
    artifact: ApplicationArtifact,
  ) => {
    updateState((current) => ({
      ...current,
      documents: [document, ...current.documents],
      applications: current.applications.map((application) =>
        application.id === applicationId
          ? {
              ...application,
              artifacts: [...application.artifacts, artifact],
            }
          : application,
      ),
    }));
  };

  const removeApplicationArtifact = (
    applicationId: string,
    artifactId: string,
  ) => {
    updateState((current) => ({
      ...current,
      applications: current.applications.map((application) =>
        application.id === applicationId
          ? {
              ...application,
              artifacts: application.artifacts.filter(
                (artifact) => artifact.id !== artifactId,
              ),
            }
          : application,
      ),
    }));
  };

  const saveDiary = (input: DiarySaveInput): string => {
    const today = isoDateInput();
    const now = new Date().toISOString();
    const journalId =
      state.journal.find((entry) => entry.date === today)?.id || uid("journal");
    updateState((current) => {
      const result = upsertDiaryEntry(
        current.journal,
        input,
        today,
        now,
        () => journalId,
      );
      const base = {
        ...current,
        rhythmDays: diaryRhythmDays(result.entries, today),
        journal: result.entries,
      };
      if (!input.closeDay) return base;
      const gamification =
        current.gamification ??
        createDefaultGamification(current.points, current.updatedAt);
      const reward = applyDayCloseReward(gamification, today, now);
      return withGamification(base, reward.gamification);
    });
    setNotice(
      input.closeDay
        ? "Tagesabschluss im Tagebuch gespeichert"
        : "Tagebuchnotiz gespeichert",
    );
    return journalId;
  };

  const saveCompactDiary = (
    text: string,
    mood: number,
    win: string,
    nextStep: string,
  ) => saveDiary({ text, mood, win, nextStep, appendToDay: true });

  const analyzeSavedDiary = async (
    journalId: string,
    input: DiarySaveInput,
  ): Promise<string> => {
    try {
      const result = await analyzeAndStoreJournal({
        journalId,
        date: isoDateInput(),
        text: input.text,
        mood: input.mood,
        win: input.win,
        nextStep: input.nextStep,
        weekPlan: input.weekPlan || "",
        report: planningReport,
      });
      await refreshPlanning("journal-analysis");
      return result.mode === "ai"
        ? `${result.analysis.summary} Vorschläge warten auf deine Bestätigung.`
        : `${result.analysis.summary} Vorschläge wurden lokal erstellt.`;
    } catch (caught) {
      return caught instanceof Error
        ? `Analysehinweis: ${caught.message}`
        : "Die optionale Analyse wird später erneut versucht.";
    }
  };

  const setDayIntent = async (
    date: string,
    kind: DayIntentKind | null,
  ): Promise<void> => {
    try {
      if (kind) {
        await savePlanningDayIntent({ date, kind });
      } else {
        await removePlanningDayIntent(date);
      }
      await refreshPlanning("day-intent-change");
      setNotice(kind ? "Tagesabsicht verbindlich gespeichert" : "Tagesabsicht entfernt");
    } catch (caught) {
      setNotice(
        caught instanceof Error
          ? caught.message
          : "Die Tagesabsicht konnte nicht gespeichert werden.",
      );
    }
  };

  const changePlanningMode = async (
    mode: "dry-run" | "safe",
  ): Promise<void> => {
    try {
      await setPlanningAutomationMode(mode);
      await refreshPlanning(
        mode === "safe" ? "safe-automation-activated" : "automation-paused",
      );
      setNotice(
        mode === "safe"
          ? "Sichere Automatik aktiviert"
          : "Automatik auf Dry-run zurückgestellt",
      );
    } catch (caught) {
      setNotice(
        caught instanceof Error
          ? caught.message
          : "Der Automatikmodus konnte nicht geändert werden.",
      );
    }
  };

  const scheduleDiarySuggestion = async (
    suggestion: DiaryPlanningSuggestion,
    date: string,
  ): Promise<boolean> => {
    if (taskActionId) return false;
    const existingTask =
      suggestion.sourceKind === "task"
        ? state.tasks.find((candidate) => candidate.id === suggestion.sourceId)
        : null;
    if (suggestion.sourceKind === "task" && !existingTask) return false;
    const actionId = existingTask?.id || suggestion.sourceId;
    const dueAt = dateAtNine(date);
    if (!dueAt) return false;
    setTaskActionId(actionId);
    setTaskError("");
    try {
      let planningHintDeferred = false;
      if (existingTask) {
        const updated = await updateGoogleTask(existingTask, { dueAt });
        updateState((current) => ({
          ...current,
          tasks: current.tasks.map((candidate) =>
            candidate.id === existingTask.id ? updated : candidate,
          ),
        }));
      } else {
        const task = await createGoogleTask({
          id: suggestion.sourceId,
          title: suggestion.title,
          notes: [
            suggestion.detail,
            `Aus der Abendplanung übernommen (${suggestion.sourceKind}).`,
          ]
            .filter(Boolean)
            .join("\n\n"),
          area: "alltag",
          quadrant:
            suggestion.priority === "critical" ? "do" : "plan",
          dueAt,
          estimateMinutes: suggestion.priority === "critical" ? 15 : 30,
          progress: 0,
          completed: false,
          confidential: true,
        });
        updateState((current) => ({
          ...current,
          tasks: [task, ...current.tasks],
        }));

        try {
          if (suggestion.sourceKind === "gap") {
            await updatePlanningGap(suggestion.sourceId, {
              action: "snooze",
              snoozedUntil: dueAt,
              note: `Als ToDo für ${date} eingeplant.`,
            });
          } else if (suggestion.sourceKind === "topic") {
            await updatePlanningTopic(suggestion.sourceId, {
              status: "snoozed",
              group: "scheduled",
              nextStep: suggestion.title,
              dueAt,
              snoozedUntil: dueAt,
            });
          }
          if (["gap", "topic"].includes(suggestion.sourceKind)) {
            await refreshPlanning("diary-plan-drop");
          }
        } catch {
          planningHintDeferred = true;
        }
      }
      setNotice(
        planningHintDeferred
          ? "ToDo gespeichert; der Planungshinweis wird beim nächsten Abgleich aktualisiert"
          : suggestion.sourceKind === "task"
          ? "Aufgabe auf den gewählten Tag verschoben"
          : "Inspiration als ToDo gespeichert",
      );
      return true;
    } catch (caught) {
      rememberGoogleError(
        caught,
        "Der Planungspunkt konnte nicht in Google Tasks übernommen werden.",
      );
      return false;
    } finally {
      setTaskActionId("");
    }
  };

  const changeRewardMode = (mode: RewardMode) => {
    updateState((current) => {
      const gamification =
        current.gamification ??
        createDefaultGamification(current.points, current.updatedAt);
      return withGamification(current, { ...gamification, rewardMode: mode });
    });
    setNotice("Belohnungswelt gewechselt · Fortschritt vollständig erhalten");
  };

  const changeCelebrations = (enabled: boolean) => {
    updateState((current) => {
      const gamification =
        current.gamification ??
        createDefaultGamification(current.points, current.updatedAt);
      return withGamification(current, {
        ...gamification,
        celebrationsEnabled: enabled,
      });
    });
  };

  const changeMilestoneStep = (milestoneStepXp: number) => {
    if (![100, 250, 500, 1000].includes(milestoneStepXp)) return;
    updateState((current) => {
      const gamification =
        current.gamification ??
        createDefaultGamification(current.points, current.updatedAt);
      return withGamification(current, { ...gamification, milestoneStepXp });
    });
    setNotice(`Neue Fortschrittsetappe: alle ${milestoneStepXp.toLocaleString("de-DE")} XP`);
  };

  const changeXpGoal = (period: keyof XpGoals, targetXp: number) => {
    if (!Number.isFinite(targetXp)) return;
    const limits = XP_GOAL_LIMITS[period];
    const normalizedTarget = Math.min(
      limits.max,
      Math.max(limits.min, Math.round(targetXp)),
    );
    updateState((current) => {
      const gamification =
        current.gamification ??
        createDefaultGamification(current.points, current.updatedAt);
      return withGamification(current, {
        ...gamification,
        xpGoals: {
          ...gamification.xpGoals,
          [period]: normalizedTarget,
        },
      });
    });
  };

  const changeAdaptiveFocus = (points: number) => {
    updateState((current) => {
      const gamification =
        current.gamification ??
        createDefaultGamification(current.points, current.updatedAt);
      return withGamification(current, {
        ...gamification,
        adaptiveWeights: {
          points,
          fantasy: 100 - points,
          lastAdjustedAt: null,
        },
      });
    });
    setNotice("Schwerpunkt für Momentum Realm angepasst");
  };

  const toggleRewardCatalogItem = (rewardId: string, active: boolean) => {
    updateState((current) => {
      const gamification =
        current.gamification ??
        createDefaultGamification(current.points, current.updatedAt);
      return withGamification(current, {
        ...gamification,
        rewardCatalog: gamification.rewardCatalog.map((reward) =>
          reward.id === rewardId ? { ...reward, active } : reward,
        ),
      });
    });
  };

  const redeemReward = (rewardId: string) => {
    const reward = currentGamification.rewardCatalog.find(
      (candidate) => candidate.id === rewardId && candidate.active,
    );
    if (!reward) {
      setNotice("Diese persönliche Belohnung ist nicht verfügbar");
      return;
    }
    if (
      !window.confirm(
        `„${reward.title}“ für ${reward.cost.toLocaleString("de-DE")} Klarpunkte einlösen?`,
      )
    ) {
      return;
    }
    const result = redeemPersonalReward(
      currentGamification,
      rewardId,
      new Date().toISOString(),
    );
    if (result.error) {
      setNotice(result.error);
      return;
    }
    if (!result.entry) {
      setNotice("Diese Einlösung wurde bereits verarbeitet");
      return;
    }
    updateState((current) => withGamification(current, result.gamification));
    setNotice(`Persönliche Belohnung eingelöst · ${reward.title}`);
  };

  const buildRewardWorld = (
    district: WorldDistrictKey,
    kind: WorldUpgradeKind,
  ) => {
    const cost = WORLD_UPGRADE_COSTS[kind];
    if (
      !window.confirm(
        `${WORLD_DISTRICT_LABELS[district]} mit „${cost.label}“ ausbauen und die angezeigten Ressourcen einsetzen?`,
      )
    ) {
      return;
    }
    const result = buildWorldUpgrade(
      currentGamification,
      district,
      kind,
      new Date().toISOString(),
    );
    if (result.error) {
      setNotice(result.error);
      return;
    }
    if (!result.entry) {
      setNotice("Dieser Ausbau wurde bereits verarbeitet");
      return;
    }
    updateState((current) => withGamification(current, result.gamification));
    setNotice(`${WORLD_DISTRICT_LABELS[district]} ausgebaut · ${cost.label}`);
  };

  const changeSurprises = (enabled: boolean) => {
    updateState((current) => {
      const gamification =
        current.gamification ??
        createDefaultGamification(current.points, current.updatedAt);
      return withGamification(current, { ...gamification, surprisesEnabled: enabled });
    });
  };

  const changeDrRoss = (enabled: boolean) => {
    updateState((current) => {
      const gamification =
        current.gamification ??
        createDefaultGamification(current.points, current.updatedAt);
      const hasApprovedContent = gamification.approvedMessages.some(
        (message) =>
          message.active &&
          message.contentType !== "GENERIC_AI" &&
          Boolean(message.approvedAt) &&
          Boolean(message.permissionReference.trim()),
      );
      return withGamification(current, {
        ...gamification,
        drRossEnabled: enabled && hasApprovedContent,
      });
    });
  };

  const changeDashboardKpi = (
    key: DashboardKpiKey,
    changes: Partial<Pick<DashboardSettings["kpis"][number], "enabled" | "target">>,
  ) => {
    updateState((current) => ({
      ...current,
      dashboardSettings: {
        kpis: current.dashboardSettings.kpis.map((kpi) =>
          kpi.key === key ? { ...kpi, ...changes } : kpi,
        ),
      },
    }));
  };

  const changeApplicationKpi = (
    key: ApplicationKpiKey,
    changes: {
      enabled?: boolean;
      period?: ApplicationKpiPeriod;
      target?: number;
    },
  ) => {
    updateState((current) => ({
      ...current,
      applicationKpiSettings: {
        goals: current.applicationKpiSettings.goals.map((goal) => {
          if (goal.key !== key) return goal;
          const next = {
            ...goal,
            enabled:
              typeof changes.enabled === "boolean"
                ? changes.enabled
                : goal.enabled,
          };
          if (
            changes.period &&
            typeof changes.target === "number" &&
            Number.isFinite(changes.target)
          ) {
            next.targets = {
              ...goal.targets,
              [changes.period]: Math.min(
                999,
                Math.max(0, Math.round(changes.target)),
              ),
            };
          }
          return next;
        }),
      },
    }));
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
          : syncStatus === "konflikt"
            ? "Änderungskonflikt – neu laden"
          : "Auf diesem Gerät gespeichert";
  const currentGamification =
    state.gamification ?? createDefaultGamification(state.points, state.updatedAt);
  const progressTotals = ledgerTotals(currentGamification.ledger);
  const xpProgress = useMemo(
    () =>
      xpProgressByPeriod(
        currentGamification.ledger,
        currentGamification.xpGoals,
        new Date(currentTime).toISOString(),
      ),
    [currentGamification.ledger, currentGamification.xpGoals, currentTime],
  );
  const celebrationCopy = completionMessage("CELEBRATE", currentGamification);
  const previousEarnedXp = useRef(progressTotals.earnedXp);
  const rewardTask = state.tasks.find((task) => task.id === rewardTaskId) ?? null;

  useEffect(() => {
    const previous = previousEarnedXp.current;
    const current = progressTotals.earnedXp;
    const step = currentGamification.milestoneStepXp;
    const previousMilestone = Math.floor(previous / step) * step;
    const currentMilestone = Math.floor(current / step) * step;

    if (
      currentGamification.celebrationsEnabled &&
      current > previous &&
      currentMilestone > previousMilestone
    ) {
      setMilestoneCelebration({
        title: `${currentMilestone.toLocaleString("de-DE")} XP erreicht`,
        detail: celebrationCopy.text,
        reachedXp: currentMilestone,
      });
    }
    previousEarnedXp.current = current;
  }, [
    celebrationCopy.text,
    currentGamification.celebrationsEnabled,
    currentGamification.milestoneStepXp,
    progressTotals.earnedXp,
  ]);

  const compactNavigation = mobileNavigationItems(view);

  if (!ready) {
    return (
      <main
        aria-busy="true"
        aria-labelledby="app-loading-title"
        className="app-loading-screen"
      >
        <div className="app-loading-card">
          <span aria-hidden="true" className="app-loading-mark">
            G
          </span>
          <span className="eyebrow">Privater Arbeitsbereich</span>
          <h1 id="app-loading-title">Gerris Kompass wird vorbereitet</h1>
          <p>
            Dein persönlicher Stand wird sicher geladen. Erst danach werden
            Aufgaben, Termine und Unterlagen angezeigt.
          </p>
          <div aria-hidden="true" className="app-loading-progress">
            <span />
          </div>
          <small>Daten werden geladen …</small>
        </div>
      </main>
    );
  }

  return (
    <div
      className={`app-shell ${sidebarCollapsed ? "sidebar-is-collapsed" : ""}`}
    >
      <a className="skip-link" href="#main-content">
        Zum Inhalt springen
      </a>
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
            onClick={toggleSidebar}
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
              {item.key === "applications" &&
              state.applications.some(
                (application) =>
                  application.nextStepAt &&
                  daysFromNow(application.nextStepAt) >= 0 &&
                  daysFromNow(application.nextStepAt) <= 7 &&
                  !["rejected", "withdrawn", "closed"].includes(
                    application.status,
                  ),
              ) ? (
                <span className="nav-alert" aria-label="Anstehende Bewerbungsschritte">
                  {
                    state.applications.filter(
                      (application) =>
                        application.nextStepAt &&
                        daysFromNow(application.nextStepAt) >= 0 &&
                        daysFromNow(application.nextStepAt) <= 7 &&
                        !["rejected", "withdrawn", "closed"].includes(
                          application.status,
                        ),
                    ).length
                  }
                </span>
              ) : null}
              {item.key === "calendar" &&
              (planningReport?.criticalCount || planningReport?.importantCount) ? (
                <span className="nav-alert" aria-label="Offene Planungslücken">
                  {(planningReport?.criticalCount || 0) +
                    (planningReport?.importantCount || 0)}
                </span>
              ) : null}
              {item.key === "journal" &&
              planningReport?.openTopics.some((topic) => topic.status !== "resolved") ? (
                <span className="nav-alert" aria-label="Offene Themen">
                  {
                    planningReport.openTopics.filter(
                      (topic) => topic.status !== "resolved",
                    ).length
                  }
                </span>
              ) : null}
            </button>
          ))}
        </nav>

        <SidebarQuickActions onAction={openQuickAction} />

        <div className="sidebar-divider" />

        <DriveSidebarTree
          collapsed={sidebarCollapsed}
          controller={driveExplorer}
          onNavigate={() => {
            navigate("documents");
          }}
        />

        <div className="sidebar-footer">
          <SidebarRewardProgress
            gamification={currentGamification}
            onOpenSettings={() => setSettingsOpen(true)}
          />
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
          <div className="topbar-context">
            <div>
              <span className="dayline">
                {formatDateLong(new Date().toISOString())}
              </span>
              <strong>{VIEW_TITLES[view]}</strong>
            </div>
            <div
              className="topbar-progress"
              aria-label="XP-Fortschritt insgesamt, heute, diese Woche und diesen Monat"
            >
              <div className="topbar-progress-total">
                <div>
                  <span>Gesamtfortschritt</span>
                  <strong>{progressTotals.earnedXp.toLocaleString("de-DE")} XP</strong>
                </div>
                <small>
                  Level {levelForXp(progressTotals.earnedXp)} ·{" "}
                  {progressTotals.balanceXp.toLocaleString("de-DE")} Klarpunkte verfügbar
                </small>
                <p>{celebrationCopy.text}</p>
              </div>
              <div className="topbar-period-progress">
                {XP_GOAL_FIELDS.map((field) => (
                  <XpGoalMeter
                    className="topbar-xp-goal"
                    key={field.key}
                    label={field.shortLabel}
                    period={field.progressKey}
                    progress={xpProgress[field.progressKey]}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="topbar-actions">
            <button
              aria-live="polite"
              className={`sync-state sync-${syncStatus}`}
              onClick={() => setSettingsOpen(true)}
              title="Synchronisierung und Datensicherung öffnen"
              type="button"
            >
              <span aria-hidden="true" />
              {syncCopy}
            </button>
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

        {view !== "today" ? (
          <PlanningHealthBanner
            error={planningError}
            loading={planningLoading}
            onNavigate={navigate}
            onRefresh={() => void refreshPlanning("manual")}
            report={planningReport}
          />
        ) : null}

        <main id="main-content" tabIndex={-1}>
          {view === "today" ? (
            <TodayView
              now={currentTime}
              externalEvents={externalEvents}
              onCompleteTask={completeTask}
              onNavigate={navigate}
              onOpenSettings={() => setSettingsOpen(true)}
              planningReport={planningReport}
              planningLoading={planningLoading}
              planningError={planningError}
              state={state}
              taskStatus={taskStatus}
            />
          ) : null}
          {view === "tasks" ? (
            <TasksView
              actionId={taskActionId}
              connectUrl={taskConnectUrl}
              error={taskError}
              onDeleteTask={removeTask}
              onCompleteTask={completeTask}
              onMigrate={() => void migrateLegacyTasks()}
              onNew={() => openCapture("task")}
              onEditTask={openTaskEditor}
              onRefresh={() => void refreshTasks()}
              onReopenTask={reopenTask}
              pendingLegacyCount={pendingLegacyTasks.length}
              state={state}
              status={taskStatus}
              syncing={taskSyncing}
            />
          ) : null}
          {view === "calendar" ? (
            <CalendarWorkspace
              calendarLive={calendarLive}
              externalEvents={externalEvents}
              integrations={integrations}
              now={currentTime}
              onEventsChange={setExternalEvents}
              onNewEvent={() => openCapture("event")}
              onPlanCost={planCostInGoogleCalendar}
              onPlanningModeChange={changePlanningMode}
              onPlanningRefresh={refreshPlanning}
              onSetDayIntent={setDayIntent}
              planningBusy={planningLoading}
              planningError={planningError}
              planningReport={planningReport}
              state={state}
              workspaceStatus={workspaceStatus}
            />
          ) : null}
          {view === "finance" ? (
            <FinanceView
              integrations={integrations}
              onMarkPaid={markCostPaid}
              onNewCost={() => openCapture("cost")}
              onNewIncome={() => openCapture("income")}
              onPlanCost={planCostInGoogleCalendar}
              onUpdateBalances={updateAccountBalances}
              state={state}
            />
          ) : null}
          {view === "documents" ? (
            <DocumentsView
              driveController={driveExplorer}
              integrations={integrations}
              onCloseSelected={() => setSelectedDocument(null)}
              onLinkDocument={() => openCapture("document")}
              onOpen={openDocument}
              onUpload={() => openQuickAction("upload")}
              selectedDocument={selectedDocument}
              state={state}
              toast={setNotice}
            />
          ) : null}
          {view === "applications" ? (
            <ApplicationsView
              onAttachArtifact={attachApplicationArtifact}
              onCreateApplication={createApplication}
              onImportMasterCv={importMasterCv}
              onOpenStudio={openApplicationStudio}
              onRemoveArtifact={removeApplicationArtifact}
              onSaveMasterCvContent={saveMasterCvContent}
              onUpdateApplication={updateApplication}
              state={state}
              toast={setNotice}
            />
          ) : null}
          {view === "contacts" ? (
            <ContactsView
              contacts={state.contacts}
              createRequest={contactCreateRequest}
              onChange={updateContacts}
              toast={setNotice}
            />
          ) : null}
          {view === "journal" ? (
            <DiaryView
              externalEvents={externalEvents}
              onSave={saveDiary}
              onAnalyze={analyzeSavedDiary}
              onScheduleSuggestion={scheduleDiarySuggestion}
              planningReport={planningReport}
              state={state}
              taskActionId={taskActionId}
              tasksConnected={Boolean(taskStatus?.authorized)}
            />
          ) : null}
        </main>
      </section>

      <button
        className="quick-capture-button"
        onClick={() =>
          view === "applications"
            ? openQuickAction("application")
            : view === "contacts"
              ? setContactCreateRequest((current) => current + 1)
            : view === "documents"
              ? openQuickAction("upload")
              : openCapture(
                  view === "finance"
                    ? "cost"
                    : view === "calendar"
                      ? "event"
                      : view === "journal"
                        ? "journal"
                        : "task",
                )
        }
        type="button"
      >
        <span>+</span>
        {view === "applications"
          ? "Bewerbung erstellen"
          : view === "contacts"
            ? "Kontakt anlegen"
          : view === "documents"
            ? "Datei hochladen"
          : view === "journal"
            ? "Notiz erfassen"
            : "Neu erfassen"}
      </button>

      <nav className="mobile-nav" aria-label="Mobile Hauptnavigation">
        {compactNavigation.map((item) => (
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
        <button
          aria-expanded={mobileSidebarOpen}
          onClick={() => setMobileSidebarOpen(true)}
          type="button"
        >
          <span aria-hidden="true">•••</span>
          Mehr
        </button>
      </nav>

      {captureOpen ? (
        <CaptureDialog
          calendarConnectUrl={
            workspaceStatus?.capabilities.calendar.connectUrl || ""
          }
          calendarReminderGranted={Boolean(
            workspaceStatus?.capabilities.calendar.granted,
          )}
          initialKind={captureKind}
          initialTask={taskDraft}
          integrations={integrations}
          onClose={() => {
            setCaptureOpen(false);
            setTaskDraft(null);
          }}
          onSaveCost={saveCost}
          onSaveDocument={saveDocument}
          onSaveEvent={saveEvent}
          onSaveIncome={saveIncome}
          onSaveJournal={saveCompactDiary}
          onSaveTask={saveTask}
          onUpdateTask={saveTaskChanges}
          taskLists={taskLists}
          toast={setNotice}
        />
      ) : null}

      {quickAction ? (
        <QuickActionDialog
          documents={state.documents}
          integrations={integrations}
          kind={quickAction}
          applicationDraft={applicationDraft}
          masterCvDocumentId={state.masterCvDocumentId}
          masterCvContent={state.masterCvContent}
          masterCvPersisted={
            syncStatus === "synchronisiert" &&
            persistedRevision === state.revision
          }
          onClose={() => {
            setQuickAction(null);
            setApplicationDraft(null);
          }}
          onSaveDocument={saveDocument}
          onUpdateApplication={updateApplication}
          toast={setNotice}
        />
      ) : null}

      {settingsOpen ? (
        <SettingsDialog
          applicationKpiSettings={state.applicationKpiSettings}
          dashboardSettings={state.dashboardSettings}
          gamification={currentGamification}
          integrations={integrations}
          onAdaptiveFocusChange={changeAdaptiveFocus}
          onCelebrationsChange={changeCelebrations}
          onClose={() => setSettingsOpen(false)}
          onDrRossChange={changeDrRoss}
          onDashboardKpiChange={changeDashboardKpi}
          onApplicationKpiChange={changeApplicationKpi}
          onAcceptRemoteState={acceptRemoteState}
          onExport={exportBackup}
          onImport={(raw) => {
            try {
              importBackup(raw);
              void refreshTasks();
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
            reset.tasks = state.tasks;
            reset.pendingTaskImports = state.pendingTaskImports;
            updateState(() => reset);
            setNotice("Beispieldaten zurückgesetzt · Google Tasks bleibt erhalten");
          }}
          onRefreshGoogle={() => void refreshWorkspaceStatus()}
          onMilestoneStepChange={changeMilestoneStep}
          onXpGoalChange={changeXpGoal}
          onRewardCatalogToggle={toggleRewardCatalogItem}
          onRedeemReward={redeemReward}
          onRewardModeChange={changeRewardMode}
          onBuildWorldUpgrade={buildRewardWorld}
          onSurprisesChange={changeSurprises}
          syncCopy={syncCopy}
          syncStatus={syncStatus}
          workspaceStatus={workspaceStatus}
          workspaceStatusError={workspaceStatusError}
          xpProgress={xpProgress}
        />
      ) : null}

      {milestoneCelebration ? (
        <MilestoneCelebrationDialog
          celebration={milestoneCelebration}
          gamification={currentGamification}
          onClose={() => setMilestoneCelebration(null)}
        />
      ) : null}

      {rewardTask ? (
        <RewardAssessmentDialog
          busy={taskActionId === rewardTask.id}
          existingProfile={
            currentGamification.profiles.find(
              (profile) => profile.taskId === rewardTask.id,
            ) ?? null
          }
          onClose={() => {
            if (!taskActionId) setRewardTaskId("");
          }}
          onCompleteWithoutReward={() => void finishTask(rewardTask.id, null)}
          onConfirm={(profile) => void finishTask(rewardTask.id, profile)}
          task={rewardTask}
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

function SidebarRewardProgress({
  gamification,
  onOpenSettings,
}: {
  gamification: GamificationState;
  onOpenSettings: () => void;
}) {
  const totals = ledgerTotals(gamification.ledger);
  const level = levelForXp(totals.earnedXp);
  const nextMilestone =
    (Math.floor(totals.earnedXp / gamification.milestoneStepXp) + 1) *
    gamification.milestoneStepXp;
  const remainingXp = nextMilestone - totals.earnedXp;
  const latestReward = [...gamification.ledger]
    .reverse()
    .find((entry) => entry.xpDelta > 0 && entry.kind !== "OPENING_BALANCE");

  return (
    <section className={`sidebar-reward-progress mode-${gamification.rewardMode.toLowerCase()}`}>
      <div className="sidebar-reward-heading">
        <span>Deine Belohnungswelt</span>
        <button onClick={onOpenSettings} type="button">
          Anpassen
        </button>
      </div>
      <strong>
        {gamification.rewardMode === "ADAPTIVE"
          ? "Adaptive Belohnungswelt"
          : REWARD_MODE_LABELS[gamification.rewardMode]}
      </strong>
      {gamification.rewardMode === "POINTS" ? (
        <div className="sidebar-reward-details">
          <span>
            <b>{totals.balanceXp.toLocaleString("de-DE")}</b> verfügbar
          </span>
          <span>
            <b>{remainingXp.toLocaleString("de-DE")}</b> XP bis zur Etappe
          </span>
        </div>
      ) : null}
      {gamification.rewardMode === "FANTASY" ? (
        <div className="sidebar-reward-details">
          <span>
            <b>{totals.energy}</b> Energie · {totals.runes} Runen
          </span>
          <span>
            <b>{gamification.world.upgrades.length}</b> Welten-Ausbaustufen
          </span>
        </div>
      ) : null}
      {gamification.rewardMode === "ADAPTIVE" ? (
        <div className="sidebar-reward-details">
          <span>
            <b>Level {level}</b> · {totals.balanceXp.toLocaleString("de-DE")} Klarpunkte
          </span>
          <span>
            <b>{gamification.adaptiveWeights.points} %</b> Klarheit ·{" "}
            {gamification.adaptiveWeights.fantasy} % Chronik
          </span>
        </div>
      ) : null}
      <div className="sidebar-reward-track" aria-label={`${remainingXp} XP bis zur nächsten Etappe`}>
        <span
          style={{
            width: `${((totals.earnedXp % gamification.milestoneStepXp) / gamification.milestoneStepXp) * 100}%`,
          }}
        />
      </div>
      <small>
        {latestReward
          ? `Zuletzt: ${latestReward.description}`
          : `Nächste Etappe bei ${nextMilestone.toLocaleString("de-DE")} XP`}
      </small>
    </section>
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

function TasksView({
  state,
  status,
  syncing,
  error,
  connectUrl,
  pendingLegacyCount,
  actionId,
  onCompleteTask,
  onReopenTask,
  onDeleteTask,
  onRefresh,
  onMigrate,
  onNew,
  onEditTask,
}: {
  state: AppState;
  status: GoogleTasksStatus | null;
  syncing: boolean;
  error: string;
  connectUrl: string;
  pendingLegacyCount: number;
  actionId: string;
  onCompleteTask: (taskId: string) => Promise<void>;
  onReopenTask: (taskId: string) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onRefresh: () => void;
  onMigrate: () => void;
  onNew: () => void;
  onEditTask: (task: Task) => void;
}) {
  const [filter, setFilter] = useState<TaskQuadrant | "all">("all");
  const visible = orderOpenTasks(
    state.tasks.filter(
      (task) => !task.completed && (filter === "all" || task.quadrant === filter),
    ),
  );
  const completed = orderCompletedTasks(
    state.tasks.filter((task) => task.completed),
  );
  const sourceCopy = status?.authorized
    ? `${status.googleEmail || "Google-Konto"} · ${status.taskList?.title || "Gerris Kompass"}`
    : status?.configured
      ? "Google-Konto noch nicht für Aufgaben freigegeben"
      : "Google Tasks ist noch nicht eingerichtet";

  return (
    <div className="view-stack">
      <PageIntro
        action={
          <button
            className="button button-primary"
            disabled={!status?.authorized}
            onClick={onNew}
            title={
              status?.authorized
                ? "Neue Google-Aufgabe erfassen"
                : "Zuerst Google Tasks verbinden"
            }
            type="button"
          >
            Aufgabe erfassen
          </button>
        }
        eyebrow="Aufgaben"
        title="Was ist als Nächstes dran?"
        copy="Google Tasks verwaltet deine Aufgaben. Priorität, Lebensbereich, Aufwand und Fortschritt bleiben im Kompass."
      />

      <section
        className={`google-source-card ${status?.authorized ? "is-connected" : ""}`}
        aria-label="Google-Tasks-Verbindung"
      >
        <div>
          <span className="eyebrow">Google Tasks</span>
          <h2>{status?.authorized ? "Google Tasks ist verbunden" : "Google Tasks verbinden"}</h2>
          <p>{sourceCopy}</p>
        </div>
        <div className="button-group">
          {status?.authorized ? (
            <button
              className="button button-soft"
              disabled={syncing}
              onClick={onRefresh}
              type="button"
            >
              {syncing ? "Wird abgeglichen …" : "Jetzt abgleichen"}
            </button>
          ) : status?.configured && connectUrl ? (
            <a className="button button-primary" href={connectUrl}>
              Google Tasks verbinden
            </a>
          ) : null}
        </div>
      </section>

      {pendingLegacyCount && status?.authorized ? (
        <section className="migration-card" aria-label="Aufgaben übernehmen">
          <div>
            <strong>
              {pendingLegacyCount} bisherige Kompass-Aufgaben gefunden
            </strong>
            <p>
              Übernimm sie einmalig in die Liste „Gerris Kompass“. Danach liegen
              deine Aufgaben in Google Tasks.
            </p>
          </div>
          <button
            className="button button-primary"
            disabled={actionId === "migration"}
            onClick={onMigrate}
            type="button"
          >
            {actionId === "migration"
              ? "Wird übernommen …"
              : "Jetzt in Google Tasks übernehmen"}
          </button>
        </section>
      ) : null}

      {error ? (
        <div className="google-inline-error" role="alert">
          <span>{error}</span>
          {status?.configured && connectUrl ? (
            <a href={connectUrl}>Berechtigung erneuern</a>
          ) : null}
        </div>
      ) : null}

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
                      <span>
                        {task.taskListTitle || LIFE_AREA_LABELS[task.area]}
                      </span>
                      <small>
                        {status?.authorized ? "Google Tasks" : "Lokaler Altbestand"}
                        {task.confidential ? " · Privat" : ""}
                      </small>
                    </div>
                    <h3>{task.title}</h3>
                    <p>
                      {task.dueAt ? formatRelativeDate(task.dueAt) : "Ohne Frist"} ·{" "}
                      {task.estimateMinutes} Minuten
                    </p>
                    {task.reminderAt ? (
                      <p className="task-reminder-copy">
                        E-Mail-Erinnerung am {formatDate(task.reminderAt)} um{" "}
                        {formatTime(task.reminderAt)} Uhr
                      </p>
                    ) : null}
                    <div className="task-progress labeled">
                      <span style={{ width: `${task.progress}%` }} />
                      <small>{task.progress}%</small>
                    </div>
                    <div className="task-card-actions">
                      <button
                        className="button button-ghost"
                        disabled={Boolean(actionId) || !status?.authorized}
                        onClick={() => onEditTask(task)}
                        type="button"
                      >
                        Bearbeiten
                      </button>
                      <button
                        className="button button-soft"
                        disabled={Boolean(actionId) || !status?.authorized}
                        onClick={() => void onCompleteTask(task.id)}
                        type="button"
                      >
                        {actionId === task.id
                          ? "Wird aktualisiert …"
                          : "Als erledigt markieren"}
                      </button>
                      {task.webViewLink ? (
                        <a
                          className="button button-ghost"
                          href={task.webViewLink}
                          rel="noreferrer"
                          target="_blank"
                        >
                          In Google
                        </a>
                      ) : null}
                      <button
                        className="task-delete-button"
                        disabled={Boolean(actionId) || !status?.authorized}
                        onClick={() => void onDeleteTask(task.id)}
                        type="button"
                      >
                        Löschen
                      </button>
                    </div>
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
        <p>Erledigte Aufgaben bleiben sichtbar; Tagesanker zählen zum 14-Tage-Rhythmus.</p>
        {completed.length ? (
          <div className="completed-task-list">
            {completed.slice(0, 20).map((task) => (
              <article key={task.id}>
                <div>
                  <strong>{task.title}</strong>
                  <small>
                    {status?.authorized ? "Google Tasks" : "Lokaler Altbestand"}
                    {task.completedAt
                      ? ` · ${formatDate(task.completedAt)}`
                      : ""}
                  </small>
                </div>
                <div className="button-group">
                  <button
                    disabled={Boolean(actionId) || !status?.authorized}
                    onClick={() => void onReopenTask(task.id)}
                    type="button"
                  >
                    Wieder öffnen
                  </button>
                  <button
                    disabled={Boolean(actionId) || !status?.authorized}
                    onClick={() => void onDeleteTask(task.id)}
                    type="button"
                  >
                    Löschen
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function DocumentsView({
  driveController,
  state,
  integrations,
  onOpen,
  onCloseSelected,
  onLinkDocument,
  onUpload,
  selectedDocument,
  toast,
}: {
  driveController: DriveExplorerController;
  state: AppState;
  integrations: IntegrationConfig;
  onOpen: (document: DocumentRef) => void;
  onCloseSelected: () => void;
  onLinkDocument: () => void;
  onUpload: () => void;
  selectedDocument: DocumentRef | null;
  toast: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("Alle");
  const libraryDocuments = state.documents.filter(
    (document) => document.kind !== "folder",
  );
  const folderNames = documentFolderOptions(libraryDocuments);
  const selectedFolder = folderNames.includes(folder) ? folder : "Alle";
  const visible = visibleDocuments(libraryDocuments, query, selectedFolder);
  const driveRootUrl = safeGoogleDriveUrl(
    driveController.status?.root?.webViewLink || integrations.driveFolderUrl,
  );

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
        eyebrow="Unterlagen"
        title="Alles griffbereit"
        copy="Durchsuche Google Drive oder lege private Dateien direkt im Kompass ab."
        action={
          <div className="button-group">
            {driveRootUrl ? (
              <a
                className="button button-soft"
                href={driveRootUrl}
                rel="noreferrer"
                target="_blank"
              >
                Drive-Ordner öffnen
              </a>
            ) : null}
            <button
              className="button button-soft"
              onClick={onLinkDocument}
              type="button"
            >
              Unterlage verknüpfen
            </button>
            <button className="button button-primary" onClick={onUpload} type="button">
              Datei hochladen
            </button>
          </div>
        }
      />

      <DriveExplorer controller={driveController} />

      <section className="drive-location-bar" aria-label="Drive-Speicherorte">
        <div>
          <span className="integration-initial">S</span>
          <p>
            <strong>Private Kompass-Dateien</strong>
            <small>Getrennt von Google Drive · nur für dich</small>
          </p>
          <button onClick={onUpload} type="button">Hochladen</button>
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

      <div className="section-heading compact-section-heading">
        <div>
          <span className="eyebrow">Kompass</span>
          <h2>Gespeicherte und verknüpfte Dateien</h2>
        </div>
        <span>{visible.length} Dateien</span>
      </div>

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
          value={selectedFolder}
        >
          {folderNames.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </div>

      <section className="document-grid" aria-label="Unterlagen">
        {visible.map((document) => {
          const isUpload = documentSource(document) === "upload";
          const privateFileUrl = safePrivateFileUrl(
            document.downloadUrl ?? document.driveUrl,
          );
          const safeDriveUrl = safeGoogleDriveUrl(document.driveUrl);
          const preview = isUpload
            ? document.contentType === "application/pdf" ||
              document.contentType?.startsWith("image/")
              ? privateFileUrl
              : null
            : drivePreviewUrl(document.driveUrl, document.fileId);
          const downloadUrl = isUpload
            ? privateFileDownloadUrl(document.downloadUrl ?? document.driveUrl)
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
                  {document.sizeBytes !== undefined
                    ? `${formatFileSize(document.sizeBytes)} · `
                    : ""}
                  {document.tags.join(" · ")}
                </p>
              </div>
              <span className="private-chip">
                {isUpload ? "Kompass-Datei" : "Drive-Link"}
              </span>
              <div className="document-actions">
                <button onClick={() => onOpen(document)} type="button">
                  {preview ? "A4-Ansicht" : "Details"}
                </button>
                {!isUpload && safeDriveUrl ? (
                  <a
                    href={safeDriveUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    In Drive
                  </a>
                ) : null}
                {downloadUrl ? (
                  <a href={downloadUrl} rel="noreferrer" target="_blank">
                    Download
                  </a>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>

      {!visible.length ? (
        <div className="drive-empty private-upload-empty">
          <span>PRIVAT</span>
          <h3>Keine passende Datei gefunden.</h3>
          <p>Ändere Suche oder Ordnerfilter – oder füge eine Datei hinzu.</p>
        </div>
      ) : null}

      {selectedDocument ? (
        <DocumentViewer
          document={selectedDocument}
          onClose={onCloseSelected}
        />
      ) : null}
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
  initialTask: Task | null;
  integrations: IntegrationConfig;
  taskLists: GoogleTaskList[];
  calendarReminderGranted: boolean;
  calendarConnectUrl: string;
  onClose: () => void;
  onSaveTask: (task: Task) => Promise<boolean>;
  onUpdateTask: (task: Task) => Promise<boolean>;
  onSaveEvent: (event: CalendarEvent) => void;
  onSaveCost: (cost: Cost) => void;
  onSaveIncome: (income: Income) => void;
  onSaveDocument: (document: DocumentRef) => void;
  onSaveJournal: (
    text: string,
    mood: number,
    win: string,
    nextStep: string,
  ) => void;
  toast: (message: string) => void;
};

function CaptureDialog({
  initialKind,
  initialTask,
  integrations,
  taskLists,
  calendarReminderGranted,
  calendarConnectUrl,
  onClose,
  onSaveTask,
  onUpdateTask,
  onSaveEvent,
  onSaveCost,
  onSaveIncome,
  onSaveDocument,
  onSaveJournal,
  toast,
}: CaptureDialogProps) {
  const dialogRef = useModalDialog<HTMLElement>(onClose);
  const [kind, setKind] = useState<CaptureKind>(initialKind);
  const [title, setTitle] = useState(initialTask?.title ?? "");
  const [date, setDate] = useState(
    initialTask?.dueAt ? isoDateInput(initialTask.dueAt) : isoDateInput(),
  );
  const [taskId] = useState(() => initialTask?.id ?? uid("task"));
  const [taskListId, setTaskListId] = useState(
    initialTask?.taskListId ?? taskLists[0]?.id ?? "",
  );
  const [quadrant, setQuadrant] = useState<TaskQuadrant>(
    initialTask?.quadrant ?? "do",
  );
  const [minutes, setMinutes] = useState(initialTask?.estimateMinutes ?? 20);
  const [reminderMode, setReminderMode] = useState<"none" | "at" | "minutes">(
    "none",
  );
  const [reminderDateTime, setReminderDateTime] = useState(localDateTimeInput);
  const [reminderMinutes, setReminderMinutes] = useState(30);
  const [amount, setAmount] = useState("");
  const [category, setCategory] =
    useState<Cost["category"]>("Lebensmittel & Haushalt");
  const [cadence, setCadence] = useState<CostCadence>("once");
  const [payee, setPayee] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [costType, setCostType] = useState<"Fix" | "Variabel">("Fix");
  const [priority, setPriority] =
    useState<"Notwendig" | "Wichtig" | "Optional">("Wichtig");
  const [account, setAccount] = useState("");
  const [driveUrl, setDriveUrl] = useState("");
  const [folderPath, setFolderPath] = useState("Persönlich/Wichtige Unterlagen");
  const [mood, setMood] = useState(3);
  const [win, setWin] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const selectedTaskListId = taskLists.some((list) => list.id === taskListId)
    ? taskListId
    : initialTask?.taskListId || taskLists[0]?.id || "";
  const editingTask = kind === "task" && Boolean(initialTask);
  const isPrimaryEntry =
    !initialTask && !["document", "journal"].includes(kind);
  const captureEyebrow =
    editingTask
      ? "Google Tasks"
      : kind === "document"
      ? "Google Drive"
      : kind === "journal"
        ? "Kurze Notiz"
        : "Neu";
  const captureTitle =
    editingTask
      ? "Aufgabe bearbeiten"
      : kind === "document"
      ? "Unterlage verknüpfen"
      : kind === "journal"
        ? "Was möchtest du im Tagebuch festhalten?"
        : "Eintrag hinzufügen";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (kind === "task") {
      if (!title.trim() || saving) return;
      if (!selectedTaskListId) {
        setSubmitError(
          "Die Google-Tasks-Listen konnten noch nicht geladen werden. Bitte schließe den Dialog und gleiche die Aufgaben erneut ab.",
        );
        return;
      }
      if (!editingTask && reminderMode !== "none" && !calendarReminderGranted) {
        setSubmitError(
          "Für E-Mail-Erinnerungen muss Google Kalender einmalig freigegeben werden.",
        );
        return;
      }
      if (!Number.isFinite(minutes) || minutes < 5 || minutes > 1_440) {
        setSubmitError("Bitte gib einen Zeitbedarf zwischen 5 und 1.440 Minuten an.");
        return;
      }
      if (
        !editingTask &&
        reminderMode === "minutes" &&
        (!Number.isFinite(reminderMinutes) ||
          reminderMinutes < 1 ||
          reminderMinutes > 525_600)
      ) {
        setSubmitError("Bitte wähle eine Erinnerung zwischen einer Minute und einem Jahr.");
        return;
      }
      const reminderAt =
        editingTask
          ? initialTask?.reminderAt ?? null
          : reminderMode === "at"
          ? (() => {
              const [reminderDate = "", reminderTime = ""] =
                reminderDateTime.split("T");
              return zonedDateTimeToIso(reminderDate, reminderTime);
            })()
          : reminderMode === "minutes"
            ? new Date(Date.now() + reminderMinutes * 60_000).toISOString()
            : null;
      if (
        !editingTask &&
        reminderMode !== "none" &&
        (!reminderAt || new Date(reminderAt).getTime() < Date.now())
      ) {
        setSubmitError(
          "Bitte wähle einen gültigen Erinnerungszeitpunkt in Berliner Zeit und in der Zukunft.",
        );
        return;
      }
      setSaving(true);
      setSubmitError("");
      const nextTask: Task = {
        ...initialTask,
        id: taskId,
        taskListId: selectedTaskListId,
        title: title.trim(),
        area: "persoenlich",
        quadrant,
        dueAt: date ? dateAtNine(date) : null,
        reminderAt,
        estimateMinutes: minutes,
        progress: 0,
        completed: false,
        confidential: true,
      };
      const saved = editingTask
        ? await onUpdateTask(nextTask)
        : await onSaveTask(nextTask);
      setSaving(false);
      if (!saved) {
        setSubmitError(
          editingTask
            ? "Die Aufgabe konnte nicht aktualisiert werden. Bitte gleiche Google Tasks ab und versuche es erneut."
            : "Bitte verbinde Google Tasks oder erneuere die Berechtigung. Es wurde keine lokale Aufgabenkopie angelegt.",
        );
        return;
      }
      onClose();
      return;
    } else if (kind === "cost") {
      const parsedAmount = parseEuroInput(amount);
      const dueAt = dateAtNine(date);
      if (!title.trim()) {
        setSubmitError("Bitte gib eine Bezeichnung für die Ausgabe an.");
        return;
      }
      if (!parsedAmount.valid || parsedAmount.value === null || parsedAmount.value <= 0) {
        setSubmitError("Bitte gib einen gültigen Betrag größer als 0 Euro an.");
        return;
      }
      if (!dueAt) {
        setSubmitError("Bitte wähle ein gültiges Fälligkeitsdatum.");
        return;
      }
      onSaveCost({
        id: uid("cost"),
        title: title.trim(),
        category,
        amount: parsedAmount.value,
        dueAt,
        cadence,
        status: daysFromNow(dueAt) <= 3 ? "due" : "planned",
        payee: payee.trim(),
        contactEmail: contactEmail.trim(),
        note: "Über die gemeinsame Erfassung angelegt",
        confidential: true,
        active: true,
        account,
        costType,
        priority,
        subcategory,
      });
    } else if (kind === "income") {
      const parsedAmount = parseEuroInput(amount);
      const receivedAt = dateAtNine(date);
      if (!title.trim()) {
        setSubmitError("Bitte gib eine Bezeichnung für die Einnahme an.");
        return;
      }
      if (!parsedAmount.valid || parsedAmount.value === null || parsedAmount.value <= 0) {
        setSubmitError("Bitte gib einen gültigen Betrag größer als 0 Euro an.");
        return;
      }
      if (!receivedAt) {
        setSubmitError("Bitte wähle ein gültiges Eingangsdatum.");
        return;
      }
      onSaveIncome({
        id: uid("income"),
        title: title.trim(),
        amount: parsedAmount.value,
        receivedAt,
        cadence,
        source: payee.trim(),
        note: "Manuell im Finanzbereich erfasst",
      });
    } else if (kind === "document") {
      const normalizedDriveUrl = safeGoogleDriveUrl(driveUrl);
      if (!title.trim()) {
        setSubmitError("Bitte gib einen Namen für die Unterlage an.");
        return;
      }
      if (!normalizedDriveUrl) {
        setSubmitError(
          "Bitte verwende einen HTTPS-Dateilink von drive.google.com oder docs.google.com.",
        );
        return;
      }
      const fileId = extractDriveFileId(normalizedDriveUrl);
      if (!fileId || normalizedDriveUrl.includes("/folders/")) {
        setSubmitError("Bitte verknüpfe eine einzelne Google-Drive-Datei.");
        return;
      }
      onSaveDocument({
        id: uid("doc"),
        name: title.trim(),
        folderPath: folderPath.trim() || "Persönlich/Wichtige Unterlagen",
        kind: inferDocumentKind(normalizedDriveUrl),
        driveUrl: normalizedDriveUrl,
        fileId,
        modifiedAt: new Date().toISOString(),
        tags: ["Google Drive"],
        confidential: true,
        storage: "drive",
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
        className={`capture-dialog${isPrimaryEntry ? " unified-entry-dialog" : ""}`}
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="dialog-handle" />
        <header className="dialog-heading">
          <div>
            <span className="eyebrow">{captureEyebrow}</span>
            <h2 id="capture-title">{captureTitle}</h2>
          </div>
          <button aria-label="Schließen" onClick={onClose} type="button">
            Schließen
          </button>
        </header>
        {isPrimaryEntry ? (
          <>
            <div className="capture-tabs primary-entry-tabs" role="tablist">
              {(
                [
                  ["task", "A", "Aufgabe", "Planen und erinnern"],
                  ["event", "T", "Termin", "Zeit oder Ereignis"],
                  ["income", "+", "Einnahme", "Geldeingang erfassen"],
                  ["cost", "€", "Ausgabe", "Zahlung festhalten"],
                ] as const
              ).map(([key, mark, label, detail]) => (
                <button
                  aria-selected={kind === key}
                  className={kind === key ? "active" : ""}
                  key={key}
                  onClick={() => {
                    setKind(key);
                    setSubmitError("");
                  }}
                  role="tab"
                  type="button"
                >
                  <span aria-hidden="true">{mark}</span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </button>
              ))}
            </div>
          </>
        ) : null}

        {kind === "event" ? (
          <CalendarEventForm onClose={onClose} onSave={onSaveEvent} toast={toast} />
        ) : (
        <form
          aria-describedby={submitError ? "capture-submit-error" : undefined}
          className="capture-form"
          onChange={() => {
            if (submitError) setSubmitError("");
          }}
          onSubmit={submit}
        >
          <label>
            {kind === "journal"
              ? "Was ist heute passiert?"
              : kind === "document"
                ? "Name der Unterlage"
                : kind === "cost" || kind === "income"
                  ? "Bezeichnung"
                  : "Aufgabe"}
            {kind === "journal" ? (
              <textarea
                autoFocus
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ein Stichpunkt reicht …"
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
                      : kind === "income"
                        ? "z. B. Gehalt oder Erstattung"
                      : "z. B. Versicherungsunterlagen prüfen"
                }
                required
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
                    disabled={editingTask || !taskLists.length}
                    onChange={(event) => setTaskListId(event.target.value)}
                    value={selectedTaskListId}
                  >
                    {editingTask &&
                    initialTask?.taskListId &&
                    !taskLists.some(
                      (list) => list.id === initialTask.taskListId,
                    ) ? (
                      <option value={initialTask.taskListId}>
                        {initialTask.taskListTitle || "Aktuelle Google-Tasks-Liste"}
                      </option>
                    ) : null}
                    {!taskLists.length ? (
                      <option value="">Listen werden geladen …</option>
                    ) : null}
                    {taskLists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.title}
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
                    max="1440"
                    min="5"
                    onChange={(event) => setMinutes(Number(event.target.value))}
                    step="5"
                    required
                    type="number"
                    value={minutes}
                  />
                </label>
              </div>
              {editingTask ? (
                <p className="form-trust">
                  {initialTask?.reminderAt
                    ? `Die bestehende Kalender-Erinnerung am ${formatDate(
                        initialTask.reminderAt,
                      )} um ${formatTime(initialTask.reminderAt)} Uhr bleibt unverändert.`
                    : "Für diese Aufgabe ist keine Kalender-Erinnerung verknüpft."}
                  {" "}Erinnerungen verwaltest du sicher im verknüpften Google-Kalender.
                </p>
              ) : (
              <fieldset className="task-reminder-fieldset">
                <legend>Erinnerung</legend>
                <label>
                  Wann möchtest du erinnert werden?
                  <select
                    onChange={(event) =>
                      setReminderMode(
                        event.target.value as "none" | "at" | "minutes",
                      )
                    }
                    value={reminderMode}
                  >
                    <option value="none">Keine Erinnerung</option>
                    <option value="at">Bestimmter Tag und Uhrzeit</option>
                    <option value="minutes">In einigen Minuten</option>
                  </select>
                </label>
                {reminderMode === "at" ? (
                  <label>
                    Tag und Uhrzeit
                    <input
                      min={localDateTimeInput(1)}
                      onChange={(event) => setReminderDateTime(event.target.value)}
                      required
                      type="datetime-local"
                      value={reminderDateTime}
                    />
                  </label>
                ) : null}
                {reminderMode === "minutes" ? (
                  <label>
                    In wie vielen Minuten?
                    <input
                      max="525600"
                      min="1"
                      onChange={(event) =>
                        setReminderMinutes(Number(event.target.value))
                      }
                      required
                      step="1"
                      type="number"
                      value={reminderMinutes}
                    />
                  </label>
                ) : null}
                {reminderMode !== "none" ? (
                  <p className="form-trust">
                    Aufgabe in Google Tasks; Google Kalender erinnert per
                    Benachrichtigung und E-Mail.
                    {!calendarReminderGranted && calendarConnectUrl ? (
                      <>
                        {" "}
                        <a href={calendarConnectUrl}>Google Kalender freigeben</a>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </fieldset>
              )}
            </>
          ) : null}

          {kind === "cost" ? (
            <>
              <label>
                Vorlage aus deiner Kostentabelle
                <select
                  defaultValue=""
                  onChange={(event) => {
                    const template = COST_TEMPLATES.find(
                      (item) => item.id === Number(event.target.value),
                    );
                    if (!template) return;
                    setTitle(template.title);
                    setCategory(template.category);
                    setSubcategory(template.subcategory);
                    setCostType(template.costType);
                    setPriority(template.priority);
                    setCadence(template.cadence);
                  }}
                >
                  <option value="">Ohne Vorlage frei erfassen</option>
                  {COST_TEMPLATES.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.category} · {template.title}
                    </option>
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
                    required
                    value={amount}
                  />
                </label>
                <label>
                  Fälligkeit
                  <input
                    onChange={(event) => setDate(event.target.value)}
                    required
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
                      <option key={value} value={value}>{value}</option>
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
                  Kostenart
                  <select
                    onChange={(event) =>
                      setCostType(event.target.value as "Fix" | "Variabel")
                    }
                    value={costType}
                  >
                    <option>Fix</option>
                    <option>Variabel</option>
                  </select>
                </label>
                <label>
                  Priorität
                  <select
                    onChange={(event) =>
                      setPriority(
                        event.target.value as "Notwendig" | "Wichtig" | "Optional",
                      )
                    }
                    value={priority}
                  >
                    <option>Notwendig</option>
                    <option>Wichtig</option>
                    <option>Optional</option>
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
                  Konto
                  <select
                    onChange={(event) => setAccount(event.target.value)}
                    value={account}
                  >
                    <option value="">Nicht zugeordnet</option>
                    <option>Girokonto</option>
                    <option>Kreditkarte</option>
                    <option>Gemeinschaftskonto</option>
                    <option>Geschäftskonto</option>
                    <option>Bargeld</option>
                    <option>PayPal</option>
                    <option>Revolut</option>
                    <option>Sonstiges</option>
                  </select>
                </label>
              </div>
              <label>
                Unterkategorie
                <input
                  onChange={(event) => setSubcategory(event.target.value)}
                  placeholder="Optional"
                  value={subcategory}
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
              <p className="form-trust">
                48 Vorlagen aus deiner Kostentabelle; Beträge bleiben leer und privat.
              </p>
            </>
          ) : null}

          {kind === "income" ? (
            <>
              <div className="form-grid">
                <label>
                  Betrag in Euro
                  <input
                    inputMode="decimal"
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0,00"
                    required
                    value={amount}
                  />
                </label>
                <label>
                  Eingegangen am
                  <input
                    onChange={(event) => setDate(event.target.value)}
                    required
                    type="date"
                    value={date}
                  />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Quelle
                  <input
                    onChange={(event) => setPayee(event.target.value)}
                    placeholder="z. B. Arbeitgeber"
                    value={payee}
                  />
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
              <p className="form-trust">
                Nur für deine monatliche Übersicht.
              </p>
            </>
          ) : null}

          {kind === "document" ? (
            <>
              <label>
                Google-Drive-Dateilink
                <input
                  aria-describedby={submitError ? "capture-submit-error" : undefined}
                  aria-invalid={Boolean(submitError) || undefined}
                  onChange={(event) => {
                    setDriveUrl(event.target.value);
                    if (submitError) setSubmitError("");
                  }}
                  placeholder="https://drive.google.com/file/d/…"
                  required
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
                Öffne{" "}
                <a
                  href={integrations.driveFolderUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  deinen Drive-Ordner
                </a>
                , wähle eine Datei und kopiere ihren Link. Die Datei bleibt in Drive.
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
                Nächster kleiner Schritt für morgen
                <input
                  onChange={(event) => setNextStep(event.target.value)}
                  value={nextStep}
                />
              </label>
            </>
          ) : null}

          {submitError ? (
          <p className="form-error" id="capture-submit-error" role="alert">
            {submitError}
          </p>
          ) : null}
          <div className="dialog-actions">
            <button className="button button-ghost" onClick={onClose} type="button">
              Abbrechen
            </button>
            <button
              className="button button-primary"
              disabled={saving}
              type="submit"
            >
              {saving ? "Wird gespeichert …" : "Speichern"}
            </button>
          </div>
        </form>
        )}
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
  const isUpload = documentSource(document) === "upload";
  const privateFileUrl = safePrivateFileUrl(
    document.downloadUrl ?? document.driveUrl,
  );
  const safeDriveUrl = safeGoogleDriveUrl(document.driveUrl);
  const preview = isUpload
    ? document.contentType === "application/pdf" ||
      document.contentType?.startsWith("image/")
      ? privateFileUrl
      : null
    : drivePreviewUrl(document.driveUrl, document.fileId);
  const downloadUrl = isUpload
    ? privateFileDownloadUrl(document.downloadUrl ?? document.driveUrl)
    : driveDownloadUrl(document.driveUrl, document.fileId);
  return (
      <section
        aria-labelledby="viewer-title"
        className="document-viewer inline-document-viewer"
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
            {downloadUrl ? (
              <a
                className="button button-soft"
                href={downloadUrl}
                rel="noreferrer"
                target="_blank"
              >
                Herunterladen
              </a>
            ) : null}
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
                referrerPolicy="no-referrer"
                src={preview}
                title={`Vorschau von ${document.name}`}
              />
            </div>
          ) : (
            <div className="viewer-empty">
              <span>DIN A4</span>
              <h3>Keine Dateivorschau</h3>
              <p>
                {isUpload
                  ? "Für dieses Format gibt es keine Vorschau. Der Download ist möglich."
                  : "Der Eintrag verweist auf einen Ordner. Verknüpfe den Dateilink für Vorschau und Download."}
              </p>
              {isUpload ? (
                downloadUrl ? (
                  <a
                    className="button button-primary"
                    href={downloadUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Datei herunterladen
                  </a>
                ) : null
              ) : safeDriveUrl ? (
                <a
                  className="button button-primary"
                  href={safeDriveUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  In Google Drive öffnen
                </a>
              ) : null}
            </div>
          )}
        </div>
      </section>
  );
}

function SettingsDialog({
  applicationKpiSettings,
  dashboardSettings,
  gamification,
  integrations,
  syncCopy,
  syncStatus,
  workspaceStatus,
  workspaceStatusError,
  onAdaptiveFocusChange,
  onAcceptRemoteState,
  onApplicationKpiChange,
  onCelebrationsChange,
  onClose,
  onDashboardKpiChange,
  onDrRossChange,
  onExport,
  onImport,
  onMilestoneStepChange,
  onReset,
  onRefreshGoogle,
  onRewardCatalogToggle,
  onRedeemReward,
  onRewardModeChange,
  onBuildWorldUpgrade,
  onSurprisesChange,
  onXpGoalChange,
  xpProgress,
}: {
  applicationKpiSettings: ApplicationKpiSettings;
  dashboardSettings: DashboardSettings;
  gamification: GamificationState;
  integrations: IntegrationConfig;
  syncCopy: string;
  syncStatus: SyncStatus;
  workspaceStatus: GoogleWorkspaceStatus | null;
  workspaceStatusError: string;
  onAdaptiveFocusChange: (points: number) => void;
  onAcceptRemoteState: () => Promise<void>;
  onApplicationKpiChange: (
    key: ApplicationKpiKey,
    changes: {
      enabled?: boolean;
      period?: ApplicationKpiPeriod;
      target?: number;
    },
  ) => void;
  onCelebrationsChange: (enabled: boolean) => void;
  onClose: () => void;
  onDashboardKpiChange: (
    key: DashboardKpiKey,
    changes: Partial<Pick<DashboardSettings["kpis"][number], "enabled" | "target">>,
  ) => void;
  onDrRossChange: (enabled: boolean) => void;
  onExport: () => void;
  onImport: (raw: string) => void;
  onMilestoneStepChange: (milestoneStepXp: number) => void;
  onXpGoalChange: (period: keyof XpGoals, targetXp: number) => void;
  onReset: () => void;
  onRefreshGoogle: () => void;
  onRewardCatalogToggle: (rewardId: string, active: boolean) => void;
  onRedeemReward: (rewardId: string) => void;
  onRewardModeChange: (mode: RewardMode) => void;
  onBuildWorldUpgrade: (
    district: WorldDistrictKey,
    kind: WorldUpgradeKind,
  ) => void;
  onSurprisesChange: (enabled: boolean) => void;
  xpProgress: XpProgressByPeriod;
}) {
  const dialogRef = useModalDialog<HTMLElement>(onClose);
  const importRef = useRef<HTMLInputElement>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [googleError, setGoogleError] = useState("");
  const [conflictBusy, setConflictBusy] = useState(false);
  const [conflictError, setConflictError] = useState("");
  const [worldDistrict, setWorldDistrict] = useState<WorldDistrictKey>("WORKSHOP");
  const [worldUpgradeKind, setWorldUpgradeKind] =
    useState<WorldUpgradeKind>("DECORATION");
  const rewardTotals = ledgerTotals(gamification.ledger);
  const worldUpgradeCost = WORLD_UPGRADE_COSTS[worldUpgradeKind];
  const canBuildWorldUpgrade =
    rewardTotals.energy >= worldUpgradeCost.energy &&
    rewardTotals.runes >= worldUpgradeCost.runes &&
    rewardTotals.blueprints >= worldUpgradeCost.blueprints &&
    rewardTotals.bossKeys >= worldUpgradeCost.bossKeys;
  const worldUpgradeCostLabel = [
    worldUpgradeCost.energy ? `${worldUpgradeCost.energy} Energie` : "",
    worldUpgradeCost.runes ? `${worldUpgradeCost.runes} Runen` : "",
    worldUpgradeCost.blueprints
      ? `${worldUpgradeCost.blueprints} Bauplan${worldUpgradeCost.blueprints === 1 ? "" : "e"}`
      : "",
    worldUpgradeCost.bossKeys
      ? `${worldUpgradeCost.bossKeys} Boss-Schlüssel`
      : "",
  ].filter(Boolean).join(" · ");
  const approvedNamedMessages = gamification.approvedMessages.filter(
    (message) =>
      message.active &&
      message.contentType !== "GENERIC_AI" &&
      Boolean(message.approvedAt) &&
      Boolean(message.permissionReference.trim()),
  );
  const capabilityRows: Array<{
    key: keyof GoogleWorkspaceStatus["capabilities"];
    label: string;
    detail: string;
  }> = [
    {
      key: "tasks",
      label: "Google Tasks",
      detail: "Aufgaben lesen und ändern",
    },
    {
      key: "calendar",
      label: "Google Kalender",
      detail: "Termine lesen und privat erstellen",
    },
    {
      key: "drive",
      label: "Google Drive",
      detail: "Stammordner nur lesen",
    },
    {
      key: "gmail",
      label: "Gmail",
      detail: "Entwürfe erstellen, nie senden",
    },
  ];

  const disconnectGoogle = async () => {
    if (
      disconnecting ||
      !window.confirm(
        "Google-Verbindung wirklich trennen? Deine Daten bleiben bei Google erhalten; private Kompass-Zusatzangaben zu Aufgaben werden gelöscht.",
      )
    ) {
      return;
    }
    setDisconnecting(true);
    setGoogleError("");
    try {
      const response = await fetch("/api/google/disconnect", { method: "POST" });
      const payload = await responsePayload<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(payload.error || "Google konnte nicht getrennt werden.");
      }
      window.location.reload();
    } catch (caught) {
      setGoogleError(
        caught instanceof Error
          ? caught.message
          : "Google konnte nicht getrennt werden.",
      );
      setDisconnecting(false);
    }
  };

  const resolveStateConflict = async () => {
    if (
      conflictBusy ||
      !window.confirm(
        "Vor dem Laden des privaten Serverstands wird deine lokale Fassung automatisch als Backup gespeichert. Danach ersetzt der Serverstand die lokale Ansicht. Fortfahren?",
      )
    ) {
      return;
    }
    onExport();
    setConflictBusy(true);
    setConflictError("");
    try {
      await onAcceptRemoteState();
    } catch (caught) {
      setConflictError(
        caught instanceof Error
          ? caught.message
          : "Der private Serverstand konnte nicht geladen werden.",
      );
    } finally {
      setConflictBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="settings-title"
        aria-modal="true"
        className="settings-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="dialog-heading">
          <div>
            <span className="eyebrow">Einstellungen</span>
            <h2 id="settings-title">Kompass anpassen</h2>
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
              {syncCopy}. Aufgaben liegen in Google Tasks; Prioritäten, Finanzen und
              Tagebuch im privaten Kompass. Drive-Dateien bleiben bei Google.
            </p>
          </div>
        </div>
        {syncStatus === "konflikt" ? (
          <div
            aria-labelledby="state-conflict-title"
            className="settings-section state-conflict-panel"
            role="alert"
          >
            <div>
              <span className="eyebrow">Datenschutz und Datenintegrität</span>
              <h3 id="state-conflict-title">Zwei unterschiedliche Stände erkannt</h3>
              <p>
                Der Kompass überschreibt keinen Stand automatisch. Sichere die
                lokale Fassung und lade anschließend bewusst den aktuellen
                privaten Serverstand.
              </p>
            </div>
            <div className="button-group">
              <button
                className="button button-soft"
                onClick={onExport}
                type="button"
              >
                Lokale Fassung sichern
              </button>
              <button
                className="button button-primary"
                disabled={conflictBusy}
                onClick={() => void resolveStateConflict()}
                type="button"
              >
                {conflictBusy ? "Serverstand wird geladen …" : "Serverstand laden"}
              </button>
            </div>
            {conflictError ? (
              <p className="form-error" role="alert">
                {conflictError}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="settings-section dashboard-settings-section">
          <span className="eyebrow">Zentrale</span>
          <h3>Kennzahlen auswählen</h3>
          <p>Wähle, was du in der Zentrale sehen und erreichen willst.</p>
          <div className="dashboard-kpi-settings" aria-label="Ziele konfigurieren">
            {DASHBOARD_KPI_DEFINITIONS.map((definition) => {
              const setting = dashboardSettings.kpis.find(
                (candidate) => candidate.key === definition.key,
              ) ?? {
                key: definition.key,
                enabled: true,
                target: definition.defaultTarget,
              };
              return (
                <article className={setting.enabled ? "is-enabled" : ""} key={definition.key}>
                  <label className="dashboard-kpi-toggle">
                    <input
                      checked={setting.enabled}
                      onChange={(event) =>
                        onDashboardKpiChange(definition.key, {
                          enabled: event.target.checked,
                        })
                      }
                      type="checkbox"
                    />
                    <span>
                      <strong>{definition.label}</strong>
                      <small>{definition.description}</small>
                    </span>
                  </label>
                  <label className="dashboard-kpi-target">
                    <span>
                      {definition.direction === "maximum" ? "Maximal" : "Mindestens"}
                    </span>
                    <span>
                      <input
                        aria-label={`Zielwert für ${definition.label}`}
                        max={definition.max}
                        min={definition.min}
                        onChange={(event) =>
                          onDashboardKpiChange(definition.key, {
                            target: Math.min(
                              definition.max,
                              Math.max(definition.min, Number(event.target.value)),
                            ),
                          })
                        }
                        step={definition.step}
                        type="number"
                        value={setting.target}
                      />
                      <small>{definition.unit}</small>
                    </span>
                  </label>
                </article>
              );
            })}
          </div>
        </div>
        <div className="settings-section application-kpi-settings-section">
          <span className="eyebrow">Bewerbungsziele</span>
          <h3>Kennzahlen auswählen</h3>
          <p>Aktiviere passende Ziele für Tag, Woche oder Monat.</p>
          <div
            aria-label="Bewerbungsziele konfigurieren"
            className="application-kpi-settings"
          >
            {APPLICATION_KPI_DEFINITIONS.map((definition) => {
              const setting = applicationKpiSettings.goals.find(
                (candidate) => candidate.key === definition.key,
              ) ?? {
                key: definition.key,
                enabled: true,
                targets: definition.defaultTargets,
              };
              return (
                <article
                  className={setting.enabled ? "is-enabled" : ""}
                  key={definition.key}
                >
                  <label className="application-kpi-toggle">
                    <input
                      checked={setting.enabled}
                      onChange={(event) =>
                        onApplicationKpiChange(definition.key, {
                          enabled: event.target.checked,
                        })
                      }
                      type="checkbox"
                    />
                    <span>
                      <strong>{definition.label}</strong>
                      <small>{definition.description}</small>
                    </span>
                  </label>
                  <div className="application-kpi-targets">
                    {(
                      [
                        ["day", "Tag"],
                        ["week", "Woche"],
                        ["month", "Monat"],
                      ] as const
                    ).map(([period, label]) => (
                      <label key={period}>
                        <span>{label}</span>
                        <input
                          aria-label={`${definition.label} pro ${label}`}
                          max={999}
                          min={0}
                          onChange={(event) =>
                            onApplicationKpiChange(definition.key, {
                              period,
                              target: Number(event.target.value),
                            })
                          }
                          step={1}
                          type="number"
                          value={setting.targets[period]}
                        />
                      </label>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
        <div className="settings-section reward-settings-section">
          <span className="eyebrow">Belohnungssystem</span>
          <h3>Belohnungswelt wählen</h3>
          <p>XP, Klarpunkte und Ressourcen bleiben beim Wechsel erhalten.</p>
          <div className="reward-settings-balance" aria-label="Gemeinsamer Fortschritt">
            <div>
              <span>Gemeinsamer Fortschritt</span>
              <strong>{rewardTotals.earnedXp.toLocaleString("de-DE")} XP</strong>
            </div>
            <small>
              Level {levelForXp(rewardTotals.earnedXp)} ·{" "}
              {rewardTotals.balanceXp.toLocaleString("de-DE")} Klarpunkte verfügbar
            </small>
          </div>
          <div className="xp-goal-settings" aria-label="XP-Ziele konfigurieren">
            <div className="xp-goal-settings-heading">
              <div>
                <strong>Deine XP-Ziele</strong>
                <small>
                  Jeder Zeitraum startet automatisch neu; dein Gesamtfortschritt bleibt
                  vollständig erhalten.
                </small>
              </div>
              <span className="status-chip">Direkt sichtbar</span>
            </div>
            <div className="xp-goal-settings-grid">
              {XP_GOAL_FIELDS.map((field) => {
                const limits = XP_GOAL_LIMITS[field.key];
                return (
                  <article key={field.key}>
                    <div className="xp-goal-setting-heading">
                      <label htmlFor={`xp-goal-${field.key}`}>
                        <strong>{field.label}</strong>
                        <small>{field.description}</small>
                      </label>
                      <span className="xp-goal-input">
                        <input
                          aria-label={`${field.label} in XP`}
                          id={`xp-goal-${field.key}`}
                          max={limits.max}
                          min={limits.min}
                          onChange={(event) =>
                            onXpGoalChange(field.key, Number(event.target.value))
                          }
                          step={limits.step}
                          type="number"
                          value={gamification.xpGoals[field.key]}
                        />
                        <small>XP</small>
                      </span>
                    </div>
                    <XpGoalMeter
                      className="settings-xp-goal-progress"
                      label={field.shortLabel}
                      period={field.progressKey}
                      progress={xpProgress[field.progressKey]}
                      showDetail
                    />
                  </article>
                );
              })}
            </div>
          </div>
          <div className="reward-mode-settings" aria-label="Belohnungswelt wählen">
            {REWARD_MODES.map((mode) => (
              <button
                aria-pressed={gamification.rewardMode === mode}
                className={gamification.rewardMode === mode ? "active" : ""}
                key={mode}
                onClick={() => onRewardModeChange(mode)}
                type="button"
              >
                <span aria-hidden="true">
                  {mode === "POINTS" ? "K" : mode === "FANTASY" ? "C" : "M"}
                </span>
                <strong>{REWARD_MODE_LABELS[mode]}</strong>
                <small>
                  {mode === "POINTS"
                    ? "Direkte XP, Level und persönliche Belohnungen."
                    : mode === "FANTASY"
                      ? "Ressourcen und Ausbauten machen Fortschritt sichtbar."
                      : "Passt Klarpunkte und Chronik behutsam an deine Rückmeldungen an."}
                </small>
              </button>
            ))}
          </div>

          <div className="reward-customization-panel">
            <div className="reward-customization-heading">
              <div>
                <span>Aktive Welt</span>
                <strong>{REWARD_MODE_LABELS[gamification.rewardMode]} anpassen</strong>
              </div>
              <span className="status-chip">Sofort wirksam</span>
            </div>

            <label className="reward-setting-row">
              <span>
                <strong>Erreichte Etappen als Pop-up feiern</strong>
                <small>Öffnet einmalig beim Überschreiten der nächsten XP-Grenze.</small>
              </span>
              <input
                checked={gamification.celebrationsEnabled}
                onChange={(event) => onCelebrationsChange(event.target.checked)}
                type="checkbox"
              />
            </label>
            <label className="reward-setting-select">
              <span>
                <strong>Abstand der Fortschrittsetappen</strong>
                <small>Die nächste Feier orientiert sich an diesem festen XP-Rhythmus.</small>
              </span>
              <select
                onChange={(event) => onMilestoneStepChange(Number(event.target.value))}
                value={gamification.milestoneStepXp}
              >
                <option value={100}>Alle 100 XP</option>
                <option value={250}>Alle 250 XP</option>
                <option value={500}>Alle 500 XP</option>
                <option value={1000}>Alle 1.000 XP</option>
              </select>
            </label>

            {gamification.rewardMode === "POINTS" ? (
              <div className="mode-specific-settings">
                <div className="mode-settings-intro">
                  <strong>Persönliche Belohnungen</strong>
                  <small>
                    Lege fest, welche Ideen im Klarpunkte-Katalog aktiv sind. Es wird
                    niemals automatisch etwas gekauft oder gebucht.
                  </small>
                </div>
                <div className="reward-catalog-settings">
                  {gamification.rewardCatalog.map((reward) => (
                    <article className="reward-catalog-item" key={reward.id}>
                      <label>
                        <span>
                          <strong>{reward.title}</strong>
                          <small>{reward.cost.toLocaleString("de-DE")} Klarpunkte</small>
                        </span>
                        <input
                          aria-label={`${reward.title} im Katalog aktivieren`}
                          checked={reward.active}
                          onChange={(event) =>
                            onRewardCatalogToggle(reward.id, event.target.checked)
                          }
                          type="checkbox"
                        />
                      </label>
                      <button
                        className="button button-soft"
                        disabled={!reward.active || rewardTotals.balanceXp < reward.cost}
                        onClick={() => onRedeemReward(reward.id)}
                        title={
                          !reward.active
                            ? "Diese Belohnung ist deaktiviert"
                            : rewardTotals.balanceXp < reward.cost
                              ? "Noch nicht genügend Klarpunkte"
                              : "Nach Bestätigung einlösen"
                        }
                        type="button"
                      >
                        Einlösen
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {gamification.rewardMode === "FANTASY" ? (
              <div className="mode-specific-settings">
                <div className="fantasy-resource-summary">
                  <span><b>{rewardTotals.energy}</b> Energie</span>
                  <span><b>{rewardTotals.runes}</b> Runen</span>
                  <span><b>{rewardTotals.blueprints}</b> Baupläne</span>
                  <span><b>{rewardTotals.bossKeys}</b> Boss-Schlüssel</span>
                  <span><b>{gamification.world.upgrades.length}</b> Ausbauten</span>
                </div>
                <div className="world-build-controls" aria-label="Chronik ausbauen">
                  <label>
                    <span>Bezirk</span>
                    <select
                      onChange={(event) =>
                        setWorldDistrict(event.target.value as WorldDistrictKey)
                      }
                      value={worldDistrict}
                    >
                      {WORLD_DISTRICTS.map((district) => (
                        <option key={district} value={district}>
                          {WORLD_DISTRICT_LABELS[district]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Ausbau</span>
                    <select
                      onChange={(event) =>
                        setWorldUpgradeKind(event.target.value as WorldUpgradeKind)
                      }
                      value={worldUpgradeKind}
                    >
                      {WORLD_UPGRADE_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {WORLD_UPGRADE_COSTS[kind].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div>
                    <span>Kosten</span>
                    <small>{worldUpgradeCostLabel}</small>
                  </div>
                  <button
                    className="button button-soft"
                    disabled={!canBuildWorldUpgrade}
                    onClick={() => onBuildWorldUpgrade(worldDistrict, worldUpgradeKind)}
                    title={
                      canBuildWorldUpgrade
                        ? "Nach Bestätigung ausbauen"
                        : "Für diesen Ausbau fehlen noch Ressourcen"
                    }
                    type="button"
                  >
                    Ausbau errichten
                  </button>
                </div>
                <label className="reward-setting-row">
                  <span>
                    <strong>Kosmetische Überraschungen</strong>
                    <small>
                      Kleine Weltfunde, spätestens nach acht geeigneten Abschlüssen
                      und höchstens zweimal pro Woche.
                    </small>
                  </span>
                  <input
                    checked={gamification.surprisesEnabled}
                    onChange={(event) => onSurprisesChange(event.target.checked)}
                    type="checkbox"
                  />
                </label>
              </div>
            ) : null}

            {gamification.rewardMode === "ADAPTIVE" ? (
              <div className="mode-specific-settings">
                <div className="mode-settings-intro">
                  <strong>Gewünschter Ausgangsschwerpunkt</strong>
                  <small>
                    Rückmeldungen dürfen die Gewichtung später nur langsam und
                    begrenzt verändern.
                  </small>
                </div>
                <div className="adaptive-focus-options" aria-label="Ausgangsschwerpunkt">
                  {[65, 50, 35].map((points) => (
                    <button
                      aria-pressed={gamification.adaptiveWeights.points === points}
                      className={gamification.adaptiveWeights.points === points ? "active" : ""}
                      key={points}
                      onClick={() => onAdaptiveFocusChange(points)}
                      type="button"
                    >
                      <strong>
                        {points === 65
                          ? "Klarpunkte zuerst"
                          : points === 50
                            ? "Ausgewogen"
                            : "Chronik zuerst"}
                      </strong>
                      <small>{points} % Klarheit · {100 - points} % Chronik</small>
                    </button>
                  ))}
                </div>
                <label className="reward-setting-row">
                  <span>
                    <strong>Kosmetische Überraschungen zulassen</strong>
                    <small>Ergänzt die Chronik, ohne wichtige Funktionen zu sperren.</small>
                  </span>
                  <input
                    checked={gamification.surprisesEnabled}
                    onChange={(event) => onSurprisesChange(event.target.checked)}
                    type="checkbox"
                  />
                </label>
                <label className="reward-setting-row">
                  <span>
                    <strong>Freigegebene Dr.-Roß-Begleitung</strong>
                    <small>
                      {approvedNamedMessages.length
                        ? `${approvedNamedMessages.length} dokumentiert freigegebene Inhalte verfügbar.`
                        : "Bleibt aus, bis schriftlich freigegebene Inhalte mit Nachweis vorliegen."}
                    </small>
                  </span>
                  <input
                    checked={gamification.drRossEnabled}
                    disabled={!approvedNamedMessages.length}
                    onChange={(event) => onDrRossChange(event.target.checked)}
                    type="checkbox"
                  />
                </label>
              </div>
            ) : null}
          </div>
        </div>
        <div className="settings-section">
          <span className="eyebrow">Verbindungen</span>
          <h3>Google-Dienste</h3>
          <p>Bestimme, was der Kompass lesen oder für deine Aktionen nutzen darf.</p>
          <div className="google-account-summary">
            <div>
              <strong>
                {workspaceStatusError
                  ? "Google-Status derzeit unbekannt"
                  : workspaceStatus?.connected
                  ? workspaceStatus.googleEmail || "Google-Konto verbunden"
                  : workspaceStatus?.configured
                    ? "Google-Konto noch nicht verbunden"
                    : workspaceStatus
                      ? "Google-Verbindung noch nicht eingerichtet"
                      : "Google-Status wird geprüft"}
              </strong>
              <p>
                Berechtigungen werden nur bei Bedarf angefragt.
              </p>
            </div>
            <button
              className="button button-ghost"
              onClick={onRefreshGoogle}
              type="button"
            >
              Status prüfen
            </button>
          </div>
          {workspaceStatusError ? (
            <p className="form-error" role="alert">{workspaceStatusError}</p>
          ) : null}
          {capabilityRows.map((row) => {
            const capability = workspaceStatus?.capabilities[row.key];
            const status = workspaceStatusError
              ? "Status unbekannt"
              : capability?.granted
              ? "Verbunden"
              : workspaceStatus?.configured
                ? "Berechtigung fehlt"
                : workspaceStatus
                  ? "Konfiguration fehlt"
                  : "Wird geprüft";
            return (
              <article className="integration-row" key={row.key}>
                <span className="integration-initial">{row.label.slice(0, 1)}</span>
                <div>
                  <strong>{row.label}</strong>
                  <small>{row.detail}</small>
                </div>
                <span className="status-chip">{status}</span>
                {workspaceStatus?.configured && capability?.connectUrl ? (
                  <a href={capability.connectUrl}>
                    {capability.granted ? "Neu erlauben" : "Verbinden"}
                  </a>
                ) : (
                  <span className="integration-disabled">Einrichtung prüfen</span>
                )}
              </article>
            );
          })}
          <div className="settings-integration-links">
            <a href="https://tasks.google.com/" rel="noreferrer" target="_blank">
              Google Tasks öffnen
            </a>
            <a href={integrations.driveFolderUrl} rel="noreferrer" target="_blank">
              Drive-Ordner öffnen
            </a>
            <a
              href={integrations.calendarEmbedUrl}
              rel="noreferrer"
              target="_blank"
            >
              Google Kalender öffnen
            </a>
            <a
              href={`https://mail.google.com/mail/u/${encodeURIComponent(integrations.gmailAccount)}/#drafts`}
              rel="noreferrer"
              target="_blank"
            >
              Gmail-Entwürfe öffnen
            </a>
          </div>
          {workspaceStatus?.connected ? (
            <button
              className="disconnect-google"
              disabled={disconnecting}
              onClick={() => void disconnectGoogle()}
              type="button"
            >
              {disconnecting ? "Verbindung wird getrennt …" : "Google-Verbindung trennen"}
            </button>
          ) : null}
          {googleError ? <p className="form-error" role="alert">{googleError}</p> : null}
        </div>
        <div className="settings-section">
          <span className="eyebrow">Datensicherung</span>
          <h3>Backup</h3>
          <p>Exportiere oder importiere deine privaten Kompass-Daten.</p>
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
