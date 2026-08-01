"use client";

import { useState } from "react";

import {
  DASHBOARD_KPI_DEFINITIONS,
  type DashboardKpiDefinition,
} from "../lib/dashboard";
import {
  calendarDayDifference,
  formatCurrency,
  formatRelativeDate,
  formatTime,
  isoDateInput,
  isSameCalendarMonth,
} from "../lib/format";
import { createDefaultGamification } from "../lib/gamification";
import {
  LIFE_AREA_LABELS,
  type AppState,
  type ApplicationProcess,
  type CalendarEvent,
  type DashboardKpiKey,
  type DashboardKpiTarget,
  type PlanningHealthReport,
  type ViewKey,
} from "../lib/types";
import type { GoogleTasksStatus } from "../lib/google-tasks-client";

type TodayViewProps = {
  state: AppState;
  externalEvents: CalendarEvent[];
  taskStatus: GoogleTasksStatus | null;
  planningReport: PlanningHealthReport | null;
  onCompleteTask: (taskId: string) => Promise<void>;
  onNavigate: (view: ViewKey) => void;
  onOpenSettings: () => void;
};

type PriorityLevel = "critical" | "important" | "progress" | "routine";

type PrioritySignal = {
  id: string;
  area: Exclude<ViewKey, "today" | "documents" | "contacts">;
  areaLabel: string;
  title: string;
  detail: string;
  when: string;
  level: PriorityLevel;
  sortAt: number;
  action: string;
};

type DashboardMetric = {
  definition: DashboardKpiDefinition;
  setting: DashboardKpiTarget;
  value: number | null;
};

const PRIORITY_RANK: Record<PriorityLevel, number> = {
  critical: 0,
  important: 1,
  progress: 2,
  routine: 3,
};

const CLOSED_APPLICATION_STATUSES = new Set([
  "closed",
  "rejected",
  "withdrawn",
]);

const applicationDate = (application: ApplicationProcess): string | null =>
  application.nextStepAt || application.deadline;

const validTime = (value: string | null | undefined): number => {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
};

const occurredWithin = (value: string | null | undefined, now: number, days: number) => {
  const time = validTime(value);
  if (time === Number.MAX_SAFE_INTEGER) return false;
  const difference = now - time;
  return difference >= 0 && difference < days * 86_400_000;
};

const metricValue = (key: DashboardKpiKey, value: number): string =>
  key === "monthly_spending_limit"
    ? formatCurrency(value)
    : value.toLocaleString("de-DE");

const metricTarget = (
  definition: DashboardKpiDefinition,
  target: number,
): string =>
  definition.key === "monthly_spending_limit"
    ? `max. ${formatCurrency(target)}`
    : `${target.toLocaleString("de-DE")} ${definition.unit}`;

function DashboardGoalCard({ metric }: { metric: DashboardMetric }) {
  const { definition, setting, value } = metric;
  const progress =
    value === null
      ? 0
      : Math.min(100, Math.round((value / Math.max(setting.target, 1)) * 100));
  const reached =
    value !== null &&
    (definition.direction === "minimum"
      ? value >= setting.target
      : value <= setting.target);
  const status =
    value === null
      ? "Stand noch nicht verlässlich"
      : definition.direction === "maximum"
        ? value <= setting.target
          ? `${Math.round((value / Math.max(setting.target, 1)) * 100)} % genutzt`
          : `${metricValue(definition.key, value - setting.target)} über Ziel`
        : value >= setting.target
          ? "Ziel erreicht"
          : `${(setting.target - value).toLocaleString("de-DE")} ${definition.unit} fehlen`;

  return (
    <article
      className={`dashboard-goal-card ${reached ? "is-reached" : ""} ${value === null ? "is-unknown" : ""}`}
    >
      <header>
        <span>{definition.shortLabel}</span>
        <small>{metricTarget(definition, setting.target)}</small>
      </header>
      <strong>{value === null ? "—" : metricValue(definition.key, value)}</strong>
      <div className="dashboard-goal-track" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
      <small>{status}</small>
    </article>
  );
}

function InsightHeading({
  eyebrow,
  title,
  copy,
  action,
  onOpen,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  action: string;
  onOpen: () => void;
}) {
  return (
    <header className="central-insight-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h3>{title}</h3>
        <p>{copy}</p>
      </div>
      <button onClick={onOpen} type="button">
        {action} <span aria-hidden="true">→</span>
      </button>
    </header>
  );
}

export function TodayView({
  state,
  externalEvents,
  taskStatus,
  planningReport,
  onCompleteTask,
  onNavigate,
  onOpenSettings,
}: TodayViewProps) {
  const [now] = useState(() => Date.now());
  const today = isoDateInput(new Date(now).toISOString());
  const dayDifference = (value: string) => calendarDayDifference(value, now);
  const openTasks = state.tasks.filter((task) => !task.completed);
  const focusTasks = openTasks
    .filter((task) => task.quadrant === "do" || task.quadrant === "plan")
    .sort((left, right) => {
      const quadrantDifference =
        (left.quadrant === "do" ? 0 : 1) - (right.quadrant === "do" ? 0 : 1);
      return quadrantDifference || validTime(left.dueAt) - validTime(right.dueAt);
    })
    .slice(0, 4);
  const focusMinutes = focusTasks.reduce(
    (sum, task) => sum + task.estimateMinutes,
    0,
  );
  const completedThisWeek = state.tasks.filter(
    (task) =>
      task.completed &&
      occurredWithin(task.completedAt ?? task.updatedAt, now, 7),
  ).length;

  const events = [...externalEvents, ...state.calendarEvents]
    .filter((event) => new Date(event.endAt).getTime() >= now)
    .sort((left, right) => left.startAt.localeCompare(right.startAt));
  const nextEvents = events.slice(0, 4);
  const todayEvents = events.filter((event) => dayDifference(event.startAt) === 0);
  const weekEvents = events.filter((event) => {
    const difference = dayDifference(event.startAt);
    return difference >= 0 && difference < 7;
  });
  const plannedDays =
    planningReport &&
    planningReport.state !== "unknown" &&
    planningReport.state !== "stale"
      ? planningReport.days
          .slice(0, 7)
          .filter(
            (day) =>
              day.state === "planned" || day.state === "intentionally_free",
          ).length
      : null;
  const planningNeedsAttention =
    !planningReport ||
    planningReport.state === "unknown" ||
    planningReport.state === "stale" ||
    planningReport.criticalCount > 0;

  const paidThisMonth = state.costs
    .filter(
      (cost) => cost.status === "paid" && isSameCalendarMonth(cost.dueAt, now),
    )
    .reduce((sum, cost) => sum + cost.amount, 0);
  const upcomingCosts = state.costs
    .filter((cost) => {
      const difference = dayDifference(cost.dueAt);
      return cost.status !== "paid" && difference >= 0 && difference <= 14;
    })
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt));
  const attentionCosts = state.costs
    .filter((cost) => {
      const difference = dayDifference(cost.dueAt);
      return cost.status !== "paid" && difference >= -30 && difference <= 14;
    })
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt));
  const upcomingCostTotal = upcomingCosts.reduce(
    (sum, cost) => sum + cost.amount,
    0,
  );

  const activeApplications = state.applications.filter(
    (application) =>
      !CLOSED_APPLICATION_STATUSES.has(application.status) &&
      ["draft", "submitted", "interview", "offer"].includes(application.status),
  );
  const interviewApplications = state.applications.filter(
    (application) => application.status === "interview",
  );
  const shortlistedApplications = state.applications.filter(
    (application) =>
      application.shortlisted && !CLOSED_APPLICATION_STATUSES.has(application.status),
  );
  const applicationAttention = state.applications
    .filter((application) => {
      const date = applicationDate(application);
      if (!date || CLOSED_APPLICATION_STATUSES.has(application.status)) return false;
      const difference = dayDifference(date);
      return difference >= -30 && difference <= 14;
    })
    .sort(
      (left, right) =>
        validTime(applicationDate(left)) - validTime(applicationDate(right)),
    );
  const applicationDetails = applicationAttention.length
    ? applicationAttention.slice(0, 4)
    : [...shortlistedApplications, ...activeApplications]
        .filter(
          (application, index, applications) =>
            applications.findIndex((candidate) => candidate.id === application.id) ===
            index,
        )
        .slice(0, 4);

  const journalThisWeek = state.journal.filter((entry) =>
    occurredWithin(`${entry.date}T12:00:00`, now, 7),
  );
  const todayJournal = state.journal.find((entry) => entry.date === today);
  const averageMood = journalThisWeek.length
    ? journalThisWeek.reduce((sum, entry) => sum + entry.mood, 0) /
      journalThisWeek.length
    : null;
  const openTopics =
    planningReport?.openTopics.filter((topic) => topic.status !== "resolved") ?? [];

  const metricValues: Record<DashboardKpiKey, number | null> = {
    weekly_task_completions: completedThisWeek,
    daily_focus_minutes: focusMinutes,
    planned_days: plannedDays,
    monthly_spending_limit: paidThisMonth,
    active_applications: activeApplications.length,
    weekly_journal_entries: journalThisWeek.length,
  };
  const enabledMetrics: DashboardMetric[] = state.dashboardSettings.kpis
    .filter((setting) => setting.enabled)
    .map((setting) => ({
      definition: DASHBOARD_KPI_DEFINITIONS.find(
        (definition) => definition.key === setting.key,
      )!,
      setting,
      value: metricValues[setting.key],
    }));

  const prioritySignals: PrioritySignal[] = [];
  if (planningNeedsAttention) {
    prioritySignals.push({
      id: "planning-health",
      area: "calendar",
      areaLabel: "Planung",
      title: planningReport?.title || "Planungslücke mit Top-Priorität klären",
      detail:
        planningReport?.message ||
        "Ein leerer oder ungeprüfter Kalender wird nicht als freie Zeit gewertet.",
      when: "Jetzt klären",
      level: "critical",
      sortAt: 0,
      action: "Planung öffnen",
    });
  }
  for (const task of focusTasks.slice(0, 2)) {
    const difference = task.dueAt ? dayDifference(task.dueAt) : null;
    const level: PriorityLevel =
      difference !== null && difference < 0
        ? "critical"
        : task.quadrant === "do" || (difference !== null && difference <= 1)
          ? "important"
          : "progress";
    prioritySignals.push({
      id: `task-${task.id}`,
      area: "tasks",
      areaLabel: "Aufgabe",
      title: task.title,
      detail: `${LIFE_AREA_LABELS[task.area]} · ${task.estimateMinutes} Min. · ${task.progress} % Fortschritt`,
      when: task.dueAt ? formatRelativeDate(task.dueAt) : "Ohne Frist",
      level,
      sortAt: validTime(task.dueAt),
      action: "Aufgabe öffnen",
    });
  }
  for (const cost of attentionCosts.slice(0, 2)) {
    const difference = dayDifference(cost.dueAt);
    prioritySignals.push({
      id: `cost-${cost.id}`,
      area: "finance",
      areaLabel: "Zahlung",
      title: cost.title,
      detail: `${formatCurrency(cost.amount)} · ${cost.payee || cost.category}`,
      when: formatRelativeDate(cost.dueAt),
      level: difference <= 2 || cost.status === "due" ? "critical" : "important",
      sortAt: validTime(cost.dueAt),
      action: "Finanzen öffnen",
    });
  }
  for (const application of applicationAttention.slice(0, 2)) {
    const date = applicationDate(application)!;
    const difference = dayDifference(date);
    prioritySignals.push({
      id: `application-${application.id}`,
      area: "applications",
      areaLabel: "Bewerbung",
      title: `${application.jobTitle} · ${application.company}`,
      detail: application.nextStep || "Nächsten verbindlichen Schritt festlegen.",
      when: formatRelativeDate(date),
      level: difference < 0 ? "critical" : difference <= 7 ? "important" : "progress",
      sortAt: validTime(date),
      action: "Bewerbung öffnen",
    });
  }
  if (!todayJournal?.closedAt) {
    prioritySignals.push({
      id: "journal-close",
      area: "journal",
      areaLabel: "Tagesabschluss",
      title: "Den Tag bewusst abschließen",
      detail:
        openTopics.length > 0
          ? `${openTopics.length} offene Themen warten auf Abgleich und Ausrichtung.`
          : "Rückblick, Abgleich und nächster Schritt in wenigen Minuten.",
      when: "Heute Abend",
      level: "routine",
      sortAt: Number.MAX_SAFE_INTEGER - 1,
      action: "Tagebuch öffnen",
    });
  }
  const sortedPriorities = prioritySignals
    .sort(
      (left, right) =>
        PRIORITY_RANK[left.level] - PRIORITY_RANK[right.level] ||
        left.sortAt - right.sortAt,
    )
    .slice(0, 7);
  const attentionCount = sortedPriorities.filter(
    (signal) => signal.level === "critical" || signal.level === "important",
  ).length;

  const gamification =
    state.gamification ?? createDefaultGamification(state.points, state.updatedAt);
  const activeGoals = gamification.goals.filter((goal) => !goal.completedAt).slice(0, 3);
  const extensiveTasks = openTasks
    .filter((task) => task.progress > 0 || task.estimateMinutes >= 60)
    .sort(
      (left, right) =>
        right.progress - left.progress || right.estimateMinutes - left.estimateMinutes,
    )
    .slice(0, Math.max(1, 4 - activeGoals.length));

  return (
    <div className="view-stack central-today-view">
      <section className="central-command" aria-labelledby="central-command-title">
        <header className="central-command-header">
          <div>
            <span className="eyebrow">Master-Dashboard · Guten Tag, {state.ownerName}</span>
            <h1 id="central-command-title" tabIndex={-1}>
              Deine Zentrale: Was jetzt zählt.
            </h1>
            <p>
              Aufgaben, Termine, Geld, Bewerbungen und Tagesabschluss werden hier
              gemeinsam nach Dringlichkeit, Wirkung und Fortschritt geordnet.
            </p>
          </div>
          <div className="central-command-actions">
            <button className="button button-primary" onClick={onOpenSettings} type="button">
              Dashboard anpassen
            </button>
            <button
              className="button button-soft"
              onClick={() => onNavigate("calendar")}
              type="button"
            >
              Tag planen
            </button>
          </div>
        </header>

        <div className="dashboard-goal-strip" aria-label="Ausgewählte KPI-Ziele">
          {enabledMetrics.map((metric) => (
            <DashboardGoalCard key={metric.setting.key} metric={metric} />
          ))}
          {!enabledMetrics.length ? (
            <button className="dashboard-goal-empty" onClick={onOpenSettings} type="button">
              <strong>Noch keine KPI-Ziele ausgewählt</strong>
              <span>In den Einstellungen Ziele und Kennzahlen festlegen →</span>
            </button>
          ) : null}
        </div>

        <div className="central-command-grid">
          <section className="priority-command" aria-labelledby="priority-command-title">
            <header>
              <div>
                <span className="eyebrow">Bereichsübergreifend priorisiert</span>
                <h2 id="priority-command-title">Was als Nächstes Aufmerksamkeit braucht</h2>
              </div>
              <span className="attention-count">
                {attentionCount} {attentionCount === 1 ? "Punkt" : "Punkte"} mit Vorrang
              </span>
            </header>
            <ol className="priority-command-list" aria-label="Bereichsübergreifende Prioritäten">
              {sortedPriorities.map((signal, index) => (
                <li className={`priority-signal is-${signal.level}`} key={signal.id}>
                  <span className="priority-number">{String(index + 1).padStart(2, "0")}</span>
                  <div className="priority-signal-copy">
                    <div>
                      <span>{signal.areaLabel}</span>
                      <small>{signal.when}</small>
                    </div>
                    <strong>{signal.title}</strong>
                    <p>{signal.detail}</p>
                  </div>
                  <button onClick={() => onNavigate(signal.area)} type="button">
                    {signal.action} <span aria-hidden="true">→</span>
                  </button>
                </li>
              ))}
              {!sortedPriorities.length ? (
                <li className="priority-command-empty">
                  <strong>Alles Wesentliche ist geklärt.</strong>
                  <p>Nutze den freien Raum für dein nächstes langfristiges Vorhaben.</p>
                </li>
              ) : null}
            </ol>
          </section>

          <aside className="horizon-command" aria-labelledby="horizon-command-title">
            <header>
              <span className="eyebrow">Langfristig in Bewegung</span>
              <h2 id="horizon-command-title">Zielpfad</h2>
              <p>Fortschritt, der nicht zwischen den Tagesaufgaben verschwinden soll.</p>
            </header>
            <div className="horizon-list">
              {activeGoals.map((goal) => {
                const completed = goal.milestones.filter(
                  (milestone) => milestone.completedAt,
                ).length;
                const progress = goal.milestones.length
                  ? Math.round((completed / goal.milestones.length) * 100)
                  : 0;
                return (
                  <article key={goal.id}>
                    <div>
                      <span>Langfristiges Ziel</span>
                      <small>{completed} von {goal.milestones.length} Etappen</small>
                    </div>
                    <strong>{goal.title}</strong>
                    <div className="horizon-progress" aria-label={`${progress} Prozent Fortschritt`}>
                      <span style={{ width: `${progress}%` }} />
                    </div>
                    <p>{goal.nextStep || goal.definitionOfDone}</p>
                  </article>
                );
              })}
              {extensiveTasks.map((task) => (
                <article key={task.id}>
                  <div>
                    <span>Umfangreiche Aufgabe</span>
                    <small>{task.estimateMinutes} Min. geschätzt</small>
                  </div>
                  <strong>{task.title}</strong>
                  <div
                    className="horizon-progress"
                    aria-label={`${task.progress} Prozent Fortschritt`}
                  >
                    <span style={{ width: `${task.progress}%` }} />
                  </div>
                  <p>
                    {task.progress > 0
                      ? `${task.progress} % geschafft · nächster Schritt bleibt sichtbar.`
                      : "Noch nicht begonnen · in einen konkreten nächsten Schritt zerlegen."}
                  </p>
                </article>
              ))}
              {!activeGoals.length && !extensiveTasks.length ? (
                <div className="horizon-empty">
                  <strong>Noch kein längerer Zielpfad aktiv.</strong>
                  <p>Größere Aufgaben mit Fortschritt erscheinen automatisch hier.</p>
                </div>
              ) : null}
            </div>
            <button className="horizon-open" onClick={() => onNavigate("tasks")} type="button">
              Ziele und Aufgaben vertiefen →
            </button>
          </aside>
        </div>
      </section>

      <section className="central-insights" aria-labelledby="central-insights-title">
        <header className="central-insights-intro">
          <div>
            <span className="eyebrow">Informative Vertiefung</span>
            <h2 id="central-insights-title">Jeder Lebensbereich mit genügend Substanz.</h2>
          </div>
          <p>
            Die Zentrale zeigt den Zusammenhang. Von hier führt jeder Bereich direkt
            in seine vollständige Arbeitsansicht.
          </p>
        </header>

        <div className="central-insight-grid">
          <section className="central-insight insight-tasks">
            <InsightHeading
              action="Alle Aufgaben"
              copy="Fokus, Zeitaufwand und Fortschritt der nächsten sinnvollen Schritte."
              eyebrow="Aufgaben"
              onOpen={() => onNavigate("tasks")}
              title="Fokus & große Vorhaben"
            />
            <div className="insight-stat-row">
              <div><strong>{openTasks.length}</strong><span>offen</span></div>
              <div><strong>{focusMinutes}</strong><span>Min. im Fokus</span></div>
              <div><strong>{completedThisWeek}</strong><span>diese Woche erledigt</span></div>
            </div>
            <div className="central-task-list">
              {focusTasks.slice(0, 3).map((task, index) => (
                <article key={task.id}>
                  <button
                    aria-label={`${task.title} erledigen`}
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
                    <small>
                      {task.dueAt ? formatRelativeDate(task.dueAt) : "Ohne Frist"} ·{" "}
                      {task.estimateMinutes} Min.
                    </small>
                    <div className="central-mini-progress" aria-label={`${task.progress} Prozent`}>
                      <span style={{ width: `${task.progress}%` }} />
                    </div>
                  </div>
                </article>
              ))}
              {!focusTasks.length ? <p className="quiet-copy">Keine Fokusaufgabe offen.</p> : null}
            </div>
          </section>

          <section className="central-insight insight-calendar">
            <InsightHeading
              action="Kalender öffnen"
              copy="Termine und verlässliche Planungsabdeckung statt vermeintlich freier Lücken."
              eyebrow="Kalender"
              onOpen={() => onNavigate("calendar")}
              title="Zeit & Verbindlichkeit"
            />
            <div className="insight-stat-row">
              <div><strong>{todayEvents.length}</strong><span>heute</span></div>
              <div><strong>{weekEvents.length}</strong><span>in 7 Tagen</span></div>
              <div><strong>{plannedDays ?? "—"}</strong><span>Tage geklärt</span></div>
            </div>
            <div className="central-agenda-list">
              {nextEvents.map((event) => (
                <article key={event.id}>
                  <time dateTime={event.startAt}>{formatTime(event.startAt)}</time>
                  <span aria-hidden="true" />
                  <div>
                    <strong>{event.title}</strong>
                    <small>{formatRelativeDate(event.startAt)} · {event.source === "google" ? "Google" : "Kompass"}</small>
                  </div>
                </article>
              ))}
              {!nextEvents.length ? (
                <p className="quiet-copy">
                  {planningReport?.days[0]?.state === "intentionally_free"
                    ? "Heute ist ausdrücklich als frei bestätigt."
                    : "Keine verlässlich geladene Agenda vorhanden."}
                </p>
              ) : null}
            </div>
          </section>

          <section className="central-insight insight-finance">
            <InsightHeading
              action="Finanzen öffnen"
              copy="Anstehende Zahlungen, Monatsstand und finanzieller Spielraum."
              eyebrow="Finanzen"
              onOpen={() => onNavigate("finance")}
              title="Geld & Verpflichtungen"
            />
            <div className="finance-insight-summary">
              <div>
                <span>Nächste 14 Tage</span>
                <strong>{formatCurrency(upcomingCostTotal)}</strong>
                <small>{upcomingCosts.length} anstehende Zahlungen</small>
              </div>
              <div>
                <span>Bezahlt im Monat</span>
                <strong>{formatCurrency(paidThisMonth)}</strong>
                <small>gegen deinen gewählten KPI-Rahmen</small>
              </div>
            </div>
            <div className="central-payment-list">
              {upcomingCosts.slice(0, 4).map((cost) => (
                <article key={cost.id}>
                  <span className={`status-dot ${cost.status === "due" ? "urgent" : ""}`} />
                  <div><strong>{cost.title}</strong><small>{formatRelativeDate(cost.dueAt)}</small></div>
                  <b>{formatCurrency(cost.amount)}</b>
                </article>
              ))}
              {!upcomingCosts.length ? <p className="quiet-copy">Keine Zahlung in den nächsten 14 Tagen.</p> : null}
            </div>
          </section>

          <section className="central-insight insight-applications">
            <InsightHeading
              action="Bewerbungen öffnen"
              copy="Shortlist, aktive Prozesse, Fristen und konkrete nächste Schritte."
              eyebrow="Bewerbungen"
              onOpen={() => onNavigate("applications")}
              title="Chancen & nächste Schritte"
            />
            <div className="application-insight-pipeline">
              <div><span>Shortlist</span><strong>{shortlistedApplications.length}</strong></div>
              <i aria-hidden="true" />
              <div><span>Aktiv</span><strong>{activeApplications.length}</strong></div>
              <i aria-hidden="true" />
              <div><span>Gespräche</span><strong>{interviewApplications.length}</strong></div>
            </div>
            <div className="central-application-list">
              {applicationDetails.slice(0, 3).map((application) => (
                <article key={application.id}>
                  <div>
                    <strong>{application.jobTitle}</strong>
                    <small>{application.company} · {application.location}</small>
                  </div>
                  <span>
                    {applicationDate(application)
                      ? formatRelativeDate(applicationDate(application)!)
                      : application.status}
                  </span>
                </article>
              ))}
              {!applicationDetails.length ? <p className="quiet-copy">Noch kein aktiver Bewerbungsprozess.</p> : null}
            </div>
          </section>

          <section className="central-insight insight-journal is-wide">
            <InsightHeading
              action="Tagebuch öffnen"
              copy="Rückblick, Abgleich und Ausrichtung verbinden den heutigen Tag mit der kommenden Woche."
              eyebrow="Tagebuch"
              onOpen={() => onNavigate("journal")}
              title="Tagesabschluss & Muster"
            />
            <div className="journal-insight-layout">
              <div className={`journal-close-state ${todayJournal?.closedAt ? "is-closed" : ""}`}>
                <span>Heute</span>
                <strong>{todayJournal?.closedAt ? "Abgeschlossen" : "Noch offen"}</strong>
                <p>
                  {todayJournal?.closedAt
                    ? todayJournal.win || "Rückblick und Ausrichtung sind festgehalten."
                    : "In 3–5 Minuten offene Punkte sichern und morgen ausrichten."}
                </p>
              </div>
              <div className="journal-insight-stat">
                <span>7-Tage-Rhythmus</span>
                <strong>{journalThisWeek.length} / 7</strong>
                <small>{todayJournal?.nextStep || "Der nächste Schritt erscheint nach dem Abschluss hier."}</small>
              </div>
              <div className="journal-insight-stat">
                <span>Stimmung im Schnitt</span>
                <strong>{averageMood === null ? "—" : averageMood.toFixed(1).replace(".", ",")}</strong>
                <small>{averageMood === null ? "Noch kein Wochenwert" : "von 5 in den letzten sieben Tagen"}</small>
              </div>
              <div className="journal-insight-stat">
                <span>Offene Themen</span>
                <strong>{openTopics.length}</strong>
                <small>{openTopics[0]?.title || "Kein offenes Thema aus dem Tagesabgleich"}</small>
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
