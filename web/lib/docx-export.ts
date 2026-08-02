import { strToU8, zipSync } from "fflate";

const CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function paragraph(line: string): string {
  const heading = /^(#{1,3})\s+(.+)$/.exec(line);
  const bullet = /^\s*(?:[-*]|•)\s+(.+)$/.exec(line);
  const style = heading
    ? `<w:pStyle w:val="Heading${heading[1].length}"/>`
    : bullet
      ? '<w:pStyle w:val="ListParagraph"/>'
      : "";
  const value = heading?.[2] ?? (bullet ? `• ${bullet[1]}` : line);
  if (!value) return "<w:p/>";
  return `<w:p><w:pPr>${style}</w:pPr><w:r><w:t xml:space="preserve">${xml(value)}</w:t></w:r></w:p>`;
}

export function createEditableDocx(content: string): Uint8Array {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${content.replace(/\r\n?/g, "\n").split("\n").map(paragraph).join("\n")}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="21"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:color w:val="1C6F61"/><w:sz w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="24594F"/><w:sz w:val="26"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:rPr><w:b/><w:sz w:val="23"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360" w:hanging="180"/></w:pPr></w:style>
</w:styles>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  return zipSync(
    {
      "[Content_Types].xml": strToU8(contentTypes),
      "_rels/.rels": strToU8(rootRels),
      "word/document.xml": strToU8(documentXml),
      "word/styles.xml": strToU8(stylesXml),
      "word/_rels/document.xml.rels": strToU8(documentRels),
    },
    { level: 6 },
  );
}

export function downloadEditableDocx(fileName: string, content: string): void {
  const bytes = createEditableDocx(content);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const url = URL.createObjectURL(new Blob([buffer], { type: CONTENT_TYPE }));
  const link = document.createElement("a");
  link.href = url;
  const safeName = fileName.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 180);
  link.download = safeName.toLowerCase().endsWith(".docx")
    ? safeName
    : `${safeName}.docx`;
  link.click();
  URL.revokeObjectURL(url);
}
