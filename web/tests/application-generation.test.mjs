import assert from "node:assert/strict";
import test from "node:test";

import {
  ApplicationGenerationError,
  APPLICATION_MASTER_CV_MAX_BYTES,
  applicationMasterCvUploadIssue,
  applicationModelBudget,
  applicationModelInput,
  buildApplicationEvidenceRegister,
  generateApplicationPackageWithRepair,
} from "../lib/server/application-generation.ts";
import {
  generationRequestFixture,
  makeValidDraft,
} from "./fixtures/application-fixtures.mjs";

function invalidDraft() {
  const draft = makeValidDraft();
  draft.tailoredCv = "# Lebenslauf\n## PROFIL\nZu kurz.";
  draft.evidenceMap = draft.evidenceMap.filter(
    (mapping) => mapping.artifact !== "tailoredCv",
  );
  return draft;
}

function v3FromLegacy(legacy) {
  const blocks = (content) =>
    content
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => ({
        text,
        evidenceIds: ["CV-EV-1"],
        researchIds: [],
      }));
  return {
    schemaVersion: 3,
    roleTitle: legacy.roleTitle,
    companyName: legacy.companyName,
    tailoredCvBlocks: blocks(legacy.tailoredCv),
    coverLetterBlocks: blocks(legacy.coverLetter),
    interviewPrepBlocks: blocks(legacy.interviewPrep),
    fitHighlights: legacy.fitHighlights,
    openQuestions: legacy.openQuestions,
  };
}

test("API-Logik gibt einen erfolgreichen Erstentwurf ohne Reparatur frei", async () => {
  const calls = [];
  const result = await generateApplicationPackageWithRepair(
    generationRequestFixture(),
    async (input) => {
      calls.push(input);
      return makeValidDraft();
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].stage, "draft");
  assert.equal(result.status, "ready");
  assert.equal(result.qualityReport.attempt, 1);
});

test("API-Logik führt nach konkreter Fehlerliste genau eine erfolgreiche Reparatur aus", async () => {
  const calls = [];
  const queue = [invalidDraft(), makeValidDraft()];
  const result = await generateApplicationPackageWithRepair(
    generationRequestFixture(),
    async (input) => {
      calls.push(input);
      return queue.shift();
    },
  );

  assert.equal(calls.length, 2);
  assert.deepEqual(
    calls.map((call) => call.stage),
    ["draft", "repair"],
  );
  assert.ok(calls[1].issues.some((issue) => /Umfang/.test(issue)));
  assert.match(calls[1].prompt, /FEHLERCODES/);
  assert.equal(result.status, "ready");
  assert.equal(result.qualityReport.attempt, 2);
});

test("API-Logik liefert nach endgültigem Qualitätsversagen 422 und stoppt", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      generateApplicationPackageWithRepair(
        generationRequestFixture(),
        async () => {
          calls += 1;
          return invalidDraft();
        },
      ),
    (error) => {
      assert.ok(error instanceof ApplicationGenerationError);
      assert.equal(error.status, 422);
      assert.ok(error.issues.some((issue) => /Umfang/.test(issue)));
      return true;
    },
  );
  assert.equal(calls, 2);
});

test("API-Logik liefert bei nicht erreichbarer KI 503 statt Offline-Paket", async () => {
  await assert.rejects(
    () =>
      generateApplicationPackageWithRepair(
        generationRequestFixture(),
        async () => {
          throw new Error("OPENAI_API_KEY fehlt");
        },
      ),
    (error) => {
      assert.ok(error instanceof ApplicationGenerationError);
      assert.equal(error.status, 503);
      return true;
    },
  );
});

test("API-Logik liefert bei fehlendem Master-CV 400", async () => {
  const request = generationRequestFixture();
  request.masterCv = null;

  await assert.rejects(
    () =>
      generateApplicationPackageWithRepair(request, async () => makeValidDraft()),
    (error) => {
      assert.ok(error instanceof ApplicationGenerationError);
      assert.equal(error.status, 400);
      return true;
    },
  );
});

test("verlangt für jeden Auftrag eine gültige DOCX-Datei bis 16 MB", () => {
  assert.match(applicationMasterCvUploadIssue(null), /neu ausgewählter Master-CV/);
  assert.match(
    applicationMasterCvUploadIssue({ name: "master-cv.pdf", size: 2_000 }),
    /DOCX-Format/,
  );
  assert.match(
    applicationMasterCvUploadIssue({
      name: "master-cv.docx",
      size: APPLICATION_MASTER_CV_MAX_BYTES + 1,
    }),
    /höchstens 16 MB/,
  );
  assert.equal(
    applicationMasterCvUploadIssue({
      name: "master-cv.docx",
      size: APPLICATION_MASTER_CV_MAX_BYTES,
    }),
    null,
  );
});

test("manuelle Änderungen benötigen genau einen erneuten KI-/Evidenzlauf", async () => {
  const request = generationRequestFixture();
  request.manualDraft = makeValidDraft();
  request.manualDraft.coverLetter = request.manualDraft.coverLetter.replace(
    "Kommunale Krisenfestigkeit",
    "Nachhaltige Krisenfestigkeit",
  );
  const calls = [];

  const result = await generateApplicationPackageWithRepair(
    request,
    async (input) => {
      calls.push(input);
      return makeValidDraft();
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].stage, "manual_review");
  assert.equal(result.status, "ready");
  assert.equal(result.qualityReport.attempt, 2);
});

test("V3 liefert Text nur in Blöcken und leitet Markdown sowie Evidence-Map lokal ab", async () => {
  const request = generationRequestFixture();
  request.preferences = {
    ...request.preferences,
    outputKinds: ["tailored-cv", "cover-letter"],
  };
  const modelOutput = v3FromLegacy(makeValidDraft());

  const result = await generateApplicationPackageWithRepair(
    request,
    async () => modelOutput,
  );

  assert.equal(result.schemaVersion, 3);
  assert.ok(result.blocks.tailoredCv.length > 20);
  assert.ok(result.blocks.coverLetter.length > 5);
  assert.match(result.tailoredCv, /^BEWERBUNGSFASSUNG/m);
  assert.ok(result.evidenceMap.length > 20);
  assert.equal(result.companyBrief, "");
  assert.equal(result.applicationEmailBody, "");
  assert.equal(result.interviewPrep, "");
});

test("übernimmt Unternehmen und Rolle bei einem Textauftrag aus dem strukturierten Entwurf", async () => {
  const request = generationRequestFixture();
  request.jobUrl = "";
  request.jobText = "Öffentlicher vollständiger Text der Stellenanzeige";
  request.companyName = "";
  request.roleTitle = "";
  request.preferences = {
    ...request.preferences,
    outputKinds: ["tailored-cv", "cover-letter"],
  };

  const result = await generateApplicationPackageWithRepair(
    request,
    async () => v3FromLegacy(makeValidDraft()),
  );

  assert.equal(result.companyName, "Beispielstadt");
  assert.equal(
    result.roleTitle,
    "Sachbearbeitung Krisen- und Kontinuitätsmanagement",
  );
});

test("erzeugt Briefing und Bewerbungs-Mail lokal und Interview nur auf ausdrückliche Auswahl", async () => {
  const request = generationRequestFixture();
  const result = await generateApplicationPackageWithRepair(
    request,
    async () => v3FromLegacy(makeValidDraft()),
  );

  assert.match(result.companyBrief, /## Bestätigte Fakten/);
  assert.match(result.companyBrief, /## Quellen/);
  assert.match(result.applicationEmailSubject, /Bewerbung als/);
  assert.match(result.applicationEmailBody, /Mit freundlichen Grüßen/);
  assert.match(result.interviewPrep, /## KERNBOTSCHAFT/);
});

test("dedupliziert das Master-CV-Evidenzregister und sendet keine zweite Abschnittskopie", () => {
  const request = generationRequestFixture();
  const duplicated = request.masterCv.sections[0].content;
  request.masterCv.passport.evidence.push({
    ...request.masterCv.passport.evidence[0],
    evidenceId: "CV-DUPLICATE",
    claim: duplicated,
    safeWording: duplicated,
  });

  const register = buildApplicationEvidenceRegister(request.masterCv);
  assert.equal(register.filter((item) => item.text === duplicated).length, 1);
  const prompt = applicationModelInput(request, "draft").prompt;
  assert.doesNotMatch(prompt, /"sections"/);
  assert.doesNotMatch(prompt, /"safeWording"/);
  assert.match(prompt, /"evidence"/);
});

test("überträgt im Reparaturlauf nur das mangelhafte Artefakt", () => {
  const request = generationRequestFixture();
  const draft = invalidDraft();
  const input = applicationModelInput(request, "repair", draft, [
    "tailored-cv: Umfang 4 Wörter; erlaubt sind 750–1.150",
  ]);

  assert.match(input.prompt, /"tailoredCv":/);
  assert.doesNotMatch(input.prompt, /"coverLetter":/);
  assert.doesNotMatch(input.prompt, /"companyBrief":/);
});

test("hält Modellrouting und repräsentatives Eingabebudget schlank", () => {
  const request = generationRequestFixture();
  const draft = applicationModelBudget("draft");
  const repair = applicationModelBudget("repair");
  const prompt = applicationModelInput(request, "draft").prompt;

  assert.equal(draft.defaultModel, "gpt-5.6-terra");
  assert.equal(draft.reasoningEffort, "low");
  assert.equal(draft.maxOutputTokens, 7_000);
  assert.equal(repair.defaultModel, "gpt-5.6-terra");
  assert.equal(repair.reasoningEffort, "medium");
  assert.equal(repair.maxOutputTokens, 3_000);
  assert.ok(
    Math.ceil(prompt.length / 4) < 12_000,
    "Der repräsentative Prompt bleibt unter 12.000 geschätzten Eingabetokens.",
  );
});
