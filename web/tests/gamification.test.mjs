import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);

async function importGamification() {
  const source = await readFile(new URL("lib/gamification.ts", root), "utf8");
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

const now = "2026-08-01T10:00:00.000Z";

function task(id, overrides = {}) {
  return {
    id,
    title: `Aufgabe ${id}`,
    area: "arbeit",
    quadrant: "do",
    dueAt: now,
    estimateMinutes: 90,
    progress: 0,
    completed: false,
    confidential: true,
    ...overrides,
  };
}

function profile(taskId, overrides = {}) {
  return {
    taskId,
    difficultyBand: "D3",
    assessment: {
      effort: 3,
      cognitiveLoad: 3,
      activationBarrier: 3,
      coordination: 2,
      weightedScore: 2.8,
      suggestedBand: "D3",
      explanation: "Bestätigter Testwert",
      source: "FALLBACK",
      suggestedAt: now,
    },
    confirmedAt: now,
    verificationType: "GOOGLE_TASK",
    weeklyAnchor: false,
    scheduledBlock: false,
    verifiedMilestone: false,
    anchorRole: null,
    anchorDate: null,
    ...overrides,
  };
}

test("bestätigte Boni werden deterministisch auf 25 Prozent begrenzt", async () => {
  const { applyTaskCompletionReward, createDefaultGamification } =
    await importGamification();
  const item = task("one");
  const confirmed = profile(item.id, {
    weeklyAnchor: true,
    scheduledBlock: true,
    verifiedMilestone: true,
  });
  const result = applyTaskCompletionReward({
    gamification: createDefaultGamification(0, now),
    task: { ...item, completed: true, completedAt: now },
    allTasks: [item],
    profile: confirmed,
    completedAt: now,
  });

  assert.equal(result.entry.bonusPercent, 25);
  assert.equal(result.entry.xpDelta, 31);
  assert.equal(result.entry.energyDelta, 5);
  assert.equal(result.entry.runeDelta, 1);
});

test("dieselbe Google-Aufgabe erhält auch nach erneutem Sync keinen doppelten Reward", async () => {
  const { applyTaskCompletionReward, createDefaultGamification } =
    await importGamification();
  const item = task("sync");
  const confirmed = profile(item.id);
  const first = applyTaskCompletionReward({
    gamification: createDefaultGamification(0, now),
    task: item,
    allTasks: [item],
    profile: confirmed,
    completedAt: now,
  });
  const second = applyTaskCompletionReward({
    gamification: first.gamification,
    task: item,
    allTasks: [item],
    profile: confirmed,
    completedAt: "2026-08-01T10:05:00.000Z",
  });

  assert.equal(first.gamification.ledger.length, 1);
  assert.equal(second.gamification.ledger.length, 1);
  assert.equal(second.entry, null);
});

test("Unteraufgaben teilen das Punktebudget der Hauptaufgabe", async () => {
  const {
    applyTaskCompletionReward,
    createDefaultGamification,
    upsertTaskProfile,
  } = await importGamification();
  const parent = task("parent");
  const childOne = task("child-one", { parentId: parent.id });
  const childTwo = task("child-two", { parentId: parent.id });
  const parentProfile = profile(parent.id);
  const childProfileOne = profile(childOne.id, { difficultyBand: "D5" });
  const childProfileTwo = profile(childTwo.id, { difficultyBand: "D5" });
  const base = upsertTaskProfile(
    createDefaultGamification(0, now),
    parentProfile,
  );
  const first = applyTaskCompletionReward({
    gamification: base,
    task: childOne,
    allTasks: [parent, childOne, childTwo],
    profile: childProfileOne,
    completedAt: now,
  });
  const second = applyTaskCompletionReward({
    gamification: first.gamification,
    task: childTwo,
    allTasks: [parent, childOne, childTwo],
    profile: childProfileTwo,
    completedAt: "2026-08-01T11:00:00.000Z",
  });
  const earned = second.gamification.ledger.reduce(
    (sum, entry) => sum + Math.max(0, entry.xpDelta),
    0,
  );

  assert.equal(first.entry.xpDelta, 13);
  assert.equal(second.entry.xpDelta, 12);
  assert.equal(earned, 25);
});

test("Moduswechsel verändert weder Ledger noch Ressourcen", async () => {
  const { createDefaultGamification, ledgerTotals } = await importGamification();
  const base = createDefaultGamification(1240, now);
  const before = ledgerTotals(base.ledger);
  const after = ledgerTotals({ ...base, rewardMode: "FANTASY" }.ledger);

  assert.deepEqual(after, before);
  assert.equal(base.ledger[0].kind, "OPENING_BALANCE");
});

test("Ruhetage und bewusst ausgesetzte Tage zählen nicht in den 14-Tage-Rhythmus", async () => {
  const {
    anchorRhythm,
    createDefaultGamification,
    markTaskCompletionForRhythm,
    setAnchorDayStatus,
    setDailyAnchor,
  } = await importGamification();
  const firstTask = task("anchor-one");
  const secondTask = task("anchor-two");
  let game = createDefaultGamification(0, now);
  game = setDailyAnchor(game, firstTask, "2026-07-30", "KEY", now);
  game = markTaskCompletionForRhythm(game, firstTask.id);
  game = setAnchorDayStatus(game, "2026-07-31", "REST");
  game = setDailyAnchor(game, secondTask, "2026-08-01", "KEY", now);
  const rhythm = anchorRhythm(game.anchorDays, "2026-08-01");

  assert.deepEqual(rhythm, { fulfilledDays: 1, plannedDays: 2, percent: 50 });
});

test("nicht dokumentiert freigegebene Dr.-Roß-Inhalte bleiben deaktiviert", async () => {
  const { completionMessage, createDefaultGamification, normalizeGamificationState } =
    await importGamification();
  const candidate = createDefaultGamification(0, now);
  candidate.drRossEnabled = true;
  candidate.approvedMessages = [
    {
      id: "unapproved",
      category: "CELEBRATE",
      contentType: "APPROVED_PARAPHRASE",
      text: "Nicht freigegeben",
      approvedAt: null,
      permissionReference: "",
      active: true,
    },
  ];
  const normalized = normalizeGamificationState(candidate, 0, now);
  const message = completionMessage("CELEBRATE", normalized);

  assert.equal(normalized.drRossEnabled, false);
  assert.equal(message.attribution, "Allgemeiner Kompass-Text");
  assert.doesNotMatch(message.text, /Roß/);
});

test("Einlösungen können den Klarpunkte-Saldo nie unter null drücken", async () => {
  const { createDefaultGamification, ledgerTotals, redeemPersonalReward } =
    await importGamification();
  const base = createDefaultGamification(25, now);
  const tooLarge = redeemPersonalReward(base, "reward-evening", now);
  const exact = redeemPersonalReward(base, "reward-break", now);

  assert.ok(tooLarge.error);
  assert.equal(tooLarge.gamification.ledger.length, 1);
  assert.equal(exact.error, null);
  assert.equal(ledgerTotals(exact.gamification.ledger).balanceXp, 0);
});
