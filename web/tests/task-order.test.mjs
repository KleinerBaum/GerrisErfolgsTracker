import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);

async function importTaskOrder() {
  const source = await readFile(new URL("lib/task-order.ts", root), "utf8");
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

const task = (id, overrides = {}) => ({
  id,
  title: id,
  area: "persoenlich",
  quadrant: "do",
  dueAt: null,
  estimateMinutes: 20,
  progress: 0,
  completed: false,
  confidential: true,
  ...overrides,
});

test("ordnet offene Aufgaben nach Fälligkeit, Fortschritt und Titel", async () => {
  const { orderOpenTasks } = await importTaskOrder();
  const original = [
    task("ohne-frist"),
    task("spaeter", { dueAt: "2026-08-08T07:00:00.000Z" }),
    task("frueh-b", { dueAt: "2026-08-06T07:00:00.000Z", progress: 20 }),
    task("frueh-a", { dueAt: "2026-08-06T07:00:00.000Z", progress: 80 }),
  ];

  assert.deepEqual(orderOpenTasks(original).map(({ id }) => id), [
    "frueh-a",
    "frueh-b",
    "spaeter",
    "ohne-frist",
  ]);
  assert.equal(original[0].id, "ohne-frist");
});

test("zeigt zuletzt erledigte Aufgaben zuerst", async () => {
  const { orderCompletedTasks } = await importTaskOrder();
  const tasks = [
    task("alt", { completed: true, completedAt: "2026-08-01T10:00:00.000Z" }),
    task("neu", { completed: true, completedAt: "2026-08-05T10:00:00.000Z" }),
  ];

  assert.deepEqual(orderCompletedTasks(tasks).map(({ id }) => id), ["neu", "alt"]);
});
