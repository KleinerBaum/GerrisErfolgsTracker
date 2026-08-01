import type {
  DashboardKpiKey,
  DashboardKpiTarget,
  DashboardSettings,
} from "./types";

export type DashboardKpiDefinition = {
  key: DashboardKpiKey;
  label: string;
  shortLabel: string;
  description: string;
  unit: string;
  direction: "minimum" | "maximum";
  defaultTarget: number;
  min: number;
  max: number;
  step: number;
};

export const DASHBOARD_KPI_DEFINITIONS: DashboardKpiDefinition[] = [
  {
    key: "weekly_task_completions",
    label: "Erledigte Aufgaben pro Woche",
    shortLabel: "Wochenfortschritt",
    description: "Abgeschlossene Aufgaben der vergangenen sieben Tage.",
    unit: "Aufgaben",
    direction: "minimum",
    defaultTarget: 5,
    min: 1,
    max: 50,
    step: 1,
  },
  {
    key: "daily_focus_minutes",
    label: "Vorbereitete Fokuszeit",
    shortLabel: "Fokusumfang",
    description: "Geschätzte Zeit der aktuell wichtigsten Aufgaben.",
    unit: "Min.",
    direction: "minimum",
    defaultTarget: 90,
    min: 15,
    max: 600,
    step: 15,
  },
  {
    key: "planned_days",
    label: "Geklärte Planungstage",
    shortLabel: "Planung geklärt",
    description: "Verlässlich geplante oder bewusst freigehaltene Tage.",
    unit: "Tage",
    direction: "minimum",
    defaultTarget: 7,
    min: 1,
    max: 14,
    step: 1,
  },
  {
    key: "monthly_spending_limit",
    label: "Monatlicher Ausgabenrahmen",
    shortLabel: "Ausgabenrahmen",
    description: "Maximaler Betrag für dokumentierte Monatsausgaben.",
    unit: "€",
    direction: "maximum",
    defaultTarget: 1700,
    min: 50,
    max: 50000,
    step: 50,
  },
  {
    key: "active_applications",
    label: "Aktive Bewerbungsprozesse",
    shortLabel: "Chancen in Bewegung",
    description: "Bewerbungen vom Entwurf bis zum Angebot.",
    unit: "Prozesse",
    direction: "minimum",
    defaultTarget: 3,
    min: 1,
    max: 30,
    step: 1,
  },
  {
    key: "weekly_journal_entries",
    label: "Tagebuchabschlüsse pro Woche",
    shortLabel: "Abendrhythmus",
    description: "Einträge und Tagesabschlüsse der vergangenen sieben Tage.",
    unit: "Tage",
    direction: "minimum",
    defaultTarget: 5,
    min: 1,
    max: 7,
    step: 1,
  },
];

const definitionByKey = new Map(
  DASHBOARD_KPI_DEFINITIONS.map((definition) => [definition.key, definition]),
);

const clampTarget = (definition: DashboardKpiDefinition, value: unknown) => {
  const numeric =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : definition.defaultTarget;
  return Math.min(definition.max, Math.max(definition.min, numeric));
};

export function createDefaultDashboardSettings(
  monthlyBudget = 1700,
): DashboardSettings {
  return {
    kpis: DASHBOARD_KPI_DEFINITIONS.map((definition) => ({
      key: definition.key,
      enabled: true,
      target:
        definition.key === "monthly_spending_limit" && monthlyBudget > 0
          ? clampTarget(definition, monthlyBudget)
          : definition.defaultTarget,
    })),
  };
}

export function normalizeDashboardSettings(
  value: DashboardSettings | null | undefined,
  monthlyBudget = 1700,
): DashboardSettings {
  const defaults = createDefaultDashboardSettings(monthlyBudget);
  const supplied = new Map<DashboardKpiKey, DashboardKpiTarget>();
  if (Array.isArray(value?.kpis)) {
    for (const candidate of value.kpis) {
      if (candidate && definitionByKey.has(candidate.key)) {
        supplied.set(candidate.key, candidate);
      }
    }
  }

  return {
    kpis: defaults.kpis.map((fallback) => {
      const candidate = supplied.get(fallback.key);
      const definition = definitionByKey.get(fallback.key)!;
      return {
        key: fallback.key,
        enabled:
          typeof candidate?.enabled === "boolean"
            ? candidate.enabled
            : fallback.enabled,
        target: clampTarget(definition, candidate?.target ?? fallback.target),
      };
    }),
  };
}

export function dashboardKpiDefinition(
  key: DashboardKpiKey,
): DashboardKpiDefinition {
  return definitionByKey.get(key)!;
}
