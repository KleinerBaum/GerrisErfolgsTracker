import type {
  ApplicationGenerationPreferences,
  ApplicationOutputKind,
  MasterCvContent,
  MasterCvSection,
} from "./types";

export type ApplicationArtifactKey =
  | "coverLetter"
  | "tailoredCv"
  | "companyBrief"
  | "interviewPrep"
  | "applicationEmailBody";

export type ApplicationEvidenceReference = {
  artifact: ApplicationArtifactKey;
  claim: string;
  evidenceIds: string[];
  researchClaimIds: string[];
};

export type ApplicationContentBlock = {
  text: string;
  evidenceIds: string[];
  researchIds: string[];
};

export type ApplicationPackageBlocks = {
  tailoredCv: ApplicationContentBlock[];
  coverLetter: ApplicationContentBlock[];
  interviewPrep: ApplicationContentBlock[];
};

export type ApplicationQualityMetrics = {
  wordCounts: Record<ApplicationArtifactKey, number>;
  mappedClaims: number;
  validMappedClaims: number;
  substantiveClaims: number;
  coveredSubstantiveClaims: number;
  evidenceCoveragePercent: number;
  expectedExperienceEntries: number;
  coveredExperienceEntries: number;
};

export type ApplicationQualityReport = {
  status: "ready" | "needs_review" | "rejected";
  attempt: 1 | 2;
  checkedAt: string;
  issues: string[];
  metrics: ApplicationQualityMetrics;
};

export type GeneratedApplicationPackage = {
  roleTitle: string;
  companyName: string;
  coverLetter: string;
  tailoredCv: string;
  companyBrief: string;
  interviewPrep: string;
  applicationEmailSubject: string;
  applicationEmailBody: string;
  fitHighlights: string[];
  openQuestions: string[];
  sources: string[];
  evidenceMap: ApplicationEvidenceReference[];
};

export type ApplicationPackage = GeneratedApplicationPackage & {
  status: "ready" | "needs_review";
  qualityReport: ApplicationQualityReport;
};

/**
 * Öffentlicher V3-Vertrag. Die Markdown-Felder bleiben als lokaler
 * Kompatibilitäts-/Exportadapter erhalten; das Modell liefert den Text nur in
 * den evidenzgebundenen Blöcken.
 */
export type ApplicationPackageV3 = ApplicationPackage & {
  schemaVersion: 3;
  blocks: ApplicationPackageBlocks;
};

export type ApplicationPackageQualityContext = {
  masterCv?: MasterCvContent | null;
  validEvidenceIds?: Iterable<string>;
  validResearchClaimIds?: Iterable<string>;
  allowedSources?: Iterable<string>;
};

const ARTIFACT_BY_OUTPUT: Record<ApplicationOutputKind, ApplicationArtifactKey> = {
  "tailored-cv": "tailoredCv",
  "cover-letter": "coverLetter",
  "company-brief": "companyBrief",
  "interview-prep": "interviewPrep",
  "application-email": "applicationEmailBody",
};

const PLACEHOLDER =
  /\[(?:[^\]]*(?:hier|original-cv|hochgeladenen cv|übernehmen|ergänzen|vorbereiten|belegbar|stationen|platzhalter|todo)[^\]]*)\]/i;
const INTERNAL_REFERENCE = /\[(?:CV|JOB|USR|USER|EVIDENZ|RESEARCH)[-_][^\]]+\]/i;
const VISIBLE_TRUNCATION = /…|\.{3}/;
const INTERNAL_ASSESSMENT =
  /\b(?:passung|fit)\s*\d+(?:[.,]\d+)?\s*(?:\/|von)\s*10\b|\b(?:hürde|recherchelabel|interne bewertung)\s*:/i;
const RESEARCH_DUMP_LABEL = /^(?:aufgaben|themen|fachlich|hr)\s*:/im;
const EMPLOYER_TERM_LABEL =
  /^\s*(?:[-*•]\s*)?(?:vertrag|arbeitszeit|arbeitsmodell|remote(?:-anteil)?|homeoffice|schichtmodell|berichtslinie|arbeitgeberleistungen)\s*:/im;
const GENERIC_COVER_OPENING =
  /^(?:hiermit bewerbe ich mich|mit großem interesse|ich bewerbe mich|ich möchte mich|i am applying|i am excited to apply)\b/i;
const GENERIC_APPLICATION_EMAIL =
  /(?:passen sehr gut zu meinem profil|gewünschten nächsten schritt|anbei übersende ich ihnen meine bewerbung)[\s\S]{0,220}(?:persönlichen gespräch freue ich mich)/i;
const GREETING_LINE =
  /^(?:sehr geehrt(?:e|er|en|es)|guten tag|hallo|dear)\b/i;
const EXPERIENCE_DATE =
  /^(?:\d{2}[./]\d{4}|\d{4})\s*[-–—]\s*(?:\d{2}[./]\d{4}|\d{4}|heute|aktuell|present)$/i;

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function wordCount(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = clean(value);
    const key = normalized.toLocaleLowerCase("de-DE");
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function visibleArtifacts(
  value: GeneratedApplicationPackage,
  outputKinds: ApplicationOutputKind[],
): Array<[ApplicationOutputKind, ApplicationArtifactKey, string]> {
  return outputKinds.map((kind) => {
    const artifact = ARTIFACT_BY_OUTPUT[kind];
    return [kind, artifact, value[artifact]];
  });
}

function normalizedMatch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9äöüß+#]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("de-DE");
}

function substantiveTokens(value: string): string[] {
  return normalizedMatch(value)
    .split(" ")
    .filter((token) => token.length >= 3);
}

function contentIncludesClaim(content: string, claim: string): boolean {
  const contentValue = normalizedMatch(content);
  const claimValue = normalizedMatch(claim);
  if (!claimValue) return false;
  if (contentValue.includes(claimValue)) return true;
  const tokens = substantiveTokens(claim);
  return (
    tokens.length >= 4 &&
    tokens.filter((token) => contentValue.includes(token)).length /
      tokens.length >=
      0.8
  );
}

function mappingCoversStatement(statement: string, claim: string): boolean {
  const statementValue = normalizedMatch(statement);
  const claimValue = normalizedMatch(claim);
  return (
    claimValue.length >= 20 &&
    (statementValue.includes(claimValue) || claimValue.includes(statementValue))
  );
}

function sectionLines(section: MasterCvSection): string[] {
  return section.content
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[•*-]\s*/, "").trim())
    .filter(Boolean);
}

export type MasterCvExperienceEntry = {
  date: string;
  title: string;
  sectionId: string;
};

export function masterCvExperienceEntries(
  masterCv: MasterCvContent | null | undefined,
): MasterCvExperienceEntry[] {
  if (!masterCv) return [];
  const result: MasterCvExperienceEntry[] = [];
  for (const section of masterCv.sections.filter(
    (candidate) => candidate.kind === "experience",
  )) {
    const lines = sectionLines(section);
    for (let index = 0; index < lines.length; index += 1) {
      if (!EXPERIENCE_DATE.test(lines[index])) continue;
      const title = lines
        .slice(index + 1)
        .find(
          (line) =>
            !EXPERIENCE_DATE.test(line) &&
            !/^MANDAT\s*&\s*KONTEXT:/i.test(line) &&
            !/^(?:PROJEKT|PEOPLE|DIGITAL|SALES|AI|BUSINESS|DELIVERY)\s*&?\s*[^:]*:/i.test(
              line,
            ),
        );
      if (title) {
        result.push({ date: lines[index], title, sectionId: section.id });
      }
    }
  }
  return result;
}

function experienceCovered(content: string, entry: MasterCvExperienceEntry): boolean {
  const normalizedContent = normalizedMatch(content);
  const titleTokens = substantiveTokens(entry.title).slice(0, 7);
  const titleMatch =
    titleTokens.length > 0 &&
    titleTokens.filter((token) => normalizedContent.includes(token)).length /
      titleTokens.length >=
      0.75;
  const normalizedDate = normalizedMatch(entry.date);
  return titleMatch && normalizedContent.includes(normalizedDate);
}

function firstNarrativeParagraph(value: string): string {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  let greetingSeen = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || /^#/.test(line)) continue;
    if (
      GREETING_LINE.test(line) ||
      /^(?:mit freundlichen grüßen|freundliche grüße|kind regards)\b/i.test(line)
    ) {
      greetingSeen = true;
      continue;
    }
    if (!greetingSeen && /^(?:bewerbung|betreff|an:|von:)/i.test(line)) continue;
    if (line.split(/\s+/).length >= 8) return line;
  }
  return "";
}

function greetingIssue(value: string): string | null {
  const greeting = value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => GREETING_LINE.test(line));
  if (!greeting) return "Anrede fehlt";
  if (!greeting.endsWith(",")) return "Anrede endet nicht mit Komma";
  if (
    /^Sehr geehrter\s+(?:Frau|Damen)\b/i.test(greeting) ||
    /^Sehr geehrte\s+(?:Herr|Herrn)\b/i.test(greeting) ||
    /^Sehr geehrten\b/i.test(greeting) ||
    /^Sehr geehrte Damen und Herr(?:\s|,|$)/i.test(greeting)
  ) {
    return "Anrede ist grammatisch fehlerhaft";
  }
  if (/\b(?:fachlich|hr|aufgaben|themen|passung)\s*:/i.test(greeting)) {
    return "Anrede enthält interne Recherchelabels";
  }
  if (/^Guten Tag,$/i.test(greeting)) {
    return "unpersönliche Anrede 'Guten Tag,' ist nicht versandfertig";
  }
  return null;
}

function duplicatePunctuation(value: string): boolean {
  const withoutUrls = value.replace(/https?:\/\/\S+/g, "");
  return /([!?;,])\1|\.\.|,\s*,/.test(withoutUrls);
}

function sectionPresent(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function artifactSection(
  value: string,
  heading: RegExp,
  nextHeading = /^##\s+/m,
): string {
  const normalized = value.replace(/\r\n?/g, "\n");
  const match = heading.exec(normalized);
  if (!match || match.index < 0) return "";
  const afterStart = match.index + match[0].length;
  const after = normalized.slice(afterStart);
  const next = nextHeading.exec(after);
  return next?.index === undefined ? after : after.slice(0, next.index);
}

function substantiveStatements(value: string): string[] {
  return unique(
    value
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .filter((rawLine) => {
        const line = rawLine.trim();
        return (
          Boolean(line) &&
          !/^#{1,6}\s+/.test(line) &&
          !/^BEWERBUNGSFASSUNG\s*\|/i.test(line) &&
          !GREETING_LINE.test(line) &&
          !/^(?:mit freundlichen grüßen|freundliche grüße|beste grüße|kind regards)\b/i.test(
            line,
          ) &&
          !EXPERIENCE_DATE.test(line.replaceAll("*", "")) &&
          !/[?]\s*$/.test(line) &&
          !/^\s*[-*•]?\s*\[[^\]]+\]\(https?:\/\//i.test(line)
        );
      })
      .map((line) =>
        line
          .replace(/^\s*[-•]\s*/, "")
          .replace(/^\*+|\*+$/g, "")
          .trim(),
      )
      .filter(
        (line) =>
          wordCount(line) >= 6 &&
          !/^(?:im anhang|als anlage|anlagen:|beigefügt)/i.test(line),
      ),
  );
}

function evidenceMapIssues(
  value: GeneratedApplicationPackage,
  outputKinds: ApplicationOutputKind[],
  context: ApplicationPackageQualityContext,
): {
  issues: string[];
  validMappedClaims: number;
  substantiveClaims: number;
  coveredSubstantiveClaims: number;
} {
  const issues: string[] = [];
  const validEvidenceIds = new Set(context.validEvidenceIds ?? []);
  const validResearchClaimIds = new Set(context.validResearchClaimIds ?? []);
  const selectedArtifacts = new Set(
    outputKinds.map((kind) => ARTIFACT_BY_OUTPUT[kind]),
  );
  const minimumMappings: Partial<Record<ApplicationArtifactKey, number>> = {
    tailoredCv: 8,
    coverLetter: 3,
    companyBrief: 3,
    interviewPrep: 4,
    applicationEmailBody: 1,
  };
  let validMappedClaims = 0;
  let substantiveClaims = 0;
  let coveredSubstantiveClaims = 0;
  for (const mapping of value.evidenceMap ?? []) {
    if (!selectedArtifacts.has(mapping.artifact)) continue;
    const content = value[mapping.artifact];
    const evidenceIds = Array.isArray(mapping.evidenceIds)
      ? mapping.evidenceIds
      : [];
    const researchClaimIds = Array.isArray(mapping.researchClaimIds)
      ? mapping.researchClaimIds
      : [];
    const invalidEvidence = evidenceIds.filter(
      (id) => !validEvidenceIds.has(id),
    );
    const invalidResearch = researchClaimIds.filter(
      (id) => !validResearchClaimIds.has(id),
    );
    if (!evidenceIds.length && !researchClaimIds.length) {
      issues.push(
        mapping.artifact + ": Evidenzzuordnung ohne Referenz für '" +
          clean(mapping.claim).slice(0, 80) +
          "'",
      );
      continue;
    }
    if (invalidEvidence.length || invalidResearch.length) {
      issues.push(
        mapping.artifact +
          ": ungültige Evidenzreferenz (" +
          [...invalidEvidence, ...invalidResearch].join(", ") +
          ")",
      );
      continue;
    }
    if (!contentIncludesClaim(content, mapping.claim)) {
      issues.push(
        mapping.artifact + ": zugeordnete Aussage ist im Dokument nicht auffindbar",
      );
      continue;
    }
    validMappedClaims += 1;
  }
  for (const artifact of selectedArtifacts) {
    const validMappings = (value.evidenceMap ?? []).filter(
      (mapping) =>
        mapping.artifact === artifact &&
        (mapping.evidenceIds?.some((id) => validEvidenceIds.has(id)) ||
          mapping.researchClaimIds?.some((id) =>
            validResearchClaimIds.has(id),
          )) &&
        contentIncludesClaim(value[artifact], mapping.claim),
    );
    const validForArtifact = validMappings.length;
    const minimum = minimumMappings[artifact] ?? 1;
    if (validForArtifact < minimum) {
      issues.push(
        artifact +
          ": zu wenig intern belegte Aussagen (" +
          validForArtifact +
          " statt mindestens " +
          minimum +
        ")",
      );
    }
    const statements = substantiveStatements(value[artifact]);
    substantiveClaims += statements.length;
    for (const statement of statements) {
      const covered = validMappings.some(
        (mapping) => mappingCoversStatement(statement, mapping.claim),
      );
      if (covered) {
        coveredSubstantiveClaims += 1;
      } else {
        issues.push(
          artifact +
            ": substantielle Aussage ohne Evidenzzuordnung: '" +
            clean(statement).slice(0, 140) +
            "'",
        );
      }
    }
  }
  return {
    issues,
    validMappedClaims,
    substantiveClaims,
    coveredSubstantiveClaims,
  };
}

function cvIssues(
  value: GeneratedApplicationPackage,
  _cvLength: ApplicationGenerationPreferences["cvLength"],
  context: ApplicationPackageQualityContext,
): string[] {
  const issues: string[] = [];
  const count = wordCount(value.tailoredCv);
  const [minimum, maximum] = [750, 1_150];
  if (count < minimum || count > maximum) {
    issues.push(
      "tailored-cv: Umfang " +
        count +
        " Wörter; erlaubt sind " +
        minimum +
        "–" +
        maximum,
    );
  }
  const required: Array<[string, RegExp[]]> = [
    ["Profil", [/^##\s+(?:BERUFLICHES\s+)?PROFIL\b/im]],
    ["Rollenpassung", [/^##\s+.*ROLLENPASSUNG\b/im]],
    ["Berufserfahrung", [/^##\s+BERUFSERFAHRUNG\b/im]],
    ["Kompetenzen", [/^##\s+.*KOMPETENZEN\b/im]],
    [
      "Ausbildung/Weiterbildung",
      [/^##\s+.*(?:AUSBILDUNG|WEITERBILDUNG|QUALIFIKATION)\b/im],
    ],
  ];
  for (const [label, patterns] of required) {
    if (!sectionPresent(value.tailoredCv, patterns)) {
      issues.push("tailored-cv: Pflichtabschnitt fehlt: " + label);
    }
  }
  const kinds = new Set(context.masterCv?.sections.map((section) => section.kind));
  if (
    kinds.has("projects") &&
    !/^##\s+.*(?:PROJEKTE|FALLSTUDIEN|CASES)\b/im.test(value.tailoredCv)
  ) {
    issues.push("tailored-cv: belegte Projekte/Fallstudien fehlen");
  }
  if (
    kinds.has("languages") &&
    !/^##\s+.*SPRACHEN\b/im.test(value.tailoredCv)
  ) {
    issues.push("tailored-cv: belegte Sprachen fehlen");
  }
  const entries = masterCvExperienceEntries(context.masterCv);
  for (const entry of entries) {
    if (!experienceCovered(value.tailoredCv, entry)) {
      issues.push(
        "tailored-cv: belegte Station fehlt oder ist nicht datiert: " +
          entry.date +
          " · " +
          entry.title,
      );
    }
  }
  if (EMPLOYER_TERM_LABEL.test(value.tailoredCv)) {
    issues.push(
      "tailored-cv: Arbeitgeberbedingungen stehen im Kandidatenprofil",
    );
  }
  return issues;
}

function coverLetterIssues(value: string): string[] {
  const issues: string[] = [];
  const count = wordCount(value);
  if (count < 350 || count > 500) {
    issues.push(
      "cover-letter: Umfang " +
        count +
        " Wörter; erlaubt sind 350–500",
    );
  }
  const greeting = greetingIssue(value);
  if (greeting) issues.push("cover-letter: " + greeting);
  const opening = firstNarrativeParagraph(value);
  if (!opening || GENERIC_COVER_OPENING.test(opening)) {
    issues.push("cover-letter: generischer oder fehlender Einstieg");
  }
  if (INTERNAL_ASSESSMENT.test(value) || RESEARCH_DUMP_LABEL.test(value)) {
    issues.push("cover-letter: interne Bewertung oder Recherchelabel sichtbar");
  }
  if (EMPLOYER_TERM_LABEL.test(value)) {
    issues.push(
      "cover-letter: Arbeitgeberbedingungen stehen im Kandidatenabschnitt",
    );
  }
  return issues;
}

function companyBriefIssues(value: string): string[] {
  const requirements: Array<[string, RegExp]> = [
    ["bestätigte Fakten", /^##\s+.*BESTÄTIGTE.*(?:FAKTEN|GRUNDLAGE)/im],
    ["Rolle und Anforderungen", /^##\s+.*(?:ROLLE|ANFORDERUNGEN|AUFGABEN)/im],
    [
      "Profilanschlüsse",
      /^##\s+.*(?:ANSCHLUSSPUNKTE|PROFILANSCHLÜSSE|PROFILBELEGE)/im,
    ],
    ["offene Punkte/Risiken", /^##\s+.*(?:OFFENE PUNKTE|RISIKEN)/im],
    ["Quellen", /^##\s+.*QUELLEN/im],
  ];
  return requirements
    .filter(([, pattern]) => !pattern.test(value))
    .map((item) => "company-brief: Bestandteil fehlt: " + item[0]);
}

function interviewIssues(value: string): string[] {
  const issues: string[] = [];
  const requirements: Array<[string, RegExp]> = [
    ["Kernbotschaft", /^##\s+.*KERNBOTSCHAFT/im],
    ["Beleganker", /^##\s+.*BELEGANKER/im],
    ["wahrscheinliche Fragen", /^##\s+.*WAHRSCHEINLICHE FRAGEN/im],
    ["eigene Fragen", /^##\s+.*EIGENE FRAGEN/im],
    ["offene Risiken", /^##\s+.*(?:OFFENE RISIKEN|RISIKEN UND LERNFELDER)/im],
  ];
  for (const [label, pattern] of requirements) {
    if (!pattern.test(value)) {
      issues.push("interview-prep: Bestandteil fehlt: " + label);
    }
  }
  const anchors = artifactSection(
    value,
    /^##\s+.*BELEGANKER.*$/im,
  ).match(/^\s*[-•]\s+/gm)?.length;
  if ((anchors ?? 0) < 4) {
    issues.push(
      "interview-prep: weniger als vier echte Beleganker (" +
        (anchors ?? 0) +
        ")",
    );
  }
  return issues;
}

function emailIssues(value: GeneratedApplicationPackage): string[] {
  const issues: string[] = [];
  const count = wordCount(value.applicationEmailBody);
  if (count < 90 || count > 150) {
    issues.push(
      "application-email: Umfang " +
        count +
        " Wörter; erlaubt sind 90–150",
    );
  }
  const greeting = greetingIssue(value.applicationEmailBody);
  if (greeting) issues.push("application-email: " + greeting);
  if (!value.applicationEmailSubject.trim()) {
    issues.push("application-email: Betreff fehlt");
  }
  if (
    GENERIC_APPLICATION_EMAIL.test(value.applicationEmailBody) ||
    INTERNAL_ASSESSMENT.test(value.applicationEmailBody) ||
    RESEARCH_DUMP_LABEL.test(value.applicationEmailBody)
  ) {
    issues.push(
      "application-email: generische Formulierung oder internes Recherchelabel",
    );
  }
  if (EMPLOYER_TERM_LABEL.test(value.applicationEmailBody)) {
    issues.push(
      "application-email: Arbeitgeberbedingungen stehen im Kandidatenabschnitt",
    );
  }
  return issues;
}

export function applicationPackageQualityIssues(
  value: GeneratedApplicationPackage,
  outputKinds: ApplicationOutputKind[],
  cvLength: ApplicationGenerationPreferences["cvLength"],
  context: ApplicationPackageQualityContext = {},
): string[] {
  const issues: string[] = [];
  if (!value || typeof value !== "object") return ["Paket: ungültige Struktur"];
  for (const [kind, , content] of visibleArtifacts(value, outputKinds)) {
    if (typeof content !== "string" || !content.trim()) {
      issues.push(kind + ": fehlt");
      continue;
    }
    if (PLACEHOLDER.test(content)) {
      issues.push(kind + ": enthält Redaktionsplatzhalter");
    }
    if (INTERNAL_REFERENCE.test(content)) {
      issues.push(kind + ": interne Evidenz-ID ist sichtbar");
    }
    if (VISIBLE_TRUNCATION.test(content)) {
      issues.push(kind + ": enthält sichtbare Kürzungsellipsen");
    }
    if (duplicatePunctuation(content)) {
      issues.push(kind + ": enthält doppelte Satzzeichen");
    }
  }
  if (outputKinds.includes("tailored-cv") && value.tailoredCv.trim()) {
    issues.push(...cvIssues(value, cvLength, context));
  }
  if (outputKinds.includes("cover-letter") && value.coverLetter.trim()) {
    issues.push(...coverLetterIssues(value.coverLetter));
  }
  if (outputKinds.includes("company-brief") && value.companyBrief.trim()) {
    issues.push(...companyBriefIssues(value.companyBrief));
  }
  if (outputKinds.includes("interview-prep") && value.interviewPrep.trim()) {
    issues.push(...interviewIssues(value.interviewPrep));
  }
  if (outputKinds.includes("application-email") && value.applicationEmailBody.trim()) {
    issues.push(...emailIssues(value));
  }
  if (!Array.isArray(value.fitHighlights) || value.fitHighlights.length < 2) {
    issues.push("fitHighlights: mindestens zwei konkrete Profilbelege fehlen");
  } else if (
    value.fitHighlights.some(
      (item) =>
        PLACEHOLDER.test(item) ||
        INTERNAL_ASSESSMENT.test(item) ||
        VISIBLE_TRUNCATION.test(item),
    )
  ) {
    issues.push("fitHighlights: enthält Platzhalter, Bewertung oder Kürzung");
  }
  const allowedSources = new Set(context.allowedSources ?? []);
  for (const source of value.sources ?? []) {
    let valid = false;
    try {
      valid = ["http:", "https:"].includes(new URL(source).protocol);
    } catch {
      valid = false;
    }
    if (!valid || (allowedSources.size > 0 && !allowedSources.has(source))) {
      issues.push("sources: unzulässige oder unbestätigte Quelle");
    }
  }
  const mapping = evidenceMapIssues(value, outputKinds, context);
  issues.push(...mapping.issues);
  return unique(issues);
}

export function buildApplicationQualityReport(
  value: GeneratedApplicationPackage,
  outputKinds: ApplicationOutputKind[],
  cvLength: ApplicationGenerationPreferences["cvLength"],
  context: ApplicationPackageQualityContext,
  attempt: 1 | 2,
): ApplicationQualityReport {
  const issues = applicationPackageQualityIssues(
    value,
    outputKinds,
    cvLength,
    context,
  );
  const mapping = evidenceMapIssues(value, outputKinds, context);
  const mappedClaims = Array.isArray(value.evidenceMap)
    ? value.evidenceMap.length
    : 0;
  const expectedEntries = masterCvExperienceEntries(context.masterCv);
  const coveredExperienceEntries = expectedEntries.filter((entry) =>
    experienceCovered(value.tailoredCv, entry),
  ).length;
  return {
    status: issues.length ? "rejected" : "ready",
    attempt,
    checkedAt: new Date().toISOString(),
    issues,
    metrics: {
      wordCounts: {
        coverLetter: wordCount(value.coverLetter),
        tailoredCv: wordCount(value.tailoredCv),
        companyBrief: wordCount(value.companyBrief),
        interviewPrep: wordCount(value.interviewPrep),
        applicationEmailBody: wordCount(value.applicationEmailBody),
      },
      mappedClaims,
      validMappedClaims: mapping.validMappedClaims,
      substantiveClaims: mapping.substantiveClaims,
      coveredSubstantiveClaims: mapping.coveredSubstantiveClaims,
      evidenceCoveragePercent:
        mapping.substantiveClaims > 0
          ? Math.round(
              (mapping.coveredSubstantiveClaims /
                mapping.substantiveClaims) *
                100,
            )
          : 0,
      expectedExperienceEntries: expectedEntries.length,
      coveredExperienceEntries,
    },
  };
}

export function readyApplicationPackage(
  value: GeneratedApplicationPackage,
  report: ApplicationQualityReport,
): ApplicationPackage {
  if (report.status !== "ready" || report.issues.length) {
    throw new Error("Ein nicht geprüftes Bewerbungspaket kann nicht freigegeben werden.");
  }
  return {
    ...value,
    status: "ready",
    qualityReport: report,
  };
}

export function markApplicationPackageNeedsReview(
  value: ApplicationPackage,
): ApplicationPackage {
  return {
    ...value,
    status: "needs_review",
    qualityReport: {
      ...value.qualityReport,
      status: "needs_review",
      issues: ["Manuelle Änderungen müssen erneut gegen KI und Evidenz geprüft werden."],
      checkedAt: new Date().toISOString(),
    },
  };
}
