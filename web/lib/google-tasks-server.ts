import { and, eq } from "drizzle-orm";

import { getDb } from "../db";
import { googleTaskMetadata, googleTaskSettings } from "../db/schema";
import {
  type GoogleConnection,
  GoogleApiError,
  GoogleValidationError,
  googleApiJson,
} from "./google-workspace-server";
import type { LifeArea, TaskQuadrant } from "./types";

const TASKS_API = "https://tasks.googleapis.com/tasks/v1";
const MAX_BOOTSTRAP_TASKS = 500;
const TASK_LIST_LEASE_PREFIX = "__gerris_tasks_provisioning__:";
const TASK_LIST_LEASE_MS = 120_000;
const TASK_LIST_PROVISION_WAIT_MS = 5_000;
const LIFE_AREAS = new Set<LifeArea>([
  "alltag",
  "arbeit",
  "finanzen",
  "gesundheit",
  "wohnen",
  "persoenlich",
]);
const QUADRANTS = new Set<TaskQuadrant>(["do", "plan", "delegate", "drop"]);

function gerrisTaskListTitle(): string {
  return process.env.GOOGLE_TASKS_LIST_NAME?.trim() || "Gerris Kompass";
}

type GoogleTaskList = {
  id?: string;
  etag?: string;
  title?: string;
  updated?: string;
  selfLink?: string;
};

type GoogleTask = {
  id?: string;
  etag?: string;
  title?: string;
  updated?: string;
  selfLink?: string;
  parent?: string;
  position?: string;
  notes?: string;
  status?: "needsAction" | "completed";
  due?: string;
  completed?: string;
  deleted?: boolean;
  hidden?: boolean;
  links?: Array<{ type?: string; description?: string; link?: string }>;
  webViewLink?: string;
  assignmentInfo?: unknown;
};

type Sidecar = typeof googleTaskMetadata.$inferSelect;
type TaskListSetting = typeof googleTaskSettings.$inferSelect;

export type GerrisTaskList = {
  id: string;
  title: string;
  updatedAt: string | null;
};

export type ProvisionedGerrisTaskList = {
  taskList: GerrisTaskList;
  created: boolean;
};

export type GerrisTask = {
  id: string;
  taskListId: string;
  taskListTitle: string;
  legacyId: string | null;
  title: string;
  notes: string;
  dueAt: string | null;
  completed: boolean;
  completedAt: string | null;
  updatedAt: string | null;
  etag: string | null;
  webViewLink: string | null;
  assigned: boolean;
  parentId: string | null;
  reminderAt: string | null;
  reminderCalendarId: string | null;
  reminderEventId: string | null;
  area: LifeArea;
  quadrant: TaskQuadrant;
  estimateMinutes: number;
  progress: number;
  confidential: boolean;
};

export type CreateTaskInput = {
  title: string;
  taskListId?: string;
  notes?: string;
  dueAt?: string | null;
  reminderAt?: string | null;
  completed?: boolean;
  legacyId?: string | null;
  area?: LifeArea;
  quadrant?: TaskQuadrant;
  estimateMinutes?: number;
  progress?: number;
  confidential?: boolean;
};

export type UpdateTaskInput = {
  title?: string;
  notes?: string;
  dueAt?: string | null;
  completed?: boolean;
  area?: LifeArea;
  quadrant?: TaskQuadrant;
  estimateMinutes?: number;
  progress?: number;
  confidential?: boolean;
  etag?: string;
};

export type BootstrapTaskInput = CreateTaskInput & {
  id?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function requiredTitle(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new GoogleValidationError("Ein Aufgabentitel ist erforderlich.");
  }
  const title = value.trim();
  if (title.length > 1024) {
    throw new GoogleValidationError(
      "Der Aufgabentitel darf höchstens 1.024 Zeichen enthalten.",
    );
  }
  return title;
}

function optionalNotes(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new GoogleValidationError("Die Aufgabennotiz ist ungültig.");
  }
  if (value.length > 8192) {
    throw new GoogleValidationError(
      "Die Aufgabennotiz darf höchstens 8.192 Zeichen enthalten.",
    );
  }
  return value;
}

function optionalDue(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new GoogleValidationError("Das Fälligkeitsdatum ist ungültig.");
  }
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) {
    throw new GoogleValidationError("Das Fälligkeitsdatum ist ungültig.");
  }
  const date = new Date(`${match[1]}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== match[1]
  ) {
    throw new GoogleValidationError("Das Fälligkeitsdatum ist ungültig.");
  }
  return `${match[1]}T00:00:00.000Z`;
}

function optionalBoolean(
  value: unknown,
  label: string,
): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new GoogleValidationError(`${label} ist ungültig.`);
  }
  return value;
}

function optionalInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new GoogleValidationError(`${label} ist ungültig.`);
  }
  return value;
}

function optionalLegacyId(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string" || !value.trim() || value.length > 255) {
    throw new GoogleValidationError("Die bisherige Aufgaben-ID ist ungültig.");
  }
  return value.trim();
}

function optionalTaskListId(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !value.trim() || value.length > 1_024) {
    throw new GoogleValidationError("Die Aufgabenliste ist ungültig.");
  }
  return value.trim();
}

function optionalReminderAt(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new GoogleValidationError("Der Erinnerungszeitpunkt ist ungültig.");
  }
  const reminderAt = new Date(value);
  const maximum = Date.now() + 10 * 365 * 86_400_000;
  if (
    Number.isNaN(reminderAt.getTime()) ||
    reminderAt.getTime() < Date.now() - 60_000 ||
    reminderAt.getTime() > maximum
  ) {
    throw new GoogleValidationError(
      "Die Erinnerung muss zwischen jetzt und zehn Jahren liegen.",
    );
  }
  return reminderAt.toISOString();
}

function optionalArea(value: unknown): LifeArea | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !LIFE_AREAS.has(value as LifeArea)) {
    throw new GoogleValidationError("Der Lebensbereich ist ungültig.");
  }
  return value as LifeArea;
}

function optionalQuadrant(value: unknown): TaskQuadrant | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !QUADRANTS.has(value as TaskQuadrant)) {
    throw new GoogleValidationError("Der Aufgabenquadrant ist ungültig.");
  }
  return value as TaskQuadrant;
}

export function parseCreateTaskInput(value: unknown): CreateTaskInput {
  if (!isRecord(value)) {
    throw new GoogleValidationError("Die Aufgabendaten sind ungültig.");
  }
  return {
    title: requiredTitle(value.title),
    taskListId: optionalTaskListId(value.taskListId),
    notes: optionalNotes(value.notes),
    dueAt: optionalDue(value.dueAt),
    reminderAt: optionalReminderAt(value.reminderAt),
    completed: optionalBoolean(value.completed, "Der Aufgabenstatus"),
    legacyId: optionalLegacyId(value.legacyId),
    area: optionalArea(value.area),
    quadrant: optionalQuadrant(value.quadrant),
    estimateMinutes: optionalInteger(
      value.estimateMinutes,
      "Die Zeitschätzung",
      0,
      10_080,
    ),
    progress: optionalInteger(value.progress, "Der Fortschritt", 0, 100),
    confidential: optionalBoolean(
      value.confidential,
      "Die Vertraulichkeitsangabe",
    ),
  };
}

export function parseUpdateTaskInput(value: unknown): UpdateTaskInput {
  if (!isRecord(value)) {
    throw new GoogleValidationError("Die Aufgabendaten sind ungültig.");
  }
  const result: UpdateTaskInput = {};
  if ("title" in value) result.title = requiredTitle(value.title);
  if ("notes" in value) result.notes = optionalNotes(value.notes);
  if ("dueAt" in value) result.dueAt = optionalDue(value.dueAt);
  if ("completed" in value) {
    result.completed = optionalBoolean(value.completed, "Der Aufgabenstatus");
  }
  if ("area" in value) result.area = optionalArea(value.area);
  if ("quadrant" in value) {
    result.quadrant = optionalQuadrant(value.quadrant);
  }
  if ("estimateMinutes" in value) {
    result.estimateMinutes = optionalInteger(
      value.estimateMinutes,
      "Die Zeitschätzung",
      0,
      10_080,
    );
  }
  if ("progress" in value) {
    result.progress = optionalInteger(value.progress, "Der Fortschritt", 0, 100);
  }
  if ("confidential" in value) {
    result.confidential = optionalBoolean(
      value.confidential,
      "Die Vertraulichkeitsangabe",
    );
  }
  if ("etag" in value) {
    if (typeof value.etag !== "string" || !value.etag.trim()) {
      throw new GoogleValidationError("Die Änderungsversion ist ungültig.");
    }
    result.etag = value.etag.trim();
  }
  if (Object.keys(result).length === 0) {
    throw new GoogleValidationError("Es wurde keine Änderung angegeben.");
  }
  return result;
}

export function parseBootstrapTasks(value: unknown): BootstrapTaskInput[] {
  if (!isRecord(value) || !Array.isArray(value.tasks)) {
    throw new GoogleValidationError("Die zu importierenden Aufgaben fehlen.");
  }
  if (value.tasks.length > MAX_BOOTSTRAP_TASKS) {
    throw new GoogleValidationError(
      `Es können höchstens ${MAX_BOOTSTRAP_TASKS} Aufgaben auf einmal übernommen werden.`,
    );
  }
  return value.tasks.map((task): BootstrapTaskInput => {
    if (!isRecord(task)) {
      throw new GoogleValidationError("Eine zu importierende Aufgabe ist ungültig.");
    }
    const input = parseCreateTaskInput({
      ...task,
      legacyId: task.legacyId ?? task.id,
    });
    return { ...input, id: typeof task.id === "string" ? task.id : undefined };
  });
}

async function allTaskLists(
  connection: GoogleConnection,
): Promise<GoogleTaskList[]> {
  const lists: GoogleTaskList[] = [];
  let pageToken = "";
  do {
    const query = new URLSearchParams({ maxResults: "100" });
    if (pageToken) query.set("pageToken", pageToken);
    const page = await googleApiJson<{
      items?: GoogleTaskList[];
      nextPageToken?: string;
    }>(connection, `${TASKS_API}/users/@me/lists?${query}`);
    lists.push(...(page.items || []));
    pageToken = page.nextPageToken || "";
  } while (pageToken);
  return lists;
}

function normalizedTaskList(list: GoogleTaskList): GerrisTaskList {
  if (!list.id) {
    throw new GoogleApiError("Google hat keine Aufgabenlisten-ID geliefert.", 502);
  }
  return {
    id: list.id,
    title: list.title || "Unbenannte Aufgabenliste",
    updatedAt: list.updated || null,
  };
}

export async function listGoogleTaskLists(
  connection: GoogleConnection,
): Promise<GerrisTaskList[]> {
  return (await allTaskLists(connection))
    .filter((list) => Boolean(list.id))
    .map(normalizedTaskList)
    .sort((left, right) => left.title.localeCompare(right.title, "de"));
}

async function taskListSetting(
  ownerEmail: string,
): Promise<TaskListSetting | null> {
  const [setting] = await getDb()
    .select()
    .from(googleTaskSettings)
    .where(eq(googleTaskSettings.ownerEmail, ownerEmail))
    .limit(1);
  return setting ?? null;
}

function leaseExpiry(taskListId: string | null | undefined): number | null {
  if (!taskListId?.startsWith(TASK_LIST_LEASE_PREFIX)) return null;
  const expiry = Number(taskListId.slice(TASK_LIST_LEASE_PREFIX.length).split(":")[0]);
  return Number.isFinite(expiry) ? expiry : 0;
}

function selectedTaskList(
  lists: GoogleTaskList[],
  setting: TaskListSetting | null,
): GoogleTaskList | null {
  const storedTaskListId =
    setting && leaseExpiry(setting.taskListId) === null
      ? setting.taskListId
      : null;
  return (
    lists.find((list) => list.id === storedTaskListId) ||
    lists.find((list) => list.title?.trim() === gerrisTaskListTitle()) ||
    null
  );
}

/**
 * Resolves the configured Gerris list without changing Google or D1 state.
 * GET routes must use this read-only path and leave provisioning to POST.
 */
export async function findGerrisTaskList(
  connection: GoogleConnection,
): Promise<GerrisTaskList | null> {
  const [setting, lists] = await Promise.all([
    taskListSetting(connection.ownerEmail),
    allTaskLists(connection),
  ]);
  const selected = selectedTaskList(lists, setting);
  return selected ? normalizedTaskList(selected) : null;
}

async function requireGerrisTaskList(
  connection: GoogleConnection,
): Promise<GerrisTaskList> {
  const taskList = await findGerrisTaskList(connection);
  if (!taskList) {
    throw new GoogleApiError(
      "Die Gerris-Kompass-Aufgabenliste wurde noch nicht bereitgestellt.",
      409,
      true,
    );
  }
  return taskList;
}

async function requireTaskList(
  connection: GoogleConnection,
  requestedTaskListId?: string,
): Promise<GerrisTaskList> {
  if (!requestedTaskListId) return requireGerrisTaskList(connection);
  const selected = (await allTaskLists(connection)).find(
    (list) => list.id === requestedTaskListId,
  );
  if (!selected) {
    throw new GoogleValidationError(
      "Die ausgewählte Google-Tasks-Liste ist nicht mehr verfügbar.",
    );
  }
  return normalizedTaskList(selected);
}

function provisioningLease(): {
  marker: string;
  expiresAt: number;
} {
  const expiresAt = Date.now() + TASK_LIST_LEASE_MS;
  return {
    marker: `${TASK_LIST_LEASE_PREFIX}${expiresAt}:${crypto.randomUUID()}`,
    expiresAt,
  };
}

async function reserveTaskListProvisioning(
  ownerEmail: string,
  observed: TaskListSetting | null,
): Promise<string | null> {
  const lease = provisioningLease();
  const now = new Date().toISOString();
  if (!observed) {
    const inserted = await getDb()
      .insert(googleTaskSettings)
      .values({
        ownerEmail,
        taskListId: lease.marker,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({ taskListId: googleTaskSettings.taskListId });
    return inserted[0]?.taskListId === lease.marker ? lease.marker : null;
  }

  const existingLeaseExpiry = leaseExpiry(observed.taskListId);
  if (existingLeaseExpiry !== null && existingLeaseExpiry > Date.now()) {
    return null;
  }
  const updated = await getDb()
    .update(googleTaskSettings)
    .set({ taskListId: lease.marker, updatedAt: now })
    .where(
      and(
        eq(googleTaskSettings.ownerEmail, ownerEmail),
        eq(googleTaskSettings.taskListId, observed.taskListId),
      ),
    )
    .returning({ taskListId: googleTaskSettings.taskListId });
  return updated[0]?.taskListId === lease.marker ? lease.marker : null;
}

async function releaseTaskListProvisioning(
  ownerEmail: string,
  leaseMarker: string,
): Promise<void> {
  await getDb()
    .delete(googleTaskSettings)
    .where(
      and(
        eq(googleTaskSettings.ownerEmail, ownerEmail),
        eq(googleTaskSettings.taskListId, leaseMarker),
      ),
    );
}

async function finalizeTaskListProvisioning(
  ownerEmail: string,
  leaseMarker: string,
  taskListId: string,
): Promise<boolean> {
  const updated = await getDb()
    .update(googleTaskSettings)
    .set({
      taskListId,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(googleTaskSettings.ownerEmail, ownerEmail),
        eq(googleTaskSettings.taskListId, leaseMarker),
      ),
    )
    .returning({ taskListId: googleTaskSettings.taskListId });
  return updated[0]?.taskListId === taskListId;
}

async function waitForProvisioningLease(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 150));
}

/**
 * Provisions the list only from an explicit, same-origin POST route.
 *
 * A per-owner D1 row acts as a compare-and-swap lease. This survives Worker
 * isolate boundaries and prevents two concurrent requests from both creating
 * a Google Tasks list.
 */
export async function provisionGerrisTaskList(
  connection: GoogleConnection,
): Promise<ProvisionedGerrisTaskList> {
  const deadline = Date.now() + TASK_LIST_PROVISION_WAIT_MS;
  while (Date.now() < deadline) {
    const observed = await taskListSetting(connection.ownerEmail);
    const activeLeaseExpiry = leaseExpiry(observed?.taskListId);
    if (activeLeaseExpiry !== null && activeLeaseExpiry > Date.now()) {
      await waitForProvisioningLease();
      continue;
    }

    const lists = await allTaskLists(connection);
    const selected = selectedTaskList(lists, observed);
    if (
      selected &&
      observed?.taskListId === selected.id &&
      activeLeaseExpiry === null
    ) {
      return { taskList: normalizedTaskList(selected), created: false };
    }

    const leaseMarker = await reserveTaskListProvisioning(
      connection.ownerEmail,
      observed,
    );
    if (!leaseMarker) {
      await waitForProvisioningLease();
      continue;
    }

    let finalized = false;
    try {
      // Re-read Google while holding the D1 lease. This also recovers a list
      // created by an earlier request that expired before persisting its ID.
      const currentLists = await allTaskLists(connection);
      let provisioned = selectedTaskList(currentLists, null);
      let created = false;
      if (!provisioned) {
        provisioned = await googleApiJson<GoogleTaskList>(
          connection,
          `${TASKS_API}/users/@me/lists`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: gerrisTaskListTitle() }),
          },
        );
        created = true;
      }
      const taskList = normalizedTaskList(provisioned);
      finalized = await finalizeTaskListProvisioning(
        connection.ownerEmail,
        leaseMarker,
        taskList.id,
      );
      if (!finalized) {
        throw new GoogleApiError(
          "Die Aufgabenliste wird bereits in einer anderen Anfrage bereitgestellt.",
          409,
          true,
        );
      }
      return { taskList, created };
    } finally {
      if (!finalized) {
        await releaseTaskListProvisioning(connection.ownerEmail, leaseMarker);
      }
    }
  }

  throw new GoogleApiError(
    "Die Aufgabenliste wird gerade bereitgestellt. Bitte gleich erneut versuchen.",
    409,
    true,
  );
}

async function allTasks(
  connection: GoogleConnection,
  taskListId: string,
): Promise<GoogleTask[]> {
  const tasks: GoogleTask[] = [];
  let pageToken = "";
  do {
    const query = new URLSearchParams({
      maxResults: "100",
      showCompleted: "true",
      showHidden: "true",
      showDeleted: "false",
      showAssigned: "true",
    });
    if (pageToken) query.set("pageToken", pageToken);
    const page = await googleApiJson<{
      items?: GoogleTask[];
      nextPageToken?: string;
    }>(
      connection,
      `${TASKS_API}/lists/${encodeURIComponent(taskListId)}/tasks?${query}`,
    );
    tasks.push(...(page.items || []));
    pageToken = page.nextPageToken || "";
  } while (pageToken);
  return tasks;
}

async function taskSidecars(
  ownerEmail: string,
  taskListId: string,
): Promise<Map<string, Sidecar>> {
  const rows = await getDb()
    .select()
    .from(googleTaskMetadata)
    .where(
      and(
        eq(googleTaskMetadata.ownerEmail, ownerEmail),
        eq(googleTaskMetadata.taskListId, taskListId),
      ),
    );
  return new Map(rows.map((row) => [row.googleTaskId, row]));
}

async function sidecarForTask(
  ownerEmail: string,
  taskListId: string,
  taskId: string,
): Promise<Sidecar | null> {
  const [row] = await getDb()
    .select()
    .from(googleTaskMetadata)
    .where(
      and(
        eq(googleTaskMetadata.ownerEmail, ownerEmail),
        eq(googleTaskMetadata.taskListId, taskListId),
        eq(googleTaskMetadata.googleTaskId, taskId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function sidecarForLegacyId(
  ownerEmail: string,
  legacyId: string,
): Promise<Sidecar | null> {
  const [row] = await getDb()
    .select()
    .from(googleTaskMetadata)
    .where(
      and(
        eq(googleTaskMetadata.ownerEmail, ownerEmail),
        eq(googleTaskMetadata.legacyId, legacyId),
      ),
    )
    .limit(1);
  return row ?? null;
}

function mergeTask(
  taskList: GerrisTaskList,
  task: GoogleTask,
  sidecar: Sidecar | null,
): GerrisTask {
  if (!task.id) {
    throw new GoogleApiError("Google hat keine Aufgaben-ID geliefert.", 502);
  }
  return {
    id: task.id,
    taskListId: taskList.id,
    taskListTitle: taskList.title,
    legacyId: sidecar?.legacyId || null,
    title: task.title?.trim() || "Unbenannte Aufgabe",
    notes: task.notes || "",
    dueAt: task.due || null,
    completed: task.status === "completed",
    completedAt: task.completed || null,
    updatedAt: task.updated || null,
    etag: task.etag || null,
    webViewLink: task.webViewLink || null,
    assigned: Boolean(task.assignmentInfo),
    parentId: task.parent || null,
    reminderAt: sidecar?.reminderAt || null,
    reminderCalendarId: sidecar?.reminderCalendarId || null,
    reminderEventId: sidecar?.reminderEventId || null,
    area: LIFE_AREAS.has(sidecar?.area as LifeArea)
      ? (sidecar?.area as LifeArea)
      : "alltag",
    quadrant: QUADRANTS.has(sidecar?.quadrant as TaskQuadrant)
      ? (sidecar?.quadrant as TaskQuadrant)
      : "plan",
    estimateMinutes: sidecar?.estimateMinutes ?? 30,
    progress:
      task.status === "completed" ? 100 : (sidecar?.progress ?? 0),
    confidential: sidecar?.confidential ?? true,
  };
}

async function getGoogleTask(
  connection: GoogleConnection,
  taskListId: string,
  taskId: string,
): Promise<GoogleTask> {
  return googleApiJson<GoogleTask>(
    connection,
    `${TASKS_API}/lists/${encodeURIComponent(
      taskListId,
    )}/tasks/${encodeURIComponent(taskId)}`,
  );
}

export async function listGerrisTasks(
  connection: GoogleConnection,
): Promise<{ taskList: GerrisTaskList; tasks: GerrisTask[] }> {
  const taskList = await requireGerrisTaskList(connection);
  const [googleTasks, metadata] = await Promise.all([
    allTasks(connection, taskList.id),
    taskSidecars(connection.ownerEmail, taskList.id),
  ]);
  const tasks = googleTasks
    .filter((task) => !task.deleted)
    .map((task) => mergeTask(taskList, task, metadata.get(task.id || "") || null))
    .sort((left, right) => {
      if (left.completed !== right.completed) return left.completed ? 1 : -1;
      if (left.dueAt !== right.dueAt) {
        if (!left.dueAt) return 1;
        if (!right.dueAt) return -1;
        return left.dueAt.localeCompare(right.dueAt);
      }
      return left.title.localeCompare(right.title, "de");
    });
  return { taskList, tasks };
}

export async function listTasksAcrossGoogleLists(
  connection: GoogleConnection,
): Promise<{ taskLists: GerrisTaskList[]; tasks: GerrisTask[] }> {
  const taskLists = await listGoogleTaskLists(connection);
  const groups = await Promise.all(
    taskLists.map(async (taskList) => {
      const [googleTasks, metadata] = await Promise.all([
        allTasks(connection, taskList.id),
        taskSidecars(connection.ownerEmail, taskList.id),
      ]);
      return googleTasks
        .filter((task) => !task.deleted)
        .map((task) =>
          mergeTask(taskList, task, metadata.get(task.id || "") || null),
        );
    }),
  );
  const tasks = groups.flat().sort((left, right) => {
    if (left.completed !== right.completed) return left.completed ? 1 : -1;
    if (left.dueAt !== right.dueAt) {
      if (!left.dueAt) return 1;
      if (!right.dueAt) return -1;
      return left.dueAt.localeCompare(right.dueAt);
    }
    return left.title.localeCompare(right.title, "de");
  });
  return { taskLists, tasks };
}

export async function getGerrisTask(
  connection: GoogleConnection,
  taskId: string,
  requestedTaskListId?: string,
): Promise<GerrisTask> {
  const taskList = await requireTaskList(connection, requestedTaskListId);
  const [task, metadata] = await Promise.all([
    getGoogleTask(connection, taskList.id, taskId),
    sidecarForTask(connection.ownerEmail, taskList.id, taskId),
  ]);
  return mergeTask(taskList, task, metadata);
}

function sidecarValues(
  connection: GoogleConnection,
  taskListId: string,
  taskId: string,
  input: Partial<CreateTaskInput>,
  existing?: Sidecar | null,
): typeof googleTaskMetadata.$inferInsert {
  const now = new Date().toISOString();
  return {
    ownerEmail: connection.ownerEmail,
    taskListId,
    googleTaskId: taskId,
    legacyId: input.legacyId ?? existing?.legacyId ?? null,
    area: input.area ?? existing?.area ?? "alltag",
    quadrant: input.quadrant ?? existing?.quadrant ?? "plan",
    estimateMinutes:
      input.estimateMinutes ?? existing?.estimateMinutes ?? 30,
    progress:
      input.progress ??
      existing?.progress ??
      (input.completed === true ? 100 : 0),
    confidential: input.confidential ?? existing?.confidential ?? true,
    reminderAt: input.reminderAt ?? existing?.reminderAt ?? null,
    reminderCalendarId: existing?.reminderCalendarId ?? null,
    reminderEventId: existing?.reminderEventId ?? null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

async function deleteGoogleTask(
  connection: GoogleConnection,
  taskListId: string,
  taskId: string,
  etag?: string | null,
): Promise<void> {
  await googleApiJson<void>(
    connection,
    `${TASKS_API}/lists/${encodeURIComponent(
      taskListId,
    )}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: "DELETE",
      headers: etag?.trim() ? { "if-match": etag.trim() } : undefined,
    },
  );
}

async function existingLegacyTask(
  connection: GoogleConnection,
  legacyId: string,
): Promise<GerrisTask | null> {
  const metadata = await sidecarForLegacyId(connection.ownerEmail, legacyId);
  if (!metadata) return null;
  try {
    const [task, taskList] = await Promise.all([
      getGoogleTask(connection, metadata.taskListId, metadata.googleTaskId),
      requireTaskList(connection, metadata.taskListId),
    ]);
    return mergeTask(taskList, task, metadata);
  } catch (error) {
    if (!(error instanceof GoogleApiError) || error.status !== 404) throw error;
    await getDb()
      .delete(googleTaskMetadata)
      .where(
        and(
          eq(googleTaskMetadata.ownerEmail, connection.ownerEmail),
          eq(googleTaskMetadata.taskListId, metadata.taskListId),
          eq(googleTaskMetadata.googleTaskId, metadata.googleTaskId),
        ),
      );
    return null;
  }
}

export async function createGerrisTask(
  connection: GoogleConnection,
  input: CreateTaskInput,
): Promise<{ task: GerrisTask; created: boolean }> {
  if (input.legacyId) {
    const existing = await existingLegacyTask(connection, input.legacyId);
    if (existing) return { task: existing, created: false };
  }
  const taskList = await requireTaskList(connection, input.taskListId);
  const googleBody: Record<string, unknown> = {
    title: input.title,
  };
  if (input.notes !== undefined) googleBody.notes = input.notes;
  if (input.dueAt !== undefined) googleBody.due = input.dueAt;
  if (input.completed === true) googleBody.status = "completed";

  const created = await googleApiJson<GoogleTask>(
    connection,
    `${TASKS_API}/lists/${encodeURIComponent(taskList.id)}/tasks`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(googleBody),
    },
  );
  if (!created.id) {
    throw new GoogleApiError("Google hat keine Aufgaben-ID geliefert.", 502);
  }

  const values = sidecarValues(
    connection,
    taskList.id,
    created.id,
    input,
  );
  const inserted = await getDb()
    .insert(googleTaskMetadata)
    .values(values)
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) {
    return { task: mergeTask(taskList, created, inserted[0]), created: true };
  }

  if (input.legacyId) {
    const winner = await existingLegacyTask(connection, input.legacyId);
    if (winner) {
      try {
        await deleteGoogleTask(connection, taskList.id, created.id);
      } catch {
        // The stored mapping remains authoritative; a later reconciliation can
        // remove a rare duplicate left by a concurrent bootstrap.
      }
      return { task: winner, created: false };
    }
  }
  const metadata = await sidecarForTask(
    connection.ownerEmail,
    taskList.id,
    created.id,
  );
  return {
    task: mergeTask(taskList, created, metadata),
    created: true,
  };
}

export async function saveTaskReminderMetadata(
  connection: GoogleConnection,
  task: GerrisTask,
  reminder: {
    reminderAt: string;
    calendarId: string;
    eventId: string;
  },
): Promise<GerrisTask> {
  const existing = await sidecarForTask(
    connection.ownerEmail,
    task.taskListId,
    task.id,
  );
  if (!existing) {
    throw new GoogleApiError(
      "Die Erinnerungsverknüpfung konnte nicht gespeichert werden.",
      502,
    );
  }
  const [saved] = await getDb()
    .update(googleTaskMetadata)
    .set({
      reminderAt: reminder.reminderAt,
      reminderCalendarId: reminder.calendarId,
      reminderEventId: reminder.eventId,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(googleTaskMetadata.ownerEmail, connection.ownerEmail),
        eq(googleTaskMetadata.taskListId, task.taskListId),
        eq(googleTaskMetadata.googleTaskId, task.id),
      ),
    )
    .returning();
  return {
    ...task,
    reminderAt: saved?.reminderAt || reminder.reminderAt,
    reminderCalendarId: saved?.reminderCalendarId || reminder.calendarId,
    reminderEventId: saved?.reminderEventId || reminder.eventId,
  };
}

export async function updateGerrisTask(
  connection: GoogleConnection,
  taskId: string,
  input: UpdateTaskInput,
  requestEtag?: string | null,
  requestedTaskListId?: string,
): Promise<GerrisTask> {
  const taskList = await requireTaskList(connection, requestedTaskListId);
  const googleBody: Record<string, unknown> = {};
  if (input.title !== undefined) googleBody.title = input.title;
  if (input.notes !== undefined) googleBody.notes = input.notes;
  if (input.dueAt !== undefined) googleBody.due = input.dueAt;
  if (input.completed !== undefined) {
    googleBody.status = input.completed ? "completed" : "needsAction";
    if (!input.completed) googleBody.completed = null;
  }

  const hasGoogleUpdate = Object.keys(googleBody).length > 0;
  const etag = requestEtag?.trim() || input.etag;
  const task = hasGoogleUpdate
    ? await googleApiJson<GoogleTask>(
        connection,
        `${TASKS_API}/lists/${encodeURIComponent(
          taskList.id,
        )}/tasks/${encodeURIComponent(taskId)}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            ...(etag ? { "if-match": etag } : {}),
          },
          body: JSON.stringify(googleBody),
        },
      )
    : await getGoogleTask(connection, taskList.id, taskId);

  const existing = await sidecarForTask(
    connection.ownerEmail,
    taskList.id,
    taskId,
  );
  const sidecarChanged =
    input.completed !== undefined ||
    input.area !== undefined ||
    input.quadrant !== undefined ||
    input.estimateMinutes !== undefined ||
    input.progress !== undefined ||
    input.confidential !== undefined;
  if (!sidecarChanged) return mergeTask(taskList, task, existing);

  const sidecarInput: Partial<CreateTaskInput> = {
    ...input,
    progress:
      input.progress ??
      (input.completed === true
        ? 100
        : input.completed === false
          ? 0
          : undefined),
  };
  const values = sidecarValues(
    connection,
    taskList.id,
    taskId,
    sidecarInput,
    existing,
  );
  const [saved] = await getDb()
    .insert(googleTaskMetadata)
    .values(values)
    .onConflictDoUpdate({
      target: [
        googleTaskMetadata.ownerEmail,
        googleTaskMetadata.taskListId,
        googleTaskMetadata.googleTaskId,
      ],
      set: {
        area: values.area,
        quadrant: values.quadrant,
        estimateMinutes: values.estimateMinutes,
        progress: values.progress,
        confidential: values.confidential,
        updatedAt: values.updatedAt,
      },
    })
    .returning();
  return mergeTask(taskList, task, saved || existing);
}

export async function deleteGerrisTask(
  connection: GoogleConnection,
  taskId: string,
  confirmAssigned = false,
  etag?: string | null,
  requestedTaskListId?: string,
): Promise<void> {
  const taskList = await requireTaskList(connection, requestedTaskListId);
  const task = await getGoogleTask(connection, taskList.id, taskId);
  if (task.assignmentInfo && !confirmAssigned) {
    throw new GoogleValidationError(
      "Diese Aufgabe wurde aus Google Docs oder Chat zugewiesen. Zum Löschen ist eine zusätzliche Bestätigung erforderlich.",
    );
  }
  await deleteGoogleTask(connection, taskList.id, taskId, etag);
  await getDb()
    .delete(googleTaskMetadata)
    .where(
      and(
        eq(googleTaskMetadata.ownerEmail, connection.ownerEmail),
        eq(googleTaskMetadata.taskListId, taskList.id),
        eq(googleTaskMetadata.googleTaskId, taskId),
      ),
    );
}

export async function bootstrapGerrisTasks(
  connection: GoogleConnection,
  inputs: BootstrapTaskInput[],
): Promise<{ tasks: GerrisTask[]; imported: number; reused: number }> {
  const tasks: GerrisTask[] = [];
  let imported = 0;
  let reused = 0;
  for (const input of inputs) {
    const result = await createGerrisTask(connection, {
      ...input,
      legacyId: input.legacyId || input.id || null,
    });
    tasks.push(result.task);
    if (result.created) imported += 1;
    else reused += 1;
  }
  return { tasks, imported, reused };
}
