import type {
  ApplicationActivity,
  ApplicationActivityType,
  ApplicationArtifactModelSettings,
  ApplicationContact,
  ApplicationDocumentDesign,
  ApplicationDocumentKind,
  ApplicationDocumentVisualization,
  ApplicationGenerationPreferences,
  ApplicationGenerationInputs,
  ApplicationKpiGoal,
  ApplicationKpiKey,
  ApplicationKpiPeriod,
  ApplicationKpiSettings,
  ApplicationOutputKind,
  ApplicationProcess,
  ApplicationResearchScope,
  DocumentRef,
  SalaryOutlook,
} from "./types.ts";
import {
  applicationModelSetting,
  DEFAULT_APPLICATION_MODEL_SETTINGS,
} from "./llm-config.ts";

export const APPLICATION_FOCUS_THEMES = [
  "KI & Automatisierung",
  "HR-Digitalisierung",
  "Prozessoptimierung",
  "Projekt- & Programmmanagement",
  "Governance & öffentliche Verwaltung",
  "Stakeholder- & Veränderungsmanagement",
] as const;

export const APPLICATION_OUTPUT_DEFINITIONS: ReadonlyArray<{
  key: ApplicationOutputKind;
  label: string;
  description: string;
}> = [
  {
    key: "tailored-cv",
    label: "Angepasster CV",
    description: "Relevante, belegte Erfahrung priorisieren.",
  },
  {
    key: "cover-letter",
    label: "Anschreiben",
    description: "Eine konkrete, rollenbezogene Argumentation.",
  },
  {
    key: "application-email",
    label: "Bewerbungs-Mail",
    description: "Kurzer bearbeitbarer Mailtext, niemals automatisch versendet.",
  },
  {
    key: "company-brief",
    label: "Unternehmensbriefing",
    description: "Bestätigte Fakten, Quellen und offene Punkte.",
  },
  {
    key: "interview-prep",
    label: "Interviewvorbereitung",
    description: "Kernbotschaft, Belege und gezielte Rückfragen.",
  },
];

export const APPLICATION_RESEARCH_SCOPE_DEFINITIONS: ReadonlyArray<{
  key: ApplicationResearchScope;
  label: string;
  description: string;
}> = [
  {
    key: "job_posting",
    label: "Stellenanzeige",
    description: "Aufgaben, Anforderungen, Rahmen und Auswahlprozess.",
  },
  {
    key: "company",
    label: "Unternehmen aktuell",
    description: "Offizielle Schwerpunkte und aktuelle Entwicklungen.",
  },
  {
    key: "department",
    label: "Abteilung & Umfeld",
    description: "Einordnung der Einheit, soweit öffentlich belegt.",
  },
  {
    key: "projects",
    label: "Projekte & Initiativen",
    description: "Rollennahe aktuelle Programme oder Vorhaben.",
  },
  {
    key: "publications",
    label: "Publikationen",
    description: "Relevante offizielle Veröffentlichungen und Fachbeiträge.",
  },
  {
    key: "salary",
    label: "Gehaltskorridor",
    description: "Tarif, veröffentlichte Spanne oder belegte Marktwerte.",
  },
];

export const DEFAULT_APPLICATION_GENERATION_PREFERENCES: ApplicationGenerationPreferences = {
  formality: "balanced",
  addressStyle: "auto",
  language: "Deutsch",
  cvLength: "two_pages",
  focusThemes: [],
  customFocus: "",
  outputKinds: ["tailored-cv", "cover-letter"],
  modelSettings: {
    "tailored-cv": { ...DEFAULT_APPLICATION_MODEL_SETTINGS["tailored-cv"] },
    "cover-letter": { ...DEFAULT_APPLICATION_MODEL_SETTINGS["cover-letter"] },
    "application-email": {
      ...DEFAULT_APPLICATION_MODEL_SETTINGS["application-email"],
    },
    "company-brief": { ...DEFAULT_APPLICATION_MODEL_SETTINGS["company-brief"] },
    "interview-prep": {
      ...DEFAULT_APPLICATION_MODEL_SETTINGS["interview-prep"],
    },
  },
  researchScopes: ["job_posting", "company"],
  researchSelectionMode: "all_confirmed",
  selectedResearchClaimIds: [],
  desiredSalaryAnnual: null,
  minimumSalaryAnnual: null,
  salaryFlexibility: "negotiable",
  mentionSalary: "if_requested",
};

export const DEFAULT_APPLICATION_GENERATION_INPUTS: ApplicationGenerationInputs = {
  motivation: "",
  achievements: "",
  strengths: "",
  constraints: "",
  availability: "",
};

export function activeUploadedMasterCv(
  documents: DocumentRef[],
  masterCvDocumentId: string | null,
): DocumentRef | null {
  if (!masterCvDocumentId) return null;
  return (
    documents.find(
      (document) =>
        document.id === masterCvDocumentId && document.storage === "upload",
    ) ?? null
  );
}

export const APPLICATION_KPI_DEFINITIONS: ReadonlyArray<{
  key: ApplicationKpiKey;
  label: string;
  shortLabel: string;
  description: string;
  defaultTargets: Record<ApplicationKpiPeriod, number>;
}> = [
  {
    key: "new_vacancies",
    label: "Neue Vakanzen",
    shortLabel: "Neu",
    description: "Neu angelegte oder importierte Stellenakten.",
    defaultTargets: { day: 3, week: 15, month: 60 },
  },
  {
    key: "complete_application_packs",
    label: "Vollständige Unterlagen",
    shortLabel: "Pakete",
    description: "CV und Anschreiben als vollständiges Paket markiert.",
    defaultTargets: { day: 1, week: 5, month: 15 },
  },
  {
    key: "sent_applications",
    label: "Versendete Bewerbungen",
    shortLabel: "Versendet",
    description: "Manuell als versendet erfasste Bewerbungen.",
    defaultTargets: { day: 1, week: 5, month: 15 },
  },
  {
    key: "phone_interviews",
    label: "Telefoninterviews",
    shortLabel: "Telefon",
    description: "Erfasste Telefon- oder Erstinterviews.",
    defaultTargets: { day: 0, week: 1, month: 4 },
  },
  {
    key: "onsite_interviews",
    label: "Vor-Ort-Gespräche",
    shortLabel: "Vor Ort",
    description: "Erfasste persönliche Gespräche vor Ort.",
    defaultTargets: { day: 0, week: 1, month: 3 },
  },
];

export const DEFAULT_APPLICATION_KPI_SETTINGS: ApplicationKpiSettings = {
  goals: APPLICATION_KPI_DEFINITIONS.map((definition) => ({
    key: definition.key,
    enabled: true,
    targets: { ...definition.defaultTargets },
  })),
};

const OUTPUT_KINDS = new Set<ApplicationOutputKind>(
  APPLICATION_OUTPUT_DEFINITIONS.map((definition) => definition.key),
);
const DOCUMENT_KINDS = new Set<ApplicationDocumentKind>([
  "tailored-cv",
  "cover-letter",
  "company-brief",
  "interview-prep",
]);
const RESEARCH_SCOPES = new Set<ApplicationResearchScope>(
  APPLICATION_RESEARCH_SCOPE_DEFINITIONS.map((definition) => definition.key),
);
const KPI_KEYS = new Set<ApplicationKpiKey>(
  APPLICATION_KPI_DEFINITIONS.map((definition) => definition.key),
);
const ACTIVITY_TYPES = new Set<ApplicationActivityType>([
  "vacancy_added",
  "application_pack_completed",
  "application_sent",
  "phone_interview",
  "onsite_interview",
]);

function finiteTarget(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(999, Math.max(0, Math.round(value)))
    : fallback;
}

function stringList(value: unknown, limit: number, maximum = 200): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim().slice(0, maximum) : ""))
    .filter(Boolean)
    .slice(0, limit);
}

function optionalSalary(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(1_000_000, Math.round(value))
    : null;
}

export function normalizeApplicationGenerationInputs(
  value: unknown,
): ApplicationGenerationInputs {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<ApplicationGenerationInputs>)
      : {};
  const field = (input: unknown, maximum: number) =>
    typeof input === "string" ? input.trim().slice(0, maximum) : "";
  return {
    motivation: field(candidate.motivation, 4_000),
    achievements: field(candidate.achievements, 6_000),
    strengths: field(candidate.strengths, 4_000),
    constraints: field(candidate.constraints, 4_000),
    availability: field(candidate.availability, 2_000),
  };
}

export const DEFAULT_APPLICATION_DOCUMENT_DESIGN: ApplicationDocumentDesign = {
  templateDocumentIds: {
    "tailored-cv": null,
    "cover-letter": null,
    "company-brief": null,
    "interview-prep": null,
  },
  visualizations: [],
};

export function normalizeApplicationDocumentDesign(
  value: unknown,
): ApplicationDocumentDesign {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<ApplicationDocumentDesign>)
      : {};
  const templateIds: Partial<
    Record<ApplicationDocumentKind, string | null>
  > =
    candidate.templateDocumentIds &&
    typeof candidate.templateDocumentIds === "object"
      ? candidate.templateDocumentIds
      : {};
  const templateId = (kind: ApplicationDocumentKind): string | null => {
    const raw = templateIds[kind];
    return typeof raw === "string" && raw.trim()
      ? raw.trim().slice(0, 240)
      : null;
  };
  const visualizations = (
    Array.isArray(candidate.visualizations) ? candidate.visualizations : []
  )
    .map((item, index): ApplicationDocumentVisualization | null => {
      if (!item || typeof item !== "object") return null;
      const visual = item as Partial<ApplicationDocumentVisualization>;
      const sourceDocumentId =
        typeof visual.sourceDocumentId === "string"
          ? visual.sourceDocumentId.trim().slice(0, 240)
          : "";
      if (!sourceDocumentId) return null;
      const targetKinds = stringList(visual.targetKinds, 4, 40).filter(
        (kind): kind is ApplicationDocumentKind =>
          DOCUMENT_KINDS.has(kind as ApplicationDocumentKind),
      );
      const confirmedAt =
        typeof visual.confirmedAt === "string" &&
        Number.isFinite(Date.parse(visual.confirmedAt))
          ? visual.confirmedAt
          : null;
      return {
        id:
          typeof visual.id === "string" && visual.id.trim()
            ? visual.id.trim().slice(0, 240)
            : `visualisierung-${index + 1}`,
        sourceDocumentId,
        title:
          typeof visual.title === "string"
            ? visual.title.trim().slice(0, 240)
            : "",
        altText:
          typeof visual.altText === "string"
            ? visual.altText.trim().slice(0, 500)
            : "",
        targetKinds,
        placement: ["after-profile", "after-skills", "end"].includes(
          visual.placement ?? "",
        )
          ? (visual.placement as ApplicationDocumentVisualization["placement"])
          : "end",
        confirmedAt,
      };
    })
    .filter((item): item is ApplicationDocumentVisualization => Boolean(item))
    .slice(0, 16);

  return {
    templateDocumentIds: {
      "tailored-cv": templateId("tailored-cv"),
      "cover-letter": templateId("cover-letter"),
      "company-brief": templateId("company-brief"),
      "interview-prep": templateId("interview-prep"),
    },
    visualizations,
  };
}

export function normalizeApplicationGenerationPreferences(
  value: unknown,
): ApplicationGenerationPreferences {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<ApplicationGenerationPreferences>)
      : {};
  const outputKinds = stringList(candidate.outputKinds, 5).filter(
    (item): item is ApplicationOutputKind => OUTPUT_KINDS.has(item as ApplicationOutputKind),
  );
  const researchScopes = stringList(candidate.researchScopes, 6).filter(
    (item): item is ApplicationResearchScope =>
      RESEARCH_SCOPES.has(item as ApplicationResearchScope),
  );
  const modelSettingsCandidate =
    candidate.modelSettings && typeof candidate.modelSettings === "object"
      ? (candidate.modelSettings as Partial<ApplicationArtifactModelSettings>)
      : ({} as Partial<ApplicationArtifactModelSettings>);
  return {
    formality: ["modern", "balanced", "formal"].includes(candidate.formality ?? "")
      ? (candidate.formality as ApplicationGenerationPreferences["formality"])
      : DEFAULT_APPLICATION_GENERATION_PREFERENCES.formality,
    addressStyle: ["auto", "sie", "du"].includes(candidate.addressStyle ?? "")
      ? (candidate.addressStyle as ApplicationGenerationPreferences["addressStyle"])
      : DEFAULT_APPLICATION_GENERATION_PREFERENCES.addressStyle,
    language: candidate.language === "Englisch" ? "Englisch" : "Deutsch",
    // Alte Zustände dürfen die früheren Varianten weiterhin enthalten. Für
    // versandfertige Pakete gilt jedoch ein einziger, überprüfbarer Vertrag.
    cvLength: "two_pages",
    focusThemes: stringList(candidate.focusThemes, 12, 160),
    customFocus:
      typeof candidate.customFocus === "string"
        ? candidate.customFocus.trim().slice(0, 2_000)
        : "",
    outputKinds:
      outputKinds.length > 0
        ? outputKinds
        : [...DEFAULT_APPLICATION_GENERATION_PREFERENCES.outputKinds],
    modelSettings: {
      "tailored-cv": applicationModelSetting(
        "tailored-cv",
        modelSettingsCandidate["tailored-cv"],
      ),
      "cover-letter": applicationModelSetting(
        "cover-letter",
        modelSettingsCandidate["cover-letter"],
      ),
      "application-email": applicationModelSetting(
        "application-email",
        modelSettingsCandidate["application-email"],
      ),
      "company-brief": applicationModelSetting(
        "company-brief",
        modelSettingsCandidate["company-brief"],
      ),
      "interview-prep": applicationModelSetting(
        "interview-prep",
        modelSettingsCandidate["interview-prep"],
      ),
    },
    researchScopes:
      researchScopes.length > 0
        ? researchScopes
        : [...DEFAULT_APPLICATION_GENERATION_PREFERENCES.researchScopes],
    researchSelectionMode: ["all_confirmed", "selected_only", "none"].includes(
      candidate.researchSelectionMode ?? "",
    )
      ? (candidate.researchSelectionMode as ApplicationGenerationPreferences["researchSelectionMode"])
      : DEFAULT_APPLICATION_GENERATION_PREFERENCES.researchSelectionMode,
    selectedResearchClaimIds: stringList(candidate.selectedResearchClaimIds, 80, 200),
    desiredSalaryAnnual: optionalSalary(candidate.desiredSalaryAnnual),
    minimumSalaryAnnual: optionalSalary(candidate.minimumSalaryAnnual),
    salaryFlexibility: ["fixed", "negotiable", "open"].includes(
      candidate.salaryFlexibility ?? "",
    )
      ? (candidate.salaryFlexibility as ApplicationGenerationPreferences["salaryFlexibility"])
      : DEFAULT_APPLICATION_GENERATION_PREFERENCES.salaryFlexibility,
    mentionSalary: ["never", "if_requested", "always"].includes(
      candidate.mentionSalary ?? "",
    )
      ? (candidate.mentionSalary as ApplicationGenerationPreferences["mentionSalary"])
      : DEFAULT_APPLICATION_GENERATION_PREFERENCES.mentionSalary,
  };
}

export function normalizeApplicationKpiSettings(
  value: unknown,
): ApplicationKpiSettings {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<ApplicationKpiSettings>)
      : {};
  const saved = new Map<ApplicationKpiKey, Partial<ApplicationKpiGoal>>();
  for (const goal of Array.isArray(candidate.goals) ? candidate.goals : []) {
    if (!goal || typeof goal !== "object" || !KPI_KEYS.has(goal.key as ApplicationKpiKey)) {
      continue;
    }
    saved.set(goal.key as ApplicationKpiKey, goal);
  }
  return {
    goals: APPLICATION_KPI_DEFINITIONS.map((definition) => {
      const goal = saved.get(definition.key);
      const targets = goal?.targets;
      return {
        key: definition.key,
        enabled: typeof goal?.enabled === "boolean" ? goal.enabled : true,
        targets: {
          day: finiteTarget(targets?.day, definition.defaultTargets.day),
          week: finiteTarget(targets?.week, definition.defaultTargets.week),
          month: finiteTarget(targets?.month, definition.defaultTargets.month),
        },
      };
    }),
  };
}

export function normalizeApplicationContacts(value: unknown): ApplicationContact[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index): ApplicationContact | null => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as Partial<ApplicationContact>;
      const name = typeof candidate.name === "string" ? candidate.name.trim().slice(0, 300) : "";
      const email = typeof candidate.email === "string" ? candidate.email.trim().slice(0, 320) : "";
      const phone = typeof candidate.phone === "string" ? candidate.phone.trim().slice(0, 200) : "";
      const note = typeof candidate.note === "string" ? candidate.note.trim().slice(0, 1_000) : "";
      if (!name && !email && !phone && !note) return null;
      return {
        id:
          typeof candidate.id === "string" && candidate.id.trim()
            ? candidate.id.trim().slice(0, 200)
            : `contact-${index + 1}`,
        kind: ["functional", "recruiting", "general"].includes(candidate.kind ?? "")
          ? (candidate.kind as ApplicationContact["kind"])
          : "general",
        name,
        email,
        phone,
        note,
      };
    })
    .filter((item): item is ApplicationContact => Boolean(item))
    .slice(0, 20);
}

export function normalizeApplicationActivities(value: unknown): ApplicationActivity[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index): ApplicationActivity | null => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as Partial<ApplicationActivity>;
      if (!ACTIVITY_TYPES.has(candidate.type as ApplicationActivityType)) return null;
      const occurredAt =
        typeof candidate.occurredAt === "string" && Number.isFinite(Date.parse(candidate.occurredAt))
          ? candidate.occurredAt
          : "";
      if (!occurredAt) return null;
      return {
        id:
          typeof candidate.id === "string" && candidate.id.trim()
            ? candidate.id.trim().slice(0, 200)
            : `activity-${index + 1}`,
        type: candidate.type as ApplicationActivityType,
        occurredAt,
        note: typeof candidate.note === "string" ? candidate.note.trim().slice(0, 1_000) : "",
      };
    })
    .filter((item): item is ApplicationActivity => Boolean(item))
    .slice(0, 500);
}

const SINGLE_EVENT_TYPES = new Set<ApplicationActivityType>([
  "vacancy_added",
  "application_pack_completed",
  "application_sent",
]);

export function addApplicationActivity(
  application: ApplicationProcess,
  type: ApplicationActivityType,
  occurredAt = new Date().toISOString(),
  note = "",
): ApplicationProcess {
  const activities = normalizeApplicationActivities(application.activities);
  if (SINGLE_EVENT_TYPES.has(type) && activities.some((activity) => activity.type === type)) {
    return application;
  }
  return {
    ...application,
    activities: [
      ...activities,
      {
        id: `activity-${type}-${crypto.randomUUID()}`,
        type,
        occurredAt,
        note: note.trim().slice(0, 1_000),
      },
    ],
  };
}

type CalendarCoordinate = {
  year: number;
  month: number;
  dayNumber: number;
  weekStart: number;
};

const DAY_MS = 86_400_000;
const APP_TIME_ZONE = "Europe/Berlin";

function coordinate(
  value: string | number | Date,
  formatter: Intl.DateTimeFormat,
): CalendarCoordinate | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = formatter.formatToParts(date);
  const numberPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const year = numberPart("year");
  const month = numberPart("month");
  const day = numberPart("day");
  if (!year || !month || !day) return null;
  const utc = Date.UTC(year, month - 1, day);
  const dayNumber = Math.floor(utc / DAY_MS);
  return {
    year,
    month,
    dayNumber,
    weekStart: dayNumber - ((new Date(utc).getUTCDay() + 6) % 7),
  };
}

function activityDates(
  application: ApplicationProcess,
  key: ApplicationKpiKey,
): string[] {
  const typeByKey: Record<ApplicationKpiKey, ApplicationActivityType> = {
    new_vacancies: "vacancy_added",
    complete_application_packs: "application_pack_completed",
    sent_applications: "application_sent",
    phone_interviews: "phone_interview",
    onsite_interviews: "onsite_interview",
  };
  const matching = normalizeApplicationActivities(application.activities)
    .filter((activity) => activity.type === typeByKey[key])
    .map((activity) => activity.occurredAt);
  if (matching.length) return matching;
  if (key === "new_vacancies" && application.sourceVerifiedAt) {
    return [application.sourceVerifiedAt];
  }
  if (key === "sent_applications" && application.appliedAt) {
    return [application.appliedAt];
  }
  if (key === "complete_application_packs") {
    const cv = application.artifacts.find((artifact) => artifact.kind === "tailored-cv");
    const letter = application.artifacts.find((artifact) => artifact.kind === "cover-letter");
    if (cv && letter) return [cv.createdAt > letter.createdAt ? cv.createdAt : letter.createdAt];
  }
  return [];
}

export type ApplicationKpiProgress = {
  key: ApplicationKpiKey;
  enabled: boolean;
  values: Record<ApplicationKpiPeriod, number>;
  targets: Record<ApplicationKpiPeriod, number>;
  percentages: Record<ApplicationKpiPeriod, number>;
};

export function applicationKpiProgress(
  applications: ApplicationProcess[],
  settings: ApplicationKpiSettings,
  now: string | number | Date = new Date(),
): ApplicationKpiProgress[] {
  const normalized = normalizeApplicationKpiSettings(settings);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const reference = coordinate(now, formatter);
  return normalized.goals.map((goal) => {
    const values: Record<ApplicationKpiPeriod, number> = { day: 0, week: 0, month: 0 };
    if (reference) {
      for (const application of applications) {
        for (const date of activityDates(application, goal.key)) {
          const value = coordinate(date, formatter);
          if (!value) continue;
          if (value.dayNumber === reference.dayNumber) values.day += 1;
          if (value.weekStart === reference.weekStart) values.week += 1;
          if (value.year === reference.year && value.month === reference.month) {
            values.month += 1;
          }
        }
      }
    }
    const percentages = Object.fromEntries(
      (["day", "week", "month"] as const).map((period) => [
        period,
        goal.targets[period] > 0
          ? Math.round((values[period] / goal.targets[period]) * 100)
          : values[period] > 0
            ? 100
            : 0,
      ]),
    ) as Record<ApplicationKpiPeriod, number>;
    return { ...goal, values, percentages };
  });
}

export type SalaryPreferenceAssessment = {
  tone: "positive" | "warning" | "critical" | "open";
  title: string;
  detail: string;
  publishedRange: { minimum: number; maximum: number } | null;
};

function salaryAmounts(value: string): number[] {
  const amounts = [
    ...value.matchAll(/\b\d{2,3}(?:[.\s]\d{3})(?:,\d{2})?\b/g),
  ]
    .map((match) => Number(match[0].replace(/[.\s]/g, "").replace(",", ".")))
    .filter((amount) => Number.isFinite(amount) && amount >= 20_000 && amount <= 300_000);
  for (const match of value.matchAll(/\b(\d{2,3})(?:[,.]\d+)?\s*k\b/gi)) {
    const amount = Number(match[1]) * 1_000;
    if (amount >= 20_000 && amount <= 300_000) amounts.push(amount);
  }
  return [...new Set(amounts)].sort((left, right) => left - right);
}

export function assessSalaryPreference({
  publishedCompensation,
  salaryOutlook,
  desiredSalaryAnnual,
  minimumSalaryAnnual,
}: {
  publishedCompensation: string;
  salaryOutlook: SalaryOutlook;
  desiredSalaryAnnual: number | null;
  minimumSalaryAnnual: number | null;
}): SalaryPreferenceAssessment {
  const amounts = salaryAmounts(publishedCompensation);
  const publishedRange = amounts.length
    ? { minimum: amounts[0], maximum: amounts[amounts.length - 1] }
    : null;
  if (!desiredSalaryAnnual && !minimumSalaryAnnual) {
    return {
      tone: "open",
      title: "Gehaltsrahmen noch festlegen",
      detail: publishedRange
        ? `Veröffentlicht erkennbar: ${publishedRange.minimum.toLocaleString("de-DE")} bis ${publishedRange.maximum.toLocaleString("de-DE")} Euro brutto pro Jahr.`
        : "Wunsch und persönliche Untergrenze fehlen noch. Tarif, Spanne oder belastbare Marktwerte bleiben getrennt zu prüfen.",
      publishedRange,
    };
  }
  if (publishedRange) {
    if (minimumSalaryAnnual && minimumSalaryAnnual > publishedRange.maximum) {
      return {
        tone: "critical",
        title: "Untergrenze liegt über der veröffentlichten Spanne",
        detail: "Die Vakanz ist wirtschaftlich voraussichtlich nicht passend, solange kein zusätzlicher Spielraum bestätigt wird.",
        publishedRange,
      };
    }
    if (desiredSalaryAnnual && desiredSalaryAnnual > publishedRange.maximum) {
      return {
        tone: "warning",
        title: "Wunsch liegt über der veröffentlichten Spanne",
        detail: "Nur mit klaren Rollenargumenten verhandeln und den Betrag im Anschreiben nur nennen, wenn die Anzeige ihn verlangt.",
        publishedRange,
      };
    }
    if (desiredSalaryAnnual && desiredSalaryAnnual < publishedRange.minimum) {
      return {
        tone: "warning",
        title: "Wunsch liegt unter dem veröffentlichten Einstieg",
        detail: "Die veröffentlichte Spanne noch einmal prüfen, damit der eigene Wunsch nicht unnötig niedrig angesetzt wird.",
        publishedRange,
      };
    }
    return {
      tone: "positive",
      title: "Gehaltswunsch liegt in der veröffentlichten Spanne",
      detail: "Erfahrungsstufe, Gesamtpaket und Stundenumfang bleiben vor einer endgültigen Zusage zu bestätigen.",
      publishedRange,
    };
  }
  const outlookCopy: Record<SalaryOutlook, SalaryPreferenceAssessment> = {
    yes: {
      tone: "positive",
      title: "Das 50k-Ziel erscheint grundsätzlich erreichbar",
      detail: "Die konkrete Spanne ist nicht belastbar veröffentlicht und sollte im Prozess bestätigt werden.",
      publishedRange: null,
    },
    borderline: {
      tone: "warning",
      title: "Gehaltsziel hängt von Stufe oder Verhandlung ab",
      detail: "Erfahrungsanerkennung, Stundenumfang und Gesamtpaket früh klären; Wunsch und Untergrenze getrennt halten.",
      publishedRange: null,
    },
    no: {
      tone: "critical",
      title: "Die Recherche spricht gegen das 50k-Ziel",
      detail: "Nur weiterverfolgen, wenn andere Rahmenbedingungen den wirtschaftlichen Abstand bewusst ausgleichen.",
      publishedRange: null,
    },
    open: {
      tone: "open",
      title: "Gehaltswunsch noch nicht belastbar einzuordnen",
      detail: "Tarif, Arbeitgeberangabe oder eine transparente Marktquelle ergänzen, bevor der Betrag in Unterlagen verwendet wird.",
      publishedRange: null,
    },
  };
  return outlookCopy[salaryOutlook];
}
