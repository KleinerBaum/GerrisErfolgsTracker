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
      ? "Planungsstand wird verlässlich geprüft"
      : "Planungsstatus unbekannt – sofort klären");
  const message =
    error ||
    report?.message ||
    "Solange Kalenderdaten nicht frisch und vollständig bestätigt sind, gilt kein Zeitraum als frei.";
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
          {urgent ? "Top-Priorität · Dringend & wichtig" : "Planungsgesundheit"}
        </span>
        <strong>{title}</strong>
        <p>{message}</p>
        {report ? (
          <small>
            {report.criticalCount} kritisch · {report.importantCount} wichtig · Abgleich {report.automationMode === "safe" ? "sicher automatisch" : "im Dry-run"}
          </small>
        ) : null}
      </div>
      <div className="planning-health-actions">
        <button
          className="button button-primary"
          onClick={() => onNavigate("calendar")}
          type="button"
        >
          Planung klären
        </button>
        <button
          className="button button-soft"
          disabled={loading}
          onClick={onRefresh}
          type="button"
        >
          {loading ? "Prüfung läuft …" : "Neu abgleichen"}
        </button>
      </div>
    </section>
  );
}
