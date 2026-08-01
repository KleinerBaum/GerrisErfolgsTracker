import type { Task } from "./types";

export type GoogleCapability = "drive" | "tasks" | "calendar" | "gmail";

export type GoogleCapabilityStatus = {
  granted: boolean;
  connectUrl: string;
};

export type GoogleWorkspaceStatus = {
  configured: boolean;
  connected: boolean;
  googleEmail: string | null;
  capabilities: Record<GoogleCapability, GoogleCapabilityStatus>;
};

export type GoogleTasksStatus = {
  configured: boolean;
  connected: boolean;
  authorized: boolean;
  googleEmail: string | null;
  connectUrl: string;
  taskList: { id: string; title: string } | null;
};

export type GoogleTaskList = {
  id: string;
  title: string;
  updatedAt: string | null;
};

type GoogleErrorPayload = {
  error?: string;
  code?: string;
  reconnect?: boolean;
  connectUrl?: string;
  retryable?: boolean;
};

export class GoogleClientError extends Error {
  readonly code: string;
  readonly reconnect: boolean;
  readonly connectUrl: string;
  readonly retryable: boolean;

  constructor(payload: GoogleErrorPayload, fallback: string) {
    super(payload.error || fallback);
    this.name = "GoogleClientError";
    this.code = payload.code || "google_error";
    this.reconnect = Boolean(payload.reconnect);
    this.connectUrl = payload.connectUrl || "";
    this.retryable = Boolean(payload.retryable);
  }
}

async function json<T>(response: Response, fallback: string): Promise<T> {
  let payload: (T & GoogleErrorPayload) | GoogleErrorPayload = {};
  try {
    payload = (await response.json()) as T & GoogleErrorPayload;
  } catch {
    // Die API liefert normalerweise JSON; der Fallback bleibt verständlich.
  }
  if (!response.ok) {
    throw new GoogleClientError(payload, fallback);
  }
  return payload as T;
}

const writeHeaders = { "content-type": "application/json" };

export async function getGoogleWorkspaceStatus(): Promise<GoogleWorkspaceStatus> {
  return json<GoogleWorkspaceStatus>(
    await fetch("/api/google/status", { cache: "no-store" }),
    "Der Google-Status konnte nicht geladen werden.",
  );
}

export async function getGoogleTasksStatus(): Promise<GoogleTasksStatus> {
  return json<GoogleTasksStatus>(
    await fetch("/api/tasks/status", { cache: "no-store" }),
    "Der Google-Tasks-Status konnte nicht geladen werden.",
  );
}

export async function provisionGoogleTasks(): Promise<{
  taskList: { id: string; title: string };
  created: boolean;
}> {
  return json<{
    taskList: { id: string; title: string };
    created: boolean;
  }>(
    await fetch("/api/tasks/provision", { method: "POST" }),
    "Die Google-Tasks-Liste konnte nicht bereitgestellt werden.",
  );
}

export async function listGoogleTasks(): Promise<Task[]> {
  const payload = await json<{ tasks: Task[] }>(
    await fetch("/api/tasks", { cache: "no-store" }),
    "Google Tasks konnte nicht geladen werden.",
  );
  return Array.isArray(payload.tasks) ? payload.tasks : [];
}

export async function listGoogleTaskLists(): Promise<{
  lists: GoogleTaskList[];
  selectedTaskListId: string | null;
}> {
  return json<{
    lists: GoogleTaskList[];
    selectedTaskListId: string | null;
  }>(
    await fetch("/api/tasks/lists", { cache: "no-store" }),
    "Die Google-Tasks-Listen konnten nicht geladen werden.",
  );
}

export async function bootstrapGoogleTasks(
  tasks: Task[],
): Promise<{ tasks: Task[]; imported: number; reused: number }> {
  return json<{ tasks: Task[]; imported: number; reused: number }>(
    await fetch("/api/tasks/bootstrap", {
      method: "POST",
      headers: writeHeaders,
      body: JSON.stringify({ tasks }),
    }),
    "Die bisherigen Aufgaben konnten nicht übernommen werden.",
  );
}

export async function createGoogleTask(task: Task): Promise<Task> {
  const payload = await json<{ task: Task }>(
    await fetch("/api/tasks", {
      method: "POST",
      headers: writeHeaders,
      body: JSON.stringify({
        title: task.title,
        dueAt: task.dueAt,
        completed: task.completed,
        notes: task.notes || "",
        legacyId: task.id,
        taskListId: task.taskListId,
        area: task.area,
        quadrant: task.quadrant,
        estimateMinutes: task.estimateMinutes,
        progress: task.progress,
        confidential: task.confidential,
        reminderAt: task.reminderAt,
      }),
    }),
    "Die Aufgabe konnte nicht in Google Tasks gespeichert werden.",
  );
  return payload.task;
}

export async function updateGoogleTask(
  task: Task,
  changes: Partial<Task>,
): Promise<Task> {
  const payload = await json<{ task: Task }>(
    await fetch(
      `/api/tasks/${encodeURIComponent(task.id)}?${new URLSearchParams({
        taskListId: task.taskListId || "",
      })}`,
      {
      method: "PATCH",
      headers: {
        ...writeHeaders,
        ...(task.etag ? { "if-match": task.etag } : {}),
      },
      body: JSON.stringify({ ...changes, etag: task.etag || undefined }),
      },
    ),
    "Die Aufgabe konnte nicht in Google Tasks aktualisiert werden.",
  );
  return payload.task;
}

export async function deleteGoogleTask(task: Task): Promise<void> {
  const query = new URLSearchParams({
    taskListId: task.taskListId || "",
    ...(task.assigned ? { confirmAssigned: "true" } : {}),
  });
  await json<{ ok: boolean }>(
    await fetch(`/api/tasks/${encodeURIComponent(task.id)}?${query}`, {
      method: "DELETE",
      headers: task.etag ? { "if-match": task.etag } : undefined,
    }),
    "Die Aufgabe konnte nicht aus Google Tasks gelöscht werden.",
  );
}
