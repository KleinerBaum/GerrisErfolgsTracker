import {
  JOB_RADAR_RECORDS,
  JOB_RADAR_VERIFIED_AT,
  type JobRadarRecord,
} from "./application-research-2026-08-01.ts";
import {
  DEFAULT_APPLICATION_GENERATION_PREFERENCES,
  normalizeApplicationActivities,
  normalizeApplicationContacts,
  normalizeApplicationDocumentDesign,
  normalizeApplicationGenerationInputs,
  normalizeApplicationGenerationPreferences,
} from "./application-workflow.ts";
import type {
  ApplicationProcess,
  ApplicationResearchTier,
  JobResearchClaim,
  JobResearchEvidenceClass,
  JobResearchEvidenceStatus,
  JobResearchFactKey,
  JobResearchGap,
  JobResearchSource,
  SalaryOutlook,
} from "./types";

type VacancySeed = readonly [
  rank: number,
  jobTitle: string,
  company: string,
  location: string,
  deadline: string | null,
  publishedTerms: string,
  compensation: string,
  salaryOutlook: SalaryOutlook,
  fitRating: string,
  researchSummary: string,
];

const LEGACY_VERIFIED_AT = "2026-07-29";
const LEGACY_SHORTLIST = new Set([
  1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 14, 18, 19, 23,
]);

function isSavedVacancyResearch(
  value: unknown,
): value is NonNullable<ApplicationProcess["vacancyResearch"]> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<
    NonNullable<ApplicationProcess["vacancyResearch"]>
  >;
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.requestedUrl === "string" &&
    typeof candidate.researchedAt === "string" &&
    Array.isArray(candidate.adFacts) &&
    Array.isArray(candidate.enrichment) &&
    Array.isArray(candidate.sources)
  );
}

const VACANCY_SEEDS = [
  [
    1,
    "Sachbearbeitung Kommunales Krisenmanagement / Business Continuity",
    "Stadt Wuppertal",
    "Wuppertal",
    "2026-08-10",
    "Unbefristet · Voll- oder Teilzeit · Homeoffice",
    "EG 10 TVöD / A 11",
    "yes",
    "A",
    "BWL und Business Administration werden ausdrücklich akzeptiert. Prozesse, Risiken, Projektsteuerung, Beratung und Krisenorganisation passen sehr gut.",
  ],
  [
    2,
    "Digitaler Lotse / Prozessmanager / Datenschutz-Sachbearbeiter",
    "Stadt Krefeld",
    "Krefeld",
    "2026-08-09",
    "Unbefristet · geplanter Beginn 18.02.2027",
    "EG 11 / A 12",
    "yes",
    "A−",
    "Roadmaps, Prozessoptimierung, Softwareeinführungen und Datenschutz. Die App-Projekte sollten als mehrjährige Digitalisierungserfahrung dokumentiert werden.",
  ],
  [
    3,
    "Prozesskoordination im Programmbereich Geschäftsarchitektur",
    "Bundesverwaltungsamt",
    "Düsseldorf oder Köln",
    "2026-08-03",
    "Unbefristet · Voll- oder Teilzeit",
    "EG 11 TVöD Bund",
    "yes",
    "A−/B+",
    "Prozessmanagementsystem, Optimierungen, Qualität, Wirtschaftlichkeit und Anbietersteuerung. Sehr dringliche Bewerbung.",
  ],
  [
    4,
    "Projektmanager Verwaltungsmodernisierung, Digitalisierung und Change",
    "Stadt Ratingen",
    "Ratingen",
    "2026-08-17",
    "Zwei Stellen · unbefristet · Voll- oder Teilzeit",
    "EG 11 / A 12",
    "yes",
    "B+",
    "DMS, E-Akte, Finanzsoftware, Prozessanalysen, Workshops und Change. Kritisch ist der Nachweis dreijähriger entsprechend hochwertiger Projektarbeit.",
  ],
  [
    5,
    "Projektleitung Programmbereich Projektsteuerung",
    "Bundesverwaltungsamt",
    "Düsseldorf oder Köln",
    "2026-08-17",
    "Unbefristet · Voll- oder Teilzeit",
    "EG 11 / A 12–A 13 mZ",
    "yes",
    "B+",
    "Projektpläne, Kosten, Qualität, Ziele, Risiken und Workshops. Vermittlungs- und App-Projekte als verantwortete Projekte mit Ergebnissen darstellen.",
  ],
  [
    6,
    "Experte Contact Center AI, Conversational AI und Agentic AI",
    "KV Nordrhein",
    "Köln",
    "2026-08-27",
    "Arbeitsumfang nicht näher veröffentlicht",
    "EG 13 TV-L",
    "yes",
    "A−/B+",
    "Voice- und Chatbots, Agentic AI, Prompts, Trainingsdaten, APIs, Cloud, Anbieter und Workshops. Eine der stärksten Verbindungen zur OpenAI-API-Praxis.",
  ],
  [
    7,
    "Business Project Manager Conversational AI und Cloud-Technologien",
    "Commerz Direktservice",
    "Duisburg",
    null,
    "Vollzeit · veröffentlicht am 20.07.2026 · keine Frist genannt",
    "Privatwirtschaftlich",
    "open",
    "A−/B+",
    "AI-Chatbots, Voicebots, Agent Assist, Business Cases, KPIs, Roll-outs, Anbieter und Stakeholder. Fehlende Bank- und Contact-Center-Erfahrung ist erklärbar.",
  ],
  [
    8,
    "Strategischer Inhouse Consultant / Projektmanager",
    "KV Nordrhein",
    "Düsseldorf",
    "2026-08-14",
    "Arbeitsumfang nicht näher veröffentlicht",
    "EG 13 TV-L",
    "yes",
    "B+",
    "Strategie, Digitalisierung, E-Health, Reorganisation und Prozessoptimierung. Verlangt werden allerdings etwa fünf Jahre PM- oder Consulting-Erfahrung.",
  ],
  [
    9,
    "Projektmanager IT und Digitalisierung",
    "GELSENDIENSTE",
    "Gelsenkirchen",
    "2026-08-04",
    "Unbefristet · Vollzeit · Teilzeit möglich",
    "EG 10 TVöD",
    "yes",
    "A−/B+",
    "BWL wird akzeptiert. Digitalstrategie, Projektcontrolling, Reporting, Datenschutz, M365 und SAP. Die kurze Frist macht die Stelle besonders dringlich.",
  ],
  [
    10,
    "Digitalisierungsberatung – Schwerpunkt Dokumentenmanagementsysteme",
    "ITK Rheinland",
    "Neuss",
    "2026-08-23",
    "Unbefristet · Vollzeit",
    "Bis EG 10",
    "yes",
    "A−/B+",
    "BWL-nahe Studiengänge werden akzeptiert; DMS-Erfahrung ist erwünscht, aber nicht zwingend. Ist-/Soll-Konzepte, d.velop, Koordination und Schulungen.",
  ],
  [
    11,
    "Übergreifendes Projekt-, Programm- und Prozessmanagement in der IT",
    "Bundesverwaltungsamt",
    "Köln",
    "2026-08-06",
    "Unbefristet · Voll- oder Teilzeit",
    "EG 10 / 11",
    "yes",
    "B+",
    "IT-Governance, Budget, Steuerung, Berichte, Strategie, Innovation und Provider. Benötigt werden zwei Jahre organisationsübergreifende IT-Steuerung oder drei Jahre vergleichbare Erfahrung.",
  ],
  [
    12,
    "Junior Governance Manager",
    "Bank11",
    "Neuss",
    null,
    "Aktuell offen · Vollzeit",
    "Privatwirtschaftlich",
    "open",
    "A−/B+",
    "Richtlinien, Prozesse, MaRisk, DORA, DSGVO, Risiken, Kontrollen, Prüfungen, Berichte und Trainings. Für die Junior-Ausrichtung ungewöhnlich gute BWL- und Prozess-Passung.",
  ],
  [
    13,
    "Digitalization Manager",
    "TARGOBANK",
    "Düsseldorf",
    null,
    "Aktuell offen · unbefristet · Voll- oder Teilzeit · bis 50 % mobil",
    "Privatwirtschaftlich · 13 Gehälter",
    "open",
    "B+",
    "Digitale Initiativen, Automatisierung, Prozessoptimierung und Managementunterlagen. Hürde: zwei bis drei Jahre PM- oder Product-Erfahrung im Finanzumfeld.",
  ],
  [
    14,
    "Prozess- und IT-Koordinator",
    "IDN Infrastruktur-Dienstleistung Niederrhein",
    "Krefeld",
    null,
    "Aktuell offen · unbefristet · mobiles Arbeiten",
    "Privatwirtschaftlich",
    "open",
    "A−/B+",
    "IT-Systeme, Prozesse, Roll-outs, externe Partner, Datenschutz, Dokumentation und Schulungen. ERP, M365, Power Platform oder BI wären Ergänzungsthemen.",
  ],
  [
    15,
    "Teamlead IT Service & Innovation",
    "HITS.nrw",
    "Düsseldorf",
    null,
    "Aktuell offen · unbefristet · Vollzeit · hybrid",
    "Vergütung nicht veröffentlicht",
    "open",
    "B+",
    "Bedarfsanalyse, IT-Services, Helpdesk, Innovation, Schulungen und kleine Teamleitung. ITIL- und Service-Management-Wissen sollte kurzfristig aufgebaut werden.",
  ],
  [
    16,
    "Referent der Geschäftsführung – Strategie, Gremien und Kommunikation",
    "HITS.nrw",
    "Düsseldorf",
    null,
    "Aktuell offen · unbefristet · Vollzeit · hybrid",
    "Vergütung nicht veröffentlicht",
    "open",
    "B+",
    "Transformationsprojekte, Entscheidungsvorlagen, Behörden, Gremien, Workshops und Veranstaltungen. Sehr gute Verbindung zur Kommunikations- und BWL-Erfahrung.",
  ],
  [
    17,
    "IT-Projektmanager / Integration Specialist für Lernplattformen und Campus-Systeme",
    "HITS.nrw",
    "Düsseldorf",
    null,
    "Aktuell offen · zunächst befristet mit Perspektive · hybrid",
    "Vergütung nicht veröffentlicht",
    "open",
    "B",
    "Anforderungen, Tests, Roll-outs, APIs und Datenflüsse. Moodle/ILIAS, HISinOne sowie XML-/REST-Erfahrung fehlen teilweise, sind aber anschlussfähig.",
  ],
  [
    18,
    "Projektmanager Fördermittelmanagement",
    "Connected Mobility Düsseldorf",
    "Düsseldorf",
    null,
    "Ausschreibungsseite aktiv · keine Frist genannt",
    "Vergütung nicht veröffentlicht",
    "open",
    "A−/B+",
    "Förderanträge, Partner, Mittelverwendung, Projektcontrolling und Digitalisierung/Mobilität. Fördermittelrecht ist die zentrale Lernlücke; Status wegen eines vergangenen Startdatums zuerst bestätigen.",
  ],
  [
    19,
    "Project Office Manager – Schwerpunkt Portfoliomanagement",
    "rku.it",
    "Herne",
    null,
    "Aktuell offen · unbefristet · bis 60 % mobil",
    "Versorgungswirtschaftlicher Tarif",
    "open",
    "A−/B+",
    "Portfoliotransparenz, Berichte, Risiken, Prioritäten und Governance. Verlangt werden zwei bis drei Jahre Projekterfahrung.",
  ],
  [
    20,
    "Business Project Manager Dialogplattform",
    "Commerz Direktservice",
    "Duisburg",
    null,
    "Vollzeit · veröffentlicht am 10.07.2026",
    "Privatwirtschaftlich",
    "open",
    "A−/B+",
    "Cloud-Contact-Center, Omnichannel, agile Umsetzung, Regulierung und Übersetzung zwischen Technik, Business und Management.",
  ],
  [
    21,
    "Projektmanager Studiengangsentwicklung",
    "FOM Hochschule",
    "Essen",
    null,
    "Aktuell offen · Vollzeit · 36-Stunden-/Vier-Tage-Woche",
    "Vergütung nicht veröffentlicht",
    "open",
    "A−/B+",
    "Projektsteuerung von der Idee bis zur Umsetzung, digitale Werkzeuge, Marktanforderungen, Akkreditierung und interne Teams.",
  ],
  [
    22,
    "HR-Projektmanager Digitalisierung",
    "Siempelkamp",
    "Krefeld",
    null,
    "Aktuell gelistet",
    "Privatwirtschaftlich",
    "open",
    "A−/B+",
    "Strategische HR- und Digitalprojekte, HR-Systeme, Stammdaten und datenbasierte Personalarbeit. Gute Verbindung aus Recruiting und Data Science; spezifische HRIS-Erfahrung wäre hilfreich.",
  ],
  [
    23,
    "Sachgebietsleitung/Koordination Zweiter Arbeitsmarkt",
    "Stadt Krefeld",
    "Krefeld",
    "2026-08-09",
    "Unbefristet · vorgesehener Beginn 01.06.2027",
    "EG 11 / A 12",
    "yes",
    "B+",
    "Beschäftigungsprojekte, Teamsteuerung, Drittmittel, Budget und Controlling. SGB II/III sowie kommunales Förderrecht sind die Hauptlücken.",
  ],
  [
    24,
    "Projektleitung öffentlich geförderter Maßnahmen",
    "EuBiA",
    "Düsseldorf / Rheinland / Ruhrgebiet",
    null,
    "Aktuell offen · unbefristet · Vollzeit",
    "Vergütung nicht veröffentlicht",
    "open",
    "B+",
    "Mehrere Projekte, Personal, Coaching, Jobcenter, Qualität und Reporting. Sehr passende Recruiting- und Mehrparteienerfahrung; SGB-Kenntnisse fehlen.",
  ],
  [
    25,
    "Inhouse Consultant Strategie und Transformation",
    "Wirtschaftsbetriebe Duisburg",
    "Duisburg",
    null,
    "Aktuell offen · zunächst zwölf Monate · bis 80 % Homeoffice",
    "Im Treffer nicht eindeutig ausgewiesen",
    "open",
    "A−/B+",
    "Strategie 2030, Transformation, KPIs, Workshops und bereichsübergreifende Projekte. Sehr gute Transferrolle.",
  ],
  [
    26,
    "Referent Multiprojektmanagement",
    "Ruhrbahn",
    "Essen",
    null,
    "Aktuell offen · Vollzeit",
    "TV-N NRW",
    "open",
    "B+",
    "Portfolio-Reporting, KPIs, Ressourcen, Kosten, Risiken und PM-Standards. Benötigt werden belastbare Beispiele paralleler Projekte und Managementberichte.",
  ],
  [
    27,
    "Projektmanager Veranstaltungen",
    "Duisburg Kontor",
    "Duisburg",
    null,
    "Aktuell auf der Arbeitgeberseite · Vollzeit",
    "Mindestens analog EG 9a · Jahressonderzahlung",
    "borderline",
    "A−/B",
    "Veranstaltungen, Dienstleister, Budgets, Partner und kreative Konzepte. Erfahrene Quereinsteiger werden berücksichtigt; formelle Veranstaltungserfahrung sollte belegt werden.",
  ],
  [
    28,
    "Projektmanager digitale Ansprache-Services",
    "S-Communication Services",
    "Düsseldorf",
    null,
    "Aktuell offen · Voll- oder Teilzeit · Homeoffice",
    "Vergütung nicht veröffentlicht",
    "open",
    "B+",
    "Digitale Kommunikationsservices für Sparkassen, Projektsteuerung und Stakeholderarbeit. Die Finanzbranche ist die wichtigste fachliche Lücke.",
  ],
  [
    29,
    "Projektleiter Bankorganisation und IT-Projekte",
    "Bank11",
    "Neuss",
    null,
    "Im offiziellen Bank11-Stellenportal weiterhin gelistet · Vollzeit",
    "Privatwirtschaftlich",
    "open",
    "B+",
    "Schnittstelle zwischen Fachbereichen, IT und Regulierung. Die aktuelle Listung wurde zusätzlich im Arbeitgeberportal geprüft.",
  ],
  [
    30,
    "Sachbearbeiter Grundsicherung und Hilfe zum Lebensunterhalt",
    "Stadt Wuppertal",
    "Wuppertal",
    "2026-08-11",
    "Unbefristet · Teilzeit/Homeoffice möglich",
    "EG 9c / A 10",
    "yes",
    "A−",
    "BWL wird akzeptiert. Beratung, Prüfung, Entscheidungen, Hausbesuche und Widersprüche. Sehr KI-resilient; SGB XII muss erlernt werden.",
  ],
  [
    31,
    "Projektassistenz CoLab Curriculumentwicklung",
    "Heinrich-Heine-Universität",
    "Düsseldorf",
    "2026-08-14",
    "Befristet bis 31.12.2029 · Vollzeit",
    "EG 9a TV-L",
    "borderline",
    "A",
    "Projektplanung, Workshops, Prozessdokumentation, Budget, Stakeholder und digitale Kommunikation. Inhaltlich eine der unmittelbarsten Passungen.",
  ],
  [
    32,
    "Projektassistenz Task Force Großprojektmanagement",
    "Bundesverwaltungsamt",
    "Köln",
    "2026-08-12",
    "Auf zwei Jahre befristet",
    "EG 10 TVöD Bund",
    "yes",
    "A−/B+",
    "Portfoliokoordination, Budget- und Projektcontrolling, Workshops, Briefings und Steuerungsunterlagen.",
  ],
  [
    33,
    "Standort-/Projektkoordination",
    "EuBiA",
    "Düsseldorf, Mettmann und Ratingen",
    null,
    "Aktuell im Stellenportal",
    "Nicht veröffentlicht",
    "open",
    "A−/B+",
    "Organisation, Mitarbeitende, Teilnehmende, Auftraggeber und Qualität. Details und konkreter Standort müssen im Portal ausgewählt werden.",
  ],
  [
    34,
    "Jobcoach",
    "EuBiA",
    "Düsseldorf / Rheinland",
    null,
    "Aktuell offen · Voll- oder Teilzeit · unbefristet",
    "Nicht veröffentlicht",
    "open",
    "B+",
    "Einzel- und Gruppencoaching, Bewerbung, Aktivierung und persönliche Stabilisierung. Pädagogische beziehungsweise Coaching-Qualifikation muss argumentiert werden.",
  ],
  [
    35,
    "Portalmanager",
    "Verbraucherzentrale NRW",
    "Düsseldorf",
    "2026-08-09",
    "Unbefristet · Vollzeit",
    "EG 11 TV-L",
    "yes",
    "B−",
    "Webplattform mit mehr als 25 Sites, Releases, Incidents, Dienstleister, Budgets und Schulungen. Starke Drupal-, Web-Infrastruktur- und DNS-Erfahrung wird erwartet.",
  ],
  [
    36,
    "Berater für DMS-Projekte und E-Akte",
    "Stadt Wuppertal",
    "Wuppertal",
    "2026-08-09",
    "Unbefristet · mindestens 35 Stunden · Homeoffice",
    "EG 10 / A 10",
    "yes",
    "B−/C",
    "Aufgaben passen, aber gefordert werden eine formale IT-Qualifikation beziehungsweise Zertifizierungen und SQL-Datenbankmodule.",
  ],
  [
    37,
    "Mitarbeiter Digitalisierung und Prozessmanagement",
    "Stadtwerke Ratingen",
    "Ratingen",
    null,
    "Aktuell offen · mobiles Arbeiten möglich",
    "Nicht veröffentlicht",
    "open",
    "B",
    "Digitale Workflows, Wilken-Software, Anwenderbegleitung, Vertragsadministration, SQL und Excel. Energiewirtschaft und Wilken fehlen.",
  ],
  [
    38,
    "Mitarbeiter TUIV-Support und Digitalisierung",
    "Stadt Kaarst",
    "Kaarst",
    "2026-08-09",
    "Unbefristet · Vollzeit",
    "EG 9a",
    "borderline",
    "B−/C",
    "Anwender-, Arbeitsplatz- und Fachverfahrenssupport. Formale IT- oder Verwaltungsqualifikation ist die Hürde.",
  ],
  [
    39,
    "Sachbearbeitung IT, Digitalisierungsprozesse und Komponenten",
    "Stadt Krefeld",
    "Krefeld",
    "2026-08-02",
    "Unbefristet",
    "EG 9a / A 9",
    "borderline",
    "B−/C",
    "Roll-outs, Administration, Projekte und Support. Formal stärker auf ausgebildete IT- oder Verwaltungsfachkräfte zugeschnitten.",
  ],
  [
    40,
    "ERP-Prozess- und IT-Koordinator Wohnungswirtschaft",
    "Wohnstätte Krefeld",
    "Krefeld",
    null,
    "Aktuell offen · 37 Stunden · mobiles Arbeiten",
    "Tarif Wohnungswirtschaft",
    "open",
    "B−/C",
    "ERP-Strategie, Prozesse, Projekte und Support. Gefordert wird typischerweise eine IT- oder Immobilienausbildung sowie Wohnungswirtschafts-ERP-Erfahrung.",
  ],
  [
    41,
    "IT Service Manager",
    "NRW.BANK",
    "Düsseldorf",
    null,
    "Aktuell offen",
    "Banktarif / individuell",
    "open",
    "B−",
    "BWL wird akzeptiert; Provider, Verträge, SLAs und Cloud passen. Enterprise-IT, Azure/M365, ITIL und Bankregulatorik sind deutliche Lücken.",
  ],
  [
    42,
    "Notfallbeauftragter / Business Continuity Manager",
    "Bank11",
    "Neuss",
    null,
    "Aktuell offen · unbefristet · Vollzeit",
    "Privatwirtschaftlich",
    "open",
    "B−/C",
    "BIA, Notfallpläne, Übungen, IT und Operational Risk. Gefordert werden mehrjährige BCM-Erfahrung und BSI-/ISO-Kenntnisse.",
  ],
  [
    43,
    "Product Owner Eigeneinrichtungen",
    "KV Nordrhein",
    "Düsseldorf",
    "2026-08-02",
    "Arbeitsumfang nicht näher veröffentlicht",
    "EG 14 TV-L",
    "yes",
    "B",
    "Produktvision, Prozesse, Anbieter, Beschaffung, KPIs, Verträge und Recruiting. Sehr hohe Vergütung, aber umfangreiche Kenntnisse des Gesundheitswesens werden erwartet.",
  ],
  [
    44,
    "Koordinator Kompetenz im KI:Expertisezentrum.nrw",
    "Ruhr-Universität Bochum",
    "Bochum",
    "2026-08-09",
    "75–100 % · befristet bis Ende 2030",
    "EG 13 TV-L",
    "yes",
    "B−/C",
    "KI-Weiterbildung, Beratung, Hochschulnetzwerke und Trainings passen ausgezeichnet; ein Masterabschluss wird jedoch verlangt.",
  ],
  [
    45,
    "Sachbearbeitung Ausbildung und Personalentwicklung",
    "Heinrich-Heine-Universität",
    "Düsseldorf",
    "2026-08-24",
    "Befristet",
    "EG 9b TV-L",
    "borderline",
    "A−",
    "Ausbildung, Koordination und Personalentwicklung passen sehr gut. Das 50k-Ziel hängt von der anerkannten Erfahrungsstufe ab.",
  ],
  [
    46,
    "Personalreferent",
    "Kunstsammlung Nordrhein-Westfalen",
    "Düsseldorf",
    "2026-08-31",
    "50 % · befristet bis 31.12.2027",
    "EG 10 TV-L bei 50 %",
    "no",
    "A",
    "BWL und zwei Jahre HR-Erfahrung werden akzeptiert. Fachlich sehr passend, wirtschaftlich wegen des Umfangs nicht tragfähig.",
  ],
  [
    47,
    "Projektmanager Handwerk und Digitalisierung",
    "Regh",
    "Duisburg",
    null,
    "Aktuell offen · Vollzeit",
    "Etwa 42.000–50.000 Euro",
    "borderline",
    "A−/B+",
    "Digitales Onboarding, Personalakten, administrative Prozesse, ERP und Anbieter. Sehr praxisnah, aber beim Gehalt die obere Grenze aktiv verhandeln.",
  ],
  [
    48,
    "Projektmanager AI und Automation",
    "Schmitt Engineering",
    "Mülheim",
    null,
    "Aktuell offen · Vollzeit · Arbeitnehmerüberlassung",
    "Nicht veröffentlicht",
    "open",
    "B−",
    "AI-Use-Cases, Business Cases, KPIs, Roll-outs, Power Platform/RPA, SQL und Python. Formell werden technische beziehungsweise Data-Science-Abschlüsse bevorzugt.",
  ],
  [
    49,
    "Projektmanager PMO für Strategie- und Prozessprojekte",
    "Deuka",
    "Düsseldorf",
    null,
    "Aktuell laut Stellenportal · Vollzeit",
    "Nicht veröffentlicht",
    "open",
    "A−/B+",
    "Strategie, Prozesse, Asana, KPIs, Risiken, Meilensteine und Workshops. Nur über Drittquelle verifiziert; Arbeitgeberportal vor Bewerbung gegenprüfen.",
  ],
  [
    50,
    "Mitarbeit Projekt „Master öffentliche Verwaltung“",
    "HSPV NRW",
    "Gelsenkirchen",
    "2026-08-24",
    "50 % · befristet bis 30.06.2030",
    "EG 11 TV-L bei 50 %",
    "no",
    "A−",
    "BWL wird akzeptiert. Service Learning, AI-gestütztes Blended Learning, Koordination und digitale Materialien passen sehr gut; der Umfang ist wirtschaftlich nicht ausreichend.",
  ],
  [
    51,
    "Mitarbeit AI-gestützte Selbstlernwerkzeuge und digitale Prüfungen",
    "HSPV NRW",
    "Gelsenkirchen",
    "2026-08-10",
    "50 % · befristet bis 2030",
    "EG 13 TV-L bei 50 %",
    "no",
    "B−/C",
    "Python und AI-Lernwerkzeuge passen; gefordert wird jedoch ein einschlägiger Masterabschluss.",
  ],
  [
    52,
    "BCB Officer / Business Continuity",
    "Stadtsparkasse Wuppertal",
    "Wuppertal",
    "2026-08-07",
    "Unbefristet · 50 %",
    "TVöD bei 50 %",
    "no",
    "B−/C",
    "BWL wird akzeptiert; BIA, RIA, Notfallhandbuch und Übungen. Erforderlich sind Sparkassen- oder Bankerfahrung und BCM-Weiterbildung.",
  ],
  [
    53,
    "Sachbearbeitung Fortbildungen und Lehrgänge",
    "Akademie für Öffentliches Gesundheitswesen",
    "Düsseldorf",
    "2026-08-07",
    "Vorgesehener Beginn 01.09.2026",
    "EG 8 TV-L",
    "no",
    "A−/B",
    "Teilnehmenden- und Dozentenbetreuung, digitale Medien und Veranstaltungsorganisation. Gefordert wird eher eine kaufmännische Ausbildung; das Studium ist höherwertig.",
  ],
  [
    54,
    "Projektunterstützung Digitalisierung",
    "Stadt Ratingen",
    "Ratingen",
    "2026-08-17",
    "Unbefristet",
    "EG 8 / A 8",
    "no",
    "A−/B",
    "Projektpläne, Ressourcen, Serviceportal und OZG. Inhaltlich guter Einstieg, aber für die wirtschaftlichen Verpflichtungen zu niedrig eingruppiert.",
  ],
  [
    55,
    "Sachbearbeitung Kommunales Krisenmanagement / BCM – anspruchsvollere Variante",
    "Stadt Wuppertal",
    "Wuppertal",
    "2026-08-10",
    "Unbefristet",
    "EG 11 / A 12",
    "yes",
    "B−/C",
    "Im Gegensatz zur EG-10-Stelle werden Kenntnisse in ISO 22301, BSI 200-4 und ISO 22361 ausdrücklich vorausgesetzt.",
  ],
  [
    56,
    "BCM-Architekt",
    "Stadt Wuppertal",
    "Wuppertal",
    "2026-08-10",
    "Unbefristet",
    "EG 11 / A 11",
    "yes",
    "B−/C",
    "Formell Informatik, Wirtschaftsinformatik, Risiko- oder Sicherheitsmanagement oder vergleichbarer Abschluss; zusätzlich BSI 200-4, BIA und IT-Infrastruktur.",
  ],
  [
    57,
    "Informationssicherheitsbeauftragter",
    "HSPV NRW",
    "Gelsenkirchen",
    "2026-08-18",
    "Unbefristet · Kurzinfo mit Frist 18.08.2026",
    "EG 12",
    "yes",
    "C",
    "ISMS, Risiken, Incidents und Krisen passen thematisch; gefordert werden jedoch mehrjährige Informationssicherheit sowie BSI- und ISO-27001-Praxis. Der Detailtext enthält offenbar einen Jahreszahlfehler.",
  ],
  [
    58,
    "Referent Notfall- und Krisenmanagement",
    "Akademie für Öffentliches Gesundheitswesen",
    "Düsseldorf",
    "2026-08-16",
    "Arbeitsumfang nicht näher veröffentlicht",
    "EG 12 TV-L",
    "yes",
    "B−/C",
    "Krisenstäbe, Workshops und Bevölkerungsschutz; einschlägiges Studium in Sicherheits-, Gesundheits- oder Krisenmanagement wird erwartet.",
  ],
  [
    59,
    "Referent Digitale Verwaltung",
    "Justizministerium NRW",
    "Düsseldorf",
    "2026-07-31",
    "Zugang höherer Dienst beziehungsweise entsprechende Laufbahnvoraussetzungen",
    "Nicht näher veröffentlicht",
    "open",
    "C",
    "Digitale Justizvollzugsverwaltung, E-Akte, my.NRW und Datenschutz passen inhaltlich; der Zugang ist auf den höheren Dienst beziehungsweise entsprechende Master- oder Laufbahnvoraussetzungen ausgerichtet.",
  ],
  [
    60,
    "Leitung einer Organisationseinheit",
    "Stadt Neuss",
    "Neuss",
    "2026-08-08",
    "Unbefristet",
    "EG 12 / A 13",
    "yes",
    "B−/C",
    "BWL mit Organisationsschwerpunkt wird akzeptiert; verlangt wird jedoch mehrjährige Organisationsberatung innerhalb einer Behörde und Führung eines Teams.",
  ],
  [
    61,
    "Beratung Sozial- und Integrationsmanagement für Geflüchtete",
    "Stadt Haan",
    "Haan",
    "2026-08-09",
    "Arbeitsumfang nicht näher veröffentlicht",
    "Nicht näher veröffentlicht",
    "open",
    "C",
    "Kommunikations- und Vermittlungsfähigkeit passen, aber üblicherweise wird ein Studium der Sozialarbeit/Sozialpädagogik oder eine anerkannte vergleichbare Qualifikation verlangt.",
  ],
  [
    62,
    "Steuerungsunterstützung der technischen Betriebsleitung",
    "Stadt Düsseldorf",
    "Düsseldorf",
    "2026-08-06",
    "Unbefristet",
    "EG 11",
    "yes",
    "C",
    "Projektkoordination, Strategie, Controlling und Gremien passen; ein technischer beziehungsweise ingenieurwissenschaftlicher Abschluss wird vorausgesetzt.",
  ],
  [
    63,
    "Abteilungsleitung Versorgungsinnovationen / Head of Healthcare Innovation",
    "KV Nordrhein",
    "Düsseldorf",
    "2026-07-31",
    "Arbeitsumfang nicht näher veröffentlicht",
    "Nicht näher veröffentlicht",
    "open",
    "B−/C",
    "Digital-Health-Strategie und Innovationsprojekte sind attraktiv; verlangt werden Führungserfahrung, Gesundheitsmarktkenntnisse und aktuelle große Projekterfolge.",
  ],
  [
    64,
    "Sachbearbeitung studiengangsbezogene Evaluation",
    "HSPV NRW",
    "Gelsenkirchen",
    "2026-08-20",
    "Befristet bis 30.06.2030",
    "EG 13",
    "yes",
    "C",
    "Qualitätsmanagement, Prozessportal und Evaluation; ein sozialwissenschaftlicher Master mit empirischer Forschung wird verlangt.",
  ],
  [
    65,
    "Spezialist Künstliche Intelligenz",
    "Bank11",
    "Neuss",
    null,
    "Aktuell offen · Vollzeit",
    "Privatwirtschaftlich",
    "open",
    "B−/C",
    "Entwicklung kognitiver Systeme und LLM-Lösungen passt; gefordert werden ein Informatikabschluss oder Vergleichbares und etwa drei Jahre professionelle AI- oder Robotik-Entwicklung.",
  ],
  [
    66,
    "Referent Datenschutz",
    "Bank11",
    "Neuss",
    null,
    "Aktuell offen · Vollzeit",
    "Privatwirtschaftlich",
    "open",
    "C",
    "Datenschutzberatung und Governance sind interessant; die Stelle verlangt jedoch ein juristisches Studium und entsprechende Berufspraxis.",
  ],
  [
    67,
    "IT-Projektleitung Finanzbereich / S4HANA",
    "Stadt Köln",
    "Köln",
    "2026-08-18",
    "Unbefristet · Voll- oder Teilzeit",
    "EG 13 TVöD-IKT",
    "yes",
    "C",
    "Projekt- und BWL-Anteile passen, aber ein einschlägiger IT-Abschluss und substanzielle SAP-S/4HANA-Erfahrung sind erforderlich.",
  ],
  [
    68,
    "Projektmanager Laborneubau",
    "CVUA-RRW",
    "Krefeld",
    "2026-08-02",
    "Unbefristet",
    "EG 13 TVöD",
    "yes",
    "C",
    "Bauherrenvertretung, Kosten, Termine, Verträge und externe Planer; zwingend ist ein Bau- oder Architekturabschluss mit großer Bauprojekterfahrung.",
  ],
  [
    69,
    "Projektmanager kaufmännische Projektsteuerung",
    "BLB NRW",
    "Düsseldorf",
    "2026-07-29",
    "Unbefristet · bis 60 % mobil",
    "Etwa 51.460–82.590 Euro",
    "yes",
    "C",
    "Im Rechercheanhang als thematisch ähnliche Stelle mit erheblicher formaler Hürde geführt.",
  ],
  [
    70,
    "Initiativbewerbung für IT-Projekte und digitale Finanzverwaltung",
    "Rechenzentrum der Finanzverwaltung NRW",
    "Kaarst oder Paderborn",
    "2027-01-31",
    "Initiativbewerbung",
    "Abhängig vom Einsatz",
    "open",
    "C",
    "Im Rechercheanhang als langfristige Initiativoption für IT-Projekte und digitale Finanzverwaltung geführt.",
  ],
  [
    71,
    "Sachbearbeitung Inbetriebnahmemanagement",
    "Stadt Wuppertal",
    "Wuppertal",
    "2026-08-20",
    "Unbefristet",
    "EG 11",
    "yes",
    "C",
    "Projekt-, Prozess- und Koordinationsanteile passen; verlangt werden Ingenieurstudium, technische Gebäudeausrüstung und Facility-Management-Erfahrung.",
  ],
  [
    72,
    "Sachbearbeitung Energiemanagement",
    "Stadt Wuppertal",
    "Wuppertal",
    "2026-08-16",
    "Unbefristet",
    "EG 10",
    "yes",
    "C",
    "Zukunftsfestes Projekt- und Nachhaltigkeitsfeld, aber fachtechnische Energie- oder Ingenieurqualifikation ist voraussichtlich zwingend.",
  ],
] as const satisfies readonly VacancySeed[];

function legacyTierFor(rank: number): ApplicationResearchTier {
  if (rank <= 32) return "top";
  if (rank <= 54) return "plausible";
  return "stretch";
}

function legacyVacancy(seed: VacancySeed): ApplicationProcess {
  const [
    rank,
    jobTitle,
    company,
    location,
    deadline,
    publishedTerms,
    compensation,
    salaryOutlook,
    fitRating,
    researchSummary,
  ] = seed;
  return {
    id: `vacancy-${rank}`,
    researchRank: rank,
    researchTier: legacyTierFor(rank),
    shortlisted: LEGACY_SHORTLIST.has(rank),
    jobTitle,
    company,
    location,
    deadline,
    publishedTerms,
    compensation,
    salaryOutlook,
    fitRating,
    researchSummary,
    sourceUrl: "",
    sourceVerifiedAt: LEGACY_VERIFIED_AT,
    status: "research",
    appliedAt: null,
    applicationChannel: "",
    appliedTerms: "",
    contactPerson: "",
    contactEmail: "",
    contactPhone: "",
    contacts: [],
    jobDescriptionText: "",
    tags: [],
    nextStep: deadline
      ? "Bewerbungsentscheidung treffen"
      : "Ausschreibungsstatus prüfen und priorisieren",
    nextStepAt: deadline,
    notes: "",
    artifacts: [],
    vacancyResearch: null,
    generationInputs: normalizeApplicationGenerationInputs(null),
    generationPreferences: {
      ...DEFAULT_APPLICATION_GENERATION_PREFERENCES,
      outputKinds: [...DEFAULT_APPLICATION_GENERATION_PREFERENCES.outputKinds],
      researchScopes: [...DEFAULT_APPLICATION_GENERATION_PREFERENCES.researchScopes],
    },
    documentDesign: normalizeApplicationDocumentDesign(null),
    activities: [],
  };
}

export const LEGACY_APPLICATION_RESEARCH: ApplicationProcess[] =
  VACANCY_SEEDS.map(legacyVacancy);

const LEGACY_APPLICATION_BY_ID = new Map(
  LEGACY_APPLICATION_RESEARCH.map((application) => [application.id, application]),
);

const LEGACY_ID_BY_SOURCE_ID: Readonly<Record<string, string>> = {
  J001: "vacancy-1",
  J002: "vacancy-2",
  J003: "vacancy-3",
  J004: "vacancy-4",
  J005: "vacancy-5",
  J006: "vacancy-30",
  J007: "vacancy-26",
  J008: "vacancy-27",
  J009: "vacancy-24",
  J010: "vacancy-31",
  J011: "vacancy-44",
  J012: "vacancy-36",
  J013: "vacancy-54",
  J014: "vacancy-38",
  J015: "vacancy-39",
  J016: "vacancy-32",
  J017: "vacancy-11",
  J018: "vacancy-34",
  J019: "vacancy-46",
  J020: "vacancy-60",
  J021: "vacancy-61",
  J022: "vacancy-62",
  J023: "vacancy-9",
  J024: "vacancy-6",
  J025: "vacancy-7",
  J026: "vacancy-20",
  J027: "vacancy-8",
  J028: "vacancy-43",
  J031: "vacancy-12",
  J032: "vacancy-29",
  J033: "vacancy-65",
  J034: "vacancy-66",
  J035: "vacancy-10",
  J036: "vacancy-13",
  J037: "vacancy-41",
  J040: "vacancy-18",
  J041: "vacancy-19",
  J043: "vacancy-35",
  J044: "vacancy-15",
  J045: "vacancy-16",
  J046: "vacancy-17",
  J051: "vacancy-45",
  J053: "vacancy-51",
  J063: "vacancy-21",
  J064: "vacancy-22",
  J065: "vacancy-48",
  J066: "vacancy-47",
  J067: "vacancy-23",
  J069: "vacancy-55",
  J070: "vacancy-56",
  J071: "vacancy-71",
  J072: "vacancy-72",
  J073: "vacancy-67",
  J074: "vacancy-70",
  J075: "vacancy-42",
  J076: "vacancy-52",
  J077: "vacancy-58",
  J078: "vacancy-53",
  J079: "vacancy-68",
  J080: "vacancy-69",
  J087: "vacancy-63",
  J088: "vacancy-59",
  J089: "vacancy-64",
  J093: "vacancy-33",
};

function knownPublishedValue(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "";
  return /^(nicht|keine angabe|offen\b)/i.test(normalized) ? "" : normalized;
}

function uniqueHttpUrls(values: string[]): string[] {
  const urls = values.flatMap((value) => {
    try {
      const parsed = new URL(value);
      return ["http:", "https:"].includes(parsed.protocol) ? [parsed.toString()] : [];
    } catch {
      return [];
    }
  });
  return [...new Set(urls)];
}

function sourceEvidence(record: JobRadarRecord): {
  evidenceClass: JobResearchEvidenceClass;
  evidenceStatus: JobResearchEvidenceStatus;
} {
  const quality = `${record.sourceQuality} ${record.sourcePortal}`.toLowerCase();
  if (/dritt|indeed|vorliste|manuell|snippet|suchtreffer/.test(quality)) {
    return { evidenceClass: "market_secondary", evidenceStatus: "ambiguous" };
  }
  if (/offiziell|arbeitgeber|stellenübersicht|service\.bund/.test(quality)) {
    return { evidenceClass: "job_ad_explicit", evidenceStatus: "supported" };
  }
  return { evidenceClass: "user_provided_ad_text", evidenceStatus: "ambiguous" };
}

function researchSources(record: JobRadarRecord): JobResearchSource[] {
  const urls = uniqueHttpUrls([record.jobUrl, record.applicationUrl]);
  return urls.map((url) => ({
    url,
    title:
      url === record.applicationUrl && record.applicationUrl !== record.jobUrl
        ? `Bewerbungsportal · ${record.sourcePortal || record.company}`
        : `Stellenbeschreibung · ${record.sourcePortal || record.company}`,
    domain: new URL(url).hostname,
    discoveredBy: "consulted",
  }));
}

function researchClaim(
  record: JobRadarRecord,
  factKey: JobResearchFactKey,
  value: string,
  whyItMatters: string,
): JobResearchClaim | null {
  const normalized = knownPublishedValue(value);
  if (!normalized) return null;
  const { evidenceClass, evidenceStatus } = sourceEvidence(record);
  const confirmed = evidenceStatus === "supported";
  const asOf = record.fetchedAt ?? JOB_RADAR_VERIFIED_AT;
  return {
    id: `${record.sourceId}-${factKey.replaceAll(".", "-")}`,
    factKey,
    value: normalized,
    evidenceClass,
    evidenceStatus,
    sourceUrls: uniqueHttpUrls([record.jobUrl, record.applicationUrl]),
    asOf,
    whyItMatters,
    decision: {
      status: confirmed ? "confirmed" : "pending",
      value: confirmed ? normalized : null,
      decidedAt: confirmed ? `${asOf}T12:00:00.000Z` : null,
    },
  };
}

function contactResearch(record: JobRadarRecord): string {
  const details = [
    knownPublishedValue(record.functionalContact)
      ? `Fachlich: ${record.functionalContact}`
      : "",
    knownPublishedValue(record.recruitingContact)
      ? `Recruiting/HR: ${record.recruitingContact}`
      : "",
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email) ? `E-Mail: ${record.email}` : "",
    knownPublishedValue(record.phone) ? `Telefon: ${record.phone}` : "",
    record.contactNote ? `Hinweis: ${record.contactNote}` : "",
  ];
  return details.filter(Boolean).join(" · ");
}

function firstContactEmail(record: JobRadarRecord): string {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(record.email)?.[0] ?? "";
}

function contactPerson(record: JobRadarRecord): string {
  return [
    knownPublishedValue(record.functionalContact)
      ? `Fachlich: ${record.functionalContact}`
      : "",
    knownPublishedValue(record.recruitingContact)
      ? `HR: ${record.recruitingContact}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function applicationContacts(record: JobRadarRecord) {
  const email = firstContactEmail(record);
  const phone = knownPublishedValue(record.phone);
  const note = knownPublishedValue(record.contactNote);
  const contacts = [
    {
      id: `${record.sourceId}-contact-functional`,
      kind: "functional" as const,
      name: knownPublishedValue(record.functionalContact),
      email,
      phone,
      note,
    },
    {
      id: `${record.sourceId}-contact-recruiting`,
      kind: "recruiting" as const,
      name: knownPublishedValue(record.recruitingContact),
      email,
      phone,
      note,
    },
  ];
  return contacts.filter(
    (contact) => contact.name || contact.email || contact.phone || contact.note,
  );
}

function digitalJobDescription(record: JobRadarRecord): string {
  return [
    record.tasks ? `AUFGABEN\n${record.tasks}` : "",
    record.mustRequirements
      ? `MUSS-ANFORDERUNGEN\n${record.mustRequirements}`
      : "",
    record.niceToHave ? `PLUSPUNKTE\n${record.niceToHave}` : "",
    record.applicationProcess
      ? `BEWERBUNGSPROZESS UND UNTERLAGEN\n${record.applicationProcess}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function salaryOutlook(record: JobRadarRecord): SalaryOutlook {
  const value = record.salaryTarget.toLowerCase();
  if (value === "ja") return "yes";
  if (value.startsWith("ja") || value.includes("grenzfall")) {
    return value.startsWith("nein") ? "no" : "borderline";
  }
  if (value.startsWith("nein")) return "no";
  return "open";
}

function researchTier(record: JobRadarRecord): ApplicationResearchTier {
  if (["A+", "A"].includes(record.priority)) return "top";
  if (["B+", "B"].includes(record.priority)) return "plausible";
  return "stretch";
}

function importedVacancyResearch(
  record: JobRadarRecord,
): NonNullable<ApplicationProcess["vacancyResearch"]> {
  const location = [record.location, record.workplaceAddress].filter(Boolean).join(" · ");
  const contact = contactResearch(record);
  const claims = [
    researchClaim(record, "role.title", record.jobTitle, "Grundlage für Anschreiben und CV-Titel."),
    researchClaim(record, "company.name", record.company, "Ordnet Bewerbung und Arbeitgeberbezug eindeutig zu."),
    researchClaim(record, "role.tasks", record.tasks, "Dient als Basis für passende Projekterfolge und Beispiele."),
    researchClaim(
      record,
      "role.must_skills",
      record.mustRequirements,
      "Zeigt formale und fachliche Mindestanforderungen vor der Bewerbung.",
    ),
    researchClaim(
      record,
      "role.nice_skills",
      record.niceToHave,
      "Hilft bei der Priorisierung zusätzlicher Belege im Profil.",
    ),
    researchClaim(record, "offer.location", location, "Relevant für Pendelweg und Arbeitsmodell."),
    researchClaim(record, "offer.contract", record.contractType, "Wichtig für die langfristige Einordnung."),
    researchClaim(record, "offer.hours", record.workingTime, "Bestimmt den zeitlichen Rahmen der Stelle."),
    researchClaim(record, "offer.salary", record.compensation, "Basis für Tarif- und Gehaltsabgleich."),
    researchClaim(record, "offer.work_model", record.workModel, "Relevant für Präsenz, Pendeln und Alltag."),
    researchClaim(
      record,
      "process.deadline",
      record.deadline ?? "",
      "Steuert Priorität und Bewerbungsplanung.",
    ),
    researchClaim(record, "process.contact", contact, "Erleichtert gezielte fachliche Rückfragen."),
    researchClaim(
      record,
      "process.selection",
      record.applicationProcess,
      "Verhindert fehlende Unterlagen oder einen falschen Bewerbungsweg.",
    ),
  ].filter((claim): claim is JobResearchClaim => Boolean(claim));
  const gaps: JobResearchGap[] = [];
  if (!knownPublishedValue(record.compensation)) {
    gaps.push({
      factKey: "offer.salary",
      priority: "high",
      question: "Welche Vergütung oder Tarifzuordnung gilt für die konkrete Stelle?",
      rationale: "Die Vorrecherche enthält keine belastbare konkrete Angabe.",
    });
  }
  if (!record.deadline) {
    gaps.push({
      factKey: "process.deadline",
      priority: "high",
      question: "Bis wann bleibt das Bewerbungsportal geöffnet?",
      rationale: "Es wurde keine klare Bewerbungsfrist veröffentlicht.",
    });
  }
  if (!contact) {
    gaps.push({
      factKey: "process.contact",
      priority: "medium",
      question: "Wer beantwortet fachliche und organisatorische Rückfragen?",
      rationale: "In der Vorrecherche ist keine belastbare Ansprechperson genannt.",
    });
  }
  const { evidenceStatus } = sourceEvidence(record);
  const supportedClaims = claims.filter(
    (claim) => claim.evidenceStatus === "supported",
  ).length;
  const sources = researchSources(record);
  return {
    schemaVersion: 1,
    retrievalStatus:
      sources.length === 0
        ? "not_found"
        : evidenceStatus === "supported"
          ? "exact_page_accessed"
          : "snippet_only",
    requestedUrl: record.jobUrl || record.applicationUrl,
    canonicalUrl: record.jobUrl || record.applicationUrl || null,
    adFacts: claims,
    enrichment: [],
    gaps,
    conflicts: [],
    warnings: [
      `Importierte Vorrecherche mit Quellenstand ${record.fetchedAt ?? JOB_RADAR_VERIFIED_AT}.`,
      ...(evidenceStatus === "supported"
        ? []
        : ["Quelle oder einzelne Angaben vor der Bewerbung manuell gegenprüfen."]),
      ...(record.dailyStatus === "Frist verstrichen"
        ? ["Die Bewerbungsfrist war beim Import bereits verstrichen."]
        : []),
    ],
    sources,
    researchedAt: `${record.fetchedAt ?? JOB_RADAR_VERIFIED_AT}T12:00:00.000Z`,
    promptVersion: "jobradar-import-v1",
    model: "user-provided-research",
    responseId: `excel-jobradar-${record.sourceId}`,
    validation: {
      consultedSources: sources.length,
      totalClaims: claims.length,
      supportedClaims,
      unsupportedClaims: claims.filter(
        (claim) => claim.evidenceStatus === "unsupported",
      ).length,
      matchedSourceUrls: claims.reduce(
        (sum, claim) => sum + claim.sourceUrls.length,
        0,
      ),
    },
  };
}

function jobRadarVacancy(record: JobRadarRecord, rank: number): ApplicationProcess {
  const publishedTerms = [
    knownPublishedValue(record.contractType),
    knownPublishedValue(record.workingTime),
    knownPublishedValue(record.workModel),
    record.workplaceAddress,
  ]
    .filter(Boolean)
    .join(" · ");
  const researchSummary = [
    `Passung ${record.fitScore.toLocaleString("de-DE")}/10: ${record.fitReason}`,
    record.risk ? `Hürde: ${record.risk}` : "",
    record.tasks ? `Aufgaben: ${record.tasks}` : "",
    record.tags.length ? `Themen: ${record.tags.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    id: LEGACY_ID_BY_SOURCE_ID[record.sourceId] ?? `vacancy-jobradar-${record.sourceId}`,
    researchRank: rank,
    researchTier: researchTier(record),
    shortlisted: ["A+", "A"].includes(record.priority),
    jobTitle: record.jobTitle,
    company: record.company,
    location: record.location,
    deadline: record.deadline,
    publishedTerms,
    compensation: record.compensation,
    salaryOutlook: salaryOutlook(record),
    fitRating: `${record.priority} · ${record.fitScore.toLocaleString("de-DE")}/10`,
    researchSummary,
    sourceUrl: record.jobUrl || record.applicationUrl,
    sourceVerifiedAt: record.fetchedAt ?? JOB_RADAR_VERIFIED_AT,
    status: record.dailyStatus === "Frist verstrichen" ? "closed" : "research",
    appliedAt: null,
    applicationChannel: "",
    appliedTerms: "",
    contactPerson: contactPerson(record),
    contactEmail: firstContactEmail(record),
    contactPhone: knownPublishedValue(record.phone),
    contacts: applicationContacts(record),
    jobDescriptionText: digitalJobDescription(record),
    tags: [...record.tags],
    nextStep: record.nextStep || "Ausschreibungsstatus prüfen und priorisieren",
    nextStepAt: record.deadline,
    notes: "",
    artifacts: [],
    vacancyResearch: importedVacancyResearch(record),
    generationInputs: normalizeApplicationGenerationInputs(null),
    generationPreferences: {
      ...DEFAULT_APPLICATION_GENERATION_PREFERENCES,
      outputKinds: [...DEFAULT_APPLICATION_GENERATION_PREFERENCES.outputKinds],
      researchScopes: [...DEFAULT_APPLICATION_GENERATION_PREFERENCES.researchScopes],
    },
    documentDesign: normalizeApplicationDocumentDesign(null),
    activities: [],
  };
}

export const APPLICATION_RESEARCH: ApplicationProcess[] = JOB_RADAR_RECORDS.map(
  jobRadarVacancy,
);

function refreshedSeedValue<K extends keyof ApplicationProcess>(
  key: K,
  seeded: ApplicationProcess,
  current: ApplicationProcess,
  legacy: ApplicationProcess | undefined,
): ApplicationProcess[K] {
  const value = current[key];
  if (value === null || value === undefined || value === "") return seeded[key];
  return legacy && Object.is(value, legacy[key]) ? seeded[key] : value;
}

function canonicalSourceUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizedIdentity(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-DE")
    .replace(/(?:m|w|d)\s*[|/]\s*(?:m|w|d)(?:\s*[|/]\s*(?:m|w|d))?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sameVacancy(left: ApplicationProcess, right: ApplicationProcess): boolean {
  const leftUrl = canonicalSourceUrl(left.sourceUrl);
  const rightUrl = canonicalSourceUrl(right.sourceUrl);
  if (leftUrl && rightUrl && leftUrl === rightUrl) return true;
  return (
    normalizedIdentity(left.jobTitle) === normalizedIdentity(right.jobTitle) &&
    normalizedIdentity(left.company) === normalizedIdentity(right.company)
  );
}

function mergeSeededApplication(
  seeded: ApplicationProcess,
  current: ApplicationProcess,
): ApplicationProcess {
  const legacy = LEGACY_APPLICATION_BY_ID.get(current.id);
  const researchValue = <K extends keyof ApplicationProcess>(key: K) =>
    refreshedSeedValue(key, seeded, current, legacy);
  return {
    ...seeded,
    id: current.id,
    shortlisted:
      legacy && current.shortlisted === legacy.shortlisted
        ? seeded.shortlisted
        : current.shortlisted,
    jobTitle: researchValue("jobTitle"),
    company: researchValue("company"),
    location: researchValue("location"),
    deadline: researchValue("deadline"),
    publishedTerms: researchValue("publishedTerms"),
    compensation: researchValue("compensation"),
    salaryOutlook: researchValue("salaryOutlook"),
    fitRating: researchValue("fitRating"),
    researchSummary: researchValue("researchSummary"),
    sourceUrl: researchValue("sourceUrl"),
    sourceVerifiedAt: researchValue("sourceVerifiedAt"),
    status:
      legacy && current.status === legacy.status ? seeded.status : current.status,
    appliedAt: current.appliedAt ?? null,
    applicationChannel: current.applicationChannel ?? "",
    appliedTerms: current.appliedTerms ?? "",
    contactPerson: researchValue("contactPerson"),
    contactEmail: researchValue("contactEmail"),
    contactPhone: current.contactPhone ?? seeded.contactPhone,
    contacts: normalizeApplicationContacts(current.contacts).length
      ? normalizeApplicationContacts(current.contacts)
      : seeded.contacts,
    jobDescriptionText: current.jobDescriptionText?.trim()
      ? current.jobDescriptionText
      : seeded.jobDescriptionText,
    tags: Array.isArray(current.tags) && current.tags.length
      ? current.tags
      : seeded.tags,
    nextStep: researchValue("nextStep"),
    nextStepAt: researchValue("nextStepAt"),
    notes: current.notes ?? "",
    artifacts: Array.isArray(current.artifacts) ? current.artifacts : [],
    vacancyResearch: isSavedVacancyResearch(current.vacancyResearch)
      ? current.vacancyResearch
      : seeded.vacancyResearch,
    generationInputs: normalizeApplicationGenerationInputs(
      current.generationInputs,
    ),
    generationPreferences: normalizeApplicationGenerationPreferences(
      current.generationPreferences,
    ),
    documentDesign: normalizeApplicationDocumentDesign(current.documentDesign),
    activities: normalizeApplicationActivities(current.activities),
  };
}

const LEGACY_RESEARCH_FIELDS = [
  "researchRank",
  "researchTier",
  "shortlisted",
  "jobTitle",
  "company",
  "location",
  "deadline",
  "publishedTerms",
  "compensation",
  "salaryOutlook",
  "fitRating",
  "researchSummary",
  "sourceUrl",
  "sourceVerifiedAt",
  "status",
  "appliedAt",
  "applicationChannel",
  "appliedTerms",
  "contactPerson",
  "contactEmail",
  "nextStep",
  "nextStepAt",
  "notes",
] as const satisfies readonly (keyof ApplicationProcess)[];

function isUntouchedLegacySeed(application: ApplicationProcess): boolean {
  const legacy = LEGACY_APPLICATION_BY_ID.get(application.id);
  return Boolean(
    legacy &&
      LEGACY_RESEARCH_FIELDS.every((key) =>
        Object.is(application[key], legacy[key]),
      ) &&
      (!Array.isArray(application.artifacts) || application.artifacts.length === 0) &&
      !isSavedVacancyResearch(application.vacancyResearch),
  );
}

export function mergeApplicationResearch(
  existing: ApplicationProcess[] | undefined,
): ApplicationProcess[] {
  const saved = Array.isArray(existing) ? existing : [];
  const savedById = new Map(saved.map((application) => [application.id, application]));
  const usedSavedIds = new Set<string>();
  const seeded = APPLICATION_RESEARCH.map((application) => {
    const current =
      savedById.get(application.id) ??
      saved.find(
        (candidate) =>
          !usedSavedIds.has(candidate.id) && sameVacancy(application, candidate),
      );
    if (!current) return { ...application, artifacts: [] };
    usedSavedIds.add(current.id);
    return mergeSeededApplication(application, current);
  });
  const own = saved
    .filter(
      (application) =>
        !usedSavedIds.has(application.id) && !isUntouchedLegacySeed(application),
    )
    .map((application) => ({
      ...application,
      artifacts: Array.isArray(application.artifacts) ? application.artifacts : [],
      vacancyResearch: isSavedVacancyResearch(application.vacancyResearch)
        ? application.vacancyResearch
        : null,
      contactPhone: application.contactPhone ?? "",
      contacts: normalizeApplicationContacts(application.contacts),
      jobDescriptionText: application.jobDescriptionText ?? "",
      tags: Array.isArray(application.tags) ? application.tags : [],
      generationInputs: normalizeApplicationGenerationInputs(
        application.generationInputs,
      ),
      generationPreferences: normalizeApplicationGenerationPreferences(
        application.generationPreferences,
      ),
      documentDesign: normalizeApplicationDocumentDesign(
        application.documentDesign,
      ),
      activities: normalizeApplicationActivities(application.activities),
    }));
  return [...seeded, ...own];
}

export function createEmptyApplication(id: string): ApplicationProcess {
  const createdAt = new Date().toISOString();
  return {
    id,
    researchRank: null,
    researchTier: "own",
    shortlisted: false,
    jobTitle: "Neue Bewerbung",
    company: "",
    location: "",
    deadline: null,
    publishedTerms: "",
    compensation: "",
    salaryOutlook: "open",
    fitRating: "",
    researchSummary: "",
    sourceUrl: "",
    sourceVerifiedAt: createdAt.slice(0, 10),
    status: "draft",
    appliedAt: null,
    applicationChannel: "",
    appliedTerms: "",
    contactPerson: "",
    contactEmail: "",
    contactPhone: "",
    contacts: [],
    jobDescriptionText: "",
    tags: [],
    nextStep: "Stellenanzeige und Bewerbungsunterlagen vervollständigen",
    nextStepAt: null,
    notes: "",
    artifacts: [],
    vacancyResearch: null,
    generationInputs: normalizeApplicationGenerationInputs(null),
    generationPreferences: {
      ...DEFAULT_APPLICATION_GENERATION_PREFERENCES,
      outputKinds: [...DEFAULT_APPLICATION_GENERATION_PREFERENCES.outputKinds],
      researchScopes: [...DEFAULT_APPLICATION_GENERATION_PREFERENCES.researchScopes],
    },
    documentDesign: normalizeApplicationDocumentDesign(null),
    activities: [
      {
        id: `activity-vacancy-added-${id}`,
        type: "vacancy_added",
        occurredAt: createdAt,
        note: "Manuell im Kompass angelegt",
      },
    ],
  };
}
