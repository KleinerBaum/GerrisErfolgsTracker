"use client";

import { useMemo, useState } from "react";

import type { AppState, DailyReport } from "../../lib/domain/types";
import { formatDateTime } from "../../lib/format";
import { CheckIcon, MicIcon } from "../icons";

type ReflectionViewProps = {
  state: AppState;
  onAnalyze: (
    input: Pick<DailyReport, "text" | "energy" | "focus" | "reportDate">,
  ) => DailyReport;
  onApply: (reportId: string, suggestionIds: string[]) => void;
};

const today = (): string => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export function ReflectionView({ state, onAnalyze, onApply }: ReflectionViewProps) {
  const [text, setText] = useState("");
  const [energy, setEnergy] = useState<DailyReport["energy"]>(3);
  const [focus, setFocus] = useState<DailyReport["focus"]>(3);
  const [draftReport, setDraftReport] = useState<DailyReport | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [listening, setListening] = useState(false);

  const appliedReports = useMemo(
    () => [...state.reports].filter((report) => report.appliedAt).reverse(),
    [state.reports],
  );

  const startVoice = () => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = "de-DE";
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      setText((current) => `${current} ${transcript}`.trim());
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    setListening(true);
    recognition.start();
  };

  const analyze = () => {
    if (!text.trim()) return;
    const report = onAnalyze({ text, energy, focus, reportDate: today() });
    setDraftReport(report);
    setSelected(new Set(report.suggestions.filter((suggestion) => suggestion.selected).map((suggestion) => suggestion.id)));
  };

  const apply = () => {
    if (!draftReport) return;
    onApply(draftReport.id, [...selected]);
    setDraftReport(null);
    setSelected(new Set());
    setText("");
  };

  return (
    <div className="view-stack">
      <header className="page-intro">
        <span className="eyebrow">Reflexion</span>
        <h1>Ein kurzer Bericht hält alles andere aktuell.</h1>
        <p>Sprich frei oder nutze klare Zeilen wie „Aufgabe:“ und „Termin:“. Keine Änderung wird ohne deine Bestätigung gespeichert.</p>
      </header>

      {!draftReport ? (
        <section className="reflection-card" aria-labelledby="report-title">
          <div className="reflection-step"><span>1</span> Erfassen</div>
          <h2 id="report-title">Wie lief dein Tag?</h2>
          <p className="supportive-copy">Heute zählt schon ein kleiner Schritt. Halte Ergebnisse, Fortschritt und den nächsten sinnvollen Schritt fest.</p>

          <label className="field-label" htmlFor="daily-report">Tagesbericht</label>
          <textarea
            id="daily-report"
            onChange={(event) => setText(event.target.value)}
            placeholder={"Beispiel:\nAutomation Case Study abgeschlossen.\nAufgabe: Mobile Screenshot ergänzen\nTermin: Review am Freitag"}
            rows={8}
            value={text}
          />
          <button
            className={`button button-secondary voice-wide ${listening ? "listening" : ""}`}
            disabled={listening}
            onClick={startVoice}
            type="button"
          >
            <MicIcon /> {listening ? "Ich höre zu …" : "Bericht sprechen"}
          </button>

          <div className="rating-grid">
            <Rating label="Energie" onChange={(value) => setEnergy(value)} value={energy} />
            <Rating label="Fokus" onChange={(value) => setFocus(value)} value={focus} />
          </div>

          <div className="privacy-note">
            <strong>Präsentationsmodus</strong>
            <p>Nutze für die Portfolio-Ansicht nur neutrale, synthetische Inhalte. Berichtsdaten bleiben im Gerätespeicher.</p>
          </div>
          <button className="button button-primary button-full" disabled={!text.trim()} onClick={analyze} type="button">
            Bericht auswerten
          </button>
        </section>
      ) : (
        <section className="reflection-card" aria-labelledby="review-title">
          <div className="reflection-step"><span>2</span> Prüfen & bestätigen</div>
          <h2 id="review-title">Erkannte Änderungen</h2>
          <p className="supportive-copy">Wähle nur das aus, was wirklich übernommen werden soll. Offene Terminangaben bleiben unmarkiert.</p>

          <div className="suggestion-list">
            {draftReport.suggestions.map((suggestion) => {
              const checked = selected.has(suggestion.id);
              return (
                <label className={`suggestion-card ${checked ? "selected" : ""}`} key={suggestion.id}>
                  <input
                    checked={checked}
                    onChange={(event) => {
                      setSelected((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(suggestion.id);
                        else next.delete(suggestion.id);
                        return next;
                      });
                    }}
                    type="checkbox"
                  />
                  <span className="custom-check"><CheckIcon /></span>
                  <span>
                    <strong>{suggestion.title}</strong>
                    <small>{suggestion.rationale}</small>
                  </span>
                  <em className={`confidence confidence-${suggestion.confidence}`}>
                    {suggestion.confidence === "high" ? "Eindeutig" : suggestion.confidence === "medium" ? "Vorschlag" : "Rückfrage"}
                  </em>
                </label>
              );
            })}
          </div>

          <div className="sticky-approval">
            <button className="button button-ghost" onClick={() => setDraftReport(null)} type="button">Zurück</button>
            <button className="button button-primary" disabled={!selected.size} onClick={apply} type="button">
              {selected.size} Änderungen übernehmen
            </button>
          </div>
        </section>
      )}

      <section className="panel" aria-labelledby="history-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Verlauf</span>
            <h2 id="history-title">Tagesabschlüsse</h2>
          </div>
          <span className="level-chip">Rhythmus {state.gamification.rhythmDays}/7</span>
        </div>
        {appliedReports.length ? (
          <div className="report-history">
            {appliedReports.slice(0, 5).map((report) => (
              <article key={report.id}>
                <CheckIcon />
                <div>
                  <strong>{report.reportDate}</strong>
                  <p>{report.suggestions.length} Vorschläge geprüft · Energie {report.energy}/5 · Fokus {report.focus}/5</p>
                </div>
                <small>{report.appliedAt ? formatDateTime(report.appliedAt) : ""}</small>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-copy">Dein erster bestätigter Tagesabschluss erscheint hier.</p>
        )}
      </section>
    </div>
  );
}

type RatingProps = {
  label: string;
  value: DailyReport["energy"];
  onChange: (value: DailyReport["energy"]) => void;
};

function Rating({ label, value, onChange }: RatingProps) {
  return (
    <fieldset className="rating-control">
      <legend>{label}</legend>
      <div>
        {([1, 2, 3, 4, 5] as const).map((item) => (
          <button
            aria-label={`${label} ${item} von 5`}
            aria-pressed={value === item}
            className={value === item ? "active" : ""}
            key={item}
            onClick={() => onChange(item)}
            type="button"
          >
            {item}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
