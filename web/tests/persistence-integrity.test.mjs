import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);

async function importTypeScriptModule(path) {
  const source = await readFile(new URL(path, root), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`,
  );
}

function validState(overrides = {}) {
  return {
    schemaVersion: 1,
    revision: 0,
    updatedAt: "2026-08-09T08:00:00.000Z",
    tasks: [],
    costs: [],
    documents: [],
    calendarEvents: [],
    applications: [],
    journal: [],
    ...overrides,
  };
}

test("teilt den Mindestvertrag für Client und Server", async () => {
  const { isPersistedAppState } = await importTypeScriptModule(
    "lib/state-validation.ts",
  );
  assert.equal(isPersistedAppState(validState()), true);
  assert.equal(isPersistedAppState(validState({ revision: Number.NaN })), false);
  assert.equal(isPersistedAppState(validState({ calendarEvents: undefined })), false);
  assert.equal(isPersistedAppState(validState({ applications: undefined })), false);
});

test("blockiert beschädigten State vor Planung und Automatik", async () => {
  const [stateRoute, client, planning, planningApi, taskRoute, fileRoute] =
    await Promise.all([
      readFile(new URL("app/api/state/route.ts", root), "utf8"),
      readFile(new URL("lib/use-gerri-state.ts", root), "utf8"),
      readFile(new URL("lib/planning-server.ts", root), "utf8"),
      readFile(new URL("lib/planning-api.ts", root), "utf8"),
      readFile(new URL("app/api/tasks/route.ts", root), "utf8"),
      readFile(new URL("app/api/files/[fileId]/route.ts", root), "utf8"),
    ]);

  const [outbox, schema, migration, assistant] = await Promise.all([
    readFile(new URL("lib/planning-server.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("drizzle/0008_outgoing_rhodey.sql", root), "utf8"),
    readFile(new URL("app/api/assistant/route.ts", root), "utf8"),
  ]);

  assert.match(stateRoute, /isPersistedAppState/);
  assert.match(stateRoute, /state_storage_corrupt/);
  assert.match(client, /state-validation/);
  assert.match(planning, /PlanningStateCorruptionError/);
  assert.match(planning, /throw new PlanningStateCorruptionError/);
  assert.match(planningApi, /planning_state_corrupt/);
  assert.match(taskRoute, /deleteCalendarEvent/);
  assert.match(taskRoute, /compensationFailed/);
  assert.match(fileRoute, /export async function DELETE/);
  assert.match(fileRoute, /env\.FILES\.delete/);
  assert.match(outbox, /claimToken/);
  assert.match(schema, /claimToken: text\("claim_token"\)/);
  assert.match(migration, /claim_token/);
  assert.match(assistant, /expectedUpdatedAt/);
  assert.match(assistant, /applicationGenerationJobs\.updatedAt/);
});
