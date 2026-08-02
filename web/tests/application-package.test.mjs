import assert from "node:assert/strict";
import test from "node:test";

import {
  applicationPackageQualityIssues,
  buildLocalApplicationPackage,
} from "../lib/application-package.ts";

const experienceEntries = Array.from({ length: 7 }, (_, index) => {
  const year = 2026 - index * 2;
  return [
    `01/${year} - ${index === 0 ? "heute" : `12/${year + 1}`}`,
    `Rolle ${index + 1} · Projekt- und Prozessverantwortung`,
    `Organisation ${index + 1} | Düsseldorf`,
    "MANDAT & KONTEXT: Steuerung anspruchsvoller Prozesse mit mehreren Stakeholdern, transparenten Entscheidungen und verlässlicher Umsetzung.",
    "• PROJEKT & PROZESS: Anforderungen aufgenommen, priorisiert und in nachvollziehbare Arbeitspakete, Meilensteine und Entscheidungsbedarfe überführt.",
    "• PROJEKT & PROZESS: Status, Risiken, Abhängigkeiten und offene Punkte strukturiert dokumentiert und mit den Beteiligten nachverfolgt.",
    "• PEOPLE & ENABLEMENT: Unterschiedliche Fachperspektiven moderiert, komplexe Inhalte verständlich vermittelt und verlässliche Abstimmung geschaffen.",
    "• DIGITAL & SYSTEME: Daten und Prozessinformationen in konsistente Übersichten und direkt nutzbare Entscheidungsgrundlagen überführt.",
    "• SALES & CONSULTING: Kundenbedarfe qualifiziert, tragfähige Lösungen entwickelt und verbindliche Vereinbarungen vorbereitet.",
  ].join("\n");
}).join("\n");

const cvSource = {
  name: "Gerrit Fabisch",
  headline: "Business Transformation & AI Solutions",
  subheadline:
    "AI-Webapps & Automation | Projekt- und Prozessmanagement | Training & Enablement",
  contactLine: "Düsseldorf | gerrit@example.test | LinkedIn",
  sections: [
    {
      id: "profil",
      heading: "KURZPROFIL",
      content:
        "Studierter Betriebswirt mit langjähriger Erfahrung in Prozesssteuerung, Stakeholder-Management, Kundenberatung und digitaler Umsetzung.\nBesondere Stärke ist die Übersetzung zwischen Geschäft, Menschen und Technologie: Anforderungen werden strukturiert, Interessen moderiert und in tragfähige Prozesse oder verständliche Entscheidungsvorlagen überführt.",
    },
    {
      id: "experience",
      heading: "BERUFSERFAHRUNG | PROJEKT, PROZESS & STEUERUNG",
      content: experienceEntries,
    },
    {
      id: "projects",
      heading: "AUSGEWÄHLTE PROJEKTE & FALLSTUDIEN",
      content: [
        "Recruitment Need Analysis - AI-gestützte Bedarfsklärung",
        "AUSGANGSLAGE: Anforderungen gingen in frühen Prozessschritten verloren und mussten strukturiert geklärt werden.",
        "EIGENER BEITRAG: Produktkonzept, Anforderungslogik, Datenmodell und nutzerorientierter Ablauf wurden eigenständig entwickelt.",
        "UMSETZUNG / ERGEBNIS: Dynamische Rückfragen und konsistente Ausgaben unterstützen Briefing, Interview und Kommunikation.",
        "TRANSFER: Fachpraxis wurde in einen verständlichen digitalen Prozess übersetzt.",
        "CRM- und Rolloutprojekte",
        "AUSGANGSLAGE: Kunden-, Lieferanten- und Systemprozesse mussten zuverlässig verbunden werden.",
        "EIGENER BEITRAG: Anforderungen, Stakeholder, Status und offene Punkte wurden koordiniert.",
        "UMSETZUNG / ERGEBNIS: Rollout-Aufgaben und operative Nutzung wurden nachvollziehbar zusammengeführt.",
        "TRANSFER: Anschlussfähigkeit für Business Analyse, Provider-Steuerung und Change-Kommunikation.",
      ].join("\n"),
    },
    {
      id: "skills",
      heading: "METHODEN- UND TOOL-LANDSCHAFT",
      content: [
        "AI & DATA: Python, OpenAI API, strukturierte Ausgaben und nachvollziehbare Workflow-Steuerung.",
        "DELIVERY: Requirements Engineering, Prozessmapping, Priorisierung, Akzeptanzkriterien und KPI-/Risikoreporting.",
        "BUSINESS SYSTEMS: CRM/ATS, SAP Fieldglass, Microsoft 365, Teams und OneDrive.",
        "Stakeholder-Management mit Fachbereichen, Management, Kunden, Legal und operativen Teams.",
        "Projekt- und Rolloutkoordination mit Status-, Risiko- und Entscheidungstransparenz.",
        "Training, Coaching, Moderation und adressatengerechter Wissenstransfer.",
        "Vertrags-, Preis- und Erwartungsmanagement in internationalen Kundenkontexten.",
      ].join("\n"),
    },
    {
      id: "education",
      heading: "AUSBILDUNG, ZERTIFIKATE & KONTINUIERLICHE WEITERBILDUNG",
      content: [
        "2006 - 2009",
        "Bachelor of Arts (B.A.) - Betriebswirtschaftslehre",
        "Hochschule Fresenius | Abschluss 2009",
        "04/2024 - 07/2024",
        "Data Analyst - Education & Training",
        "540 Stunden Programmierpraxis in Python, Analyse, Machine Learning und Visualisierung.",
        "Angewandte KI für das Personalwesen",
        "Generative KI und strukturierte LLM-Ausgaben",
        "Vertragsgestaltung mit Kunden und Lieferanten",
        "XING Active Recruiting Workshop",
      ].join("\n"),
    },
    {
      id: "languages",
      heading: "SPRACHEN",
      content:
        "DEUTSCH: Muttersprache\nENGLISCH: Verhandlungssicher und internationale Berufspraxis\nSPANISCH: Grundkenntnisse",
    },
  ],
};

test("erzeugt offline ein vollständiges, CV-basiertes Bewerbungspaket", () => {
  const outputKinds = [
    "tailored-cv",
    "cover-letter",
    "application-email",
    "company-brief",
    "interview-prep",
  ];
  const result = buildLocalApplicationPackage({
    companyName: "Stadt Wuppertal",
    roleTitle:
      "Sachbearbeiter*in Kommunales Krisenmanagement / Business Continuity Management",
    contactPerson: "",
    motivation: "",
    achievements: "",
    strengths: "",
    constraints: "",
    availability: "",
    jobUrl: "https://example.test/stellenangebot",
    cvLength: "two_pages",
    focusThemes: [
      "Prozessoptimierung",
      "Projekt- & Programmmanagement",
      "Stakeholder- & Veränderungsmanagement",
      "Governance & öffentliche Verwaltung",
    ],
    outputKinds,
    cvSource,
  });

  assert.deepEqual(
    applicationPackageQualityIssues(result, outputKinds, "two_pages"),
    [],
  );
  assert.ok(result.tailoredCv.split(/\s+/).length >= 650);
  assert.ok(result.coverLetter.split(/\s+/).length >= 320);
  assert.ok(result.interviewPrep.split(/\s+/).length >= 330);
  assert.match(result.tailoredCv, /BEWERBUNGSFASSUNG \| FOKUSSIERTER LEBENSLAUF/);
  assert.match(result.tailoredCv, /ZIELROLLE: Sachbearbeiter\*in/);
  assert.match(result.tailoredCv, /## BERUFSERFAHRUNG/);
  for (let index = 1; index <= 7; index += 1) {
    assert.match(result.tailoredCv, new RegExp(`Rolle ${index}`));
  }
  assert.doesNotMatch(result.tailoredCv, /\[[^\]]*(?:übernehmen|ergänzen)[^\]]*\]/i);
  assert.doesNotMatch(result.applicationEmailBody, /passen sehr gut zu meinem Profil/i);
});

test("verwirft dürftige Platzhalter-Ausgaben am Qualitätsgate", () => {
  const issues = applicationPackageQualityIssues(
    {
      roleTitle: "Zielrolle",
      companyName: "Organisation",
      coverLetter: "Kurzes Anschreiben.",
      tailoredCv:
        "# Lebenslauf\n## Kurzprofil\n[Aus dem Original-CV übernehmen]\n## Berufserfahrung",
      companyBrief: "",
      interviewPrep: "",
      applicationEmailSubject: "Bewerbung",
      applicationEmailBody: "",
      fitHighlights: ["Konkreten Erfolg ergänzen"],
      openQuestions: [],
      sources: [],
    },
    ["tailored-cv", "cover-letter"],
    "two_pages",
  );

  assert.ok(issues.some((issue) => /zu kurz/.test(issue)));
  assert.ok(issues.some((issue) => /Redaktionsplatzhalter/.test(issue)));
  assert.ok(issues.some((issue) => /zu wenig belastbare Abschnitte/.test(issue)));
});
