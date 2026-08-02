import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);

async function importTypeScriptModule(relativeUrl) {
  const source = await readFile(new URL(relativeUrl, root), "utf8");
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

test("ordnet offene, zurückgestellte und priorisierte Themen als Inspiration", async () => {
  const { buildDiaryPlanningSuggestions } = await importTypeScriptModule(
    "lib/diary-planning.ts",
  );
  const suggestions = buildDiaryPlanningSuggestions({
    tasks: [
      {
        id: "task-do",
        title: "Dringende Aufgabe",
        area: "alltag",
        quadrant: "do",
        dueAt: null,
        estimateMinutes: 15,
        progress: 0,
        completed: false,
        confidential: true,
      },
      {
        id: "task-done",
        title: "Erledigt",
        area: "alltag",
        quadrant: "plan",
        dueAt: null,
        estimateMinutes: 15,
        progress: 100,
        completed: true,
        confidential: true,
      },
    ],
    report: {
      gaps: [
        {
          id: "gap-snoozed",
          title: "Später klären",
          detail: "Bewusst vertagt",
          status: "snoozed",
          severity: "important",
          snoozedUntil: "2026-08-05T09:00:00.000Z",
          dueAt: null,
        },
        {
          id: "gap-with-task",
          title: "Schon als Aufgabe vorhanden",
          detail: "Kein Duplikat",
          status: "open",
          severity: "critical",
          googleTaskId: "task-do",
          dueAt: null,
        },
      ],
      openTopics: [
        {
          id: "topic-open",
          title: "Offene Frage",
          detail: "In Ruhe prüfen",
          nextStep: "Antwort skizzieren",
          status: "open",
          group: "next_step",
          requiresCalendarTarget: false,
          dueAt: null,
          snoozedUntil: null,
        },
      ],
    },
  });

  assert.deepEqual(
    suggestions.map(({ id, priority, status }) => ({ id, priority, status })),
    [
      { id: "task:task-do", priority: "critical", status: "open" },
      { id: "gap:gap-snoozed", priority: "important", status: "snoozed" },
      { id: "topic:topic-open", priority: "normal", status: "open" },
    ],
  );
});

test("berechnet Folgetage und Sonntag unabhängig von Zeitumstellungen", async () => {
  const { addDiaryDays, isSundayDate } = await importTypeScriptModule(
    "lib/diary-planning.ts",
  );
  assert.equal(addDiaryDays("2026-03-28", 1), "2026-03-29");
  assert.equal(addDiaryDays("2026-10-24", 2), "2026-10-26");
  assert.equal(isSundayDate("2026-08-02"), true);
  assert.equal(isSundayDate("2026-08-03"), false);
});
