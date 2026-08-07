"use client";

import {
  useMemo,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";

import { DIARY_REVIEW_AREAS } from "../lib/diary";
import {
  addDiaryDays,
  buildDiaryPlanningSuggestions,
  isSundayDate,
  type DiaryPlanningSuggestion,
} from "../lib/diary-planning";
import {
  formatDate,
  formatRelativeDate,
  isoDateInput,
} from "../lib/format";
import type {
  AppState,
  CalendarEvent,
  DiarySaveInput,
  PlanningHealthReport,
} from "../lib/types";

type DiaryViewProps = {
  state: AppState;
  externalEvents: CalendarEvent[];
  tasksConnected: boolean;
  taskActionId: string;
  planningReport: PlanningHealthReport | null;
  onSave: (input: DiarySaveInput) => string;
  onAnalyze: (journalId: string, input: DiarySaveInput) => Promise<string>;
  onScheduleSuggestion: (
    suggestion: DiaryPlanningSuggestion,
    date: string,
  ) => Promise<boolean>;
};

const PRIORITY_LABELS: Record<DiaryPlanningSuggestion["priority"], string> = {
  critical: "Dringend & wichtig",
  important: "Wichtig",
  normal: "Offen",
};

const SOURCE_LABELS: Record<DiaryPlanningSuggestion["sourceKind"], string> = {
  task: "Aufgabe",
  gap: "Planungshinweis",
  topic: "Offenes Thema",
  custom: "Eigener Punkt",
};

const onDate = (value: string | null | undefined, date: string): boolean =>
  Boolean(value && isoDateInput(value) === date);

const planDateLabel = (date: string, long = false): string =>
  new Intl.DateTimeFormat("de-DE", {
    timeZone: "UTC",
    weekday: long ? "long" : "short",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${date}T12:00:00.000Z`));

export function DiaryView({
  state,
  externalEvents,
  tasksConnected,
  taskActionId,
  planningReport,
  onSave,
  onAnalyze,
  onScheduleSuggestion,
}: DiaryViewProps) {
  const today = isoDateInput();
  const tomorrow = addDiaryDays(today, 1);
  const planningDates = Array.from({ length: 7 }, (_, index) =>
    addDiaryDays(today, index + 1),
  );
  const todayEntry = state.journal.find((entry) => entry.date === today);
  const [text, setText] = useState(todayEntry?.text ?? "");
  const [win, setWin] = useState(todayEntry?.win ?? "");
  const [nextStep, setNextStep] = useState(todayEntry?.nextStep ?? "");
  const [weekPlan, setWeekPlan] = useState(todayEntry?.weekPlan ?? "");
  const [mood, setMood] = useState(todayEntry?.mood ?? 3);
  const [textEdited, setTextEdited] = useState(false);
  const [winEdited, setWinEdited] = useState(false);
  const [nextStepEdited, setNextStepEdited] = useState(false);
  const [moodEdited, setMoodEdited] = useState(false);
  const [planningOpen, setPlanningOpen] = useState(Boolean(todayEntry));
  const [savingJournal, setSavingJournal] = useState(false);
  const [closingDay, setClosingDay] = useState(false);
  const [schedulingId, setSchedulingId] = useState("");
  const [draggedSuggestionId, setDraggedSuggestionId] = useState("");
  const [activeDropDate, setActiveDropDate] = useState("");
  const [scheduledSuggestionIds, setScheduledSuggestionIds] = useState<
    string[]
  >([]);
  const [customTaskTitle, setCustomTaskTitle] = useState("");
  const [submitStatus, setSubmitStatus] = useState("");

  const currentText = textEdited ? text : (todayEntry?.text ?? text);
  const currentWin = winEdited ? win : (todayEntry?.win ?? win);
  const currentNextStep = nextStepEdited
    ? nextStep
    : (todayEntry?.nextStep ?? nextStep);
  const currentMood = moodEdited ? mood : (todayEntry?.mood ?? mood);
  const openTasks = state.tasks.filter((task) => !task.completed);
  const events = [...externalEvents, ...state.calendarEvents];
  const tomorrowTasks = openTasks.filter((task) => onDate(task.dueAt, tomorrow));
  const tomorrowEvents = events.filter((event) => onDate(event.startAt, tomorrow));
  const tomorrowApplications = state.applications.filter(
    (application) =>
      onDate(application.nextStepAt, tomorrow) &&
      !["rejected", "withdrawn", "closed"].includes(application.status),
  );
  const tomorrowCosts = state.costs.filter(
    (cost) => cost.status !== "paid" && onDate(cost.dueAt, tomorrow),
  );
  const weekTasks = openTasks.filter((task) =>
    planningDates.some((date) => onDate(task.dueAt, date)),
  );
  const weekEvents = events.filter((event) =>
    planningDates.some((date) => onDate(event.startAt, date)),
  );
  const weekApplications = state.applications.filter(
    (application) =>
      planningDates.some((date) => onDate(application.nextStepAt, date)) &&
      !["rejected", "withdrawn", "closed"].includes(application.status),
  );

  const suggestions = useMemo(
    () =>
      buildDiaryPlanningSuggestions({
        tasks: state.tasks,
        report: planningReport,
      }),
    [planningReport, state.tasks],
  ).filter(
    (suggestion) =>
      !scheduledSuggestionIds.includes(suggestion.id) &&
      !(
        suggestion.sourceKind === "task" &&
        tomorrowTasks.some((task) => task.id === suggestion.sourceId)
      ),
  );

  const suggestionGroups = [
    {
      key: "priority",
      label: "Dringend oder wichtig",
      description: "Prioritäten aus Aufgaben und Planungshinweisen",
      items: suggestions.filter((suggestion) => suggestion.priority !== "normal"),
    },
    {
      key: "snoozed",
      label: "Zurückgestellt",
      description: "Bewusst vertagte Themen als Erinnerung",
      items: suggestions.filter(
        (suggestion) =>
          suggestion.priority === "normal" && suggestion.status === "snoozed",
      ),
    },
    {
      key: "open",
      label: "Noch offen",
      description: "Weitere mögliche Anknüpfungspunkte",
      items: suggestions.filter(
        (suggestion) =>
          suggestion.priority === "normal" && suggestion.status === "open",
      ),
    },
  ];

  const snapshot = () => ({
    openTasks: openTasks.length,
    overdueTasks: openTasks.filter(
      (task) => task.dueAt && isoDateInput(task.dueAt) < today,
    ).length,
    tomorrowTasks: tomorrowTasks.length,
    tomorrowEvents: tomorrowEvents.length,
    weekEvents: weekEvents.length,
    activeApplications: state.applications.filter((application) =>
      ["draft", "submitted", "interview", "offer"].includes(application.status),
    ).length,
    upcomingApplicationSteps: weekApplications.length,
    dueCosts: state.costs.filter(
      (cost) => cost.status !== "paid" && isoDateInput(cost.dueAt) <= today,
    ).length,
    documentsToReview: state.documents.filter(
      (document) =>
        document.tags.some(
          (tag) => tag.trim().toLocaleLowerCase("de-DE") === "prüfen",
        ) ||
        planningDates.some((date) => onDate(document.reviewAt, date)),
    ).length,
  });

  const saveInput = (closeDay: boolean): DiarySaveInput => ({
    text: currentText.trim(),
    mood: currentMood,
    win: currentWin.trim(),
    nextStep: currentNextStep.trim(),
    weekPlan: weekPlan.trim(),
    reviewedAreas: closeDay
      ? [...DIARY_REVIEW_AREAS]
      : (todayEntry?.reviewedAreas ?? []),
    closeDay,
    plannedTaskId: todayEntry?.plannedTaskId ?? null,
    linkedApplicationIds: todayEntry?.linkedApplicationIds ?? [],
    snapshot: snapshot(),
  });

  const saveJournal = (event: FormEvent) => {
    event.preventDefault();
    setSavingJournal(true);
    setSubmitStatus("");
    const input = saveInput(false);
    const journalId = onSave(input);
    setPlanningOpen(true);
    setSavingJournal(false);
    setSubmitStatus(
      "Tagebuch gespeichert. Du kannst jetzt in Ruhe den Plan für morgen prüfen.",
    );

    if ([input.text, input.win, input.nextStep, input.weekPlan].some(Boolean)) {
      void onAnalyze(journalId, input).then((analysisStatus) => {
        setSubmitStatus(`Tagebuch gespeichert. ${analysisStatus}`);
      });
    }
  };

  const scheduleSuggestion = async (
    suggestion: DiaryPlanningSuggestion,
    date: string,
  ): Promise<boolean> => {
    if (!tasksConnected) {
      setSubmitStatus(
        "Google Tasks ist nicht verbunden. Das Tagebuch und der Tagesabschluss bleiben trotzdem uneingeschränkt nutzbar.",
      );
      return false;
    }
    if (schedulingId || taskActionId) return false;
    setSchedulingId(suggestion.id);
    setSubmitStatus("");
    let scheduled = false;
    try {
      scheduled = await onScheduleSuggestion(suggestion, date);
    } catch {
      setSubmitStatus(
        `„${suggestion.title}“ konnte nicht eingeplant werden. Deine Eingabe bleibt erhalten.`,
      );
      return false;
    } finally {
      setSchedulingId("");
    }
    if (!scheduled) {
      setSubmitStatus(
        `„${suggestion.title}“ konnte nicht eingeplant werden. Der Tagesabschluss bleibt weiterhin möglich.`,
      );
      return false;
    }
    setScheduledSuggestionIds((current) => [...current, suggestion.id]);
    if (date === tomorrow && !currentNextStep.trim()) {
      setNextStep(suggestion.title);
      setNextStepEdited(true);
    }
    setSubmitStatus(
      `„${suggestion.title}“ ist für ${
        date === tomorrow ? "morgen" : planDateLabel(date, true)
      } eingeplant.`,
    );
    return true;
  };

  const dropOnDate = (event: DragEvent<HTMLElement>, date: string) => {
    event.preventDefault();
    const suggestionId =
      event.dataTransfer.getData("application/x-gerris-plan") ||
      draggedSuggestionId;
    const suggestion = suggestions.find((candidate) => candidate.id === suggestionId);
    setActiveDropDate("");
    setDraggedSuggestionId("");
    if (suggestion) void scheduleSuggestion(suggestion, date);
  };

  const addCustomTask = (event: FormEvent) => {
    event.preventDefault();
    const title = customTaskTitle.trim();
    if (!title) return;
    const sourceId = crypto.randomUUID();
    void scheduleSuggestion(
      {
        id: `custom:${sourceId}`,
        sourceKind: "custom",
        sourceId,
        title,
        detail: "Direkt bei der Abendplanung ergänzt",
        status: "open",
        priority: "normal",
        dueAt: null,
      },
      tomorrow,
    ).then((scheduled) => {
      if (scheduled) setCustomTaskTitle("");
    });
  };

  const closeDay = async () => {
    setClosingDay(true);
    onSave(saveInput(true));
    setClosingDay(false);
    setSubmitStatus(
      isSundayDate(today)
        ? "Tag abgeschlossen. Der grobe Blick auf die kommende Woche ist im Tagebuch festgehalten."
        : "Tag abgeschlossen. Der Plan für morgen bleibt jederzeit anpassbar.",
    );
  };

  return (
    <div className="view-stack diary-view">
      <header className="page-intro diary-intro">
        <div>
          <span className="eyebrow">
            {todayEntry?.closedAt ? "Heute abgeschlossen" : "Ohne Pflichtfelder"}
          </span>
          <h1 tabIndex={-1}>Tagesabschluss</h1>
          <p>Halte fest, was bleibt, und richte morgen kurz aus.</p>
        </div>
      </header>

      <form className="panel diary-journal-form" onSubmit={saveJournal}>
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Rückblick</span>
            <h2>Was bleibt von heute?</h2>
          </div>
          <span className="diary-save-freedom">Jederzeit speichern</span>
        </div>
        <fieldset className="mood-field compact">
          <legend>Stimmung – optional ein Klick</legend>
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
            placeholder="Ein Gedanke, ein Satz oder ein paar Stichpunkte – alles ist genug."
            rows={4}
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
            placeholder="Optional – auch ein kleiner Schritt zählt."
            value={currentWin}
          />
        </label>
        <button
          className="button button-primary button-full"
          disabled={savingJournal}
          type="submit"
        >
          {savingJournal
            ? "Tagebuch wird gespeichert …"
            : planningOpen
              ? "Tagebuch aktualisieren"
              : "Tagebuch speichern & morgen planen"}
        </button>
        <p className="diary-privacy-note">Keine Pflichtfelder.</p>
      </form>

      {planningOpen ? (
        <section className="panel diary-planning-board" id="planung-morgen">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Morgen</span>
              <h2>Kurz prüfen</h2>
            </div>
            <span className="diary-plan-date">{planDateLabel(tomorrow, true)}</span>
          </div>
          <p className="diary-planning-copy">Plane nur, was dir morgen wirklich hilft.</p>

          <div className="diary-planning-workspace">
            <section className="diary-tomorrow-plan" aria-labelledby="tomorrow-plan-title">
              <header>
                <div>
                  <span className="eyebrow">Plan</span>
                  <h3 id="tomorrow-plan-title">Bereits vorgesehen</h3>
                </div>
                <div className="diary-plan-counts" aria-label="Planumfang morgen">
                  <span>{tomorrowTasks.length} Aufgaben</span>
                  <span>{tomorrowEvents.length} Termine</span>
                </div>
              </header>
              <div className="diary-tomorrow-items">
                {tomorrowTasks.slice(0, 6).map((task) => (
                  <article key={task.id}>
                    <span>A</span>
                    <div>
                      <strong>{task.title}</strong>
                      <small>{task.estimateMinutes} Min. · {PRIORITY_LABELS[
                        task.quadrant === "do"
                          ? "critical"
                          : task.quadrant === "plan"
                            ? "important"
                            : "normal"
                      ]}</small>
                    </div>
                  </article>
                ))}
                {tomorrowEvents.slice(0, 4).map((event) => (
                  <article key={event.id}>
                    <span>K</span>
                    <div>
                      <strong>{event.title}</strong>
                      <small>Kalendertermin</small>
                    </div>
                  </article>
                ))}
                {tomorrowApplications.slice(0, 3).map((application) => (
                  <article key={application.id}>
                    <span>B</span>
                    <div>
                      <strong>{application.nextStep || application.jobTitle}</strong>
                      <small>{application.company}</small>
                    </div>
                  </article>
                ))}
                {!tomorrowTasks.length &&
                !tomorrowEvents.length &&
                !tomorrowApplications.length ? (
                  <p className="diary-plan-empty">
                    Noch nichts fest eingeplant.
                  </p>
                ) : null}
              </div>

              <div
                className={`diary-plan-dropzone ${
                  activeDropDate === tomorrow ? "is-active" : ""
                }`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setActiveDropDate(tomorrow);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                    setActiveDropDate("");
                  }
                }}
                onDrop={(event) => dropOnDate(event, tomorrow)}
              >
                <strong>Hier in den Plan für morgen ziehen</strong>
                <small>Oder bei einer Inspirationskarte „Morgen“ wählen.</small>
              </div>

              <form className="diary-custom-task" onSubmit={addCustomTask}>
                <label htmlFor="diary-custom-task">Eigenen Punkt ergänzen</label>
                <div>
                  <input
                    id="diary-custom-task"
                    onChange={(event) => setCustomTaskTitle(event.target.value)}
                    placeholder="Kleine Aufgabe für morgen …"
                    value={customTaskTitle}
                  />
                  <button
                    className="button button-soft"
                    disabled={!customTaskTitle.trim() || !tasksConnected}
                    type="submit"
                  >
                    Hinzufügen
                  </button>
                </div>
              </form>
            </section>

            <section className="diary-inspiration" aria-labelledby="diary-inspiration-title">
              <header>
                <div>
                  <span className="eyebrow">Inspiration</span>
                  <h3 id="diary-inspiration-title">Mögliche Themen</h3>
                </div>
                <span>{suggestions.length}</span>
              </header>
              {suggestionGroups.map((group) => (
                <details key={group.key} open={group.key === "priority"}>
                  <summary>
                    <span>
                      <strong>{group.label}</strong>
                      <small>{group.description}</small>
                    </span>
                    <b>{group.items.length}</b>
                  </summary>
                  <div className="diary-suggestion-list">
                    {group.items.slice(0, 7).map((suggestion) => (
                      <article
                        className={`diary-suggestion-card priority-${suggestion.priority}`}
                        draggable={tasksConnected && !Boolean(schedulingId || taskActionId)}
                        key={suggestion.id}
                        onDragEnd={() => {
                          setDraggedSuggestionId("");
                          setActiveDropDate("");
                        }}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData(
                            "application/x-gerris-plan",
                            suggestion.id,
                          );
                          setDraggedSuggestionId(suggestion.id);
                        }}
                      >
                        <div className="diary-suggestion-tags">
                          <span>{PRIORITY_LABELS[suggestion.priority]}</span>
                          <span>{
                            suggestion.status === "snoozed"
                              ? "Zurückgestellt"
                              : SOURCE_LABELS[suggestion.sourceKind]
                          }</span>
                        </div>
                        <strong>{suggestion.title}</strong>
                        <p>{suggestion.detail}</p>
                        {suggestion.dueAt ? (
                          <small>{formatRelativeDate(suggestion.dueAt)}</small>
                        ) : null}
                        <footer>
                          <button
                            className="button button-soft"
                            disabled={!tasksConnected || Boolean(schedulingId || taskActionId)}
                            onClick={() => void scheduleSuggestion(suggestion, tomorrow)}
                            type="button"
                          >
                            {schedulingId === suggestion.id ? "Wird eingeplant …" : "Morgen"}
                          </button>
                          <label>
                            <span>Folgetag</span>
                            <select
                              aria-label={`Folgetag für ${suggestion.title}`}
                              defaultValue=""
                              disabled={!tasksConnected || Boolean(schedulingId || taskActionId)}
                              onChange={(event) => {
                                if (event.target.value) {
                                  void scheduleSuggestion(suggestion, event.target.value);
                                }
                              }}
                            >
                              <option value="">Wählen …</option>
                              {planningDates.slice(1).map((date) => (
                                <option key={date} value={date}>
                                  {planDateLabel(date, true)}
                                </option>
                              ))}
                            </select>
                          </label>
                        </footer>
                      </article>
                    ))}
                    {!group.items.length ? <p>Aktuell kein Thema in dieser Gruppe.</p> : null}
                  </div>
                </details>
              ))}
              {!tasksConnected ? (
                <p className="diary-tasks-offline">
                  Google Tasks ist nicht verbunden. Die Vorschläge bleiben sichtbar.
                </p>
              ) : null}
            </section>
          </div>

          <section className="diary-follow-days" aria-labelledby="follow-days-title">
            <div>
              <span className="eyebrow">Später</span>
              <h3 id="follow-days-title">Auf einen Folgetag verschieben</h3>
            </div>
            <div>
              {planningDates.slice(1).map((date) => (
                <div
                  className={activeDropDate === date ? "is-active" : ""}
                  key={date}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setActiveDropDate(date);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => dropOnDate(event, date)}
                >
                  <strong>{planDateLabel(date)}</strong>
                  <small>Hier ablegen</small>
                </div>
              ))}
            </div>
          </section>

          <label className="diary-next-focus">
            Eigener Fokus für morgen
            <input
              onChange={(event) => {
                setNextStep(event.target.value);
                setNextStepEdited(true);
              }}
              placeholder="Optional – ein kleiner, klarer Schritt."
              value={currentNextStep}
            />
          </label>

          {isSundayDate(today) ? (
            <section className="diary-weekly-exploration">
              <div>
                <span className="eyebrow">Wochenblick</span>
                <h3>Nächste Woche grob planen</h3>
                <p>Schwerpunkte, Engstellen und freie Räume – noch ohne Details.</p>
              </div>
              <dl>
                <div><dt>Aufgaben</dt><dd>{weekTasks.length}</dd></div>
                <div><dt>Termine</dt><dd>{weekEvents.length}</dd></div>
                <div><dt>Bewerbungsschritte</dt><dd>{weekApplications.length}</dd></div>
                <div><dt>Zahlungen morgen</dt><dd>{tomorrowCosts.length}</dd></div>
              </dl>
              <label>
                Grober Wochenfokus
                <textarea
                  onChange={(event) => setWeekPlan(event.target.value)}
                  placeholder="Was soll in der kommenden Woche Orientierung geben?"
                  rows={3}
                  value={weekPlan}
                />
              </label>
            </section>
          ) : null}

          {submitStatus ? (
            <p className="diary-submit-status" role="status">{submitStatus}</p>
          ) : null}
          <button
            className="button button-primary button-full diary-close-day"
            disabled={closingDay}
            onClick={() => void closeDay()}
            type="button"
          >
            {closingDay
              ? "Tag wird abgeschlossen …"
              : todayEntry?.closedAt
                ? "Planung geprüft & Tagesabschluss aktualisieren"
                : "Planung geprüft – Tag abschließen"}
          </button>
          <p className="diary-privacy-note">Offene Themen blockieren den Abschluss nicht.</p>
        </section>
      ) : null}

      <section className="panel diary-history">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Verlauf</span>
            <h2>{state.journal.length} Tagebucheinträge</h2>
          </div>
        </div>
        <div className="diary-history-grid">
          {state.journal.map((entry) => (
            <article key={entry.id}>
              <header>
                <div>
                  <time dateTime={entry.date}>{formatDate(entry.date)}</time>
                  <span>Stimmung {entry.mood}/5</span>
                </div>
                {entry.closedAt ? <strong>Tagesabschluss</strong> : <strong>Notiz</strong>}
              </header>
              {entry.text ? <p>{entry.text}</p> : null}
              {entry.win ? (
                <blockquote><strong>Gelungen:</strong> {entry.win}</blockquote>
              ) : null}
              {entry.nextStep ? (
                <small><strong>Morgen:</strong> {entry.nextStep}</small>
              ) : null}
              {entry.weekPlan ? (
                <small><strong>Wochenfokus:</strong> {entry.weekPlan}</small>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
