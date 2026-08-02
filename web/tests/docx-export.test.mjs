import assert from "node:assert/strict";
import test from "node:test";

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import {
  createEditableDocx,
  createTemplateBackedDocx,
} from "../lib/docx-export.ts";

const content = `BEWERBUNGSFASSUNG | ZIELROLLE: Projektmanager
# Gerrit Fabisch
Business Transformation & AI Solutions
Projekt- und Prozessmanagement | Stakeholder-Steuerung
Düsseldorf | gerrit@example.test

## PROFIL
Belegbares Profil für digitale Geschäftsprozesse, Projekte und verlässliche Umsetzung.

## BERUFSERFAHRUNG
**01/2023 - heute**
### Projekt- und Prozessberater
*Cognitive Staffing | Düsseldorf*
MANDAT & KONTEXT: Verbindung aus Analyse, Stakeholder-Management und Umsetzung.
- PROJEKT & PROZESS: Anforderungen priorisiert, Risiken transparent gemacht und nächste Entscheidungen strukturiert.
- PEOPLE & ENABLEMENT: Komplexe Inhalte für unterschiedliche Beteiligte verständlich vermittelt.`;

test("erstellt ein eigenständiges, formatiertes und portables Word-Dokument", () => {
  const archive = unzipSync(createEditableDocx(content));
  const document = strFromU8(archive["word/document.xml"]);
  const styles = strFromU8(archive["word/styles.xml"]);
  const footer = strFromU8(archive["word/footer1.xml"]);
  const header = strFromU8(archive["word/header1.xml"]);
  const core = strFromU8(archive["docProps/core.xml"]);

  assert.match(document, /w:pStyle w:val="CVKicker"/);
  assert.match(document, /w:pStyle w:val="CVBullet"/);
  assert.match(document, />•<\/w:t>/);
  assert.match(document, /w:pgSz w:w="11906" w:h="16838"/);
  assert.match(styles, /w:styleId="CVProof"/);
  assert.doesNotMatch(styles, /w:sz(?:Cs)? w:val="(?:[0-9]|1[0-7])"/);
  assert.match(footer, /w:instr=" PAGE "/);
  assert.match(footer, /w:instr=" NUMPAGES "/);
  assert.doesNotMatch(header, /GERRIS KOMPASS/);
  assert.doesNotMatch(core, /dc:creator|cp:lastModifiedBy/);
  assert.doesNotMatch(document, /[\uE000-\uF8FF]/);
});

function templateFixture() {
  const styleIds = [
    "Title",
    "Subtitle",
    "Heading1",
    "Heading2",
    "CVKicker",
    "CVTagline",
    "CVContact",
    "CVDate",
    "CVCompany",
    "CVSmall",
    "CVBullet",
    "CVProof",
  ];
  const styles = `<?xml version="1.0" encoding="UTF-8"?>
    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      ${styleIds
        .map(
          (styleId) =>
            `<w:style w:type="paragraph" w:styleId="${styleId}"><w:name w:val="${styleId}"/><w:rPr><w:sz w:val="15"/><w:szCs w:val="15"/></w:rPr></w:style>`,
        )
        .join("")}
    </w:styles>`;
  const document = `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:r><w:t>ALTER MASTER-INHALT</w:t></w:r></w:p><w:sectPr><w:headerReference w:type="first" r:id="rId9"/><w:headerReference w:type="default" r:id="rId10"/><w:footerReference w:type="default" r:id="rId11"/><w:footerReference w:type="first" r:id="rId12"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="850" w:bottom="794" w:left="850" w:header="227" w:footer="397"/><w:titlePg/></w:sectPr></w:body></w:document>`;
  const relationships = `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header2.xml"/><Relationship Id="rId11" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="rId12" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer2.xml"/><Relationship Id="rId20" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="tel:+491234" TargetMode="External"/></Relationships>`;
  const footer = `<?xml version="1.0" encoding="UTF-8"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:rPr><w:sz w:val="15"/></w:rPr><w:t>Gerrit Fabisch | Master-Langfassung | Stand 08/2026</w:t></w:r></w:p></w:ftr>`;
  const header = `<?xml version="1.0" encoding="UTF-8"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:rPr><w:sz w:val="14"/></w:rPr><w:t>GERRIT FABISCH</w:t></w:r></w:p></w:hdr>`;
  return zipSync({
    "word/document.xml": strToU8(document),
    "word/styles.xml": strToU8(styles),
    "word/stylesWithEffects.xml": strToU8(styles),
    "word/settings.xml": strToU8(
      '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>',
    ),
    "word/_rels/document.xml.rels": strToU8(relationships),
    "word/header1.xml": strToU8(header),
    "word/header2.xml": strToU8(header),
    "word/footer1.xml": strToU8(footer),
    "word/footer2.xml": strToU8(footer),
    "word/media/image1.png": new Uint8Array([1, 2, 3, 4]),
    "docProps/core.xml": strToU8("<old-metadata/>"),
  });
}

test("übernimmt das sichere visuelle System des Master-CV ohne alten Inhalt", () => {
  const archive = unzipSync(createTemplateBackedDocx(content, templateFixture()));
  const document = strFromU8(archive["word/document.xml"]);
  const styles = strFromU8(archive["word/styles.xml"]);
  const footer = strFromU8(archive["word/footer1.xml"]);
  const header = strFromU8(archive["word/header1.xml"]);
  const relationships = strFromU8(archive["word/_rels/document.xml.rels"]);
  const core = strFromU8(archive["docProps/core.xml"]);
  const settings = strFromU8(archive["word/settings.xml"]);

  assert.match(document, /Projekt- und Prozessberater/);
  assert.doesNotMatch(document, /ALTER MASTER-INHALT/);
  assert.match(document, /w:headerReference w:type="first" r:id="rId9"/);
  assert.match(footer, /Bewerbungsfassung/);
  assert.doesNotMatch(footer, /Master-Langfassung/);
  assert.doesNotMatch(relationships, /hyperlink|tel:\+491234/);
  assert.doesNotMatch(styles, /w:sz(?:Cs)? w:val="(?:[0-9]|1[0-7])"/);
  assert.doesNotMatch(header, /w:sz w:val="14"/);
  assert.deepEqual(archive["word/media/image1.png"], new Uint8Array([1, 2, 3, 4]));
  assert.doesNotMatch(core, /dc:creator|cp:lastModifiedBy/);
  assert.match(settings, /<w:updateFields w:val="true"\/>/);
});
