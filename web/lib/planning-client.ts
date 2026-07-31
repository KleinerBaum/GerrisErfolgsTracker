"use client";

import type {
  CalendarTargetChoice,
  DayIntentKind,
  DecisionRecord,
  JournalAnalysisResult,
  OpenTopic,
  PlanningGap,
  PlanningHealthReport,
} from "./types";

type PlanningErrorPayload = {
  error?: string;
  code?: string;
};

export class PlanningClientError extends Error {
  readonly code: string;

  constructor(payload: PlanningErrorPayload, fallback: string) {
    super(payload.error || fallback);
    this.name = "PlanningClientError";
    this.code = payload.code || "planning_error";
  }
}

async function json<T>(response: Response, fallback: string): Promise<T> {
  let payload: (T & PlanningErrorPayload) | PlanningErrorPayload = {};
  try {
    payload = (await response.json()) as T & PlanningErrorPayload;
  } catch {
    // Der deutsche Fallback bleibt auch bei einer leeren Providerantwort lesbar.
  }
  if (!response.ok) throw new PlanningClientError(payload, fallback);
  return payload as T;
}

export async function getPlanningReport(): Promise<PlanningHealthReport> {
  const payload = await json<{ report: PlanningHealthReport }>(
    await fetch("/api/planning", { cache: "no-store" }),
    "Der Planungsstand konnte nicht geladen werden.",
  );
  return payload.report;
}

export async function reconcilePlanning(
  reason: string,
  forceDryRun = false,
): Promise<{ report: PlanningHealthReport; run: PlanningHealthReport["lastSyncRun"] }> {
  return json(
    await fetch("/api/planning/reconcile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason, forceDryRun }),
    }),
    "Der Planungsabgleich konnte nicht ausgeführt werden.",
  );
}

export async function savePlanningDayIntent(input: {
  date: string;
  kind: DayIntentKind;
  note?: string;
}): Promise<void> {
  await json(
    await fetch("/api/planning/day-intents", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Die Tagesfreigabe konnte nicht gespeichert werden.",
  );
}

export async function removePlanningDayIntent(date: string): Promise<void> {
  await json(
    await fetch(
      `/api/planning/day-intents?date=${encodeURIComponent(date)}`,
      { method: "DELETE" },
    ),
    "Die Tagesfreigabe konnte nicht entfernt werden.",
  );
}

export async function updatePlanningGap(
  gapId: string,
  input: {
    action: "reopen" | "snooze" | "resolve";
    snoozedUntil?: string;
    note?: string;
  },
): Promise<PlanningGap> {
  const payload = await json<{ gap: PlanningGap }>(
    await fetch(`/api/planning/gaps/${encodeURIComponent(gapId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Die Planungslücke konnte nicht aktualisiert werden.",
  );
  return payload.gap;
}

export async function updatePlanningTopic(
  topicId: string,
  input: Partial<
    Pick<
      OpenTopic,
      "status" | "group" | "nextStep" | "dueAt" | "calendarTarget" | "snoozedUntil"
    >
  >,
): Promise<OpenTopic> {
  const payload = await json<{ topic: OpenTopic }>(
    await fetch(`/api/planning/topics/${encodeURIComponent(topicId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Das offene Thema konnte nicht aktualisiert werden.",
  );
  return payload.topic;
}

export async function savePlanningDecision(input: {
  topicId?: string;
  sourceJournalId?: string;
  title: string;
  decision: string;
  calendarTarget?: CalendarTargetChoice | null;
  apply?: boolean;
}): Promise<DecisionRecord> {
  const payload = await json<{ decision: DecisionRecord }>(
    await fetch("/api/planning/decisions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Die Entscheidung konnte nicht gespeichert werden.",
  );
  return payload.decision;
}

export async function setPlanningAutomationMode(
  mode: "dry-run" | "safe",
): Promise<void> {
  await json(
    await fetch("/api/planning/automation", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode }),
    }),
    "Der Automatikmodus konnte nicht geändert werden.",
  );
}

function planningContext(report: PlanningHealthReport | null): string {
  if (!report) return "Planungsstatus unbekannt";
  return JSON.stringify({
    state: report.state,
    generatedAt: report.generatedAt,
    criticalCount: report.criticalCount,
    importantCount: report.importantCount,
    days: report.days.map((day) => ({
      date: day.date,
      state: day.state,
      intent: day.intent,
      planBlockCount: day.planBlockCount,
      conflictCount: day.conflictCount,
    })),
    gaps: report.gaps
      .filter((gap) => gap.status === "open")
      .slice(0, 30)
      .map((gap) => ({
        id: gap.id,
        kind: gap.kind,
        severity: gap.severity,
        title: gap.title,
        dueAt: gap.dueAt,
      })),
  });
}

export async function analyzeAndStoreJournal(input: {
  journalId: string;
  date: string;
  text: string;
  mood: number;
  win: string;
  nextStep: string;
  weekPlan: string;
  report: PlanningHealthReport | null;
}): Promise<{ analysis: JournalAnalysisResult; mode: "ai" | "fallback" }> {
  const assistant = await json<{
    result: JournalAnalysisResult;
    mode: "ai" | "fallback";
  }>(
    await fetch("/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "journal-analysis",
        journalId: input.journalId,
        date: input.date,
        text: input.text,
        mood: input.mood,
        win: input.win,
        nextStep: input.nextStep,
        weekPlan: input.weekPlan,
        planningSummary: planningContext(input.report),
      }),
    }),
    "Der Tagebucheintrag konnte nicht analysiert werden.",
  );
  if (assistant.result.suggestions.length) {
    await json(
      await fetch("/api/planning/topics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          journalId: input.journalId,
          suggestions: assistant.result.suggestions,
        }),
      }),
      "Die Tagebuchvorschläge konnten nicht gespeichert werden.",
    );
  }
  return { analysis: assistant.result, mode: assistant.mode };
}
