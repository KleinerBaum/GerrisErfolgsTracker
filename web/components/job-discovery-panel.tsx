"use client";

import { useMemo, useRef, useState } from "react";

import {
  buildRoleSearchPrompt,
  MAX_ROLE_IMPORT_BYTES,
  stageRoleImport,
  type RoleImportCandidatePreview,
  type RoleImportPreview,
} from "../lib/role-import";
import { normalizeJobSearchProfile } from "../lib/role-pipeline";
import type {
  ApplicationProcess,
  JobSearchProfile,
  MasterCvContent,
} from "../lib/types";

type JobDiscoveryPanelProps = {
  applications: ApplicationProcess[];
  masterCvContent: MasterCvContent | null;
  profile: JobSearchProfile | undefined;
  onAccept: (candidates: RoleImportCandidatePreview[]) => {
    createdIds: string[];
    mergedIds: string[];
  };
  onProfileChange: (profile: JobSearchProfile) => void;
  toast: (message: string) => void;
};

type ProfileDraft = {
  targetTracks: string;
  locations: string;
  remoteAllowed: boolean;
  employmentTypes: string;
  minimumSalaryAnnual: string;
  excludedEmployers: string;
  excludedTitles: string;
  excludedKeywords: string;
  excludedContractTypes: string;
};

const splitLines = (value: string): string[] =>
  value
    .split(/[\r\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);

function profileDraft(profile: JobSearchProfile): ProfileDraft {
  return {
    targetTracks: profile.targetTracks.join("\n"),
    locations: profile.locations.join(", "),
    remoteAllowed: profile.remoteAllowed,
    employmentTypes: profile.employmentTypes.join(", "),
    minimumSalaryAnnual: profile.minimumSalaryAnnual?.toString() ?? "",
    excludedEmployers: profile.hardExclusions.employers.join(", "),
    excludedTitles: profile.hardExclusions.titles.join(", "),
    excludedKeywords: profile.hardExclusions.keywords.join(", "),
    excludedContractTypes: profile.hardExclusions.contractTypes.join(", "),
  };
}

const DUPLICATE_LABELS = {
  provider_job_id: "gleiche Provider-ID",
  exact_url: "gleicher Link",
  employer_title: "gleicher Arbeitgeber und Titel",
  description: "sehr ähnlicher Anzeigentext",
} as const;

const ORIGINAL_LINK_LABELS = {
  missing: "Original-Link fehlt",
  provider_link: "nur Provider-Link",
  claimed_original: "Original-Link behauptet · noch prüfen",
} as const;

export function JobDiscoveryPanel({
  applications,
  masterCvContent,
  profile,
  onAccept,
  onProfileChange,
  toast,
}: JobDiscoveryPanelProps) {
  const normalizedProfile = useMemo(
    () =>
      normalizeJobSearchProfile(
        profile,
        masterCvContent?.passport.targetDirections,
      ),
    [masterCvContent?.passport.targetDirections, profile],
  );
  const [draft, setDraft] = useState<ProfileDraft>(() =>
    profileDraft(normalizedProfile),
  );
  const [profileDirty, setProfileDirty] = useState(false);
  const [includeJooble, setIncludeJooble] = useState(false);
  const [promptFallback, setPromptFallback] = useState("");
  const [importText, setImportText] = useState("");
  const [preview, setPreview] = useState<RoleImportPreview | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const updateDraft = <K extends keyof ProfileDraft>(
    key: K,
    value: ProfileDraft[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setProfileDirty(true);
    setPromptFallback("");
  };

  const saveAndReviewProfile = () => {
    const now = new Date().toISOString();
    const next = normalizeJobSearchProfile(
      {
        schemaVersion: 1,
        targetTracks: splitLines(draft.targetTracks),
        locations: splitLines(draft.locations),
        remoteAllowed: draft.remoteAllowed,
        employmentTypes: splitLines(draft.employmentTypes),
        minimumSalaryAnnual: draft.minimumSalaryAnnual
          ? Number(draft.minimumSalaryAnnual)
          : null,
        salaryCurrency: "EUR",
        hardExclusions: {
          employers: splitLines(draft.excludedEmployers),
          titles: splitLines(draft.excludedTitles),
          keywords: splitLines(draft.excludedKeywords),
          contractTypes: splitLines(draft.excludedContractTypes),
        },
        reviewedAt: now,
        updatedAt: now,
      },
      masterCvContent?.passport.targetDirections,
      now,
    );
    onProfileChange(next);
    setProfileDirty(false);
    toast("Suchprofil geprüft und gespeichert");
  };

  const copySearchPrompt = async () => {
    if (profileDirty || !normalizedProfile.reviewedAt) {
      toast("Bitte das sichtbare Suchprofil zuerst prüfen und speichern");
      return;
    }
    const prompt = buildRoleSearchPrompt(normalizedProfile, includeJooble);
    try {
      await navigator.clipboard.writeText(prompt);
      setPromptFallback("");
      toast("Datensparsamer Suchauftrag kopiert");
    } catch {
      setPromptFallback(prompt);
      toast("Suchauftrag ist unten zum manuellen Kopieren geöffnet");
    }
  };

  const stage = (value = importText) => {
    const result = stageRoleImport(
      value,
      applications,
      normalizedProfile,
    );
    setPreview(result);
    setSelectedIds(
      new Set(
        result.candidates
          .filter((candidate) => candidate.errors.length === 0)
          .map((candidate) => candidate.id),
      ),
    );
    if (!result.candidates.length) {
      toast(result.errors[0] || "Keine verwertbaren Treffer erkannt");
    }
  };

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_ROLE_IMPORT_BYTES) {
      toast("Die JSON-Datei darf höchstens 500 KB groß sein");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    const value = await file.text();
    setImportText(value);
    stage(value);
    if (fileRef.current) fileRef.current.value = "";
  };

  const acceptSelected = () => {
    if (!preview) return;
    const selected = preview.candidates.filter(
      (candidate) =>
        selectedIds.has(candidate.id) && candidate.errors.length === 0,
    );
    if (!selected.length) {
      toast("Bitte mindestens einen gültigen Treffer auswählen");
      return;
    }
    const result = onAccept(selected);
    const parts = [
      result.createdIds.length
        ? `${result.createdIds.length} neu vorgemerkt`
        : "",
      result.mergedIds.length
        ? `${result.mergedIds.length} bestehende Akten ergänzt`
        : "",
    ].filter(Boolean);
    toast(parts.join(" · ") || "Keine Änderung erforderlich");
    setPreview(null);
    setSelectedIds(new Set());
    setImportText("");
  };

  return (
    <section className="panel job-discovery-panel" aria-labelledby="job-discovery-title">
      <header className="job-discovery-heading">
        <div>
          <span className="eyebrow">Entdecken · prüfen · entscheiden</span>
          <h2 id="job-discovery-title">Suchprofil &amp; Quellen</h2>
          <p>
            Indeed und optional Jooble liefern Treffer. Gerris übernimmt erst nach
            deiner sichtbaren Auswahl und verifiziert danach die Originalanzeige.
          </p>
        </div>
        <span className={normalizedProfile.reviewedAt && !profileDirty ? "ready" : "open"}>
          {normalizedProfile.reviewedAt && !profileDirty
            ? "Profil geprüft"
            : "Prüfung offen"}
        </span>
      </header>

      <details className="job-discovery-group" open={!normalizedProfile.reviewedAt}>
        <summary>
          <span>
            <strong>Suchprofil prüfen</strong>
            <small>
              {normalizedProfile.targetTracks.length} Tracks · {normalizedProfile.locations.join(" · ")}
            </small>
          </span>
          <b>Anpassen</b>
        </summary>
        <div className="job-discovery-content">
          <label className="wide">
            Zieltracks · ein Track pro Zeile
            <textarea
              onChange={(event) => updateDraft("targetTracks", event.target.value)}
              rows={3}
              value={draft.targetTracks}
            />
          </label>
          <div className="job-discovery-grid">
            <label>
              Land, Ort oder Region
              <input
                onChange={(event) => updateDraft("locations", event.target.value)}
                value={draft.locations}
              />
            </label>
            <label>
              Beschäftigungsarten
              <input
                onChange={(event) =>
                  updateDraft("employmentTypes", event.target.value)
                }
                value={draft.employmentTypes}
              />
            </label>
            <label>
              Gehaltsuntergrenze brutto/Jahr
              <input
                min={1}
                onChange={(event) =>
                  updateDraft("minimumSalaryAnnual", event.target.value)
                }
                placeholder="Optional"
                step={500}
                type="number"
                value={draft.minimumSalaryAnnual}
              />
            </label>
            <label className="job-discovery-check">
              <input
                checked={draft.remoteAllowed}
                onChange={(event) =>
                  updateDraft("remoteAllowed", event.target.checked)
                }
                type="checkbox"
              />
              <span>Remote- oder Hybridrollen einbeziehen</span>
            </label>
          </div>
          <details className="job-exclusion-group">
            <summary>Harte Ausschlüsse</summary>
            <div className="job-discovery-grid">
              <label>
                Arbeitgeber
                <input
                  onChange={(event) =>
                    updateDraft("excludedEmployers", event.target.value)
                  }
                  placeholder="Kommagetrennt"
                  value={draft.excludedEmployers}
                />
              </label>
              <label>
                Titel
                <input
                  onChange={(event) =>
                    updateDraft("excludedTitles", event.target.value)
                  }
                  placeholder="Kommagetrennt"
                  value={draft.excludedTitles}
                />
              </label>
              <label>
                Stichwörter
                <input
                  onChange={(event) =>
                    updateDraft("excludedKeywords", event.target.value)
                  }
                  placeholder="Kommagetrennt"
                  value={draft.excludedKeywords}
                />
              </label>
              <label>
                Vertragsarten
                <input
                  onChange={(event) =>
                    updateDraft("excludedContractTypes", event.target.value)
                  }
                  placeholder="z. B. Arbeitnehmerüberlassung"
                  value={draft.excludedContractTypes}
                />
              </label>
            </div>
          </details>
          <button
            className="button button-soft"
            onClick={saveAndReviewProfile}
            type="button"
          >
            Suchprofil speichern und prüfen
          </button>
        </div>
      </details>

      <div className="job-search-command">
        <label className="job-discovery-check">
          <input
            checked={includeJooble}
            onChange={(event) => setIncludeJooble(event.target.checked)}
            type="checkbox"
          />
          <span>Jooble nur für diesen Suchlauf zuschalten</span>
        </label>
        <button
          className="button button-primary"
          disabled={profileDirty || !normalizedProfile.reviewedAt}
          onClick={() => void copySearchPrompt()}
          type="button"
        >
          Suchauftrag kopieren
        </button>
      </div>
      <p className="job-discovery-trust">
        Übergeben werden nur Suchpräferenzen und Ausschlüsse. Master-CV,
        Kontaktdaten und Bewerbungshistorie bleiben in Gerris.
      </p>
      {promptFallback ? (
        <label>
          Suchauftrag manuell kopieren
          <textarea readOnly rows={8} value={promptFallback} />
        </label>
      ) : null}

      <details className="job-discovery-group job-import-group">
        <summary>
          <span>
            <strong>Treffer übernehmen</strong>
            <small>JSON-Datei, eingefügtes JSON oder eine URL je Zeile</small>
          </span>
          <b>Vorschau</b>
        </summary>
        <div className="job-discovery-content">
          <label>
            GerrisRoleImportV1 oder Stellen-URLs
            <textarea
              maxLength={MAX_ROLE_IMPORT_BYTES}
              onChange={(event) => setImportText(event.target.value)}
              placeholder="JSON einfügen oder https://… je Zeile"
              rows={6}
              value={importText}
            />
          </label>
          <div className="job-import-actions">
            <input
              accept="application/json,.json"
              className="visually-hidden"
              onChange={(event) => void loadFile(event.target.files?.[0])}
              ref={fileRef}
              type="file"
            />
            <button
              className="button button-ghost"
              onClick={() => fileRef.current?.click()}
              type="button"
            >
              JSON-Datei wählen
            </button>
            <button
              className="button button-soft"
              disabled={!importText.trim()}
              onClick={() => stage()}
              type="button"
            >
              Nicht persistierte Vorschau
            </button>
          </div>

          {preview ? (
            <div className="job-import-preview" aria-live="polite">
              <div className="job-import-preview-heading">
                <strong>{preview.candidates.length} Treffer in der Vorschau</strong>
                <span>
                  Indeed-Profil: {preview.indeedProfileStatus ?? "bei URL-Import nicht verwendet"}
                </span>
              </div>
              {preview.errors.length ? (
                <ul className="job-import-errors">
                  {preview.errors.map((error) => <li key={error}>{error}</li>)}
                </ul>
              ) : null}
              <div className="job-import-candidates">
                {preview.candidates.map((item) => (
                  <label className={item.errors.length ? "blocked" : ""} key={item.id}>
                    <input
                      checked={selectedIds.has(item.id)}
                      disabled={item.errors.length > 0}
                      onChange={(event) =>
                        setSelectedIds((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(item.id);
                          else next.delete(item.id);
                          return next;
                        })
                      }
                      type="checkbox"
                    />
                    <span>
                      <strong>
                        {item.candidate.employer || "Arbeitgeber fehlt"} · {item.candidate.title || "Titel fehlt"}
                      </strong>
                      <small>
                        {item.candidate.provider} · {item.completenessPercent}% vollständig · {ORIGINAL_LINK_LABELS[item.originalLinkStatus]}
                      </small>
                      {item.duplicate ? (
                        <small>Dublettenhinweis: {DUPLICATE_LABELS[item.duplicate.reason]}</small>
                      ) : null}
                      {item.hardExclusionMatches.length ? (
                        <small className="critical">
                          Vorgeschlagene Entscheidung Skip: {item.hardExclusionMatches.join(" · ")}
                        </small>
                      ) : null}
                      {[...item.errors, ...item.warnings].length ? (
                        <small>{[...item.errors, ...item.warnings].join(" · ")}</small>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
              <button
                className="button button-primary"
                disabled={!selectedIds.size || preview.errors.length > 0}
                onClick={acceptSelected}
                type="button"
              >
                Ausgewählte vormerken
              </button>
            </div>
          ) : null}
        </div>
      </details>
    </section>
  );
}
