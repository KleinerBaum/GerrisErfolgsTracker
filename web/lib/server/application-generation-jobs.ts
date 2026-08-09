import type {
  ApplicationPackageV4,
  GeneratedApplicationPackage,
} from "../application-package.ts";
import type {
  ApplicationOutputKind,
  LlmReasoningEffort,
} from "../types.ts";
import {
  ApplicationGenerationError,
  applicationArtifactDraftsFromPackage,
  applicationArtifactInstructions,
  applicationArtifactModelBudget,
  applicationArtifactModelInput,
  applicationArtifactsForIssues,
  evaluateApplicationArtifactDraft,
  evaluateApplicationArtifactSet,
  normalizeApplicationArtifactOutput,
  type ApplicationArtifactDraft,
  type ApplicationArtifactStage,
  type ApplicationGenerationRequest,
} from "./application-generation.ts";

export const APPLICATION_JOB_LIFETIME_MS = 20 * 60_000;
export const APPLICATION_TERMINAL_LIFETIME_MS = 9 * 60_000;
export const APPLICATION_MAX_CONCURRENT_CALLS = 2;

export type ApplicationModelUsage = {
  artifact: ApplicationOutputKind;
  stage: ApplicationArtifactStage;
  model: string;
  effort: LlmReasoningEffort;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  durationMs: number;
};

export type ApplicationUsageSummary = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  durationMs: number;
  stages: ApplicationModelUsage[];
};

export type ApplicationTerminalError = {
  status: 422 | 503;
  message: string;
  issues: string[];
};

export type ApplicationArtifactWorkStatus =
  | "pending"
  | "running"
  | "ready"
  | "repair_pending";

export type ApplicationArtifactWork = {
  artifact: ApplicationOutputKind;
  status: ApplicationArtifactWorkStatus;
  stage: ApplicationArtifactStage;
  responseId: string;
  draft: ApplicationArtifactDraft | null;
  issues: string[];
  error: string | null;
  attempt: 1 | 2;
  repairAttempts: 0 | 1;
  startedAt: string | null;
};

export type ApplicationGenerationJob = {
  jobId: string;
  ownerHash: string;
  stage: ApplicationArtifactStage;
  responseId: string;
  request: ApplicationGenerationRequest;
  work: ApplicationArtifactWork[];
  draft: GeneratedApplicationPackage | null;
  issues: string[];
  usage: ApplicationModelUsage[];
  result: ApplicationPackageV4 | null;
  terminalError: ApplicationTerminalError | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export type ApplicationJobReference = {
  id: string;
  status: "queued" | "in_progress";
  stage: ApplicationArtifactStage;
  artifact: ApplicationOutputKind | null;
  completedArtifacts: number;
  totalArtifacts: number;
  startedAt: string;
  expiresAt: string;
};

export type ApplicationJobResult =
  | { status: "pending"; job: ApplicationJobReference }
  | {
      status: "ready";
      result: ApplicationPackageV4;
      usage: ApplicationUsageSummary;
    }
  | { status: "cancelled" };

export type ApplicationModelStatus =
  | { status: "queued" | "in_progress" }
  | {
      status: "completed";
      output: unknown;
      model: string;
      usage: Omit<
        ApplicationModelUsage,
        "artifact" | "stage" | "model" | "effort" | "durationMs"
      >;
    }
  | { status: "failed"; message: string };

export type ApplicationBackgroundModel = {
  start(input: {
    jobId: string;
    ownerHash: string;
    artifact: ApplicationOutputKind;
    stage: ApplicationArtifactStage;
    prompt: string;
    instructions: string;
    model: string;
    effort: LlmReasoningEffort;
    maxOutputTokens: number;
    legacyModel?: string;
  }): Promise<{
    responseId: string;
    status: "queued" | "in_progress" | "completed";
  }>;
  poll(responseId: string): Promise<ApplicationModelStatus>;
  cancel(responseId: string): Promise<void>;
};

export type ApplicationJobStore = {
  create(job: ApplicationGenerationJob): Promise<void>;
  get(jobId: string, ownerHash: string): Promise<ApplicationGenerationJob | null>;
  update(
    job: ApplicationGenerationJob,
    expectedUpdatedAt?: string,
  ): Promise<boolean | void>;
  delete(jobId: string, ownerHash: string): Promise<void>;
  takeExpired(
    ownerHash: string,
    before: string,
  ): Promise<ApplicationGenerationJob[]>;
};

export class ApplicationJobError extends Error {
  readonly status: 400 | 404 | 410 | 422 | 503;
  readonly issues: string[];

  constructor(
    message: string,
    status: 400 | 404 | 410 | 422 | 503,
    issues: string[] = [],
  ) {
    super(message);
    this.name = "ApplicationJobError";
    this.status = status;
    this.issues = issues;
  }
}

function sum(stages: ApplicationModelUsage[], key: keyof ApplicationModelUsage) {
  return stages.reduce((total, item) => {
    const value = item[key];
    return total + (typeof value === "number" ? value : 0);
  }, 0);
}

function usageSummary(stages: ApplicationModelUsage[]): ApplicationUsageSummary {
  return {
    calls: stages.length,
    inputTokens: sum(stages, "inputTokens"),
    outputTokens: sum(stages, "outputTokens"),
    reasoningTokens: sum(stages, "reasoningTokens"),
    cachedInputTokens: sum(stages, "cachedInputTokens"),
    cacheWriteTokens: sum(stages, "cacheWriteTokens"),
    totalTokens: sum(stages, "totalTokens"),
    durationMs: sum(stages, "durationMs"),
    stages,
  };
}

function activeWork(job: ApplicationGenerationJob): ApplicationArtifactWork[] {
  return job.work.filter((item) => item.status === "running" && item.responseId);
}

function pending(
  job: ApplicationGenerationJob,
  status: "queued" | "in_progress",
): ApplicationJobResult {
  const active = activeWork(job)[0] ?? null;
  return {
    status: "pending",
    job: {
      id: job.jobId,
      status,
      stage: active?.stage ?? job.stage,
      artifact: active?.artifact ?? null,
      completedArtifacts: job.work.filter((item) => item.status === "ready")
        .length,
      totalArtifacts: job.work.length,
      startedAt: job.createdAt,
      expiresAt: job.expiresAt,
    },
  };
}

function terminalResult(job: ApplicationGenerationJob): ApplicationJobResult {
  if (job.terminalError) {
    throw new ApplicationJobError(
      job.terminalError.message,
      job.terminalError.status,
      job.terminalError.issues,
    );
  }
  if (!job.result) return pending(job, "in_progress");
  return {
    status: "ready",
    result: job.result,
    usage: usageSummary(job.usage),
  };
}

function coreReady(work: ApplicationArtifactWork[]): boolean {
  return work
    .filter((item) =>
      ["tailored-cv", "cover-letter"].includes(item.artifact),
    )
    .every((item) => item.status === "ready");
}

function eligibleWork(job: ApplicationGenerationJob): ApplicationArtifactWork[] {
  const coreIsReady = coreReady(job.work);
  return job.work.filter((item) => {
    if (!(["pending", "repair_pending"] as string[]).includes(item.status)) {
      return false;
    }
    if (item.status === "repair_pending" || item.stage === "manual_review") {
      return true;
    }
    return (
      ["tailored-cv", "cover-letter"].includes(item.artifact) || coreIsReady
    );
  });
}

function dependencies(
  job: ApplicationGenerationJob,
  artifact: ApplicationOutputKind,
): Partial<Record<ApplicationOutputKind, ApplicationArtifactDraft>> {
  const result: Partial<
    Record<ApplicationOutputKind, ApplicationArtifactDraft>
  > = {};
  for (const item of job.work) {
    if (item.artifact !== artifact && item.status === "ready" && item.draft) {
      result[item.artifact] = item.draft;
    }
  }
  return result;
}

function jobStage(work: ApplicationArtifactWork[]): ApplicationArtifactStage {
  const active = work.find((item) => item.status === "running");
  if (active) return active.stage;
  const waiting = work.find((item) =>
    ["pending", "repair_pending"].includes(item.status),
  );
  return waiting?.stage ?? "draft";
}

function responseId(work: ApplicationArtifactWork[]): string {
  return work.find((item) => item.status === "running")?.responseId ?? "";
}

export class ApplicationGenerationJobService {
  private readonly store: ApplicationJobStore;
  private readonly model: ApplicationBackgroundModel;
  private readonly now: () => Date;
  private readonly randomId: () => string;

  constructor(
    store: ApplicationJobStore,
    model: ApplicationBackgroundModel,
    now: () => Date = () => new Date(),
    randomId: () => string = () => crypto.randomUUID(),
  ) {
    this.store = store;
    this.model = model;
    this.now = now;
    this.randomId = randomId;
  }

  private timestampAfter(previous: string): string {
    const previousTime = Date.parse(previous);
    return new Date(
      Math.max(
        this.now().getTime(),
        Number.isFinite(previousTime) ? previousTime + 1 : 0,
      ),
    ).toISOString();
  }

  private async cancelActive(job: ApplicationGenerationJob): Promise<void> {
    const ids = new Set(activeWork(job).map((item) => item.responseId));
    if (!ids.size && job.responseId) ids.add(job.responseId);
    await Promise.allSettled([...ids].map((id) => this.model.cancel(id)));
  }

  private async cleanupExpired(ownerHash: string): Promise<void> {
    const expired = await this.store.takeExpired(
      ownerHash,
      this.now().toISOString(),
    );
    await Promise.allSettled(
      expired
        .filter((job) => !job.completedAt)
        .map((job) => this.cancelActive(job)),
    );
  }

  private async startEligible(
    job: ApplicationGenerationJob,
  ): Promise<ApplicationGenerationJob> {
    const next = structuredClone(job);
    let free = APPLICATION_MAX_CONCURRENT_CALLS - activeWork(next).length;
    const startedResponseIds: string[] = [];
    for (const item of eligibleWork(next)) {
      if (free <= 0) break;
      const stage: ApplicationArtifactStage =
        item.status === "repair_pending" ? "repair" : item.stage;
      const modelInput = applicationArtifactModelInput(
        next.request,
        item.artifact,
        stage,
        item.draft,
        item.issues,
        dependencies(next, item.artifact),
      );
      const budget = applicationArtifactModelBudget(next.request, item.artifact);
      let started: Awaited<ReturnType<ApplicationBackgroundModel["start"]>>;
      try {
        started = await this.model.start({
          jobId: next.jobId,
          ownerHash: next.ownerHash,
          artifact: item.artifact,
          stage,
          prompt: modelInput.prompt,
          instructions: applicationArtifactInstructions(item.artifact),
          model: budget.model,
          effort: budget.reasoningEffort,
          maxOutputTokens: budget.maxOutputTokens,
          legacyModel: next.request.modelSettingsExplicit
            ? undefined
            : stage === "repair" || stage === "manual_review"
              ? next.request.legacyRepairModel || next.request.legacyModel
              : next.request.legacyModel,
        });
      } catch (error) {
        await Promise.allSettled(
          startedResponseIds.map((id) => this.model.cancel(id)),
        );
        throw new ApplicationJobError(
          error instanceof Error
            ? error.message
            : "Die Bewerbungserstellung konnte nicht gestartet werden.",
          503,
        );
      }
      startedResponseIds.push(started.responseId);
      next.work = next.work.map((candidate) =>
        candidate.artifact === item.artifact
          ? {
              ...candidate,
              status: "running",
              stage,
              responseId: started.responseId,
              error: null,
              attempt: stage === "draft" ? 1 : 2,
              startedAt: this.now().toISOString(),
            }
          : candidate,
      );
      free -= 1;
    }
    next.stage = jobStage(next.work);
    next.responseId = responseId(next.work);
    return next;
  }

  private initialWork(
    request: ApplicationGenerationRequest,
  ): ApplicationArtifactWork[] {
    const manualDrafts = request.manualDraft
      ? applicationArtifactDraftsFromPackage(request, request.manualDraft)
      : {};
    const edited = new Set(
      request.manualDraft
        ? request.editedOutputKinds?.length
          ? request.editedOutputKinds
          : request.preferences.outputKinds
        : [],
    );
    return request.preferences.outputKinds.map((artifact) => {
      const draft = manualDrafts[artifact] ?? null;
      const manual = Boolean(request.manualDraft && edited.has(artifact));
      return {
        artifact,
        status: request.manualDraft && !manual ? "ready" : "pending",
        stage: manual ? "manual_review" : "draft",
        responseId: "",
        draft,
        issues: [],
        error: null,
        attempt: manual ? 2 : 1,
        repairAttempts: 0,
        startedAt: null,
      };
    });
  }

  async start(
    ownerHash: string,
    request: ApplicationGenerationRequest,
    requestedJobId?: string,
  ): Promise<ApplicationJobResult> {
    await this.cleanupExpired(ownerHash);
    const jobId = requestedJobId || this.randomId();
    const existing = await this.store.get(jobId, ownerHash);
    if (existing) return terminalResult(existing);

    const createdAt = this.now();
    let job: ApplicationGenerationJob = {
      jobId,
      ownerHash,
      stage: request.manualDraft ? "manual_review" : "draft",
      responseId: "",
      request,
      work: this.initialWork(request),
      draft: request.manualDraft ?? null,
      issues: [],
      usage: [],
      result: null,
      terminalError: null,
      completedAt: null,
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
      expiresAt: new Date(
        createdAt.getTime() + APPLICATION_JOB_LIFETIME_MS,
      ).toISOString(),
    };
    job = await this.startEligible(job);
    try {
      await this.store.create(job);
    } catch {
      const concurrent = await this.store.get(jobId, ownerHash);
      if (concurrent) {
        const concurrentIds = new Set(
          activeWork(concurrent).map((item) => item.responseId),
        );
        await Promise.allSettled(
          activeWork(job)
            .map((item) => item.responseId)
            .filter((id) => !concurrentIds.has(id))
            .map((id) => this.model.cancel(id)),
        );
        return terminalResult(concurrent);
      }
      await this.cancelActive(job);
      throw new ApplicationJobError(
        "Der temporäre Erstellungsauftrag konnte nicht gespeichert werden.",
        503,
      );
    }
    return pending(job, "queued");
  }

  private async storeTerminalError(
    job: ApplicationGenerationJob,
    error: ApplicationTerminalError,
  ): Promise<never> {
    await this.cancelActive(job);
    const now = new Date(this.timestampAfter(job.updatedAt));
    const terminal = {
      ...job,
      terminalError: error,
      completedAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + APPLICATION_TERMINAL_LIFETIME_MS,
      ).toISOString(),
    };
    await this.store.update(terminal, job.updatedAt).catch(() => undefined);
    throw new ApplicationJobError(error.message, error.status, error.issues);
  }

  private async saveProgress(
    previous: ApplicationGenerationJob,
    next: ApplicationGenerationJob,
  ): Promise<ApplicationGenerationJob> {
    next.updatedAt = this.timestampAfter(previous.updatedAt);
    next.stage = jobStage(next.work);
    next.responseId = responseId(next.work);
    const saved = await this.store.update(next, previous.updatedAt);
    if (saved !== false) return next;
    const current = await this.store.get(previous.jobId, previous.ownerHash);
    if (current) {
      const currentIds = new Set(activeWork(current).map((item) => item.responseId));
      const orphanIds = activeWork(next)
        .map((item) => item.responseId)
        .filter((id) => !currentIds.has(id));
      await Promise.allSettled(orphanIds.map((id) => this.model.cancel(id)));
      return current;
    }
    throw new ApplicationJobError(
      "Der Erstellungsauftrag wurde während der Verarbeitung ersetzt.",
      503,
    );
  }

  async poll(ownerHash: string, jobId: string): Promise<ApplicationJobResult> {
    const job = await this.store.get(jobId, ownerHash);
    if (!job) {
      throw new ApplicationJobError(
        "Der Erstellungsauftrag wurde nicht gefunden.",
        404,
      );
    }
    if (Date.parse(job.expiresAt) <= this.now().getTime()) {
      if (!job.completedAt) await this.cancelActive(job);
      await this.store.delete(job.jobId, ownerHash);
      throw new ApplicationJobError(
        "Der Erstellungsauftrag ist abgelaufen. Bitte neu starten.",
        410,
      );
    }
    if (job.completedAt) return terminalResult(job);

    let next = structuredClone(job);
    const running = activeWork(next);
    const statuses = await Promise.all(
      running.map(async (item) => {
        try {
          return { item, status: await this.model.poll(item.responseId) };
        } catch {
          return { item, status: { status: "in_progress" } as const };
        }
      }),
    );
    for (const { item, status } of statuses) {
      if (status.status === "failed") {
        next.work = next.work.map((candidate) =>
          candidate.artifact === item.artifact
            ? { ...candidate, error: status.message }
            : candidate,
        );
        return this.storeTerminalError(next, {
          status: 503,
          message: status.message,
          issues: item.issues,
        });
      }
      if (status.status !== "completed") continue;
      const draft = normalizeApplicationArtifactOutput(
        next.request,
        item.artifact,
        status.output,
      );
      if (!draft) {
        const message = `Die Textassistenz hat für ${item.artifact} keine gültige strukturierte Fassung geliefert.`;
        next.work = next.work.map((candidate) =>
          candidate.artifact === item.artifact
            ? { ...candidate, error: message }
            : candidate,
        );
        return this.storeTerminalError(next, {
          status: 503,
          message,
          issues: item.issues,
        });
      }
      const budget = applicationArtifactModelBudget(next.request, item.artifact);
      const durationMs = Math.max(
        0,
        this.now().getTime() - Date.parse(item.startedAt ?? job.createdAt),
      );
      next.usage.push({
        artifact: item.artifact,
        stage: item.stage,
        model: status.model || budget.model,
        effort: budget.reasoningEffort,
        ...status.usage,
        durationMs,
      });
      const artifactAttempt: 1 | 2 = item.stage === "draft" ? 1 : 2;
      const artifactIssues = evaluateApplicationArtifactDraft(
        next.request,
        draft,
        artifactAttempt,
      );
      if (artifactIssues.length) {
        const failedAfterReview =
          item.stage !== "draft" || item.repairAttempts === 1;
        next.work = next.work.map((candidate) =>
          candidate.artifact === item.artifact
            ? {
                ...candidate,
                status: failedAfterReview ? candidate.status : "repair_pending",
                stage: failedAfterReview ? candidate.stage : "repair",
                responseId: "",
                draft,
                issues: artifactIssues,
                error: failedAfterReview ? artifactIssues[0] : null,
                repairAttempts: failedAfterReview ? candidate.repairAttempts : 1,
                startedAt: null,
              }
            : candidate,
        );
        next.issues = [...new Set([...next.issues, ...artifactIssues])];
        if (failedAfterReview) {
          return this.storeTerminalError(next, {
            status: 422,
            message:
              item.stage === "manual_review"
                ? "Die manuell bearbeitete Fassung hat die erneute KI-/Evidenzprüfung nicht bestanden."
                : `Das Ergebnis ${item.artifact} hat auch nach dem einmaligen Reparaturversuch die Qualitätsprüfung nicht bestanden.`,
            issues: artifactIssues,
          });
        }
        continue;
      }
      next.work = next.work.map((candidate) =>
        candidate.artifact === item.artifact
          ? {
              ...candidate,
              status: "ready",
              responseId: "",
              draft,
              error: null,
              startedAt: null,
            }
          : candidate,
      );
    }

    if (activeWork(next).length) {
      next = await this.saveProgress(job, next);
      return pending(next, "in_progress");
    }

    const allReady = next.work.every((item) => item.status === "ready");
    if (!allReady) {
      try {
        next = await this.startEligible(next);
      } catch (error) {
        return this.storeTerminalError(next, {
          status: 503,
          message:
            error instanceof Error
              ? error.message
              : "Der nächste Dokumentlauf konnte nicht gestartet werden.",
          issues: next.issues,
        });
      }
      next = await this.saveProgress(job, next);
      return pending(next, "queued");
    }

    const drafts = Object.fromEntries(
      next.work
        .filter((item) => item.draft)
        .map((item) => [item.artifact, item.draft]),
    ) as Partial<Record<ApplicationOutputKind, ApplicationArtifactDraft>>;
    const attempt: 1 | 2 =
      next.request.manualDraft ||
      next.work.some((item) => item.repairAttempts > 0)
        ? 2
        : 1;
    let evaluation;
    try {
      evaluation = evaluateApplicationArtifactSet(next.request, drafts, attempt);
    } catch (error) {
      if (error instanceof ApplicationGenerationError) {
        return this.storeTerminalError(next, {
          status: error.status === 422 ? 422 : 503,
          message: error.message,
          issues: error.issues,
        });
      }
      throw error;
    }
    if (evaluation.status === "ready") {
      const now = new Date(this.timestampAfter(job.updatedAt));
      const completed: ApplicationGenerationJob = {
        ...next,
        draft: evaluation.result,
        result: evaluation.result,
        issues: [],
        completedAt: now.toISOString(),
        updatedAt: now.toISOString(),
        expiresAt: new Date(
          now.getTime() + APPLICATION_TERMINAL_LIFETIME_MS,
        ).toISOString(),
      };
      const saved = await this.store.update(completed, job.updatedAt);
      if (saved === false) {
        const current = await this.store.get(job.jobId, ownerHash);
        if (current) return terminalResult(current);
        throw new ApplicationJobError(
          "Der Erstellungsauftrag wurde während der Verarbeitung ersetzt.",
          503,
        );
      }
      return terminalResult(completed);
    }

    if (next.request.manualDraft) {
      return this.storeTerminalError(next, {
        status: 422,
        message:
          "Die manuell bearbeitete Fassung hat die erneute KI-/Evidenzprüfung nicht bestanden.",
        issues: evaluation.issues,
      });
    }
    const affected = applicationArtifactsForIssues(
      evaluation.issues,
      next.request.preferences.outputKinds,
    );
    const exhausted = affected.filter(
      (artifact) =>
        next.work.find((item) => item.artifact === artifact)?.repairAttempts ===
        1,
    );
    if (exhausted.length) {
      return this.storeTerminalError(next, {
        status: 422,
        message:
          "Das Bewerbungspaket hat auch nach dem einmaligen Reparaturversuch die Qualitätsprüfung nicht bestanden.",
        issues: evaluation.issues,
      });
    }
    next.draft = evaluation.draft;
    next.issues = evaluation.issues;
    next.work = next.work.map((item) =>
      affected.includes(item.artifact)
        ? {
            ...item,
            status: "repair_pending",
            stage: "repair",
            issues: evaluation.issues.filter(
              (issue) =>
                issue.startsWith(`${item.artifact}:`) ||
                issue.includes(item.artifact) ||
                issue.startsWith("fitHighlights:"),
            ),
            repairAttempts: 1,
          }
        : item,
    );
    next = await this.startEligible(next);
    next = await this.saveProgress(job, next);
    return pending(next, "queued");
  }

  async cancel(ownerHash: string, jobId: string): Promise<ApplicationJobResult> {
    const job = await this.store.get(jobId, ownerHash);
    if (!job) {
      throw new ApplicationJobError(
        "Der Erstellungsauftrag wurde nicht gefunden.",
        404,
      );
    }
    if (!job.completedAt) await this.cancelActive(job);
    await this.store.delete(job.jobId, ownerHash);
    return { status: "cancelled" };
  }
}
