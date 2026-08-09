import type {
  ApplicationDocumentDesign,
  ApplicationDocumentKind,
  ApplicationDocumentPresetId,
} from "./types.ts";

export type ApplicationDocumentPresetDefinition = {
  id: ApplicationDocumentPresetId;
  label: string;
  description: string;
  layout: "gerris" | "modern" | "professional" | "conservative";
  fonts: { body: string; title: string; heading: string };
  colors: {
    title: string;
    heading: string;
    accent: string;
    rule: string;
    text: string;
    muted: string;
    soft: string;
  };
};

export const APPLICATION_DOCUMENT_PRESETS: readonly ApplicationDocumentPresetDefinition[] = [
  {
    id: "gerris",
    label: "Gerris-Design",
    description: "Vertrautes Petrol, Navy und Gold mit klassischer Gerris-Hierarchie.",
    layout: "gerris",
    fonts: { body: "Carlito", title: "Caladea", heading: "Caladea" },
    colors: {
      title: "142A3A",
      heading: "142A3A",
      accent: "17605E",
      rule: "C29A4A",
      text: "26343E",
      muted: "60717C",
      soft: "EAF1F2",
    },
  },
  {
    id: "modern-stylish",
    label: "Modern / Stylish",
    description: "Klares Sans-Serif-Design mit Petrol, Schiefergrau und luftigen Akzenten.",
    layout: "modern",
    fonts: { body: "Carlito", title: "Carlito", heading: "Carlito" },
    colors: {
      title: "20343B",
      heading: "0F766E",
      accent: "0F766E",
      rule: "0F766E",
      text: "20343B",
      muted: "5B6C72",
      soft: "EAF5F2",
    },
  },
  {
    id: "professional-stylish",
    label: "Professionell / Stylish",
    description: "Formeller Masthead mit Navy, Petrol und zurückhaltenden Goldlinien.",
    layout: "professional",
    fonts: { body: "Carlito", title: "Caladea", heading: "Caladea" },
    colors: {
      title: "18344A",
      heading: "18344A",
      accent: "2B6F75",
      rule: "B58A46",
      text: "25343F",
      muted: "62717B",
      soft: "EEF2F3",
    },
  },
  {
    id: "conservative-chic",
    label: "Konservativ / Schick",
    description: "Klassische Serifentypografie in Anthrazit, Navy und warmem Grau.",
    layout: "conservative",
    fonts: { body: "Caladea", title: "Caladea", heading: "Caladea" },
    colors: {
      title: "263849",
      heading: "263849",
      accent: "31465A",
      rule: "9A8260",
      text: "2B2F33",
      muted: "6B6E70",
      soft: "FAF9F6",
    },
  },
] as const;

const PRESET_BY_ID = new Map(
  APPLICATION_DOCUMENT_PRESETS.map((preset) => [preset.id, preset]),
);

export const APPLICATION_DOCUMENT_PRESET_IDS = new Set<ApplicationDocumentPresetId>(
  APPLICATION_DOCUMENT_PRESETS.map((preset) => preset.id),
);

export function applicationDocumentPreset(
  id: ApplicationDocumentPresetId,
): ApplicationDocumentPresetDefinition {
  return PRESET_BY_ID.get(id) ?? APPLICATION_DOCUMENT_PRESETS[0];
}

export function resolvedApplicationDocumentPresetId(
  design: ApplicationDocumentDesign,
  kind: ApplicationDocumentKind,
): ApplicationDocumentPresetId {
  return design.presetOverrides[kind] ?? design.basePresetId;
}
