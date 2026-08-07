import type { Task } from "./types";

const validTimestamp = (
  value: string | null | undefined,
  fallback: number,
): number => {
  if (!value) return fallback;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : fallback;
};

export function orderOpenTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((left, right) => {
    const dueDifference =
      validTimestamp(left.dueAt, Number.MAX_SAFE_INTEGER) -
      validTimestamp(right.dueAt, Number.MAX_SAFE_INTEGER);
    if (dueDifference) return dueDifference;
    const progressDifference = right.progress - left.progress;
    if (progressDifference) return progressDifference;
    return left.title.localeCompare(right.title, "de-DE");
  });
}

export function orderCompletedTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((left, right) => {
    const completedDifference =
      validTimestamp(right.completedAt ?? right.updatedAt, 0) -
      validTimestamp(left.completedAt ?? left.updatedAt, 0);
    if (completedDifference) return completedDifference;
    return left.title.localeCompare(right.title, "de-DE");
  });
}
