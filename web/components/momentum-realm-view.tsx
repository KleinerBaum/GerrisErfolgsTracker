"use client";

import { useState, type FormEvent } from "react";

import {
  ANCHOR_DAY_STATUS_LABELS,
  ANCHOR_ROLE_LABELS,
  anchorRhythm,
  BASE_XP,
  completionMessage,
  DIFFICULTY_LABELS,
  ledgerTotals,
  levelForXp,
  REWARD_MODE_LABELS,
  rewardPresentations,
  WORLD_DISTRICT_LABELS,
  WORLD_UPGRADE_COSTS,
} from "../lib/gamification";
import { isoDateInput } from "../lib/format";
import {
  DIFFICULTY_BANDS,
  REWARD_MODES,
  type AnchorDayStatus,
  type AnchorRole,
  type AppState,
  type Goal,
  type RewardFeedbackRating,
  type RewardMode,
  type RewardPresentation,
  type WorldDistrictKey,
  type WorldUpgradeKind,
} from "../lib/types";

const MODE_COPY: Record<RewardMode, string> = {
  POINTS: "Klare XP, Level und selbst gewählte Belohnungen.",
  FANTASY: "Deine Lebensbereiche wachsen als ruhige Fantasiewelt.",
  ADAPTIVE: "Maximal zwei passende Gratifikationen, ohne den Punktwert zu verändern.",
};

const PRESENTATION_LABELS: Record<RewardPresentation, string> = {
  POINTS: "Klarpunkte",
  FANTASY: "Weltfortschritt",
  MESSAGE: "Begleitung",
};

const DISTRICT_TONES: Record<WorldDistrictKey, string> = {
  ARCHIVE: "archive",
  TREASURY: "treasury",
  WORKSHOP: "workshop",
  LIBRARY: "library",
  HEARTH: "hearth",
  GARDEN: "garden",
};

const districtKeys = Object.keys(WORLD_DISTRICT_LABELS) as WorldDistrictKey[];
const upgradeKinds = Object.keys(WORLD_UPGRADE_COSTS) as WorldUpgradeKind[];

function costLabel(kind: WorldUpgradeKind): string {
  const cost = WORLD_UPGRADE_COSTS[kind];
  return [
    `${cost.energy} Energie`,
    cost.runes ? `${cost.runes} ${cost.runes === 1 ? "Rune" : "Runen"}` : "",
    cost.blueprints ? `${cost.blueprints} Bauplan` : "",
    cost.bossKeys ? `${cost.bossKeys} Boss-Schlüssel` : "",
  ]
    .filter(Boolean)
    .join(" + ");
}

type MomentumRealmViewProps = {
  state: AppState;
  onModeChange: (mode: RewardMode) => void;
  onAnchorChange: (taskId: string, role: AnchorRole | null) => void;
  onAnchorDayStatusChange: (status: AnchorDayStatus) => void;
  onBuild: (district: WorldDistrictKey, kind: WorldUpgradeKind) => void;
  onRedeem: (rewardId: string) => void;
  onFeedback: (
    ledgerEntryId: string,
    presentation: RewardPresentation,
    rating: RewardFeedbackRating,
  ) => void;
  onSurprisesChange: (enabled: boolean) => void;
  onDrRossChange: (enabled: boolean) => void;
  onAddGoal: (goal: Goal) => void;
  onOpenTasks: () => void;
};

export function MomentumRealmView({
  state,
  onModeChange,
  onAnchorChange,
  onAnchorDayStatusChange,
  onBuild,
  onRedeem,
  onFeedback,
  onSurprisesChange,
  onDrRossChange,
  onAddGoal,
  onOpenTasks,
}: MomentumRealmViewProps) {
  const game = state.gamification;
  const today = isoDateInput();
  const [selectedDistrict, setSelectedDistrict] =
    useState<WorldDistrictKey>("ARCHIVE");
  const [selectedUpgrade, setSelectedUpgrade] =
    useState<WorldUpgradeKind>("DECORATION");
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalDone, setGoalDone] = useState("");
  const [goalNext, setGoalNext] = useState("");
  const [goalSituation, setGoalSituation] = useState("");
  const [goalAction, setGoalAction] = useState("");
  const [goalMilestones, setGoalMilestones] = useState("\n\n");
  const [goalError, setGoalError] = useState("");

  if (!game) return null;

  const totals = ledgerTotals(game.ledger);
  const level = levelForXp(totals.earnedXp);
  const rhythm = anchorRhythm(game.anchorDays, today);
  const currentDay = game.anchorDays.find((day) => day.date === today);
  const currentStatus = currentDay?.status ?? "PLANNED";
  const openTasks = state.tasks.filter((task) => !task.completed);
  const currentAnchors = new Map(
    game.profiles
      .filter((profile) => profile.anchorDate === today && profile.anchorRole)
      .map((profile) => [profile.anchorRole as AnchorRole, profile]),
  );
  const presentations = rewardPresentations(game);
  const latestReward = [...game.ledger]
    .reverse()
    .find((entry) => entry.kind === "TASK_REWARD" || entry.kind === "BOSS_REWARD");
  const approvedNamedMessages = game.approvedMessages.filter(
    (message) =>
      message.active &&
      message.contentType !== "GENERIC_AI" &&
      Boolean(message.approvedAt) &&
      Boolean(message.permissionReference.trim()),
  );
  const celebration = completionMessage("CELEBRATE", game);

  const districtStats = districtKeys.map((district) => {
    const earnedEnergy = game.ledger
      .filter((entry) => entry.district === district && entry.energyDelta > 0)
      .reduce((sum, entry) => sum + entry.energyDelta, 0);
    const upgrades = game.world.upgrades.filter((item) => item.district === district);
    return { district, earnedEnergy, upgrades };
  });

  const submitGoal = (event: FormEvent) => {
    event.preventDefault();
    const milestones = goalMilestones
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    if (!goalTitle.trim() || !goalDone.trim() || !goalNext.trim()) {
      setGoalError("Titel, Definition of Done und nächster Schritt sind erforderlich.");
      return;
    }
    if (milestones.length < 3 || milestones.length > 7) {
      setGoalError("Eine Kampagne braucht drei bis sieben konkrete Meilensteine.");
      return;
    }
    onAddGoal({
      id: `goal-${Date.now()}`,
      title: goalTitle.trim(),
      definitionOfDone: goalDone.trim(),
      nextStep: goalNext.trim(),
      ifThenPlan:
        goalSituation.trim() && goalAction.trim()
          ? `Wenn ${goalSituation.trim()}, dann ${goalAction.trim()}.`
          : "",
      milestones: milestones.map((title, index) => ({
        id: `milestone-${Date.now()}-${index}`,
        title,
        completedAt: null,
      })),
      completedAt: null,
    });
    setGoalTitle("");
    setGoalDone("");
    setGoalNext("");
    setGoalSituation("");
    setGoalAction("");
    setGoalMilestones("\n\n");
    setGoalError("");
    setGoalOpen(false);
  };

  return (
    <div className="view-stack momentum-view">
      <section className="momentum-hero">
        <div className="momentum-hero-copy">
          <span className="eyebrow">Ein Fortschrittssystem · drei Erlebnisweisen</span>
          <h1 tabIndex={-1}>Momentum Realm</h1>
          <p>
            Dein Fortschritt bleibt derselbe, egal welche Belohnungswelt du heute
            sehen möchtest. Keine Minuspunkte, kein Verfall und kein zerbrechlicher
            Streak.
          </p>
          <div className="momentum-mode-switch" aria-label="Belohnungswelt wählen">
            {REWARD_MODES.map((mode) => (
              <button
                aria-pressed={game.rewardMode === mode}
                className={game.rewardMode === mode ? "active" : ""}
                key={mode}
                onClick={() => onModeChange(mode)}
                type="button"
              >
                <strong>{REWARD_MODE_LABELS[mode]}</strong>
                <small>{MODE_COPY[mode]}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="momentum-score-card">
          <span>Gesamter Fortschritt</span>
          <strong>{totals.earnedXp.toLocaleString("de-DE")} XP</strong>
          <small>
            Level {level} · {totals.balanceXp.toLocaleString("de-DE")} Klarpunkte verfügbar
          </small>
          <div className="momentum-level-track" aria-label={`Fortschritt in Level ${level}`}>
            <span style={{ width: `${(totals.earnedXp % 250) / 2.5}%` }} />
          </div>
          <p>{celebration.text}</p>
          <small>{celebration.attribution}</small>
        </div>
      </section>

      <section className="momentum-summary-grid" aria-label="Fortschrittsübersicht">
        <article>
          <span>Rhythmus · 14 Tage</span>
          <strong>{rhythm.plannedDays ? `${rhythm.percent} %` : "Noch offen"}</strong>
          <small>
            {rhythm.fulfilledDays} von {rhythm.plannedDays} geplanten Ankertagen erfüllt
          </small>
        </article>
        <article>
          <span>Bauressourcen</span>
          <strong>{totals.energy} Energie</strong>
          <small>{totals.runes} Runen · {totals.blueprints} Baupläne</small>
        </article>
        <article>
          <span>Mutglut</span>
          <strong>{totals.courageEmbers}</strong>
          <small>Für bestätigte Aufgaben mit hoher Überwindung</small>
        </article>
        <article>
          <span>Kampagnen</span>
          <strong>{game.goals.filter((goal) => !goal.completedAt).length}</strong>
          <small>Boss-Schlüssel: {totals.bossKeys}</small>
        </article>
      </section>

      <section className="panel momentum-anchors">
        <header className="momentum-section-heading">
          <div>
            <span className="eyebrow">Heute · maximal drei Anker</span>
            <h2>Weniger auswählen, klarer vorankommen.</h2>
            <p>
              Urlaub, Ruhe und bewusst ausgesetzte Tage zählen nicht gegen deinen
              Rhythmus.
            </p>
          </div>
          <div className="anchor-status-switch" aria-label="Art des heutigen Tages">
            {(Object.keys(ANCHOR_DAY_STATUS_LABELS) as AnchorDayStatus[]).map((status) => (
              <button
                aria-pressed={currentStatus === status}
                className={currentStatus === status ? "active" : ""}
                key={status}
                onClick={() => onAnchorDayStatusChange(status)}
                type="button"
              >
                {ANCHOR_DAY_STATUS_LABELS[status]}
              </button>
            ))}
          </div>
        </header>
        {currentStatus === "PLANNED" ? (
          <div className="anchor-grid">
            {(["KEY", "QUICK_WIN", "SUPPLY"] as AnchorRole[]).map((role) => {
              const profile = currentAnchors.get(role);
              return (
                <label key={role}>
                  <span>{ANCHOR_ROLE_LABELS[role]}</span>
                  <small>
                    {role === "KEY"
                      ? "Das wichtigste sichtbare Ergebnis"
                      : role === "QUICK_WIN"
                        ? "Ein kleiner Einstieg oder Abschluss"
                        : "Administration, Gesundheit oder Beziehungspflege"}
                  </small>
                  <select
                    onChange={(event) => {
                      const nextTaskId = event.target.value;
                      if (!nextTaskId && profile) onAnchorChange(profile.taskId, null);
                      if (nextTaskId) onAnchorChange(nextTaskId, role);
                    }}
                    value={profile?.taskId ?? ""}
                  >
                    <option value="">Noch nicht gewählt</option>
                    {openTasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
        ) : (
          <div className="anchor-rest-state">
            <strong>{ANCHOR_DAY_STATUS_LABELS[currentStatus]} ist eingeplant.</strong>
            <p>Dieser Tag bleibt außerhalb des Rhythmus-Nenners. Es geht nichts verloren.</p>
          </div>
        )}
      </section>

      <section className="momentum-two-column">
        <div className="panel realm-panel">
          <header className="momentum-section-heading">
            <div>
              <span className="eyebrow">Lebende Chronik</span>
              <h2>Deine Bezirke wachsen aus echten Abschlüssen.</h2>
            </div>
          </header>
          <div className="realm-district-grid">
            {districtStats.map(({ district, earnedEnergy, upgrades }) => (
              <button
                aria-pressed={selectedDistrict === district}
                className={`${DISTRICT_TONES[district]} ${selectedDistrict === district ? "active" : ""}`}
                key={district}
                onClick={() => setSelectedDistrict(district)}
                type="button"
              >
                <span className="district-sigil" aria-hidden="true" />
                <strong>{WORLD_DISTRICT_LABELS[district]}</strong>
                <small>{earnedEnergy} Energie erzeugt · {upgrades.length} Ausbauten</small>
              </button>
            ))}
          </div>
          <div className="realm-builder">
            <label>
              Nächster Ausbau für {WORLD_DISTRICT_LABELS[selectedDistrict]}
              <select
                onChange={(event) => setSelectedUpgrade(event.target.value as WorldUpgradeKind)}
                value={selectedUpgrade}
              >
                {upgradeKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {WORLD_UPGRADE_COSTS[kind].label} · {costLabel(kind)}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button button-primary"
              onClick={() => onBuild(selectedDistrict, selectedUpgrade)}
              type="button"
            >
              Bewusst ausbauen
            </button>
            <p>
              Weltinhalte sind Gratifikation. Aufgaben, Kalender und andere wichtige
              Kompass-Funktionen werden niemals gesperrt.
            </p>
          </div>
        </div>

        <div className="panel reward-catalog-panel">
          <header className="momentum-section-heading">
            <div>
              <span className="eyebrow">Klarpunkte-Katalog</span>
              <h2>Du entscheidest, was sich wirklich gut anfühlt.</h2>
            </div>
          </header>
          <div className="reward-catalog-list">
            {game.rewardCatalog.filter((reward) => reward.active).map((reward) => (
              <article key={reward.id}>
                <span>{reward.cost} Punkte</span>
                <strong>{reward.title}</strong>
                <button
                  disabled={totals.balanceXp < reward.cost}
                  onClick={() => onRedeem(reward.id)}
                  type="button"
                >
                  Als eingelöst markieren
                </button>
              </article>
            ))}
          </div>
          <p className="reward-safety-note">
            Der Kompass markiert nur deine Entscheidung. Er kauft und bucht niemals etwas.
          </p>
        </div>
      </section>

      <section className="panel campaign-panel">
        <header className="momentum-section-heading">
          <div>
            <span className="eyebrow">Kampagnen statt vager Großziele</span>
            <h2>Definition of Done, drei bis sieben Meilensteine, nächster Schritt.</h2>
          </div>
          <button className="button button-soft" onClick={() => setGoalOpen((open) => !open)} type="button">
            {goalOpen ? "Formular schließen" : "Kampagne anlegen"}
          </button>
        </header>
        {game.goals.length ? (
          <div className="campaign-list">
            {game.goals.map((goal) => (
              <article key={goal.id}>
                <span>{goal.completedAt ? "Abgeschlossen" : "Aktive Kampagne"}</span>
                <h3>{goal.title}</h3>
                <p><strong>Fertig, wenn:</strong> {goal.definitionOfDone}</p>
                <p><strong>Nächster Schritt:</strong> {goal.nextStep}</p>
                {goal.ifThenPlan ? <blockquote>{goal.ifThenPlan}</blockquote> : null}
                <small>
                  {goal.milestones.filter((item) => item.completedAt).length} von {goal.milestones.length} Meilensteinen
                </small>
              </article>
            ))}
          </div>
        ) : (
          <div className="campaign-empty">
            <strong>Noch keine Kampagne angelegt.</strong>
            <p>Normale Aufgaben bleiben vollständig nutzbar. Kampagnen helfen nur bei größeren Zielen.</p>
          </div>
        )}
        {goalOpen ? (
          <form className="campaign-form" onSubmit={submitGoal}>
            <label>
              Kampagnenname
              <input onChange={(event) => setGoalTitle(event.target.value)} value={goalTitle} />
            </label>
            <label>
              Definition of Done
              <textarea onChange={(event) => setGoalDone(event.target.value)} rows={2} value={goalDone} />
            </label>
            <label>
              Drei bis sieben Meilensteine · einer pro Zeile
              <textarea onChange={(event) => setGoalMilestones(event.target.value)} rows={5} value={goalMilestones} />
            </label>
            <label>
              Konkreter nächster Schritt
              <input onChange={(event) => setGoalNext(event.target.value)} value={goalNext} />
            </label>
            <div className="if-then-fields">
              <label>
                Wenn …
                <input
                  onChange={(event) => setGoalSituation(event.target.value)}
                  placeholder="Dienstag um 09:00 mein Fokusblock beginnt"
                  value={goalSituation}
                />
              </label>
              <label>
                dann …
                <input
                  onChange={(event) => setGoalAction(event.target.value)}
                  placeholder="öffne ich Projekt X und beginne Meilenstein Y"
                  value={goalAction}
                />
              </label>
            </div>
            {goalError ? <p className="form-error" role="alert">{goalError}</p> : null}
            <button className="button button-primary" type="submit">Kampagne speichern</button>
          </form>
        ) : null}
      </section>

      <section className="momentum-two-column">
        <div className="panel reward-ledger-panel">
          <header className="momentum-section-heading">
            <div>
              <span className="eyebrow">Append-only · Engine v1</span>
              <h2>Jeder Reward bleibt nachvollziehbar.</h2>
            </div>
          </header>
          <div className="reward-ledger-list">
            {[...game.ledger].reverse().slice(0, 8).map((entry) => (
              <article key={entry.id}>
                <span>{entry.sequence.toString().padStart(3, "0")}</span>
                <div>
                  <strong>{entry.description}</strong>
                  <small>
                    {new Date(entry.createdAt).toLocaleDateString("de-DE")}
                    {entry.difficultyBand ? ` · ${entry.difficultyBand}` : ""}
                    {entry.bonusPercent ? ` · +${entry.bonusPercent} %` : ""}
                  </small>
                </div>
                <b className={entry.xpDelta < 0 ? "spent" : ""}>
                  {entry.xpDelta > 0 ? "+" : ""}{entry.xpDelta} XP
                </b>
              </article>
            ))}
          </div>
          {!game.ledger.length ? <p>Noch keine Ledger-Einträge.</p> : null}
        </div>

        <div className="panel momentum-controls-panel">
          <header className="momentum-section-heading">
            <div>
              <span className="eyebrow">Druck niedrig halten</span>
              <h2>Optionale Ebenen bleiben wirklich optional.</h2>
            </div>
          </header>
          <label className="momentum-toggle-row">
            <span>
              <strong>Kosmetische Überraschungen</strong>
              <small>12 %, spätestens beim achten geeigneten Abschluss, höchstens zweimal pro Woche</small>
            </span>
            <input
              checked={game.surprisesEnabled}
              onChange={(event) => onSurprisesChange(event.target.checked)}
              type="checkbox"
            />
          </label>
          <label className="momentum-toggle-row">
            <span>
              <strong>Dr.-Roß-Begleitung</strong>
              <small>
                {approvedNamedMessages.length
                  ? `${approvedNamedMessages.length} dokumentiert freigegebene Inhalte verfügbar`
                  : "Bleibt aus, bis schriftlich freigegebene Inhalte mit Nachweis vorliegen"}
              </small>
            </span>
            <input
              checked={game.drRossEnabled}
              disabled={!approvedNamedMessages.length}
              onChange={(event) => onDrRossChange(event.target.checked)}
              type="checkbox"
            />
          </label>
          <div className="quiet-hours-note">
            <strong>Quiet Hours</strong>
            <span>{game.quietHours.start}–{game.quietHours.end} Uhr</span>
          </div>
          <p>
            Keine Diagnosen, kein Schuld- oder Schamton, keine frei erfundene Persona.
            Allgemeine Coachtexte werden nie Dr. Roß zugeschrieben.
          </p>
          {latestReward ? (
            <div className="reward-feedback-box">
              <strong>Wie wirkte die letzte Belohnung?</strong>
              <p>Gewichtungen ändern sich frühestens nach 14 Tagen und höchstens um fünf Prozentpunkte pro Woche.</p>
              {presentations.map((presentation) => (
                <div key={presentation}>
                  <span>{PRESENTATION_LABELS[presentation]}</span>
                  {(["MOTIVATING", "NEUTRAL", "DISTURBING"] as RewardFeedbackRating[]).map((value) => (
                    <button
                      key={value}
                      onClick={() => onFeedback(latestReward.id, presentation, value)}
                      type="button"
                    >
                      {value === "MOTIVATING" ? "Motivierend" : value === "NEUTRAL" ? "Neutral" : "Störend"}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <details className="panel reward-rules-panel">
        <summary>So berechnet die Regel-Engine die Belohnung</summary>
        <p>
          Die KI darf Aufwand, Denklast, Überwindung und Koordination von 1 bis 5
          vorschlagen. Du bestätigst die Klasse; erst danach berechnet die lokale
          Engine die XP. Dringlichkeit verändert nur die Reihenfolge.
        </p>
        <div className="reward-rule-grid">
          {DIFFICULTY_BANDS.map((band) => (
            <article key={band}>
              <strong>{band} · {DIFFICULTY_LABELS[band]}</strong>
              <span>{band === "BOSS" ? "Meilensteine + 20 %" : `${BASE_XP[band]} Basis-XP`}</span>
            </article>
          ))}
        </div>
        <p>
          Wochenanker +10 %, bestätigter Kalenderblock +10 %, überprüfter Meilenstein +15 %;
          zusammen höchstens +25 %. Unteraufgaben teilen das Budget ihrer Hauptaufgabe.
        </p>
        <button className="button button-soft" onClick={onOpenTasks} type="button">
          Aufgaben und Einstufungen öffnen
        </button>
      </details>
    </div>
  );
}
