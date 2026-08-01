"use client";

import { useMemo, useState, type FormEvent } from "react";

import { createEmptyApplication } from "../lib/application-research";
import { DIARY_REVIEW_AREAS } from "../lib/diary";
import { formatDate, formatRelativeDate, isoDateInput } from "../lib/format";
import {
  APPLICATION_STATUS_LABELS,
  type AppState,
  type ApplicationProcess,
  type ApplicationStatus,
  type CalendarEvent,
  type DiaryReviewArea,
  type DiarySaveInput,
  type OpenTopic,
  type OpenTopicGroup,
  type PlanningHealthReport,
} from "../lib/types";

const ACTIVE_APPLICATION_STATUSES = new Set<ApplicationStatus>([
  "draft",
  "submitted",
  "interview",
  "offer",
]);

const APPLIED_APPLICATION_STATUSES = new Set<ApplicationStatus>([
  "submitted",
  "interview",
  "offer",
  "rejected",
  "closed",
]);

const REVIEW_LABELS: Record<
  DiaryReviewArea,
  { label: string; description: string }
> = {
  tasks: {
    label: "Aufgaben & Zusagen",
    description: "Erledigtes abhaken und offene Punkte einplanen",
  },
  calendar: {
    label: "Termine",
    description: "Neue Termine und Änderungen festhalten",
  },
  applications: {
    label: "Bewerbungen",
    description: "Status, Rückmeldungen und nächste Schritte aktualisieren",
  },
  finance: {
    label: "Finanzen",
    description: "Einnahmen, Kosten und Zahlungen nachtragen",
  },
  documents: {
    label: "Unterlagen",
    description: "Neue oder geänderte Dokumente richtig ablegen",
  },
};

const TOPIC_GROUP_LABELS: Record<OpenTopicGroup, string> = {
  decision: "Entscheidung nötig",
  next_step: "Nächster Schritt",
  waiting: "Warten",
  scheduled: "Eingeplant",
};

const dayDistance = (value: string): number => {
  const target = new Date(value);
  const today = new Date();
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
};

const withinDays = (value: string | null | undefined, from: number, to: number) => {
  if (!value) return false;
  const distance = dayDistance(value);
  return distance >= from && distance <= to;
};

type DiaryViewProps = {
  state: AppState;
  externalEvents: CalendarEvent[];
  tasksConnected: boolean;
  taskActionId: string;
  planningReport: PlanningHealthReport | null;
  onCompleteTask: (taskId: string) => Promise<void>;
  onCreateApplication: (application: ApplicationProcess) => void;
  onOpenCapture: (
    kind: "task" | "event" | "cost" | "income" | "document" | "journal",
  ) => void;
  onPlanTask: (taskId: string) => Promise<boolean>;
  onSave: (input: DiarySaveInput) => string;
  onAnalyze: (journalId: string, input: DiarySaveInput) => Promise<string>;
  onGapAction: (
    gapId: string,
    action: "reopen" | "snooze" | "resolve",
    note?: string,
  ) => Promise<void>;
  onTopicUpdate: (
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
  ) => Promise<void>;
  onDecision: (topic: OpenTopic, decision: string) => Promise<void>;
  onUpdateApplication: (application: ApplicationProcess) => void;
};

export function DiaryView({
  state,
  externalEvents,
  tasksConnected,
  taskActionId,
  planningReport,
  onCompleteTask,
  onCreateApplication,
  onOpenCapture,
  onPlanTask,
  onSave,
  onAnalyze,
  onGapAction,
  onTopicUpdate,
  onDecision,
  onUpdateApplication,
}: DiaryViewProps) {
  const today = isoDateInput();
  const todayEntry = state.journal.find((entry) => entry.date === today);
  const [text, setText] = useState(todayEntry?.text ?? "");
  const [win, setWin] = useState(todayEntry?.win ?? "");
  const [nextStep, setNextStep] = useState(todayEntry?.nextStep ?? "");
  const [weekPlan, setWeekPlan] = useState(todayEntry?.weekPlan ?? "");
  const [mood, setMood] = useState(todayEntry?.mood ?? 3);
  const [reviewedAreas, setReviewedAreas] = useState<DiaryReviewArea[]>(
    todayEntry?.reviewedAreas ?? [],
  );
  const [plannedTaskId, setPlannedTaskId] = useState(
    todayEntry?.plannedTaskId ?? "",
  );
  const [linkedApplicationIds, setLinkedApplicationIds] = useState<string[]>(
    todayEntry?.linkedApplicationIds ?? [],
  );
  const [selectedApplicationId, setSelectedApplicationId] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitStatus, setSubmitStatus] = useState("");
  const [textEdited, setTextEdited] = useState(false);
  const [winEdited, setWinEdited] = useState(false);
  const [nextStepEdited, setNextStepEdited] = useState(false);
  const [moodEdited, setMoodEdited] = useState(false);
  const [gapReason, setGapReason] = useState("");

  const currentText = textEdited ? text : (todayEntry?.text ?? text);
  const currentWin = winEdited ? win : (todayEntry?.win ?? win);
  const currentNextStep = nextStepEdited
    ? nextStep
    : (todayEntry?.nextStep ?? nextStep);
  const currentMood = moodEdited ? mood : (todayEntry?.mood ?? mood);

  const openTasks = state.tasks.filter((task) => !task.completed);
  const dueTasks = openTasks
    .filter((task) => task.dueAt && dayDistance(task.dueAt) <= 0)
    .sort((left, right) =>
      (left.dueAt ?? "9999").localeCompare(right.dueAt ?? "9999"),
    );
  const tomorrowTasks = openTasks.filter((task) =>
    withinDays(task.dueAt, 1, 1),
  );
  const weekTasks = openTasks.filter((task) => withinDays(task.dueAt, 1, 7));
  const events = [...externalEvents, ...state.calendarEvents];
  const todayEvents = events.filter((event) => withinDays(event.startAt, 0, 0));
  const tomorrowEvents = events.filter((event) =>
    withinDays(event.startAt, 1, 1),
  );
  const weekEvents = events.filter((event) => withinDays(event.startAt, 1, 7));
  const activeApplications = state.applications.filter((application) =>
    ACTIVE_APPLICATION_STATUSES.has(application.status),
  );
  const upcomingApplicationSteps = state.applications.filter(
    (application) =>
      withinDays(application.nextStepAt, 0, 7) &&
      !["rejected", "withdrawn", "closed"].includes(application.status),
  );
  const tomorrowApplicationSteps = upcomingApplicationSteps.filter(
    (application) => withinDays(application.nextStepAt, 1, 1),
  );
  const dueCosts = state.costs.filter(
    (cost) => cost.status !== "paid" && dayDistance(cost.dueAt) <= 0,
  );
  const weekCosts = state.costs.filter(
    (cost) => cost.status !== "paid" && withinDays(cost.dueAt, 1, 7),
  );
  const documentsToReview = state.documents.filter((document) => {
    const tagged = document.tags.some(
      (tag) => tag.trim().toLocaleLowerCase("de-DE") === "prüfen",
    );
    return tagged || withinDays(document.reviewAt, 0, 7);
  });

  const applicationOptions = useMemo(
    () =>
      [...state.applications].sort((left, right) => {
        const priority = (application: ApplicationProcess) =>
          ACTIVE_APPLICATION_STATUSES.has(application.status)
            ? 0
            : application.shortlisted
              ? 1
              : 2;
        return (
          priority(left) - priority(right) ||
          (left.researchRank ?? 999).toString().localeCompare(
            (right.researchRank ?? 999).toString(),
            "de",
            { numeric: true },
          )
        );
      }),
    [state.applications],
  );
  const selectedApplication = applicationOptions.find(
    (application) => application.id === selectedApplicationId,
  );
  const reviewComplete = DIARY_REVIEW_AREAS.every((area) =>
    reviewedAreas.includes(area),
  );
  const criticalGaps = (planningReport?.gaps || []).filter(
    (gap) => gap.status === "open" && gap.severity === "critical",
  );
  const openTopics = planningReport?.openTopics.filter(
    (topic) => topic.status !== "resolved",
  ) || [];
  const plannedTask = openTasks.find((task) => task.id === plannedTaskId);

  const attentionByArea: Record<DiaryReviewArea, string> = {
    tasks: dueTasks.length
      ? `${dueTasks.length} bis heute offen`
      : `${openTasks.length} insgesamt offen`,
    calendar: todayEvents.length
      ? `${todayEvents.length} Termin${todayEvents.length === 1 ? "" : "e"} heute`
      : planningReport?.days[0]?.state === "intentionally_free"
        ? "Heute ausdrücklich frei bestätigt"
        : "Heute ungeplant – dringende Kalenderlücke",
    applications: upcomingApplicationSteps.length
      ? `${upcomingApplicationSteps.length} nächste Schritte in 7 Tagen`
      : `${activeApplications.length} aktive Prozesse`,
    finance: dueCosts.length
      ? `${dueCosts.length} fällige Zahlung${dueCosts.length === 1 ? "" : "en"}`
      : "Keine fällige Zahlung",
    documents: documentsToReview.length
      ? `${documentsToReview.length} Unterlagen zu prüfen`
      : "Keine Unterlage zur Prüfung markiert",
  };

  const markReviewed = (area: DiaryReviewArea) => {
    setReviewedAreas((current) =>
      current.includes(area)
        ? current.filter((candidate) => candidate !== area)
        : [...current, area],
    );
  };

  const openCaptureFor = (
    kind: "task" | "event" | "cost" | "income" | "document" | "journal",
    area?: DiaryReviewArea,
  ) => {
    if (area && !reviewedAreas.includes(area)) {
      setReviewedAreas((current) => [...current, area]);
    }
    onOpenCapture(kind);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitStatus("");
    if (!reviewComplete) {
      setSubmitStatus(
        "Bitte bestätige kurz alle fünf Bereiche oder wähle „Alles geprüft“.",
      );
      return;
    }
    if (criticalGaps.length) {
      setSubmitStatus(
        "Der Tagesabschluss bleibt offen: Kritische Planungslücken müssen zuerst gelöst oder mit Begründung zurückgestellt werden.",
      );
      return;
    }
    setSaving(true);
    let taskPlanned = true;
    if (plannedTaskId) {
      taskPlanned = tasksConnected && (await onPlanTask(plannedTaskId));
    }
    const saveInput: DiarySaveInput = {
      text: currentText.trim(),
      mood: currentMood,
      win: currentWin.trim(),
      nextStep: currentNextStep.trim() || plannedTask?.title || "",
      weekPlan: weekPlan.trim(),
      reviewedAreas,
      closeDay: true,
      plannedTaskId: plannedTaskId || null,
      linkedApplicationIds,
      snapshot: {
        openTasks: openTasks.length,
        overdueTasks: dueTasks.length,
        tomorrowTasks: tomorrowTasks.length,
        tomorrowEvents: tomorrowEvents.length,
        weekEvents: weekEvents.length,
        activeApplications: activeApplications.length,
        upcomingApplicationSteps: upcomingApplicationSteps.length,
        dueCosts: dueCosts.length,
        documentsToReview: documentsToReview.length,
      },
    };
    const journalId = onSave(saveInput);
    setSubmitStatus("Tagesabschluss gespeichert. Offene Themen werden analysiert …");
    const analysisStatus = await onAnalyze(journalId, saveInput);
    setSaving(false);
    setSubmitStatus(
      plannedTaskId && !taskPlanned
        ? `Tagesabschluss gespeichert. Die Fokusaufgabe konnte nicht in Google Tasks verschoben werden. ${analysisStatus}`
        : `Tagesabschluss gespeichert. ${analysisStatus}`,
    );
  };

  return (
    <div className="view-stack diary-view">
      <header className="page-intro diary-intro">
        <div>
          <span className="eyebrow">
            {todayEntry?.closedAt ? "Heute bereits abgeschlossen" : "3–5 Minuten am Abend"}
          </span>
          <h1 tabIndex={-1}>Tagebuch: Heute abschließen, morgen klar beginnen.</h1>
          <p>
            Halte kurz fest, was passiert ist, gleiche Änderungen direkt mit dem
            Kompass ab und richte danach den Blick auf morgen und die nächsten
            sieben Tage.
          </p>
        </div>
        <div className="page-intro-action">
          <button
            className="button button-soft"
            onClick={() => onOpenCapture("journal")}
            type="button"
          >
            Nur eine Notiz erfassen
          </button>
        </div>
      </header>

      <section className="panel diary-open-topics" aria-labelledby="diary-open-topics-title">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Entscheidungszentrale</span>
            <h2 id="diary-open-topics-title">Alle aktuell offenen Themen</h2>
          </div>
          <span className="diary-topic-total">{openTopics.length} offen</span>
        </div>
        <p>
          KI-Vorschläge verändern nichts direkt. Belegstelle, Konfidenz, Zeitpunkt
          und – bei Kalenderbedarf – Privat oder Fachkalender werden zuerst von dir bestätigt.
        </p>
        <div className="diary-topic-groups">
          {(Object.keys(TOPIC_GROUP_LABELS) as OpenTopicGroup[]).map((group) => {
            const topics = openTopics.filter((topic) => topic.group === group);
            return (
              <section key={group}>
                <header>
                  <strong>{TOPIC_GROUP_LABELS[group]}</strong>
                  <span>{topics.length}</span>
                </header>
                {topics.length ? (
                  <div>
                    {topics.map((topic) => (
                      <article key={topic.id}>
                        <div>
                          <strong>{topic.title}</strong>
                          {topic.detail ? <p>{topic.detail}</p> : null}
                          {topic.evidence ? (
                            <blockquote>Beleg: „{topic.evidence}“</blockquote>
                          ) : null}
                          <small>
                            {topic.confidence === null
                              ? "Deterministische Lücke"
                              : `${Math.round(topic.confidence * 100)} % Konfidenz`}
                            {topic.dueAt ? ` · ${formatRelativeDate(topic.dueAt)}` : " · Zeitpunkt offen"}
                          </small>
                        </div>
                        {topic.requiresCalendarTarget ? (
                          <div className="diary-topic-calendar-choice">
                            <label>
                              Ziel vor Bestätigung
                              <select
                                onChange={(event) =>
                                  void onTopicUpdate(topic.id, {
                                    calendarTarget:
                                      event.target.value === "private"
                                        ? "private"
                                        : event.target.value === "specialist"
                                          ? "specialist"
                                          : null,
                                  })
                                }
                                value={topic.calendarTarget || ""}
                              >
                                <option value="">Privat oder Fachkalender wählen</option>
                                <option value="private">Privat</option>
                                <option value="specialist">Fachkalender</option>
                              </select>
                            </label>
                            <label>
                              Zeitpunkt bestätigen
                              <input
                                defaultValue={topic.dueAt?.slice(0, 16) || ""}
                                onBlur={(event) => {
                                  if (!event.target.value) return;
                                  const dueAt = new Date(event.target.value);
                                  if (!Number.isNaN(dueAt.getTime())) {
                                    void onTopicUpdate(topic.id, {
                                      dueAt: dueAt.toISOString(),
                                    });
                                  }
                                }}
                                type="datetime-local"
                              />
                            </label>
                          </div>
                        ) : null}
                        <div className="diary-topic-actions">
                          {group === "decision" ? (
                            <button
                              className="button button-primary"
                              disabled={
                                topic.requiresCalendarTarget &&
                                (!topic.calendarTarget || !topic.dueAt)
                              }
                              onClick={() => {
                                const decision = window.prompt(
                                  `Entscheidung zu „${topic.title}“ dokumentieren:`,
                                  topic.nextStep || "",
                                );
                                if (decision?.trim()) {
                                  void onDecision(topic, decision.trim());
                                }
                              }}
                              type="button"
                            >
                              Entscheidung dokumentieren
                            </button>
                          ) : (
                            <button
                              className="button button-soft"
                              onClick={() =>
                                void onTopicUpdate(topic.id, { status: "resolved" })
                              }
                              type="button"
                            >
                              Erledigt
                            </button>
                          )}
                          <button
                            className="button button-ghost"
                            onClick={() =>
                              void onTopicUpdate(topic.id, {
                                status: "snoozed",
                                snoozedUntil: new Date(
                                  Date.now() + 24 * 60 * 60 * 1_000,
                                ).toISOString(),
                              })
                            }
                            type="button"
                          >
                            Bis morgen warten
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p>Aktuell kein Thema in dieser Gruppe.</p>
                )}
              </section>
            );
          })}
        </div>
      </section>

      {criticalGaps.length ? (
        <section className="panel diary-critical-gaps" aria-labelledby="diary-critical-title">
          <div>
            <span className="eyebrow">Dringend & wichtig</span>
            <h2 id="diary-critical-title">{criticalGaps.length} kritische Punkte verhindern „Alles geprüft“</h2>
            <p>
              Löse die Quelle oder dokumentiere, warum der Punkt bis morgen vertretbar zurückgestellt wird.
            </p>
          </div>
          <label>
            Begründung für eine Zurückstellung
            <input
              onChange={(event) => setGapReason(event.target.value)}
              placeholder="Warum ist die Zurückstellung vertretbar?"
              value={gapReason}
            />
          </label>
          <div className="diary-critical-list">
            {criticalGaps.slice(0, 8).map((gap) => (
              <article key={gap.id}>
                <div><strong>{gap.title}</strong><p>{gap.detail}</p></div>
                <div>
                  <button
                    className="button button-soft"
                    disabled={!gapReason.trim()}
                    onClick={() => void onGapAction(gap.id, "snooze", gapReason.trim())}
                    type="button"
                  >
                    Begründet bis morgen
                  </button>
                  <button
                    className="button button-ghost"
                    onClick={() =>
                      void onGapAction(
                        gap.id,
                        "resolve",
                        "Quelle wurde geprüft und korrigiert.",
                      )
                    }
                    type="button"
                  >
                    Quelle ist gelöst
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className="diary-close-layout">
        <form className="panel diary-close-form" onSubmit={submit}>
          <section className="diary-step" aria-labelledby="diary-step-reflection">
            <div className="diary-step-heading">
              <span>1</span>
              <div>
                <p className="eyebrow">Rückblick</p>
                <h2 id="diary-step-reflection">Was war heute?</h2>
              </div>
            </div>
            <fieldset className="mood-field compact">
              <legend>Stimmung – ein Klick genügt</legend>
              <div>
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    aria-label={`Stimmung ${value} von 5`}
                    aria-pressed={currentMood === value}
                    className={currentMood === value ? "active" : ""}
                    key={value}
                    onClick={() => {
                      setMood(value);
                      setMoodEdited(true);
                    }}
                    type="button"
                  >
                    {value}
                  </button>
                ))}
              </div>
            </fieldset>
            <label>
              Was ist heute passiert?
              <textarea
                onChange={(event) => {
                  setText(event.target.value);
                  setTextEdited(true);
                }}
                placeholder="Ein bis drei Stichpunkte reichen …"
                rows={3}
                value={currentText}
              />
            </label>
            <label>
              Was ist gelungen oder wichtig geworden?
              <input
                onChange={(event) => {
                  setWin(event.target.value);
                  setWinEdited(true);
                }}
                placeholder="Auch ein kleiner Schritt zählt."
                value={currentWin}
              />
            </label>
          </section>

          <section className="diary-step" aria-labelledby="diary-step-sync">
            <div className="diary-step-heading">
              <span>2</span>
              <div>
                <p className="eyebrow">Abgleich</p>
                <h2 id="diary-step-sync">Ist alles Neue im Kompass?</h2>
              </div>
            </div>
            <p className="diary-step-copy">
              Nutze die passende Schnellerfassung. So landet eine Änderung
              sofort im richtigen Bereich und nicht nur im Tagebuchtext.
            </p>
            <div className="diary-capture-grid" aria-label="Neues direkt einordnen">
              <button onClick={() => openCaptureFor("task", "tasks")} type="button">
                <span>A</span>Aufgabe
              </button>
              <button
                onClick={() => {
                  if (!reviewedAreas.includes("calendar")) {
                    setReviewedAreas((current) => [...current, "calendar"]);
                  }
                  onOpenCapture("event");
                }}
                type="button"
              >
                <span>K</span>Termin
              </button>
              <button
                onClick={() => {
                  const application = createEmptyApplication(
                    `application-${crypto.randomUUID()}`,
                  );
                  if (!reviewedAreas.includes("applications")) {
                    setReviewedAreas((current) => [...current, "applications"]);
                  }
                  onCreateApplication(application);
                  setSelectedApplicationId(application.id);
                  setSubmitStatus(
                    "Neue Bewerbungsakte angelegt – Unternehmen und Stelle bitte unten ergänzen.",
                  );
                }}
                type="button"
              >
                <span>B</span>Bewerbungsakte
              </button>
              <button onClick={() => openCaptureFor("cost", "finance")} type="button">
                <span>€</span>Ausgabe
              </button>
              <button onClick={() => openCaptureFor("income", "finance")} type="button">
                <span>+</span>Einnahme
              </button>
              <button
                onClick={() => openCaptureFor("document", "documents")}
                type="button"
              >
                <span>U</span>Unterlage
              </button>
            </div>

            {dueTasks.length ? (
              <div className="diary-attention-list">
                <div>
                  <strong>Aufgaben bis heute</strong>
                  <small>Direkt in Google Tasks abschließen</small>
                </div>
                {dueTasks.slice(0, 4).map((task) => (
                  <article key={task.id}>
                    <div>
                      <strong>{task.title}</strong>
                      <small>{task.dueAt ? formatRelativeDate(task.dueAt) : "Offen"}</small>
                    </div>
                    <button
                      disabled={!tasksConnected || Boolean(taskActionId)}
                      onClick={() => {
                        if (!reviewedAreas.includes("tasks")) {
                          setReviewedAreas((current) => [...current, "tasks"]);
                        }
                        void onCompleteTask(task.id);
                      }}
                      type="button"
                    >
                      Erledigt
                    </button>
                  </article>
                ))}
              </div>
            ) : null}

            <div className="diary-application-update">
              <label>
                Bewerbungsstand heute geändert?
                <select
                  onChange={(event) => setSelectedApplicationId(event.target.value)}
                  value={selectedApplicationId}
                >
                  <option value="">Keine oder Bewerbung auswählen</option>
                  {applicationOptions.map((application) => (
                    <option key={application.id} value={application.id}>
                      {application.company} · {application.jobTitle} ·{" "}
                      {APPLICATION_STATUS_LABELS[application.status]}
                    </option>
                  ))}
                </select>
              </label>
              {selectedApplication ? (
                <ApplicationDailyUpdate
                  application={selectedApplication}
                  key={selectedApplication.id}
                  onSave={(application) => {
                    onUpdateApplication(application);
                    setLinkedApplicationIds((current) =>
                      current.includes(application.id)
                        ? current
                        : [...current, application.id],
                    );
                    setReviewedAreas((current) =>
                      current.includes("applications")
                        ? current
                        : [...current, "applications"],
                    );
                  }}
                />
              ) : null}
            </div>

            <fieldset className="diary-review-checklist">
              <legend>Abschlusscheck</legend>
              <div>
                {DIARY_REVIEW_AREAS.map((area) => (
                  <label className={reviewedAreas.includes(area) ? "checked" : ""} key={area}>
                    <input
                      checked={reviewedAreas.includes(area)}
                      onChange={() => markReviewed(area)}
                      type="checkbox"
                    />
                    <span>
                      <strong>{REVIEW_LABELS[area].label}</strong>
                      <small>{attentionByArea[area]}</small>
                    </span>
                  </label>
                ))}
              </div>
              {!reviewComplete ? (
                <button
                  className="button button-soft diary-check-all"
                  disabled={criticalGaps.length > 0}
                  onClick={() => setReviewedAreas([...DIARY_REVIEW_AREAS])}
                  type="button"
                >
                  {criticalGaps.length
                    ? "Kritische Planungspunkte zuerst bearbeiten"
                    : "Alle Fachbereiche als geprüft markieren"}
                </button>
              ) : (
                <p className="diary-check-complete">Alle Bereiche sind geprüft.</p>
              )}
            </fieldset>
          </section>

          <section className="diary-step" aria-labelledby="diary-step-plan">
            <div className="diary-step-heading">
              <span>3</span>
              <div>
                <p className="eyebrow">Ausrichtung</p>
                <h2 id="diary-step-plan">Was zählt morgen und diese Woche?</h2>
              </div>
            </div>
            <label>
              Wichtigster Schritt morgen
              <input
                list="diary-next-step-suggestions"
                onChange={(event) => {
                  setNextStep(event.target.value);
                  setNextStepEdited(true);
                }}
                placeholder="Klein, konkret und machbar."
                value={currentNextStep}
              />
              <datalist id="diary-next-step-suggestions">
                {openTasks.slice(0, 12).map((task) => (
                  <option key={task.id} value={task.title} />
                ))}
                {upcomingApplicationSteps.slice(0, 8).map((application) => (
                  <option
                    key={application.id}
                    value={application.nextStep || `${application.company} nachfassen`}
                  />
                ))}
              </datalist>
            </label>
            <label>
              Vorhandene Aufgabe verbindlich auf morgen setzen
              <select
                disabled={!tasksConnected}
                onChange={(event) => {
                  const taskId = event.target.value;
                  setPlannedTaskId(taskId);
                  const task = openTasks.find((candidate) => candidate.id === taskId);
                  if (task && !currentNextStep.trim()) {
                    setNextStep(task.title);
                    setNextStepEdited(true);
                  }
                }}
                value={plannedTaskId}
              >
                <option value="">
                  {tasksConnected
                    ? "Optional – keine Aufgabe verschieben"
                    : "Google Tasks ist noch nicht verbunden"}
                </option>
                {openTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title} · {task.dueAt ? formatRelativeDate(task.dueAt) : "ohne Termin"}
                  </option>
                ))}
              </select>
              <small>
                {tasksConnected
                  ? "Die Auswahl wird beim Speichern direkt in Google Tasks auf morgen datiert."
                  : "Der wichtigste Schritt bleibt trotzdem im privaten Tagebuch gespeichert."}
              </small>
            </label>
            <label>
              Fokus für die nächsten sieben Tage
              <textarea
                onChange={(event) => setWeekPlan(event.target.value)}
                placeholder="Ein Schwerpunkt oder Ergebnis für die Woche …"
                rows={2}
                value={weekPlan}
              />
            </label>
          </section>

          {submitStatus ? (
            <p className="diary-submit-status" role="status">{submitStatus}</p>
          ) : null}
          <button className="button button-primary button-full" disabled={saving} type="submit">
            {saving
              ? "Tagesabschluss wird gespeichert …"
              : todayEntry?.closedAt
                ? "Tagesabschluss aktualisieren"
                : "Tag abschließen"}
          </button>
          <p className="diary-privacy-note">
            Der Tagebuchtext und der Abgleich bleiben im privaten Kompass. Nur
            ausdrücklich gewählte Aufgaben und Termine werden an Google übergeben.
          </p>
        </form>

        <aside className="diary-outlook" aria-label="Planungsgrundlage">
          <section className="panel">
            <span className="eyebrow">Morgen</span>
            <h2>Der nächste Tag auf einen Blick</h2>
            <dl className="diary-outlook-grid">
              <div><dt>Aufgaben</dt><dd>{tomorrowTasks.length}</dd></div>
              <div><dt>Termine</dt><dd>{tomorrowEvents.length}</dd></div>
              <div><dt>Bewerbungen</dt><dd>{tomorrowApplicationSteps.length}</dd></div>
              <div><dt>Zahlungen</dt><dd>{weekCosts.filter((cost) => withinDays(cost.dueAt, 1, 1)).length}</dd></div>
            </dl>
          </section>
          <section className="panel">
            <span className="eyebrow">Nächste 7 Tage</span>
            <h2>Deine Planungsgrundlage</h2>
            <ul className="diary-week-list">
              <li><strong>{weekTasks.length}</strong><span>datierte Aufgaben</span></li>
              <li><strong>{weekEvents.length}</strong><span>Termine und Fokuszeiten</span></li>
              <li><strong>{upcomingApplicationSteps.length}</strong><span>Bewerbungsschritte</span></li>
              <li><strong>{weekCosts.length}</strong><span>anstehende Zahlungen</span></li>
            </ul>
            <p>
              Neue Punkte kannst du links direkt erfassen. Vorhandene Einträge
              bleiben in ihren Fachbereichen die führende Quelle.
            </p>
          </section>
        </aside>
      </div>

      <section className="panel diary-history">
        <div className="panel-heading">
          <div><span className="eyebrow">Verlauf</span><h2>{state.journal.length} Tagebucheinträge</h2></div>
        </div>
        <div className="diary-history-grid">
          {state.journal.map((entry) => {
            const linkedApplications = state.applications.filter((application) =>
              entry.linkedApplicationIds?.includes(application.id),
            );
            return (
              <article key={entry.id}>
                <header>
                  <div><time dateTime={entry.date}>{formatDate(entry.date)}</time><span>Stimmung {entry.mood}/5</span></div>
                  {entry.closedAt ? <strong>Tagesabschluss</strong> : <strong>Notiz</strong>}
                </header>
                {entry.text ? <p>{entry.text}</p> : null}
                {entry.win ? <blockquote><strong>Gelungen:</strong> {entry.win}</blockquote> : null}
                {entry.nextStep ? <small><strong>Morgen:</strong> {entry.nextStep}</small> : null}
                {entry.weekPlan ? <small><strong>7-Tage-Fokus:</strong> {entry.weekPlan}</small> : null}
                {linkedApplications.length ? (
                  <small><strong>Bewerbungen aktualisiert:</strong> {linkedApplications.map((application) => application.company).join(", ")}</small>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ApplicationDailyUpdate({
  application,
  onSave,
}: {
  application: ApplicationProcess;
  onSave: (application: ApplicationProcess) => void;
}) {
  const [status, setStatus] = useState(application.status);
  const [company, setCompany] = useState(application.company);
  const [jobTitle, setJobTitle] = useState(application.jobTitle);
  const [sourceUrl, setSourceUrl] = useState(application.sourceUrl);
  const [nextStep, setNextStep] = useState(application.nextStep);
  const [nextStepAt, setNextStepAt] = useState(application.nextStepAt ?? "");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);

  const update = () => {
    const datedNote = note.trim()
      ? `${isoDateInput()} · ${note.trim()}`
      : "";
    onSave({
      ...application,
      company: company.trim(),
      jobTitle: jobTitle.trim() || "Neue Bewerbung",
      sourceUrl: sourceUrl.trim(),
      status,
      appliedAt:
        APPLIED_APPLICATION_STATUSES.has(status) && !application.appliedAt
          ? isoDateInput()
          : application.appliedAt,
      nextStep: nextStep.trim(),
      nextStepAt: nextStepAt || null,
      notes: [application.notes.trim(), datedNote].filter(Boolean).join("\n\n"),
    });
    setSaved(true);
  };

  return (
    <div className="diary-application-fields">
      {application.researchTier === "own" ? (
        <>
          <div className="form-grid">
            <label>
              Unternehmen
              <input
                onChange={(event) => setCompany(event.target.value)}
                placeholder="Name des Unternehmens"
                value={company}
              />
            </label>
            <label>
              Stelle
              <input
                onChange={(event) => setJobTitle(event.target.value)}
                placeholder="Stellenbezeichnung"
                value={jobTitle}
              />
            </label>
          </div>
          <label>
            Link zur Ausschreibung
            <input
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="Optional"
              type="url"
              value={sourceUrl}
            />
          </label>
        </>
      ) : null}
      <div className="form-grid">
        <label>
          Neuer Status
          <select
            onChange={(event) => setStatus(event.target.value as ApplicationStatus)}
            value={status}
          >
            {(Object.keys(APPLICATION_STATUS_LABELS) as ApplicationStatus[]).map((value) => (
              <option key={value} value={value}>{APPLICATION_STATUS_LABELS[value]}</option>
            ))}
          </select>
        </label>
        <label>
          Nächster Schritt am
          <input onChange={(event) => setNextStepAt(event.target.value)} type="date" value={nextStepAt} />
        </label>
      </div>
      <label>
        Nächster Schritt
        <input onChange={(event) => setNextStep(event.target.value)} value={nextStep} />
      </label>
      <label>
        Heutige Rückmeldung oder Änderung
        <textarea
          onChange={(event) => setNote(event.target.value)}
          placeholder="z. B. Einladung erhalten, Unterlagen versendet, Konditionen geklärt"
          rows={2}
          value={note}
        />
      </label>
      <div className="diary-application-actions">
        <button
          className="button button-soft"
          disabled={saved || !company.trim()}
          onClick={update}
          type="button"
        >
          Bewerbungsakte aktualisieren
        </button>
        {saved ? <span role="status">In Bewerbungen übernommen</span> : null}
      </div>
    </div>
  );
}
