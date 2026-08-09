"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import {
  applicationTemplateDocuments,
  applicationVisualDocuments,
  loadPrivateDocumentBytes,
  newVisualizationConfiguration,
  uploadApplicationDesignFile,
} from "../lib/application-document-design";
import {
  analyzeDocxTemplate,
  type DocxTemplateAnalysis,
} from "../lib/docx-template-profile";
import {
  APPLICATION_DOCUMENT_PRESETS,
  applicationDocumentPreset,
} from "../lib/application-document-presets";
import { safePrivateFileUrl } from "../lib/document-library";
import { decodeAndSanitizeSvg } from "../lib/safe-svg";
import type {
  ApplicationDocumentDesign,
  ApplicationDocumentKind,
  ApplicationDocumentPresetId,
  ApplicationDocumentVisualization,
  ApplicationOutputKind,
  DocumentRef,
} from "../lib/types";

const DOCUMENT_KINDS: ReadonlyArray<{
  key: ApplicationDocumentKind;
  label: string;
}> = [
  { key: "tailored-cv", label: "CV" },
  { key: "cover-letter", label: "Anschreiben" },
  { key: "company-brief", label: "Briefing" },
  { key: "interview-prep", label: "Interviewmappe" },
];

const PLACEMENTS: ReadonlyArray<{
  key: ApplicationDocumentVisualization["placement"];
  label: string;
}> = [
  { key: "after-profile", label: "Nach Profil" },
  { key: "after-skills", label: "Nach Skills" },
  { key: "end", label: "Am Ende" },
];

export function ApplicationVisualPreview({ source, alt }: { source: DocumentRef; alt: string }) {
  const extension = source.name.split(".").pop()?.toLowerCase();
  const directUrl = safePrivateFileUrl(source.downloadUrl || source.driveUrl);
  const sourceKey = `${source.id}:${directUrl ?? ""}`;
  const [svgPreview, setSvgPreview] = useState<{
    sourceKey: string;
    url: string;
  } | null>(null);

  useEffect(() => {
    let disposed = false;
    let ownedUrl: string | null = null;
    if (extension !== "svg" || !directUrl) return () => undefined;
    void (async () => {
      try {
        const bytes = await loadPrivateDocumentBytes(source);
        const safe = decodeAndSanitizeSvg(bytes);
        ownedUrl = URL.createObjectURL(
          new Blob([safe.svg], { type: "image/svg+xml;charset=utf-8" }),
        );
        if (!disposed) setSvgPreview({ sourceKey, url: ownedUrl });
      } catch {
        // Die Vorschau bleibt leer; der sichere Export prüft die Ressource erneut.
      }
    })();
    return () => {
      disposed = true;
      if (ownedUrl) URL.revokeObjectURL(ownedUrl);
    };
  }, [directUrl, extension, source, sourceKey]);

  const previewUrl =
    extension === "png"
      ? directUrl
      : extension === "svg" && svgPreview?.sourceKey === sourceKey
        ? svgPreview.url
        : null;

  return previewUrl ? (
    // Private Blob- und Download-URLs können nicht durch den Next-Bildoptimierer laufen.
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt || source.name} loading="lazy" src={previewUrl} />
  ) : (
    <span aria-hidden="true">Vorschau nicht verfügbar</span>
  );
}

export function ApplicationDesignPanel({
  analyses,
  design,
  documents,
  onAnalysis,
  onChange,
  onSaveDocument,
  outputKinds,
  toast,
}: {
  analyses: Record<string, DocxTemplateAnalysis>;
  design: ApplicationDocumentDesign;
  documents: DocumentRef[];
  onAnalysis: (documentId: string, analysis: DocxTemplateAnalysis) => void;
  onChange: (design: ApplicationDocumentDesign) => void;
  onSaveDocument: (document: DocumentRef) => void;
  outputKinds: ApplicationOutputKind[];
  toast: (message: string) => void;
}) {
  const templateInput = useRef<HTMLInputElement>(null);
  const visualInput = useRef<HTMLInputElement>(null);
  const loadingTemplateIds = useRef(new Set<string>());
  const [uploadedDocuments, setUploadedDocuments] = useState<DocumentRef[]>([]);
  const [templateTarget, setTemplateTarget] =
    useState<ApplicationDocumentKind>("tailored-cv");
  const [libraryVisualId, setLibraryVisualId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const allDocuments = useMemo(() => {
    const byId = new Map(documents.map((document) => [document.id, document]));
    uploadedDocuments.forEach((document) => byId.set(document.id, document));
    return [...byId.values()];
  }, [documents, uploadedDocuments]);
  const templates = applicationTemplateDocuments(allDocuments);
  const visuals = applicationVisualDocuments(allDocuments);
  const selectedOutputKinds = outputKinds.filter(
    (kind): kind is ApplicationDocumentKind => kind !== "application-email",
  );

  useEffect(() => {
    const selectedIds = Object.values(design.templateDocumentIds).filter(
      (value): value is string => Boolean(value),
    );
    for (const documentId of selectedIds) {
      if (analyses[documentId] || loadingTemplateIds.current.has(documentId)) continue;
      const template = allDocuments.find((document) => document.id === documentId);
      if (!template) continue;
      loadingTemplateIds.current.add(documentId);
      void (async () => {
        try {
          const bytes = await loadPrivateDocumentBytes(template);
          onAnalysis(documentId, await analyzeDocxTemplate(bytes, template.name));
        } catch (error) {
          onAnalysis(documentId, {
            status: "blocked",
            profile: null,
            warnings: [],
            error: error instanceof Error ? error.message : "Vorlage nicht erreichbar.",
          });
        } finally {
          loadingTemplateIds.current.delete(documentId);
        }
      })();
    }
  }, [allDocuments, analyses, design.templateDocumentIds, onAnalysis]);

  const updateVisual = (
    id: string,
    update: Partial<ApplicationDocumentVisualization>,
    preserveConfirmation = false,
  ) => {
    onChange({
      ...design,
      visualizations: design.visualizations.map((visual) =>
        visual.id === id
          ? {
              ...visual,
              ...update,
              confirmedAt: preserveConfirmation
                ? (update.confirmedAt ?? visual.confirmedAt)
                : null,
            }
          : visual,
      ),
    });
  };

  const handleTemplateUpload = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await uploadApplicationDesignFile(file, "template");
      setUploadedDocuments((current) => [...current, result.document]);
      onSaveDocument(result.document);
      if (result.analysis) onAnalysis(result.document.id, result.analysis);
      onChange({
        ...design,
        templateDocumentIds: {
          ...design.templateDocumentIds,
          [templateTarget]: result.document.id,
        },
      });
      toast(
        result.analysis?.status === "adapted"
          ? "Formatvorlage sicher adaptiert und privat gespeichert"
          : "Formatvorlage geprüft und privat gespeichert",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload fehlgeschlagen.");
    } finally {
      setBusy(false);
      if (templateInput.current) templateInput.current.value = "";
    }
  };

  const updateDocumentDesign = (
    kind: ApplicationDocumentKind,
    selection: string,
  ) => {
    const templateDocumentIds = { ...design.templateDocumentIds };
    const presetOverrides = { ...design.presetOverrides };
    if (selection === "package") {
      templateDocumentIds[kind] = null;
      presetOverrides[kind] = null;
    } else if (selection.startsWith("preset:")) {
      templateDocumentIds[kind] = null;
      const presetId = selection.slice("preset:".length) as ApplicationDocumentPresetId;
      presetOverrides[kind] =
        presetId === design.basePresetId ? null : presetId;
    } else if (selection.startsWith("template:")) {
      templateDocumentIds[kind] = selection.slice("template:".length) || null;
    }
    onChange({ ...design, presetOverrides, templateDocumentIds });
  };

  const handleVisualUpload = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await uploadApplicationDesignFile(file, "visual");
      setUploadedDocuments((current) => [...current, result.document]);
      onSaveDocument(result.document);
      onChange({
        ...design,
        visualizations: [
          ...design.visualizations,
          newVisualizationConfiguration(result.document, selectedOutputKinds),
        ],
      });
      toast("Visualisierung geprüft und privat gespeichert");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload fehlgeschlagen.");
    } finally {
      setBusy(false);
      if (visualInput.current) visualInput.current.value = "";
    }
  };

  return (
    <details className="studio-option-group application-design-panel">
      <summary>
        <span>
          <strong>Format &amp; Visualisierungen</strong>
          <small>
            {applicationDocumentPreset(design.basePresetId).label} ·{" "}
            {Object.values(design.templateDocumentIds).filter(Boolean).length} eigene Vorlagen ·{" "}
            {design.visualizations.length} Visualisierungen
          </small>
        </span>
        <b aria-hidden="true">Anpassen</b>
      </summary>
      <div className="studio-option-content application-design-content">
        <div className="design-privacy-note">
          <strong>Nur das visuelle System wird übernommen.</strong>
          <p>
            Referenztexte, Links, Metadaten und riskante Word-Konstruktionen bleiben draußen.
            Dateien werden nicht an das Sprachmodell übermittelt.
          </p>
        </div>

        <section className="design-section" aria-labelledby="package-design-title">
          <div className="design-section-heading">
            <div>
              <strong id="package-design-title">Paketdesign</strong>
              <small>Gilt zunächst für CV, Anschreiben, Briefing und Interviewmappe.</small>
            </div>
          </div>
          <fieldset className="document-preset-grid">
            <legend className="visually-hidden">Paketdesign wählen</legend>
            {APPLICATION_DOCUMENT_PRESETS.map((preset) => (
              <label
                className={`document-preset-card${
                  design.basePresetId === preset.id ? " is-selected" : ""
                }`}
                key={preset.id}
                style={
                  {
                    "--preset-accent": `#${preset.colors.accent}`,
                    "--preset-ink": `#${preset.colors.title}`,
                    "--preset-soft": `#${preset.colors.soft}`,
                  } as CSSProperties
                }
              >
                <input
                  checked={design.basePresetId === preset.id}
                  name="application-package-design"
                  onChange={() =>
                    onChange({
                      ...design,
                      basePresetId: preset.id,
                      presetOverrides: Object.fromEntries(
                        Object.entries(design.presetOverrides).map(([kind, override]) => [
                          kind,
                          override === preset.id ? null : override,
                        ]),
                      ) as ApplicationDocumentDesign["presetOverrides"],
                    })
                  }
                  type="radio"
                  value={preset.id}
                />
                <span className="document-preset-swatch" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <strong>{preset.label}</strong>
                <small>{preset.description}</small>
              </label>
            ))}
          </fieldset>

          <details className="document-design-overrides">
            <summary>
              <span>
                <strong>Je Dokument anpassen</strong>
                <small>
                  Eingebaute Designs oder eine private DOCX-Vorlage auswählen.
                </small>
              </span>
              <b aria-hidden="true">Optional</b>
            </summary>
            <div className="document-design-overrides-content">
              <div className="design-upload-actions">
                <select
                  aria-label="Dokumenttyp für neue Vorlage"
                  onChange={(event) =>
                    setTemplateTarget(event.target.value as ApplicationDocumentKind)
                  }
                  value={templateTarget}
                >
                  {DOCUMENT_KINDS.map((kind) => (
                    <option key={kind.key} value={kind.key}>{kind.label}</option>
                  ))}
                </select>
                <button
                  className="button button-soft"
                  disabled={busy}
                  onClick={() => templateInput.current?.click()}
                  type="button"
                >
                  Private DOCX hochladen
                </button>
                <input
                  accept=".docx"
                  className="visually-hidden"
                  onChange={(event) => void handleTemplateUpload(event.target.files?.[0])}
                  ref={templateInput}
                  type="file"
                />
              </div>
              <div className="template-selection-grid">
                {DOCUMENT_KINDS.map((kind) => {
                  const selectedId = design.templateDocumentIds[kind.key];
                  const selectedOverride = design.presetOverrides[kind.key];
                  const selectedValue = selectedId
                    ? `template:${selectedId}`
                    : selectedOverride
                      ? `preset:${selectedOverride}`
                      : "package";
                  const analysis = selectedId ? analyses[selectedId] : null;
                  const missing = selectedId && !allDocuments.some((item) => item.id === selectedId);
                  return (
                    <label key={kind.key}>
                      <span>{kind.label}</span>
                      <select
                        aria-label={`${kind.label} gestalten`}
                        onChange={(event) => updateDocumentDesign(kind.key, event.target.value)}
                        value={selectedValue}
                      >
                        <option value="package">
                          Paketdesign – {applicationDocumentPreset(design.basePresetId).label}
                        </option>
                        {APPLICATION_DOCUMENT_PRESETS.map((preset) => (
                          <option key={preset.id} value={`preset:${preset.id}`}>
                            {preset.label}
                          </option>
                        ))}
                        {templates.map((template) => (
                          <option key={template.id} value={`template:${template.id}`}>
                            Eigene Vorlage – {template.name}
                          </option>
                        ))}
                      </select>
                      {selectedId ? (
                        <small className="design-priority-note">
                          Eigene DOCX-Vorlage hat für dieses Dokument Vorrang.
                        </small>
                      ) : null}
                      {missing ? <small className="design-status blocked">Ressource fehlt</small> : null}
                      {analysis ? (
                        <small className={`design-status ${analysis.status}`}>
                          {analysis.status === "ready"
                            ? "Geprüft"
                            : analysis.status === "adapted"
                              ? `Sicher adaptiert${analysis.warnings.length ? ` · ${analysis.warnings[0]}` : ""}`
                              : `Blockiert · ${analysis.error}`}
                        </small>
                      ) : selectedId && !missing ? (
                        <small className="design-status">Wird lokal analysiert …</small>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </div>
          </details>
        </section>

        <section className="design-section" aria-labelledby="visual-library-title">
          <div className="design-section-heading">
            <div>
              <strong id="visual-library-title">PNG-/SVG-Visualisierungen</strong>
              <small>Inline, proportional und auf die Seite begrenzt.</small>
            </div>
            <button
              className="button button-soft"
              disabled={busy}
              onClick={() => visualInput.current?.click()}
              type="button"
            >
              PNG oder SVG hochladen
            </button>
            <input
              accept=".png,.svg"
              className="visually-hidden"
              onChange={(event) => void handleVisualUpload(event.target.files?.[0])}
              ref={visualInput}
              type="file"
            />
          </div>
          {visuals.length ? (
            <div className="design-library-picker">
              <select
                aria-label="Visualisierung aus Bibliothek"
                onChange={(event) => setLibraryVisualId(event.target.value)}
                value={libraryVisualId}
              >
                <option value="">Aus privater Bibliothek wählen …</option>
                {visuals.map((visual) => (
                  <option key={visual.id} value={visual.id}>{visual.name}</option>
                ))}
              </select>
              <button
                className="button button-ghost"
                disabled={!libraryVisualId || design.visualizations.some((item) => item.sourceDocumentId === libraryVisualId)}
                onClick={() => {
                  const source = visuals.find((visual) => visual.id === libraryVisualId);
                  if (!source) return;
                  onChange({
                    ...design,
                    visualizations: [
                      ...design.visualizations,
                      newVisualizationConfiguration(source, selectedOutputKinds),
                    ],
                  });
                  setLibraryVisualId("");
                }}
                type="button"
              >
                Hinzufügen
              </button>
            </div>
          ) : null}

          <div className="visual-configuration-list">
            {design.visualizations.map((visual) => {
              const source = allDocuments.find(
                (document) => document.id === visual.sourceDocumentId,
              );
              return (
                <article className="visual-configuration-card" key={visual.id}>
                  <div className="visual-thumbnail">
                    {source ? (
                      <ApplicationVisualPreview alt={visual.altText} source={source} />
                    ) : (
                      <span>Ressource fehlt</span>
                    )}
                  </div>
                  <div className="visual-configuration-fields">
                    <div className="design-section-heading">
                      <strong>{source?.name ?? "Fehlende Visualisierung"}</strong>
                      <button
                        className="button button-ghost"
                        onClick={() =>
                          onChange({
                            ...design,
                            visualizations: design.visualizations.filter(
                              (candidate) => candidate.id !== visual.id,
                            ),
                          })
                        }
                        type="button"
                      >
                        Entfernen
                      </button>
                    </div>
                    <div className="form-grid">
                      <label>
                        Sichtbarer Titel
                        <input
                          onChange={(event) => updateVisual(visual.id, { title: event.target.value })}
                          value={visual.title}
                        />
                      </label>
                      <label>
                        Position
                        <select
                          onChange={(event) =>
                            updateVisual(visual.id, {
                              placement: event.target.value as ApplicationDocumentVisualization["placement"],
                            })
                          }
                          value={visual.placement}
                        >
                          {PLACEMENTS.map((placement) => (
                            <option key={placement.key} value={placement.key}>{placement.label}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label>
                      Alternativtext
                      <input
                        onChange={(event) => updateVisual(visual.id, { altText: event.target.value })}
                        placeholder="Was zeigt die Grafik inhaltlich?"
                        value={visual.altText}
                      />
                    </label>
                    <fieldset className="visual-targets">
                      <legend>Einfügen in</legend>
                      {DOCUMENT_KINDS.map((kind) => (
                        <label key={kind.key}>
                          <input
                            checked={visual.targetKinds.includes(kind.key)}
                            onChange={(event) =>
                              updateVisual(visual.id, {
                                targetKinds: event.target.checked
                                  ? [...new Set([...visual.targetKinds, kind.key])]
                                  : visual.targetKinds.filter((candidate) => candidate !== kind.key),
                              })
                            }
                            type="checkbox"
                          />
                          {kind.label}
                        </label>
                      ))}
                    </fieldset>
                    <label className="visual-confirmation">
                      <input
                        checked={Boolean(visual.confirmedAt)}
                        disabled={!source || !visual.title.trim() || !visual.altText.trim() || !visual.targetKinds.length}
                        onChange={(event) =>
                          updateVisual(
                            visual.id,
                            { confirmedAt: event.target.checked ? new Date().toISOString() : null },
                            true,
                          )
                        }
                        type="checkbox"
                      />
                      <span>
                        <strong>Inhalt ausdrücklich bestätigt</strong>
                        <small>Ich habe Grafik, Titel und Alternativtext geprüft.</small>
                      </span>
                    </label>
                  </div>
                </article>
              );
            })}
          </div>
          {!design.visualizations.length ? (
            <p className="design-empty-state">Noch keine Visualisierung konfiguriert.</p>
          ) : null}
        </section>
        {message ? <p className="form-error" role="alert">{message}</p> : null}
      </div>
    </details>
  );
}
