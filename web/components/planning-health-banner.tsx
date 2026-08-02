"use client";

import type { PlanningHealthReport, ViewKey } from "../lib/types";

export function PlanningHealthBanner({
  report,
  loading,
  error,
  onNavigate,
  onRefresh,
}: {
  report: PlanningHealthReport | null;
  loading: boolean;
  error: string;
  onNavigate: (view: ViewKey) => void;
  onRefresh: () => void;
}) {
  const state = report?.state || "unknown";
  const urgent =
    !report ||
    report.state === "unknown" ||
    report.state === "stale" ||
    report.criticalCount > 0;
  const title =
    report?.title ||
    (loading
      ? "Planung wird geprüft"
      : "Kalender prüfen");
  const message =
    error ||
    report?.message ||
    "Freie Zeit bleibt bis zum Kalenderabgleich ungeklärt.";
  return (
    <section
      aria-live={urgent ? "assertive" : "polite"}
      className={`planning-health-banner planning-health-${state} ${urgent ? "is-urgent" : ""}`}
      role={urgent ? "alert" : "status"}
    >
      <div className="planning-health-mark" aria-hidden="true">
        {urgent ? "!" : state === "intentionally_free" ? "F" : "✓"}
      </div>
      <div className="planning-health-copy">
        <span className="eyebrow">
          {urgent ? "Dringend" : "Planungscheck"}
        </span>
        <strong>{title}</strong>
        <p>{message}</p>
        {report ? (
          <small>
            {report.criticalCount} dringend · {report.importantCount} wichtig · {report.automationMode === "safe" ? "Automatik aktiv" : "Vorschau aktiv"}
          </small>
        ) : null}
      </div>
      <div className="planning-health-actions">
        <button
          className="button button-primary"
          onClick={() => onNavigate("calendar")}
          type="button"
        >
          Planung öffnen
        </button>
        <button
          className="button button-soft"
          disabled={loading}
          onClick={onRefresh}
          type="button"
        >
          {loading ? "Prüfung läuft …" : "Neu prüfen"}
        </button>
      </div>
    </section>
  );
}
