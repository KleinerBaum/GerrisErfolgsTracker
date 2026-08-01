"use client";

import { useRef, useState } from "react";

import { formatRelativeDate } from "../lib/format";
import {
  masterCvToPlainText,
  normalizeMasterCvContent,
} from "../lib/master-cv";
import type {
  CareerEvidenceConfidence,
  DocumentRef,
  MasterCvContent,
  MasterCvImportBundle,
  MasterCvSection,
} from "../lib/types";

type MasterCvWorkspaceProps = {
  documents: DocumentRef[];
  masterCvDocumentId: string | null;
  careerPassportDocumentId: string | null;
  masterCvContent: MasterCvContent | null;
  onImport: (bundle: MasterCvImportBundle) => void;
  onSave: (content: MasterCvContent) => void;
  toast: (message: string) => void;
};

type ImportResponse = Partial<MasterCvImportBundle> & { error?: string };

const CONFIDENCE_LABELS: Record<CareerEvidenceConfidence, string> = {
  source_only: "aus Quelle übernommen",
  user_confirmed: "von dir bestätigt",
  externally_corroborated: "extern belegt",
};

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${Math.round(bytes / 1_024)} KB`;
  return `${(bytes / 1_048_576).toFixed(1).replace(".", ",")} MB`;
}

function cloneContent(value: MasterCvContent): MasterCvContent {
  return {
    ...value,
    sections: value.sections.map((section) => ({ ...section })),
    passport: {
      ...value.passport,
      targetDirections: [...value.passport.targetDirections],
      sourceDocuments: value.passport.sourceDocuments.map((source) => ({
        ...source,
        notes: [...source.notes],
      })),
      evidence: value.passport.evidence.map((evidence) => ({
        ...evidence,
        restrictions: [...evidence.restrictions],
        roleRelevance: [...evidence.roleRelevance],
      })),
    },
  };
}

function isDocumentRef(value: unknown): value is DocumentRef {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DocumentRef>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.downloadUrl === "string" &&
    candidate.storage === "upload"
  );
}

function downloadEditedVersion(content: MasterCvContent) {
  const blob = new Blob([masterCvToPlainText(content)], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Master-CV-bearbeitet-${new Date().toISOString().slice(0, 10)}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

export function MasterCvWorkspace({
  documents,
  masterCvDocumentId,
  careerPassportDocumentId,
  masterCvContent,
  onImport,
  onSave,
  toast,
}: MasterCvWorkspaceProps) {
  const cvInputRef = useRef<HTMLInputElement>(null);
  const passportInputRef = useRef<HTMLInputElement>(null);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [passportFile, setPassportFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [showImport, setShowImport] = useState(!masterCvContent);
  const [showEditor, setShowEditor] = useState(false);
  const [draft, setDraft] = useState<MasterCvContent | null>(
    masterCvContent ? cloneContent(masterCvContent) : null,
  );
  const masterCvDocument = documents.find(
    (document) => document.id === masterCvDocumentId,
  );
  const passportDocument = documents.find(
    (document) => document.id === careerPassportDocumentId,
  );

  const importBundle = async () => {
    if (!cvFile || !passportFile || busy) return;
    if (!cvFile.name.toLowerCase().endsWith(".docx")) {
      toast("Bitte den Master-CV als DOCX auswählen");
      return;
    }
    if (!passportFile.name.toLowerCase().endsWith(".json")) {
      toast("Bitte den Career Passport als JSON auswählen");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("cv", cvFile);
      form.append("passport", passportFile);
      const response = await fetch("/api/master-cv", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as ImportResponse;
      const content = normalizeMasterCvContent(payload.masterCvContent);
      if (
        !response.ok ||
        !isDocumentRef(payload.cvDocument) ||
        !isDocumentRef(payload.passportDocument) ||
        !content
      ) {
        throw new Error(
          payload.error || "Master-CV und Career Passport konnten nicht importiert werden.",
        );
      }
      onImport({
        cvDocument: payload.cvDocument,
        passportDocument: payload.passportDocument,
        masterCvContent: content,
      });
      setCvFile(null);
      setPassportFile(null);
      if (cvInputRef.current) cvInputRef.current.value = "";
      if (passportInputRef.current) passportInputRef.current.value = "";
      setShowImport(false);
      setShowEditor(true);
      toast("Master-CV und Evidenzregister privat importiert");
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Der Master-CV-Import konnte nicht abgeschlossen werden.",
      );
    } finally {
      setBusy(false);
    }
  };

  const updateSection = (
    index: number,
    patch: Partial<Pick<MasterCvSection, "heading" | "content">>,
  ) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            sections: current.sections.map((section, sectionIndex) =>
              sectionIndex === index ? { ...section, ...patch } : section,
            ),
          }
        : current,
    );
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    setDraft((current) => {
      if (!current) return current;
      const target = index + direction;
      if (target < 0 || target >= current.sections.length) return current;
      const sections = [...current.sections];
      [sections[index], sections[target]] = [sections[target], sections[index]];
      return { ...current, sections };
    });
  };

  const removeSection = (index: number) => {
    setDraft((current) =>
      current && current.sections.length > 1
        ? {
            ...current,
            sections: current.sections.filter(
              (_, sectionIndex) => sectionIndex !== index,
            ),
          }
        : current,
    );
  };

  const addSection = () => {
    setDraft((current) =>
      current
        ? {
            ...current,
            sections: [
              ...current.sections,
              {
                id: `custom-${crypto.randomUUID()}`,
                heading: "Neuer Abschnitt",
                content: "",
              },
            ],
          }
        : current,
    );
  };

  const saveDraft = () => {
    if (!draft) return;
    const name = draft.name.trim();
    const sections = draft.sections
      .map((section) => ({
        ...section,
        heading: section.heading.trim(),
        content: section.content.trim(),
      }))
      .filter((section) => section.heading && section.content);
    if (!name || !sections.length) {
      toast("Name und mindestens ein ausgefüllter Abschnitt sind erforderlich");
      return;
    }
    const saved: MasterCvContent = {
      ...draft,
      name,
      headline: draft.headline.trim(),
      subheadline: draft.subheadline.trim(),
      contactLine: draft.contactLine.trim(),
      sections,
      updatedAt: new Date().toISOString(),
      editRevision: draft.editRevision + 1,
    };
    onSave(saved);
    setDraft(cloneContent(saved));
    setShowEditor(false);
    toast("Bearbeiteter Master-CV gespeichert");
  };

  return (
    <section className="panel master-cv-panel master-cv-workspace">
      <div className="master-cv-summary">
        <div className="master-cv-mark" aria-hidden="true">
          CV
        </div>
        <div className="master-cv-copy">
          <span className="eyebrow">Private Orientierungsgrundlage</span>
          <h2>Master-CV</h2>
          {masterCvContent ? (
            <p>
              <strong>{masterCvContent.headline || masterCvContent.name}</strong>
              <br />
              {masterCvContent.sections.length} Abschnitte ·{" "}
              {masterCvContent.passport.evidence.length} Evidenzen · gespeichert{" "}
              {formatRelativeDate(masterCvContent.updatedAt)}
            </p>
          ) : masterCvDocument ? (
            <p>
              <strong>{masterCvDocument.name}</strong> ist als Datei hinterlegt.
              Importiere zusätzlich den Career Passport, um den Inhalt hier
              bearbeiten zu können.
            </p>
          ) : (
            <p>
              Importiere den vollständigen DOCX-Master-CV zusammen mit dem Career
              Passport. Das Original bleibt unverändert; die Arbeitsfassung wird
              separat und privat bearbeitbar gespeichert.
            </p>
          )}
        </div>
        <div className="master-cv-actions">
          {masterCvContent ? (
            <button
              className="button button-primary"
              onClick={() => setShowEditor((current) => !current)}
              type="button"
            >
              {showEditor ? "Editor schließen" : "Inhalte bearbeiten"}
            </button>
          ) : null}
          <button
            className="button button-soft"
            onClick={() => setShowImport((current) => !current)}
            type="button"
          >
            {masterCvContent ? "Neue Version importieren" : "Import starten"}
          </button>
          {masterCvDocument?.downloadUrl ? (
            <a
              className="button button-ghost"
              href={masterCvDocument.downloadUrl}
              rel="noreferrer"
              target="_blank"
            >
              Original öffnen
            </a>
          ) : null}
          {passportDocument?.downloadUrl ? (
            <a
              className="button button-ghost"
              href={passportDocument.downloadUrl}
              rel="noreferrer"
              target="_blank"
            >
              Passport öffnen
            </a>
          ) : null}
        </div>
      </div>

      {showImport ? (
        <div className="master-cv-import" aria-label="Master-CV importieren">
          <div className="master-cv-import-copy">
            <strong>DOCX und Evidenzregister gemeinsam einlesen</strong>
            <small>
              Beide Dateien werden geprüft und ausschließlich in deiner privaten
              Ablage gespeichert.
            </small>
          </div>
          <input
            accept=".docx"
            className="visually-hidden"
            onChange={(event) => setCvFile(event.target.files?.[0] ?? null)}
            ref={cvInputRef}
            type="file"
          />
          <input
            accept=".json,application/json"
            className="visually-hidden"
            onChange={(event) =>
              setPassportFile(event.target.files?.[0] ?? null)
            }
            ref={passportInputRef}
            type="file"
          />
          <button
            className={`master-cv-file-choice ${cvFile ? "selected" : ""}`}
            onClick={() => cvInputRef.current?.click()}
            type="button"
          >
            <span>DOCX</span>
            <div>
              <strong>{cvFile?.name || "Master-CV auswählen"}</strong>
              <small>
                {cvFile ? formatBytes(cvFile.size) : "Word-Datei · höchstens 8 MB"}
              </small>
            </div>
          </button>
          <button
            className={`master-cv-file-choice ${passportFile ? "selected" : ""}`}
            onClick={() => passportInputRef.current?.click()}
            type="button"
          >
            <span>JSON</span>
            <div>
              <strong>{passportFile?.name || "Career Passport auswählen"}</strong>
              <small>
                {passportFile
                  ? formatBytes(passportFile.size)
                  : "Quellen- und Evidenzregister · höchstens 2 MB"}
              </small>
            </div>
          </button>
          <button
            className="button button-primary"
            disabled={!cvFile || !passportFile || busy}
            onClick={() => void importBundle()}
            type="button"
          >
            {busy ? "Privater Import läuft …" : "Gemeinsam importieren"}
          </button>
        </div>
      ) : null}

      {showEditor && draft ? (
        <div className="master-cv-editor">
          <header>
            <div>
              <span className="eyebrow">Bearbeitbare Arbeitsfassung</span>
              <h3>Inhalte des Master-CV</h3>
            </div>
            <small>
              Änderungen wirken auf künftige Bewerbungspakete. Das DOCX-Original
              und die Evidenzen bleiben unverändert.
            </small>
          </header>
          <div className="master-cv-profile-fields">
            <label>
              Name
              <input
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, name: event.target.value } : current,
                  )
                }
                value={draft.name}
              />
            </label>
            <label>
              Zielposition
              <input
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? { ...current, headline: event.target.value }
                      : current,
                  )
                }
                value={draft.headline}
              />
            </label>
            <label className="wide">
              Profilzeile
              <input
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? { ...current, subheadline: event.target.value }
                      : current,
                  )
                }
                value={draft.subheadline}
              />
            </label>
            <label className="wide">
              Kontaktzeile
              <input
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? { ...current, contactLine: event.target.value }
                      : current,
                  )
                }
                value={draft.contactLine}
              />
            </label>
          </div>
          <div className="master-cv-sections">
            {draft.sections.map((section, index) => (
              <article key={section.id}>
                <div className="master-cv-section-heading">
                  <input
                    aria-label={`Überschrift Abschnitt ${index + 1}`}
                    onChange={(event) =>
                      updateSection(index, { heading: event.target.value })
                    }
                    value={section.heading}
                  />
                  <div>
                    <button
                      aria-label="Abschnitt nach oben"
                      disabled={index === 0}
                      onClick={() => moveSection(index, -1)}
                      type="button"
                    >
                      ↑
                    </button>
                    <button
                      aria-label="Abschnitt nach unten"
                      disabled={index === draft.sections.length - 1}
                      onClick={() => moveSection(index, 1)}
                      type="button"
                    >
                      ↓
                    </button>
                    <button
                      aria-label="Abschnitt entfernen"
                      disabled={draft.sections.length === 1}
                      onClick={() => removeSection(index)}
                      type="button"
                    >
                      Entfernen
                    </button>
                  </div>
                </div>
                <textarea
                  aria-label={`Inhalt Abschnitt ${section.heading}`}
                  onChange={(event) =>
                    updateSection(index, { content: event.target.value })
                  }
                  rows={Math.min(14, Math.max(4, section.content.split("\n").length + 1))}
                  value={section.content}
                />
              </article>
            ))}
          </div>
          <div className="master-cv-editor-actions">
            <button
              className="button button-ghost"
              onClick={addSection}
              type="button"
            >
              Abschnitt hinzufügen
            </button>
            <button
              className="button button-ghost"
              onClick={() =>
                masterCvContent && setDraft(cloneContent(masterCvContent))
              }
              type="button"
            >
              Änderungen verwerfen
            </button>
            <button
              className="button button-primary"
              onClick={saveDraft}
              type="button"
            >
              Arbeitsfassung speichern
            </button>
          </div>
        </div>
      ) : null}

      {masterCvContent ? (
        <div className="master-cv-evidence-grid">
          <details className="master-cv-evidence">
            <summary>
              Quellen & Evidenz ansehen ·{" "}
              {masterCvContent.passport.evidence.length} Einträge
            </summary>
            <div className="master-cv-evidence-body">
              <p>
                Das Register ist bewusst schreibgeschützt. Änderungen am CV-Text
                verändern die zugrunde liegenden Quellen nicht automatisch.
              </p>
              <div className="master-cv-targets">
                {masterCvContent.passport.targetDirections.map((target) => (
                  <span key={target}>{target}</span>
                ))}
              </div>
              <div className="master-cv-evidence-list">
                {masterCvContent.passport.evidence.map((evidence) => (
                  <article key={evidence.evidenceId}>
                    <div>
                      <strong>{evidence.evidenceId}</strong>
                      <span>{CONFIDENCE_LABELS[evidence.confidence]}</span>
                    </div>
                    <p>{evidence.safeWording}</p>
                    <small>
                      Quelle: {evidence.sourceName || evidence.sourceType}
                    </small>
                    {evidence.restrictions.length ? (
                      <small>
                        Grenzen: {evidence.restrictions.join(" · ")}
                      </small>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          </details>
          <button
            className="button button-ghost"
            onClick={() => downloadEditedVersion(masterCvContent)}
            type="button"
          >
            Bearbeitete Fassung herunterladen
          </button>
        </div>
      ) : null}
    </section>
  );
}
