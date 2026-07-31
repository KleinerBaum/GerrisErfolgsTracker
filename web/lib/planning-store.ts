import { and, desc, eq, ne } from "drizzle-orm";

import { getDb } from "../db";
import {
  dayIntents,
  decisionRecords,
  managedCalendars,
  openTopics,
  planningGaps,
  planningSettings,
  syncRuns,
} from "../db/schema";
import type {
  CalendarTargetChoice,
  DayIntent,
  DayIntentKind,
  DecisionRecord,
  JournalAnalysisSuggestion,
  ManagedCalendar,
  OpenTopic,
  OpenTopicGroup,
  PlanningGap,
  PlanningGapKind,
  PlanningGapSeverity,
  PlanningGapStatus,
  PlanningSourceType,
  SyncRun,
} from "./types";

const DAY_INTENTS = new Set<DayIntentKind>([
  "intentionally_free",
  "vacation",
  "sick",
]);
const TOPIC_GROUPS = new Set<OpenTopicGroup>([
  "decision",
  "next_step",
  "waiting",
  "scheduled",
]);
const CALENDAR_TARGETS = new Set<CalendarTargetChoice>([
  "private",
  "specialist",
]);

function validDateKey(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Das Datum ist ungültig.");
  }
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("Das Datum ist ungültig.");
  }
  return value;
}

function boundedText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string") throw new Error(`${label} ist ungültig.`);
  const result = value.trim();
  if (result.length > maximum) {
    throw new Error(`${label} darf höchstens ${maximum} Zeichen enthalten.`);
  }
  return result;
}

function optionalIso(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error(`${label} ist ungültig.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} ist ungültig.`);
  return date.toISOString();
}

function managedCalendarFromRow(
  row: typeof managedCalendars.$inferSelect,
): ManagedCalendar {
  return {
    key: row.calendarKey as ManagedCalendar["key"],
    name: row.name,
    calendarId: row.calendarId,
    status: row.status as ManagedCalendar["status"],
    matchCount: row.matchCount,
    accessRole: row.accessRole as ManagedCalendar["accessRole"],
    privateAclVerified: row.privateAclVerified,
    lastCheckedAt: row.lastCheckedAt,
    error: row.error,
  };
}

function gapFromRow(row: typeof planningGaps.$inferSelect): PlanningGap {
  return {
    id: row.gapId,
    kind: row.kind as PlanningGapKind,
    severity: row.severity as PlanningGapSeverity,
    status: row.status as PlanningGapStatus,
    title: row.title,
    detail: row.detail,
    sourceType: row.sourceType as PlanningSourceType,
    sourceId: row.sourceId,
    date: row.gapDate,
    dueAt: row.dueAt,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    snoozedUntil: row.snoozedUntil,
    resolutionNote: row.resolutionNote,
    googleTaskId: row.googleTaskId,
  };
}

function intentFromRow(row: typeof dayIntents.$inferSelect): DayIntent {
  return {
    date: row.intentDate,
    kind: row.kind as DayIntentKind,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function topicFromRow(row: typeof openTopics.$inferSelect): OpenTopic {
  return {
    id: row.topicId,
    group: row.topicGroup as OpenTopicGroup,
    status: row.status as OpenTopic["status"],
    title: row.title,
    detail: row.detail,
    nextStep: row.nextStep,
    dueAt: row.dueAt,
    sourceType: row.sourceType as PlanningSourceType,
    sourceId: row.sourceId,
    evidence: row.evidence,
    confidence:
      row.confidencePermille === null
        ? null
        : Math.max(0, Math.min(row.confidencePermille / 1_000, 1)),
    requiresCalendarTarget: row.requiresCalendarTarget,
    calendarTarget: row.calendarTarget as CalendarTargetChoice | null,
    snoozedUntil: row.snoozedUntil,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    resolvedAt: row.resolvedAt,
  };
}

function syncRunFromRow(row: typeof syncRuns.$inferSelect): SyncRun {
  return {
    id: row.runId,
    mode: row.mode as SyncRun["mode"],
    reason: row.reason,
    status: row.status as SyncRun["status"],
    desiredCount: row.desiredCount,
    createCount: row.createCount,
    patchCount: row.patchCount,
    deleteCount: row.deleteCount,
    conflictCount: row.conflictCount,
    retryCount: row.retryCount,
    summary: row.summary,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

export async function readPlanningStore(ownerEmail: string): Promise<{
  managedCalendars: ManagedCalendar[];
  gaps: PlanningGap[];
  dayIntents: DayIntent[];
  openTopics: OpenTopic[];
  automationMode: "dry-run" | "safe";
  lastSyncRun: SyncRun | null;
}> {
  const db = getDb();
  const [calendarRows, gapRows, intentRows, topicRows, settingRows, runRows] =
    await Promise.all([
      db
        .select()
        .from(managedCalendars)
        .where(eq(managedCalendars.ownerEmail, ownerEmail)),
      db
        .select()
        .from(planningGaps)
        .where(eq(planningGaps.ownerEmail, ownerEmail)),
      db
        .select()
        .from(dayIntents)
        .where(eq(dayIntents.ownerEmail, ownerEmail)),
      db
        .select()
        .from(openTopics)
        .where(eq(openTopics.ownerEmail, ownerEmail)),
      db
        .select()
        .from(planningSettings)
        .where(eq(planningSettings.ownerEmail, ownerEmail))
        .limit(1),
      db
        .select()
        .from(syncRuns)
        .where(eq(syncRuns.ownerEmail, ownerEmail))
        .orderBy(desc(syncRuns.startedAt))
        .limit(1),
    ]);
  return {
    managedCalendars: calendarRows.map(managedCalendarFromRow),
    gaps: gapRows.map(gapFromRow),
    dayIntents: intentRows.map(intentFromRow).sort((a, b) => a.date.localeCompare(b.date)),
    openTopics: topicRows
      .map(topicFromRow)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    automationMode:
      settingRows[0]?.automationMode === "safe" ? "safe" : "dry-run",
    lastSyncRun: runRows[0] ? syncRunFromRow(runRows[0]) : null,
  };
}

export async function saveManagedCalendarState(
  ownerEmail: string,
  calendars: ManagedCalendar[],
): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  for (const calendar of calendars) {
    await db
        .insert(managedCalendars)
        .values({
          ownerEmail,
          calendarKey: calendar.key,
          name: calendar.name,
          calendarId: calendar.calendarId,
          status: calendar.status,
          matchCount: calendar.matchCount,
          accessRole: calendar.accessRole,
          privateAclVerified: calendar.privateAclVerified,
          lastCheckedAt: calendar.lastCheckedAt,
          error: calendar.error,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [managedCalendars.ownerEmail, managedCalendars.calendarKey],
          set: {
            name: calendar.name,
            calendarId: calendar.calendarId,
            status: calendar.status,
            matchCount: calendar.matchCount,
            accessRole: calendar.accessRole,
            privateAclVerified: calendar.privateAclVerified,
            lastCheckedAt: calendar.lastCheckedAt,
            error: calendar.error,
            updatedAt: now,
          },
        });
  }
}

export async function persistPlanningGaps(
  ownerEmail: string,
  currentGaps: PlanningGap[],
): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  const existing = await db
    .select()
    .from(planningGaps)
    .where(eq(planningGaps.ownerEmail, ownerEmail));
  const existingById = new Map(existing.map((row) => [row.gapId, row]));
  const activeIds = new Set(currentGaps.map((item) => item.id));
  for (const item of currentGaps) {
    const previous = existingById.get(item.id);
    const snoozeActive =
      previous?.status === "snoozed" &&
      Boolean(previous.snoozedUntil) &&
      new Date(previous.snoozedUntil || 0).getTime() > Date.now();
    await db
      .insert(planningGaps)
      .values({
        ownerEmail,
        gapId: item.id,
        kind: item.kind,
        severity: item.severity,
        status: snoozeActive ? "snoozed" : "open",
        title: item.title,
        detail: item.detail,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        gapDate: item.date,
        dueAt: item.dueAt,
        snoozedUntil: snoozeActive ? previous?.snoozedUntil || null : null,
        resolutionNote: previous?.resolutionNote || null,
        googleTaskId: previous?.googleTaskId || null,
        firstSeenAt: previous?.firstSeenAt || now,
        lastSeenAt: now,
        resolvedAt: null,
      })
      .onConflictDoUpdate({
        target: [planningGaps.ownerEmail, planningGaps.gapId],
        set: {
          kind: item.kind,
          severity: item.severity,
          status: snoozeActive ? "snoozed" : "open",
          title: item.title,
          detail: item.detail,
          sourceType: item.sourceType,
          sourceId: item.sourceId,
          gapDate: item.date,
          dueAt: item.dueAt,
          snoozedUntil: snoozeActive ? previous?.snoozedUntil || null : null,
          lastSeenAt: now,
          resolvedAt: null,
        },
      });
  }
  for (const row of existing) {
    if (!activeIds.has(row.gapId) && row.status !== "resolved") {
      await db
          .update(planningGaps)
          .set({ status: "resolved", resolvedAt: now, lastSeenAt: now })
          .where(
            and(
              eq(planningGaps.ownerEmail, ownerEmail),
              eq(planningGaps.gapId, row.gapId),
            ),
          );
    }
  }
}

export async function setGapAction(
  ownerEmail: string,
  gapId: string,
  input: {
    action: "reopen" | "snooze" | "resolve";
    snoozedUntil?: string | null;
    note?: string;
  },
): Promise<PlanningGap> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(planningGaps)
    .where(
      and(
        eq(planningGaps.ownerEmail, ownerEmail),
        eq(planningGaps.gapId, gapId),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("Die Planungslücke wurde nicht gefunden.");
  const now = new Date().toISOString();
  const snoozedUntil =
    input.action === "snooze"
      ? optionalIso(input.snoozedUntil, "Die Zurückstellung")
      : null;
  if (input.action === "snooze" && !snoozedUntil) {
    throw new Error("Für die Zurückstellung wird ein Zeitpunkt benötigt.");
  }
  const note = boundedText(input.note || "", "Die Begründung", 2_000);
  const [updated] = await db
    .update(planningGaps)
    .set({
      status:
        input.action === "snooze"
          ? "snoozed"
          : input.action === "resolve"
            ? "resolved"
            : "open",
      snoozedUntil,
      resolutionNote: note || null,
      resolvedAt: input.action === "resolve" ? now : null,
      lastSeenAt: now,
    })
    .where(
      and(
        eq(planningGaps.ownerEmail, ownerEmail),
        eq(planningGaps.gapId, gapId),
      ),
    )
    .returning();
  return gapFromRow(updated);
}

export async function saveGapTaskId(
  ownerEmail: string,
  gapId: string,
  googleTaskId: string,
): Promise<void> {
  await getDb()
    .update(planningGaps)
    .set({ googleTaskId })
    .where(
      and(
        eq(planningGaps.ownerEmail, ownerEmail),
        eq(planningGaps.gapId, gapId),
      ),
    );
}

export async function saveDayIntent(
  ownerEmail: string,
  input: { date: unknown; kind: unknown; note?: unknown },
): Promise<DayIntent> {
  const date = validDateKey(input.date);
  if (typeof input.kind !== "string" || !DAY_INTENTS.has(input.kind as DayIntentKind)) {
    throw new Error("Die Tagesfreigabe ist ungültig.");
  }
  const kind = input.kind as DayIntentKind;
  const note = boundedText(input.note || "", "Die Notiz", 1_000);
  const now = new Date().toISOString();
  const [row] = await getDb()
    .insert(dayIntents)
    .values({
      ownerEmail,
      intentDate: date,
      kind,
      note,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [dayIntents.ownerEmail, dayIntents.intentDate],
      set: { kind, note, updatedAt: now },
    })
    .returning();
  return intentFromRow(row);
}

export async function deleteDayIntent(
  ownerEmail: string,
  date: string,
): Promise<void> {
  await getDb()
    .delete(dayIntents)
    .where(
      and(
        eq(dayIntents.ownerEmail, ownerEmail),
        eq(dayIntents.intentDate, validDateKey(date)),
      ),
    );
}

function suggestionGroup(
  suggestion: JournalAnalysisSuggestion,
): OpenTopicGroup {
  if (suggestion.kind === "decision" || suggestion.kind === "calendar") {
    return "decision";
  }
  if (suggestion.kind === "waiting") return "waiting";
  return suggestion.proposedDueAt ? "scheduled" : "next_step";
}

async function stableSuggestionId(
  journalId: string,
  suggestion: JournalAnalysisSuggestion,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `${journalId}\u0000${suggestion.kind}\u0000${suggestion.title}\u0000${suggestion.evidence}`,
    ),
  );
  return `journal-topic-${[...new Uint8Array(digest)]
    .slice(0, 12)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

export async function saveJournalSuggestions(
  ownerEmail: string,
  journalId: string,
  suggestions: JournalAnalysisSuggestion[],
): Promise<OpenTopic[]> {
  const db = getDb();
  const now = new Date().toISOString();
  const saved: OpenTopic[] = [];
  for (const suggestion of suggestions.slice(0, 20)) {
    const topicId = await stableSuggestionId(journalId, suggestion);
    const dueAt = optionalIso(suggestion.proposedDueAt, "Der Vorschlagstermin");
    const confidence = Math.max(0, Math.min(suggestion.confidence, 1));
    const [row] = await db
      .insert(openTopics)
      .values({
        ownerEmail,
        topicId,
        topicGroup: suggestionGroup(suggestion),
        status: "open",
        title: boundedText(suggestion.title, "Der Titel", 300),
        detail: boundedText(suggestion.detail, "Die Erläuterung", 2_000),
        nextStep: boundedText(
          suggestion.proposedNextStep,
          "Der nächste Schritt",
          1_000,
        ),
        dueAt,
        sourceType: "open-topic",
        sourceId: journalId,
        evidence: boundedText(suggestion.evidence, "Die Belegstelle", 1_000),
        confidencePermille: Math.round(confidence * 1_000),
        requiresCalendarTarget: suggestion.requiresCalendarTarget,
        calendarTarget: null,
        snoozedUntil: null,
        createdAt: now,
        updatedAt: now,
        resolvedAt: null,
      })
      .onConflictDoUpdate({
        target: [openTopics.ownerEmail, openTopics.topicId],
        set: {
          topicGroup: suggestionGroup(suggestion),
          title: boundedText(suggestion.title, "Der Titel", 300),
          detail: boundedText(suggestion.detail, "Die Erläuterung", 2_000),
          nextStep: boundedText(
            suggestion.proposedNextStep,
            "Der nächste Schritt",
            1_000,
          ),
          dueAt,
          evidence: boundedText(suggestion.evidence, "Die Belegstelle", 1_000),
          confidencePermille: Math.round(confidence * 1_000),
          requiresCalendarTarget: suggestion.requiresCalendarTarget,
          updatedAt: now,
        },
      })
      .returning();
    saved.push(topicFromRow(row));
  }
  return saved;
}

export async function updateOpenTopic(
  ownerEmail: string,
  topicId: string,
  input: {
    status?: unknown;
    group?: unknown;
    nextStep?: unknown;
    dueAt?: unknown;
    calendarTarget?: unknown;
    snoozedUntil?: unknown;
  },
): Promise<OpenTopic> {
  const [existing] = await getDb()
    .select()
    .from(openTopics)
    .where(
      and(eq(openTopics.ownerEmail, ownerEmail), eq(openTopics.topicId, topicId)),
    )
    .limit(1);
  if (!existing) throw new Error("Das offene Thema wurde nicht gefunden.");
  const status =
    input.status === undefined
      ? existing.status
      : input.status === "open" ||
          input.status === "snoozed" ||
          input.status === "resolved"
        ? input.status
        : (() => {
            throw new Error("Der Themenstatus ist ungültig.");
          })();
  const group =
    input.group === undefined
      ? existing.topicGroup
      : typeof input.group === "string" && TOPIC_GROUPS.has(input.group as OpenTopicGroup)
        ? input.group
        : (() => {
            throw new Error("Die Themengruppe ist ungültig.");
          })();
  const calendarTarget =
    input.calendarTarget === undefined
      ? existing.calendarTarget
      : input.calendarTarget === null || input.calendarTarget === ""
        ? null
        : typeof input.calendarTarget === "string" &&
            CALENDAR_TARGETS.has(input.calendarTarget as CalendarTargetChoice)
          ? input.calendarTarget
          : (() => {
              throw new Error("Die Kalenderauswahl ist ungültig.");
            })();
  const now = new Date().toISOString();
  const [row] = await getDb()
    .update(openTopics)
    .set({
      status,
      topicGroup: group,
      nextStep:
        input.nextStep === undefined
          ? existing.nextStep
          : boundedText(input.nextStep, "Der nächste Schritt", 1_000),
      dueAt:
        input.dueAt === undefined
          ? existing.dueAt
          : optionalIso(input.dueAt, "Der Termin"),
      calendarTarget,
      snoozedUntil:
        input.snoozedUntil === undefined
          ? existing.snoozedUntil
          : optionalIso(input.snoozedUntil, "Die Zurückstellung"),
      updatedAt: now,
      resolvedAt: status === "resolved" ? now : null,
    })
    .where(
      and(eq(openTopics.ownerEmail, ownerEmail), eq(openTopics.topicId, topicId)),
    )
    .returning();
  return topicFromRow(row);
}

export async function recordDecision(
  ownerEmail: string,
  input: {
    topicId?: unknown;
    sourceJournalId?: unknown;
    title: unknown;
    decision: unknown;
    calendarTarget?: unknown;
    apply?: unknown;
  },
): Promise<DecisionRecord> {
  const calendarTarget =
    input.calendarTarget === undefined || input.calendarTarget === null
      ? null
      : typeof input.calendarTarget === "string" &&
          CALENDAR_TARGETS.has(input.calendarTarget as CalendarTargetChoice)
        ? (input.calendarTarget as CalendarTargetChoice)
        : (() => {
            throw new Error("Die Kalenderauswahl ist ungültig.");
          })();
  const now = new Date().toISOString();
  const decisionId = crypto.randomUUID();
  const values = {
    ownerEmail,
    decisionId,
    topicId: boundedText(input.topicId || "", "Die Themen-ID", 512) || null,
    sourceJournalId:
      boundedText(input.sourceJournalId || "", "Die Tagebuch-ID", 512) || null,
    title: boundedText(input.title, "Der Entscheidungstitel", 300),
    decision: boundedText(input.decision, "Die Entscheidung", 4_000),
    calendarTarget,
    appliedAt: input.apply === true ? now : null,
    createdAt: now,
  };
  await getDb().insert(decisionRecords).values(values);
  return {
    id: decisionId,
    topicId: values.topicId,
    sourceJournalId: values.sourceJournalId,
    title: values.title,
    decision: values.decision,
    calendarTarget,
    appliedAt: values.appliedAt,
    createdAt: now,
  };
}

export async function startSyncRun(
  ownerEmail: string,
  mode: SyncRun["mode"],
  reason: string,
): Promise<SyncRun> {
  const startedAt = new Date().toISOString();
  const run: SyncRun = {
    id: crypto.randomUUID(),
    mode,
    reason: boundedText(reason || "manual", "Der Abgleichgrund", 120),
    status: "running",
    desiredCount: 0,
    createCount: 0,
    patchCount: 0,
    deleteCount: 0,
    conflictCount: 0,
    retryCount: 0,
    summary: "Planungsabgleich läuft.",
    startedAt,
    finishedAt: null,
  };
  await getDb().insert(syncRuns).values({
    ownerEmail,
    runId: run.id,
    mode: run.mode,
    reason: run.reason,
    status: run.status,
    desiredCount: 0,
    createCount: 0,
    patchCount: 0,
    deleteCount: 0,
    conflictCount: 0,
    retryCount: 0,
    summary: run.summary,
    startedAt,
    finishedAt: null,
  });
  return run;
}

export async function finishSyncRun(
  ownerEmail: string,
  run: SyncRun,
): Promise<SyncRun> {
  const finishedAt = new Date().toISOString();
  const completed = { ...run, finishedAt };
  await getDb()
    .update(syncRuns)
    .set({
      status: completed.status,
      desiredCount: completed.desiredCount,
      createCount: completed.createCount,
      patchCount: completed.patchCount,
      deleteCount: completed.deleteCount,
      conflictCount: completed.conflictCount,
      retryCount: completed.retryCount,
      summary: completed.summary,
      finishedAt,
    })
    .where(
      and(eq(syncRuns.ownerEmail, ownerEmail), eq(syncRuns.runId, run.id)),
    );
  const now = new Date().toISOString();
  await getDb()
    .insert(planningSettings)
    .values({
      ownerEmail,
      automationMode: "dry-run",
      dryRunApprovedAt: null,
      lastReconcileAt: finishedAt,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: planningSettings.ownerEmail,
      set: { lastReconcileAt: finishedAt, updatedAt: now },
    });
  return completed;
}

export async function activateSafeAutomation(ownerEmail: string): Promise<void> {
  const [lastDryRun] = await getDb()
    .select()
    .from(syncRuns)
    .where(
      and(
        eq(syncRuns.ownerEmail, ownerEmail),
        eq(syncRuns.mode, "dry-run"),
      ),
    )
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);
  if (
    !lastDryRun ||
    lastDryRun.status !== "succeeded" ||
    lastDryRun.conflictCount > 0
  ) {
    throw new Error(
      "Sichere Automatik kann erst nach einem erfolgreichen, konfliktfreien Dry-run aktiviert werden.",
    );
  }
  const now = new Date().toISOString();
  await getDb()
    .insert(planningSettings)
    .values({
      ownerEmail,
      automationMode: "safe",
      dryRunApprovedAt: lastDryRun.finishedAt || now,
      lastReconcileAt: lastDryRun.finishedAt,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: planningSettings.ownerEmail,
      set: {
        automationMode: "safe",
        dryRunApprovedAt: lastDryRun.finishedAt || now,
        updatedAt: now,
      },
    });
}

export async function pauseAutomation(ownerEmail: string): Promise<void> {
  const now = new Date().toISOString();
  await getDb()
    .insert(planningSettings)
    .values({
      ownerEmail,
      automationMode: "dry-run",
      dryRunApprovedAt: null,
      lastReconcileAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: planningSettings.ownerEmail,
      set: { automationMode: "dry-run", updatedAt: now },
    });
}

export async function unresolvedPlanningGaps(
  ownerEmail: string,
): Promise<PlanningGap[]> {
  const rows = await getDb()
    .select()
    .from(planningGaps)
    .where(
      and(
        eq(planningGaps.ownerEmail, ownerEmail),
        ne(planningGaps.status, "resolved"),
      ),
    );
  return rows.map(gapFromRow);
}
