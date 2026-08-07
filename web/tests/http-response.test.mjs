import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);

async function importHttpResponse() {
  const source = await readFile(new URL("lib/http-response.ts", root), "utf8");
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

test("liest gültige JSON-Antworten und fängt leere oder fremde Fehlerkörper ab", async () => {
  const { responsePayload } = await importHttpResponse();

  assert.deepEqual(
    await responsePayload(new Response('{"ok":true,"count":0}')),
    { ok: true, count: 0 },
  );
  assert.deepEqual(await responsePayload(new Response("")), {});
  assert.deepEqual(
    await responsePayload(new Response("<html>Gateway-Fehler</html>")),
    {},
  );
  assert.deepEqual(await responsePayload(new Response("null")), {});
});
