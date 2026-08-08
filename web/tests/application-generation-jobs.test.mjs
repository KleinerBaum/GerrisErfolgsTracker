import assert from "node:assert/strict";
import test from "node:test";

import {
  APPLICATION_JOB_LIFETIME_MS,
  ApplicationGenerationJobService,
  ApplicationJobError,
} from "../lib/server/application-generation-jobs.ts";
import {
  generationRequestFixture,
  makeValidDraft,
} from "./fixtures/application-fixtures.mjs";

class MemoryStore {
  jobs = new Map();

  async create(job) {
    this.jobs.set(job.jobId, structuredClone(job));
  }

  async get(jobId, ownerHash) {
    const job = this.jobs.get(jobId);
    return job?.ownerHash === ownerHash ? structuredClone(job) : null;
  }

  async update(job) {
    this.jobs.set(job.jobId, structuredClone(job));
  }

  async delete(jobId, ownerHash) {
    const job = this.jobs.get(jobId);
    if (job?.ownerHash === ownerHash) this.jobs.delete(jobId);
  }

  async takeExpired(ownerHash, before) {
    const expired = [...this.jobs.values()].filter(
      (job) => job.ownerHash === ownerHash && job.expiresAt < before,
    );
    expired.forEach((job) => this.jobs.delete(job.jobId));
    return structuredClone(expired);
  }
}

class FakeBackgroundModel {
  starts = [];
  polls = new Map();
  cancelled = [];
  nextResponse = 1;

  queue(responseId, ...statuses) {
    this.polls.set(responseId, statuses);
  }

  async start(input) {
    const responseId = `resp_test_${this.nextResponse}`;
    this.nextResponse += 1;
    this.starts.push({ ...input, responseId });
    return { responseId, status: "queued" };
  }

  async poll(responseId) {
    const queue = this.polls.get(responseId) ?? [];
    assert.ok(queue.length, `Kein Poll-Ergebnis für ${responseId} vorbereitet`);
    return queue.shift();
  }

  async cancel(responseId) {
    this.cancelled.push(responseId);
  }
}

function invalidDraft() {
  const draft = makeValidDraft();
  draft.tailoredCv = "# Lebenslauf\n## Profil\nZu kurz.";
  draft.evidenceMap = draft.evidenceMap.filter(
    (mapping) => mapping.artifact !== "tailoredCv",
  );
  return draft;
}

function harness() {
  const store = new MemoryStore();
  const model = new FakeBackgroundModel();
  let currentTime = Date.parse("2026-08-06T10:00:00.000Z");
  const service = new ApplicationGenerationJobService(
    store,
    model,
    () => new Date(currentTime),
    () => "application-job-1",
  );
  return {
    store,
    model,
    service,
    advance(milliseconds) {
      currentTime += milliseconds;
    },
  };
}

test("startet einen eigentümergebundenen Hintergrundauftrag mit normalisiertem Master-CV", async () => {
  const { store, model, service } = harness();
  const result = await service.start("owner-a", generationRequestFixture());

  assert.equal(result.status, "pending");
  assert.equal(result.job.id, "application-job-1");
  assert.equal(result.job.stage, "draft");
  assert.equal(model.starts.length, 1);
  const stored = await store.get("application-job-1", "owner-a");
  assert.equal(stored.request.masterCv.sourceDocumentId, "fixture-master");
  assert.equal(stored.draft, null);
});

test("meldet queued und in_progress beim Polling weiterhin mit demselben Auftrag", async () => {
  const { model, service } = harness();
  await service.start("owner-a", generationRequestFixture());
  model.queue("resp_test_1", { status: "in_progress" });

  const result = await service.poll("owner-a", "application-job-1");

  assert.equal(result.status, "pending");
  assert.equal(result.job.status, "in_progress");
  assert.equal(result.job.stage, "draft");
});

test("gibt einen gültigen Erstentwurf frei und hält ihn kurz idempotent abrufbar", async () => {
  const { store, model, service } = harness();
  await service.start("owner-a", generationRequestFixture());
  model.queue("resp_test_1", {
    status: "completed",
    output: makeValidDraft(),
  });

  const result = await service.poll("owner-a", "application-job-1");

  assert.equal(result.status, "ready");
  assert.equal(result.result.qualityReport.attempt, 1);
  assert.equal(result.usage.calls, 1);
  const stored = await store.get("application-job-1", "owner-a");
  assert.equal(stored.result.status, "ready");
  assert.ok(stored.completedAt);
  const repeated = await service.poll("owner-a", "application-job-1");
  assert.equal(repeated.status, "ready");
  assert.equal(model.starts.length, 1);
});

test("startet nach einem mangelhaften Erstentwurf genau einen Reparaturlauf", async () => {
  const { store, model, service } = harness();
  await service.start("owner-a", generationRequestFixture());
  model.queue("resp_test_1", {
    status: "completed",
    output: invalidDraft(),
  });

  const repairing = await service.poll("owner-a", "application-job-1");

  assert.equal(repairing.status, "pending");
  assert.equal(repairing.job.stage, "repair");
  assert.deepEqual(
    model.starts.map((call) => call.stage),
    ["draft", "repair"],
  );
  const stored = await store.get("application-job-1", "owner-a");
  assert.ok(stored.issues.some((issue) => /Umfang/.test(issue)));

  model.queue("resp_test_2", {
    status: "completed",
    output: makeValidDraft(),
  });
  const ready = await service.poll("owner-a", "application-job-1");
  assert.equal(ready.status, "ready");
  assert.equal(ready.result.qualityReport.attempt, 2);
  assert.equal(model.starts.length, 2);
});

test("liefert nach dem einzigen Reparaturlauf ein erklärtes Qualitätsversagen", async () => {
  const { store, model, service } = harness();
  await service.start("owner-a", generationRequestFixture());
  model.queue("resp_test_1", {
    status: "completed",
    output: invalidDraft(),
  });
  await service.poll("owner-a", "application-job-1");
  model.queue("resp_test_2", {
    status: "completed",
    output: invalidDraft(),
  });

  await assert.rejects(
    () => service.poll("owner-a", "application-job-1"),
    (error) => {
      assert.ok(error instanceof ApplicationJobError);
      assert.equal(error.status, 422);
      assert.ok(error.issues.some((issue) => /Umfang/.test(issue)));
      return true;
    },
  );
  const terminal = await store.get("application-job-1", "owner-a");
  assert.equal(terminal.terminalError.status, 422);
  assert.equal(terminal.usage.length, 2);
  assert.deepEqual(
    terminal.usage.map((entry) => entry.stage),
    ["draft", "repair"],
  );
});

test("prüft eine manuell bearbeitete Fassung in genau einem Hintergrundlauf", async () => {
  const { model, service } = harness();
  const request = generationRequestFixture();
  request.manualDraft = makeValidDraft();
  await service.start("owner-a", request);

  assert.deepEqual(
    model.starts.map((call) => call.stage),
    ["manual_review"],
  );
  model.queue("resp_test_1", {
    status: "completed",
    output: makeValidDraft(),
  });
  const result = await service.poll("owner-a", "application-job-1");
  assert.equal(result.status, "ready");
  assert.equal(result.result.qualityReport.attempt, 2);
  assert.equal(model.starts.length, 1);
});

test("löscht einen abgelaufenen Auftrag und bricht die OpenAI-Antwort bestmöglich ab", async () => {
  const { store, model, service, advance } = harness();
  await service.start("owner-a", generationRequestFixture());
  advance(APPLICATION_JOB_LIFETIME_MS + 1);

  await assert.rejects(
    () => service.poll("owner-a", "application-job-1"),
    (error) => error instanceof ApplicationJobError && error.status === 410,
  );
  assert.deepEqual(model.cancelled, ["resp_test_1"]);
  assert.equal(await store.get("application-job-1", "owner-a"), null);
});

test("bricht einen laufenden Auftrag ab und entfernt seinen Zustand", async () => {
  const { store, model, service } = harness();
  await service.start("owner-a", generationRequestFixture());

  const result = await service.cancel("owner-a", "application-job-1");

  assert.deepEqual(result, { status: "cancelled" });
  assert.deepEqual(model.cancelled, ["resp_test_1"]);
  assert.equal(await store.get("application-job-1", "owner-a"), null);
});

test("gibt eine fremde Job-ID nicht preis", async () => {
  const { store, model, service } = harness();
  await service.start("owner-a", generationRequestFixture());

  await assert.rejects(
    () => service.poll("owner-b", "application-job-1"),
    (error) => error instanceof ApplicationJobError && error.status === 404,
  );
  assert.equal(model.polls.size, 0);
  assert.ok(await store.get("application-job-1", "owner-a"));
});

test("verwendet eine übergebene Startkennung idempotent und startet nur einen Modellauftrag", async () => {
  const { model, service } = harness();
  const first = await service.start(
    "owner-a",
    generationRequestFixture(),
    "client-request-0001",
  );
  const repeated = await service.start(
    "owner-a",
    generationRequestFixture(),
    "client-request-0001",
  );

  assert.equal(first.status, "pending");
  assert.equal(repeated.status, "pending");
  assert.equal(first.job.id, "client-request-0001");
  assert.equal(model.starts.length, 1);
  assert.equal(model.starts[0].jobId, "client-request-0001");
});

test("löscht ein terminales Ergebnis nach neun Minuten", async () => {
  const { store, model, service, advance } = harness();
  await service.start("owner-a", generationRequestFixture());
  model.queue("resp_test_1", {
    status: "completed",
    output: makeValidDraft(),
  });
  await service.poll("owner-a", "application-job-1");
  advance(9 * 60_000 + 1);

  await assert.rejects(
    () => service.poll("owner-a", "application-job-1"),
    (error) => error instanceof ApplicationJobError && error.status === 410,
  );
  assert.equal(await store.get("application-job-1", "owner-a"), null);
  assert.deepEqual(model.cancelled, []);
});
