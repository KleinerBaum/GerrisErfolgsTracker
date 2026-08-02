"use client";

import { useState } from "react";

import { suggestTaskComplexity } from "../lib/gamification-client";
import {
  BASE_XP,
  DIFFICULTY_LABELS,
  localComplexityAssessment,
  normalizeAssessment,
} from "../lib/gamification";
import {
  DIFFICULTY_BANDS,
  VERIFICATION_TYPES,
  type ComplexityAssessment,
  type DifficultyBand,
  type Task,
  type TaskGamificationProfile,
  type VerificationType,
} from "../lib/types";

const FACTOR_LABELS: Array<{
  key: "effort" | "cognitiveLoad" | "activationBarrier" | "coordination";
  label: string;
  weight: string;
}> = [
  { key: "effort", label: "Aufwand", weight: "35 %" },
  { key: "cognitiveLoad", label: "Denklast", weight: "25 %" },
  { key: "activationBarrier", label: "Überwindung", weight: "20 %" },
  { key: "coordination", label: "Koordination", weight: "20 %" },
];

const VERIFICATION_LABELS: Record<VerificationType, string> = {
  USER_CONFIRM: "Eigene Bestätigung",
  CHECKLIST: "Checkliste vollständig",
  ARTIFACT: "Ergebnis oder Datei geprüft",
  GOOGLE_TASK: "Abschluss in Google Tasks",
};

type RewardAssessmentDialogProps = {
  task: Task;
  existingProfile: TaskGamificationProfile | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (profile: TaskGamificationProfile) => void;
  onCompleteWithoutReward: () => void;
};

export function RewardAssessmentDialog({
  task,
  existingProfile,
  busy,
  onClose,
  onConfirm,
  onCompleteWithoutReward,
}: RewardAssessmentDialogProps) {
  const initial = existingProfile?.assessment ?? localComplexityAssessment(task);
  const [assessment, setAssessment] = useState<ComplexityAssessment>(initial);
  const [difficultyBand, setDifficultyBand] = useState<DifficultyBand>(
    existingProfile?.difficultyBand ?? initial.suggestedBand,
  );
  const [verificationType, setVerificationType] = useState<VerificationType>(
    existingProfile?.verificationType ?? "GOOGLE_TASK",
  );
  const [weeklyAnchor, setWeeklyAnchor] = useState(Boolean(existingProfile?.weeklyAnchor));
  const [scheduledBlock, setScheduledBlock] = useState(
    Boolean(existingProfile?.scheduledBlock),
  );
  const [verifiedMilestone, setVerifiedMilestone] = useState(
    Boolean(existingProfile?.verifiedMilestone),
  );
  const [loadingAi, setLoadingAi] = useState(false);
  const [error, setError] = useState("");

  const updateFactor = (
    key: "effort" | "cognitiveLoad" | "activationBarrier" | "coordination",
    value: number,
  ) => {
    const next = normalizeAssessment(
      { ...assessment, [key]: value, source: "FALLBACK" },
      assessment,
    );
    setAssessment(next);
    setDifficultyBand(next.suggestedBand);
  };

  const loadAiSuggestion = async () => {
    if (loadingAi) return;
    setLoadingAi(true);
    setError("");
    try {
      const result = await suggestTaskComplexity(task);
      setAssessment(result);
      setDifficultyBand(result.suggestedBand);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Der KI-Vorschlag konnte nicht geladen werden.",
      );
    } finally {
      setLoadingAi(false);
    }
  };

  const confirm = () => {
    const now = new Date().toISOString();
    onConfirm({
      taskId: task.id,
      difficultyBand,
      assessment,
      confirmedAt: now,
      verificationType,
      weeklyAnchor,
      scheduledBlock,
      verifiedMilestone,
      anchorRole: existingProfile?.anchorRole ?? null,
      anchorDate: existingProfile?.anchorDate ?? null,
    });
  };

  const bonus = Math.min(
    25,
    (weeklyAnchor ? 10 : 0) +
      (scheduledBlock ? 10 : 0) +
      (verifiedMilestone ? 15 : 0),
  );
  const previewXp =
    difficultyBand === "BOSS"
      ? null
      : Math.round(BASE_XP[difficultyBand] * (1 + bonus / 100));

  return (
    <div className="dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="reward-assessment-title"
        aria-modal="true"
        className="reward-assessment-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="dialog-heading">
          <div>
            <span className="eyebrow">Belohnung</span>
            <h2 id="reward-assessment-title">Wie anspruchsvoll war diese Aufgabe?</h2>
          </div>
          <button aria-label="Schließen" disabled={busy} onClick={onClose} type="button">
            Schließen
          </button>
        </header>

        <div className="assessment-task-copy">
          <strong>{task.title}</strong>
          <span>{task.estimateMinutes} Minuten geschätzt</span>
        </div>

        <div className="assessment-ai-row">
          <div>
            <strong>{assessment.source === "AI" ? "KI-Vorschlag" : "Lokaler Vorschlag"}</strong>
            <p>
              Für den optionalen KI-Vorschlag werden nur Titel, Dauer, Lebensbereich und
              Prioritätsart gesendet – keine Notizen, Kalenderdaten oder Personen.
            </p>
          </div>
          <button
            className="button button-soft"
            disabled={loadingAi || busy}
            onClick={() => void loadAiSuggestion()}
            type="button"
          >
            {loadingAi ? "Vorschlag wird geladen …" : "KI-Vorschlag laden"}
          </button>
        </div>

        <div className="assessment-factors">
          {FACTOR_LABELS.map((factor) => (
            <label key={factor.key}>
              <span>
                <strong>{factor.label}</strong>
                <small>Gewichtung {factor.weight}</small>
              </span>
              <input
                aria-label={`${factor.label} von 1 bis 5`}
                max={5}
                min={1}
                onChange={(event) => updateFactor(factor.key, Number(event.target.value))}
                step={1}
                type="range"
                value={assessment[factor.key]}
              />
              <b>{assessment[factor.key]}</b>
            </label>
          ))}
        </div>

        <div className="assessment-score-row">
          <span>Gewichtete Komplexität</span>
          <strong>{assessment.weightedScore.toFixed(2).replace(".", ",")} / 5</strong>
          <p>{assessment.explanation}</p>
        </div>

        <div className="assessment-confirm-grid">
          <label>
            Bestätigte Klasse
            <select
              onChange={(event) => setDifficultyBand(event.target.value as DifficultyBand)}
              value={difficultyBand}
            >
              {DIFFICULTY_BANDS.map((band) => (
                <option key={band} value={band}>
                  {band} · {DIFFICULTY_LABELS[band]}
                  {band === "BOSS" ? " · Meilensteine + 20 %" : ` · ${BASE_XP[band]} XP`}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nachweis
            <select
              onChange={(event) => setVerificationType(event.target.value as VerificationType)}
              value={verificationType}
            >
              {VERIFICATION_TYPES.map((type) => (
                <option key={type} value={type}>{VERIFICATION_LABELS[type]}</option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="assessment-bonus-options">
          <legend>Bestätigte Boni · zusammen höchstens +25 %</legend>
          <label>
            <input
              checked={weeklyAnchor}
              onChange={(event) => setWeeklyAnchor(event.target.checked)}
              type="checkbox"
            />
            <span><strong>Wochenanker</strong><small>+10 %</small></span>
          </label>
          <label>
            <input
              checked={scheduledBlock}
              onChange={(event) => setScheduledBlock(event.target.checked)}
              type="checkbox"
            />
            <span><strong>Im selbst gewählten Kalenderblock</strong><small>+10 %</small></span>
          </label>
          <label>
            <input
              checked={verifiedMilestone}
              onChange={(event) => setVerifiedMilestone(event.target.checked)}
              type="checkbox"
            />
            <span><strong>Überprüfter Meilenstein</strong><small>+15 %</small></span>
          </label>
        </fieldset>

        <div className="assessment-reward-preview">
          <span>Deine Belohnung</span>
          <strong>
            {previewXp === null ? "Meilenstein-XP + 20 %" : `${previewXp} XP`}
          </strong>
          <small>Nur Abschlüsse zählen. Unteraufgaben teilen das Budget der Hauptaufgabe.</small>
        </div>

        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="assessment-actions">
          <button
            className="button button-ghost"
            disabled={busy}
            onClick={onCompleteWithoutReward}
            type="button"
          >
            Ohne Belohnung abschließen
          </button>
          <button
            className="button button-primary"
            disabled={busy}
            onClick={confirm}
            type="button"
          >
            {busy ? "Wird abgeschlossen …" : "Bestätigen & abschließen"}
          </button>
        </div>
      </section>
    </div>
  );
}
