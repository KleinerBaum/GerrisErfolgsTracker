import assert from "node:assert/strict";
import test from "node:test";

import { normalizeApplicationGenerationPreferences } from "../lib/application-workflow.ts";
import {
  applicationMaxOutputTokens,
  DEFAULT_APPLICATION_MODEL_SETTINGS,
  LLM_MODEL_IDS,
  strictApplicationModelSettings,
  WEB_LLM_PURPOSE_CONFIGS,
} from "../lib/llm-config.ts";

test("bildet Luna, Terra und Sol ausschließlich auf die aktuellen Modell-IDs ab", () => {
  assert.deepEqual(LLM_MODEL_IDS, {
    luna: "gpt-5.6-luna",
    terra: "gpt-5.6-terra",
    sol: "gpt-5.6-sol",
  });
  assert.equal(WEB_LLM_PURPOSE_CONFIGS.vacancy_research.model, LLM_MODEL_IDS.luna);
  assert.equal(WEB_LLM_PURPOSE_CONFIGS.email_draft.effort, "low");
  assert.equal(WEB_LLM_PURPOSE_CONFIGS.journal_analysis.effort, "medium");
  assert.equal(WEB_LLM_PURPOSE_CONFIGS.gamification_assessment.effort, "none");
});

test("ergänzt alte Bewerbungen um dokumentbezogene kostenorientierte Presets", () => {
  const normalized = normalizeApplicationGenerationPreferences({
    outputKinds: ["tailored-cv", "cover-letter"],
  });
  assert.deepEqual(normalized.modelSettings, DEFAULT_APPLICATION_MODEL_SETTINGS);
  assert.deepEqual(normalized.modelSettings["tailored-cv"], {
    model: "terra",
    effort: "medium",
  });
  assert.deepEqual(normalized.modelSettings["application-email"], {
    model: "luna",
    effort: "low",
  });
});

test("akzeptiert eine vollständige sichtbare Modellkonfiguration bis sehr hoch", () => {
  const candidate = structuredClone(DEFAULT_APPLICATION_MODEL_SETTINGS);
  candidate["cover-letter"] = { model: "sol", effort: "xhigh" };
  assert.deepEqual(strictApplicationModelSettings(candidate), candidate);
  assert.equal(
    applicationMaxOutputTokens("cover-letter", "xhigh"),
    8_000,
  );
});

test("weist unbekannte Modelle, max, Tokenlimits und unvollständige Maps ab", () => {
  const cases = [];
  const unknownModel = structuredClone(DEFAULT_APPLICATION_MODEL_SETTINGS);
  unknownModel["tailored-cv"].model = "gpt-5.6";
  cases.push(unknownModel);

  const maxEffort = structuredClone(DEFAULT_APPLICATION_MODEL_SETTINGS);
  maxEffort["cover-letter"].effort = "max";
  cases.push(maxEffort);

  const browserTokenLimit = structuredClone(DEFAULT_APPLICATION_MODEL_SETTINGS);
  browserTokenLimit["application-email"].maxOutputTokens = 999_999;
  cases.push(browserTokenLimit);

  const missing = structuredClone(DEFAULT_APPLICATION_MODEL_SETTINGS);
  delete missing["company-brief"];
  cases.push(missing);

  for (const candidate of cases) {
    assert.throws(() => strictApplicationModelSettings(candidate));
  }
});
