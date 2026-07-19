"use client";

import { useRef, useState } from "react";

import type { AppState, CaptureDraft } from "../lib/domain/types";
import { formatDayHeading } from "../lib/format";
import {
  CalendarIcon,
  CloseIcon,
  HubIcon,
  PlanIcon,
  PlusIcon,
  ReflectionIcon,
  SearchIcon,
  SettingsIcon,
  TodayIcon,
} from "./icons";
import { QuickCapture } from "./quick-capture";
import { useLifeState } from "./use-life-state";
import { CalendarView } from "./views/calendar-view";
import { HubView } from "./views/hub-view";
import { PlanView } from "./views/plan-view";
import { ReflectionView } from "./views/reflection-view";
import { TodayView } from "./views/today-view";

type View = "today" | "plan" | "calendar" | "hub" | "reflection";

const NAV_ITEMS: Array<{
  key: View;
  label: string;
  icon: typeof TodayIcon;
}> = [
  { key: "today", label: "Heute", icon: TodayIcon },
  { key: "plan", label: "Plan", icon: PlanIcon },
  { key: "calendar", label: "Kalender", icon: CalendarIcon },
  { key: "hub", label: "Hub", icon: HubIcon },
  { key: "reflection", label: "Reflexion", icon: ReflectionIcon },
];

type LifeOsAppProps = { initialState: AppState };

export function LifeOsApp({ initialState }: LifeOsAppProps) {
  const [view, setView] = useState<View>("today");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState("Bereit");
  const importRef = useRef<HTMLInputElement>(null);
  const { state, dashboard, actions } = useLifeState(initialState);

  const navigate = (nextView: View) => {
    setView(nextView);
    window.setTimeout(() => document.querySelector<HTMLElement>("main h1, main h2")?.focus(), 0);
  };

  const saveCapture = (draft: CaptureDraft) => {
    actions.addCapture(draft);
    setNotice("Eintrag gespeichert");
  };

  const renderView = () => {
    if (view === "plan") return <PlanView onCompleteTask={actions.completeTask} state={state} />;
    if (view === "calendar") return <CalendarView state={state} />;
    if (view === "hub") return <HubView state={state} />;
    if (view === "reflection") {
      return <ReflectionView onAnalyze={actions.analyzeReport} onApply={actions.applyReport} state={state} />;
    }
    return (
      <TodayView
        dashboard={dashboard}
        onCompleteTask={(taskId) => {
          actions.completeTask(taskId);
          setNotice("Aufgabe erledigt · Fortschritt aktualisiert");
        }}
        onNavigate={navigate}
        state={state}
      />
    );
  };

  return (
    <div className="app-shell">
      <aside className="side-rail">
        <div className="brand-lockup">
          <span className="brand-mark">G</span>
          <span>
            <strong>Life OS</strong>
            <small>by Gerri</small>
          </span>
        </div>
        <nav aria-label="Hauptnavigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                aria-current={view === item.key ? "page" : undefined}
                className={view === item.key ? "active" : ""}
                key={item.key}
                onClick={() => navigate(item.key)}
                type="button"
              >
                <Icon />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="rail-footer">
          <div className="rail-progress">
            <span>Level {state.gamification.level}</span>
            <strong>{state.gamification.points} Punkte</strong>
            <div><span style={{ width: `${state.gamification.points % 100}%` }} /></div>
          </div>
          <button className="rail-settings" onClick={() => setSettingsOpen(true)} type="button">
            <SettingsIcon /> Einstellungen
          </button>
        </div>
      </aside>

      <div className="app-content">
        {state.preferences.presentationMode ? (
          <div className="presentation-banner">
            <span>Präsentationsmodus aktiv</span>
            <p>Beispieldaten · keine persönlichen Inhalte</p>
          </div>
        ) : null}
        <header className="top-bar">
          <div>
            <span className="top-kicker">Heute · {formatDayHeading(new Date())}</span>
            <h1>{view === "today" ? "Guten Tag." : NAV_ITEMS.find((item) => item.key === view)?.label}</h1>
          </div>
          <div className="top-actions">
            <span className="sync-status"><span /> Alles synchronisiert</span>
            <button aria-label="Suchen" className="icon-button" type="button"><SearchIcon /></button>
            <button aria-label="Einstellungen öffnen" className="profile-button" onClick={() => setSettingsOpen(true)} type="button">GE</button>
          </div>
        </header>

        <main id="main-content" tabIndex={-1}>{renderView()}</main>
      </div>

      <button aria-label="Neu erfassen" className="capture-fab" onClick={() => setCaptureOpen(true)} type="button">
        <PlusIcon /> <span>Neu erfassen</span>
      </button>

      <nav aria-label="Hauptnavigation" className="bottom-nav">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              aria-current={view === item.key ? "page" : undefined}
              className={view === item.key ? "active" : ""}
              key={item.key}
              onClick={() => navigate(item.key)}
              type="button"
            >
              <Icon />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <QuickCapture onClose={() => setCaptureOpen(false)} onSave={saveCapture} open={captureOpen} />

      {settingsOpen ? (
        <div className="sheet-backdrop" onMouseDown={() => setSettingsOpen(false)} role="presentation">
          <section
            aria-labelledby="settings-title"
            aria-modal="true"
            className="settings-panel"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="sheet-heading">
              <div>
                <span className="eyebrow">Einstellungen & Datenschutz</span>
                <h2 id="settings-title">Dein Life OS</h2>
              </div>
              <button aria-label="Einstellungen schließen" className="icon-button" onClick={() => setSettingsOpen(false)} type="button"><CloseIcon /></button>
            </div>
            <label className="toggle-row">
              <span>
                <strong>Präsentationsmodus</strong>
                <small>Zeigt ausschließlich neutrale Beispieldaten.</small>
              </span>
              <input
                checked={state.preferences.presentationMode}
                onChange={(event) => actions.setPresentationMode(event.target.checked)}
                type="checkbox"
              />
            </label>
            <div className="settings-block">
              <span className="eyebrow">Datenspeicher</span>
              <h3>Local-first auf diesem Gerät</h3>
              <p>Diese Version speichert deinen Zustand im Browser. Google-Dateien bleiben in Drive; gespeichert werden nur Referenzen. Exportiere regelmäßig ein Backup.</p>
              <div className="button-row">
                <button className="button button-secondary" onClick={actions.exportBackup} type="button">Backup exportieren</button>
                <button className="button button-ghost" onClick={() => importRef.current?.click()} type="button">Backup importieren</button>
                <input
                  accept="application/json"
                  className="visually-hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    try {
                      actions.importBackup(await file.text());
                      setNotice("Backup importiert");
                    } catch {
                      setNotice("Backup konnte nicht gelesen werden");
                    }
                  }}
                  ref={importRef}
                  type="file"
                />
              </div>
            </div>
            <div className="settings-block">
              <span className="eyebrow">Integrationen</span>
              {state.integrations.map((integration) => (
                <div className="settings-integration" key={integration.key}>
                  <span className={`integration-dot status-${integration.status}`} />
                  <p><strong>{integration.label}</strong><small>{integration.detail}</small></p>
                  <span>{integration.status === "demo" ? "Demo" : "Aktiv"}</span>
                </div>
              ))}
            </div>
            <button className="button button-ghost button-full danger-text" onClick={actions.resetDemo} type="button">Beispieldaten zurücksetzen</button>
          </section>
        </div>
      ) : null}

      <div aria-live="polite" className="visually-hidden">{notice}</div>
    </div>
  );
}
