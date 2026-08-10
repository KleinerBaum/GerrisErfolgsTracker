import {
  applicationDocumentPreset,
  resolvedApplicationDocumentPresetId,
} from "./application-document-presets.ts";
import type {
  DocxTemplateAnalysis,
  DocxTemplateProfile,
} from "./docx-template-profile.ts";
import type {
  ApplicationDocumentDesign,
  ApplicationDocumentKind,
  ApplicationDocumentPresetId,
  ApplicationGenerationDesignContext,
  ApplicationGenerationDocumentDesign,
  ApplicationGenerationTemplateLayout,
  ApplicationGenerationVisualization,
  ApplicationOutputKind,
  ApplicationVisualizationPlacement,
  DocumentRef,
} from "./types.ts";

const DOCUMENT_KINDS: readonly ApplicationDocumentKind[] = [
  "tailored-cv",
  "cover-letter",
  "company-brief",
  "interview-prep",
];
const DOCUMENT_KIND_SET = new Set<ApplicationDocumentKind>(DOCUMENT_KINDS);
const PRESET_IDS = new Set<ApplicationDocumentPresetId>([
  "gerris",
  "modern-stylish",
  "professional-stylish",
  "conservative-chic",
]);
const PLACEMENTS = new Set<ApplicationVisualizationPlacement>([
  "after-profile",
  "after-skills",
  "end",
]);

function documentKindLabel(kind: ApplicationDocumentKind): string {
  return {
    "tailored-cv": "CV",
    "cover-letter": "Anschreiben",
    "company-brief": "Briefing",
    "interview-prep": "Interviewmappe",
  }[kind];
}

function selectedDocumentKinds(
  outputKinds: ApplicationOutputKind[],
): ApplicationDocumentKind[] {
  return DOCUMENT_KINDS.filter((kind) => outputKinds.includes(kind));
}

function finiteNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
    ? Math.round(value)
    : null;
}

function safeTemplateLayout(
  profile: DocxTemplateProfile,
): ApplicationGenerationTemplateLayout {
  return {
    status: profile.status,
    page: {
      width: profile.page.width,
      height: profile.page.height,
      margins: { ...profile.page.margins },
    },
    sizes: { ...profile.sizes },
    spacing: { ...profile.spacing },
  };
}

export function applicationDocumentDesignConfigurationIssues({
  analyses,
  design,
  documents,
  outputKinds,
}: {
  analyses: Record<string, DocxTemplateAnalysis>;
  design: ApplicationDocumentDesign;
  documents: DocumentRef[];
  outputKinds: ApplicationOutputKind[];
}): string[] {
  const issues: string[] = [];
  const selectedKinds = selectedDocumentKinds(outputKinds);
  if (design.visualizationsEnabled === null) {
    issues.push("Bitte entscheide ausdrücklich, ob PNG-/SVG-Visualisierungen verwendet werden.");
  }
  for (const kind of selectedKinds) {
    const templateId = design.templateDocumentIds[kind];
    if (!templateId) continue;
    const template = documents.find((document) => document.id === templateId);
    const analysis = analyses[templateId];
    if (!template) {
      issues.push(`Die ausgewählte Formatvorlage für ${documentKindLabel(kind)} fehlt.`);
    } else if (!analysis) {
      issues.push(
        `Die ausgewählte Formatvorlage für ${documentKindLabel(kind)} wird noch geprüft.`,
      );
    } else if (analysis.status === "blocked") {
      issues.push(
        `Die Formatvorlage für ${documentKindLabel(kind)} ist blockiert: ${analysis.error}`,
      );
    }
  }
  if (design.visualizationsEnabled === true) {
    const activeVisuals = design.visualizations.filter((visual) =>
      visual.targetKinds.some((kind) => selectedKinds.includes(kind)),
    );
    if (!activeVisuals.length) {
      issues.push("Bitte mindestens eine Visualisierung für ein ausgewähltes Ergebnis konfigurieren.");
    }
    for (const visual of activeVisuals) {
      const source = documents.find(
        (document) => document.id === visual.sourceDocumentId,
      );
      if (!source) {
        issues.push(`Die Visualisierung „${visual.title || "ohne Titel"}“ fehlt.`);
      } else if (!/\.(?:png|svg)$/i.test(source.name)) {
        issues.push(
          `Die Visualisierung „${visual.title || source.name}“ ist weder PNG noch SVG.`,
        );
      }
      if (!visual.title.trim() || !visual.altText.trim()) {
        issues.push("Jede verwendete Visualisierung benötigt Titel und Alternativtext.");
      }
      if (!visual.confirmedAt) {
        issues.push(
          `Bitte „${visual.title || "Visualisierung"}“ inhaltlich bestätigen.`,
        );
      }
    }
  }
  return [...new Set(issues)];
}

export function buildApplicationGenerationDesignContext({
  analyses,
  design,
  documents,
  outputKinds,
}: {
  analyses: Record<string, DocxTemplateAnalysis>;
  design: ApplicationDocumentDesign;
  documents: DocumentRef[];
  outputKinds: ApplicationOutputKind[];
}): ApplicationGenerationDesignContext | null {
  if (
    !design.selectionConfirmedAt ||
    !Number.isFinite(Date.parse(design.selectionConfirmedAt)) ||
    applicationDocumentDesignConfigurationIssues({
      analyses,
      design,
      documents,
      outputKinds,
    }).length
  ) {
    return null;
  }
  const selectedKinds = selectedDocumentKinds(outputKinds);
  const documentContexts = selectedKinds.map((kind) => {
    const presetId = resolvedApplicationDocumentPresetId(design, kind);
    const templateId = design.templateDocumentIds[kind];
    const analysis = templateId ? analyses[templateId] : null;
    return {
      kind,
      presetId,
      layout: applicationDocumentPreset(presetId).layout,
      customTemplateLayout:
        analysis?.status === "ready" || analysis?.status === "adapted"
          ? safeTemplateLayout(analysis.profile)
          : null,
    } satisfies ApplicationGenerationDocumentDesign;
  });
  const visualizations =
    design.visualizationsEnabled === true
      ? design.visualizations
          .filter((visual) =>
            visual.targetKinds.some((kind) => selectedKinds.includes(kind)),
          )
          .map(
            (visual): ApplicationGenerationVisualization => ({
              title: visual.title.trim(),
              altText: visual.altText.trim(),
              targetKinds: visual.targetKinds.filter((kind) =>
                selectedKinds.includes(kind),
              ),
              placement: visual.placement,
            }),
          )
      : [];
  return {
    selectionConfirmedAt: design.selectionConfirmedAt,
    documents: documentContexts,
    visualizationsEnabled: design.visualizationsEnabled === true,
    visualizations,
  };
}

function normalizedTemplateLayout(
  value: unknown,
): ApplicationGenerationTemplateLayout | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ApplicationGenerationTemplateLayout>;
  if (!candidate.page || !candidate.sizes || !candidate.spacing) return null;
  if (!candidate.status || !["ready", "adapted"].includes(candidate.status)) {
    return null;
  }
  const width = finiteNumber(candidate.page.width, 9_000, 24_000);
  const height = finiteNumber(candidate.page.height, 12_000, 34_000);
  const top = finiteNumber(candidate.page.margins?.top, 540, 2_880);
  const right = finiteNumber(candidate.page.margins?.right, 540, 2_880);
  const bottom = finiteNumber(candidate.page.margins?.bottom, 540, 2_880);
  const left = finiteNumber(candidate.page.margins?.left, 540, 2_880);
  const body = finiteNumber(candidate.sizes.body, 18, 40);
  const title = finiteNumber(candidate.sizes.title, 20, 72);
  const heading1 = finiteNumber(candidate.sizes.heading1, 20, 56);
  const heading2 = finiteNumber(candidate.sizes.heading2, 18, 48);
  const bodyAfter = finiteNumber(candidate.spacing.bodyAfter, 0, 1_000);
  const bodyLine = finiteNumber(candidate.spacing.bodyLine, 180, 720);
  const headingBefore = finiteNumber(candidate.spacing.headingBefore, 0, 1_500);
  const headingAfter = finiteNumber(candidate.spacing.headingAfter, 0, 1_000);
  if (
    [
      width,
      height,
      top,
      right,
      bottom,
      left,
      body,
      title,
      heading1,
      heading2,
      bodyAfter,
      bodyLine,
      headingBefore,
      headingAfter,
    ].some((item) => item === null)
  ) {
    return null;
  }
  return {
    status: candidate.status,
    page: {
      width: width!,
      height: height!,
      margins: { top: top!, right: right!, bottom: bottom!, left: left! },
    },
    sizes: { body: body!, title: title!, heading1: heading1!, heading2: heading2! },
    spacing: {
      bodyAfter: bodyAfter!,
      bodyLine: bodyLine!,
      headingBefore: headingBefore!,
      headingAfter: headingAfter!,
    },
  };
}

export function normalizeApplicationGenerationDesignContext(
  value: unknown,
  outputKinds: ApplicationOutputKind[],
): ApplicationGenerationDesignContext | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ApplicationGenerationDesignContext>;
  if (
    typeof candidate.selectionConfirmedAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.selectionConfirmedAt)) ||
    typeof candidate.visualizationsEnabled !== "boolean" ||
    !Array.isArray(candidate.documents) ||
    !Array.isArray(candidate.visualizations)
  ) {
    return null;
  }
  const requiredKinds = selectedDocumentKinds(outputKinds);
  const documents: ApplicationGenerationDocumentDesign[] = [];
  for (const kind of requiredKinds) {
    const raw = candidate.documents.find(
      (document) => document && typeof document === "object" && document.kind === kind,
    );
    if (!raw || !PRESET_IDS.has(raw.presetId)) return null;
    const preset = applicationDocumentPreset(raw.presetId);
    const customTemplateLayout = raw.customTemplateLayout
      ? normalizedTemplateLayout(raw.customTemplateLayout)
      : null;
    if (raw.customTemplateLayout && !customTemplateLayout) return null;
    documents.push({
      kind,
      presetId: raw.presetId,
      layout: preset.layout,
      customTemplateLayout,
    });
  }
  const visualizations: ApplicationGenerationVisualization[] = [];
  if (candidate.visualizationsEnabled) {
    for (const raw of candidate.visualizations.slice(0, 16)) {
      if (!raw || typeof raw !== "object") return null;
      const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 240) : "";
      const altText = typeof raw.altText === "string" ? raw.altText.trim().slice(0, 500) : "";
      const targetKinds = Array.isArray(raw.targetKinds)
        ? raw.targetKinds.filter(
            (kind): kind is ApplicationDocumentKind =>
              DOCUMENT_KIND_SET.has(kind as ApplicationDocumentKind) &&
              requiredKinds.includes(kind as ApplicationDocumentKind),
          )
        : [];
      if (!title || !altText || !targetKinds.length || !PLACEMENTS.has(raw.placement)) {
        return null;
      }
      visualizations.push({
        title,
        altText,
        targetKinds: [...new Set(targetKinds)],
        placement: raw.placement,
      });
    }
    if (!visualizations.length) return null;
  }
  return {
    selectionConfirmedAt: candidate.selectionConfirmedAt,
    documents,
    visualizationsEnabled: candidate.visualizationsEnabled,
    visualizations,
  };
}

export function applicationGenerationDesignPromptContext(
  context: ApplicationGenerationDesignContext,
  artifact?: ApplicationOutputKind,
) {
  const documentKind =
    artifact && DOCUMENT_KIND_SET.has(artifact as ApplicationDocumentKind)
      ? (artifact as ApplicationDocumentKind)
      : null;
  const includeAllDocuments = artifact === undefined;
  return {
    documents: context.documents.filter(
      (document) => includeAllDocuments || document.kind === documentKind,
    ),
    visualizationsEnabled: context.visualizationsEnabled,
    visualizations: context.visualizations.filter(
      (visual) =>
        includeAllDocuments ||
        (documentKind !== null && visual.targetKinds.includes(documentKind)),
    ),
  };
}
