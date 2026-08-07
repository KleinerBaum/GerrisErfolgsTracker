import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);

async function importFinanceData() {
  const source = await readFile(new URL("lib/finance-data.ts", root), "utf8");
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

test("bewahrt unbekannte Kontostände als unbekannt statt sie zu null Euro umzudeuten", async () => {
  const { normalizeAccountBalances } = await importFinanceData();

  assert.deepEqual(normalizeAccountBalances(undefined), {
    paypal: null,
    revolut: null,
    updatedAt: null,
  });
  assert.deepEqual(
    normalizeAccountBalances({
      paypal: Number.NaN,
      revolut: 0,
      updatedAt: "2026-08-05T09:15:00.000Z",
    }),
    {
      paypal: null,
      revolut: 0,
      updatedAt: "2026-08-05T09:15:00.000Z",
    },
  );
});

test("liest deutsche und internationale Eurobeträge ohne Teilwert-Verfälschung", async () => {
  const { parseEuroInput } = await importFinanceData();

  assert.deepEqual(parseEuroInput("1.234,56"), {
    valid: true,
    value: 1234.56,
  });
  assert.deepEqual(parseEuroInput("-12,40"), {
    valid: true,
    value: -12.4,
  });
  assert.deepEqual(parseEuroInput("125.50"), {
    valid: true,
    value: 125.5,
  });
  assert.deepEqual(parseEuroInput("  "), { valid: true, value: null });
  assert.deepEqual(parseEuroInput("12,3x"), { valid: false, value: null });
  assert.deepEqual(parseEuroInput("1.2.3"), { valid: false, value: null });
});
