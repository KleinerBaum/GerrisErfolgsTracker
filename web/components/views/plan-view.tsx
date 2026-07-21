import { LIFE_AREA_LABELS, QUADRANT_LABELS, type AppState, type Quadrant } from "../../lib/domain/types";
import { formatRelativeDay, minutesLabel } from "../../lib/format";
import { CheckIcon } from "../icons";

type PlanViewProps = {
  state: AppState;
  onCompleteTask: (taskId: string) => void;
};

const quadrantClass: Record<Quadrant, string> = {
  urgent_important: "quadrant-now",
  important: "quadrant-plan",
  urgent: "quadrant-decide",
  later: "quadrant-later",
};

export function PlanView({ state, onCompleteTask }: PlanViewProps) {
  const openTasks = state.tasks.filter((task) => task.status !== "done");

  return (
    <div className="view-stack">
      <header className="page-intro">
        <span className="eyebrow">Plan</span>
        <h1>Wichtige Arbeit sichtbar machen.</h1>
        <p>Aufgaben, Ziele und Meilensteine bleiben verbunden. Details öffnen sich erst, wenn du sie brauchst.</p>
      </header>

      <section className="panel" aria-labelledby="focus-list-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Fokusliste</span>
            <h2 id="focus-list-title">{openTasks.length} offene Schritte</h2>
          </div>
          <span className="soft-badge">Heute zuerst</span>
        </div>
        <div className="task-list">
          {openTasks.map((task) => (
            <article className="task-row" key={task.id}>
              <button
                aria-label={`${task.title} als erledigt markieren`}
                className="complete-button"
                onClick={() => onCompleteTask(task.id)}
                type="button"
              >
                <CheckIcon />
              </button>
              <div className="task-row-main">
                <div className="task-title-line">
                  <strong>{task.title}</strong>
                  <span className={`quadrant-badge ${quadrantClass[task.quadrant]}`}>
                    {QUADRANT_LABELS[task.quadrant]}
                  </span>
                </div>
                <p>{task.description}</p>
                <div className="inline-meta">
                  <span>{LIFE_AREA_LABELS[task.area]}</span>
                  <span>{task.dueAt ? formatRelativeDay(task.dueAt) : "Ohne Frist"}</span>
                  <span>{minutesLabel(task.estimateMinutes)}</span>
                </div>
                <div className="mini-progress" aria-label={`${task.progress} Prozent Fortschritt`}>
                  <span style={{ width: `${task.progress}%` }} />
                </div>
              </div>
              <details className="task-details">
                <summary>Details</summary>
                <div>
                  <strong>Verknüpft</strong>
                  <p>{task.links.length ? `${task.links.length} Einträge` : "Noch keine Verknüpfung"}</p>
                  {task.milestones.length ? (
                    <ul>
                      {task.milestones.map((milestone) => (
                        <li key={milestone.id}>
                          {milestone.status === "done" ? "Erledigt" : "Offen"} · {milestone.title}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </details>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="goals-title">
        <div className="section-heading section-heading-outside">
          <div>
            <span className="eyebrow">Ziele & Meilensteine</span>
            <h2 id="goals-title">Fortschritt mit nächstem Schritt</h2>
          </div>
        </div>
        <div className="goal-grid">
          {state.goals.map((goal) => (
            <article className="goal-card" key={goal.id}>
              <div className="goal-ring" style={{ "--progress": `${goal.progress * 3.6}deg` } as React.CSSProperties}>
                <span>{goal.progress}%</span>
              </div>
              <div>
                <span className="eyebrow">{LIFE_AREA_LABELS[goal.area]}</span>
                <h3>{goal.title}</h3>
                <p>Nächster Schritt: {goal.nextStep}</p>
                <div className="goal-metric">
                  <strong>
                    {goal.metricCurrent}/{goal.metricTarget}
                  </strong>
                  <span>{goal.metricLabel}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel matrix-panel" aria-labelledby="matrix-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Eisenhower</span>
            <h2 id="matrix-title">Prioritäten ohne Kartenchaos</h2>
          </div>
        </div>
        <div className="matrix-grid">
          {(Object.keys(QUADRANT_LABELS) as Quadrant[]).map((quadrant) => {
            const items = openTasks.filter((task) => task.quadrant === quadrant);
            return (
              <div className={quadrantClass[quadrant]} key={quadrant}>
                <strong>{QUADRANT_LABELS[quadrant]}</strong>
                <span>{items.length} Aufgaben</span>
                {items.slice(0, 2).map((task) => (
                  <small key={task.id}>{task.title}</small>
                ))}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
