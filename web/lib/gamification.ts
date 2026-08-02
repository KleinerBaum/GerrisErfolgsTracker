import type {
  AdaptiveRewardWeights,
  AnchorDay,
  AnchorDayStatus,
  AnchorRole,
  AppState,
  ComplexityAssessment,
  DifficultyBand,
  GamificationState,
  Goal,
  LifeArea,
  MessageCategory,
  PersonalReward,
  RewardFeedbackRating,
  RewardLedgerEntry,
  RewardMode,
  RewardPresentation,
  Task,
  TaskGamificationProfile,
  VerificationType,
  WorldDistrictKey,
  WorldUpgradeKind,
  XpGoals,
} from "./types";

export const GAMIFICATION_ENGINE_VERSION = 1 as const;

export const DIFFICULTY_LABELS: Record<DifficultyBand, string> = {
  D1: "Quick Win",
  D2: "Routine",
  D3: "Mission",
  D4: "Quest",
  D5: "Großquest",
  BOSS: "Bossziel",
};

export const REWARD_MODE_LABELS: Record<RewardMode, string> = {
  POINTS: "Klarpunkte",
  FANTASY: "Lebende Chronik",
  ADAPTIVE: "Momentum Realm",
};

export const ANCHOR_ROLE_LABELS: Record<AnchorRole, string> = {
  KEY: "Schlüsselquest",
  QUICK_WIN: "Quick Win",
  SUPPLY: "Versorgungsquest",
};

export const ANCHOR_DAY_STATUS_LABELS: Record<AnchorDayStatus, string> = {
  PLANNED: "Ankertag",
  REST: "Ruhetag",
  VACATION: "Urlaub",
  PAUSED: "Bewusst ausgesetzt",
};

export const WORLD_DISTRICT_LABELS: Record<WorldDistrictKey, string> = {
  ARCHIVE: "Archiv",
  TREASURY: "Schatzkammer",
  WORKSHOP: "Werkstatt",
  LIBRARY: "Bibliothek & Observatorium",
  HEARTH: "Herdviertel",
  GARDEN: "Garten & Heiligtum",
};

export const BASE_XP: Record<DifficultyBand, number> = {
  D1: 5,
  D2: 12,
  D3: 25,
  D4: 50,
  D5: 100,
  BOSS: 0,
};

export const DEFAULT_XP_GOALS: XpGoals = {
  daily: 25,
  weekly: 125,
  monthly: 500,
};

export const XP_GOAL_LIMITS: Record<
  keyof XpGoals,
  { min: number; max: number; step: number }
> = {
  daily: { min: 5, max: 5_000, step: 5 },
  weekly: { min: 5, max: 25_000, step: 5 },
  monthly: { min: 5, max: 100_000, step: 5 },
};

export const WORLD_UPGRADE_COSTS: Record<
  WorldUpgradeKind,
  { energy: number; runes: number; blueprints: number; bossKeys: number; label: string }
> = {
  DECORATION: {
    energy: 10,
    runes: 0,
    blueprints: 0,
    bossKeys: 0,
    label: "Dekoration, Tier oder Banner",
  },
  ROOM: {
    energy: 30,
    runes: 1,
    blueprints: 0,
    bossKeys: 0,
    label: "Neuer Raum, NPC oder kleines Feature",
  },
  BUILDING: {
    energy: 75,
    runes: 3,
    blueprints: 0,
    bossKeys: 0,
    label: "Gebäude-Upgrade",
  },
  LANDMARK: {
    energy: 180,
    runes: 0,
    blueprints: 1,
    bossKeys: 0,
    label: "Wahrzeichen",
  },
  REGION: {
    energy: 500,
    runes: 0,
    blueprints: 0,
    bossKeys: 1,
    label: "Neue Region mit neuer Mechanik",
  },
};

export const DEFAULT_REWARD_CATALOG: PersonalReward[] = [
  { id: "reward-break", title: "20–30 Minuten bewusst freie Zeit", cost: 25, active: true },
  { id: "reward-evening", title: "Gaming-, Film- oder Hobbyabend", cost: 75, active: true },
  { id: "reward-trip", title: "Ausflug oder besondere Aktivität", cost: 200, active: true },
  { id: "reward-large", title: "Größere, vorher selbst festgelegte Belohnung", cost: 500, active: true },
];

const modeValues = new Set<RewardMode>(["POINTS", "FANTASY", "ADAPTIVE"]);
const difficultyValues = new Set<DifficultyBand>(["D1", "D2", "D3", "D4", "D5", "BOSS"]);
const verificationValues = new Set<VerificationType>([
  "USER_CONFIRM",
  "CHECKLIST",
  "ARTIFACT",
  "GOOGLE_TASK",
]);

const finite = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const rating = (value: unknown, fallback = 1): number =>
  clamp(Math.round(finite(value, fallback)), 1, 5);

export function normalizeXpGoals(
  value: Partial<XpGoals> | null | undefined,
): XpGoals {
  const normalizeGoal = (period: keyof XpGoals): number => {
    const limits = XP_GOAL_LIMITS[period];
    return clamp(
      Math.round(finite(value?.[period], DEFAULT_XP_GOALS[period])),
      limits.min,
      limits.max,
    );
  };
  return {
    daily: normalizeGoal("daily"),
    weekly: normalizeGoal("weekly"),
    monthly: normalizeGoal("monthly"),
  };
}

const stableNumber = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

function weightedScore(input: {
  effort: number;
  cognitiveLoad: number;
  activationBarrier: number;
  coordination: number;
}): number {
  return Number(
    (
      input.effort * 0.35 +
      input.cognitiveLoad * 0.25 +
      input.activationBarrier * 0.2 +
      input.coordination * 0.2
    ).toFixed(2),
  );
}

function bandForEstimate(minutes: number): Exclude<DifficultyBand, "BOSS"> {
  if (minutes <= 15) return "D1";
  if (minutes <= 45) return "D2";
  if (minutes <= 120) return "D3";
  if (minutes <= 240) return "D4";
  return "D5";
}

function bandForScore(score: number): Exclude<DifficultyBand, "BOSS"> {
  if (score < 1.6) return "D1";
  if (score < 2.6) return "D2";
  if (score < 3.6) return "D3";
  if (score < 4.4) return "D4";
  return "D5";
}

const bandRank: Record<Exclude<DifficultyBand, "BOSS">, number> = {
  D1: 1,
  D2: 2,
  D3: 3,
  D4: 4,
  D5: 5,
};

export function localComplexityAssessment(
  task: Pick<Task, "estimateMinutes" | "area" | "quadrant" | "assigned">,
  now = new Date().toISOString(),
): ComplexityAssessment {
  const estimateBand = bandForEstimate(Math.max(1, task.estimateMinutes));
  const effort = bandRank[estimateBand];
  const cognitiveLoad = ["arbeit", "finanzen", "persoenlich"].includes(task.area) ? 3 : 2;
  const activationBarrier = task.quadrant === "do" ? 3 : task.quadrant === "plan" ? 2 : 1;
  const coordination = task.assigned ? 4 : task.quadrant === "delegate" ? 3 : 1;
  const score = weightedScore({ effort, cognitiveLoad, activationBarrier, coordination });
  const scoreBand = bandForScore(score);
  const suggestedBand =
    bandRank[estimateBand] >= bandRank[scoreBand] ? estimateBand : scoreBand;
  return {
    effort,
    cognitiveLoad,
    activationBarrier,
    coordination,
    weightedScore: score,
    suggestedBand,
    explanation:
      "Lokaler Vorschlag aus geschätzter Dauer, Aufgabenart und Priorität. Du bestätigst oder änderst die Einstufung.",
    source: "FALLBACK",
    suggestedAt: now,
  };
}

export function normalizeAssessment(
  value: Partial<ComplexityAssessment> | null | undefined,
  fallback: ComplexityAssessment,
): ComplexityAssessment {
  const effort = rating(value?.effort, fallback.effort);
  const cognitiveLoad = rating(value?.cognitiveLoad, fallback.cognitiveLoad);
  const activationBarrier = rating(value?.activationBarrier, fallback.activationBarrier);
  const coordination = rating(value?.coordination, fallback.coordination);
  const score = weightedScore({ effort, cognitiveLoad, activationBarrier, coordination });
  return {
    effort,
    cognitiveLoad,
    activationBarrier,
    coordination,
    weightedScore: score,
    suggestedBand:
      value?.suggestedBand && difficultyValues.has(value.suggestedBand)
        ? value.suggestedBand
        : bandForScore(score),
    explanation:
      typeof value?.explanation === "string" && value.explanation.trim()
        ? value.explanation.trim().slice(0, 800)
        : fallback.explanation,
    source: value?.source === "AI" ? "AI" : "FALLBACK",
    suggestedAt:
      typeof value?.suggestedAt === "string" ? value.suggestedAt : fallback.suggestedAt,
  };
}

function openingEntry(points: number, createdAt: string): RewardLedgerEntry {
  return {
    id: "ledger-opening-balance",
    sequence: 1,
    engineVersion: GAMIFICATION_ENGINE_VERSION,
    idempotencyKey: "opening-balance-v1",
    createdAt,
    kind: "OPENING_BALANCE",
    sourceId: "legacy-points",
    budgetKey: "legacy-points",
    description: "Übernommener Punktestand",
    difficultyBand: null,
    verificationType: null,
    district: null,
    bonusPercent: 0,
    xpDelta: Math.max(0, Math.round(points)),
    energyDelta: 0,
    runeDelta: 0,
    blueprintDelta: 0,
    bossKeyDelta: 0,
    courageEmberDelta: 0,
  };
}

export function createDefaultGamification(
  legacyPoints = 0,
  createdAt = new Date().toISOString(),
): GamificationState {
  return {
    schemaVersion: 1,
    rewardMode: "ADAPTIVE",
    drRossEnabled: false,
    surprisesEnabled: true,
    celebrationsEnabled: true,
    milestoneStepXp: 250,
    xpGoals: { ...DEFAULT_XP_GOALS },
    quietHours: { start: "21:00", end: "08:00" },
    profiles: [],
    ledger: legacyPoints > 0 ? [openingEntry(legacyPoints, createdAt)] : [],
    world: {
      upgrades: [],
      eligibleCompletionsSinceSurprise: 0,
      surpriseHistory: [],
    },
    approvedMessages: [],
    feedback: [],
    rewardCatalog: DEFAULT_REWARD_CATALOG.map((item) => ({ ...item })),
    goals: [],
    anchorDays: [],
    adaptiveWeights: { points: 50, fantasy: 50, lastAdjustedAt: null },
  };
}

function validProfile(value: unknown): value is TaskGamificationProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<TaskGamificationProfile>;
  return typeof profile.taskId === "string" && Boolean(profile.taskId.trim());
}

function validLedgerEntry(value: unknown): value is RewardLedgerEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<RewardLedgerEntry>;
  return (
    typeof entry.id === "string" &&
    typeof entry.idempotencyKey === "string" &&
    typeof entry.createdAt === "string" &&
    typeof entry.kind === "string"
  );
}

function normalizeAdaptiveWeights(value: unknown): AdaptiveRewardWeights {
  const weights = value && typeof value === "object"
    ? (value as Partial<AdaptiveRewardWeights>)
    : {};
  const points = clamp(Math.round(finite(weights.points, 50)), 20, 80);
  const fantasy = clamp(Math.round(finite(weights.fantasy, 100 - points)), 20, 80);
  const total = points + fantasy;
  return {
    points: Math.round((points / total) * 100),
    fantasy: 100 - Math.round((points / total) * 100),
    lastAdjustedAt:
      typeof weights.lastAdjustedAt === "string" ? weights.lastAdjustedAt : null,
  };
}

export function normalizeGamificationState(
  value: GamificationState | null | undefined,
  legacyPoints: number,
  createdAt: string,
): GamificationState {
  if (!value || value.schemaVersion !== 1) {
    return createDefaultGamification(legacyPoints, createdAt);
  }
  const ledger = Array.isArray(value.ledger)
    ? value.ledger.filter(validLedgerEntry).map((entry, index) => ({
        ...entry,
        sequence: index + 1,
        engineVersion: GAMIFICATION_ENGINE_VERSION,
        xpDelta: Math.round(finite(entry.xpDelta)),
        energyDelta: Math.round(finite(entry.energyDelta)),
        runeDelta: Math.round(finite(entry.runeDelta)),
        blueprintDelta: Math.round(finite(entry.blueprintDelta)),
        bossKeyDelta: Math.round(finite(entry.bossKeyDelta)),
        courageEmberDelta: Math.round(finite(entry.courageEmberDelta)),
      }))
    : [];
  const profiles = Array.isArray(value.profiles)
    ? value.profiles.filter(validProfile).map((profile) => {
        const fallback = localComplexityAssessment({
          estimateMinutes: 20,
          area: "persoenlich",
          quadrant: "do",
        });
        const assessment = normalizeAssessment(profile.assessment, fallback);
        return {
          ...profile,
          difficultyBand: difficultyValues.has(profile.difficultyBand)
            ? profile.difficultyBand
            : assessment.suggestedBand,
          assessment,
          confirmedAt: typeof profile.confirmedAt === "string" ? profile.confirmedAt : null,
          verificationType: verificationValues.has(profile.verificationType)
            ? profile.verificationType
            : "USER_CONFIRM",
          weeklyAnchor: Boolean(profile.weeklyAnchor),
          scheduledBlock: Boolean(profile.scheduledBlock),
          verifiedMilestone: Boolean(profile.verifiedMilestone),
          anchorRole: ["KEY", "QUICK_WIN", "SUPPLY"].includes(profile.anchorRole ?? "")
            ? profile.anchorRole
            : null,
          anchorDate: typeof profile.anchorDate === "string" ? profile.anchorDate : null,
        } satisfies TaskGamificationProfile;
      })
    : [];
  const approvedMessages = Array.isArray(value.approvedMessages)
    ? value.approvedMessages.filter(
        (message) =>
          message &&
          typeof message.id === "string" &&
          typeof message.text === "string" &&
          typeof message.contentType === "string",
      )
    : [];
  const hasApprovedNamedMessage = approvedMessages.some(
    (message) =>
      message.active &&
      message.contentType !== "GENERIC_AI" &&
      Boolean(message.approvedAt) &&
      Boolean(message.permissionReference.trim()),
  );
  return {
    schemaVersion: 1,
    rewardMode: modeValues.has(value.rewardMode) ? value.rewardMode : "ADAPTIVE",
    drRossEnabled: Boolean(value.drRossEnabled) && hasApprovedNamedMessage,
    surprisesEnabled: value.surprisesEnabled !== false,
    celebrationsEnabled: value.celebrationsEnabled !== false,
    milestoneStepXp: [100, 250, 500, 1000].includes(value.milestoneStepXp)
      ? value.milestoneStepXp
      : 250,
    xpGoals: normalizeXpGoals(value.xpGoals),
    quietHours: {
      start: typeof value.quietHours?.start === "string" ? value.quietHours.start : "21:00",
      end: typeof value.quietHours?.end === "string" ? value.quietHours.end : "08:00",
    },
    profiles,
    ledger,
    world: {
      upgrades: Array.isArray(value.world?.upgrades) ? value.world.upgrades : [],
      eligibleCompletionsSinceSurprise: Math.max(
        0,
        Math.round(finite(value.world?.eligibleCompletionsSinceSurprise)),
      ),
      surpriseHistory: Array.isArray(value.world?.surpriseHistory)
        ? value.world.surpriseHistory.filter((item): item is string => typeof item === "string")
        : [],
    },
    approvedMessages,
    feedback: Array.isArray(value.feedback) ? value.feedback : [],
    rewardCatalog:
      Array.isArray(value.rewardCatalog) && value.rewardCatalog.length
        ? value.rewardCatalog
        : DEFAULT_REWARD_CATALOG.map((item) => ({ ...item })),
    goals: Array.isArray(value.goals) ? value.goals : [],
    anchorDays: Array.isArray(value.anchorDays) ? value.anchorDays : [],
    adaptiveWeights: normalizeAdaptiveWeights(value.adaptiveWeights),
  };
}

export function ledgerTotals(ledger: RewardLedgerEntry[]) {
  const totals = ledger.reduce(
    (sum, entry) => ({
      earnedXp: sum.earnedXp + Math.max(0, entry.xpDelta),
      spentXp: sum.spentXp + Math.max(0, -entry.xpDelta),
      energy: sum.energy + entry.energyDelta,
      runes: sum.runes + entry.runeDelta,
      blueprints: sum.blueprints + entry.blueprintDelta,
      bossKeys: sum.bossKeys + entry.bossKeyDelta,
      courageEmbers: sum.courageEmbers + entry.courageEmberDelta,
    }),
    {
      earnedXp: 0,
      spentXp: 0,
      energy: 0,
      runes: 0,
      blueprints: 0,
      bossKeys: 0,
      courageEmbers: 0,
    },
  );
  return {
    ...totals,
    balanceXp: Math.max(0, totals.earnedXp - totals.spentXp),
    energy: Math.max(0, totals.energy),
    runes: Math.max(0, totals.runes),
    blueprints: Math.max(0, totals.blueprints),
    bossKeys: Math.max(0, totals.bossKeys),
    courageEmbers: Math.max(0, totals.courageEmbers),
  };
}

export const levelForXp = (earnedXp: number): number =>
  Math.floor(Math.max(0, earnedXp) / 250) + 1;

export type XpGoalProgress = {
  earnedXp: number;
  goalXp: number;
  percentage: number;
  goalReached: boolean;
};

export type XpProgressByPeriod = {
  day: XpGoalProgress;
  week: XpGoalProgress;
  month: XpGoalProgress;
};

const XP_PROGRESS_TIME_ZONE = "Europe/Berlin";
const MILLISECONDS_PER_DAY = 86_400_000;

function zonedCalendarCoordinate(
  value: string | number | Date,
  formatter: Intl.DateTimeFormat,
): { year: number; month: number; dayNumber: number; weekStart: number } | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = formatter.formatToParts(date);
  const valueOf = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const year = valueOf("year");
  const month = valueOf("month");
  const day = valueOf("day");
  if (!year || !month || !day) return null;
  const utcDate = Date.UTC(year, month - 1, day);
  const dayNumber = Math.floor(utcDate / MILLISECONDS_PER_DAY);
  const mondayOffset = (new Date(utcDate).getUTCDay() + 6) % 7;
  return {
    year,
    month,
    dayNumber,
    weekStart: dayNumber - mondayOffset,
  };
}

function goalProgress(earnedXp: number, goalXp: number): XpGoalProgress {
  const earned = Math.max(0, Math.round(earnedXp));
  const goal = Math.max(1, Math.round(goalXp));
  return {
    earnedXp: earned,
    goalXp: goal,
    percentage: Math.round((earned / goal) * 100),
    goalReached: earned >= goal,
  };
}

export function xpProgressByPeriod(
  ledger: RewardLedgerEntry[],
  goals: XpGoals,
  now: string | number | Date = new Date(),
  timeZone = XP_PROGRESS_TIME_ZONE,
): XpProgressByPeriod {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const referenceDate = new Date(now);
  const reference = zonedCalendarCoordinate(referenceDate, formatter);
  const normalizedGoals = normalizeXpGoals(goals);
  if (!reference || !Number.isFinite(referenceDate.getTime())) {
    return {
      day: goalProgress(0, normalizedGoals.daily),
      week: goalProgress(0, normalizedGoals.weekly),
      month: goalProgress(0, normalizedGoals.monthly),
    };
  }

  let dayXp = 0;
  let weekXp = 0;
  let monthXp = 0;
  for (const entry of ledger) {
    if (entry.kind === "OPENING_BALANCE" || entry.xpDelta <= 0) continue;
    const createdAt = new Date(entry.createdAt);
    if (
      !Number.isFinite(createdAt.getTime()) ||
      createdAt.getTime() > referenceDate.getTime()
    ) {
      continue;
    }
    const coordinate = zonedCalendarCoordinate(createdAt, formatter);
    if (!coordinate) continue;
    const xp = Math.max(0, Math.round(entry.xpDelta));
    if (coordinate.dayNumber === reference.dayNumber) dayXp += xp;
    if (coordinate.weekStart === reference.weekStart) weekXp += xp;
    if (
      coordinate.year === reference.year &&
      coordinate.month === reference.month
    ) {
      monthXp += xp;
    }
  }

  return {
    day: goalProgress(dayXp, normalizedGoals.daily),
    week: goalProgress(weekXp, normalizedGoals.weekly),
    month: goalProgress(monthXp, normalizedGoals.monthly),
  };
}

export function districtForArea(area: LifeArea): WorldDistrictKey {
  const districts: Record<LifeArea, WorldDistrictKey> = {
    alltag: "ARCHIVE",
    finanzen: "TREASURY",
    arbeit: "WORKSHOP",
    persoenlich: "LIBRARY",
    wohnen: "HEARTH",
    gesundheit: "GARDEN",
  };
  return districts[area];
}

function fantasyReward(band: DifficultyBand) {
  return {
    energy: band === "D1" ? 1 : band === "D2" ? 3 : band === "D3" ? 5 : band === "D4" ? 10 : band === "D5" ? 20 : 0,
    runes: band === "D3" ? 1 : band === "D4" ? 2 : band === "D5" ? 3 : 0,
    blueprints: band === "D5" ? 1 : 0,
    bossKeys: band === "BOSS" ? 1 : 0,
  };
}

export function bonusPercentage(profile: TaskGamificationProfile): number {
  return Math.min(
    25,
    (profile.weeklyAnchor ? 10 : 0) +
      (profile.scheduledBlock ? 10 : 0) +
      (profile.verifiedMilestone ? 15 : 0),
  );
}

function makeEntry(
  gamification: GamificationState,
  input: Omit<RewardLedgerEntry, "id" | "sequence" | "engineVersion">,
): RewardLedgerEntry {
  return {
    ...input,
    id: `ledger-${stableNumber(input.idempotencyKey).toString(36)}`,
    sequence: gamification.ledger.length + 1,
    engineVersion: GAMIFICATION_ENGINE_VERSION,
  };
}

function isoWeekStart(value: string): string {
  const date = new Date(value);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

const surpriseTitles = [
  "Mooslicht-Banner",
  "Kleiner Archivfuchs",
  "Sternenfenster",
  "Werkstatt-Glocke",
  "Gartenlaterne",
  "Runenkarte",
];

function applySurprise(
  gamification: GamificationState,
  entry: RewardLedgerEntry,
): { state: GamificationState; title: string | null } {
  if (
    !gamification.surprisesEnabled ||
    !entry.difficultyBand ||
    !["D2", "D3", "D4", "D5"].includes(entry.difficultyBand) ||
    entry.xpDelta <= 0 ||
    !entry.district
  ) {
    return { state: gamification, title: null };
  }
  const count = gamification.world.eligibleCompletionsSinceSurprise + 1;
  const week = isoWeekStart(entry.createdAt);
  const surprisesThisWeek = gamification.world.surpriseHistory.filter(
    (date) => isoWeekStart(date) === week,
  ).length;
  const winsRoll = stableNumber(entry.idempotencyKey) % 100 < 12;
  const unlock = surprisesThisWeek < 2 && (winsRoll || count >= 8);
  if (!unlock) {
    return {
      state: {
        ...gamification,
        world: { ...gamification.world, eligibleCompletionsSinceSurprise: count },
      },
      title: null,
    };
  }
  const title = surpriseTitles[stableNumber(entry.id) % surpriseTitles.length];
  return {
    state: {
      ...gamification,
      world: {
        ...gamification.world,
        eligibleCompletionsSinceSurprise: 0,
        surpriseHistory: [...gamification.world.surpriseHistory, entry.createdAt],
        upgrades: [
          ...gamification.world.upgrades,
          {
            id: `surprise-${entry.id}`,
            district: entry.district,
            kind: "DECORATION",
            title,
            unlockedAt: entry.createdAt,
            surprise: true,
          },
        ],
      },
    },
    title,
  };
}

function markAnchorComplete(
  gamification: GamificationState,
  taskId: string,
): GamificationState {
  return {
    ...gamification,
    anchorDays: gamification.anchorDays.map((day) =>
      day.taskIds.includes(taskId) && !day.completedTaskIds.includes(taskId)
        ? { ...day, completedTaskIds: [...day.completedTaskIds, taskId] }
        : day,
    ),
  };
}

export function markTaskCompletionForRhythm(
  gamification: GamificationState,
  taskId: string,
): GamificationState {
  return markAnchorComplete(gamification, taskId);
}

export function applyTaskCompletionReward({
  gamification,
  task,
  allTasks,
  profile,
  completedAt,
}: {
  gamification: GamificationState;
  task: Task;
  allTasks: Task[];
  profile: TaskGamificationProfile;
  completedAt: string;
}): { gamification: GamificationState; entry: RewardLedgerEntry | null; surprise: string | null } {
  const anchored = markAnchorComplete(gamification, task.id);
  if (!profile.confirmedAt) return { gamification: anchored, entry: null, surprise: null };
  const idempotencyKey = `task:${task.id}:completion`;
  if (anchored.ledger.some((entry) => entry.idempotencyKey === idempotencyKey)) {
    return { gamification: anchored, entry: null, surprise: null };
  }

  const parent = task.parentId
    ? allTasks.find((candidate) => candidate.id === task.parentId)
    : null;
  const parentProfile = parent
    ? anchored.profiles.find((candidate) => candidate.taskId === parent.id)
    : null;
  const bossParent = parentProfile?.difficultyBand === "BOSS";
  const budgetKey = parent && !bossParent ? `task-budget:${parent.id}` : `task-budget:${task.id}`;
  const budgetProfile = parentProfile && !bossParent ? parentProfile : profile;
  const bonus = bonusPercentage(budgetProfile);
  let budgetXp = Math.round(BASE_XP[budgetProfile.difficultyBand] * (1 + bonus / 100));
  let resources = fantasyReward(budgetProfile.difficultyBand);

  if (profile.difficultyBand === "BOSS") {
    const childIds = new Set(
      allTasks.filter((candidate) => candidate.parentId === task.id).map((candidate) => candidate.id),
    );
    const milestoneXp = anchored.ledger
      .filter((entry) => childIds.has(entry.sourceId) && entry.xpDelta > 0)
      .reduce((sum, entry) => sum + entry.xpDelta, 0);
    budgetXp = Math.round(milestoneXp * 0.2);
    resources = fantasyReward("BOSS");
  }

  const existing = anchored.ledger.filter(
    (entry) => entry.budgetKey === budgetKey && entry.xpDelta > 0,
  );
  const alreadyXp = existing.reduce((sum, entry) => sum + entry.xpDelta, 0);
  const siblings = parent && !bossParent
    ? allTasks.filter((candidate) => candidate.parentId === parent.id)
    : [];
  const proposedXp = siblings.length
    ? Math.ceil(budgetXp / Math.max(1, siblings.length))
    : budgetXp;
  const xp = Math.max(0, Math.min(proposedXp, budgetXp - alreadyXp));

  const remaining = {
    energy: Math.max(0, resources.energy - existing.reduce((sum, entry) => sum + Math.max(0, entry.energyDelta), 0)),
    runes: Math.max(0, resources.runes - existing.reduce((sum, entry) => sum + Math.max(0, entry.runeDelta), 0)),
    blueprints: Math.max(0, resources.blueprints - existing.reduce((sum, entry) => sum + Math.max(0, entry.blueprintDelta), 0)),
    bossKeys: Math.max(0, resources.bossKeys - existing.reduce((sum, entry) => sum + Math.max(0, entry.bossKeyDelta), 0)),
  };
  const divisor = siblings.length || 1;
  const allocated = (value: number, available: number) =>
    Math.max(0, Math.min(Math.ceil(value / divisor), available));
  const district = districtForArea(task.area);
  const entry = makeEntry(anchored, {
    idempotencyKey,
    createdAt: completedAt,
    kind: profile.difficultyBand === "BOSS" ? "BOSS_REWARD" : "TASK_REWARD",
    sourceId: task.id,
    budgetKey,
    description: `${DIFFICULTY_LABELS[profile.difficultyBand]} · ${task.title}`,
    difficultyBand: profile.difficultyBand,
    verificationType: profile.verificationType,
    district,
    bonusPercent: profile.difficultyBand === "BOSS" ? 20 : bonus,
    xpDelta: xp,
    energyDelta: allocated(resources.energy, remaining.energy),
    runeDelta: allocated(resources.runes, remaining.runes),
    blueprintDelta: allocated(resources.blueprints, remaining.blueprints),
    bossKeyDelta: allocated(resources.bossKeys, remaining.bossKeys),
    courageEmberDelta:
      profile.assessment.activationBarrier >= 4 &&
      existing.reduce((sum, candidate) => sum + Math.max(0, candidate.courageEmberDelta), 0) < 1
        ? 1
        : 0,
  });
  const appended = { ...anchored, ledger: [...anchored.ledger, entry] };
  const surprised = applySurprise(appended, entry);
  return { gamification: surprised.state, entry, surprise: surprised.title };
}

function applyFixedReward(
  gamification: GamificationState,
  input: {
    key: string;
    sourceId: string;
    description: string;
    kind: "COST_REWARD" | "DAY_CLOSE_REWARD";
    createdAt: string;
    district: WorldDistrictKey;
  },
): { gamification: GamificationState; entry: RewardLedgerEntry | null } {
  if (gamification.ledger.some((entry) => entry.idempotencyKey === input.key)) {
    return { gamification, entry: null };
  }
  const entry = makeEntry(gamification, {
    idempotencyKey: input.key,
    createdAt: input.createdAt,
    kind: input.kind,
    sourceId: input.sourceId,
    budgetKey: input.key,
    description: input.description,
    difficultyBand: "D1",
    verificationType: "USER_CONFIRM",
    district: input.district,
    bonusPercent: 0,
    xpDelta: BASE_XP.D1,
    energyDelta: 1,
    runeDelta: 0,
    blueprintDelta: 0,
    bossKeyDelta: 0,
    courageEmberDelta: 0,
  });
  return { gamification: { ...gamification, ledger: [...gamification.ledger, entry] }, entry };
}

export function applyCostPaymentReward(
  gamification: GamificationState,
  costId: string,
  title: string,
  createdAt: string,
) {
  return applyFixedReward(gamification, {
    key: `cost:${costId}:paid`,
    sourceId: costId,
    description: `Quick Win · Zahlung erledigt: ${title}`,
    kind: "COST_REWARD",
    createdAt,
    district: "TREASURY",
  });
}

export function applyDayCloseReward(
  gamification: GamificationState,
  date: string,
  createdAt: string,
) {
  return applyFixedReward(gamification, {
    key: `day:${date}:closed`,
    sourceId: date,
    description: `Quick Win · Tagesabschluss ${date}`,
    kind: "DAY_CLOSE_REWARD",
    createdAt,
    district: "ARCHIVE",
  });
}

export function redeemPersonalReward(
  gamification: GamificationState,
  rewardId: string,
  createdAt: string,
): { gamification: GamificationState; entry: RewardLedgerEntry | null; error: string | null } {
  const reward = gamification.rewardCatalog.find((item) => item.id === rewardId && item.active);
  if (!reward) return { gamification, entry: null, error: "Diese Belohnung ist nicht verfügbar." };
  const totals = ledgerTotals(gamification.ledger);
  if (totals.balanceXp < reward.cost) {
    return { gamification, entry: null, error: "Dafür sind noch nicht genügend Klarpunkte verfügbar." };
  }
  const idempotencyKey = `redeem:${reward.id}:${createdAt}`;
  const entry = makeEntry(gamification, {
    idempotencyKey,
    createdAt,
    kind: "REWARD_REDEMPTION",
    sourceId: reward.id,
    budgetKey: reward.id,
    description: `Persönliche Belohnung eingelöst · ${reward.title}`,
    difficultyBand: null,
    verificationType: "USER_CONFIRM",
    district: null,
    bonusPercent: 0,
    xpDelta: -reward.cost,
    energyDelta: 0,
    runeDelta: 0,
    blueprintDelta: 0,
    bossKeyDelta: 0,
    courageEmberDelta: 0,
  });
  return {
    gamification: { ...gamification, ledger: [...gamification.ledger, entry] },
    entry,
    error: null,
  };
}

export function buildWorldUpgrade(
  gamification: GamificationState,
  district: WorldDistrictKey,
  kind: WorldUpgradeKind,
  createdAt: string,
): { gamification: GamificationState; entry: RewardLedgerEntry | null; error: string | null } {
  const cost = WORLD_UPGRADE_COSTS[kind];
  const totals = ledgerTotals(gamification.ledger);
  if (
    totals.energy < cost.energy ||
    totals.runes < cost.runes ||
    totals.blueprints < cost.blueprints ||
    totals.bossKeys < cost.bossKeys
  ) {
    return { gamification, entry: null, error: "Für diesen Ausbau fehlen noch Ressourcen." };
  }
  const idempotencyKey = `world:${district}:${kind}:${createdAt}`;
  const entry = makeEntry(gamification, {
    idempotencyKey,
    createdAt,
    kind: "WORLD_BUILD",
    sourceId: district,
    budgetKey: district,
    description: `${WORLD_DISTRICT_LABELS[district]} ausgebaut · ${cost.label}`,
    difficultyBand: null,
    verificationType: "USER_CONFIRM",
    district,
    bonusPercent: 0,
    xpDelta: 0,
    energyDelta: -cost.energy,
    runeDelta: -cost.runes,
    blueprintDelta: -cost.blueprints,
    bossKeyDelta: -cost.bossKeys,
    courageEmberDelta: 0,
  });
  return {
    gamification: {
      ...gamification,
      ledger: [...gamification.ledger, entry],
      world: {
        ...gamification.world,
        upgrades: [
          ...gamification.world.upgrades,
          {
            id: `upgrade-${stableNumber(idempotencyKey).toString(36)}`,
            district,
            kind,
            title: cost.label,
            unlockedAt: createdAt,
            surprise: false,
          },
        ],
      },
    },
    entry,
    error: null,
  };
}

function ensureProfile(
  gamification: GamificationState,
  task: Task,
  now: string,
): TaskGamificationProfile {
  const existing = gamification.profiles.find((profile) => profile.taskId === task.id);
  if (existing) return existing;
  const assessment = localComplexityAssessment(task, now);
  return {
    taskId: task.id,
    difficultyBand: assessment.suggestedBand,
    assessment,
    confirmedAt: null,
    verificationType: "GOOGLE_TASK",
    weeklyAnchor: false,
    scheduledBlock: false,
    verifiedMilestone: false,
    anchorRole: null,
    anchorDate: null,
  };
}

export function setDailyAnchor(
  gamification: GamificationState,
  task: Task,
  date: string,
  role: AnchorRole | null,
  now: string,
): GamificationState {
  const profile = ensureProfile(gamification, task, now);
  const profiles = gamification.profiles
    .filter((candidate) => candidate.taskId !== task.id)
    .map((candidate) =>
      role && candidate.anchorDate === date && candidate.anchorRole === role
        ? { ...candidate, anchorRole: null, anchorDate: null }
        : candidate,
    );
  profiles.push({ ...profile, anchorRole: role, anchorDate: role ? date : null });
  const assignedTaskIds = profiles
    .filter((candidate) => candidate.anchorDate === date && candidate.anchorRole)
    .map((candidate) => candidate.taskId)
    .slice(0, 3);
  const existing = gamification.anchorDays.find((day) => day.date === date);
  const day: AnchorDay = {
    date,
    status: existing?.status ?? "PLANNED",
    taskIds: assignedTaskIds,
    completedTaskIds: (existing?.completedTaskIds ?? []).filter((id) => assignedTaskIds.includes(id)),
  };
  const otherDays = gamification.anchorDays
    .filter((candidate) => candidate.date !== date)
    .map((candidate) => ({
      ...candidate,
      taskIds: candidate.taskIds.filter((id) => id !== task.id),
      completedTaskIds: candidate.completedTaskIds.filter((id) => id !== task.id),
    }));
  return {
    ...gamification,
    profiles,
    anchorDays: [...otherDays, day].sort((left, right) => left.date.localeCompare(right.date)),
  };
}

export function setAnchorDayStatus(
  gamification: GamificationState,
  date: string,
  status: AnchorDayStatus,
): GamificationState {
  const existing = gamification.anchorDays.find((day) => day.date === date);
  const day: AnchorDay = existing ?? { date, status, taskIds: [], completedTaskIds: [] };
  return {
    ...gamification,
    anchorDays: [
      ...gamification.anchorDays.filter((candidate) => candidate.date !== date),
      { ...day, status },
    ].sort((left, right) => left.date.localeCompare(right.date)),
  };
}

export function anchorRhythm(
  anchorDays: AnchorDay[],
  today: string,
  windowDays = 14,
) {
  const end = new Date(`${today}T12:00:00Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (windowDays - 1));
  const eligible = anchorDays.filter((day) => {
    const date = new Date(`${day.date}T12:00:00Z`);
    return (
      date >= start &&
      date <= end &&
      day.status === "PLANNED" &&
      day.taskIds.length > 0
    );
  });
  const fulfilled = eligible.filter((day) =>
    day.taskIds.every((taskId) => day.completedTaskIds.includes(taskId)),
  );
  return {
    fulfilledDays: fulfilled.length,
    plannedDays: eligible.length,
    percent: eligible.length ? Math.round((fulfilled.length / eligible.length) * 100) : 0,
  };
}

export function upsertTaskProfile(
  gamification: GamificationState,
  profile: TaskGamificationProfile,
): GamificationState {
  return {
    ...gamification,
    profiles: [
      ...gamification.profiles.filter((candidate) => candidate.taskId !== profile.taskId),
      profile,
    ],
  };
}

export function addGoal(gamification: GamificationState, goal: Goal): GamificationState {
  return { ...gamification, goals: [...gamification.goals, goal] };
}

function adjustWeights(
  weights: AdaptiveRewardWeights,
  presentation: RewardPresentation,
  ratingValue: RewardFeedbackRating,
  now: string,
): AdaptiveRewardWeights {
  if (presentation === "MESSAGE" || ratingValue === "NEUTRAL") return weights;
  if (
    weights.lastAdjustedAt &&
    new Date(now).getTime() - new Date(weights.lastAdjustedAt).getTime() < 7 * 86_400_000
  ) {
    return weights;
  }
  const direction = ratingValue === "MOTIVATING" ? 5 : -5;
  const points = clamp(
    weights.points + (presentation === "POINTS" ? direction : -direction),
    20,
    80,
  );
  return { points, fantasy: 100 - points, lastAdjustedAt: now };
}

export function recordRewardFeedback(
  gamification: GamificationState,
  ledgerEntryId: string,
  presentation: RewardPresentation,
  ratingValue: RewardFeedbackRating,
  createdAt: string,
): GamificationState {
  const id = `feedback-${ledgerEntryId}-${presentation}`;
  const feedback = [
    ...gamification.feedback.filter((item) => item.id !== id),
    { id, ledgerEntryId, presentation, rating: ratingValue, createdAt },
  ];
  const oldest = feedback.reduce<string | null>(
    (result, item) => (!result || item.createdAt < result ? item.createdAt : result),
    null,
  );
  const hasLearningWindow =
    feedback.length >= 8 &&
    Boolean(oldest) &&
    new Date(createdAt).getTime() - new Date(oldest as string).getTime() >= 14 * 86_400_000;
  return {
    ...gamification,
    feedback,
    adaptiveWeights: hasLearningWindow
      ? adjustWeights(gamification.adaptiveWeights, presentation, ratingValue, createdAt)
      : gamification.adaptiveWeights,
  };
}

export function rewardPresentations(gamification: GamificationState): RewardPresentation[] {
  if (gamification.rewardMode === "POINTS") return ["POINTS"];
  if (gamification.rewardMode === "FANTASY") return ["FANTASY"];
  const primary =
    gamification.adaptiveWeights.points >= gamification.adaptiveWeights.fantasy
      ? "POINTS"
      : "FANTASY";
  const secondary = primary === "POINTS" ? "FANTASY" : "POINTS";
  const hasApprovedMessage =
    gamification.drRossEnabled &&
    gamification.approvedMessages.some(
      (message) =>
        message.active &&
        message.contentType !== "GENERIC_AI" &&
        Boolean(message.approvedAt) &&
        Boolean(message.permissionReference.trim()),
    );
  return hasApprovedMessage ? [primary, "MESSAGE"] : [primary, secondary];
}

export function completionMessage(
  category: MessageCategory,
  gamification: GamificationState,
): { text: string; attribution: string | null } {
  const approved = gamification.drRossEnabled
    ? gamification.approvedMessages.find(
        (message) =>
          message.active &&
          message.category === category &&
          message.contentType !== "GENERIC_AI" &&
          Boolean(message.approvedAt) &&
          Boolean(message.permissionReference.trim()),
      )
    : null;
  if (approved) return { text: approved.text, attribution: "Dr. Roß · freigegebener Inhalt" };
  const generic: Record<MessageCategory, string> = {
    DIRECT:
      "Der geplante Start ist verstrichen. Entscheide jetzt: zehn Minuten beginnen oder bewusst neu terminieren.",
    SUPPORT:
      "Du musst nicht das ganze Ziel tragen. Bring nur den nächsten konkreten Schritt über die Linie.",
    RECOVER:
      "Der Wiedereinstieg zählt. Ein kleiner sinnvoller Schritt ist wieder Bewegung in die richtige Richtung.",
    CELEBRATE:
      "Das war nicht nur ein Häkchen, sondern ein schwieriger und sichtbarer Fortschritt.",
  };
  return { text: generic[category], attribution: "Allgemeiner Kompass-Text" };
}

export function withGamification(state: AppState, gamification: GamificationState): AppState {
  return {
    ...state,
    gamification,
    points: ledgerTotals(gamification.ledger).balanceXp,
  };
}
