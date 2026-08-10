import assert from "node:assert/strict";
import test from "node:test";

import {
  APPLICATION_JOB_LIFETIME_MS,
  APPLICATION_MAX_CONCURRENT_CALLS,
  ApplicationGenerationJobService,
  ApplicationJobError,
} from "../lib/server/application-generation-jobs.ts";
import { applicationArtifactDraftsFromPackage } from "../lib/server/application-generation.ts";
import {
  generationRequestFixture,
  makeValidDraft,
} from "./fixtures/application-fixtures.mjs";

const CORE_OUTPUTS = ["tailored-cv", "cover-letter"];
const ALL_OUTPUTS = [
  "tailored-cv",
  "cover-letter",
  "application-email",
  "company-brief",
  "interview-prep",
];

class MemoryStore {
  jobs = new Map();
  rejectNextUpdate = false;

  async create(job) {
    if (this.jobs.has(job.jobId)) throw new Error("duplicate");
    this.jobs.set(job.jobId, structuredClone(job));
  }

  async get(jobId, ownerHash) {
    const job = this.jobs.get(jobId);
    return job?.ownerHash === ownerHash ? structuredClone(job) : null;
  }

  async update(job, expectedUpdatedAt) {
    if (this.rejectNextUpdate) {
      this.rejectNextUpdate = false;
      return false;
    }
    const current = this.jobs.get(job.jobId);
    if (!current || current.ownerHash !== job.ownerHash) return false;
    if (expectedUpdatedAt && current.updatedAt !== expectedUpdatedAt) return false;
    this.jobs.set(job.jobId, structuredClone(job));
    return true;
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
  failForArtifact = null;

  queue(responseId, ...statuses) {
    this.polls.set(responseId, statuses);
  }

  async start(input) {
    if (input.artifact === this.failForArtifact) {
      throw new Error("synthetischer Startfehler");
    }
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

function requestFor(outputKinds = CORE_OUTPUTS) {
  const request = structuredClone(generationRequestFixture());
  request.preferences.outputKinds = [...outputKinds];
  request.modelSettingsExplicit = true;
  return request;
}

function artifactOutput(request, artifact, packageDraft = makeValidDraft()) {
  const draft = applicationArtifactDraftsFromPackage(request, packageDraft)[artifact];
  assert.ok(draft, `Kein Fixture-Artefakt für ${artifact}`);
  return { schemaVersion: 4, ...structuredClone(draft) };
}

function invalidCvOutput(request) {
  const output = artifactOutput(request, "tailored-cv");
  output.blocks = [
    { text: "# Lebenslauf\n\nZu kurz.", evidenceIds: [], researchIds: [] },
  ];
  return output;
}

function completed(output, model = "gpt-5.6-terra") {
  return {
    status: "completed",
    output,
    model,
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      reasoningTokens: 10,
      cachedInputTokens: 20,
      cacheWriteTokens: 0,
      totalTokens: 150,
    },
  };
}

function queueArtifacts(model, request, calls, overrides = {}) {
  for (const call of calls) {
    const output = overrides[call.artifact] ?? artifactOutput(request, call.artifact);
    model.queue(call.responseId, completed(output, call.model));
  }
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

test("startet CV und Anschreiben parallel mit den sichtbaren Presets", async () => {
  const { store, model, service } = harness();
  const request = requestFor();
  const result = await service.start("owner-a", request);

  assert.equal(result.status, "pending");
  assert.equal(result.job.id, "application-job-1");
  assert.equal(result.job.totalArtifacts, 2);
  assert.equal(model.starts.length, APPLICATION_MAX_CONCURRENT_CALLS);
  assert.deepEqual(
    model.starts.map((call) => [call.artifact, call.model, call.effort]),
    [
      ["tailored-cv", "gpt-5.6-terra", "medium"],
      ["cover-letter", "gpt-5.6-terra", "medium"],
    ],
  );
  const stored = await store.get("application-job-1", "owner-a");
  assert.equal(stored.request.masterCv.sourceDocumentId, "fixture-master");
  assert.equal(stored.work.filter((item) => item.status === "running").length, 2);
});

test("storniert einen bereits gestarteten Parallelaufruf, wenn der zweite Start scheitert", async () => {
  const { store, model, service } = harness();
  model.failForArtifact = "cover-letter";

  await assert.rejects(
    () => service.start("owner-a", requestFor()),
    (error) => error instanceof ApplicationJobError && error.status === 503,
  );
  assert.deepEqual(model.cancelled, ["resp_test_1"]);
  assert.equal(await store.get("application-job-1", "owner-a"), null);
});

test("startet Zusatztexte erst nach CV und Anschreiben und nie mehr als zwei zugleich", async () => {
  const { model, service } = harness();
  const request = requestFor(ALL_OUTPUTS);
  await service.start("owner-a", request);
  assert.deepEqual(
    model.starts.map((call) => call.artifact),
    ["tailored-cv", "cover-letter"],
  );

  queueArtifacts(model, request, model.starts.slice(0, 2));
  const optionals = await service.poll("owner-a", "application-job-1");
  assert.equal(optionals.status, "pending");
  assert.deepEqual(
    model.starts.slice(2).map((call) => call.artifact),
    ["application-email", "company-brief"],
  );
  assert.ok(model.starts.slice(2).every((call) => call.prompt.includes("BEREITS FREIGEGEBENE PROFILBELEGE")));

  queueArtifacts(model, request, model.starts.slice(2, 4));
  await service.poll("owner-a", "application-job-1");
  assert.equal(model.starts[4].artifact, "interview-prep");
  queueArtifacts(model, request, model.starts.slice(4, 5));
  const ready = await service.poll("owner-a", "application-job-1");
  assert.equal(ready.status, "ready");
  assert.equal(ready.result.schemaVersion, 4);
  assert.equal(ready.usage.calls, 5);
});

test("meldet laufende Antworten unter derselben Job-ID", async () => {
  const { model, service } = harness();
  await service.start("owner-a", requestFor());
  model.queue("resp_test_1", { status: "in_progress" });
  model.queue("resp_test_2", { status: "queued" });

  const result = await service.poll("owner-a", "application-job-1");
  assert.equal(result.status, "pending");
  assert.equal(result.job.status, "in_progress");
  assert.equal(result.job.completedArtifacts, 0);
});

test("gibt ein belegtes V4-Paket frei und hält es idempotent abrufbar", async () => {
  const { store, model, service } = harness();
  const request = requestFor();
  await service.start("owner-a", request);
  queueArtifacts(model, request, model.starts);

  const result = await service.poll("owner-a", "application-job-1");
  assert.equal(result.status, "ready");
  assert.equal(result.result.schemaVersion, 4);
  assert.equal(result.result.qualityReport.attempt, 1);
  assert.equal(result.usage.calls, 2);
  assert.equal(result.usage.reasoningTokens, 20);
  const stored = await store.get("application-job-1", "owner-a");
  assert.ok(stored.completedAt);
  const repeated = await service.poll("owner-a", "application-job-1");
  assert.equal(repeated.status, "ready");
  assert.equal(model.starts.length, 2);
});

test("repariert nur das fehlerhafte Artefakt einmal mit derselben Auswahl", async () => {
  const { store, model, service } = harness();
  const request = requestFor();
  await service.start("owner-a", request);
  queueArtifacts(model, request, model.starts, {
    "tailored-cv": invalidCvOutput(request),
  });

  const repairing = await service.poll("owner-a", "application-job-1");
  assert.equal(repairing.status, "pending");
  assert.equal(model.starts.length, 3);
  assert.deepEqual(
    [model.starts[2].artifact, model.starts[2].stage, model.starts[2].model, model.starts[2].effort],
    ["tailored-cv", "repair", "gpt-5.6-terra", "medium"],
  );
  const stored = await store.get("application-job-1", "owner-a");
  assert.ok(stored.issues.some((issue) => /Umfang/.test(issue)));

  queueArtifacts(model, request, model.starts.slice(2));
  const ready = await service.poll("owner-a", "application-job-1");
  assert.equal(ready.status, "ready");
  assert.equal(ready.result.qualityReport.attempt, 2);
  assert.equal(ready.usage.calls, 3);
});

test("gibt Zusatztexte erst nach bestandener Einzelprüfung der Kerndokumente frei", async () => {
  const { model, service } = harness();
  const request = requestFor(ALL_OUTPUTS);
  await service.start("owner-a", request);
  queueArtifacts(model, request, model.starts, {
    "tailored-cv": invalidCvOutput(request),
  });

  await service.poll("owner-a", "application-job-1");
  assert.deepEqual(
    model.starts.map((call) => [call.artifact, call.stage]),
    [
      ["tailored-cv", "draft"],
      ["cover-letter", "draft"],
      ["tailored-cv", "repair"],
    ],
  );

  queueArtifacts(model, request, model.starts.slice(2));
  await service.poll("owner-a", "application-job-1");
  assert.deepEqual(
    model.starts.slice(3).map((call) => call.artifact),
    ["application-email", "company-brief"],
  );
});

test("schließt nach dem einzigen Reparaturlauf mit sichtbaren Qualitätshinweisen ab", async () => {
  const { store, model, service } = harness();
  const request = requestFor();
  await service.start("owner-a", request);
  queueArtifacts(model, request, model.starts, {
    "tailored-cv": invalidCvOutput(request),
  });
  await service.poll("owner-a", "application-job-1");
  model.queue("resp_test_3", completed(invalidCvOutput(request)));

  const result = await service.poll("owner-a", "application-job-1");
  assert.equal(result.status, "ready");
  assert.equal(result.result.status, "needs_review");
  assert.equal(result.result.qualityReport.status, "needs_review");
  assert.ok(result.result.qualityReport.issues.some((issue) => /Umfang/.test(issue)));
  const terminal = await store.get("application-job-1", "owner-a");
  assert.equal(terminal.terminalError, null);
  assert.equal(terminal.result.status, "needs_review");
  assert.deepEqual(
    terminal.usage.map((entry) => entry.artifact),
    ["tailored-cv", "cover-letter", "tailored-cv"],
  );
});

test("prüft bei manuellen Änderungen nur das tatsächlich bearbeitete Ergebnis", async () => {
  const { model, service } = harness();
  const request = requestFor(ALL_OUTPUTS);
  request.manualDraft = makeValidDraft();
  request.editedOutputKinds = ["application-email"];
  await service.start("owner-a", request);

  assert.equal(model.starts.length, 1);
  assert.deepEqual(
    [model.starts[0].artifact, model.starts[0].stage, model.starts[0].model, model.starts[0].effort],
    ["application-email", "manual_review", "gpt-5.6-luna", "low"],
  );
  queueArtifacts(model, request, model.starts);
  const result = await service.poll("owner-a", "application-job-1");
  assert.equal(result.status, "ready");
  assert.equal(result.result.qualityReport.attempt, 2);
});

test("löscht einen abgelaufenen Auftrag und bricht alle aktiven Antworten ab", async () => {
  const { store, model, service, advance } = harness();
  await service.start("owner-a", requestFor());
  advance(APPLICATION_JOB_LIFETIME_MS + 1);

  await assert.rejects(
    () => service.poll("owner-a", "application-job-1"),
    (error) => error instanceof ApplicationJobError && error.status === 410,
  );
  assert.deepEqual(model.cancelled.sort(), ["resp_test_1", "resp_test_2"]);
  assert.equal(await store.get("application-job-1", "owner-a"), null);
});

test("bricht alle laufenden Antworten ab und entfernt den Jobzustand", async () => {
  const { store, model, service } = harness();
  await service.start("owner-a", requestFor());
  const result = await service.cancel("owner-a", "application-job-1");

  assert.deepEqual(result, { status: "cancelled" });
  assert.deepEqual(model.cancelled.sort(), ["resp_test_1", "resp_test_2"]);
  assert.equal(await store.get("application-job-1", "owner-a"), null);
});

test("gibt eine fremde Job-ID nicht preis", async () => {
  const { store, model, service } = harness();
  await service.start("owner-a", requestFor());

  await assert.rejects(
    () => service.poll("owner-b", "application-job-1"),
    (error) => error instanceof ApplicationJobError && error.status === 404,
  );
  assert.equal(model.polls.size, 0);
  assert.ok(await store.get("application-job-1", "owner-a"));
});

test("verwendet eine übergebene Startkennung artefaktbezogen idempotent", async () => {
  const { model, service } = harness();
  const first = await service.start("owner-a", requestFor(), "client-request-0001");
  const repeated = await service.start(
    "owner-a",
    requestFor(),
    "client-request-0001",
  );

  assert.equal(first.status, "pending");
  assert.equal(repeated.status, "pending");
  assert.equal(first.job.id, "client-request-0001");
  assert.equal(model.starts.length, 2);
  assert.ok(model.starts.every((call) => call.jobId === "client-request-0001"));
});

test("verwirft und storniert bei einem optimistischen Schreibkonflikt verwaiste Aufrufe", async () => {
  const { store, model, service } = harness();
  const request = requestFor(ALL_OUTPUTS);
  await service.start("owner-a", request);
  queueArtifacts(model, request, model.starts);
  store.rejectNextUpdate = true;

  const result = await service.poll("owner-a", "application-job-1");
  assert.equal(result.status, "pending");
  assert.deepEqual(model.cancelled.sort(), ["resp_test_3", "resp_test_4"]);
  const stored = await store.get("application-job-1", "owner-a");
  assert.deepEqual(
    stored.work.filter((item) => item.status === "running").map((item) => item.responseId),
    ["resp_test_1", "resp_test_2"],
  );
});

test("storniert bei gleichzeitigem idempotentem Start die Aufrufe des Verlierers", async () => {
  const { model, service } = harness();
  const [first, second] = await Promise.all([
    service.start("owner-a", requestFor(), "parallel-request-0001"),
    service.start("owner-a", requestFor(), "parallel-request-0001"),
  ]);

  assert.equal(first.status, "pending");
  assert.equal(second.status, "pending");
  assert.equal(model.starts.length, 4);
  assert.equal(model.cancelled.length, 2);
});

test("löscht ein terminales Ergebnis nach neun Minuten", async () => {
  const { store, model, service, advance } = harness();
  const request = requestFor();
  await service.start("owner-a", request);
  queueArtifacts(model, request, model.starts);
  await service.poll("owner-a", "application-job-1");
  advance(9 * 60_000 + 1);

  await assert.rejects(
    () => service.poll("owner-a", "application-job-1"),
    (error) => error instanceof ApplicationJobError && error.status === 410,
  );
  assert.equal(await store.get("application-job-1", "owner-a"), null);
  assert.deepEqual(model.cancelled, []);
});
