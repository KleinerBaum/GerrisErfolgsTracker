const WORD_BANK = [
  "strukturiert",
  "transparent",
  "praxisnah",
  "verlässlich",
  "gemeinsam",
  "nachvollziehbar",
  "zielorientiert",
  "verantwortlich",
  "sorgfältig",
  "wirksam",
  "abgestimmt",
  "konkret",
];

export function padParagraph(prefix, targetWords) {
  const words = prefix.replace(/[.!?]+$/g, "").trim().split(/\s+/).filter(Boolean);
  let index = 0;
  while (words.length < targetWords) {
    words.push(WORD_BANK[index % WORD_BANK.length]);
    index += 1;
  }
  return words.join(" ") + ".";
}

export const experienceEntries = [
  ["01/2024 - heute", "Lead Prozess- und Automatisierungsprojekte", "Beispiel Beratung GmbH"],
  ["01/2021 - 12/2023", "Senior Projektmanager Geschäftsprozesse", "Nordstadt Services AG"],
  ["01/2019 - 12/2020", "Teamleitung Kunden- und Prozessmanagement", "Rheinland Solutions GmbH"],
  ["01/2017 - 12/2018", "Account- und Projektberater", "Musterwerke SE"],
  ["01/2015 - 12/2016", "Recruiting- und Prozessspezialist", "Talent Beispiel KG"],
  ["01/2012 - 12/2014", "Consultant Personal und Organisation", "Westblick Consulting GmbH"],
  ["01/2008 - 12/2011", "Junior Kundenberater", "Startpunkt Dienstleistungen AG"],
];

function experienceContent(entries) {
  return entries
    .map(
      ([date, title, company], index) =>
        [
          date,
          title,
          company + " | Nordrhein-Westfalen",
          "MANDAT & KONTEXT: Verantwortung für abgestimmte Abläufe, Stakeholder und verlässliche Umsetzung.",
          "• " +
            padParagraph(
              "Anforderungen aufgenommen, Prioritäten geklärt und Entscheidungen mit den beteiligten Fachbereichen in belastbare Arbeitspakete überführt",
              34 + (index % 3),
            ),
        ].join("\n"),
    )
    .join("\n");
}

const sections = [
  {
    id: "profile",
    heading: "KURZPROFIL",
    kind: "profile",
    content: padParagraph(
      "Betriebswirtschaftlich ausgebildetes Profil mit langjähriger Erfahrung in Projektsteuerung, Prozessverbesserung, Stakeholder-Kommunikation und digitaler Umsetzung",
      70,
    ),
  },
  {
    id: "experience-current",
    heading: "BERUFSERFAHRUNG | 2019 BIS HEUTE",
    kind: "experience",
    content: experienceContent(experienceEntries.slice(0, 3)),
  },
  {
    id: "experience-earlier",
    heading: "BERUFSERFAHRUNG | 2008 BIS 2018",
    kind: "experience",
    content: experienceContent(experienceEntries.slice(3)),
  },
  {
    id: "projects",
    heading: "AUSGEWÄHLTE PROJEKTE & FALLSTUDIEN",
    kind: "projects",
    content: [
      padParagraph(
        "Digitaler Analyseworkflow für konsistente Bedarfsklärung, strukturierte Rückfragen und nachvollziehbare Entscheidungsvorlagen",
        42,
      ),
      padParagraph(
        "Rollout- und Prozessprojekt mit transparenter Steuerung von Anforderungen, Abhängigkeiten, Risiken und offenen Entscheidungen",
        42,
      ),
    ].join("\n"),
  },
  {
    id: "skills",
    heading: "KOMPETENZPROFIL | EVIDENZBASIERT",
    kind: "skills",
    content: [
      "Projekt- und Prozessmanagement: Fortgeschritten — Roadmaps, Priorisierung, Status und Risiken",
      "Stakeholder-Management: Kernkompetenz — Moderation, Verhandlung und Management-Kommunikation",
      "Digitale Umsetzung: Projektpraxis — Automatisierte Workflows, strukturierte Daten und KI-Anwendungen",
    ].join("\n"),
  },
  {
    id: "education",
    heading: "AUSBILDUNG & WEITERBILDUNG",
    kind: "education",
    content: [
      "2006 - 2009",
      "Bachelor of Arts Betriebswirtschaftslehre",
      "Beispiel Hochschule | Abschluss 2009",
      "04/2024 - 07/2024",
      "Data Analyst Weiterbildung | 540 Stunden",
      "Kontinuierliche Weiterbildung zu angewandter KI und strukturierten Workflows",
    ].join("\n"),
  },
  {
    id: "languages",
    heading: "SPRACHEN",
    kind: "languages",
    content:
      "Deutsch: Muttersprache | Englisch: verhandlungssicher | Spanisch: Grundkenntnisse",
  },
];

const evidence = Array.from({ length: 40 }, (_, index) => ({
  evidenceId: "CV-EV-" + (index + 1),
  claim: "Anonymisierte Evidenzaussage " + (index + 1),
  safeWording: "Anonymisierte Evidenzaussage " + (index + 1),
  sourceType: "current_cv",
  sourceName: "Anonymisierter Master-CV",
  confidence: "source_only",
  restrictions: [],
  roleRelevance: ["application"],
  capturedAt: "2026-08-05T08:00:00.000Z",
}));

export const masterCvFixture = {
  schemaVersion: 2,
  sourceDocumentId: "fixture-master",
  passportDocumentId: null,
  name: "Alex Beispiel",
  headline: "Projekt-, Prozess- und Digitalisierungsmanagement",
  subheadline: "Stakeholder-Steuerung | Automatisierung | Veränderungsarbeit",
  contactLine: "Köln | alex@example.test | Portfolio",
  language: "de-DE",
  sections,
  links: [
    {
      id: "link-1",
      label: "alex@example.test",
      url: "mailto:alex@example.test",
      kind: "email",
    },
    {
      id: "link-2",
      label: "Portfolio",
      url: "https://portfolio.example.test",
      kind: "portfolio",
    },
  ],
  sourceFingerprint: "a".repeat(64),
  coverage: {
    totalWords: sections
      .map((section) => section.content)
      .join(" ")
      .split(/\s+/).length,
    evidenceItems: evidence.length,
    experienceEntries: experienceEntries.length,
    projectItems: 2,
    skillItems: 3,
    educationItems: 6,
    languageItems: 3,
    linkedContacts: 2,
    sectionsByKind: {
      profile: 1,
      value: 0,
      experience: 2,
      projects: 1,
      skills: 1,
      education: 1,
      languages: 1,
      other: 0,
    },
  },
  passport: {
    schemaVersion: "master-cv-evidence-v2",
    profileName: "Alex Beispiel",
    targetDirections: [],
    sourceDocuments: [
      {
        sourceId: "fixture-master",
        name: "Anonymisierter Master-CV",
        sourceType: "current_cv",
        isPrimary: true,
        notes: [],
      },
    ],
    evidence,
    documentVersionStatus: "source_only",
    importedAt: "2026-08-05T08:00:00.000Z",
  },
  importedAt: "2026-08-05T08:00:00.000Z",
  updatedAt: "2026-08-05T08:00:00.000Z",
  editRevision: 0,
};

function cvContent() {
  const profile = padParagraph(
    "Ich verbinde langjährige Projekt- und Prozesspraxis mit digitaler Umsetzung und adressatengerechter Stakeholder-Kommunikation",
    92,
  );
  const roleMatches = [
    padParagraph("Prozesssteuerung und belastbare Priorisierung", 30),
    padParagraph("Risiko-, Status- und Entscheidungstransparenz", 30),
    padParagraph("Moderation unterschiedlicher Fachperspektiven", 30),
    padParagraph("Digitale Umsetzung aus konkreten Geschäftsanforderungen", 30),
  ];
  const lines = [
    "BEWERBUNGSFASSUNG | FOKUSSIERTER LEBENSLAUF",
    "# Alex Beispiel",
    "Projekt-, Prozess- und Digitalisierungsmanagement",
    "ZIELROLLE: Sachbearbeitung Krisen- und Kontinuitätsmanagement",
    "Stakeholder-Steuerung | Automatisierung | Veränderungsarbeit",
    "Köln | alex@example.test | Portfolio",
    "",
    "## PROFIL",
    profile,
    "",
    "## AUSGEWÄHLTE ROLLENPASSUNG",
    ...roleMatches.map((item) => "- " + item),
    "",
    "## BERUFSERFAHRUNG",
  ];
  experienceEntries.forEach(([date, title, company], index) => {
    lines.push(
      "**" + date + "**",
      "### " + title,
      "*" + company + " | Nordrhein-Westfalen*",
      "- " +
        padParagraph(
          "Anforderungen und Risiken strukturiert, Beteiligte abgestimmt und nachvollziehbare Entscheidungen für die weitere Umsetzung vorbereitet",
          38 + (index % 2),
        ),
      "",
    );
  });
  lines.push(
    "## RELEVANTE PROJEKTE & FALLSTUDIEN",
    "- " +
      padParagraph(
        "Einen digitalen Analyseworkflow für konsistente Bedarfsklärung und belastbare Entscheidungsvorlagen konzipiert und umgesetzt",
        44,
      ),
    "- " +
      padParagraph(
        "Ein Rolloutprojekt mit transparenter Steuerung von Anforderungen, Abhängigkeiten und Risiken begleitet",
        42,
      ),
    "",
    "## KERNKOMPETENZEN",
    "- Projekt- und Prozessmanagement: Roadmaps, Priorisierung, Status und Risiken.",
    "- Stakeholder-Management: Moderation, Verhandlung und Management-Kommunikation.",
    "- Digitale Umsetzung: Automatisierte Workflows, strukturierte Daten und KI-Anwendungen.",
    "",
    "## AUSBILDUNG & RELEVANTE WEITERBILDUNG",
    "**2006 - 2009**",
    "### Bachelor of Arts Betriebswirtschaftslehre",
    "*Beispiel Hochschule | Abschluss 2009*",
    "- Data Analyst Weiterbildung mit 540 Stunden im Jahr 2024.",
    "- Kontinuierliche Weiterbildung zu angewandter KI und strukturierten Workflows.",
    "",
    "## SPRACHEN",
    "- Deutsch: Muttersprache.",
    "- Englisch: verhandlungssicher.",
    "- Spanisch: Grundkenntnisse.",
  );
  return lines.join("\n");
}

export function makeValidDraft() {
  const coverParagraphs = [
    padParagraph(
      "Kommunale Krisenfestigkeit entsteht dort, wo Risiken früh sichtbar werden, Zuständigkeiten klar sind und Beteiligte auch unter Zeitdruck auf eine gemeinsame Arbeitsgrundlage zurückgreifen können",
      92,
    ),
    padParagraph(
      "Aus meiner bisherigen Projekt- und Prozesspraxis bringe ich dafür eine belastbare Verbindung aus Anforderungsanalyse, Stakeholder-Steuerung und nachvollziehbarer Dokumentation mit",
      92,
    ),
    padParagraph(
      "In digitalen und organisatorischen Vorhaben habe ich offene Entscheidungen strukturiert, Abhängigkeiten transparent gemacht und unterschiedliche Fachperspektiven in umsetzbare nächste Schritte übersetzt",
      92,
    ),
    padParagraph(
      "Für den Einstieg möchte ich bestehende Abläufe, Schnittstellen und Erfolgskriterien gemeinsam klären und daraus eine verlässliche Priorisierung für Risiken, Maßnahmen und Kommunikation entwickeln",
      92,
    ),
  ];
  const briefClaims = [
    "Die Zielrolle verantwortet strukturierte Kontinuitäts- und Krisenvorsorge.",
    "Das Profil belegt langjährige Projekt- und Prozesssteuerung.",
    "Die konkrete organisatorische Einordnung bleibt vor dem Gespräch zu klären.",
  ];
  const anchors = [
    "Projektanforderungen in priorisierte Arbeitspakete und klare Entscheidungen überführt.",
    "Risiken, Abhängigkeiten und offene Punkte in Statusformaten transparent gemacht.",
    "Unterschiedliche Stakeholder moderiert und gemeinsame Arbeitsgrundlagen geschaffen.",
    "Digitale Workflows aus konkreten Geschäftsanforderungen entwickelt.",
  ];
  const emailProof =
    "Meine langjährige Projekt- und Prozesspraxis verbindet strukturierte Risikoarbeit mit klarer Stakeholder-Kommunikation.";
  const draft = {
    roleTitle: "Sachbearbeitung Krisen- und Kontinuitätsmanagement",
    companyName: "Beispielstadt",
    tailoredCv: cvContent(),
    coverLetter: [
      "# Bewerbung als Sachbearbeitung Krisen- und Kontinuitätsmanagement",
      "Alex Beispiel | Köln | alex@example.test",
      "Beispielstadt",
      "",
      "Sehr geehrte Damen und Herren,",
      "",
      ...coverParagraphs.flatMap((paragraph) => [paragraph, ""]),
      "Mit freundlichen Grüßen",
      "Alex Beispiel",
    ].join("\n"),
    companyBrief: [
      "# Beispielstadt · Rollenbriefing",
      "## BESTÄTIGTE STELLENFAKTEN",
      "- " + briefClaims[0],
      "## ROLLE UND ANFORDERUNGEN",
      "- Kontinuitätsplanung, Risikoübersicht und abgestimmte Krisenorganisation.",
      "## BELEGTE PROFILANSCHLÜSSE",
      "- " + briefClaims[1],
      "## OFFENE PUNKTE UND RISIKEN",
      "- " + briefClaims[2],
      "## QUELLEN",
      "- [Offizielle Stellenanzeige](https://example.test/job)",
    ].join("\n"),
    interviewPrep: [
      "# Interviewmappe · Beispielstadt",
      "## KERNBOTSCHAFT",
      padParagraph(
        "Ich verbinde strukturierte Prozessarbeit, transparente Risikosteuerung und klare Kommunikation, damit Beteiligte auch in anspruchsvollen Situationen handlungsfähig bleiben",
        70,
      ),
      "## ECHTE BELEGANKER",
      ...anchors.map((anchor) => "- " + anchor),
      "## WAHRSCHEINLICHE FRAGEN",
      "- Wie priorisieren Sie Risiken und Maßnahmen?",
      "- Wie schaffen Sie Verbindlichkeit an Schnittstellen?",
      "## EIGENE FRAGEN",
      "- Welche Kontinuitätsprozesse und Eskalationswege bestehen bereits?",
      "- Woran wird ein wirksamer Beitrag nach sechs Monaten erkannt?",
      "## OFFENE RISIKEN UND LERNFELDER",
      "- Fachspezifische Regelwerke und bestehende kommunale Verfahren gezielt vertiefen.",
    ].join("\n"),
    applicationEmailSubject:
      "Bewerbung als Sachbearbeitung Krisen- und Kontinuitätsmanagement",
    applicationEmailBody: [
      "Sehr geehrte Damen und Herren,",
      "",
      padParagraph(
        "die Verbindung aus strukturierter Krisenvorsorge, nachvollziehbaren Prozessen und abgestimmter Zusammenarbeit macht die ausgeschriebene Aufgabe für mich fachlich besonders interessant",
        58,
      ),
      emailProof,
      "Im Anhang finden Sie meinen fokussierten Lebenslauf und mein Anschreiben. Für Rückfragen und ein persönliches Gespräch stehe ich gerne zur Verfügung.",
      "",
      "Mit freundlichen Grüßen",
      "Alex Beispiel",
    ].join("\n"),
    fitHighlights: [
      "Langjährige Projekt- und Prozesssteuerung mit transparenten Entscheidungen.",
      "Belastbare Stakeholder-Kommunikation in anspruchsvollen Veränderungssituationen.",
    ],
    openQuestions: [
      "Organisatorische Einordnung und Prioritäten für die ersten sechs Monate klären.",
    ],
    sources: ["https://example.test/job"],
    evidenceMap: [],
  };

  draft.evidenceMap = [
    {
      artifact: "tailoredCv",
      claim: cvContent().split("\n").find((line) => line.startsWith("Ich verbinde")),
      evidenceIds: ["CV-EV-1"],
      researchClaimIds: [],
    },
    ...experienceEntries.map(([, title], index) => ({
      artifact: "tailoredCv",
      claim: title,
      evidenceIds: ["CV-EV-" + (index + 2)],
      researchClaimIds: [],
    })),
    ...coverParagraphs.slice(0, 3).map((claim, index) => ({
      artifact: "coverLetter",
      claim,
      evidenceIds: ["CV-EV-" + (index + 12)],
      researchClaimIds: [],
    })),
    ...briefClaims.map((claim, index) => ({
      artifact: "companyBrief",
      claim,
      evidenceIds: index === 0 ? [] : ["CV-EV-" + (index + 20)],
      researchClaimIds: index === 0 ? ["JOB-1"] : [],
    })),
    ...anchors.map((claim, index) => ({
      artifact: "interviewPrep",
      claim,
      evidenceIds: ["CV-EV-" + (index + 24)],
      researchClaimIds: [],
    })),
    {
      artifact: "applicationEmailBody",
      claim: emailProof,
      evidenceIds: ["CV-EV-30"],
      researchClaimIds: [],
    },
  ];
  const selectedArtifacts = [
    "tailoredCv",
    "coverLetter",
    "companyBrief",
    "interviewPrep",
    "applicationEmailBody",
  ];
  let evidenceIndex = 0;
  for (const artifact of selectedArtifacts) {
    const statements = draft[artifact]
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .filter((rawLine) => {
        const line = rawLine.trim();
        return (
          line &&
          !/^#{1,6}\s+/.test(line) &&
          !/^BEWERBUNGSFASSUNG\s*\|/i.test(line) &&
          !/^(?:sehr geehrt|guten tag|hallo|dear)/i.test(line) &&
          !/^(?:mit freundlichen grüßen|freundliche grüße|beste grüße|kind regards)/i.test(
            line,
          ) &&
          !/^(?:\*\*)?(?:\d{2}[./]\d{4}|\d{4})\s*[-–—]\s*(?:\d{2}[./]\d{4}|\d{4}|heute|aktuell|present)(?:\*\*)?$/i.test(
            line,
          ) &&
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
          line.split(/\s+/).length >= 6 &&
          !/^(?:im anhang|als anlage|anlagen:|beigefügt)/i.test(line),
      );
    for (const claim of statements) {
      draft.evidenceMap.push({
        artifact,
        claim,
        evidenceIds: ["CV-EV-" + ((evidenceIndex % 40) + 1)],
        researchClaimIds: [],
      });
      evidenceIndex += 1;
    }
  }
  return draft;
}

export const allOutputKinds = [
  "tailored-cv",
  "cover-letter",
  "application-email",
  "company-brief",
  "interview-prep",
];

export const preferencesFixture = {
  formality: "formal",
  addressStyle: "sie",
  language: "Deutsch",
  cvLength: "two_pages",
  focusThemes: ["Prozessoptimierung", "Stakeholder-Management"],
  customFocus: "",
  outputKinds: allOutputKinds,
  modelSettings: {
    "tailored-cv": { model: "terra", effort: "medium" },
    "cover-letter": { model: "terra", effort: "medium" },
    "application-email": { model: "luna", effort: "low" },
    "company-brief": { model: "luna", effort: "low" },
    "interview-prep": { model: "luna", effort: "medium" },
  },
  researchScopes: ["job_posting", "company"],
  researchSelectionMode: "all_confirmed",
  selectedResearchClaimIds: [],
  desiredSalaryAnnual: null,
  minimumSalaryAnnual: null,
  salaryFlexibility: "negotiable",
  mentionSalary: "if_requested",
};

export const qualityContextFixture = {
  masterCv: masterCvFixture,
  validEvidenceIds: masterCvFixture.passport.evidence.map(
    (item) => item.evidenceId,
  ),
  validResearchClaimIds: ["JOB-1"],
  allowedSources: ["https://example.test/job"],
};

export function generationRequestFixture() {
  return {
    jobUrl: "https://example.test/job",
    jobText: "",
    companyName: "Beispielstadt",
    roleTitle: "Sachbearbeitung Krisen- und Kontinuitätsmanagement",
    contactPerson: "",
    requestedAt: "2026-08-06T08:00:00.000Z",
    personalInputs: {
      motivation: "",
      achievements: "",
      strengths: "",
      constraints: "",
      availability: "",
    },
    preferences: preferencesFixture,
    documentDesignContext: {
      selectionConfirmedAt: "2026-08-06T08:00:00.000Z",
      documents: [
        { kind: "tailored-cv", presetId: "gerris", layout: "gerris", customTemplateLayout: null },
        { kind: "cover-letter", presetId: "gerris", layout: "gerris", customTemplateLayout: null },
        { kind: "company-brief", presetId: "gerris", layout: "gerris", customTemplateLayout: null },
        { kind: "interview-prep", presetId: "gerris", layout: "gerris", customTemplateLayout: null },
      ],
      visualizationsEnabled: false,
      visualizations: [],
    },
    confirmedResearchFacts: [
      {
        id: "JOB-1",
        factKey: "role.purpose",
        value: "Strukturierte Kontinuitäts- und Krisenvorsorge",
        sourceUrls: ["https://example.test/job"],
      },
    ],
    confirmedSources: ["https://example.test/job"],
    masterCv: masterCvFixture,
  };
}
