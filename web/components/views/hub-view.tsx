"use client";

import { useState } from "react";

import { LIFE_AREA_LABELS, type AppState } from "../../lib/domain/types";
import { formatDateTime, formatRelativeDay } from "../../lib/format";
import { SparkIcon } from "../icons";

type HubTab = "documents" | "contracts" | "contacts" | "radar" | "automation";
type HubViewProps = { state: AppState };

const TABS: Array<{ key: HubTab; label: string }> = [
  { key: "documents", label: "Dokumente" },
  { key: "contracts", label: "Verträge" },
  { key: "contacts", label: "Kontakte" },
  { key: "radar", label: "Radar" },
  { key: "automation", label: "Automation" },
];

export function HubView({ state }: HubViewProps) {
  const [tab, setTab] = useState<HubTab>("documents");

  return (
    <div className="view-stack">
      <header className="page-intro">
        <span className="eyebrow">Hub</span>
        <h1>Alles Wichtige ist auffindbar und verknüpft.</h1>
        <p>Dokumente bleiben in Google Drive. Der Hub organisiert Referenzen, Fristen, Kontakte und nachvollziehbare Automationen.</p>
      </header>

      <div aria-label="Hub-Bereiche" className="tab-bar" role="tablist">
        {TABS.map((item) => (
          <button
            aria-selected={tab === item.key}
            className={tab === item.key ? "active" : ""}
            key={item.key}
            onClick={() => setTab(item.key)}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "documents" ? (
        <section className="panel" aria-labelledby="documents-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Google Drive Referenzen</span>
              <h2 id="documents-title">{state.documents.length} Dokumente im Überblick</h2>
            </div>
            <span className="soft-badge">Keine Dateiinhalte gespeichert</span>
          </div>
          <div className="record-grid">
            {state.documents.map((document) => (
              <article className="record-card" key={document.id}>
                <div className="file-mark">{document.kind === "pdf" ? "PDF" : "DOC"}</div>
                <div>
                  <span className="eyebrow">{LIFE_AREA_LABELS[document.area]}</span>
                  <h3>{document.name}</h3>
                  <p>Geändert {formatRelativeDay(document.modifiedAt)} · {document.tags.join(" · ")}</p>
                  {document.reviewAt ? <strong>Prüfen {formatRelativeDay(document.reviewAt)}</strong> : null}
                </div>
                <div className="button-row compact">
                  <button className="button button-secondary" type="button">Öffnen</button>
                  <button className="button button-ghost" type="button">Verknüpfen</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "contracts" ? (
        <section className="panel" aria-labelledby="contracts-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Verträge & Fristen</span>
              <h2 id="contracts-title">Fristen früh entscheiden</h2>
            </div>
          </div>
          <div className="record-grid">
            {state.contracts.map((contract) => (
              <article className="contract-card" key={contract.id}>
                <div className="contract-topline">
                  <span className="status-badge status-review">Prüfung</span>
                  <span>{contract.renewal === "automatic" ? "Automatische Verlängerung" : "Manuelle Verlängerung"}</span>
                </div>
                <h3>{contract.title}</h3>
                <p>{contract.counterparty}</p>
                <dl>
                  <div>
                    <dt>Kündigungsfrist</dt>
                    <dd>{contract.noticeDeadlineAt ? formatDateTime(contract.noticeDeadlineAt) : "Keine"}</dd>
                  </div>
                  <div>
                    <dt>Drive-Dokument</dt>
                    <dd>{contract.documentId ? "Verknüpft" : "Nicht verknüpft"}</dd>
                  </div>
                </dl>
                <button className="button button-primary" type="button">Erinnerung vorbereiten</button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "contacts" ? (
        <section className="panel" aria-labelledby="contacts-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Kontakte</span>
              <h2 id="contacts-title">Follow-ups mit Kontext</h2>
            </div>
          </div>
          <div className="contact-list">
            {state.contacts.map((contact) => (
              <article className="contact-card" key={contact.id}>
                <div className="contact-avatar" aria-hidden="true">PR</div>
                <div>
                  <h3>{contact.displayName}</h3>
                  <p>{contact.role} · {contact.organization}</p>
                  <span>{contact.nextFollowUpAt ? `Follow-up ${formatRelativeDay(contact.nextFollowUpAt)}` : "Kein Follow-up offen"}</span>
                </div>
                <button className="button button-secondary" type="button">Follow-up planen</button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "radar" ? (
        <section className="panel" aria-labelledby="insights-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Innovationsradar</span>
              <h2 id="insights-title">Signale in umsetzbare Ideen verwandeln</h2>
            </div>
            <SparkIcon className="accent-icon" />
          </div>
          <div className="insight-grid">
            {state.insights.map((insight) => (
              <article className="insight-card" key={insight.id}>
                <span className="topic-badge">{insight.topic === "microcomputers" ? "Microcomputer" : "Automation"}</span>
                <h3>{insight.title}</h3>
                <p>{insight.summary}</p>
                <small>{insight.sourceName} · {formatRelativeDay(insight.publishedAt)}</small>
                <button className="button button-secondary" disabled={Boolean(insight.savedAsTaskId)} type="button">
                  {insight.savedAsTaskId ? "Als Aufgabe gespeichert" : "Als Idee speichern"}
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "automation" ? (
        <section className="panel" aria-labelledby="automation-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Automationsprotokoll</span>
              <h2 id="automation-title">Jede Änderung bleibt nachvollziehbar</h2>
            </div>
          </div>
          <div className="automation-list">
            {[...state.automationLog].reverse().map((event) => (
              <article key={event.id}>
                <span className="automation-node" />
                <div>
                  <strong>{event.title}</strong>
                  <p>{event.detail}</p>
                  <small>{formatDateTime(event.occurredAt)} · Quelle: {event.source}</small>
                </div>
                <span className={event.approvedByUser ? "approval-badge" : "pending-badge"}>
                  {event.approvedByUser ? "Bestätigt" : "Freigabe offen"}
                </span>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="integration-strip" aria-label="Integrationen">
        {state.integrations.map((integration) => (
          <div key={integration.key}>
            <span className={`integration-dot status-${integration.status}`} />
            <p>
              <strong>{integration.label}</strong>
              <small>{integration.detail}</small>
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
