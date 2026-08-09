import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { createEditableDocx } from "../lib/docx-export.ts";
import {
  makeValidDraft,
  masterCvFixture,
} from "../tests/fixtures/application-fixtures.mjs";

const outputDirectory = process.argv[2];
if (!outputDirectory) {
  throw new Error("Ausgabeverzeichnis fehlt.");
}

mkdirSync(outputDirectory, { recursive: true });
const draft = makeValidDraft();
const artifacts = [
  ["cv.docx", draft.tailoredCv, "tailored-cv"],
  ["anschreiben.docx", draft.coverLetter, "cover-letter"],
  ["unternehmensbriefing.docx", draft.companyBrief, "company-brief"],
  ["interviewvorbereitung.docx", draft.interviewPrep, "interview-prep"],
];
const presets = [
  "gerris",
  "modern-stylish",
  "professional-stylish",
  "conservative-chic",
];

for (const presetId of presets) {
  const presetDirectory = resolve(outputDirectory, presetId);
  mkdirSync(presetDirectory, { recursive: true });
  for (const [name, content, kind] of artifacts) {
    writeFileSync(
      resolve(presetDirectory, name),
      createEditableDocx(content, kind, masterCvFixture.links, { presetId }),
    );
  }
}
