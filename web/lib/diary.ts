import type {
  DiaryReviewArea,
  DiarySaveInput,
  JournalEntry,
} from "./types";

export const DIARY_REVIEW_AREAS = [
  "tasks",
  "calendar",
  "applications",
  "finance",
  "documents",
] as const satisfies readonly DiaryReviewArea[];

const REVIEW_AREA_SET = new Set<string>(DIARY_REVIEW_AREAS);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const textValue = (value: unknown): string =>
  typeof value === "string" ? value : "";

const optionalText = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const optionalNullableText = (value: unknown): string | null | undefined =>
  value === null ? null : optionalText(value);

const clampMood = (value: unknown): number => {
  const mood = typeof value === "number" && Number.isFinite(value) ? value : 3;
  return Math.min(5, Math.max(1, Math.round(mood)));
};

const reviewAreas = (value: unknown): DiaryReviewArea[] =>
  Array.isArray(value)
    ? Array.from(
        new Set(
          value.filter(
            (area): area is DiaryReviewArea =>
              typeof area === "string" && REVIEW_AREA_SET.has(area),
          ),
        ),
      )
    : [];

const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? Array.from(
        new Set(
          value.filter(
            (item): item is string =>
              typeof item === "string" && item.trim().length > 0,
          ),
        ),
      )
    : [];

export function normalizeDiaryEntries(value: unknown): JournalEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((candidate, index): JournalEntry[] => {
      if (!isRecord(candidate)) return [];
      const date = textValue(candidate.date);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
      const normalized: JournalEntry = {
        id: textValue(candidate.id) || `journal-${date}-${index}`,
        date,
        mood: clampMood(candidate.mood),
        text: textValue(candidate.text),
        win: textValue(candidate.win),
        nextStep: textValue(candidate.nextStep),
      };
      const weekPlan = optionalText(candidate.weekPlan);
      const closedAt = optionalNullableText(candidate.closedAt);
      const plannedTaskId = optionalNullableText(candidate.plannedTaskId);
      if (weekPlan !== undefined) normalized.weekPlan = weekPlan;
      if (closedAt !== undefined) normalized.closedAt = closedAt;
      if (plannedTaskId !== undefined) normalized.plannedTaskId = plannedTaskId;
      normalized.reviewedAreas = reviewAreas(candidate.reviewedAreas);
      normalized.linkedApplicationIds = stringList(
        candidate.linkedApplicationIds,
      );
      const snapshot = candidate.snapshot;
      if (isRecord(snapshot)) {
        const numberValue = (key: string): number => {
          const raw = snapshot[key];
          return typeof raw === "number" && Number.isFinite(raw)
            ? Math.max(0, Math.round(raw))
            : 0;
        };
        normalized.snapshot = {
          openTasks: numberValue("openTasks"),
          overdueTasks: numberValue("overdueTasks"),
          tomorrowTasks: numberValue("tomorrowTasks"),
          tomorrowEvents: numberValue("tomorrowEvents"),
          weekEvents: numberValue("weekEvents"),
          activeApplications: numberValue("activeApplications"),
          upcomingApplicationSteps: numberValue("upcomingApplicationSteps"),
          dueCosts: numberValue("dueCosts"),
          documentsToReview: numberValue("documentsToReview"),
        };
      }
      return [normalized];
    })
    .sort((left, right) => right.date.localeCompare(left.date));
}

export function upsertDiaryEntry(
  entries: JournalEntry[],
  input: DiarySaveInput,
  date: string,
  now: string,
  createId: () => string,
): { entries: JournalEntry[]; created: boolean } {
  const existing = entries.find((entry) => entry.date === date);
  const linkedApplicationIds = Array.from(
    new Set([
      ...(existing?.linkedApplicationIds ?? []),
      ...(input.linkedApplicationIds ?? []),
    ]),
  );
  const appendText = (current: string | undefined, addition: string): string => {
    const cleaned = addition.trim();
    if (!cleaned) return current ?? "";
    if (!current?.trim()) return cleaned;
    if (current.trim() === cleaned) return current;
    return `${current.trim()}\n\n${cleaned}`;
  };
  const appendToDay = Boolean(existing && input.appendToDay);
  const entry: JournalEntry = {
    ...existing,
    id: existing?.id ?? createId(),
    date,
    mood: clampMood(input.mood),
    text: appendToDay
      ? appendText(existing?.text, input.text)
      : input.text,
    win: appendToDay ? input.win.trim() || existing?.win || "" : input.win,
    nextStep: appendToDay
      ? input.nextStep.trim() || existing?.nextStep || ""
      : input.nextStep,
    weekPlan: input.weekPlan ?? existing?.weekPlan ?? "",
    reviewedAreas: input.reviewedAreas ?? existing?.reviewedAreas ?? [],
    closedAt: input.closeDay ? now : (existing?.closedAt ?? null),
    plannedTaskId:
      input.plannedTaskId === undefined
        ? (existing?.plannedTaskId ?? null)
        : input.plannedTaskId,
    linkedApplicationIds,
    snapshot: input.snapshot ?? existing?.snapshot,
  };
  return {
    entries: [entry, ...entries.filter((candidate) => candidate.date !== date)].sort(
      (left, right) => right.date.localeCompare(left.date),
    ),
    created: !existing,
  };
}

export function diaryRhythmDays(entries: JournalEntry[], today: string): number {
  const todayAtNoon = new Date(`${today}T12:00:00`).getTime();
  const recentDates = new Set(
    entries
      .map((entry) => entry.date)
      .filter((entryDate) => {
        const difference =
          todayAtNoon - new Date(`${entryDate}T12:00:00`).getTime();
        return difference >= 0 && difference < 7 * 86_400_000;
      }),
  );
  return Math.min(7, recentDates.size);
}
