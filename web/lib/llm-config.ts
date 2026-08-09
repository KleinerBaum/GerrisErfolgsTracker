import type {
  ApplicationArtifactModelSetting,
  ApplicationArtifactModelSettings,
  ApplicationOutputKind,
  LlmModelTier,
  LlmReasoningEffort,
} from "./types.ts";

export const LLM_MODEL_IDS: Record<LlmModelTier, string> = {
  luna: "gpt-5.6-luna",
  terra: "gpt-5.6-terra",
  sol: "gpt-5.6-sol",
};

export const LLM_MODEL_OPTIONS: ReadonlyArray<{
  key: LlmModelTier;
  label: string;
  description: string;
}> = [
  { key: "luna", label: "Luna", description: "sparsam und schnell" },
  { key: "terra", label: "Terra", description: "Qualität und Kosten im Gleichgewicht" },
  { key: "sol", label: "Sol", description: "höchste Qualität für besonders wichtige Texte" },
];

export const LLM_REASONING_OPTIONS: ReadonlyArray<{
  key: LlmReasoningEffort;
  label: string;
}> = [
  { key: "none", label: "Ohne zusätzlichen Denkaufwand" },
  { key: "low", label: "Niedrig" },
  { key: "medium", label: "Mittel" },
  { key: "high", label: "Hoch" },
  { key: "xhigh", label: "Sehr hoch" },
];

const MODEL_TIERS = new Set<LlmModelTier>(["luna", "terra", "sol"]);
const REASONING_EFFORTS = new Set<LlmReasoningEffort>([
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
]);

export const APPLICATION_ARTIFACT_KINDS = [
  "tailored-cv",
  "cover-letter",
  "application-email",
  "company-brief",
  "interview-prep",
] as const satisfies readonly ApplicationOutputKind[];

export function isLlmModelTier(value: unknown): value is LlmModelTier {
  return typeof value === "string" && MODEL_TIERS.has(value as LlmModelTier);
}

export function isLlmReasoningEffort(
  value: unknown,
): value is LlmReasoningEffort {
  return (
    typeof value === "string" &&
    REASONING_EFFORTS.has(value as LlmReasoningEffort)
  );
}

export const DEFAULT_APPLICATION_MODEL_SETTINGS: ApplicationArtifactModelSettings = {
  "tailored-cv": { model: "terra", effort: "medium" },
  "cover-letter": { model: "terra", effort: "medium" },
  "application-email": { model: "luna", effort: "low" },
  "company-brief": { model: "luna", effort: "low" },
  "interview-prep": { model: "luna", effort: "medium" },
};

export function applicationModelSetting(
  kind: ApplicationOutputKind,
  value: unknown,
): ApplicationArtifactModelSetting {
  const fallback = DEFAULT_APPLICATION_MODEL_SETTINGS[kind];
  if (!value || typeof value !== "object") return { ...fallback };
  const candidate = value as Partial<ApplicationArtifactModelSetting>;
  return {
    model: isLlmModelTier(candidate.model) ? candidate.model : fallback.model,
    effort: isLlmReasoningEffort(candidate.effort)
      ? candidate.effort
      : fallback.effort,
  };
}

export function strictApplicationModelSettings(
  value: unknown,
): ApplicationArtifactModelSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Die Modellkonfiguration ist unvollständig.");
  }
  const candidate = value as Record<string, unknown>;
  if (
    Object.keys(candidate).some(
      (key) =>
        !APPLICATION_ARTIFACT_KINDS.includes(key as ApplicationOutputKind),
    )
  ) {
    throw new Error("Die Modellkonfiguration enthält ein unbekanntes Ergebnis.");
  }
  const settings = {} as ApplicationArtifactModelSettings;
  for (const kind of APPLICATION_ARTIFACT_KINDS) {
    const raw = candidate[kind];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Die Modellkonfiguration für ${kind} fehlt.`);
    }
    const setting = raw as Record<string, unknown>;
    if (
      Object.keys(setting).some((key) => !["model", "effort"].includes(key)) ||
      !isLlmModelTier(setting.model) ||
      !isLlmReasoningEffort(setting.effort)
    ) {
      throw new Error(`Modell oder Aufwand für ${kind} ist nicht zulässig.`);
    }
    settings[kind] = {
      model: setting.model,
      effort: setting.effort,
    };
  }
  return settings;
}

export function modelIdForTier(tier: LlmModelTier): string {
  return LLM_MODEL_IDS[tier];
}

export type WebLlmPurpose =
  | "vacancy_research"
  | "email_draft"
  | "journal_analysis"
  | "gamification_assessment";

export type WebLlmPurposeConfig = {
  model: string;
  effort: LlmReasoningEffort;
  maxOutputTokens: number;
};

export const WEB_LLM_PURPOSE_CONFIGS: Record<
  WebLlmPurpose,
  WebLlmPurposeConfig
> = {
  vacancy_research: {
    model: LLM_MODEL_IDS.luna,
    effort: "low",
    maxOutputTokens: 5_000,
  },
  email_draft: {
    model: LLM_MODEL_IDS.luna,
    effort: "low",
    maxOutputTokens: 2_400,
  },
  journal_analysis: {
    model: LLM_MODEL_IDS.luna,
    effort: "medium",
    maxOutputTokens: 4_000,
  },
  gamification_assessment: {
    model: LLM_MODEL_IDS.luna,
    effort: "none",
    maxOutputTokens: 900,
  },
};

const APPLICATION_OUTPUT_BUDGETS: Record<
  ApplicationOutputKind,
  Record<LlmReasoningEffort, number>
> = {
  "tailored-cv": {
    none: 4_000,
    low: 5_000,
    medium: 7_000,
    high: 9_000,
    xhigh: 12_000,
  },
  "cover-letter": {
    none: 2_400,
    low: 3_000,
    medium: 4_000,
    high: 6_000,
    xhigh: 8_000,
  },
  "application-email": {
    none: 1_200,
    low: 1_600,
    medium: 2_200,
    high: 3_200,
    xhigh: 5_000,
  },
  "company-brief": {
    none: 2_200,
    low: 3_000,
    medium: 4_200,
    high: 6_000,
    xhigh: 8_000,
  },
  "interview-prep": {
    none: 3_000,
    low: 4_200,
    medium: 6_000,
    high: 8_500,
    xhigh: 12_000,
  },
};

export function applicationMaxOutputTokens(
  kind: ApplicationOutputKind,
  effort: LlmReasoningEffort,
): number {
  return APPLICATION_OUTPUT_BUDGETS[kind][effort];
}
