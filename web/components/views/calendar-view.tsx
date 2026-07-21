import type { AppState } from "../../lib/domain/types";
import { formatDateTime, formatRelativeDay, formatTime } from "../../lib/format";

type CalendarViewProps = { state: AppState };

export function CalendarView({ state }: CalendarViewProps) {
  const events = [...state.calendarEvents].sort((left, right) => left.startAt.localeCompare(right.startAt));

  return (
    <div className="view-stack">
      <header className="page-intro">
        <span className="eyebrow">Kalender</span>
        <h1>Zeit, Vorbereitung und Fokus in einer Agenda.</h1>
        <p>Google Kalender bleibt das System of Record. Hier werden nur freigegebene Snapshots und Verknüpfungen gezeigt.</p>
      </header>

      <section className="calendar-summary" aria-label="Kalenderstatus">
        <div>
          <span>Nächster Termin</span>
          <strong>{events[0] ? `${formatRelativeDay(events[0].startAt)} · ${formatTime(events[0].startAt)}` : "Keiner"}</strong>
        </div>
        <div>
          <span>Freier Fokusblock</span>
          <strong>15:30–17:00</strong>
        </div>
        <div>
          <span>Konflikte</span>
          <strong>0</strong>
        </div>
      </section>

      <section className="panel" aria-labelledby="agenda-full-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Agenda</span>
            <h2 id="agenda-full-title">Kommende Termine</h2>
          </div>
          <span className="sync-badge"><span /> Snapshot aktuell</span>
        </div>
        <div className="agenda-days">
          {events.map((event, index) => (
            <article className="agenda-card" key={event.id}>
              <div className="agenda-date">
                <span>{formatRelativeDay(event.startAt)}</span>
                <strong>{formatTime(event.startAt)}</strong>
                <small>bis {formatTime(event.endAt)}</small>
              </div>
              <div className="agenda-content">
                <div>
                  <span className="eyebrow">{event.calendarName}</span>
                  <h3>{event.title}</h3>
                  <p>{event.location ?? "Ohne Ortsangabe"} · {formatDateTime(event.startAt)}</p>
                </div>
                <div className="tag-row">
                  {event.links.map((link) => (
                    <span key={`${link.type}-${link.id}`}>{link.type === "task" ? "Vorbereitungsaufgabe" : "Verknüpft"}</span>
                  ))}
                  {index === 0 ? <span>Fokusrelevant</span> : null}
                </div>
                <div className="button-row compact">
                  <button className="button button-secondary" type="button">Vorbereiten</button>
                  <button className="button button-ghost" type="button">Details</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="connector-card">
        <div>
          <span className="eyebrow">Google Kalender</span>
          <h2>Sync über den verbundenen ChatGPT App-Workflow</h2>
          <p>ChatGPT liest einen begrenzten Zeitraum, zeigt Änderungen mit Datum, Uhrzeit und Zeitzone und übergibt erst nach Bestätigung einen Snapshot.</p>
        </div>
        <span className="portfolio-chip">Portfolio-safe</span>
      </section>
    </div>
  );
}
