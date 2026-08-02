import type { PlanningHealthReport, Task } from "./types";

export type DiaryPlanningSuggestionSource =
  | "task"
  | "gap"
  | "topic"
  | "custom";

export type DiaryPlanningSuggestionPriority =
  | "critical"
  | "important"
  | "normal";

export type DiaryPlanningSuggestion = {
  id: string;
  sourceKind: DiaryPlanningSuggestionSource;
  sourceId: string;
  title: string;
  detail: string;
  status: "open" | "snoozed";
  priority: DiaryPlanningSuggestionPriority;
  dueAt: string | null;
};

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const suggestionRank = (suggestion: DiaryPlanningSuggestion): number => {
  const priority =
    suggestion.priority === "critical"
      ? 0
      : suggestion.priority === "important"
        ? 1
        : 2;
  return priority * 10 + (suggestion.status === "snoozed" ? 1 : 0);
};

export function buildDiaryPlanningSuggestions({
  tasks,
  report,
}: {
  tasks: Task[];
  report: PlanningHealthReport | null;
}): DiaryPlanningSuggestion[] {
  const openTasks = tasks.filter((task) => !task.completed);
  const openTaskIds = new Set(openTasks.map((task) => task.id));
  const suggestions: DiaryPlanningSuggestion[] = openTasks.map((task) => ({
    id: `task:${task.id}`,
    sourceKind: "task",
    sourceId: task.id,
    title: task.title,
    detail: task.notes?.trim() || "Offene Aufgabe",
    status: "open",
    priority:
      task.quadrant === "do"
        ? "critical"
        : task.quadrant === "plan"
          ? "important"
          : "normal",
    dueAt: task.dueAt,
  }));

  for (const gap of report?.gaps ?? []) {
    if (gap.status === "resolved" || (gap.googleTaskId && openTaskIds.has(gap.googleTaskId))) {
      continue;
    }
    suggestions.push({
      id: `gap:${gap.id}`,
      sourceKind: "gap",
      sourceId: gap.id,
      title: gap.title,
      detail: gap.detail,
      status: gap.status === "snoozed" ? "snoozed" : "open",
      priority: gap.severity,
      dueAt: gap.snoozedUntil || gap.dueAt,
    });
  }

  for (const topic of report?.openTopics ?? []) {
    if (topic.status === "resolved") continue;
    suggestions.push({
      id: `topic:${topic.id}`,
      sourceKind: "topic",
      sourceId: topic.id,
      title: topic.title,
      detail: topic.nextStep || topic.detail || "Offenes Thema",
      status: topic.status === "snoozed" ? "snoozed" : "open",
      priority:
        topic.group === "decision" || topic.requiresCalendarTarget
          ? "important"
          : "normal",
      dueAt: topic.snoozedUntil || topic.dueAt,
    });
  }

  return suggestions.sort(
    (left, right) =>
      suggestionRank(left) - suggestionRank(right) ||
      (left.dueAt || "9999").localeCompare(right.dueAt || "9999") ||
      left.title.localeCompare(right.title, "de"),
  );
}

export function addDiaryDays(dateKey: string, days: number): string {
  if (!DATE_KEY.test(dateKey)) return dateKey;
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isSundayDate(dateKey: string): boolean {
  return DATE_KEY.test(dateKey) && new Date(`${dateKey}T12:00:00.000Z`).getUTCDay() === 0;
}
