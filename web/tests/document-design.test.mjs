import assert from "node:assert/strict";
import test from "node:test";

import { strToU8, zipSync } from "fflate";

import { analyzeDocxTemplate } from "../lib/docx-template-profile.ts";
import {
  decodeAndSanitizeSvg,
  readPngDimensions,
  sanitizeSvg,
} from "../lib/safe-svg.ts";
import { validateUploadedBytes } from "../lib/upload-security.ts";

function templateFixture({ risky = false, bodySize = 16 } = {}) {
  const contentTypes =
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>';
  const document =
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body><w:p><w:r><w:t>Fremder Referenztext</w:t></w:r></w:p>' +
    (risky ? '<w:sdt><w:sdtContent><w:tbl/></w:sdtContent></w:sdt><w:drawing/>' : "") +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="800" w:bottom="720" w:left="800"/></w:sectPr>' +
    '</w:body></w:document>';
  const styles =
    '<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="${bodySize}"/></w:rPr></w:rPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Standard"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="80" w:line="240"/></w:pPr><w:rPr><w:sz w:val="${bodySize}"/><w:color w:val="202020"/></w:rPr></w:style>` +
    '<w:style w:type="paragraph" w:styleId="Titel"><w:name w:val="Titel"/><w:rPr><w:rFonts w:asciiTheme="majorHAnsi"/><w:sz w:val="48"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="berschrift1"><w:name w:val="heading 1"/><w:pPr><w:spacing w:before="140" w:after="60"/></w:pPr><w:rPr><w:rFonts w:asciiTheme="majorHAnsi"/><w:sz w:val="28"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="berschrift2"><w:name w:val="heading 2"/><w:rPr><w:sz w:val="22"/></w:rPr></w:style>' +
    '</w:styles>';
  const theme =
    '<?xml version="1.0"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements>' +
    '<a:clrScheme><a:dk1><a:srgbClr val="202020"/></a:dk1><a:dk2><a:srgbClr val="555555"/></a:dk2><a:accent2><a:srgbClr val="ED7D31"/></a:accent2></a:clrScheme>' +
    '<a:fontScheme><a:majorFont><a:latin typeface="Georgia Pro"/></a:majorFont><a:minorFont><a:latin typeface="Gill Sans Nova Light"/></a:minorFont></a:fontScheme>' +
    '</a:themeElements></a:theme>';
  return zipSync({
    "[Content_Types].xml": strToU8(contentTypes),
    "word/document.xml": strToU8(document),
    "word/styles.xml": strToU8(styles),
    "word/settings.xml": strToU8('<?xml version="1.0"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>'),
    "word/theme/theme1.xml": strToU8(theme),
    "word/_rels/document.xml.rels": strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'),
  });
}

function pngHeader(width = 1200, height = 800) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes.set([73, 72, 68, 82], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

test("leitet aus lokalisierten DOCX-Stilen nur ein sicheres Profil ab", async () => {
  const analysis = await analyzeDocxTemplate(
    templateFixture({ risky: true, bodySize: 16 }),
    "Orange Vorlage.docx",
  );

  assert.equal(analysis.status, "adapted");
  assert.equal(analysis.profile.fonts.body, "Gill Sans Nova Light");
  assert.equal(analysis.profile.fonts.title, "Georgia Pro");
  assert.equal(analysis.profile.colors.accent, "ED7D31");
  assert.equal(analysis.profile.sizes.body, 18, "Mindestgröße bleibt 9 pt");
  assert.match(analysis.warnings.join(" "), /Inhaltssteuerelemente/);
  assert.match(analysis.warnings.join(" "), /Layouttabellen/);
  assert.match(analysis.warnings.join(" "), /Zeichnungen/);
  assert.doesNotMatch(JSON.stringify(analysis.profile), /Fremder Referenztext/);
});

test("blockiert beschädigte und falsch benannte DOCX-Vorlagen", async () => {
  const corrupt = await analyzeDocxTemplate(strToU8("kein zip"), "kaputt.docx");
  const dotx = await analyzeDocxTemplate(templateFixture(), "vorlage.dotx");

  assert.equal(corrupt.status, "blocked");
  assert.equal(dotx.status, "blocked");
});

test("bereinigt statisches SVG und akzeptiert interne Fragmentverweise", () => {
  const safe = sanitizeSvg(`<?xml version="1.0"?>
    <!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="720pt" height="360pt" viewBox="0 0 720 360">
      <metadata>Erstellername</metadata><!-- intern --><defs><path id="bar" d="M0 0h10v10z"/></defs><use xlink:href="#bar"/>
    </svg>`);

  assert.equal(safe.width, 960);
  assert.equal(safe.height, 480);
  assert.doesNotMatch(safe.svg, /DOCTYPE|metadata|Erstellername|<!--/i);
  assert.match(safe.svg, /xlink:href="#bar"/);
});

test("weist aktive, externe und als SVG getarnte HTML-Inhalte ab", () => {
  assert.throws(
    () => sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>'),
    /Aktive SVG-Inhalte/,
  );
  assert.throws(
    () => sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><image href="https://example.test/x.png"/></svg>'),
    /Externe SVG-Ressourcen/,
  );
  assert.throws(() => sanitizeSvg("<html><svg></svg></html>"), /kein eigenständiges SVG/);
});

test("prüft PNG-Signatur und Upload-Inhalt unabhängig von der Dateiendung", async () => {
  const png = pngHeader();
  assert.deepEqual(readPngDimensions(png), { width: 1200, height: 800 });
  assert.equal((await validateUploadedBytes("skills.png", "image/png", png)).ok, true);
  assert.equal(
    (await validateUploadedBytes("skills.svg", "image/svg+xml", strToU8("<html>nein</html>"))).ok,
    false,
  );
  assert.equal(
    (await validateUploadedBytes("kaputt.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", strToU8("kaputt"))).ok,
    false,
  );
});

test("dekodiert SVG ausschließlich als gültiges UTF-8", () => {
  assert.throws(() => decodeAndSanitizeSvg(new Uint8Array([0xff, 0xfe, 0x00])), /UTF-8/);
});
