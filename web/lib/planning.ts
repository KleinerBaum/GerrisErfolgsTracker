import type {
  AppState,
  CalendarEvent,
  DayIntent,
  ManagedCalendar,
  ManagedCalendarKey,
  OpenTopic,
  PlanningDaySummary,
  PlanningGap,
  PlanningGapKind,
  PlanningGapSeverity,
  PlanningHealthReport,
  PlanningSourceType,
  SyncRun,
  Task,
} from "./types";

export const PLANNING_TIME_ZONE = "Europe/Berlin";
export const PLANNING_DETAIL_DAYS = 7;
export const PLANNING_HORIZON_DAYS = 45;
export const PLANNING_FRESHNESS_MINUTES = 15;
export const PLANNING_BUFFER_MINUTES = 15;
export const DEFAULT_FOCUS_MINUTES = 50;
export const MAX_AUTO_FOCUS_MINUTES_PER_DAY = 6 * 60;
export const PLANNING_DAY_START_HOUR = 7;
export const PLANNING_DAY_END_HOUR = 20;

export type PlanningCalendarSnapshot = {
  connected: boolean;
  loaded: boolean;
  selectedCalendarIds: string[];
  fetchedAt: string | null;
  error: string | null;
};

export type BuildPlanningHealthInput = {
  state: AppState;
  events: CalendarEvent[];
  calendar: PlanningCalendarSnapshot;
  managedCalendars?: ManagedCalendar[];
  dayIntents?: DayIntent[];
  openTopics?: OpenTopic[];
  storedGaps?: PlanningGap[];
  automationMode?: "dry-run" | "safe";
  lastSyncRun?: SyncRun | null;
  now?: string | Date;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: PLANNING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DAY_IN_MS = 86_400_000;
const ACTIVE_APPLICATION_STATUSES = new Set([
  "research",
  "planned",
  "draft",
  "submitted",
  "interview",
  "offer",
]);

export function planningDateKey(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return DATE_FORMATTER.format(date);
}

function parseDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12),
  );
  return planningDateKey(date) === value ? date : null;
}

export function addPlanningDays(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey);
  if (!date) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return planningDateKey(date);
}

function dateDistance(left: string, right: string): number {
  const leftDate = parseDateKey(left);
  const rightDate = parseDateKey(right);
  if (!leftDate || !rightDate) return Number.POSITIVE_INFINITY;
  return Math.round((leftDate.getTime() - rightDate.getTime()) / DAY_IN_MS);
}

function timestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function sourceDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const dateOnly = /^(\d{4}-\d{2}-\d{2})$/.exec(value);
  if (dateOnly) return parseDateKey(dateOnly[1]) ? dateOnly[1] : null;
  const key = planningDateKey(value);
  return key || null;
}

function compactIdPart(value: string): string {
  return encodeURIComponent(value.trim().toLowerCase()).slice(0, 180);
}

export function stablePlanningGapId(
  kind: PlanningGapKind,
  sourceType: PlanningSourceType,
  sourceId: string,
  occurrence = "main",
): string {
  return ["planning-gap", kind, sourceType, sourceId, occurrence]
    .map(compactIdPart)
    .join(":");
}

function gap({
  kind,
  severity,
  title,
  detail,
  sourceType,
  sourceId,
  occurrence,
  date = null,
  dueAt = null,
}: {
  kind: PlanningGapKind;
  severity: PlanningGapSeverity;
  title: string;
  detail: string;
  sourceType: PlanningSourceType;
  sourceId: string;
  occurrence?: string;
  date?: string | null;
  dueAt?: string | null;
}): PlanningGap {
  return {
    id: stablePlanningGapId(kind, sourceType, sourceId, occurrence),
    kind,
    severity,
    status: "open",
    title,
    detail,
    sourceType,
    sourceId,
    date,
    dueAt,
  };
}

function severityForDate(date: string | null, today: string): PlanningGapSeverity {
  if (!date) return "important";
  return dateDistance(date, today) <= 1 ? "critical" : "important";
}

function eventDateKeys(event: CalendarEvent): string[] {
  const first = planningDateKey(event.startAt);
  const exclusiveEnd = new Date(event.endAt);
  if (Number.isNaN(exclusiveEnd.getTime()) || !first) return [];
  exclusiveEnd.setMilliseconds(exclusiveEnd.getMilliseconds() - 1);
  const last = planningDateKey(exclusiveEnd);
  if (!last) return [first];
  const distance = Math.min(Math.max(dateDistance(last, first), 0), 45);
  return Array.from({ length: distance + 1 }, (_, index) =>
    addPlanningDays(first, index),
  ).filter(Boolean);
}

export function isPlanBearingEvent(event: CalendarEvent): boolean {
  if (event.managedCalendarKey === "birthdays_holidays") return false;
  if (
    event.allDay &&
    event.sourceType === "calendar" &&
    /geburtstag|feiertag/i.test(event.title)
  ) {
    return false;
  }
  return true;
}

function linkedEvents(
  events: CalendarEvent[],
  sourceType: PlanningSourceType,
  sourceId: string,
): CalendarEvent[] {
  return events.filter(
    (event) => event.sourceType === sourceType && event.sourceId === sourceId,
  );
}

function focusMinutesForTask(events: CalendarEvent[], task: Task): number {
  const due = timestamp(task.dueAt);
  return linkedEvents(events, "task", task.id)
    .filter((event) => event.kind === "focus")
    .filter((event) => due === null || new Date(event.endAt).getTime() <= due)
    .reduce((minutes, event) => {
      const start = timestamp(event.startAt);
      const end = timestamp(event.endAt);
      return start === null || end === null || end <= start
        ? minutes
        : minutes + Math.round((end - start) / 60_000);
    }, 0);
}

function sourceGaps(
  input: BuildPlanningHealthInput,
  today: string,
  horizonEnd: string,
): PlanningGap[] {
  const gaps: PlanningGap[] = [];
  const { state, events } = input;

  for (const task of state.tasks) {
    if (
      task.completed ||
      task.assigned ||
      task.legacyId?.startsWith("planning-gap:")
    ) {
      continue;
    }
    const dueDate = sourceDate(task.dueAt);
    if (!dueDate) {
      gaps.push(
        gap({
          kind: "task_undated",
          severity: task.quadrant === "do" ? "critical" : "important",
          title: `Aufgabe ohne Termin: ${task.title}`,
          detail:
            "Ohne Datum kann der Kompass weder ausreichend Fokuszeit reservieren noch zuverlässig priorisieren.",
          sourceType: "task",
          sourceId: task.id,
        }),
      );
      continue;
    }
    if (dateDistance(dueDate, today) > PLANNING_HORIZON_DAYS) continue;
    const required = Math.max(task.estimateMinutes || DEFAULT_FOCUS_MINUTES, 1);
    const planned = focusMinutesForTask(events, task);
    if (planned < required) {
      gaps.push(
        gap({
          kind: "task_focus_missing",
          severity:
            task.quadrant === "do" || dateDistance(dueDate, today) <= 2
              ? "critical"
              : "important",
          title: `Fokuszeit fehlt: ${task.title}`,
          detail: `${planned} von ${required} Minuten sind vor der Fälligkeit verbindlich eingeplant.`,
          sourceType: "task",
          sourceId: task.id,
          date: dueDate,
          dueAt: task.dueAt,
        }),
      );
    }
  }

  for (const application of state.applications) {
    if (!ACTIVE_APPLICATION_STATUSES.has(application.status)) continue;
    const targetAt = application.nextStepAt || application.deadline;
    const targetDate = sourceDate(targetAt);
    const label = [application.company, application.jobTitle]
      .filter(Boolean)
      .join(" · ");
    if (!application.nextStep.trim() || !targetAt) {
      gaps.push(
        gap({
          kind: "application_next_step_missing",
          severity:
            targetDate && dateDistance(targetDate, today) <= 2
              ? "critical"
              : "important",
          title: `Bewerbung ohne klaren nächsten Schritt: ${label}`,
          detail:
            "Ein aktiver Bewerbungsvorgang braucht einen konkreten nächsten Schritt und einen Termin oder eine Frist.",
          sourceType: "application",
          sourceId: application.id,
          date: targetDate,
          dueAt: targetAt,
        }),
      );
      continue;
    }
    if (
      targetDate &&
      dateDistance(targetDate, today) <= PLANNING_HORIZON_DAYS &&
      linkedEvents(events, "application", application.id).length === 0
    ) {
      gaps.push(
        gap({
          kind: "application_schedule_missing",
          severity: severityForDate(targetDate, today),
          title: `Bewerbungsschritt nicht eingeplant: ${label}`,
          detail: `„${application.nextStep}“ hat noch keinen verknüpften Kalenderblock.`,
          sourceType: "application",
          sourceId: application.id,
          date: targetDate,
          dueAt: targetAt,
        }),
      );
    }
  }

  for (const cost of state.costs) {
    if (cost.status === "paid" || cost.active === false) continue;
    const dueDate = sourceDate(cost.dueAt);
    if (
      !dueDate ||
      dateDistance(dueDate, today) > PLANNING_HORIZON_DAYS ||
      dueDate > horizonEnd
    ) {
      continue;
    }
    if (linkedEvents(events, "cost", cost.id).length === 0) {
      gaps.push(
        gap({
          kind: "payment_reminder_missing",
          severity: severityForDate(dueDate, today),
          title: `Zahlung ohne Erinnerung: ${cost.title}`,
          detail:
            "Der offene Kostenposten hat noch keine verknüpfte private Kalendererinnerung.",
          sourceType: "cost",
          sourceId: cost.id,
          date: dueDate,
          dueAt: cost.dueAt,
        }),
      );
    }
  }

  for (const document of state.documents) {
    const reviewDate = sourceDate(document.reviewAt);
    if (
      !reviewDate ||
      dateDistance(reviewDate, today) > PLANNING_HORIZON_DAYS ||
      reviewDate > horizonEnd
    ) {
      continue;
    }
    if (linkedEvents(events, "document", document.id).length === 0) {
      gaps.push(
        gap({
          kind: "document_review_missing",
          severity: severityForDate(reviewDate, today),
          title: `Dokumentprüfung nicht eingeplant: ${document.name}`,
          detail:
            "Der Prüftermin ist bekannt, aber es gibt noch keinen verknüpften privaten Zeitblock.",
          sourceType: "document",
          sourceId: document.id,
          date: reviewDate,
          dueAt: document.reviewAt || null,
        }),
      );
    }
  }

  for (const topic of input.openTopics ?? []) {
    if (topic.status === "resolved") continue;
    if (
      topic.status === "snoozed" &&
      topic.snoozedUntil &&
      new Date(topic.snoozedUntil).getTime() > Date.now()
    ) {
      continue;
    }
    if (topic.group === "decision") {
      const topicDate = sourceDate(topic.dueAt);
      gaps.push(
        gap({
          kind: "decision_open",
          severity: severityForDate(topicDate, today),
          title: `Entscheidung nötig: ${topic.title}`,
          detail: topic.nextStep || topic.detail || "Eine Entscheidung ist noch offen.",
          sourceType: "open-topic",
          sourceId: topic.id,
          date: topicDate,
          dueAt: topic.dueAt,
        }),
      );
    } else if (
      topic.group === "scheduled" &&
      topic.dueAt &&
      linkedEvents(events, "open-topic", topic.id).length === 0
    ) {
      const topicDate = sourceDate(topic.dueAt);
      gaps.push(
        gap({
          kind: "open_topic_schedule_missing",
          severity: severityForDate(topicDate, today),
          title: `Bestätigtes Thema nicht eingeplant: ${topic.title}`,
          detail:
            "Die Entscheidung enthält Zielkalender und Zeitpunkt, aber noch keinen verknüpften Kalenderblock.",
          sourceType: "open-topic",
          sourceId: topic.id,
          date: topicDate,
          dueAt: topic.dueAt,
        }),
      );
    }
  }

  return gaps;
}

function managedCalendarGaps(
  calendars: ManagedCalendar[],
): PlanningGap[] {
  return calendars.flatMap((calendar): PlanningGap[] => {
    if (calendar.status === "ready") return [];
    if (calendar.status === "ambiguous") {
      return [
        gap({
          kind: "managed_calendar_duplicate",
          severity: "critical",
          title: `Kalenderzuordnung klären: ${calendar.name}`,
          detail: `${calendar.matchCount} gleichnamige eigene Kalender wurden gefunden. Der Kompass wählt keinen davon automatisch.`,
          sourceType: "calendar",
          sourceId: calendar.key,
        }),
      ];
    }
    if (calendar.status === "private_unverified") {
      return [
        gap({
          kind: "private_calendar_unverified",
          severity: "critical",
          title: "Privatkalender ist nicht sicher bestätigt",
          detail:
            "Sensible automatische Einträge bleiben blockiert, bis die ACL-Prüfung ausschließlich privaten Zugriff bestätigt.",
          sourceType: "calendar",
          sourceId: calendar.key,
        }),
      ];
    }
    return [
      gap({
        kind: "managed_calendar_missing",
        severity: calendar.key === "private" ? "critical" : "important",
        title: `Verwalteter Kalender fehlt: ${calendar.name}`,
        detail:
          calendar.error ||
          "Der Kalender wird im sicheren Abgleich eindeutig wiederverwendet oder einmalig angelegt.",
        sourceType: "calendar",
        sourceId: calendar.key,
      }),
    ];
  });
}

function calendarIntegrityGaps(
  events: CalendarEvent[],
  dayKeys: string[],
  today: string,
): PlanningGap[] {
  const gaps: PlanningGap[] = [];
  for (const day of dayKeys) {
    const timed = events
      .filter((event) => !event.allDay && eventDateKeys(event).includes(day))
      .map((event) => ({
        event,
        start: timestamp(event.startAt) ?? 0,
        end: timestamp(event.endAt) ?? 0,
      }))
      .filter((item) => item.end > item.start)
      .sort((left, right) => left.start - right.start);

    let focusMinutes = 0;
    for (const item of timed) {
      if (item.event.kind === "focus" && item.event.managed) {
        focusMinutes += Math.round((item.end - item.start) / 60_000);
      }
    }
    if (focusMinutes > MAX_AUTO_FOCUS_MINUTES_PER_DAY) {
      gaps.push(
        gap({
          kind: "calendar_overload",
          severity: severityForDate(day, today),
          title: `Automatische Fokuszeit überlastet den ${day}`,
          detail: `${focusMinutes} Minuten automatisch verwaltete Fokuszeit überschreiten das Tageslimit von 360 Minuten.`,
          sourceType: "calendar",
          sourceId: day,
          occurrence: "focus-limit",
          date: day,
        }),
      );
    }

    for (let index = 1; index < timed.length; index += 1) {
      const previous = timed[index - 1];
      const current = timed[index];
      const pair = [previous.event.id, current.event.id].sort().join("+");
      if (current.start < previous.end) {
        gaps.push(
          gap({
            kind: "calendar_conflict",
            severity: severityForDate(day, today),
            title: `Terminkollision am ${day}`,
            detail: `„${previous.event.title}“ und „${current.event.title}“ überschneiden sich.`,
            sourceType: "calendar",
            sourceId: day,
            occurrence: pair,
            date: day,
          }),
        );
        continue;
      }
      const bufferMinutes = Math.round((current.start - previous.end) / 60_000);
      if (bufferMinutes < PLANNING_BUFFER_MINUTES) {
        gaps.push(
          gap({
            kind: "calendar_buffer_missing",
            severity: severityForDate(day, today),
            title: `Übergangspuffer fehlt am ${day}`,
            detail: `Zwischen „${previous.event.title}“ und „${current.event.title}“ bleiben nur ${bufferMinutes} Minuten.`,
            sourceType: "calendar",
            sourceId: day,
            occurrence: pair,
            date: day,
          }),
        );
      }
    }
  }
  return gaps;
}

function withStoredStatus(
  generated: PlanningGap[],
  stored: PlanningGap[],
  now: Date,
): PlanningGap[] {
  const storedById = new Map(stored.map((item) => [item.id, item]));
  const merged: PlanningGap[] = generated.map((item): PlanningGap => {
    const previous = storedById.get(item.id);
    if (!previous) return item;
    const snoozeActive =
      previous.status === "snoozed" &&
      Boolean(previous.snoozedUntil) &&
      (timestamp(previous.snoozedUntil) ?? 0) > now.getTime();
    return {
      ...item,
      status: snoozeActive ? "snoozed" : "open",
      firstSeenAt: previous.firstSeenAt,
      lastSeenAt: previous.lastSeenAt,
      snoozedUntil: snoozeActive ? previous.snoozedUntil : null,
      resolutionNote: previous.resolutionNote,
      googleTaskId: previous.googleTaskId,
    };
  });
  const generatedIds = new Set(generated.map((item) => item.id));
  for (const previous of stored) {
    if (generatedIds.has(previous.id) || previous.status === "resolved") continue;
    const snoozeExpired =
      previous.status === "snoozed" &&
      (!previous.snoozedUntil ||
        (timestamp(previous.snoozedUntil) ?? 0) <= now.getTime());
    merged.push({
      ...previous,
      status: snoozeExpired ? "open" : previous.status,
      snoozedUntil: snoozeExpired ? null : previous.snoozedUntil,
    });
  }
  return merged;
}

function reportCopy(
  state: PlanningHealthReport["state"],
  criticalCount: number,
  importantCount: number,
): Pick<PlanningHealthReport, "title" | "message"> {
  if (state === "unknown") {
    return {
      title: "Planungsstatus unbekannt – sofort klären",
      message:
        "Ohne verlässlich geladene Kalenderdaten darf kein Tag als frei gelten. Verbindung und Auswahl haben Top-Priorität.",
    };
  }
  if (state === "stale") {
    return {
      title: "Kalenderstand veraltet – sofort aktualisieren",
      message:
        "Die Planung basiert nicht mehr auf frischen Daten. Bis zum erfolgreichen Abgleich sind Freiräume unbestätigt.",
    };
  }
  if (state === "conflicted") {
    return {
      title: "Planungskonflikt braucht eine Entscheidung",
      message: `${criticalCount} kritische und ${importantCount} wichtige Lücken verhindern gerade einen belastbaren Plan.`,
    };
  }
  if (state === "incomplete") {
    return {
      title: "Kalenderpflege unvollständig",
      message: `${criticalCount} kritische und ${importantCount} wichtige Lücken werden priorisiert und im sicheren Abgleich nachgeführt.`,
    };
  }
  if (state === "intentionally_free") {
    return {
      title: "Heute ist ausdrücklich frei",
      message:
        "Die Kalenderdaten sind frisch und vollständig; der freie Tag wurde bewusst bestätigt.",
    };
  }
  return {
    title: "Planung ist verlässlich gepflegt",
    message:
      "Kalenderdaten, Verpflichtungen und nächste Schritte sind frisch und vollständig miteinander verknüpft.",
  };
}

export function buildPlanningHealthReport(
  input: BuildPlanningHealthInput,
): PlanningHealthReport {
  const now =
    input.now instanceof Date
      ? new Date(input.now)
      : new Date(input.now || Date.now());
  const generatedAt = now.toISOString();
  const today = planningDateKey(now);
  const dayKeys = Array.from({ length: PLANNING_DETAIL_DAYS }, (_, index) =>
    addPlanningDays(today, index),
  );
  const horizonEnd = addPlanningDays(today, PLANNING_HORIZON_DAYS);
  const dayIntentByDate = new Map(
    (input.dayIntents ?? []).map((intent) => [intent.date, intent]),
  );
  const generatedGaps: PlanningGap[] = [];

  const fetchedAt = timestamp(input.calendar.fetchedAt);
  const isStale =
    fetchedAt !== null &&
    now.getTime() - fetchedAt > PLANNING_FRESHNESS_MINUTES * 60_000;
  const calendarUnknown =
    !input.calendar.connected ||
    !input.calendar.loaded ||
    Boolean(input.calendar.error) ||
    input.calendar.selectedCalendarIds.length === 0;

  if (!input.calendar.connected) {
    generatedGaps.push(
      gap({
        kind: "calendar_connection_unknown",
        severity: "critical",
        title: "Google-Kalender ist nicht verlässlich verbunden",
        detail:
          "Termine, Konflikte und freie Zeit können nicht vollständig geprüft werden.",
        sourceType: "calendar",
        sourceId: "connection",
      }),
    );
  } else if (input.calendar.error || !input.calendar.loaded) {
    generatedGaps.push(
      gap({
        kind: "calendar_load_failed",
        severity: "critical",
        title: "Kalenderabgleich ist fehlgeschlagen",
        detail:
          input.calendar.error ||
          "Die Kalenderdaten wurden nicht vollständig geladen.",
        sourceType: "calendar",
        sourceId: "load",
      }),
    );
  } else if (input.calendar.selectedCalendarIds.length === 0) {
    generatedGaps.push(
      gap({
        kind: "calendar_selection_empty",
        severity: "critical",
        title: "Kein Kalender ist für die Planung ausgewählt",
        detail:
          "Ohne ausgewählte Kalender ist der Status unbekannt und kein Tag darf als frei bewertet werden.",
        sourceType: "calendar",
        sourceId: "selection",
      }),
    );
  } else if (isStale) {
    generatedGaps.push(
      gap({
        kind: "calendar_stale",
        severity: "critical",
        title: "Kalenderdaten sind veraltet",
        detail: `Der letzte vollständige Abruf liegt länger als ${PLANNING_FRESHNESS_MINUTES} Minuten zurück.`,
        sourceType: "calendar",
        sourceId: "freshness",
      }),
    );
  }

  const days: PlanningDaySummary[] = dayKeys.map((date) => {
    const intent = dayIntentByDate.get(date)?.kind ?? null;
    const events = input.events.filter((event) => eventDateKeys(event).includes(date));
    const planEvents = events.filter(isPlanBearingEvent);
    const hardEventCount = planEvents.filter(
      (event) => event.kind !== "focus",
    ).length;
    const focusMinutes = planEvents
      .filter((event) => event.kind === "focus")
      .reduce((total, event) => {
        const start = timestamp(event.startAt);
        const end = timestamp(event.endAt);
        return start === null || end === null || end <= start
          ? total
          : total + Math.round((end - start) / 60_000);
      }, 0);
    const dayGap =
      !calendarUnknown && !isStale && !intent && planEvents.length === 0
        ? gap({
            kind: "calendar_day_empty",
            severity: severityForDate(date, today),
            title: `${date} ist ungeplant`,
            detail:
              "Der Tag enthält weder einen echten Planungsblock noch eine ausdrückliche Freigabe als bewusst frei, Urlaub oder Krankheit.",
            sourceType: "calendar",
            sourceId: date,
            date,
          })
        : null;
    if (dayGap) generatedGaps.push(dayGap);
    return {
      date,
      state:
        intent && planEvents.length === 0
          ? "intentionally_free"
          : planEvents.length > 0
            ? "planned"
            : "gap",
      intent,
      planBlockCount: planEvents.length,
      hardEventCount,
      focusMinutes,
      conflictCount: 0,
      gapIds: dayGap ? [dayGap.id] : [],
    };
  });

  if (!calendarUnknown && !isStale) {
    generatedGaps.push(
      ...sourceGaps(input, today, horizonEnd),
      ...calendarIntegrityGaps(input.events, dayKeys, today),
    );
  }
  generatedGaps.push(...managedCalendarGaps(input.managedCalendars ?? []));
  if (input.lastSyncRun?.status === "failed") {
    generatedGaps.push(
      gap({
        kind: "sync_failed",
        severity: "critical",
        title: "Letzter Planungsabgleich ist fehlgeschlagen",
        detail: input.lastSyncRun.summary || "Ausstehende Änderungen werden erneut versucht.",
        sourceType: "sync",
        sourceId: input.lastSyncRun.id,
      }),
    );
  }

  const deduplicated = [...new Map(generatedGaps.map((item) => [item.id, item])).values()];
  const gaps = withStoredStatus(deduplicated, input.storedGaps ?? [], now);
  const openGaps = gaps.filter((item) => item.status === "open");
  const criticalCount = openGaps.filter(
    (item) => item.severity === "critical",
  ).length;
  const importantCount = openGaps.filter(
    (item) => item.severity === "important",
  ).length;
  const conflictKinds = new Set<PlanningGapKind>([
    "calendar_conflict",
    "managed_calendar_duplicate",
    "calendar_event_changed",
    "calendar_event_deleted",
  ]);
  const todaySummary = days[0];
  let reportState: PlanningHealthReport["state"];
  if (calendarUnknown) reportState = "unknown";
  else if (isStale) reportState = "stale";
  else if (openGaps.some((item) => conflictKinds.has(item.kind))) {
    reportState = "conflicted";
  } else if (openGaps.length > 0) reportState = "incomplete";
  else if (todaySummary?.state === "intentionally_free") {
    reportState = "intentionally_free";
  } else reportState = "healthy";

  for (const day of days) {
    const dayGaps = openGaps.filter((item) => item.date === day.date);
    day.gapIds = [...new Set([...day.gapIds, ...dayGaps.map((item) => item.id)])];
    day.conflictCount = dayGaps.filter(
      (item) => item.kind === "calendar_conflict",
    ).length;
  }

  return {
    state: reportState,
    ...reportCopy(reportState, criticalCount, importantCount),
    generatedAt,
    calendarFetchedAt: input.calendar.fetchedAt,
    calendarConnected: input.calendar.connected,
    selectedCalendarIds: [...input.calendar.selectedCalendarIds],
    criticalCount,
    importantCount,
    gaps,
    days,
    managedCalendars: input.managedCalendars ?? [],
    dayIntents: input.dayIntents ?? [],
    openTopics: input.openTopics ?? [],
    automationMode: input.automationMode ?? "dry-run",
    lastSyncRun: input.lastSyncRun ?? null,
  };
}

export function gapTaskInput(gapItem: PlanningGap): {
  legacyId: string;
  title: string;
  notes: string;
  dueAt: string | null;
  quadrant: "do" | "plan";
  area: "alltag";
  estimateMinutes: number;
  confidential: true;
} {
  const dueAt = gapItem.dueAt
    ? /^\d{4}-\d{2}-\d{2}$/.test(gapItem.dueAt)
      ? `${gapItem.dueAt}T00:00:00.000Z`
      : new Date(gapItem.dueAt).toString() === "Invalid Date"
        ? null
        : new Date(gapItem.dueAt).toISOString()
    : null;
  return {
    legacyId: gapItem.id,
    title: `${gapItem.severity === "critical" ? "Dringend & wichtig" : "Wichtig"}: ${gapItem.title}`,
    notes: `${gapItem.detail}\n\nDiese Aufgabe wird automatisch mit der stabilen Gap-ID ${gapItem.id} gepflegt.`,
    dueAt,
    quadrant: gapItem.severity === "critical" ? "do" : "plan",
    area: "alltag",
    estimateMinutes: gapItem.severity === "critical" ? 15 : 30,
    confidential: true,
  };
}

export function managedCalendarRoute({
  sourceType,
  confidential,
}: {
  sourceType: PlanningSourceType;
  confidential: boolean;
}): ManagedCalendarKey {
  if (confidential) return "private";
  if (sourceType === "application") return "applications";
  return "focus";
}
