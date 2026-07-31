import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);

async function importPlanning() {
  const source = await readFile(new URL("lib/planning.ts", root), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
}

function state(overrides = {}) {
  return {
    schemaVersion: 1,
    revision: 1,
    updatedAt: "2026-08-01T06:00:00.000Z",
    ownerName: "Gerri",
    monthlyBudget: 0,
    points: 0,
    rhythmDays: 0,
    tasks: [],
    costs: [],
    incomes: [],
    accountBalances: { paypal: null, revolut: null, updatedAt: null },
    documents: [],
    calendarEvents: [],
    applications: [],
    masterCvDocumentId: null,
    journal: [],
    ...overrides,
  };
}

function healthySnapshot(overrides = {}) {
  return {
    connected: true,
    loaded: true,
    selectedCalendarIds: ["primary"],
    fetchedAt: "2026-08-01T06:00:00.000Z",
    error: null,
    ...overrides,
  };
}

const now = "2026-08-01T08:00:00.000+02:00";

test("verbundener leerer Kalender ist eine kritische Lücke und niemals frei", async () => {
  const { buildPlanningHealthReport } = await importPlanning();
  const report = buildPlanningHealthReport({
    state: state(),
    events: [],
    calendar: healthySnapshot(),
    now,
  });

  assert.equal(report.state, "incomplete");
  assert.notEqual(report.state, "intentionally_free");
  assert.equal(report.days[0].state, "gap");
  assert.ok(
    report.gaps.some(
      (gap) =>
        gap.kind === "calendar_day_empty" &&
        gap.date === "2026-08-01" &&
        gap.severity === "critical",
    ),
  );
  assert.ok(
    report.gaps.some(
      (gap) =>
        gap.kind === "calendar_day_empty" &&
        gap.date === "2026-08-03" &&
        gap.severity === "important",
    ),
  );
});

test("ausdrückliche Freigabe entfernt nur die Leerlücke und nicht Verpflichtungen", async () => {
  const { buildPlanningHealthReport } = await importPlanning();
  const base = {
    state: state(),
    calendar: healthySnapshot(),
    dayIntents: [
      {
        date: "2026-08-01",
        kind: "intentionally_free",
        note: "",
        createdAt: "2026-08-01T05:00:00.000Z",
        updatedAt: "2026-08-01T05:00:00.000Z",
      },
    ],
    now,
  };
  const free = buildPlanningHealthReport({ ...base, events: [] });
  assert.equal(free.days[0].state, "intentionally_free");
  assert.equal(
    free.gaps.some(
      (gap) => gap.kind === "calendar_day_empty" && gap.date === "2026-08-01",
    ),
    false,
  );

  const withObligation = buildPlanningHealthReport({
    ...base,
    events: [
      {
        id: "hard-1",
        title: "Arzttermin",
        startAt: "2026-08-01T08:00:00.000Z",
        endAt: "2026-08-01T09:00:00.000Z",
        source: "google",
        kind: "appointment",
        private: true,
      },
    ],
  });
  assert.equal(withObligation.days[0].state, "planned");
  assert.equal(withObligation.days[0].hardEventCount, 1);
});

test("getrennt, fehlerhaft oder veraltet bleibt unbekannt beziehungsweise dringend", async () => {
  const { buildPlanningHealthReport } = await importPlanning();
  const disconnected = buildPlanningHealthReport({
    state: state(),
    events: [],
    calendar: healthySnapshot({
      connected: false,
      loaded: false,
      selectedCalendarIds: [],
      fetchedAt: null,
    }),
    now,
  });
  assert.equal(disconnected.state, "unknown");
  assert.equal(disconnected.criticalCount, 1);
  assert.equal(disconnected.gaps[0].kind, "calendar_connection_unknown");

  const stale = buildPlanningHealthReport({
    state: state(),
    events: [],
    calendar: healthySnapshot({ fetchedAt: "2026-08-01T05:30:00.000Z" }),
    now,
  });
  assert.equal(stale.state, "stale");
  assert.ok(stale.gaps.some((gap) => gap.kind === "calendar_stale"));
});

test("Geburtstagskalender allein vervollständigt keinen Tag", async () => {
  const { buildPlanningHealthReport } = await importPlanning();
  const report = buildPlanningHealthReport({
    state: state(),
    calendar: healthySnapshot(),
    events: [
      {
        id: "birthday",
        title: "Geburtstag",
        startAt: "2026-07-31T22:00:00.000Z",
        endAt: "2026-08-01T22:00:00.000Z",
        source: "google",
        kind: "appointment",
        private: false,
        allDay: true,
        managedCalendarKey: "birthdays_holidays",
      },
    ],
    now,
  });
  assert.equal(report.days[0].planBlockCount, 0);
  assert.ok(
    report.gaps.some(
      (gap) => gap.kind === "calendar_day_empty" && gap.date === "2026-08-01",
    ),
  );
});

test("Quellenlücken, Konflikte und Gap-Aufgaben sind stabil priorisiert", async () => {
  const {
    buildPlanningHealthReport,
    gapTaskInput,
    stablePlanningGapId,
  } = await importPlanning();
  const task = {
    id: "task-ohne-datum",
    title: "Versicherung klären",
    area: "alltag",
    quadrant: "do",
    dueAt: null,
    estimateMinutes: 50,
    progress: 0,
    completed: false,
    confidential: true,
  };
  const report = buildPlanningHealthReport({
    state: state({ tasks: [task] }),
    calendar: healthySnapshot(),
    events: [
      {
        id: "one",
        title: "Termin A",
        startAt: "2026-08-01T08:00:00.000Z",
        endAt: "2026-08-01T09:00:00.000Z",
        source: "google",
        kind: "appointment",
        private: false,
      },
      {
        id: "two",
        title: "Termin B",
        startAt: "2026-08-01T08:30:00.000Z",
        endAt: "2026-08-01T09:30:00.000Z",
        source: "google",
        kind: "appointment",
        private: false,
      },
    ],
    now,
  });
  const taskGap = report.gaps.find((gap) => gap.kind === "task_undated");
  assert.ok(taskGap);
  assert.equal(taskGap.severity, "critical");
  assert.ok(report.gaps.some((gap) => gap.kind === "calendar_conflict"));
  assert.equal(report.state, "conflicted");
  assert.equal(
    taskGap.id,
    stablePlanningGapId("task_undated", "task", task.id),
  );
  const googleTask = gapTaskInput(taskGap);
  assert.equal(googleTask.legacyId, taskGap.id);
  assert.equal(googleTask.quadrant, "do");
  assert.match(googleTask.title, /^Dringend & wichtig:/);
});

test("Sensitivitätsrouting folgt nur dem expliziten Flag", async () => {
  const { managedCalendarRoute, planningDateKey } = await importPlanning();
  assert.equal(
    managedCalendarRoute({ sourceType: "application", confidential: false }),
    "applications",
  );
  assert.equal(
    managedCalendarRoute({ sourceType: "application", confidential: true }),
    "private",
  );
  assert.equal(
    managedCalendarRoute({ sourceType: "task", confidential: false }),
    "focus",
  );
  assert.equal(
    planningDateKey("2026-03-29T00:30:00.000Z"),
    "2026-03-29",
  );
  assert.equal(
    planningDateKey("2026-10-25T23:30:00.000Z"),
    "2026-10-26",
  );
});
