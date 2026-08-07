import assert from "node:assert/strict";
import test from "node:test";

import { researchOpenAIRequest } from "../lib/job-research.ts";

test("Standardrecherche nutzt Luna, niedrigen Kontext und höchstens drei Suchaufrufe", () => {
  const request = researchOpenAIRequest({
    model: "gpt-5.6-luna",
    owner: "owner-test",
    prompt: "Stellenanzeige prüfen",
    providedAdText: false,
  });

  assert.equal(request.model, "gpt-5.6-luna");
  assert.equal(request.reasoning.effort, "low");
  assert.equal(request.tools[0].search_context_size, "low");
  assert.equal(request.max_tool_calls, 3);
  assert.equal(request.max_output_tokens, 5_000);
});

test("eingefügter Anzeigentext reduziert das Suchbudget auf offizielle Firmenquellen", () => {
  const request = researchOpenAIRequest({
    model: "gpt-5.6-luna",
    owner: "owner-test",
    prompt: "Eingefügten Text und Firma prüfen",
    providedAdText: true,
  });

  assert.equal(request.max_tool_calls, 2);
  assert.match(request.instructions, /keine Websuche/i);
});
