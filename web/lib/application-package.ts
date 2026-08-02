import type {
  ApplicationGenerationPreferences,
  ApplicationOutputKind,
  MasterCvContent,
} from "./types";

export type ApplicationPackage = {
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
};

export type CvContentSource = Pick<
  MasterCvContent,
  "name" | "headline" | "subheadline" | "contactLine" | "sections"
>;

export type LocalApplicationPackageInput = {
  companyName: string;
  roleTitle: string;
  contactPerson: string;
  motivation: string;
  achievements: string;
  strengths: string;
  constraints: string;
  availability: string;
  jobUrl: string;
  cvLength: ApplicationGenerationPreferences["cvLength"];
  focusThemes: string[];
  outputKinds: ApplicationOutputKind[];
  confirmedFacts?: string[];
  sources?: string[];
  cvSource: CvContentSource | null;
};

type ExperienceEntry = {
  date: string;
  title: string;
  company: string;
  context: string;
  bullets: string[];
};

const DATE_LINE = /^(?:\d{2}\/\d{4}|\d{4})\s*[-–]\s*(?:\d{2}\/\d{4}|\d{4}|heute|aktuell)$/i;
const PLACEHOLDER = /\[(?:[^\]]*(?:hier|original-cv|hochgeladenen cv|übernehmen|ergänzen|vorbereiten|belegbar|stationen)[^\]]*)\]/i;
const GENERIC_APPLICATION_EMAIL =
  /(?:passen sehr gut zu meinem profil|gewünschten nächsten schritt|anbei übersende ich ihnen meine bewerbung)[\s\S]{0,220}(?:persönlichen gespräch freue ich mich)/i;

const STOP_WORDS = new Set([
  "aber",
  "alle",
  "auch",
  "auf",
  "aus",
  "bei",
  "das",
  "dem",
  "den",
  "der",
  "des",
  "die",
  "ein",
  "eine",
  "einer",
  "eines",
  "für",
  "gegen",
  "ihre",
  "ihren",
  "ihres",
  "mit",
  "oder",
  "sowie",
  "und",
  "von",
  "werden",
  "wird",
  "zur",
  "zum",
]);

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cleanSourceLine(value: string): string {
  return clean(value)
    .replace(/^\[[A-Z]{2,12}-\d+(?:-\d+)*\]\s*/i, "")
    .replace(/^\s*[•*-]\s*/, "")
    .trim();
}

function words(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function unique(values: string[], maximum = Number.POSITIVE_INFINITY): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = clean(value);
    const key = normalized.toLocaleLowerCase("de-DE");
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= maximum) break;
  }
  return result;
}

function sectionLines(source: CvContentSource | null, heading: RegExp): string[] {
  if (!source) return [];
  return source.sections
    .filter((section) => heading.test(section.heading))
    .flatMap((section) => section.content.split(/\r?\n/))
    .map(cleanSourceLine)
    .filter(Boolean);
}

function allSourceLines(source: CvContentSource | null): string[] {
  if (!source) return [];
  return source.sections
    .flatMap((section) => section.content.split(/\r?\n/))
    .map(cleanSourceLine)
    .filter(Boolean);
}

function relevanceTerms(input: LocalApplicationPackageInput): Set<string> {
  const seed = [
    input.roleTitle,
    input.companyName,
    input.strengths,
    input.achievements,
    input.constraints,
    ...input.focusThemes,
    ...(input.confirmedFacts ?? []),
  ]
    .join(" ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-DE");
  const terms = new Set(
    seed
      .split(/[^a-z0-9äöüß+#/.-]+/i)
      .map((term) => term.replace(/^[./-]+|[./-]+$/g, ""))
      .filter((term) => term.length >= 4 && !STOP_WORDS.has(term)),
  );
  const add = (...values: string[]) => values.forEach((value) => terms.add(value));
  if (/krise|continuity|bcm|risik|katastroph|sicher/i.test(seed)) {
    add("risiko", "risiken", "stakeholder", "prozess", "compliance", "eskalation", "steuerung", "governance");
  }
  if (/kommunal|verwaltung|public|behörde|governance/i.test(seed)) {
    add("governance", "stakeholder", "entscheidung", "compliance", "prozess", "projekt");
  }
  if (/projekt|programm|pmo|delivery|rollout/i.test(seed)) {
    add("projekt", "prozess", "rollout", "kpi", "status", "risiko", "anforderung", "stakeholder");
  }
  if (/\bki\b|\bai\b|digital|automatis|data|webapp/i.test(seed)) {
    add("digital", "systeme", "webapp", "openai", "daten", "automatisierung", "anforderung", "produkt");
  }
  if (/recruit|personal|hr|talent/i.test(seed)) {
    add("recruiting", "personal", "kandidat", "anforderungsprofil", "auswahl", "sourcing", "hiring");
  }
  if (/vertrieb|sales|account|beratung|consult/i.test(seed)) {
    add("sales", "consulting", "beratung", "kunden", "account", "akquise", "vertrag", "verhandlung");
  }
  return terms;
}

function scoreLine(line: string, terms: Set<string>, themes: string[]): number {
  const normalized = line
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-DE");
  let score = 0;
  for (const term of terms) {
    if (normalized.includes(term)) score += term.length >= 8 ? 3 : 2;
  }
  const themeText = themes.join(" ").toLocaleLowerCase("de-DE");
  if (/projekt|prozess/.test(themeText) && /^projekt & prozess:/i.test(line)) score += 8;
  if (/ki|automatis|digital/.test(themeText) && /^digital & systeme:/i.test(line)) score += 8;
  if (/stakeholder|veränder|führung|training/.test(themeText) && /^people & enablement:/i.test(line)) score += 8;
  if (/sales|consult|recruit|account/.test(themeText) && /^sales & consulting:/i.test(line)) score += 8;
  if (/\b(ergebnis|umsetzung|beitrag|verantwort|steuerung|entwicklung|aufbau)\b/i.test(line)) score += 1;
  return score;
}

function pickRelevant(
  lines: string[],
  limit: number,
  terms: Set<string>,
  themes: string[],
): string[] {
  const scored = unique(lines).map((line, index) => ({
    line,
    index,
    score: scoreLine(line, terms, themes),
  }));
  const selected = scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .sort((a, b) => a.index - b.index);
  return selected.map((item) => item.line);
}

function parseExperience(source: CvContentSource | null): ExperienceEntry[] {
  const lines = sectionLines(source, /^BERUFSERFAHRUNG\b/i);
  const result: ExperienceEntry[] = [];
  let current: ExperienceEntry | null = null;
  for (const rawLine of lines) {
    const line = cleanSourceLine(rawLine);
    if (DATE_LINE.test(line)) {
      if (current?.title) result.push(current);
      current = { date: line, title: "", company: "", context: "", bullets: [] };
      continue;
    }
    if (!current) continue;
    if (!current.title) {
      current.title = line;
    } else if (!current.company) {
      current.company = line;
    } else if (/^MANDAT\s*&\s*KONTEXT:/i.test(line) && !current.context) {
      current.context = line;
    } else {
      current.bullets.push(line);
    }
  }
  if (current?.title) result.push(current);
  return result;
}

function selectedExperience(
  input: LocalApplicationPackageInput,
  terms: Set<string>,
): ExperienceEntry[] {
  const entries = parseExperience(input.cvSource);
  return entries.map((entry, index) => {
    const limit =
      input.cvLength === "compact"
        ? index < 2
          ? 2
          : 1
        : input.cvLength === "detailed"
          ? index < 3
            ? 6
            : 4
          : index < 2
            ? 4
            : 2;
    return {
      ...entry,
      context:
        input.cvLength === "detailed" ||
        (input.cvLength === "two_pages" && index < 4) ||
        (input.cvLength === "compact" && index === 0)
          ? entry.context
          : "",
      bullets: pickRelevant(entry.bullets, limit, terms, input.focusThemes),
    };
  });
}

function withoutCategory(value: string): string {
  return cleanSourceLine(value).replace(
    /^(?:DIGITAL & SYSTEME|PROJEKT & PROZESS|PEOPLE & ENABLEMENT|SALES & CONSULTING|AI & DATA|PRODUCT|ORGANISATION|DELIVERY|BUSINESS|STEUERN|VERMITTELN|ABSCHLIESSEN|TRAINING|ENABLEMENT|CONTENT & DISCOVERY|PERSÖNLICHE STEUERUNG|AUSGANGSLAGE|EIGENER BEITRAG|UMSETZUNG \/ ERGEBNIS|TRANSFER):\s*/i,
    "",
  );
}

function firstSentence(value: string, maximum = 230): string {
  const cleanValue = clean(withoutCategory(value));
  if (cleanValue.length <= maximum) return cleanValue;
  const sentence = cleanValue.slice(0, maximum + 1).match(/^(.{80,230}?[.!?])(?:\s|$)/)?.[1];
  return sentence || `${cleanValue.slice(0, maximum).replace(/\s+\S*$/, "")} …`;
}

function roleMatchSummary(value: string): string {
  const normalized = cleanSourceLine(value);
  const label = /(?:digital|system|webapp|ai\b|\bki\b|daten|automatis)/i.test(normalized)
    ? "Digitalisierung & Systeme"
    : /(?:people|stakeholder|moder|training|enablement|vermittel|kommunikation)/i.test(
          normalized,
        )
      ? "Stakeholder & Kommunikation"
      : /(?:sales|consult|kunde|recruit|account|vertrag|verhandlung)/i.test(normalized)
        ? "Beratung & Umsetzung"
        : "Steuerung & Transparenz";
  return `${label}: ${firstSentence(normalized, 175)}`;
}

function readableProofSentence(value: string): string {
  const sentence = firstSentence(value, 360);
  if (words(sentence) <= 38) return sentence;
  return sentence.replace(/:\s+/, ". ");
}

function formattedEducation(lines: string[]): string[] {
  const result: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (!current.length) return;
    if (DATE_LINE.test(current[0]) && current.length >= 2) {
      result.push(`**${current[0]}**`, `### ${current[1]}`);
      if (current[2]) result.push(`*${current[2]}*`);
      result.push(...current.slice(3).map((line) => `- ${line}`), "");
    } else {
      result.push(...current.map((line) => `- ${line}`));
    }
    current = [];
  };
  for (const line of lines) {
    if (DATE_LINE.test(line)) flush();
    current.push(line);
  }
  flush();
  return result;
}

function buildTailoredCv(
  input: LocalApplicationPackageInput,
  terms: Set<string>,
  evidence: string[],
): string {
  const source = input.cvSource;
  const profileLines = sectionLines(source, /^KURZPROFIL$/i).filter(
    (line) => !/^Diese Langfassung ist bewusst/i.test(line),
  );
  const profileLimit = input.cvLength === "compact" ? 1 : 2;
  const profileKeys = new Set(
    profileLines.map((line) => cleanSourceLine(line).toLocaleLowerCase("de-DE")),
  );
  const highlights = unique(
    [
      input.achievements,
      input.strengths,
      ...evidence.filter(
        (line) =>
          !profileKeys.has(cleanSourceLine(line).toLocaleLowerCase("de-DE")),
      ),
    ].filter(Boolean),
    input.cvLength === "compact" ? 3 : input.cvLength === "detailed" ? 6 : 4,
  );
  const experience = selectedExperience(input, terms);
  const projectLines = pickRelevant(
    sectionLines(source, /PROJEKTE?\s*&\s*FALLSTUDIEN|WEBAPP-PROTOTYPEN/i),
    input.cvLength === "compact" ? 4 : input.cvLength === "detailed" ? 14 : 8,
    terms,
    input.focusThemes,
  );
  const skills = pickRelevant(
    sectionLines(source, /KOMPETENZPROFIL|METHODEN- UND TOOL-LANDSCHAFT/i).filter(
      (line) =>
        line.length > 10 &&
        !/^(Kompetenz|Einordnung|Evidenz \/ Anwendung|1|2|3|4)$/i.test(line),
    ),
    input.cvLength === "compact" ? 4 : input.cvLength === "detailed" ? 10 : 7,
    terms,
    input.focusThemes,
  );
  const educationSource = sectionLines(
    source,
    /^AUSBILDUNG.*(?:ZERTIFIKATE|WEITERBILDUNG)/i,
  );
  const educationTimelineIndex = educationSource.findIndex((line) =>
    /^Qualifizierungs-Timeline$/i.test(line),
  );
  const education = unique(
    (educationTimelineIndex >= 0
      ? educationSource.slice(0, educationTimelineIndex)
      : educationSource
    ).filter(
      (line) =>
        line.length > 5 &&
        !/^(?:Qualifizierungs-Timeline|Jahr\s*\/\s*Typ|Qualifikation|Anbieter|Zeitraum|Inhalt|Inhalt\s*&\s*beruflicher Bezug|Nachweis|Schwerpunkte)$/i.test(
          line,
        ),
    ),
    input.cvLength === "compact" ? 6 : input.cvLength === "detailed" ? 16 : 10,
  );
  const languages = unique(sectionLines(source, /^SPRACHEN$/i), 5);
  const lines: string[] = [
    "BEWERBUNGSFASSUNG | FOKUSSIERTER LEBENSLAUF",
    `# ${source?.name || "Bewerbungsprofil"}`,
    source?.headline || input.roleTitle,
    `ZIELROLLE: ${input.roleTitle}`,
    source?.subheadline || input.focusThemes.join(" | "),
    source?.contactLine || "",
    "",
    "## PROFIL",
    ...(profileLines.length
      ? profileLines.slice(0, profileLimit)
      : [
          input.strengths ||
            `Berufliches Profil für ${input.roleTitle} mit den nachstehend belegten Erfahrungen und Kompetenzen.`,
        ]),
    "",
    "## AUSGEWÄHLTE ROLLENPASSUNG",
    ...highlights.map((line) => `- ${roleMatchSummary(line)}`),
    "",
    "## BERUFSERFAHRUNG",
  ];
  for (const entry of experience) {
    lines.push(`**${entry.date}**`, `### ${entry.title}`, `*${entry.company}*`);
    if (entry.context) lines.push(entry.context);
    lines.push(...entry.bullets.map((bullet) => `- ${bullet}`), "");
  }
  if (projectLines.length) {
    lines.push(
      "## AUSGEWÄHLTE PROJEKTE & FALLSTUDIEN",
      ...projectLines.map((line) => `- ${line}`),
      "",
    );
  }
  if (skills.length) {
    lines.push(
      "## KERNKOMPETENZEN",
      ...skills.map((line) => `- ${line}`),
      "",
    );
  }
  if (education.length) {
    lines.push(
      "## AUSBILDUNG & RELEVANTE WEITERBILDUNG",
      ...formattedEducation(education),
      "",
    );
  }
  if (languages.length) {
    lines.push("## SPRACHEN", ...languages.map((line) => `- ${line}`));
  }
  return lines.filter((line, index, values) => line || values[index - 1]).join("\n").trim();
}

function buildCoverLetter(
  input: LocalApplicationPackageInput,
  evidence: string[],
): string {
  const source = input.cvSource;
  const name = source?.name || "Gerrit Fabisch";
  const greeting = input.contactPerson
    ? `Guten Tag ${input.contactPerson},`
    : "Guten Tag,";
  const proof = evidence.slice(0, 5).map(readableProofSentence);
  const profile = sectionLines(source, /^KURZPROFIL$/i).filter(
    (line) => !/^Diese Langfassung ist bewusst/i.test(line),
  );
  const opening = input.motivation
    ? clean(input.motivation)
    : `Geschäftsanforderungen zu strukturieren, unterschiedliche Stakeholder zu verbinden und belastbare Umsetzungswege zu schaffen, prägt meine bisherige Arbeit. Die Position ${input.roleTitle} bei ${input.companyName} ist deshalb für mich fachlich besonders interessant.`;
  const careerBreadth = profile[0]
    ? `Meine fachliche Grundlage ist breit und zugleich praxisnah: ${clean(profile[0])}`
    : `Meine berufliche Grundlage verbindet langjährige Kunden-, Prozess- und Stakeholder-Praxis mit aktueller Arbeit an digitalen Lösungen und strukturierten Entscheidungswegen.`;
  const paragraphTwo = proof.length
    ? `Für die Rolle bringe ich belastbare Anschlussfähigkeit aus mehreren Perspektiven mit. ${proof
        .slice(0, 2)
        .join(" Ein weiterer Beleg aus meinem Profil: ")}`
    : clean(input.strengths || profile[0] || source?.headline || "");
  const paragraphThree = proof.length > 2
    ? `Hinzu kommt konkrete Umsetzungserfahrung. ${proof.slice(2, 4).join(" Ergänzend: ")}`
    : clean(input.achievements || profile[1] || "");
  const paragraphFour = input.strengths
    ? `Für die konkrete Zusammenarbeit möchte ich besonders Folgendes einbringen: ${clean(input.strengths)}. Entscheidend ist für mich, Fachlichkeit, nachvollziehbare Steuerung und adressatengerechte Kommunikation zusammenzuführen.`
    : `Meine besondere Stärke liegt in der Übersetzung zwischen Geschäft, Menschen und Technologie. Ich strukturiere Anforderungen und Risiken, halte Entscheidungen transparent und vermittle komplexe Inhalte so, dass daraus ein tragfähiger nächster Schritt entsteht.`;
  const paragraphFive = proof[4]
    ? `Auch die Anschlussfähigkeit an neue fachliche Kontexte ist in meinem Profil belegt: ${proof[4]} Dabei arbeite ich mich nicht über vorschnelle Annahmen ein, sondern über Quellen, präzise Rückfragen, nachvollziehbare Anforderungen und frühe Abstimmung mit den betroffenen Stakeholdern.`
    : `Bei neuen fachlichen Kontexten beginne ich mit einer sauberen Bestandsaufnahme: Welche Ziele, Pflichten, Schnittstellen, Risiken und offenen Entscheidungen bestehen bereits? Daraus entwickle ich eine nachvollziehbare Arbeitsstruktur und stimme sie früh mit den beteiligten Stakeholdern ab.`;
  const earlyContribution = `Für einen wirksamen Einstieg würde ich zunächst Aufgaben, vorhandene Prozesse, Schnittstellen und Erfolgskriterien gemeinsam klären. Darauf aufbauend kann ich Prioritäten, Entscheidungsbedarfe und Risiken transparent machen und die nächsten umsetzbaren Schritte so strukturieren, dass fachliche Qualität und verlässliche Zusammenarbeit zusammenkommen. Verantwortlichkeiten, Annahmen und offene Punkte sollen dabei für alle Beteiligten nachvollziehbar bleiben. So entsteht früh ein belastbarer Arbeitsstand, der fachliche Rückfragen zulässt und zugleich konsequent auf die gemeinsame Umsetzung ausgerichtet ist.`;
  const availability = input.availability
    ? `Zu den Rahmenbedingungen: ${clean(input.availability)}.`
    : "Die fachlichen Schwerpunkte, Prioritäten und Rahmenbedingungen der Position bespreche ich gerne persönlich.";
  return [
    `# Bewerbung als ${input.roleTitle}`,
    source?.contactLine ? `${name}  |  ${source.contactLine}` : name,
    `${input.companyName}`,
    "",
    greeting,
    "",
    opening,
    "",
    careerBreadth,
    "",
    paragraphTwo,
    "",
    paragraphThree,
    "",
    paragraphFour,
    "",
    paragraphFive,
    "",
    earlyContribution,
    "",
    availability,
    "",
    `Gerne erläutere ich anhand konkreter Projekte und beruflicher Stationen, wie ich die Aufgaben als ${input.roleTitle} wirksam unterstützen kann.`,
    "",
    "Mit freundlichen Grüßen",
    name,
  ]
    .filter((line, index, values) => line || values[index - 1])
    .join("\n")
    .trim();
}

function buildCompanyBrief(
  input: LocalApplicationPackageInput,
  evidence: string[],
): string {
  const facts = unique(input.confirmedFacts ?? [], 12);
  return [
    `# ${input.companyName} · ${input.roleTitle}`,
    "",
    "## BESTÄTIGTE GRUNDLAGE",
    `- Offizielle Stellenquelle: ${input.jobUrl}`,
    `- Unternehmen und Zielrolle wurden vom Nutzer eingetragen: ${input.companyName} · ${input.roleTitle}.`,
    ...(facts.length
      ? facts.map((fact) => `- ${fact}`)
      : [
          "- Im gespeicherten Recherchekontext liegen noch keine bestätigten Arbeitgeber- oder Anzeigenfakten vor; deshalb werden keine Unternehmensdetails ergänzt.",
        ]),
    "",
    "## BELEGBARE ANSCHLUSSPUNKTE AUS DEM PROFIL",
    ...evidence.slice(0, 5).map((line) => `- ${line}`),
    "",
    "## VOR DEM VERSAND NOCH PRÜFEN",
    "- Aufgabenschwerpunkte und Muss-Anforderungen direkt mit der aktuellen Originalanzeige abgleichen.",
    "- Ansprechperson, Bewerbungsweg, Frist, Arbeitsort und veröffentlichte Rahmenbedingungen bestätigen.",
    "- Nur bestätigte Arbeitgeberaussagen in Anschreiben, Interviewvorbereitung oder E-Mail übernehmen.",
  ].join("\n");
}

function buildInterviewPrep(
  input: LocalApplicationPackageInput,
  evidence: string[],
): string {
  const profile = sectionLines(input.cvSource, /^KURZPROFIL$/i).filter(
    (line) => !/^Diese Langfassung ist bewusst/i.test(line),
  );
  const pitch = unique([input.strengths, ...profile, ...evidence], 4)
    .map((line) => firstSentence(line, 260))
    .join(" ");
  return [
    `# Interviewvorbereitung · ${input.companyName}`,
    "",
    `## 60–90-SEKUNDEN-KERNBOTSCHAFT FÜR ${input.roleTitle.toUpperCase()}`,
    pitch || `Die belegten Stationen des Master-CV bilden die Grundlage für die Vorstellung als ${input.roleTitle}.`,
    "",
    "## BELEGANKER FÜR KONKRETE ANTWORTEN",
    ...evidence.slice(0, 6).map((line, index) =>
      `### Beispiel ${index + 1}\n- ${line}\n- Im Gespräch konkretisieren: Ausgangslage, eigener Auftrag, Vorgehen, Ergebnis und übertragbarer Nutzen.`,
    ),
    "",
    "## WAHRSCHEINLICHE FRAGEN UND ANTWORTFOKUS",
    `- Warum diese Rolle? Den fachlichen Kern von ${input.roleTitle} mit der eigenen Erfahrung verbinden; keine unbestätigten Arbeitgeberfakten verwenden.`,
    "- Welche vergleichbare Situation haben Sie gesteuert? Einen Beleganker wählen und Verantwortung, Entscheidungen, Risiken und Ergebnis klar trennen.",
    "- Wie gehen Sie mit widersprüchlichen Stakeholder-Interessen um? Moderation, Transparenz, Entscheidungspunkte und verbindliche Nachverfolgung erläutern.",
    "- Wie machen Sie Fortschritt und Risiken sichtbar? Konkrete Beispiele für Status, KPIs, Meilensteine, offene Entscheidungen oder Eskalationen nutzen.",
    "- Wie arbeiten Sie sich in ein neues Fachgebiet ein? Problemverständnis, Quellenprüfung, Rückfragen, strukturierte Anforderungen und iteratives Feedback beschreiben.",
    "- Wo liegen Grenzen oder Lernfelder? Fachliche Lücken offen benennen und mit einer belastbaren Einarbeitungsstrategie verbinden.",
    "",
    "## EIGENE FRAGEN AN DEN ARBEITGEBER",
    "- Woran wird ein guter Beitrag in den ersten drei und sechs Monaten konkret erkannt?",
    "- Welche Aufgaben haben im Alltag die höchste Priorität, und welche Entscheidungen darf die Rolle selbst treffen?",
    "- Welche Stakeholder, Schnittstellen und Eskalationswege prägen die Zusammenarbeit?",
    "- Welche Prozesse, Dokumentationen, Systeme und Kennzahlen bestehen bereits?",
    "- Welche fachlichen Themen müssen zum Einstieg bereits sicher beherrscht werden, und wo ist Einarbeitung vorgesehen?",
    "- Welche Punkte aus der veröffentlichten Anzeige haben sich seit der Veröffentlichung verändert?",
    "",
    "## ANGEBOT, EINSTIEG UND RAHMENBEDINGUNGEN",
    input.availability
      ? `- Eigener Rahmen: ${clean(input.availability)}`
      : "- Verfügbarkeit, Arbeitsmodell und organisatorische Rahmenbedingungen vor einer Zusage konkret abgleichen.",
    input.constraints
      ? `- Bewusst zu erklärender Punkt: ${clean(input.constraints)}`
      : "- Noch offene Bedingungen und fachliche Grenzen nicht beschönigen, sondern als klare Prüfpunkte behandeln.",
  ].join("\n");
}

function buildApplicationEmail(
  input: LocalApplicationPackageInput,
  evidence: string[],
): string {
  const greeting = input.contactPerson ? `Guten Tag ${input.contactPerson},` : "Guten Tag,";
  const proof = firstSentence(evidence[0] || input.strengths || "", 210);
  return [
    greeting,
    "",
    `die ausgeschriebene Position ${input.roleTitle} bei ${input.companyName} verbindet Aufgaben, zu denen ich aus meinem bisherigen Profil konkrete Erfahrung und belastbare Anknüpfungspunkte mitbringe.`,
    proof ? `Besonders relevant ist dabei: ${proof}` : "",
    "",
    "Im Anhang finden Sie meinen auf die Rolle fokussierten Lebenslauf und mein Anschreiben. Beide Unterlagen basieren auf meinem vollständigen Master-CV; nicht belegte Angaben wurden bewusst nicht ergänzt.",
    "",
    "Für Rückfragen und ein persönliches Kennenlernen stehe ich gerne zur Verfügung.",
    "",
    "Mit freundlichen Grüßen",
    input.cvSource?.name || "Gerrit Fabisch",
  ]
    .filter((line, index, values) => line || values[index - 1])
    .join("\n")
    .trim();
}

export function buildLocalApplicationPackage(
  input: LocalApplicationPackageInput,
): ApplicationPackage {
  const terms = relevanceTerms(input);
  const evidence = pickRelevant(
    allSourceLines(input.cvSource).filter(
      (line) =>
        line.length >= 35 &&
        !DATE_LINE.test(line) &&
        !/^Diese Langfassung ist bewusst/i.test(line),
    ),
    input.cvLength === "compact" ? 10 : input.cvLength === "detailed" ? 24 : 16,
    terms,
    input.focusThemes,
  );
  const selected = (kind: ApplicationOutputKind) => input.outputKinds.includes(kind);
  const tailoredCv = selected("tailored-cv")
    ? buildTailoredCv(input, terms, evidence)
    : "";
  const coverLetter = selected("cover-letter")
    ? buildCoverLetter(input, evidence)
    : "";
  const companyBrief = selected("company-brief")
    ? buildCompanyBrief(input, evidence)
    : "";
  const interviewPrep = selected("interview-prep")
    ? buildInterviewPrep(input, evidence)
    : "";
  const applicationEmailBody = selected("application-email")
    ? buildApplicationEmail(input, evidence)
    : "";
  const openQuestions = unique(
    [
      !input.cvSource
        ? "Der Lebenslauf konnte im Offline-Modus nicht vollständig gelesen werden; für ein belastbares Paket den DOCX-Master-CV importieren oder die Online-Erzeugung erneut starten."
        : "",
      !(input.confirmedFacts ?? []).length
        ? "Vor dem Versand die aktuelle Originalanzeige und Arbeitgeberinformationen bestätigen; im Offline-Paket wurden keine Unternehmensfakten ergänzt."
        : "",
      !input.achievements
        ? "Für mindestens zwei priorisierte Belege ein konkretes Ergebnis oder eine belastbare Wirkung ergänzen, sofern im Gespräch belegbar."
        : "",
      input.constraints ? `Bewusst prüfen: ${clean(input.constraints)}` : "",
    ].filter(Boolean),
  );
  return {
    roleTitle: input.roleTitle,
    companyName: input.companyName,
    coverLetter,
    tailoredCv,
    companyBrief,
    interviewPrep,
    applicationEmailSubject: `Bewerbung als ${input.roleTitle}`,
    applicationEmailBody,
    fitHighlights: evidence.slice(0, 4).map((line) => firstSentence(line, 170)),
    openQuestions,
    sources: unique(input.sources ?? [], 20),
  };
}

export function applicationPackageQualityIssues(
  value: ApplicationPackage,
  outputKinds: ApplicationOutputKind[],
  cvLength: ApplicationGenerationPreferences["cvLength"],
): string[] {
  const issues: string[] = [];
  const fields: Array<[ApplicationOutputKind, keyof ApplicationPackage, number]> = [
    [
      "tailored-cv",
      "tailoredCv",
      cvLength === "compact" ? 380 : cvLength === "detailed" ? 1_000 : 650,
    ],
    ["cover-letter", "coverLetter", 320],
    ["company-brief", "companyBrief", 110],
    ["interview-prep", "interviewPrep", 330],
    ["application-email", "applicationEmailBody", 75],
  ];
  for (const [kind, key, minimum] of fields) {
    if (!outputKinds.includes(kind)) continue;
    const content = value[key];
    if (typeof content !== "string" || !content.trim()) {
      issues.push(`${kind}: fehlt`);
      continue;
    }
    if (words(content) < minimum) {
      issues.push(`${kind}: zu kurz (${words(content)} statt mindestens ${minimum} Wörter)`);
    }
    if (PLACEHOLDER.test(content)) issues.push(`${kind}: enthält Redaktionsplatzhalter`);
  }
  if (
    outputKinds.includes("tailored-cv") &&
    (value.tailoredCv.match(/^##\s+/gm) ?? []).length < 5
  ) {
    issues.push("tailored-cv: zu wenig belastbare Abschnitte");
  }
  if (
    outputKinds.includes("application-email") &&
    GENERIC_APPLICATION_EMAIL.test(value.applicationEmailBody)
  ) {
    issues.push("application-email: generische Standardmail ohne Profilbeleg");
  }
  if (!value.fitHighlights.length || value.fitHighlights.some((item) => PLACEHOLDER.test(item))) {
    issues.push("fitHighlights: keine konkreten CV-Belege");
  }
  return unique(issues);
}
