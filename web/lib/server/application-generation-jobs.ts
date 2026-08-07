import type {
  ApplicationPackageV3,
  GeneratedApplicationPackage,
} from "../application-package.ts";
import {
  ApplicationGenerationError,
  applicationModelInput,
  evaluateApplicationModelOutput,
  type ApplicationGenerationRequest,
  type ApplicationModelStage,
} from "./application-generation.ts";

export const APPLICATION_JOB_LIFETIME_MS = 20 * 60_000;
export const APPLICATION_TERMINAL_LIFETIME_MS = 10 * 60_000;

export type ApplicationModelUsage = {
  stage: ApplicationModelStage;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type ApplicationUsageSummary = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  stages: ApplicationModelUsage[];
};

export type ApplicationTerminalError = {
  status: 422 | 503;
  message: string;
  issues: string[];
};

export type ApplicationGenerationJob = {
  jobId: string;
  ownerHash: string;
  stage: ApplicationModelStage;
  responseId: string;
  request: ApplicationGenerationRequest;
  draft: GeneratedApplicationPackage | null;
  issues: string[];
  usage: ApplicationModelUsage[];
  result: ApplicationPackageV3 | null;
  terminalError: ApplicationTerminalError | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export type ApplicationJobReference = {
  id: string;
  status: "queued" | "in_progress";
  stage: ApplicationModelStage;
  startedAt: string;
  expiresAt: string;
};

export type ApplicationJobResult =
  | { status: "pending"; job: ApplicationJobReference }
  | {
      status: "ready";
      result: ApplicationPackageV3;
      usage: ApplicationUsageSummary;
    }
  | { status: "cancelled" };

export type ApplicationModelStatus =
  | { status: "queued" | "in_progress" }
  | {
      status: "completed";
      output: unknown;
      model: string;
      usage: Omit<ApplicationModelUsage, "stage" | "model">;
    }
  | { status: "failed"; message: string };

export type ApplicationBackgroundModel = {
  start(input: {
    jobId: string;
    ownerHash: string;
    stage: ApplicationModelStage;
    prompt: string;
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
  update(job: ApplicationGenerationJob): Promise<void>;
  delete(jobId: string, ownerHash: string): Promise<void>;
  takeExpired(ownerHash: string, before: string): Promise<ApplicationGenerationJob[]>;
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

function usageSummary(stages: ApplicationModelUsage[]): ApplicationUsageSummary {
  return {
    calls: stages.length,
    inputTokens: stages.reduce((sum, item) => sum + item.inputTokens, 0),
    outputTokens: stages.reduce((sum, item) => sum + item.outputTokens, 0),
    totalTokens: stages.reduce((sum, item) => sum + item.totalTokens, 0),
    stages,
  };
}

function pending(
  job: ApplicationGenerationJob,
  status: "queued" | "in_progress",
): ApplicationJobResult {
  return {
    status: "pending",
    job: {
      id: job.jobId,
      status,
      stage: job.stage,
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

  private async cleanupExpired(ownerHash: string): Promise<void> {
    const expired = await this.store.takeExpired(
      ownerHash,
      this.now().toISOString(),
    );
    await Promise.allSettled(
      expired
        .filter((job) => !job.completedAt)
        .map((job) => this.model.cancel(job.responseId)),
    );
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

    const stage: ApplicationModelStage = request.manualDraft
      ? "manual_review"
      : "draft";
    const modelInput = applicationModelInput(
      request,
      stage,
      request.manualDraft ?? null,
    );
    let started: Awaited<ReturnType<ApplicationBackgroundModel["start"]>>;
    try {
      started = await this.model.start({
        jobId,
        ownerHash,
        stage,
        prompt: modelInput.prompt,
      });
    } catch (error) {
      throw new ApplicationJobError(
        error instanceof Error
          ? error.message
          : "Die Bewerbungserstellung konnte nicht gestartet werden.",
        503,
      );
    }
    const createdAt = this.now();
    const job: ApplicationGenerationJob = {
      jobId,
      ownerHash,
      stage,
      responseId: started.responseId,
      request,
      draft: request.manualDraft ?? null,
      issues: modelInput.issues,
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
    try {
      await this.store.create(job);
    } catch {
      const concurrent = await this.store.get(jobId, ownerHash);
      if (concurrent) return terminalResult(concurrent);
      await this.model.cancel(started.responseId).catch(() => undefined);
      throw new ApplicationJobError(
        "Der temporäre Erstellungsauftrag konnte nicht gespeichert werden.",
        503,
      );
    }
    return pending(
      job,
      started.status === "queued" ? "queued" : "in_progress",
    );
  }

  private async storeTerminalError(
    job: ApplicationGenerationJob,
    error: ApplicationTerminalError,
  ): Promise<never> {
    const now = this.now();
    const terminal = {
      ...job,
      terminalError: error,
      completedAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + APPLICATION_TERMINAL_LIFETIME_MS,
      ).toISOString(),
    };
    await this.store.update(terminal).catch(() => undefined);
    throw new ApplicationJobError(error.message, error.status, error.issues);
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
      if (!job.completedAt) {
        await this.model.cancel(job.responseId).catch(() => undefined);
      }
      await this.store.delete(job.jobId, ownerHash);
      throw new ApplicationJobError(
        "Der Erstellungsauftrag ist abgelaufen. Bitte neu starten.",
        410,
      );
    }
    if (job.completedAt) return terminalResult(job);

    let status: ApplicationModelStatus;
    try {
      status = await this.model.poll(job.responseId);
    } catch {
      return pending(job, "in_progress");
    }
    if (status.status !== "completed") {
      if (status.status === "failed") {
        return this.storeTerminalError(job, {
          status: 503,
          message: status.message,
          issues: [],
        });
      }
      return pending(job, status.status);
    }

    const reportedUsage = status.usage ?? {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
    const currentUsage: ApplicationModelUsage = {
      stage: job.stage,
      model: status.model || "unbekannt",
      ...reportedUsage,
    };
    const usage = [...job.usage, currentUsage];
    try {
      const evaluation = evaluateApplicationModelOutput(
        job.request,
        job.stage,
        status.output,
        job.draft,
      );
      if (evaluation.status === "ready") {
        const now = this.now();
        const completed: ApplicationGenerationJob = {
          ...job,
          usage,
          result: evaluation.result,
          completedAt: now.toISOString(),
          updatedAt: now.toISOString(),
          expiresAt: new Date(
            now.getTime() + APPLICATION_TERMINAL_LIFETIME_MS,
          ).toISOString(),
        };
        await this.store.update(completed);
        return terminalResult(completed);
      }

      const nextInput = applicationModelInput(
        job.request,
        "repair",
        evaluation.draft,
        evaluation.issues,
      );
      let repair: Awaited<ReturnType<ApplicationBackgroundModel["start"]>>;
      try {
        repair = await this.model.start({
          jobId: job.jobId,
          ownerHash,
          stage: "repair",
          prompt: nextInput.prompt,
        });
      } catch (error) {
        return this.storeTerminalError({ ...job, usage }, {
          status: 503,
          message:
            error instanceof Error
              ? error.message
              : "Der einmalige Reparaturlauf konnte nicht gestartet werden.",
          issues: evaluation.issues,
        });
      }
      const updated: ApplicationGenerationJob = {
        ...job,
        stage: "repair",
        responseId: repair.responseId,
        draft: evaluation.draft,
        issues: evaluation.issues,
        usage,
        updatedAt: this.now().toISOString(),
      };
      try {
        await this.store.update(updated);
      } catch {
        await this.model.cancel(repair.responseId).catch(() => undefined);
        throw new ApplicationJobError(
          "Der Reparaturauftrag konnte nicht sicher gespeichert werden.",
          503,
        );
      }
      return pending(
        updated,
        repair.status === "queued" ? "queued" : "in_progress",
      );
    } catch (error) {
      if (error instanceof ApplicationGenerationError) {
        return this.storeTerminalError({ ...job, usage }, {
          status: error.status === 422 ? 422 : 503,
          message: error.message,
          issues: error.issues,
        });
      }
      throw error;
    }
  }

  async cancel(ownerHash: string, jobId: string): Promise<ApplicationJobResult> {
    const job = await this.store.get(jobId, ownerHash);
    if (!job) {
      throw new ApplicationJobError(
        "Der Erstellungsauftrag wurde nicht gefunden.",
        404,
      );
    }
    if (!job.completedAt) {
      await this.model.cancel(job.responseId).catch(() => undefined);
    }
    await this.store.delete(job.jobId, ownerHash);
    return { status: "cancelled" };
  }
}
