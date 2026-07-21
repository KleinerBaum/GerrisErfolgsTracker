import type { AppState, DashboardSnapshot } from "../../lib/domain/types";
import { formatRelativeDay, formatTime, minutesLabel } from "../../lib/format";
import { CheckIcon, ChevronIcon, SparkIcon } from "../icons";

type TodayViewProps = {
  state: AppState;
  dashboard: DashboardSnapshot;
  onCompleteTask: (taskId: string) => void;
  onNavigate: (view: "plan" | "calendar" | "hub" | "reflection") => void;
};

export function TodayView({ state, dashboard, onCompleteTask, onNavigate }: TodayViewProps) {
  const nextTask = dashboard.nextTask;
  const remainingToLevel = 100 - (state.gamification.points % 100 || 100);

  return (
    <div className="view-stack">
      <section className="focus-card" aria-labelledby="next-focus-title">
        <div className="eyebrow-row">
          <span className="eyebrow">Als Nächstes</span>
          <span className="reason-pill">Warum jetzt? {nextTask?.dueAt ? "Frist heute" : "Hoher Nutzen"}</span>
        </div>
        {nextTask ? (
          <>
            <h2 id="next-focus-title">{nextTask.title}</h2>
            <p className="focus-description">{nextTask.description}</p>
            <div className="task-meta">
              <span>{minutesLabel(nextTask.estimateMinutes)}</span>
              <span>{nextTask.progress}% Fortschritt</span>
            </div>
            <div className="focus-progress" aria-label={`Fortschritt ${nextTask.progress} Prozent`}>
              <span style={{ width: `${nextTask.progress}%` }} />
            </div>
            <div className="button-row">
              <button className="button button-primary" type="button">
                Fokus starten
              </button>
              <button
                className="button button-secondary"
                onClick={() => onCompleteTask(nextTask.id)}
                type="button"
              >
                <CheckIcon /> Erledigt
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="next-focus-title">Heute zählt schon ein kleiner Schritt.</h2>
            <p className="focus-description">Wähle einen Fokus oder erfasse den nächsten Schritt.</p>
          </>
        )}
      </section>

      <section className="metric-strip" aria-label="Heute im Blick">
        <button onClick={() => onNavigate("plan")} type="button">
          <strong>
            {dashboard.completedToday}/{Math.max(dashboard.plannedToday, 1)}
          </strong>
          <span>Heute</span>
        </button>
        <button onClick={() => onNavigate("calendar")} type="button">
          <strong>{dashboard.eventCountToday}</strong>
          <span>Termine</span>
        </button>
        <button onClick={() => onNavigate("hub")} type="button">
          <strong>{dashboard.deadlineCount}</strong>
          <span>Fristen</span>
        </button>
      </section>

      <div className="dashboard-grid">
        <section className="panel" aria-labelledby="agenda-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Zeit & Termine</span>
              <h2 id="agenda-title">Deine nächsten Blöcke</h2>
            </div>
            <button className="text-action" onClick={() => onNavigate("calendar")} type="button">
              Alle <ChevronIcon />
            </button>
          </div>
          <div className="timeline">
            {dashboard.nextEvents.length ? (
              dashboard.nextEvents.slice(0, 2).map((event) => (
                <article className="timeline-item" key={event.id}>
                  <time dateTime={event.startAt}>{formatTime(event.startAt)}</time>
                  <div>
                    <strong>{event.title}</strong>
                    <span>
                      {formatRelativeDay(event.startAt)} · {formatTime(event.startAt)}–
                      {formatTime(event.endAt)}
                    </span>
                  </div>
                </article>
              ))
            ) : (
              <p className="empty-copy">Kein Termin blockiert deinen nächsten Fokus.</p>
            )}
          </div>
          <div className="focus-window">Freier Fokusblock: 15:30–17:00</div>
        </section>

        <section className="panel" aria-labelledby="attention-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Handlungsbedarf</span>
              <h2 id="attention-title">
                {dashboard.actionItems.length
                  ? `${dashboard.actionItems.length} Dinge brauchen deine Entscheidung`
                  : "Alles ist geklärt"}
              </h2>
            </div>
          </div>
          <div className="action-list">
            {dashboard.actionItems.slice(0, 3).map((item) => (
              <button className="action-row" key={item.id} type="button">
                <span className={`severity-dot severity-${item.severity}`} />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
                <em>{item.reason}</em>
              </button>
            ))}
          </div>
        </section>

        <section className="panel progress-panel" aria-labelledby="progress-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Wochenfortschritt</span>
              <h2 id="progress-title">Kleiner Schritt, klare Wirkung.</h2>
            </div>
            <span className="level-chip">Level {state.gamification.level}</span>
          </div>
          <div className="week-progress-row">
            <div
              aria-label={`Wochenmission ${dashboard.weeklyProgress} Prozent`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={dashboard.weeklyProgress}
              className="week-progress"
              role="progressbar"
            >
              <span style={{ width: `${dashboard.weeklyProgress}%` }} />
            </div>
            <strong>{dashboard.weeklyProgress}%</strong>
          </div>
          <p>
            Wochenmission: {state.gamification.weeklyMeaningfulSteps} von {state.gamification.weeklyTarget} wichtigen Schritten · noch {remainingToLevel || 100} Punkte bis Level {state.gamification.level + 1}
          </p>
          <div className="rhythm-row" aria-label={`Rhythmus ${state.gamification.rhythmDays} von 7 Tagen`}>
            {Array.from({ length: 7 }, (_, index) => (
              <span className={index < state.gamification.rhythmDays ? "active" : ""} key={index} />
            ))}
            <small>Dein Rhythmus: {state.gamification.rhythmDays} von 7 Tagen</small>
          </div>
        </section>

        <section className="panel insight-panel" aria-labelledby="radar-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Innovationsradar</span>
              <h2 id="radar-title">{dashboard.latestInsight?.title ?? "Radar bereit"}</h2>
            </div>
            <SparkIcon className="accent-icon" />
          </div>
          <p>{dashboard.latestInsight?.summary ?? "Synchronisiere neue Signale über ChatGPT."}</p>
          <div className="tag-row">
            <span>KI-Produkte</span>
            <span>Microcomputer</span>
            <span>Automation</span>
          </div>
          <button className="text-action standalone" onClick={() => onNavigate("hub")} type="button">
            Radar öffnen <ChevronIcon />
          </button>
        </section>
      </div>

      <section className="closing-banner" aria-labelledby="closing-title">
        <div>
          <span className="eyebrow">Tagesabschluss · 60–90 Sekunden</span>
          <h2 id="closing-title">Dein Bericht hält Plan und Fortschritt aktuell.</h2>
          <p>Sprich oder füge einen kurzen Bericht ein. Du bestätigst jede erkannte Änderung.</p>
        </div>
        <button className="button button-light" onClick={() => onNavigate("reflection")} type="button">
          Bericht starten
        </button>
      </section>
    </div>
  );
}
