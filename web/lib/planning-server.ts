import { and, asc, eq, inArray, lt, lte, or } from "drizzle-orm";

import { getDb } from "../db";
import {
  calendarLinks,
  planningGaps,
  syncOutboxItems,
  userStates,
} from "../db/schema";
import {
  createCalendarEvent,
  createGoogleCalendar,
  deleteCalendarEvent,
  findManagedCalendarEvents,
  getCalendarEvent,
  isCalendarExclusivelyPrivate,
  listCalendarEvents,
  listGoogleCalendars,
  updateCalendarEvent,
  type CreateCalendarEventInput,
} from "./google-calendar-server";
import {
  createGerrisTask,
  getGerrisTask,
  listGerrisTasks,
  provisionGerrisTaskList,
  updateGerrisTask,
} from "./google-tasks-server";
import {
  GoogleApiError,
  GoogleAuthorizationError,
  googleConnectionForOwner,
  googleWorkspaceStatus,
  type GoogleConnection,
} from "./google-workspace-server";
import {
  addPlanningDays,
  buildPlanningHealthReport,
  DEFAULT_FOCUS_MINUTES,
  gapTaskInput,
  managedCalendarRoute,
  MAX_AUTO_FOCUS_MINUTES_PER_DAY,
  PLANNING_BUFFER_MINUTES,
  PLANNING_DAY_END_HOUR,
  PLANNING_DAY_START_HOUR,
  PLANNING_DETAIL_DAYS,
  planningDateKey,
  stablePlanningGapId,
  type PlanningCalendarSnapshot,
} from "./planning";
import {
  finishSyncRun,
  persistPlanningGaps,
  readPlanningStore,
  saveGapTaskId,
  saveManagedCalendarState,
  startSyncRun,
  unresolvedPlanningGaps,
} from "./planning-store";
import {
  MANAGED_CALENDAR_NAMES,
  type AppState,
  type CalendarEvent,
  type ManagedCalendar,
  type ManagedCalendarKey,
  type PlanningGap,
  type PlanningHealthReport,
  type PlanningSourceType,
  type SyncRun,
} from "./types";
import { createDefaultGamification } from "./gamification";
import {
  createDefaultDashboardSettings,
  normalizeDashboardSettings,
} from "./dashboard";
import { normalizeMasterCvContent } from "./master-cv";

const NO_CALENDAR_ERROR = "Kalenderdaten konnten nicht geladen werden.";
const MAX_CALENDARS_FOR_PLANNING = 12;
const MAX_OUTBOX_BATCH = 40;
const MAX_OUTBOX_ATTEMPTS = 5;

type PlanningSnapshot = {
  state: AppState;
  events: CalendarEvent[];
  calendar: PlanningCalendarSnapshot;
  managedCalendars: ManagedCalendar[];
  calendarConnection: GoogleConnection | null;
  taskConnection: GoogleConnection | null;
  automationMode: "dry-run" | "safe";
  dayIntents: Awaited<ReturnType<typeof readPlanningStore>>["dayIntents"];
  openTopics: Awaited<ReturnType<typeof readPlanningStore>>["openTopics"];
  storedGaps: PlanningGap[];
  lastSyncRun: SyncRun | null;
};

type DesiredCalendarEvent = CreateCalendarEventInput & {
  sourceType: PlanningSourceType;
  sourceId: string;
  sourceOccurrence: string;
  desiredHash: string;
  managedCalendarKey: ManagedCalendarKey;
  calendarId: string;
};

type CalendarLinkRow = typeof calendarLinks.$inferSelect;
type OutboxRow = typeof syncOutboxItems.$inferSelect;

function emptyState(): AppState {
  return {
    schemaVersion: 1,
    revision: 0,
    updatedAt: new Date(0).toISOString(),
    ownerName: "Gerri",
    monthlyBudget: 0,
    points: 0,
    rhythmDays: 0,
    gamification: createDefaultGamification(0, new Date(0).toISOString()),
    tasks: [],
    pendingTaskImports: [],
    costs: [],
    incomes: [],
    accountBalances: { paypal: null, revolut: null, updatedAt: null },
    documents: [],
    calendarEvents: [],
    applications: [],
    masterCvDocumentId: null,
    careerPassportDocumentId: null,
    masterCvContent: null,
    contacts: [],
    journal: [],
    dashboardSettings: createDefaultDashboardSettings(0),
  };
}

function parsedStoredState(value: string | null | undefined): AppState {
  if (!value) return emptyState();
  try {
    const state = JSON.parse(value) as Partial<AppState>;
    if (
      state.schemaVersion !== 1 ||
      !Array.isArray(state.tasks) ||
      !Array.isArray(state.costs) ||
      !Array.isArray(state.documents) ||
      !Array.isArray(state.calendarEvents) ||
      !Array.isArray(state.applications) ||
      !Array.isArray(state.journal)
    ) {
      return emptyState();
    }
    return {
      ...(state as AppState),
      careerPassportDocumentId:
        typeof state.careerPassportDocumentId === "string"
          ? state.careerPassportDocumentId
          : null,
      masterCvContent: normalizeMasterCvContent(state.masterCvContent),
      contacts: Array.isArray(state.contacts) ? state.contacts : [],
      dashboardSettings: normalizeDashboardSettings(
        state.dashboardSettings,
        state.monthlyBudget,
      ),
    };
  } catch {
    return emptyState();
  }
}

async function loadStoredState(ownerEmail: string): Promise<AppState> {
  const [row] = await getDb()
    .select({ stateJson: userStates.stateJson })
    .from(userStates)
    .where(eq(userStates.ownerEmail, ownerEmail))
    .limit(1);
  return parsedStoredState(row?.stateJson);
}

function errorMessage(error: unknown): string {
  if (error instanceof GoogleAuthorizationError) return error.message;
  if (error instanceof GoogleApiError) {
    return error.status === 429 || error.status >= 500
      ? "Google Kalender ist vorübergehend nicht erreichbar."
      : NO_CALENDAR_ERROR;
  }
  return error instanceof Error && error.message
    ? error.message.slice(0, 500)
    : NO_CALENDAR_ERROR;
}

async function resolveManagedCalendars(
  connection: GoogleConnection,
  calendars: Awaited<ReturnType<typeof listGoogleCalendars>>,
): Promise<ManagedCalendar[]> {
  const checkedAt = new Date().toISOString();
  const entries = Object.entries(MANAGED_CALENDAR_NAMES) as Array<
    [ManagedCalendarKey, string]
  >;
  return Promise.all(
    entries.map(async ([key, name]): Promise<ManagedCalendar> => {
      const matches = calendars.filter(
        (calendar) => calendar.accessRole === "owner" && calendar.name.trim() === name,
      );
      if (matches.length === 0) {
        return {
          key,
          name,
          calendarId: null,
          status: "missing",
          matchCount: 0,
          accessRole: null,
          privateAclVerified: key === "private" ? null : true,
          lastCheckedAt: checkedAt,
          error: null,
        };
      }
      if (matches.length > 1) {
        return {
          key,
          name,
          calendarId: null,
          status: "ambiguous",
          matchCount: matches.length,
          accessRole: "owner",
          privateAclVerified: key === "private" ? null : true,
          lastCheckedAt: checkedAt,
          error: null,
        };
      }
      const match = matches[0];
      if (key === "private") {
        try {
          const privateAclVerified = await isCalendarExclusivelyPrivate(
            connection,
            match.id,
          );
          return {
            key,
            name,
            calendarId: match.id,
            status: privateAclVerified ? "ready" : "private_unverified",
            matchCount: 1,
            accessRole: match.accessRole,
            privateAclVerified,
            lastCheckedAt: checkedAt,
            error: privateAclVerified
              ? null
              : "Mindestens eine zusätzliche Kalenderfreigabe wurde gefunden.",
          };
        } catch (error) {
          return {
            key,
            name,
            calendarId: match.id,
            status: "private_unverified",
            matchCount: 1,
            accessRole: match.accessRole,
            privateAclVerified: false,
            lastCheckedAt: checkedAt,
            error: errorMessage(error),
          };
        }
      }
      return {
        key,
        name,
        calendarId: match.id,
        status: "ready",
        matchCount: 1,
        accessRole: match.accessRole,
        privateAclVerified: true,
        lastCheckedAt: checkedAt,
        error: null,
      };
    }),
  );
}

function selectedCalendarIds(
  catalog: Awaited<ReturnType<typeof listGoogleCalendars>>,
  managed: ManagedCalendar[],
): string[] {
  const result = new Set<string>();
  for (const calendar of managed) {
    if (calendar.calendarId) result.add(calendar.calendarId);
  }
  for (const calendar of catalog) {
    if (calendar.selected || calendar.primary) result.add(calendar.id);
    if (result.size >= MAX_CALENDARS_FOR_PLANNING) break;
  }
  return [...result].slice(0, MAX_CALENDARS_FOR_PLANNING);
}

async function loadPlanningSnapshot(ownerEmail: string): Promise<PlanningSnapshot> {
  const [state, store, workspace] = await Promise.all([
    loadStoredState(ownerEmail),
    readPlanningStore(ownerEmail),
    googleWorkspaceStatus(ownerEmail).catch(() => null),
  ]);
  let taskConnection: GoogleConnection | null = null;
  try {
    taskConnection = await googleConnectionForOwner(ownerEmail, {
      capability: "tasks",
    });
    const taskData = await listGerrisTasks(taskConnection);
    state.tasks = taskData.tasks.map((task) => ({ ...task }));
  } catch {
    taskConnection = null;
  }

  const calendarGranted = Boolean(workspace?.capabilities.calendar.granted);
  if (!workspace?.connected || !calendarGranted) {
    return {
      state,
      events: state.calendarEvents,
      calendar: {
        connected: false,
        loaded: false,
        selectedCalendarIds: [],
        fetchedAt: null,
        error: workspace?.connected
          ? "Die Kalenderberechtigungen müssen aktualisiert werden."
          : "Google Kalender ist nicht verbunden.",
      },
      managedCalendars: store.managedCalendars,
      calendarConnection: null,
      taskConnection,
      automationMode: store.automationMode,
      dayIntents: store.dayIntents,
      openTopics: store.openTopics,
      storedGaps: store.gaps,
      lastSyncRun: store.lastSyncRun,
    };
  }

  try {
    const calendarConnection = await googleConnectionForOwner(ownerEmail, {
      capability: "calendar",
    });
    const catalog = await listGoogleCalendars(calendarConnection);
    const managedCalendars = await resolveManagedCalendars(
      calendarConnection,
      catalog,
    );
    const ids = selectedCalendarIds(catalog, managedCalendars);
    const now = Date.now();
    const timeMin = new Date(now - 24 * 60 * 60 * 1_000).toISOString();
    const timeMax = new Date(now + 45 * 24 * 60 * 60 * 1_000).toISOString();
    const events = ids.length
      ? (
          await Promise.all(
            ids.map((calendarId) =>
              listCalendarEvents(calendarConnection, calendarId, {
                timeMin,
                timeMax,
              }),
            ),
          )
        ).flat()
      : [];
    return {
      state,
      events: [...events, ...state.calendarEvents],
      calendar: {
        connected: true,
        loaded: true,
        selectedCalendarIds: ids,
        fetchedAt: new Date().toISOString(),
        error: null,
      },
      managedCalendars,
      calendarConnection,
      taskConnection,
      automationMode: store.automationMode,
      dayIntents: store.dayIntents,
      openTopics: store.openTopics,
      storedGaps: store.gaps,
      lastSyncRun: store.lastSyncRun,
    };
  } catch (error) {
    return {
      state,
      events: state.calendarEvents,
      calendar: {
        connected: true,
        loaded: false,
        selectedCalendarIds: [],
        fetchedAt: null,
        error: errorMessage(error),
      },
      managedCalendars: store.managedCalendars,
      calendarConnection: null,
      taskConnection,
      automationMode: store.automationMode,
      dayIntents: store.dayIntents,
      openTopics: store.openTopics,
      storedGaps: store.gaps,
      lastSyncRun: store.lastSyncRun,
    };
  }
}

function reportFromSnapshot(snapshot: PlanningSnapshot): PlanningHealthReport {
  return buildPlanningHealthReport({
    state: snapshot.state,
    events: snapshot.events,
    calendar: snapshot.calendar,
    managedCalendars: snapshot.managedCalendars,
    dayIntents: snapshot.dayIntents,
    openTopics: snapshot.openTopics,
    storedGaps: snapshot.storedGaps,
    automationMode: snapshot.automationMode,
    lastSyncRun: snapshot.lastSyncRun,
  });
}

export async function planningReportForOwner(
  ownerEmail: string,
): Promise<PlanningHealthReport> {
  return reportFromSnapshot(await loadPlanningSnapshot(ownerEmail));
}

async function provisionManagedCalendars(
  connection: GoogleConnection,
  current: ManagedCalendar[],
): Promise<ManagedCalendar[]> {
  for (const calendar of current) {
    if (calendar.status !== "missing") continue;
    await createGoogleCalendar(connection, {
      name: calendar.name,
      description:
        calendar.key === "birthdays_holidays"
          ? "Von Gerris Kompass eindeutig zugeordneter Bereich; bestehende Einträge bleiben unangetastet."
          : "Von Gerris Kompass sicher verwalteter Bereichskalender.",
      timeZone: "Europe/Berlin",
    });
  }
  const catalog = await listGoogleCalendars(connection);
  return resolveManagedCalendars(connection, catalog);
}

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1] || null;
}

function hasExplicitTime(value: string | null | undefined): value is string {
  return Boolean(
    value &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) &&
      !Number.isNaN(new Date(value).getTime()),
  );
}

function localParts(value: Date): Record<string, string> {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(value)
    .reduce<Record<string, string>>((result, part) => {
      if (part.type !== "literal") result[part.type] = part.value;
      return result;
    }, {});
}

function berlinDateTime(date: string, hour: number, minute = 0): Date {
  const [year, month, day] = date.split("-").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
  let candidate = desired;
  for (let index = 0; index < 3; index += 1) {
    const parts = localParts(new Date(candidate));
    const displayed = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    candidate += desired - displayed;
  }
  return new Date(candidate);
}

async function desiredHash(value: Omit<DesiredCalendarEvent, "desiredHash">) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify({
        calendarId: value.calendarId,
        title: value.title,
        startAt: value.startAt,
        endAt: value.endAt,
        kind: value.kind,
        note: value.note || "",
        reminderMinutes: value.reminderMinutes ?? null,
        sourceType: value.sourceType,
        sourceId: value.sourceId,
        sourceOccurrence: value.sourceOccurrence,
        managedCalendarKey: value.managedCalendarKey,
      }),
    ),
  );
  return [...new Uint8Array(digest)]
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

async function completeDesired(
  input: Omit<DesiredCalendarEvent, "desiredHash">,
): Promise<DesiredCalendarEvent> {
  return { ...input, desiredHash: await desiredHash(input) };
}

type BusyInterval = { start: number; end: number };

function busyIntervalsForDay(events: CalendarEvent[], date: string): BusyInterval[] {
  const dayStart = berlinDateTime(date, PLANNING_DAY_START_HOUR).getTime();
  const dayEnd = berlinDateTime(date, PLANNING_DAY_END_HOUR).getTime();
  return events
    .filter((event) => !event.allDay)
    .map((event) => ({
      start: new Date(event.startAt).getTime() - PLANNING_BUFFER_MINUTES * 60_000,
      end: new Date(event.endAt).getTime() + PLANNING_BUFFER_MINUTES * 60_000,
    }))
    .filter(
      (interval) =>
        Number.isFinite(interval.start) &&
        Number.isFinite(interval.end) &&
        interval.start < dayEnd &&
        interval.end > dayStart,
    )
    .sort((left, right) => left.start - right.start);
}

function nextQuarterHour(value: number): number {
  const quarter = 15 * 60_000;
  return Math.ceil(value / quarter) * quarter;
}

function findFocusSlot({
  date,
  durationMinutes,
  events,
  now,
}: {
  date: string;
  durationMinutes: number;
  events: CalendarEvent[];
  now: number;
}): { startAt: string; endAt: string } | null {
  const dayStart = berlinDateTime(date, PLANNING_DAY_START_HOUR).getTime();
  const dayEnd = berlinDateTime(date, PLANNING_DAY_END_HOUR).getTime();
  let cursor = nextQuarterHour(
    date === planningDateKey(new Date(now))
      ? Math.max(dayStart, now + PLANNING_BUFFER_MINUTES * 60_000)
      : dayStart,
  );
  const duration = durationMinutes * 60_000;
  for (const interval of busyIntervalsForDay(events, date)) {
    if (interval.end <= cursor) continue;
    if (interval.start - cursor >= duration) {
      return {
        startAt: new Date(cursor).toISOString(),
        endAt: new Date(cursor + duration).toISOString(),
      };
    }
    cursor = nextQuarterHour(Math.max(cursor, interval.end));
  }
  return cursor + duration <= dayEnd
    ? {
        startAt: new Date(cursor).toISOString(),
        endAt: new Date(cursor + duration).toISOString(),
      }
    : null;
}

function managedCalendarMap(calendars: ManagedCalendar[]) {
  return new Map(
    calendars
      .filter(
        (calendar): calendar is ManagedCalendar & { calendarId: string } =>
          calendar.status === "ready" && Boolean(calendar.calendarId),
      )
      .map((calendar) => [calendar.key, calendar]),
  );
}

async function desiredCalendarEvents(
  snapshot: PlanningSnapshot,
): Promise<DesiredCalendarEvent[]> {
  const result: DesiredCalendarEvent[] = [];
  const managed = managedCalendarMap(snapshot.managedCalendars);
  const add = async (
    input: Omit<DesiredCalendarEvent, "desiredHash" | "calendarId">,
  ) => {
    const calendar = managed.get(input.managedCalendarKey);
    if (!calendar?.calendarId) return;
    result.push(await completeDesired({ ...input, calendarId: calendar.calendarId }));
  };

  for (const cost of snapshot.state.costs) {
    if (cost.status === "paid" || cost.active === false) continue;
    const dueDate = dateOnly(cost.dueAt);
    if (!dueDate) continue;
    const start = berlinDateTime(dueDate, 9);
    await add({
      title: `Zahlung erinnern: ${cost.title}`,
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + 15 * 60_000).toISOString(),
      kind: "payment",
      note: "Private Zahlungserinnerung aus Gerris Kompass",
      reminderMinutes: 1_440,
      timeZone: "Europe/Berlin",
      sourceType: "cost",
      sourceId: cost.id,
      sourceOccurrence: "main",
      managedCalendarKey: "private",
    });
  }

  for (const document of snapshot.state.documents) {
    if (!hasExplicitTime(document.reviewAt)) continue;
    const start = new Date(document.reviewAt);
    await add({
      title: `Unterlage prüfen: ${document.name}`,
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + DEFAULT_FOCUS_MINUTES * 60_000).toISOString(),
      kind: "focus",
      note: "Vertrauliche Dokumentprüfung aus Gerris Kompass",
      reminderMinutes: 60,
      timeZone: "Europe/Berlin",
      sourceType: "document",
      sourceId: document.id,
      sourceOccurrence: "main",
      managedCalendarKey: "private",
    });
  }

  for (const application of snapshot.state.applications) {
    if (["rejected", "withdrawn", "closed"].includes(application.status)) continue;
    if (!application.nextStep.trim() || !hasExplicitTime(application.nextStepAt)) {
      continue;
    }
    const start = new Date(application.nextStepAt);
    await add({
      title: `${application.company}: ${application.nextStep}`,
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + DEFAULT_FOCUS_MINUTES * 60_000).toISOString(),
      kind: "focus",
      note: `Bewerbung · ${application.jobTitle}`,
      reminderMinutes: 60,
      timeZone: "Europe/Berlin",
      sourceType: "application",
      sourceId: application.id,
      sourceOccurrence: "main",
      managedCalendarKey: "applications",
    });
  }

  for (const topic of snapshot.openTopics) {
    if (
      topic.status !== "open" ||
      topic.group !== "scheduled" ||
      !topic.calendarTarget ||
      !hasExplicitTime(topic.dueAt)
    ) {
      continue;
    }
    const start = new Date(topic.dueAt);
    await add({
      title: `Nächster Schritt: ${topic.title}`,
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + DEFAULT_FOCUS_MINUTES * 60_000).toISOString(),
      kind: "focus",
      note: topic.nextStep || topic.detail || "Bestätigte Entscheidung aus dem Tagebuch",
      reminderMinutes: 15,
      timeZone: "Europe/Berlin",
      sourceType: "open-topic",
      sourceId: topic.id,
      sourceOccurrence: "main",
      managedCalendarKey:
        topic.calendarTarget === "private" ? "private" : "focus",
    });
  }

  const scheduledEvents: CalendarEvent[] = [...snapshot.events];
  for (const desired of result) {
    scheduledEvents.push({
      id: `desired-${desired.sourceType}-${desired.sourceId}-${desired.sourceOccurrence}`,
      title: desired.title,
      startAt: desired.startAt,
      endAt: desired.endAt,
      source: "kompass",
      kind: desired.kind || "appointment",
      private: desired.managedCalendarKey === "private",
      managed: true,
      managedCalendarKey: desired.managedCalendarKey,
      sourceType: desired.sourceType,
      sourceId: desired.sourceId,
      sourceOccurrence: desired.sourceOccurrence,
    });
  }
  const today = planningDateKey(new Date());
  const focusByDay = new Map<string, number>();
  for (const event of snapshot.events) {
    if (event.kind !== "focus" || !event.managed) continue;
    const date = planningDateKey(event.startAt);
    const minutes = Math.max(
      0,
      Math.round(
        (new Date(event.endAt).getTime() - new Date(event.startAt).getTime()) /
          60_000,
      ),
    );
    focusByDay.set(date, (focusByDay.get(date) || 0) + minutes);
  }
  const tasks = snapshot.state.tasks
    .filter(
      (task) =>
        !task.completed &&
        !task.assigned &&
        !task.legacyId?.startsWith("planning-gap:") &&
        Boolean(dateOnly(task.dueAt)),
    )
    .sort((left, right) => {
      if (left.quadrant !== right.quadrant) return left.quadrant === "do" ? -1 : 1;
      return (left.dueAt || "").localeCompare(right.dueAt || "");
    });
  for (const task of tasks) {
    const route = managedCalendarRoute({
      sourceType: "task",
      confidential: task.confidential,
    });
    if (!managed.has(route)) continue;
    const linked = snapshot.events.filter(
      (event) =>
        event.sourceType === "task" &&
        event.sourceId === task.id &&
        event.kind === "focus",
    );
    const alreadyPlanned = linked.reduce(
      (minutes, event) =>
        minutes +
        Math.max(
          0,
          Math.round(
            (new Date(event.endAt).getTime() - new Date(event.startAt).getTime()) /
              60_000,
          ),
        ),
      0,
    );
    for (const existing of linked) {
      await add({
        title: `Fokus: ${task.title}`,
        startAt: existing.startAt,
        endAt: existing.endAt,
        kind: "focus",
        note: "Automatisch verknüpfter Fokusblock aus Gerris Kompass",
        reminderMinutes: 15,
        timeZone: "Europe/Berlin",
        sourceType: "task",
        sourceId: task.id,
        sourceOccurrence: existing.sourceOccurrence || `existing-${existing.googleEventId || existing.id}`,
        managedCalendarKey: route,
      });
    }
    let remaining = Math.max(0, (task.estimateMinutes || DEFAULT_FOCUS_MINUTES) - alreadyPlanned);
    let occurrence = 0;
    const dueDate = dateOnly(task.dueAt) || addPlanningDays(today, PLANNING_DETAIL_DAYS - 1);
    const horizonDay = addPlanningDays(today, PLANNING_DETAIL_DAYS - 1);
    const finalDay =
      dueDate < today ? today : dueDate < horizonDay ? dueDate : horizonDay;
    while (remaining > 0 && occurrence < 24) {
      const duration = Math.min(DEFAULT_FOCUS_MINUTES, remaining);
      let slot: { startAt: string; endAt: string } | null = null;
      for (let offset = 0; offset < PLANNING_DETAIL_DAYS; offset += 1) {
        const date = addPlanningDays(today, offset);
        if (!date || date > finalDay) break;
        if ((focusByDay.get(date) || 0) + duration > MAX_AUTO_FOCUS_MINUTES_PER_DAY) {
          continue;
        }
        slot = findFocusSlot({
          date,
          durationMinutes: duration,
          events: scheduledEvents,
          now: Date.now(),
        });
        if (slot) {
          focusByDay.set(date, (focusByDay.get(date) || 0) + duration);
          break;
        }
      }
      if (!slot) break;
      occurrence += 1;
      const desired = await completeDesired({
        title: `Fokus: ${task.title}`,
        startAt: slot.startAt,
        endAt: slot.endAt,
        kind: "focus",
        note: "Automatisch verknüpfter Fokusblock aus Gerris Kompass",
        reminderMinutes: 15,
        timeZone: "Europe/Berlin",
        sourceType: "task",
        sourceId: task.id,
        sourceOccurrence: `focus-${occurrence}`,
        managedCalendarKey: route,
        calendarId: managed.get(route)?.calendarId || "",
      });
      result.push(desired);
      scheduledEvents.push({
        id: `desired-task-${task.id}-${occurrence}`,
        title: desired.title,
        startAt: desired.startAt,
        endAt: desired.endAt,
        source: "kompass",
        kind: "focus",
        private: route === "private",
        managed: true,
        managedCalendarKey: route,
        sourceType: "task",
        sourceId: task.id,
        sourceOccurrence: desired.sourceOccurrence,
      });
      remaining -= duration;
    }
  }
  return result;
}

function sourceKey(
  sourceType: PlanningSourceType,
  sourceId: string,
  sourceOccurrence: string,
): string {
  return `${sourceType}\u0000${sourceId}\u0000${sourceOccurrence}`;
}

function linkSourceKey(link: CalendarLinkRow): string {
  return sourceKey(link.sourceType as PlanningSourceType, link.sourceId, link.sourceOccurrence);
}

function eventConflictGap(
  link: CalendarLinkRow,
  kind: "calendar_event_changed" | "calendar_event_deleted",
  detail: string,
): PlanningGap {
  return {
    id: stablePlanningGapId(
      kind,
      link.sourceType as PlanningSourceType,
      link.sourceId,
      link.sourceOccurrence,
    ),
    kind,
    severity: "critical",
    status: "open",
    title:
      kind === "calendar_event_deleted"
        ? "Verknüpfter Kalendertermin wurde gelöscht"
        : "Verknüpfter Kalendertermin wurde manuell verändert",
    detail,
    sourceType: link.sourceType as PlanningSourceType,
    sourceId: link.sourceId,
    date: dateOnly(link.observedStartAt),
    dueAt: link.observedStartAt,
  };
}

async function saveCalendarLink(
  ownerEmail: string,
  desired: DesiredCalendarEvent,
  event: CalendarEvent,
): Promise<void> {
  if (!event.googleEventId) {
    throw new GoogleApiError("Google hat keine Termin-ID geliefert.", 502);
  }
  const now = new Date().toISOString();
  await getDb()
    .insert(calendarLinks)
    .values({
      ownerEmail,
      sourceType: desired.sourceType,
      sourceId: desired.sourceId,
      sourceOccurrence: desired.sourceOccurrence,
      calendarId: desired.calendarId,
      googleEventId: event.googleEventId,
      etag: event.etag || null,
      desiredHash: desired.desiredHash,
      observedStartAt: event.startAt,
      observedEndAt: event.endAt,
      eventKind: desired.kind || "appointment",
      syncStatus: "synced",
      lastSyncedAt: now,
      error: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        calendarLinks.ownerEmail,
        calendarLinks.sourceType,
        calendarLinks.sourceId,
        calendarLinks.sourceOccurrence,
      ],
      set: {
        calendarId: desired.calendarId,
        googleEventId: event.googleEventId,
        etag: event.etag || null,
        desiredHash: desired.desiredHash,
        observedStartAt: event.startAt,
        observedEndAt: event.endAt,
        eventKind: desired.kind || "appointment",
        syncStatus: "synced",
        lastSyncedAt: now,
        error: null,
        updatedAt: now,
      },
    });
}

async function enqueueOutbox(
  ownerEmail: string,
  operation: "calendar_create" | "calendar_patch" | "calendar_delete",
  sourceType: PlanningSourceType,
  sourceId: string,
  sourceOccurrence: string,
  payload: unknown,
  version: string,
): Promise<void> {
  const now = new Date().toISOString();
  const dedupeKey = [operation, sourceType, sourceId, sourceOccurrence, version].join(":");
  await getDb()
    .insert(syncOutboxItems)
    .values({
      ownerEmail,
      itemId: crypto.randomUUID(),
      dedupeKey,
      operation,
      sourceType,
      sourceId,
      sourceOccurrence,
      payloadJson: JSON.stringify(payload),
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: now,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
}

async function outboxSuccess(ownerEmail: string, itemId: string) {
  await getDb()
    .update(syncOutboxItems)
    .set({
      status: "done",
      lastError: null,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(syncOutboxItems.ownerEmail, ownerEmail),
        eq(syncOutboxItems.itemId, itemId),
      ),
    );
}

async function outboxFailure(ownerEmail: string, item: OutboxRow, error: unknown) {
  const attemptCount = item.attemptCount + 1;
  const retryable =
    error instanceof GoogleApiError ? error.retryable : attemptCount < 3;
  const retry = retryable && attemptCount < MAX_OUTBOX_ATTEMPTS;
  const nextAttemptAt = new Date(
    Date.now() + Math.min(2 ** attemptCount * 30_000, 6 * 60 * 60_000),
  ).toISOString();
  const storedAttemptCount = retry ? attemptCount : MAX_OUTBOX_ATTEMPTS;
  await getDb()
    .update(syncOutboxItems)
    .set({
      status: "failed",
      attemptCount: storedAttemptCount,
      nextAttemptAt,
      lastError: errorMessage(error),
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(syncOutboxItems.ownerEmail, ownerEmail),
        eq(syncOutboxItems.itemId, item.itemId),
      ),
    );
  return retry;
}

async function processOutbox(
  ownerEmail: string,
  connection: GoogleConnection,
): Promise<{ processed: number; retries: number; conflicts: PlanningGap[] }> {
  const now = new Date().toISOString();
  const staleProcessing = new Date(Date.now() - 2 * 60_000).toISOString();
  const rows = await getDb()
    .select()
    .from(syncOutboxItems)
    .where(
      and(
        eq(syncOutboxItems.ownerEmail, ownerEmail),
        lt(syncOutboxItems.attemptCount, MAX_OUTBOX_ATTEMPTS),
        or(
          and(
            inArray(syncOutboxItems.status, ["pending", "failed"]),
            lte(syncOutboxItems.nextAttemptAt, now),
          ),
          and(
            eq(syncOutboxItems.status, "processing"),
            lte(syncOutboxItems.updatedAt, staleProcessing),
          ),
        ),
      ),
    )
    .orderBy(asc(syncOutboxItems.createdAt))
    .limit(MAX_OUTBOX_BATCH);
  let processed = 0;
  let retries = 0;
  const conflicts: PlanningGap[] = [];
  for (const item of rows) {
    const claimed = await getDb()
      .update(syncOutboxItems)
      .set({ status: "processing", updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(syncOutboxItems.ownerEmail, ownerEmail),
          eq(syncOutboxItems.itemId, item.itemId),
          eq(syncOutboxItems.status, item.status),
          eq(syncOutboxItems.updatedAt, item.updatedAt),
        ),
      )
      .returning({ itemId: syncOutboxItems.itemId });
    if (!claimed[0]) continue;
    try {
      if (item.operation === "calendar_create") {
        const desired = JSON.parse(item.payloadJson) as DesiredCalendarEvent;
        const existing = await findManagedCalendarEvents(
          connection,
          desired.calendarId,
          desired.sourceType,
          desired.sourceId,
          desired.sourceOccurrence,
        );
        if (existing.length > 1) {
          throw new GoogleApiError(
            "Mehrere verknüpfte Kalendertermine wurden gefunden.",
            409,
            false,
          );
        }
        const event =
          existing[0] || (await createCalendarEvent(connection, desired));
        await saveCalendarLink(ownerEmail, desired, event);
      } else if (item.operation === "calendar_patch") {
        const payload = JSON.parse(item.payloadJson) as {
          desired: DesiredCalendarEvent;
          eventId: string;
          etag: string | null;
        };
        const event = await updateCalendarEvent(
          connection,
          payload.eventId,
          { ...payload.desired, calendarId: payload.desired.calendarId },
          payload.etag,
        );
        await saveCalendarLink(ownerEmail, payload.desired, event);
      } else if (item.operation === "calendar_delete") {
        const link = JSON.parse(item.payloadJson) as CalendarLinkRow;
        try {
          await deleteCalendarEvent(
            connection,
            link.calendarId,
            link.googleEventId,
            link.etag,
          );
        } catch (error) {
          if (!(error instanceof GoogleApiError) || error.status !== 404) throw error;
        }
        await getDb()
          .delete(calendarLinks)
          .where(
            and(
              eq(calendarLinks.ownerEmail, ownerEmail),
              eq(calendarLinks.sourceType, link.sourceType),
              eq(calendarLinks.sourceId, link.sourceId),
              eq(calendarLinks.sourceOccurrence, link.sourceOccurrence),
            ),
          );
      }
      await outboxSuccess(ownerEmail, item.itemId);
      processed += 1;
    } catch (error) {
      if (error instanceof GoogleApiError && [404, 409, 412].includes(error.status)) {
        const link = JSON.parse(item.payloadJson) as Partial<CalendarLinkRow> & {
          desired?: DesiredCalendarEvent;
        };
        const sourceType = (link.sourceType ||
          link.desired?.sourceType ||
          item.sourceType) as PlanningSourceType;
        const sourceId = link.sourceId || link.desired?.sourceId || item.sourceId;
        const occurrence =
          link.sourceOccurrence ||
          link.desired?.sourceOccurrence ||
          item.sourceOccurrence;
        conflicts.push({
          id: stablePlanningGapId(
            error.status === 404
              ? "calendar_event_deleted"
              : "calendar_event_changed",
            sourceType,
            sourceId,
            occurrence,
          ),
          kind:
            error.status === 404
              ? "calendar_event_deleted"
              : "calendar_event_changed",
          severity: "critical",
          status: "open",
          title:
            error.status === 404
              ? "Verknüpfter Kalendertermin wurde gelöscht"
              : "Kalenderänderung braucht eine Entscheidung",
          detail:
            "Der Kompass überschreibt oder rekonstruiert diesen Termin nicht automatisch.",
          sourceType,
          sourceId,
          date: null,
          dueAt: null,
        });
      }
      if (await outboxFailure(ownerEmail, item, error)) retries += 1;
    }
  }
  return { processed, retries, conflicts };
}

async function reconcileGapTasks(
  ownerEmail: string,
  connection: GoogleConnection,
): Promise<number> {
  await provisionGerrisTaskList(connection);
  const rows = await getDb()
    .select()
    .from(planningGaps)
    .where(eq(planningGaps.ownerEmail, ownerEmail));
  let changed = 0;
  for (const row of rows) {
    if (row.status === "resolved") {
      if (!row.googleTaskId) continue;
      try {
        const task = await getGerrisTask(connection, row.googleTaskId);
        if (!task.completed) {
          await updateGerrisTask(
            connection,
            task.id,
            { completed: true, progress: 100 },
            task.etag,
          );
          changed += 1;
        }
      } catch (error) {
        if (!(error instanceof GoogleApiError) || error.status !== 404) throw error;
      }
      continue;
    }
    const gapItem: PlanningGap = {
      id: row.gapId,
      kind: row.kind as PlanningGap["kind"],
      severity: row.severity as PlanningGap["severity"],
      status: row.status as PlanningGap["status"],
      title: row.title,
      detail: row.detail,
      sourceType: row.sourceType as PlanningSourceType,
      sourceId: row.sourceId,
      date: row.gapDate,
      dueAt: row.snoozedUntil || row.dueAt,
    };
    const taskInput = gapTaskInput(gapItem);
    const result = await createGerrisTask(connection, taskInput);
    const task = result.task;
    const needsUpdate =
      task.completed ||
      task.title !== taskInput.title ||
      task.notes !== taskInput.notes ||
      task.quadrant !== taskInput.quadrant ||
      task.dueAt !== taskInput.dueAt;
    if (needsUpdate) {
      await updateGerrisTask(
        connection,
        task.id,
        {
          title: taskInput.title,
          notes: taskInput.notes,
          dueAt: taskInput.dueAt,
          completed: false,
          progress: 0,
          quadrant: taskInput.quadrant,
          estimateMinutes: taskInput.estimateMinutes,
          confidential: true,
        },
        task.etag,
      );
      changed += 1;
    } else if (result.created) {
      changed += 1;
    }
    await saveGapTaskId(ownerEmail, row.gapId, task.id);
  }
  return changed;
}

async function createDiff(
  ownerEmail: string,
  connection: GoogleConnection,
  desired: DesiredCalendarEvent[],
  apply: boolean,
): Promise<{
  creates: number;
  patches: number;
  deletes: number;
  conflicts: PlanningGap[];
}> {
  const links = await getDb()
    .select()
    .from(calendarLinks)
    .where(eq(calendarLinks.ownerEmail, ownerEmail));
  const linkBySource = new Map(links.map((link) => [linkSourceKey(link), link]));
  const desiredKeys = new Set(desired.map((item) => sourceKey(item.sourceType, item.sourceId, item.sourceOccurrence)));
  let creates = 0;
  let patches = 0;
  let deletes = 0;
  const conflicts: PlanningGap[] = [];

  for (const item of desired) {
    const key = sourceKey(item.sourceType, item.sourceId, item.sourceOccurrence);
    const link = linkBySource.get(key);
    if (!link) {
      creates += 1;
      if (apply) {
        await enqueueOutbox(
          ownerEmail,
          "calendar_create",
          item.sourceType,
          item.sourceId,
          item.sourceOccurrence,
          item,
          item.desiredHash,
        );
      }
      continue;
    }
    if (link.desiredHash === item.desiredHash && link.syncStatus === "synced") {
      continue;
    }
    try {
      const remote = await getCalendarEvent(
        connection,
        link.calendarId,
        link.googleEventId,
      );
      if (remote.etag && link.etag && remote.etag !== link.etag) {
        if (item.kind === "focus") {
          await saveCalendarLink(
            ownerEmail,
            { ...item, startAt: remote.startAt, endAt: remote.endAt },
            remote,
          );
        } else {
          conflicts.push(
            eventConflictGap(
              link,
              "calendar_event_changed",
              "Ein harter Termin wurde außerhalb von Gerris Kompass verändert. Bitte die Soll-/Ist-Abweichung entscheiden.",
            ),
          );
        }
        continue;
      }
    } catch (error) {
      if (error instanceof GoogleApiError && error.status === 404) {
        conflicts.push(
          eventConflictGap(
            link,
            "calendar_event_deleted",
            "Der verknüpfte Termin fehlt bei Google und wird nicht blind wiederhergestellt.",
          ),
        );
        continue;
      }
      throw error;
    }
    patches += 1;
    if (apply) {
      await enqueueOutbox(
        ownerEmail,
        "calendar_patch",
        item.sourceType,
        item.sourceId,
        item.sourceOccurrence,
        { desired: item, eventId: link.googleEventId, etag: link.etag },
        item.desiredHash,
      );
    }
  }

  for (const link of links) {
    if (desiredKeys.has(linkSourceKey(link))) continue;
    if (!link.observedStartAt || new Date(link.observedStartAt).getTime() <= Date.now()) {
      continue;
    }
    try {
      const remote = await getCalendarEvent(
        connection,
        link.calendarId,
        link.googleEventId,
      );
      if (remote.etag && link.etag && remote.etag !== link.etag) {
        conflicts.push(
          eventConflictGap(
            link,
            "calendar_event_changed",
            "Die Quelle ist erledigt oder entfernt, der künftige Termin wurde aber manuell verändert. Bitte die Löschung entscheiden.",
          ),
        );
        continue;
      }
    } catch (error) {
      if (error instanceof GoogleApiError && error.status === 404) {
        if (apply) {
          await getDb()
            .delete(calendarLinks)
            .where(
              and(
                eq(calendarLinks.ownerEmail, ownerEmail),
                eq(calendarLinks.sourceType, link.sourceType),
                eq(calendarLinks.sourceId, link.sourceId),
                eq(calendarLinks.sourceOccurrence, link.sourceOccurrence),
              ),
            );
        }
        continue;
      }
      throw error;
    }
    deletes += 1;
    if (apply) {
      await enqueueOutbox(
        ownerEmail,
        "calendar_delete",
        link.sourceType as PlanningSourceType,
        link.sourceId,
        link.sourceOccurrence,
        link,
        link.googleEventId,
      );
    }
  }
  return { creates, patches, deletes, conflicts };
}

export async function reconcilePlanningOwner(
  ownerEmail: string,
  reason: string,
  options: { forceDryRun?: boolean } = {},
): Promise<{ report: PlanningHealthReport; run: SyncRun }> {
  const snapshot = await loadPlanningSnapshot(ownerEmail);
  const mode: SyncRun["mode"] =
    options.forceDryRun || snapshot.automationMode !== "safe" ? "dry-run" : "safe";
  let run = await startSyncRun(ownerEmail, mode, reason);
  try {
    if (!snapshot.calendarConnection) {
      const report = reportFromSnapshot(snapshot);
      await persistPlanningGaps(ownerEmail, report.gaps);
      run = await finishSyncRun(ownerEmail, {
        ...run,
        status: "failed",
        conflictCount: report.criticalCount,
        summary: "Kalenderverbindung oder Berechtigungen fehlen; es wurde nichts verändert.",
      });
      return { report: { ...report, lastSyncRun: run }, run };
    }

    if (mode === "safe") {
      snapshot.managedCalendars = await provisionManagedCalendars(
        snapshot.calendarConnection,
        snapshot.managedCalendars,
      );
    }
    await saveManagedCalendarState(ownerEmail, snapshot.managedCalendars);

    const desired = await desiredCalendarEvents(snapshot);
    const diff = await createDiff(
      ownerEmail,
      snapshot.calendarConnection,
      desired,
      mode === "safe",
    );
    let outboxResult = { processed: 0, retries: 0, conflicts: [] as PlanningGap[] };
    if (mode === "safe") {
      outboxResult = await processOutbox(ownerEmail, snapshot.calendarConnection);
    }
    const report = reportFromSnapshot(snapshot);
    const allGaps = [...report.gaps, ...diff.conflicts, ...outboxResult.conflicts];
    const deduplicatedGaps = [
      ...new Map(allGaps.map((item) => [item.id, item])).values(),
    ];
    await persistPlanningGaps(ownerEmail, deduplicatedGaps);
    let taskChanges = 0;
    if (mode === "safe" && snapshot.taskConnection) {
      taskChanges = await reconcileGapTasks(ownerEmail, snapshot.taskConnection);
    }
    const reportConflicts = report.gaps.filter((item) =>
      [
        "managed_calendar_duplicate",
        "private_calendar_unverified",
        "calendar_conflict",
        "calendar_event_changed",
        "calendar_event_deleted",
      ].includes(item.kind),
    ).length;
    const conflictCount =
      diff.conflicts.length + outboxResult.conflicts.length + reportConflicts;
    const partial = conflictCount > 0 || (mode === "safe" && !snapshot.taskConnection);
    run = await finishSyncRun(ownerEmail, {
      ...run,
      status: partial ? "partial" : "succeeded",
      desiredCount: desired.length,
      createCount: diff.creates,
      patchCount: diff.patches,
      deleteCount: diff.deletes,
      conflictCount,
      retryCount: outboxResult.retries,
      summary:
        mode === "dry-run"
          ? `Dry-run: ${diff.creates} neu, ${diff.patches} aktualisieren, ${diff.deletes} bereinigen, ${conflictCount} Konflikte.`
          : `Sicherer Abgleich: ${outboxResult.processed} Kalenderänderungen und ${taskChanges} Gap-Aufgaben verarbeitet; ${outboxResult.retries} Retries offen.`,
    });
    const finalSnapshot =
      mode === "safe" ? await loadPlanningSnapshot(ownerEmail) : snapshot;
    finalSnapshot.storedGaps = await unresolvedPlanningGaps(ownerEmail);
    finalSnapshot.lastSyncRun = run;
    const finalReport = reportFromSnapshot(finalSnapshot);
    return { report: finalReport, run };
  } catch (error) {
    run = await finishSyncRun(ownerEmail, {
      ...run,
      status: "failed",
      summary: errorMessage(error),
    });
    throw error;
  }
}
