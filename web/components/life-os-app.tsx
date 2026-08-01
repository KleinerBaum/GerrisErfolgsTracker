"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";

import {
  QuickActionDialog,
  SidebarQuickActions,
  type QuickActionKind,
} from "./quick-actions";
import {
  DriveExplorer,
  DriveSidebarTree,
  useDriveExplorer,
  type DriveExplorerController,
} from "./drive-explorer";
import { FinanceView } from "./finance-view";
import { ApplicationsView } from "./applications-view";
import { DiaryView } from "./diary-view";
import { CalendarView as CalendarWorkspace } from "./calendar-view";
import { MomentumRealmView } from "./momentum-realm-view";
import { PlanningHealthBanner } from "./planning-health-banner";
import { RewardAssessmentDialog } from "./reward-assessment-dialog";
import { createDemoState } from "../lib/demo-data";
import { COST_TEMPLATES } from "../lib/finance-catalog";
import { diaryRhythmDays, upsertDiaryEntry } from "../lib/diary";
import {
  addGoal,
  anchorRhythm,
  applyCostPaymentReward,
  applyDayCloseReward,
  applyTaskCompletionReward,
  buildWorldUpgrade,
  createDefaultGamification,
  ledgerTotals,
  levelForXp,
  markTaskCompletionForRhythm,
  recordRewardFeedback,
  redeemPersonalReward,
  setAnchorDayStatus,
  setDailyAnchor,
  upsertTaskProfile,
  withGamification,
} from "../lib/gamification";
import {
  calendarDayDifference,
  formatCurrency,
  formatDate,
  formatDateLong,
  formatRelativeDate,
  formatTime,
  isoDateInput,
  isSameCalendarMonth,
} from "../lib/format";
import {
  driveDownloadUrl,
  drivePreviewUrl,
  extractDriveFileId,
  inferDocumentKind,
} from "../lib/google-links";
import {
  bootstrapGoogleTasks,
  createGoogleTask,
  deleteGoogleTask,
  getGoogleTasksStatus,
  getGoogleWorkspaceStatus,
  GoogleClientError,
  listGoogleTasks,
  provisionGoogleTasks,
  updateGoogleTask,
  type GoogleTasksStatus,
  type GoogleWorkspaceStatus,
} from "../lib/google-tasks-client";
import {
  analyzeAndStoreJournal,
  getPlanningReport,
  reconcilePlanning,
  removePlanningDayIntent,
  savePlanningDecision,
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
  type AccountBalances,
  type AnchorDayStatus,
  type AnchorRole,
  type AppState,
  type ApplicationArtifact,
  type ApplicationProcess,
  type CalendarEvent,
  type CaptureKind,
  type Cost,
  type CostCadence,
  type DiarySaveInput,
  type DocumentRef,
  type IntegrationConfig,
  type Income,
  type Goal,
  type LifeArea,
  type Task,
  type RewardFeedbackRating,
  type RewardMode,
  type RewardPresentation,
  type TaskGamificationProfile,
  type TaskQuadrant,
  type DayIntentKind,
  type OpenTopic,
  type PlanningHealthReport,
  type ViewKey,
  type WorldDistrictKey,
  type WorldUpgradeKind,
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
  { key: "progress", label: "Momentum Realm", short: "Realm", mark: "M" },
  { key: "calendar", label: "Kalender", short: "Kalender", mark: "K" },
  { key: "finance", label: "Finanzen", short: "Kosten", mark: "€" },
  { key: "documents", label: "Unterlagen", short: "Ablage", mark: "U" },
  {
    key: "applications",
    label: "Bewerbungen",
    short: "Bewerbung",
    mark: "B",
  },
  { key: "journal", label: "Tagebuch", short: "Tagebuch", mark: "T" },
];

const VIEW_TITLES: Record<ViewKey, string> = {
  today: "Heute im Blick",
  tasks: "Aufgaben & Fokus",
  progress: "Momentum Realm & Belohnungswelten",
  calendar: "Kalender & Erinnerungen",
  finance: "Kosten im Überblick",
  documents: "Wichtige Unterlagen",
  applications: "Bewerbungen & nächste Schritte",
  journal: "Tagebuch & Tagesabschluss",
};

const uid = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const dateAtNine = (value: string): string =>
  new Date(`${value}T09:00:00`).toISOString();

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
  const [applicationDraft, setApplicationDraft] =
    useState<ApplicationProcess | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const [workspaceStatus, setWorkspaceStatus] =
    useState<GoogleWorkspaceStatus | null>(null);
  const [taskSyncing, setTaskSyncing] = useState(false);
  const [taskError, setTaskError] = useState("");
  const [taskConnectUrl, setTaskConnectUrl] = useState("");
  const [taskActionId, setTaskActionId] = useState("");
  const [rewardTaskId, setRewardTaskId] = useState("");
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
    updateState,
    exportBackup,
    importBackup,
  } = useGerriState(initialState);
  const pendingLegacyTasks = state.pendingTaskImports ?? [];

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
    try {
      setWorkspaceStatus(await getGoogleWorkspaceStatus());
    } catch {
      setWorkspaceStatus(null);
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
      replaceTasks(await listGoogleTasks());
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
        const [loadedTaskStatus, nextWorkspaceStatus] = await Promise.all([
          getGoogleTasksStatus(),
          getGoogleWorkspaceStatus().catch(() => null),
        ]);
        let nextStatus = loadedTaskStatus;
        if (!active) return;
        if (nextStatus.authorized) {
          const provisioned = await provisionGoogleTasks();
          nextStatus = { ...nextStatus, taskList: provisioned.taskList };
        }
        if (!active) return;
        setTaskStatus(nextStatus);
        setWorkspaceStatus(nextWorkspaceStatus);
        setTaskConnectUrl(nextStatus.connectUrl);
        if (!nextStatus.authorized) return;
        const googleTasks = await listGoogleTasks();
        if (!active) return;
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
        const payload = (await response.json()) as {
          events?: CalendarEvent[];
          source?: string;
        };
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
      setQuickAction(null);
      setApplicationDraft(null);
      setSettingsOpen(false);
      setSelectedDocument(null);
      setRewardTaskId("");
      clearSelectedDriveFile(null);
      setMobileSidebarOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [clearSelectedDriveFile]);

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
          ? "In Google Tasks erledigt · Reward nachvollziehbar im Ledger gespeichert"
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
      setNotice("Aufgabe in Google Tasks wieder geöffnet · Fortschritt bleibt erhalten");
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
    setNotice("Kostenposten gespeichert");
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
    const start = new Date(cost.dueAt);
    start.setHours(9, 0, 0, 0);
    const event: CalendarEvent = {
      id: uid("event"),
      title: `Zahlung erinnern: ${cost.title}`,
      startAt: start.toISOString(),
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
      const payload = (await response.json()) as {
        event?: CalendarEvent;
        error?: string;
      };
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

  const saveMasterCv = (document: DocumentRef) => {
    updateState((current) => ({
      ...current,
      documents: [document, ...current.documents],
      masterCvDocumentId: document.id,
    }));
  };

  const setMasterCv = (documentId: string | null) => {
    updateState((current) => ({
      ...current,
      masterCvDocumentId: documentId,
    }));
    setNotice(documentId ? "Master-CV ausgewählt" : "Master-CV-Verknüpfung gelöst");
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
        : `${result.analysis.summary} Deterministischer Fallback ohne KI-Mutation.`;
    } catch (caught) {
      return caught instanceof Error
        ? `Tagesabschluss gespeichert. Analysehinweis: ${caught.message}`
        : "Tagesabschluss gespeichert. Die Analyse wird später erneut versucht.";
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

  const actOnPlanningGap = async (
    gapId: string,
    action: "reopen" | "snooze" | "resolve",
    note = "",
  ): Promise<void> => {
    try {
      await updatePlanningGap(gapId, {
        action,
        note,
        ...(action === "snooze"
          ? {
              snoozedUntil: new Date(
                Date.now() + 24 * 60 * 60 * 1_000,
              ).toISOString(),
            }
          : {}),
      });
      const report = await getPlanningReport();
      setPlanningReport(report);
      setNotice(
        action === "snooze"
          ? "Planungslücke mit Begründung bis morgen zurückgestellt"
          : action === "resolve"
            ? "Planungslücke als gelöst dokumentiert"
            : "Planungslücke wieder geöffnet",
      );
    } catch (caught) {
      setNotice(
        caught instanceof Error
          ? caught.message
          : "Die Planungslücke konnte nicht bearbeitet werden.",
      );
    }
  };

  const updateTopic = async (
    topicId: string,
    input: Partial<
      Pick<
        OpenTopic,
        | "status"
        | "group"
        | "nextStep"
        | "dueAt"
        | "calendarTarget"
        | "snoozedUntil"
      >
    >,
  ): Promise<void> => {
    try {
      await updatePlanningTopic(topicId, input);
      await refreshPlanning("open-topic-change");
      setNotice("Offenes Thema aktualisiert");
    } catch (caught) {
      setNotice(
        caught instanceof Error
          ? caught.message
          : "Das offene Thema konnte nicht aktualisiert werden.",
      );
    }
  };

  const recordTopicDecision = async (
    topic: OpenTopic,
    decision: string,
  ): Promise<void> => {
    try {
      await savePlanningDecision({
        topicId: topic.id,
        sourceJournalId:
          topic.sourceId && topic.sourceType === "open-topic"
            ? topic.sourceId
            : undefined,
        title: topic.title,
        decision,
        calendarTarget: topic.calendarTarget,
        apply: true,
      });
      await updatePlanningTopic(topic.id, {
        status:
          topic.dueAt && topic.calendarTarget ? "open" : "resolved",
        group:
          topic.dueAt && topic.calendarTarget ? "scheduled" : topic.group,
      });
      await refreshPlanning("decision-confirmed");
      setNotice("Entscheidung gespeichert und auf die Planung angewendet");
    } catch (caught) {
      setNotice(
        caught instanceof Error
          ? caught.message
          : "Die Entscheidung konnte nicht gespeichert werden.",
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

  const planTaskForTomorrow = async (taskId: string): Promise<boolean> => {
    const task = state.tasks.find((candidate) => candidate.id === taskId);
    if (!task || taskActionId) return false;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setTaskActionId(taskId);
    setTaskError("");
    try {
      const updated = await updateGoogleTask(task, {
        dueAt: dateAtNine(isoDateInput(tomorrow.toISOString())),
      });
      updateState((current) => ({
        ...current,
        tasks: current.tasks.map((candidate) =>
          candidate.id === taskId ? updated : candidate,
        ),
      }));
      return true;
    } catch (caught) {
      rememberGoogleError(
        caught,
        "Die Fokusaufgabe konnte nicht auf morgen gesetzt werden.",
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

  const changeDailyAnchor = (taskId: string, role: AnchorRole | null) => {
    updateState((current) => {
      const task = current.tasks.find((candidate) => candidate.id === taskId);
      if (!task) return current;
      const gamification =
        current.gamification ??
        createDefaultGamification(current.points, current.updatedAt);
      return withGamification(
        current,
        setDailyAnchor(
          gamification,
          task,
          isoDateInput(),
          role,
          new Date().toISOString(),
        ),
      );
    });
  };

  const changeAnchorDayStatus = (status: AnchorDayStatus) => {
    updateState((current) => {
      const gamification =
        current.gamification ??
        createDefaultGamification(current.points, current.updatedAt);
      return withGamification(
        current,
        setAnchorDayStatus(gamification, isoDateInput(), status),
      );
    });
    setNotice(
      status === "PLANNED"
        ? "Heute zählt als geplanter Ankertag"
        : "Heute bleibt bewusst außerhalb des Rhythmus",
    );
  };

  const buildRealm = (
    district: WorldDistrictKey,
    kind: WorldUpgradeKind,
  ) => {
    const gamification =
      state.gamification ?? createDefaultGamification(state.points, state.updatedAt);
    const result = buildWorldUpgrade(
      gamification,
      district,
      kind,
      new Date().toISOString(),
    );
    if (result.error) {
      setNotice(result.error);
      return;
    }
    updateState((current) => withGamification(current, result.gamification));
    setNotice(result.entry?.description ?? "Welt ausgebaut");
  };

  const redeemReward = (rewardId: string) => {
    const gamification =
      state.gamification ?? createDefaultGamification(state.points, state.updatedAt);
    const result = redeemPersonalReward(
      gamification,
      rewardId,
      new Date().toISOString(),
    );
    if (result.error) {
      setNotice(result.error);
      return;
    }
    updateState((current) => withGamification(current, result.gamification));
    setNotice("Persönliche Belohnung als eingelöst markiert · kein Kauf ausgelöst");
  };

  const saveRewardFeedback = (
    ledgerEntryId: string,
    presentation: RewardPresentation,
    rating: RewardFeedbackRating,
  ) => {
    updateState((current) => {
      const gamification =
        current.gamification ??
        createDefaultGamification(current.points, current.updatedAt);
      return withGamification(
        current,
        recordRewardFeedback(
          gamification,
          ledgerEntryId,
          presentation,
          rating,
          new Date().toISOString(),
        ),
      );
    });
    setNotice("Wirkung gespeichert · Anpassungen bleiben langsam und begrenzt");
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

  const saveGoal = (goal: Goal) => {
    updateState((current) => {
      const gamification =
        current.gamification ??
        createDefaultGamification(current.points, current.updatedAt);
      return withGamification(current, addGoal(gamification, goal));
    });
    setNotice("Kampagne mit Meilensteinen gespeichert");
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
  const rewardTask = state.tasks.find((task) => task.id === rewardTaskId) ?? null;

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
          <div className="level-block">
            <span>
              Level {levelForXp(progressTotals.earnedXp)}
              <strong>{progressTotals.earnedXp.toLocaleString("de-DE")} XP</strong>
            </span>
            <div className="level-track">
              <span style={{ width: `${(progressTotals.earnedXp % 250) / 2.5}%` }} />
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

        <PlanningHealthBanner
          error={planningError}
          loading={planningLoading}
          onNavigate={navigate}
          onRefresh={() => void refreshPlanning("manual")}
          report={planningReport}
        />

        <main id="main-content">
          {view === "today" ? (
            <TodayView
              externalEvents={externalEvents}
              integrations={integrations}
              onCompleteTask={completeTask}
              onNavigate={navigate}
              planningReport={planningReport}
              state={state}
              taskStatus={taskStatus}
              workspaceStatus={workspaceStatus}
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
              onRefresh={() => void refreshTasks()}
              onReopenTask={reopenTask}
              pendingLegacyCount={pendingLegacyTasks.length}
              state={state}
              status={taskStatus}
              syncing={taskSyncing}
            />
          ) : null}
          {view === "progress" ? (
            <MomentumRealmView
              onAddGoal={saveGoal}
              onAnchorChange={changeDailyAnchor}
              onAnchorDayStatusChange={changeAnchorDayStatus}
              onBuild={buildRealm}
              onDrRossChange={changeDrRoss}
              onFeedback={saveRewardFeedback}
              onModeChange={changeRewardMode}
              onOpenTasks={() => navigate("tasks")}
              onRedeem={redeemReward}
              onSurprisesChange={changeSurprises}
              state={state}
            />
          ) : null}
          {view === "calendar" ? (
            <CalendarWorkspace
              calendarLive={calendarLive}
              externalEvents={externalEvents}
              integrations={integrations}
              onEventsChange={setExternalEvents}
              onNewEvent={() => openQuickAction("event")}
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
              onNew={() => openCapture("document")}
              onOpen={openDocument}
              selectedDocument={selectedDocument}
              state={state}
              toast={setNotice}
            />
          ) : null}
          {view === "applications" ? (
            <ApplicationsView
              onAttachArtifact={attachApplicationArtifact}
              onCreateApplication={createApplication}
              onOpenStudio={openApplicationStudio}
              onRemoveArtifact={removeApplicationArtifact}
              onSaveMasterCv={saveMasterCv}
              onSetMasterCv={setMasterCv}
              onUpdateApplication={updateApplication}
              state={state}
              toast={setNotice}
            />
          ) : null}
          {view === "journal" ? (
            <DiaryView
              externalEvents={externalEvents}
              onCompleteTask={completeTask}
              onCreateApplication={createApplication}
              onOpenAppointment={() => openQuickAction("event")}
              onOpenCapture={openCapture}
              onPlanTask={planTaskForTomorrow}
              onSave={saveDiary}
              onAnalyze={analyzeSavedDiary}
              onGapAction={actOnPlanningGap}
              onDecision={recordTopicDecision}
              onTopicUpdate={updateTopic}
              onUpdateApplication={updateApplication}
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
            : openCapture(
                view === "finance"
                  ? "cost"
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
          : view === "journal"
            ? "Notiz erfassen"
            : "Neu erfassen"}
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
          onSaveIncome={saveIncome}
          onSaveJournal={saveCompactDiary}
          onSaveTask={saveTask}
        />
      ) : null}

      {quickAction ? (
        <QuickActionDialog
          documents={state.documents}
          integrations={integrations}
          kind={quickAction}
          masterCvDocumentId={state.masterCvDocumentId}
          applicationDraft={applicationDraft}
          onClose={() => {
            setQuickAction(null);
            setApplicationDraft(null);
          }}
          onSaveDocument={saveDocument}
          onSaveEvent={saveEvent}
          toast={setNotice}
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
          syncCopy={syncCopy}
          workspaceStatus={workspaceStatus}
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

type TodayViewProps = {
  state: AppState;
  externalEvents: CalendarEvent[];
  integrations: IntegrationConfig;
  taskStatus: GoogleTasksStatus | null;
  workspaceStatus: GoogleWorkspaceStatus | null;
  planningReport: PlanningHealthReport | null;
  onCompleteTask: (taskId: string) => Promise<void>;
  onNavigate: (view: ViewKey) => void;
};

function TodayView({
  state,
  externalEvents,
  integrations,
  taskStatus,
  workspaceStatus,
  planningReport,
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
        isSameCalendarMonth(cost.dueAt, now),
    )
    .reduce((sum, cost) => sum + cost.amount, 0);
  const events = [...externalEvents, ...state.calendarEvents]
    .filter((event) => new Date(event.endAt).getTime() >= now)
    .sort((left, right) => left.startAt.localeCompare(right.startAt));
  const nextEvents = events.slice(0, 3);
  const focusMinutes = focusTasks.reduce(
    (sum, task) => sum + task.estimateMinutes,
    0,
  );
  const todayEvents = events.filter(
    (event) => calendarDayDifference(event.startAt, now) === 0,
  );
  const weekEvents = events.filter((event) => {
    const difference = calendarDayDifference(event.startAt, now);
    return difference >= 0 && difference < 7;
  });
  const openCosts = state.costs.filter((cost) => cost.status !== "paid");
  const documentFiles = state.documents.filter(
    (document) => document.kind !== "folder",
  );
  const documentFolders = state.documents.filter(
    (document) => document.kind === "folder",
  );
  const documentsToReview = state.documents.filter((document) => {
    const markedForReview = document.tags.some(
      (tag) => tag.trim().toLocaleLowerCase("de-DE") === "prüfen",
    );
    const reviewIsNear =
      Boolean(document.reviewAt) &&
      daysFromNow(document.reviewAt ?? "") >= 0 &&
      daysFromNow(document.reviewAt ?? "") <= 14;
    return markedForReview || reviewIsNear;
  });
  const latestDocument = [...state.documents].sort((left, right) =>
    right.modifiedAt.localeCompare(left.modifiedAt),
  )[0];
  const shortlistedApplications = state.applications.filter(
    (application) =>
      application.shortlisted &&
      !["closed", "rejected", "withdrawn"].includes(application.status),
  );
  const activeApplications = state.applications.filter((application) =>
    ["draft", "submitted", "interview", "offer"].includes(application.status),
  );
  const interviewApplications = state.applications.filter(
    (application) => application.status === "interview",
  );
  const journalThisWeek = state.journal.filter((entry) => {
    const entryDate = new Date(`${entry.date}T12:00:00`);
    const difference = now - entryDate.getTime();
    return difference >= 0 && difference < 7 * 86_400_000;
  });
  const averageMood = state.journal.length
    ? state.journal.reduce((sum, entry) => sum + entry.mood, 0) /
      state.journal.length
    : null;
  const focusShare = openTasks.length
    ? Math.round((focusTasks.length / openTasks.length) * 100)
    : 0;
  const upcomingCostTotal = upcomingCosts.reduce(
    (sum, cost) => sum + cost.amount,
    0,
  );
  const averageMoodLabel =
    averageMood === null
      ? "—"
      : averageMood.toFixed(1).replace(".", ",");
  const moodShare =
    averageMood === null ? 0 : Math.round((averageMood / 5) * 100);
  const todayPlanning = planningReport?.days[0] || null;
  const momentumRhythm = anchorRhythm(
    state.gamification?.anchorDays ?? [],
    isoDateInput(new Date(now).toISOString()),
  );
  const planningNeedsAttention =
    !planningReport ||
    planningReport.state === "unknown" ||
    planningReport.state === "stale" ||
    planningReport.criticalCount > 0;

  return (
    <div className="view-stack">
      <section className="welcome-copy">
        <div className="welcome-message">
          <span className="eyebrow">Guten Tag, {state.ownerName}</span>
          <h1 tabIndex={-1}>Ein klarer Tag beginnt mit dem nächsten Schritt.</h1>
          <p>
            {focusTasks.length
              ? `${focusTasks.length} sinnvolle Aufgaben, etwa ${focusMinutes} Minuten Fokus und ${upcomingCosts.length} anstehende Zahlungen sind für dich vorbereitet.`
              : todayPlanning?.state === "intentionally_free"
                ? "Heute wurde bei frischen Kalenderdaten ausdrücklich als bewusst frei, Urlaub oder Krankheit bestätigt."
                : "Für heute fehlt noch ein bestätigter Plan. Kläre zuerst Kalenderstand, Verpflichtungen und mindestens einen echten Planungsblock."}
          </p>
        </div>
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
      </section>

      <section
        className={`today-planning-status ${planningNeedsAttention ? "is-urgent" : ""}`}
        aria-label="Verlässlichkeit des heutigen Plans"
      >
        <div>
          <span className="eyebrow">Administrative Grundlage</span>
          <strong>
            {planningReport?.title || "Planungsstatus unbekannt – sofort klären"}
          </strong>
          <p>
            {planningReport?.message ||
              "Kein leerer Kalender wird als Freizeit interpretiert, solange Vollständigkeit und Aktualität nicht bestätigt sind."}
          </p>
        </div>
        <button
          className="button button-primary"
          onClick={() => onNavigate("calendar")}
          type="button"
        >
          {planningNeedsAttention ? "Lücken jetzt klären" : "Planung ansehen"}
        </button>
      </section>

      <section className="core-kpi-grid" aria-label="Kernkennzahlen nach Bereichen">
        <CoreKpiGroup
          copy={`Beginne mit „${focusTasks[0]?.title ?? "einem kleinen Schritt"}“.`}
          eyebrow="Gerri Coach"
          id="tasks-kpis-title"
          onOpen={() => onNavigate("tasks")}
          title="Ziele & Fokus"
          tone="goals"
        >
          <div className="kpi-goals-layout">
            <div
              aria-label={`${focusShare} Prozent der offenen Aufgaben sind im Fokus`}
              className="kpi-target-ring"
              role="img"
              style={{ "--target-progress": `${focusShare}%` } as CSSProperties}
            >
              <div>
                <span>Im Fokus</span>
                <strong>{focusTasks.length}</strong>
                <small>von {openTasks.length} offen</small>
              </div>
            </div>
            <dl className="kpi-support-stats">
              <div>
                <dt>Offene Aufgaben</dt>
                <dd>{openTasks.length}</dd>
                <small>In Google Tasks</small>
              </div>
              <div>
                <dt>Fokuszeit</dt>
                <dd>{focusMinutes} Min.</dd>
                <small>Für die nächsten Schritte</small>
              </div>
            </dl>
          </div>
        </CoreKpiGroup>

        <CoreKpiGroup
          copy={
            planningNeedsAttention
              ? "Leere oder unzuverlässige Zeiträume sind Planungslücken, keine Freizeit."
              : "Termine und Fokuszeiten sind frisch und vollständig geprüft."
          }
          eyebrow="Deine Zeit"
          id="calendar-kpis-title"
          onOpen={() => onNavigate("calendar")}
          title="Kalender"
          tone="calendar"
        >
          <div className="kpi-calendar-layout">
            <div className="kpi-deadline">
              <span>Nächster Termin</span>
              <strong>
                {events[0] ? (
                  <time dateTime={events[0].startAt}>
                    {formatTime(events[0].startAt)}
                  </time>
                ) : todayPlanning?.state === "intentionally_free" ? (
                  "Bewusst frei"
                ) : (
                  "Ungeplant"
                )}
              </strong>
              <small>
                {events[0]
                  ? `${formatRelativeDate(events[0].startAt)} · ${events[0].title}`
                  : todayPlanning?.state === "intentionally_free"
                    ? "Ausdrücklich bestätigt"
                    : "Planungslücke mit Top-Priorität"}
              </small>
            </div>
            <dl className="kpi-calendar-counts">
              <div>
                <dt>Heute</dt>
                <dd>{todayEvents.length}</dd>
                <small>Termine und Fokus</small>
              </div>
              <div>
                <dt>7 Tage</dt>
                <dd>{weekEvents.length}</dd>
                <small>Geplante Termine</small>
              </div>
            </dl>
          </div>
        </CoreKpiGroup>

        <CoreKpiGroup
          copy="Anstehende Zahlungen auf einen Blick."
          eyebrow="Privat"
          id="finance-kpis-title"
          onOpen={() => onNavigate("finance")}
          title="Finanzen"
          tone="finance"
        >
          <div className="kpi-finance-layout">
            <div className="kpi-money-primary">
              <span>Nächste 14 Tage</span>
              <strong>{formatCurrency(upcomingCostTotal)}</strong>
              <small>{upcomingCosts.length} anstehende Zahlungen</small>
              <div
                aria-hidden="true"
                className={`kpi-money-segments${upcomingCosts.length ? "" : " empty"}`}
              >
                {upcomingCosts.slice(0, 5).map((cost) => (
                  <i
                    key={cost.id}
                    style={{ flexGrow: Math.max(cost.amount, 1) }}
                  />
                ))}
              </div>
            </div>
            <dl className="kpi-ledger">
              <div>
                <dt>Offen</dt>
                <dd>{openCosts.length}</dd>
                <small>Geplant oder fällig</small>
              </div>
              <div>
                <dt>Bezahlt im Monat</dt>
                <dd>{formatCurrency(paidThisMonth)}</dd>
                <small>Bereits dokumentiert</small>
              </div>
            </dl>
          </div>
        </CoreKpiGroup>

        <CoreKpiGroup
          copy="Ablage, Prüfpunkte und Aktualität."
          eyebrow="Deine Ablage"
          id="documents-kpis-title"
          onOpen={() => onNavigate("documents")}
          title="Unterlagen"
          tone="documents"
        >
          <div className="kpi-documents-layout">
            <div className="kpi-folder-summary">
              <div aria-hidden="true" className="kpi-folder-shape">
                <i />
                <i />
                <i />
              </div>
              <div>
                <strong>{documentFiles.length}</strong>
                <span>Unterlagen</span>
                <small>{documentFolders.length} Ordner verknüpft</small>
              </div>
            </div>
            <dl className="kpi-document-facts">
              <div>
                <dt>Zu prüfen</dt>
                <dd>{documentsToReview.length}</dd>
                <small>Markiert oder terminiert</small>
              </div>
              <div>
                <dt>Zuletzt aktualisiert</dt>
                <dd>
                  {latestDocument ? formatDate(latestDocument.modifiedAt) : "—"}
                </dd>
                <small>{latestDocument?.name ?? "Noch keine Unterlage"}</small>
              </div>
            </dl>
          </div>
        </CoreKpiGroup>

        <CoreKpiGroup
          copy="Shortlist, aktive Prozesse und Gespräche."
          eyebrow="Deine Chancen"
          id="applications-kpis-title"
          onOpen={() => onNavigate("applications")}
          title="Bewerbungen"
          tone="applications"
        >
          <ol
            aria-label="Bewerbungsprozess von der Shortlist bis zum Gespräch"
            className="kpi-application-pipeline"
          >
            <li>
              <div>
                <span>Vorgemerkt</span>
                <small>Auf deiner Shortlist</small>
              </div>
              <strong>{shortlistedApplications.length}</strong>
            </li>
            <li>
              <div>
                <span>In Bearbeitung</span>
                <small>Entwurf bis Angebot</small>
              </div>
              <strong>{activeApplications.length}</strong>
            </li>
            <li>
              <div>
                <span>Gespräche</span>
                <small>Aktuelle Interviews</small>
              </div>
              <strong>{interviewApplications.length}</strong>
            </li>
          </ol>
        </CoreKpiGroup>

        <CoreKpiGroup
          copy="Tagesabschlüsse, Stimmung und dein robuster 14-Tage-Rhythmus."
          eyebrow="Dein Tagesabschluss"
          id="journal-kpis-title"
          onOpen={() => onNavigate("journal")}
          title="Tagebuch"
          tone="journal"
        >
          <div className="kpi-journal-layout">
            <div
              aria-label={
                averageMood === null
                  ? "Noch keine Stimmung erfasst"
                  : `Durchschnittliche Stimmung ${averageMoodLabel} von 5`
              }
              className="kpi-mood-ring"
              role="img"
              style={{ "--mood-progress": `${moodShare}%` } as CSSProperties}
            >
              <div>
                <strong>{averageMoodLabel}</strong>
                <span>von 5</span>
              </div>
            </div>
            <div className="kpi-rhythm-summary">
              <div>
                <span>14-Tage-Rhythmus</span>
                <strong>
                  {momentumRhythm.plannedDays ? `${momentumRhythm.percent} %` : "Noch offen"}
                </strong>
                <small>
                  {momentumRhythm.fulfilledDays} von {momentumRhythm.plannedDays} geplanten Ankertagen
                </small>
              </div>
              <div className="kpi-journal-count">
                <strong>{state.journal.length}</strong>
                <span>Einträge</span>
                <small>{journalThisWeek.length} in 7 Tagen</small>
              </div>
            </div>
          </div>
        </CoreKpiGroup>
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
                  disabled={!taskStatus?.authorized}
                  onClick={() => void onCompleteTask(task.id)}
                  title={
                    taskStatus?.authorized
                      ? "In Google Tasks erledigen"
                      : "Zuerst Google Tasks verbinden"
                  }
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
            action={
              taskStatus?.authorized
                ? "Öffnen"
                : taskStatus?.configured
                  ? "Verbinden"
                  : "Ansehen"
            }
            detail="Führende Quelle für alle Aufgaben"
            href={
              taskStatus?.authorized
                ? "https://tasks.google.com/"
                : taskStatus?.configured && taskStatus.connectUrl
                  ? taskStatus.connectUrl
                  : "https://tasks.google.com/"
            }
            label="Google Tasks"
            status={taskStatus?.authorized ? "aktuell" : "bereit"}
          />
          <IntegrationRow
            action="Öffnen"
            detail="Persönlich · Dateien bleiben in Drive"
            href={integrations.driveFolderUrl}
            label="Google Drive"
            status={
              workspaceStatus?.capabilities.drive.granted
                ? "verknüpft"
                : "bereit"
            }
          />
          <IntegrationRow
            action="Ansehen"
            detail={integrations.calendarId}
            href={integrations.calendarEmbedUrl}
            label="Google Kalender"
            status={
              workspaceStatus?.capabilities.calendar.granted
                ? "aktuell"
                : "bereit"
            }
          />
          <IntegrationRow
            action="Postfach"
            detail={integrations.gmailAccount}
            href={`https://mail.google.com/mail/u/${encodeURIComponent(integrations.gmailAccount)}/#inbox`}
            label="Gmail"
            status={
              workspaceStatus?.capabilities.gmail.granted
                ? "Entwürfe"
                : "bereit"
            }
          />
        </section>
      </div>
    </div>
  );
}

function CoreKpiGroup({
  id,
  eyebrow,
  title,
  copy,
  tone,
  onOpen,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  copy: string;
  tone: string;
  onOpen: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className={`core-kpi-group core-kpi-${tone}`}
    >
      <header className="core-kpi-header">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2 id={id}>{title}</h2>
          <p>{copy}</p>
        </div>
        <button
          aria-label={`${title} öffnen`}
          onClick={onOpen}
          type="button"
        >
          Öffnen <span aria-hidden="true">→</span>
        </button>
      </header>
      <div className="core-kpi-visual">{children}</div>
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
}) {
  const [filter, setFilter] = useState<TaskQuadrant | "all">("all");
  const visible = state.tasks.filter(
    (task) => !task.completed && (filter === "all" || task.quadrant === filter),
  );
  const completed = state.tasks.filter((task) => task.completed);
  const sourceCopy = status?.authorized
    ? `${status.googleEmail || "Google-Konto"} · ${status.taskList?.title || "Gerris Kompass"}`
    : status?.configured
      ? "Google-Konto noch nicht für Aufgaben freigegeben"
      : "OAuth-Laufzeitwerte in Sites fehlen noch";

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
        eyebrow="Gerri Coach"
        title="Was ist der sinnvollste nächste Schritt?"
        copy="Google Tasks ist die führende Aufgabenquelle. Der Kompass ergänzt Eisenhower-Bereich, Lebensbereich, Aufwand und Fortschritt privat."
      />

      <section
        className={`google-source-card ${status?.authorized ? "is-connected" : ""}`}
        aria-label="Google-Tasks-Verbindung"
      >
        <div>
          <span className="eyebrow">Aufgabenquelle</span>
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
              Übernimm sie einmalig und idempotent in die Liste „Gerris Kompass“.
              Danach ist Google Tasks die einzige Aufgabenquelle.
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
                      <span>{LIFE_AREA_LABELS[task.area]}</span>
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
                    <div className="task-progress labeled">
                      <span style={{ width: `${task.progress}%` }} />
                      <small>{task.progress}%</small>
                    </div>
                    <div className="task-card-actions">
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
        <p>
          Erledigte Aufgaben bleiben im Verlauf erhalten. Als Tagesanker geplante
          Aufgaben fließen zusätzlich in deinen 14-Tage-Rhythmus ein.
        </p>
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
  onNew,
  selectedDocument,
  toast,
}: {
  driveController: DriveExplorerController;
  state: AppState;
  integrations: IntegrationConfig;
  onOpen: (document: DocumentRef) => void;
  onCloseSelected: () => void;
  onNew: () => void;
  selectedDocument: DocumentRef | null;
  toast: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("Alle");
  const privateDocuments = state.documents.filter(
    (document) => document.storage === "upload" && document.kind !== "folder",
  );
  const folderNames = [
    "Alle",
    ...new Set(
      privateDocuments
        .map((document) => document.folderPath.split("/").slice(1, 3).join(" / ")),
    ),
  ];
  const visible = privateDocuments.filter((document) => {
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
        eyebrow="Google Drive · Live-Ablage · Private Uploads"
        title="Wichtige Unterlagen – lesbar, sortiert, griffbereit."
        copy="Durchsuche deine Drive-Ordner live, öffne Dateien direkt unter der Liste oder lege zusätzliche Dateien geschützt im privaten Sites-Speicher ab."
        action={
          <div className="button-group">
            <a
              className="button button-soft"
              href={
                driveController.status?.root?.webViewLink ||
                integrations.driveFolderUrl
              }
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

      <DriveExplorer controller={driveController} />

      <section className="drive-location-bar" aria-label="Drive-Speicherorte">
        <div>
          <span className="integration-initial">S</span>
          <p>
            <strong>Zusätzliche private Sites-Dateien</strong>
            <small>Getrennt von Google Drive · nur für dich</small>
          </p>
          <button onClick={onNew} type="button">Hochladen</button>
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
          <span className="eyebrow">Separater privater Speicher</span>
          <h2>Sites-Dateien</h2>
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

      {!visible.length ? (
        <div className="drive-empty private-upload-empty">
          <span>PRIVAT</span>
          <h3>Noch keine zusätzlichen Sites-Dateien abgelegt.</h3>
          <p>Google-Drive-Dateien werden oben automatisch und getrennt angezeigt.</p>
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
  integrations: IntegrationConfig;
  onClose: () => void;
  onSaveTask: (task: Task) => Promise<boolean>;
  onSaveCost: (cost: Cost) => void;
  onSaveIncome: (income: Income) => void;
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
  onSaveIncome,
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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (kind === "task") {
      if (!title.trim() || saving) return;
      setSaving(true);
      setSubmitError("");
      const saved = await onSaveTask({
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
      setSaving(false);
      if (!saved) {
        setSubmitError(
          "Bitte verbinde Google Tasks oder erneuere die Berechtigung. Es wurde keine lokale Aufgabenkopie angelegt.",
        );
        return;
      }
      onClose();
      return;
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
        active: true,
        account,
        costType,
        priority,
        subcategory,
      });
    } else if (kind === "income") {
      const numericAmount = Number.parseFloat(amount.replace(",", "."));
      if (!title.trim() || !Number.isFinite(numericAmount)) return;
      onSaveIncome({
        id: uid("income"),
        title: title.trim(),
        amount: numericAmount,
        receivedAt: dateAtNine(date),
        cadence,
        source: payee.trim(),
        note: "Manuell im Finanzbereich erfasst",
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
              ["income", "Einnahme"],
              ["document", "Unterlage"],
              ["journal", "Tagebuch"],
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
                Die 48 Vorlagen und 15 Kategorien stammen aus deiner
                Kostentabelle. Beträge werden nicht vorausgefüllt und bleiben
                privat.
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
                    value={amount}
                  />
                </label>
                <label>
                  Eingegangen am
                  <input
                    onChange={(event) => setDate(event.target.value)}
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
                Einnahmen werden manuell erfasst und nur für deine monatliche
                Übersicht verwendet.
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
                Nächster kleiner Schritt für morgen
                <input
                  onChange={(event) => setNextStep(event.target.value)}
                  value={nextStep}
                />
              </label>
            </>
          ) : null}

          {submitError ? (
          <p className="form-error" role="alert">{submitError}</p>
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
  );
}

function SettingsDialog({
  integrations,
  syncCopy,
  workspaceStatus,
  onClose,
  onExport,
  onImport,
  onReset,
  onRefreshGoogle,
}: {
  integrations: IntegrationConfig;
  syncCopy: string;
  workspaceStatus: GoogleWorkspaceStatus | null;
  onClose: () => void;
  onExport: () => void;
  onImport: (raw: string) => void;
  onReset: () => void;
  onRefreshGoogle: () => void;
}) {
  const importRef = useRef<HTMLInputElement>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [googleError, setGoogleError] = useState("");
  const capabilityRows: Array<{
    key: keyof GoogleWorkspaceStatus["capabilities"];
    label: string;
    detail: string;
  }> = [
    {
      key: "tasks",
      label: "Google Tasks",
      detail: "Führende Quelle für alle Aufgaben",
    },
    {
      key: "calendar",
      label: "Google Kalender",
      detail: "Termine lesen und privat erstellen",
    },
    {
      key: "drive",
      label: "Google Drive",
      detail: "Stammordner schreibgeschützt öffnen",
    },
    {
      key: "gmail",
      label: "Gmail",
      detail: "Nur bearbeitbare Entwürfe erstellen, nie senden",
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
      const payload = (await response.json()) as { error?: string };
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
              {syncCopy}. Aufgaben werden in Google Tasks geführt; Eisenhower-
              Metadaten, Kosten und Tagebuch bleiben im privaten Sites-Speicher.
              Noch nicht übernommene Altaufgaben bleiben bis zur Migration lokal.
              Drive-Dateien verbleiben bei Google.
            </p>
          </div>
        </div>
        <div className="settings-section">
          <span className="eyebrow">Integrationen</span>
          <div className="google-account-summary">
            <div>
              <strong>
                {workspaceStatus?.connected
                  ? workspaceStatus.googleEmail || "Google-Konto verbunden"
                  : workspaceStatus?.configured
                    ? "Google-Konto noch nicht verbunden"
                    : "Google OAuth in Sites noch nicht eingerichtet"}
              </strong>
              <p>
                Berechtigungen werden schrittweise nur für die gewählte Funktion
                angefragt.
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
          {capabilityRows.map((row) => {
            const capability = workspaceStatus?.capabilities[row.key];
            const status = capability?.granted
              ? "Verbunden"
              : workspaceStatus?.configured
                ? "Berechtigung fehlt"
                : "Konfiguration fehlt";
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
                  <span className="integration-disabled">Sites prüfen</span>
                )}
              </article>
            );
          })}
          <div className="settings-integration-links">
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
          <h3>Deine Daten mitnehmen</h3>
          <p>
            Exportiere jederzeit ein lesbares JSON-Backup. Google Tasks bleibt
            führend; das Backup enthält nur den letzten Aufgabenstand und die
            privaten Kompass-Zusatzdaten.
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
