import assert from "node:assert/strict";
import test from "node:test";

import { strFromU8, strToU8, unzipSync } from "fflate";

import {
  createEditableDocx,
  resolveVisualizationPlacements,
} from "../lib/docx-export.ts";
import {
  makeValidDraft,
  masterCvFixture,
} from "./fixtures/application-fixtures.mjs";

const SAFE_PARTS = new Set([
  "[Content_Types].xml",
  "_rels/.rels",
  "docProps/core.xml",
  "docProps/app.xml",
  "word/document.xml",
  "word/styles.xml",
  "word/settings.xml",
  "word/fontTable.xml",
  "word/numbering.xml",
  "word/header1.xml",
  "word/footer1.xml",
  "word/_rels/document.xml.rels",
]);

function archiveFor(content, kind) {
  return unzipSync(
    createEditableDocx(content, kind, masterCvFixture.links),
  );
}

function textPart(archive, name) {
  assert.ok(archive[name], "DOCX-Part fehlt: " + name);
  return strFromU8(archive[name]);
}

function assertSafePackage(archive) {
  assert.deepEqual(new Set(Object.keys(archive)), SAFE_PARTS);
  const document = textPart(archive, "word/document.xml");
  const styles = textPart(archive, "word/styles.xml");
  const core = textPart(archive, "docProps/core.xml");
  const settings = textPart(archive, "word/settings.xml");
  const combined = Object.values(archive)
    .filter((value) => value instanceof Uint8Array)
    .map((value) => {
      try {
        return strFromU8(value);
      } catch {
        return "";
      }
    })
    .join("\n");

  assert.match(document, /w:pgSz w:w="11906" w:h="16838"/);
  assert.doesNotMatch(
    combined,
    /w:txbxContent|w:altChunk|w:commentRangeStart|w:commentReference|w:ins\b|w:del\b|w:vanish|[\uE000-\uF8FF]/,
  );
  assert.doesNotMatch(core, /dc:creator|cp:lastModifiedBy/);
  assert.doesNotMatch(settings, /trackRevisions|doNotTrackMoves/);
  assert.match(
    settings,
    /w:name="compatibilityMode"[^>]+w:val="15"/,
  );
  const fontSizes = [
    ...styles.matchAll(/<w:sz(?:Cs)?\s+w:val="(\d+)"/g),
  ].map((match) => Number(match[1]));
  assert.ok(fontSizes.length > 0);
  assert.ok(fontSizes.every((size) => size >= 18));
}

test("erzeugt einen ATS-sicheren zweiseitigen CV mit A4, Seitenfeldern und Links", () => {
  const draft = makeValidDraft();
  const archive = archiveFor(draft.tailoredCv, "tailored-cv");
  const document = textPart(archive, "word/document.xml");
  const styles = textPart(archive, "word/styles.xml");
  const footer = textPart(archive, "word/footer1.xml");
  const header = textPart(archive, "word/header1.xml");
  const relationships = textPart(
    archive,
    "word/_rels/document.xml.rels",
  );

  assertSafePackage(archive);
  assert.match(document, /w:pStyle w:val="Kicker"/);
  assert.match(document, /w:pStyle w:val="Bullet"/);
  assert.match(document, /<w:numPr><w:ilvl w:val="0"\/><w:numId w:val="1"\/><\/w:numPr>/);
  assert.doesNotMatch(document, />•<\/w:t>/);
  assert.match(
    textPart(archive, "word/numbering.xml"),
    /<w:numFmt w:val="bullet"\/>[\s\S]*<w:lvlText w:val="•"\/>/,
  );
  assert.match(document, /<w:pageBreakBefore\/>/);
  assert.match(document, /<w:hyperlink r:id="rId\d+">/);
  assert.match(relationships, /Target="mailto:alex@example\.test"/);
  assert.match(
    relationships,
    /Target="https:\/\/portfolio\.example\.test\/"/,
  );
  assert.doesNotMatch(relationships, /Target="tel:/);
  assert.match(styles, /w:styleId="Title"[\s\S]*w:sz w:val="42"/);
  assert.match(header, /FOKUSSIERTER LEBENSLAUF/);
  assert.match(footer, /w:instr=" PAGE "/);
  assert.match(footer, /w:instr=" NUMPAGES "/);
});

test("verwendet für Briefing und Interviewmappe eigene Layoutsysteme", () => {
  const draft = makeValidDraft();
  const cases = [
    [
      "company-brief",
      draft.companyBrief,
      "ROLLENBRIEFING",
      'w:sz w:val="36"',
    ],
    [
      "interview-prep",
      draft.interviewPrep,
      "INTERVIEWMAPPE",
      'w:sz w:val="38"',
    ],
  ];

  for (const [kind, content, label, titleSize] of cases) {
    const archive = archiveFor(content, kind);
    assertSafePackage(archive);
    assert.match(textPart(archive, "word/header1.xml"), new RegExp(label));
    assert.match(textPart(archive, "word/styles.xml"), new RegExp(titleSize));
  }

  const coverStyles = textPart(
    archiveFor(draft.coverLetter, "cover-letter"),
    "word/styles.xml",
  );
  const cvStyles = textPart(
    archiveFor(draft.tailoredCv, "tailored-cv"),
    "word/styles.xml",
  );
  const briefStyles = textPart(
    archiveFor(draft.companyBrief, "company-brief"),
    "word/styles.xml",
  );
  assert.match(coverStyles, /w:styleId="Normal"[\s\S]*w:sz w:val="20"/);
  assert.match(cvStyles, /w:styleId="Normal"[\s\S]*w:sz w:val="(?:18|19|20)"/);
  assert.match(briefStyles, /w:styleId="Normal"[\s\S]*w:sz w:val="18"/);
});

test("setzt das Anschreiben als zurückhaltenden DIN-5008-Geschäftsbrief ohne Marketingkopf", () => {
  const draft = makeValidDraft();
  const archive = archiveFor(draft.coverLetter, "cover-letter");
  const document = textPart(archive, "word/document.xml");
  const styles = textPart(archive, "word/styles.xml");
  const header = textPart(archive, "word/header1.xml");
  const footer = textPart(archive, "word/footer1.xml");

  assert.match(
    document,
    /w:pgMar w:top="850" w:right="1134" w:bottom="1134" w:left="1417"/,
  );
  assert.match(document, /w:pStyle w:val="CoverSubject"/);
  assert.match(styles, /w:styleId="CoverSubject"[\s\S]*w:sz w:val="22"/);
  assert.doesNotMatch(header, /ANSCHREIBEN|BEWERBUNG/);
  assert.doesNotMatch(footer, /w:instr=" PAGE "|Stand/);
});

test("weist Carlito und Caladea in Styles, Nummerierung und Font-Tabelle vollständig zu", () => {
  const archive = archiveFor(makeValidDraft().tailoredCv, "tailored-cv");
  const styles = textPart(archive, "word/styles.xml");
  const numbering = textPart(archive, "word/numbering.xml");
  const fonts = textPart(archive, "word/fontTable.xml");

  assert.match(styles, /w:ascii="Carlito" w:hAnsi="Carlito" w:eastAsia="Carlito" w:cs="Carlito"/);
  assert.match(styles, /w:ascii="Caladea" w:hAnsi="Caladea" w:eastAsia="Caladea" w:cs="Caladea"/);
  assert.match(numbering, /w:ascii="Carlito" w:hAnsi="Carlito" w:eastAsia="Carlito" w:cs="Carlito"/);
  assert.match(fonts, /w:font w:name="Carlito"[\s\S]*w:altName w:val="Calibri"/);
  assert.match(fonts, /w:font w:name="Caladea"[\s\S]*w:altName w:val="Cambria"/);
  assert.doesNotMatch(styles, /w:ascii="Arial"/);
});

test("passt den zweiseitigen CV innerhalb der Mindestschrift an die Textmenge an", () => {
  const compact = archiveFor(
    "# Testprofil\n## PROFIL\n" + "Belegbarer Inhalt ".repeat(375),
    "tailored-cv",
  );
  const dense = archiveFor(
    "# Testprofil\n## PROFIL\n" + "Belegbarer Inhalt ".repeat(575),
    "tailored-cv",
  );

  assert.match(
    textPart(compact, "word/styles.xml"),
    /w:styleId="Normal"[\s\S]*w:sz w:val="20"/,
  );
  assert.match(
    textPart(dense, "word/styles.xml"),
    /w:styleId="Normal"[\s\S]*w:sz w:val="18"/,
  );
});

test("unterstützt sichere Telefonlinks als echte Word-Hyperlinks", () => {
  const archive = archiveFor(
    "# Kontakt\nTelefon: [0221 123456](tel:+49221123456)",
    "company-brief",
  );
  const relationships = textPart(
    archive,
    "word/_rels/document.xml.rels",
  );

  assert.match(relationships, /Target="tel:\+49221123456"/);
});

test("setzt Markdown-Quellen als echte externe Hyperlinks um", () => {
  const draft = makeValidDraft();
  const archive = archiveFor(draft.companyBrief, "company-brief");
  const document = textPart(archive, "word/document.xml");
  const relationships = textPart(
    archive,
    "word/_rels/document.xml.rels",
  );

  assert.match(document, />Offizielle Stellenanzeige<\/w:t>/);
  assert.match(document, /<w:hyperlink r:id="rId\d+">/);
  assert.match(
    relationships,
    /Type="[^"]+\/hyperlink" Target="https:\/\/example\.test\/job" TargetMode="External"/,
  );
  assert.doesNotMatch(document, /https:\/\/example\.test\/job<\/w:t>/);
});

test("enthält keine fremden Medien, Layouttabellen oder unsicheren OOXML-Bestandteile", () => {
  const draft = makeValidDraft();
  for (const [kind, content] of [
    ["tailored-cv", draft.tailoredCv],
    ["cover-letter", draft.coverLetter],
    ["company-brief", draft.companyBrief],
    ["interview-prep", draft.interviewPrep],
  ]) {
    const archive = archiveFor(content, kind);
    const document = textPart(archive, "word/document.xml");
    assertSafePackage(archive);
    assert.doesNotMatch(document, /<w:tbl\b|<v:shape\b|<w:drawing\b/);
    assert.equal(
      Object.keys(archive).some((name) =>
        /comments|people|customXml|custom\.xml|media\//i.test(name),
      ),
      false,
    );
  }
});

test("adaptiert nur sichere Stilwerte aus einer Vorlage und entfernt alle Referenzinhalte", () => {
  const draft = makeValidDraft();
  const archive = unzipSync(
    createEditableDocx(draft.tailoredCv, "tailored-cv", masterCvFixture.links, {
      templateProfile: {
        sourceName: "CV Formatvorlage von Itai Gerbi.docx",
        sourceFingerprint: "a".repeat(64),
        status: "adapted",
        warnings: ["Layouttabellen werden nicht übernommen."],
        page: {
          width: 11906,
          height: 16838,
          margins: { top: 851, right: 794, bottom: 964, left: 794 },
        },
        fonts: {
          body: "Gill Sans Nova Light",
          title: "Georgia Pro",
          heading: "Georgia Pro",
        },
        colors: {
          text: "000000",
          accent: "ED7D31",
          muted: "44546A",
          soft: "F7E9DF",
        },
        sizes: { body: 22, title: 64, heading1: 32, heading2: 28 },
        spacing: { bodyAfter: 40, bodyLine: 240, headingBefore: 120, headingAfter: 60 },
      },
    }),
  );
  const document = textPart(archive, "word/document.xml");
  const styles = textPart(archive, "word/styles.xml");
  const allText = Object.values(archive)
    .map((part) => {
      try {
        return strFromU8(part);
      } catch {
        return "";
      }
    })
    .join("\n");

  assert.match(document, /w:pgMar w:top="851" w:right="794" w:bottom="964" w:left="794"/);
  assert.match(styles, /w:ascii="Gill Sans Nova Light"/);
  assert.match(styles, /w:ascii="Georgia Pro"/);
  assert.match(styles, /w:color w:val="ED7D31"/);
  assert.match(styles, /w:styleId="Normal"[\s\S]*w:sz w:val="22"/);
  assert.doesNotMatch(allText, /Itai Gerbi|Layouttabellen werden nicht übernommen/);
  assert.equal(Object.keys(archive).some((name) => /customXml|comments|media\//i.test(name)), false);
});

test("bettet PNG und bereinigtes SVG ausschließlich inline, proportional und mit Alternativtext ein", () => {
  const png = new Uint8Array(24);
  png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  png.set([73, 72, 68, 82], 12);
  const view = new DataView(png.buffer);
  view.setUint32(16, 1477);
  view.setUint32(20, 2127);
  const content = [
    "# Gerrit Beispiel",
    "## Profil",
    "Belegtes Profil.",
    "## Technische Skills",
    "Belegte Skills.",
    "## Berufserfahrung",
    "Belegte Erfahrung.",
  ].join("\n");
  const archive = unzipSync(
    createEditableDocx(content, "tailored-cv", [], {
      media: [
        {
          id: "skills-1",
          title: "Technische Skills",
          altText: "Balkendiagramm mit belegten technischen Kompetenzen",
          placement: "after-skills",
          pngBytes: png,
          svgBytes: strToU8('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>'),
          width: 1477,
          height: 2127,
        },
      ],
    }),
  );
  const document = textPart(archive, "word/document.xml");
  const relationships = textPart(archive, "word/_rels/document.xml.rels");
  const contentTypes = textPart(archive, "[Content_Types].xml");

  assert.ok(archive["word/media/visual-1.png"]);
  assert.ok(archive["word/media/visual-1.svg"]);
  assert.match(contentTypes, /Extension="png" ContentType="image\/png"/);
  assert.match(contentTypes, /Extension="svg" ContentType="image\/svg\+xml"/);
  assert.match(document, /<wp:inline\b/);
  assert.doesNotMatch(document, /<wp:anchor\b/);
  assert.doesNotMatch(
    document,
    /<w:pageBreakBefore\/>/,
    "Visualisierungen erweitern den natürlichen Seitenfluss ohne zusätzlichen CV-Zwangsumbruch",
  );
  assert.match(document, /descr="Balkendiagramm mit belegten technischen Kompetenzen"/);
  assert.match(document, /<a:stretch><a:fillRect\/><\/a:stretch>/);
  assert.match(document, /asvg:svgBlip[^>]+r:embed="rId\d+"/);
  assert.match(relationships, /Target="media\/visual-1\.png"/);
  assert.match(relationships, /Target="media\/visual-1\.svg"/);
  assert.ok(
    document.indexOf("Belegte Skills.") < document.indexOf("<wp:inline"),
    "Visualisierung folgt dem Skills-Inhalt",
  );
  assert.ok(
    document.indexOf("<wp:inline") < document.indexOf("Berufserfahrung"),
    "Visualisierung steht vor der nächsten Sektion",
  );
  const extents = [...document.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)];
  assert.equal(extents.length, 1);
  assert.ok(Number(extents[0][1]) <= (11906 - 820 - 820) * 635);
  assert.ok(Number(extents[0][2]) <= (16838 - 650 - 650 - 720) * 635);
});

test("meldet semantische Platzierungs-Fallbacks sichtbar statt still zu raten", () => {
  const reports = resolveVisualizationPlacements(
    "# Anschreiben\nSehr geehrte Damen und Herren,\nText ohne Skillsektion.",
    [{ id: "visual-1", placement: "after-skills" }],
  );

  assert.equal(reports[0].resolvedPlacement, "end-fallback");
  assert.equal(reports[0].insertBeforeLine, 3);
  assert.match(reports[0].warning, /Skills.*fehlt.*am Ende/);
});
