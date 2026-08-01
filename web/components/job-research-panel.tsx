"use client";

import { useMemo, useState } from "react";

import {
  canonicalizeResearchUrl,
  isVacancyResearch,
  researchWithDecision,
} from "../lib/job-research";
import type {
  JobResearchClaim,
  JobResearchEvidenceClass,
  JobResearchEvidenceStatus,
  JobResearchFactKey,
  VacancyResearch,
} from "../lib/types";

const FACT_LABELS: Record<JobResearchFactKey, string> = {
  "role.title": "Stellentitel",
  "company.name": "Arbeitgeber",
  "role.purpose": "Zweck der Rolle",
  "role.tasks": "Aufgaben",
  "role.must_skills": "Muss-Anforderungen",
  "role.nice_skills": "Kann-Anforderungen",
  "role.tools": "Werkzeuge und Systeme",
  "offer.location": "Arbeitsort",
  "offer.contract": "Vertrag",
  "offer.hours": "Arbeitszeit",
  "offer.salary": "Vergütung",
  "offer.work_model": "Arbeitsmodell",
  "offer.travel": "Reisetätigkeit",
  "offer.shifts": "Schichtmodell",
  "offer.reporting_line": "Berichtslinie",
  "offer.benefits": "Leistungen",
  "process.deadline": "Bewerbungsfrist",
  "process.contact": "Ansprechperson",
  "process.selection": "Auswahlprozess",
  "process.interview": "Interviewprozess",
  "process.onboarding": "Einstieg und Onboarding",
  "company.context": "Unternehmenskontext",
  "company.current_developments": "Aktuelle Entwicklungen",
  "market.salary": "Marktvergütung",
  "market.talent_supply": "Verfügbarkeit am Arbeitsmarkt",
  "market.skill_demand": "Gefragte Kompetenzen",
  "market.competing_roles": "Vergleichbare Rollen",
  "market.remote_prevalence": "Remote-Verbreitung",
  "process.retention_risks": "Bindungs- und Einstiegsrisiken",
};

const EVIDENCE_LABELS: Record<JobResearchEvidenceClass, string> = {
  job_ad_explicit: "Anzeige",
  employer_official_assertion: "Arbeitgeberquelle",
  market_primary: "Primärquelle",
  market_secondary: "Marktquelle",
  user_provided_ad_text: "Eingefügter Anzeigentext",
  model_inference: "Schlussfolgerung",
};

const EVIDENCE_STATUS_LABELS: Record<JobResearchEvidenceStatus, string> = {
  supported: "belegt",
  ambiguous: "mehrdeutig",
  contradicted: "widersprüchlich",
  stale: "möglicherweise veraltet",
  unsupported: "nicht belegt",
};

const RETRIEVAL_LABELS: Record<VacancyResearch["retrievalStatus"], string> = {
  exact_page_accessed: "Exakte Anzeige erreicht",
  snippet_only: "Nur Ausschnitte auffindbar",
  blocked_or_login: "Anzeige blockiert oder Anmeldung nötig",
  not_found: "Anzeige nicht gefunden",
  ambiguous: "Anzeige nicht eindeutig zuordenbar",
};

const PRIORITY_LABELS = {
  blocking: "Vor Bewerbung klären",
  high: "Hohe Priorität",
  medium: "Mittlere Priorität",
  low: "Ergänzend",
} as const;

const RESEARCH_POLL_DEADLINE_MS = 8.5 * 60_000;

type ResearchJobReference = {
  id: string;
  token: string;
  status: string;
  startedAt: string;
};

type ResearchApiPayload = {
  result?: unknown;
  job?: ResearchJobReference;
  error?: string;
};

type JobResearchPanelProps = {
  research: VacancyResearch | null;
  sourceUrl: string;
  companyName: string;
  roleTitle: string;
  compact?: boolean;
  onChange: (
    research: VacancyResearch,
    decidedClaim?: JobResearchClaim,
  ) => void;
};

function sourceTitle(research: VacancyResearch, sourceUrl: string): string {
  return (
    research.sources.find((source) => source.url === sourceUrl)?.title ||
    new URL(sourceUrl).hostname
  );
}

function ResearchClaimCard({
  claim,
  research,
  onDecision,
}: {
  claim: JobResearchClaim;
  research: VacancyResearch;
  onDecision: (
    claim: JobResearchClaim,
    status: "confirmed" | "edited" | "rejected",
    editedValue?: string,
  ) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editedValue, setEditedValue] = useState(
    claim.decision.value || claim.value,
  );
  const needsEditBeforeConfirmation =
    claim.evidenceStatus === "unsupported" ||
    claim.evidenceClass === "model_inference";
  const displayedValue = claim.decision.value || claim.value;
  return (
    <article className={`research-claim decision-${claim.decision.status}`}>
      <header>
        <div>
          <span>{FACT_LABELS[claim.factKey]}</span>
          <div className="research-evidence-row">
            <small>{EVIDENCE_LABELS[claim.evidenceClass]}</small>
            <small className={`evidence-${claim.evidenceStatus}`}>
              {EVIDENCE_STATUS_LABELS[claim.evidenceStatus]}
            </small>
            {claim.asOf ? <small>Stand {claim.asOf}</small> : null}
          </div>
        </div>
        {claim.decision.status !== "pending" ? (
          <strong className="research-decision-label">
            {claim.decision.status === "confirmed"
              ? "Bestätigt"
              : claim.decision.status === "edited"
                ? "Bearbeitet bestätigt"
                : "Abgelehnt"}
          </strong>
        ) : null}
      </header>
      {editing ? (
        <label className="research-edit-field">
          Bestätigten Wert bearbeiten
          <textarea
            onChange={(event) => setEditedValue(event.target.value)}
            rows={3}
            value={editedValue}
          />
        </label>
      ) : (
        <p>{displayedValue}</p>
      )}
      {claim.whyItMatters ? <small>{claim.whyItMatters}</small> : null}
      {claim.sourceUrls.length ? (
        <div className="research-source-chips" aria-label="Quellen dieser Aussage">
          {claim.sourceUrls.map((sourceUrl) => (
            <a href={sourceUrl} key={sourceUrl} rel="noreferrer" target="_blank">
              {sourceTitle(research, sourceUrl)}
            </a>
          ))}
        </div>
      ) : (
        <small className="research-source-missing">Keine belegte Webquelle zugeordnet</small>
      )}
      <div className="research-claim-actions">
        {editing ? (
          <>
            <button
              className="button button-soft"
              disabled={!editedValue.trim()}
              onClick={() => {
                onDecision(claim, "edited", editedValue);
                setEditing(false);
              }}
              type="button"
            >
              Bearbeitung bestätigen
            </button>
            <button onClick={() => setEditing(false)} type="button">
              Abbrechen
            </button>
          </>
        ) : (
          <>
            <button
              className="button button-soft"
              disabled={needsEditBeforeConfirmation}
              onClick={() => onDecision(claim, "confirmed")}
              title={
                needsEditBeforeConfirmation
                  ? "Nicht belegte Aussagen und Schlussfolgerungen müssen vor der Bestätigung bearbeitet werden."
                  : undefined
              }
              type="button"
            >
              Bestätigen
            </button>
            <button onClick={() => setEditing(true)} type="button">
              Bearbeiten
            </button>
            <button onClick={() => onDecision(claim, "rejected")} type="button">
              Ablehnen
            </button>
          </>
        )}
      </div>
    </article>
  );
}

export function JobResearchPanel({
  research,
  sourceUrl,
  companyName,
  roleTitle,
  compact = false,
  onChange,
}: JobResearchPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [jobPostingText, setJobPostingText] = useState("");
  const claims = useMemo(
    () => (research ? [...research.adFacts, ...research.enrichment] : []),
    [research],
  );
  const pendingCount = claims.filter(
    (claim) => claim.decision.status === "pending",
  ).length;
  const confirmedCount = claims.filter((claim) =>
    ["confirmed", "edited"].includes(claim.decision.status),
  ).length;
  const requestedUrlChanged = Boolean(
    research &&
      canonicalizeResearchUrl(sourceUrl) !==
        canonicalizeResearchUrl(research.requestedUrl),
  );

  const runResearch = async () => {
    if (!sourceUrl.trim() || busy) {
      setError("Bitte zuerst den öffentlichen Link zur Stellenanzeige eintragen.");
      return;
    }
    setBusy(true);
    setError("");
    setProgress("Recherche wird sicher im Hintergrund gestartet …");
    try {
      let response = await fetch("/api/job-research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: sourceUrl,
          companyName,
          roleTitle,
          jobPostingText,
        }),
      });
      const startedAt = Date.now();
      for (;;) {
        const payload = (await response.json()) as ResearchApiPayload;
        if (!response.ok) {
          throw new Error(
            payload.error || "Die Vakanzrecherche ist nicht erreichbar.",
          );
        }
        if (isVacancyResearch(payload.result)) {
          onChange(payload.result);
          setProgress("");
          break;
        }
        if (response.status !== 202 || !payload.job) {
          throw new Error("Die Vakanzrecherche hat kein Ergebnis geliefert.");
        }
        if (Date.now() - startedAt > RESEARCH_POLL_DEADLINE_MS) {
          throw new Error(
            "Die Recherche dauert ungewöhnlich lange. Bitte später erneut starten.",
          );
        }
        setProgress(
          "Recherche läuft im Hintergrund – Quellen, Aktualität und Widersprüche werden geprüft …",
        );
        const retryAfter = Number(response.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter)
          ? Math.min(Math.max(retryAfter, 2), 10) * 1_000
          : 3_000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        response = await fetch("/api/job-research", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            job: { id: payload.job.id, token: payload.job.token },
          }),
        });
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Die Vakanzrecherche konnte nicht abgeschlossen werden.",
      );
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const decide = (
    claim: JobResearchClaim,
    status: "confirmed" | "edited" | "rejected",
    editedValue?: string,
  ) => {
    if (!research) return;
    try {
      const decision = researchWithDecision(
        research,
        claim.id,
        status,
        editedValue,
      );
      onChange(decision.research, decision.claim);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Die Entscheidung konnte nicht gespeichert werden.",
      );
    }
  };

  const content = (
    <>
      <div className="research-panel-heading">
        <div>
          <span className="eyebrow">Quellengebundene Vakanzrecherche</span>
          <h3>Erst prüfen, dann für Bewerbung und Gespräch verwenden</h3>
          <p>
            Die Websuche verarbeitet nur öffentliche Stellendaten. Dein CV,
            persönliche Antworten und private Notizen bleiben in diesem Schritt außen vor.
          </p>
        </div>
        <button
          className="button button-primary"
          disabled={busy || !sourceUrl.trim()}
          onClick={() => void runResearch()}
          type="button"
        >
          {busy
            ? "Öffentliche Quellen werden geprüft …"
            : research
              ? "Recherche aktualisieren"
              : "Vakanz recherchieren"}
        </button>
      </div>
      <details className="research-paste-fallback">
        <summary>Ausschreibung blockiert oder abgelaufen?</summary>
        <label>
          Öffentlichen Ausschreibungstext ergänzen
          <textarea
            maxLength={30_000}
            onChange={(event) => setJobPostingText(event.target.value)}
            placeholder="Nur den veröffentlichten Anzeigentext einfügen – keine privaten Notizen, Gehaltsgrenzen oder personenbezogenen Daten."
            rows={5}
            value={jobPostingText}
          />
        </label>
      </details>
      {error ? <p className="research-error" role="alert">{error}</p> : null}
      {busy && progress ? (
        <p className="research-progress" role="status">{progress}</p>
      ) : null}
      {requestedUrlChanged ? (
        <p className="research-warning" role="status">
          Der Link wurde seit der letzten Recherche geändert. Bitte die Recherche aktualisieren.
        </p>
      ) : null}
      {research ? (
        <div className="research-results">
          <div className="research-status-grid">
            <article>
              <span>Abruf</span>
              <strong>{RETRIEVAL_LABELS[research.retrievalStatus]}</strong>
            </article>
            <article>
              <span>Belegte Aussagen</span>
              <strong>
                {research.validation.supportedClaims} von {research.validation.totalClaims}
              </strong>
            </article>
            <article>
              <span>Entscheidungen</span>
              <strong>{confirmedCount} bestätigt · {pendingCount} offen</strong>
            </article>
            <article>
              <span>Quellen</span>
              <strong>
                {research.validation.consultedSources ?? research.sources.length} geprüft ·{" "}
                {research.sources.length} verwendet
              </strong>
            </article>
          </div>
          {["blocked_or_login", "not_found", "snippet_only"].includes(
            research.retrievalStatus,
          ) ? (
            <p className="research-warning">
              Anzeigenfakten werden nicht rekonstruiert. Ergänze bei Bedarf oben den
              veröffentlichten Text und starte die Recherche erneut.
            </p>
          ) : null}

          {research.adFacts.length ? (
            <section className="research-claim-group">
              <header>
                <span className="eyebrow">Anzeige</span>
                <h4>Vakanzfakten zur Prüfung</h4>
              </header>
              <div className="research-claim-list">
                {research.adFacts.map((claim) => (
                  <ResearchClaimCard
                    claim={claim}
                    key={claim.id}
                    onDecision={decide}
                    research={research}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {research.enrichment.length ? (
            <details className="research-enrichment" open={!compact}>
              <summary>
                Unternehmens- und Marktkontext ({research.enrichment.length})
              </summary>
              <div className="research-claim-list">
                {research.enrichment.map((claim) => (
                  <ResearchClaimCard
                    claim={claim}
                    key={claim.id}
                    onDecision={decide}
                    research={research}
                  />
                ))}
              </div>
            </details>
          ) : null}

          {research.gaps.length ? (
            <section className="research-gaps">
              <header>
                <span className="eyebrow">Interview und Entscheidung</span>
                <h4>Offene Punkte gezielt klären</h4>
              </header>
              <div>
                {research.gaps.map((gap, index) => (
                  <article key={`${gap.factKey}-${index}`}>
                    <span className={`priority-${gap.priority}`}>
                      {PRIORITY_LABELS[gap.priority]}
                    </span>
                    <strong>{gap.question}</strong>
                    <small>{gap.rationale}</small>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {research.conflicts.length || research.warnings.length ? (
            <details className="research-quality-notes">
              <summary>Widersprüche und Qualitätshinweise</summary>
              <ul>
                {[...research.conflicts, ...research.warnings].map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            </details>
          ) : null}

          {research.sources.length ? (
            <details className="research-source-list">
              <summary>Für Aussagen verwendete Quellen ({research.sources.length})</summary>
              <div>
                {research.sources.map((source) => (
                  <a href={source.url} key={source.url} rel="noreferrer" target="_blank">
                    <strong>{source.title}</strong>
                    <small>{source.domain}</small>
                  </a>
                ))}
              </div>
            </details>
          ) : null}
          <p className="research-audit-copy">
            Recherchiert am {new Date(research.researchedAt).toLocaleString("de-DE")} ·
            Modell {research.model} · Quellen bleiben anklickbar. Nur bestätigte oder
            bearbeitet bestätigte Aussagen fließen in die Dokumenterstellung ein.
          </p>
        </div>
      ) : null}
    </>
  );

  return compact ? (
    <details className="job-research-panel compact" open={!research || pendingCount > 0}>
      <summary>
        Vakanzrecherche
        {research ? ` · ${confirmedCount} bestätigt, ${pendingCount} offen` : " · noch offen"}
      </summary>
      {content}
    </details>
  ) : (
    <section className="job-research-panel">{content}</section>
  );
}
