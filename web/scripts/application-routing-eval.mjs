import {
  APPLICATION_ARTIFACT_SCHEMA,
  applicationArtifactDraftsFromPackage,
  applicationArtifactInstructions,
  applicationArtifactModelBudget,
  applicationArtifactModelInput,
  evaluateApplicationArtifactDraft,
  evaluateApplicationArtifactSet,
  normalizeApplicationArtifactOutput,
} from "../lib/server/application-generation.ts";
import {
  generationRequestFixture,
  makeValidDraft,
} from "../tests/fixtures/application-fixtures.mjs";

const API_URL = `${(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "")}/responses`;
const API_KEY = process.env.OPENAI_API_KEY?.trim();
const PRICING = {
  "gpt-5.6-luna": { input: 1, cached: 0.1, cacheWrite: 1.25, output: 6 },
  "gpt-5.6-terra": { input: 2.5, cached: 0.25, cacheWrite: 3.125, output: 15 },
  "gpt-5.6-sol": { input: 5, cached: 0.5, cacheWrite: 6.25, output: 30 },
};

if (!API_KEY) {
  throw new Error("OPENAI_API_KEY fehlt in der Prozessumgebung.");
}

function outputText(payload) {
  if (typeof payload.output_text === "string") return payload.output_text;
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return "";
}

function usage(payload) {
  const inputTokens = Number(payload.usage?.input_tokens || 0);
  const outputTokens = Number(payload.usage?.output_tokens || 0);
  const cachedInputTokens = Number(
    payload.usage?.input_tokens_details?.cached_tokens || 0,
  );
  const cacheWriteTokens = Number(
    payload.usage?.input_tokens_details?.cache_write_tokens || 0,
  );
  const reasoningTokens = Number(
    payload.usage?.output_tokens_details?.reasoning_tokens || 0,
  );
  return {
    inputTokens,
    outputTokens,
    reasoningTokens,
    cachedInputTokens,
    cacheWriteTokens,
    totalTokens: Number(payload.usage?.total_tokens || inputTokens + outputTokens),
  };
}

function costUsd(model, tokens) {
  const price = PRICING[model];
  if (!price) return null;
  const ordinaryInput = Math.max(
    0,
    tokens.inputTokens - tokens.cachedInputTokens - tokens.cacheWriteTokens,
  );
  return (
    (ordinaryInput * price.input +
      tokens.cachedInputTokens * price.cached +
      tokens.cacheWriteTokens * price.cacheWrite +
      tokens.outputTokens * price.output) /
    1_000_000
  );
}

async function runArtifact(
  request,
  artifact,
  dependencies,
  stage = "draft",
  previous = null,
  previousIssues = [],
) {
  const budget = applicationArtifactModelBudget(request, artifact);
  const input = applicationArtifactModelInput(
    request,
    artifact,
    stage,
    previous,
    previousIssues,
    dependencies,
  );
  const startedAt = performance.now();
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: budget.model,
      instructions: applicationArtifactInstructions(artifact),
      input: [{ role: "user", content: [{ type: "input_text", text: input.prompt }] }],
      reasoning: { effort: budget.reasoningEffort },
      max_output_tokens: budget.maxOutputTokens,
      store: false,
      safety_identifier: "gerris-routing-eval-2026-08-09",
      text: {
        verbosity: "medium",
        format: {
          type: "json_schema",
          name: "bewerbungsartefakt_v4_eval",
          strict: true,
          schema: APPLICATION_ARTIFACT_SCHEMA,
        },
      },
    }),
  });
  const durationMs = Math.round(performance.now() - startedAt);
  const payload = await response.json();
  if (!response.ok) {
    return {
      artifact,
      stage,
      ok: false,
      status: response.status,
      model: budget.model,
      effort: budget.reasoningEffort,
      durationMs,
      errorCode:
        typeof payload.error?.code === "string" ? payload.error.code : "api_error",
    };
  }
  const raw = outputText(payload);
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  const draft = normalizeApplicationArtifactOutput(request, artifact, parsed);
  const tokens = usage(payload);
  const issues = draft
    ? evaluateApplicationArtifactDraft(request, draft, stage === "draft" ? 1 : 2)
    : ["Ungültiges strukturiertes Artefakt"];
  const effectiveModel = typeof payload.model === "string" ? payload.model : budget.model;
  return {
    artifact,
    stage,
    ok: Boolean(draft) && issues.length === 0,
    status: response.status,
    model: effectiveModel,
    effort: budget.reasoningEffort,
    durationMs,
    ...tokens,
    estimatedCostUsd: costUsd(effectiveModel, tokens),
    issueCount: issues.length,
    issues,
    draft,
  };
}

const request = generationRequestFixture();
request.modelSettingsExplicit = true;
const drafts = {};
const results = [];
const optionalOnly = process.env.EVAL_OPTIONALS_ONLY === "1";
if (optionalOnly) {
  const fixtureDrafts = applicationArtifactDraftsFromPackage(
    request,
    makeValidDraft(),
  );
  drafts["tailored-cv"] = fixtureDrafts["tailored-cv"];
  drafts["cover-letter"] = fixtureDrafts["cover-letter"];
}

const batches = optionalOnly
  ? [["application-email", "company-brief"], ["interview-prep"]]
  : [
      ["tailored-cv", "cover-letter"],
      ["application-email", "company-brief"],
      ["interview-prep"],
    ];

for (const batch of batches) {
  const firstResults = await Promise.all(
    batch.map((artifact) => runArtifact(request, artifact, drafts)),
  );
  for (const result of firstResults) {
    if (result.draft) drafts[result.artifact] = result.draft;
    results.push(result);
  }
  const repairable = firstResults.filter((result) => !result.ok && result.draft);
  const repairResults = await Promise.all(
    repairable.map((result) =>
      runArtifact(
        request,
        result.artifact,
        drafts,
        "repair",
        result.draft,
        result.issues,
      ),
    ),
  );
  for (const result of repairResults) {
    if (result.draft) drafts[result.artifact] = result.draft;
    results.push(result);
  }
  const finalByArtifact = new Map(
    [...firstResults, ...repairResults].map((result) => [result.artifact, result]),
  );
  if (batch.some((artifact) => !finalByArtifact.get(artifact)?.ok)) {
    break;
  }
}

let packageGate = { ok: false, issueCount: 1 };
if (Object.keys(drafts).length === request.preferences.outputKinds.length) {
  const evaluation = evaluateApplicationArtifactSet(
    request,
    drafts,
    results.some((result) => result.stage === "repair") ? 2 : 1,
  );
  packageGate = {
    ok: evaluation.status === "ready",
    issueCount: evaluation.status === "ready" ? 0 : evaluation.issues.length,
    issues: evaluation.status === "ready" ? [] : evaluation.issues,
  };
}

const sanitizedResults = results.map((result) => {
  const sanitized = { ...result };
  delete sanitized.draft;
  return sanitized;
});
const totalEstimatedCostUsd = sanitizedResults
  .filter((result) => typeof result.estimatedCostUsd === "number")
  .reduce((total, result) => total + result.estimatedCostUsd, 0);
const finalResults = new Map(
  sanitizedResults.map((result) => [result.artifact, result]),
);
const successfulArtifacts = [...finalResults.values()].filter(
  (result) => result.ok,
).length;

console.log(
  JSON.stringify(
    {
      evaluatedAt: new Date().toISOString(),
      syntheticDataOnly: true,
      mode: optionalOnly ? "optional-artifacts" : "full-package",
      pricingBasis: "OpenAI standard processing, USD per 1M tokens, 2026-08-09",
      results: sanitizedResults,
      packageGate,
      totalEstimatedCostUsd,
      successfulArtifacts,
      estimatedCostPerSuccessfulArtifactUsd: successfulArtifacts
        ? totalEstimatedCostUsd / successfulArtifacts
        : null,
    },
    null,
    2,
  ),
);
