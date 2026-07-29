import type {
  CostCadence,
  CostCategory,
  CostPriority,
  CostType,
} from "./types";

export const COST_CATEGORIES: CostCategory[] = [
  "Wohnen",
  "Energie & Versorgung",
  "Versicherungen",
  "Mobilität",
  "Kommunikation & Medien",
  "Gesundheit",
  "Lebensmittel & Haushalt",
  "Kind & Familie",
  "Bildung & Entwicklung",
  "Freizeit & Abos",
  "Kredite & Verpflichtungen",
  "Steuern & Gebühren",
  "Business & Software",
  "Sparen & Vorsorge",
  "Sonstiges",
];

export type CostSuggestion = {
  id: string;
  title: string;
  category: CostCategory;
  subcategory: string;
  costType: CostType;
  priority: CostPriority;
  cadence: CostCadence;
};

const suggestion = (
  id: number,
  title: string,
  category: CostCategory,
  subcategory: string,
  costType: CostType,
  priority: CostPriority,
  cadence: CostCadence = "monthly",
): CostSuggestion => ({
  id: `table-${id}`,
  title,
  category,
  subcategory,
  costType,
  priority,
  cadence,
});

export const COST_SUGGESTIONS: CostSuggestion[] = [
  suggestion(1, "Kaltmiete / Darlehensrate", "Wohnen", "Miete / Finanzierung", "Fix", "Notwendig"),
  suggestion(2, "Nebenkostenvorauszahlung", "Wohnen", "Nebenkosten", "Fix", "Notwendig"),
  suggestion(3, "Stellplatz / Garage", "Wohnen", "Stellplatz / Garage", "Fix", "Wichtig"),
  suggestion(4, "Rundfunkbeitrag", "Wohnen", "Rundfunk", "Fix", "Notwendig", "quarterly"),
  suggestion(5, "Strom", "Energie & Versorgung", "Strom", "Variabel", "Notwendig"),
  suggestion(6, "Gas / Fernwärme", "Energie & Versorgung", "Gas / Fernwärme", "Variabel", "Notwendig"),
  suggestion(7, "Wasser / Abwasser", "Energie & Versorgung", "Wasser / Abwasser", "Variabel", "Notwendig", "quarterly"),
  suggestion(8, "Müll / kommunale Dienste", "Energie & Versorgung", "Müll / kommunale Dienste", "Fix", "Notwendig", "yearly"),
  suggestion(9, "Privathaftpflicht", "Versicherungen", "Privathaftpflicht", "Fix", "Notwendig", "yearly"),
  suggestion(10, "Hausratversicherung", "Versicherungen", "Hausrat", "Fix", "Wichtig", "yearly"),
  suggestion(11, "Rechtsschutzversicherung", "Versicherungen", "Rechtsschutz", "Fix", "Optional", "yearly"),
  suggestion(12, "Berufsunfähigkeitsversicherung", "Versicherungen", "Berufsunfähigkeit", "Fix", "Wichtig"),
  suggestion(13, "Kranken-Zusatzversicherung", "Versicherungen", "Kranken-Zusatz", "Fix", "Optional"),
  suggestion(14, "Kfz-Versicherung", "Versicherungen", "Kfz-Versicherung", "Fix", "Notwendig", "yearly"),
  suggestion(15, "ÖPNV-Abo / Deutschlandticket", "Mobilität", "ÖPNV", "Fix", "Wichtig"),
  suggestion(16, "Leasing / Autokredit", "Mobilität", "Leasing / Autokredit", "Fix", "Wichtig"),
  suggestion(17, "Kraftstoff / Laden", "Mobilität", "Kraftstoff", "Variabel", "Wichtig"),
  suggestion(18, "Kfz-Steuer", "Mobilität", "Kfz-Steuer", "Fix", "Notwendig", "yearly"),
  suggestion(19, "Wartung / TÜV-Rücklage", "Mobilität", "Wartung / Rücklage", "Variabel", "Wichtig"),
  suggestion(20, "Internetanschluss", "Kommunikation & Medien", "Internet", "Fix", "Notwendig"),
  suggestion(21, "Mobilfunkvertrag", "Kommunikation & Medien", "Mobilfunk", "Fix", "Notwendig"),
  suggestion(22, "Video-Streaming", "Kommunikation & Medien", "Streaming", "Fix", "Optional"),
  suggestion(23, "Cloud-Speicher", "Kommunikation & Medien", "Cloud-Speicher", "Fix", "Wichtig"),
  suggestion(24, "Medikamente / Zuzahlungen", "Gesundheit", "Medikamente / Zuzahlungen", "Variabel", "Notwendig"),
  suggestion(25, "Fitnessstudio / Yoga", "Gesundheit", "Fitness / Yoga", "Fix", "Wichtig"),
  suggestion(26, "Lebensmittel", "Lebensmittel & Haushalt", "Lebensmittel", "Variabel", "Notwendig"),
  suggestion(27, "Drogerie / Haushalt", "Lebensmittel & Haushalt", "Drogerie / Haushalt", "Variabel", "Notwendig"),
  suggestion(28, "Auswärts essen / Lieferdienste", "Lebensmittel & Haushalt", "Auswärts essen", "Variabel", "Optional"),
  suggestion(29, "Kita / OGS / Kinderbetreuung", "Kind & Familie", "Kinderbetreuung", "Fix", "Notwendig"),
  suggestion(30, "Kinderverpflegung", "Kind & Familie", "Kinderverpflegung", "Variabel", "Notwendig"),
  suggestion(31, "Kinderaktivitäten / Verein", "Kind & Familie", "Kinderaktivitäten", "Variabel", "Wichtig"),
  suggestion(32, "Kurse / Lernplattformen", "Bildung & Entwicklung", "Kurse / Lernplattformen", "Fix", "Wichtig"),
  suggestion(33, "Bücher / Fachmedien", "Bildung & Entwicklung", "Bücher / Fachmedien", "Variabel", "Wichtig"),
  suggestion(34, "Musik- / Medien-Abo", "Freizeit & Abos", "Musik / Medien", "Fix", "Optional"),
  suggestion(35, "Verein / Hobby", "Freizeit & Abos", "Verein / Hobby", "Fix", "Wichtig"),
  suggestion(36, "Konsumkredit", "Kredite & Verpflichtungen", "Konsumkredit", "Fix", "Notwendig"),
  suggestion(37, "Unterhalt / feste Verpflichtung", "Kredite & Verpflichtungen", "Unterhalt / Verpflichtung", "Fix", "Notwendig"),
  suggestion(38, "Mitgliedschaft / Gebühren", "Steuern & Gebühren", "Mitgliedschaft / Beitrag", "Fix", "Wichtig", "yearly"),
  suggestion(39, "OpenAI / AI-Tools / API", "Business & Software", "AI / API", "Variabel", "Wichtig"),
  suggestion(40, "Software / SaaS", "Business & Software", "Software / SaaS", "Fix", "Wichtig"),
  suggestion(41, "Hosting / Domains", "Business & Software", "Hosting / Domains", "Fix", "Wichtig", "yearly"),
  suggestion(42, "Buchhaltung / Büro", "Business & Software", "Buchhaltung / Büro", "Variabel", "Wichtig"),
  suggestion(43, "Notgroschen", "Sparen & Vorsorge", "Notgroschen", "Fix", "Wichtig"),
  suggestion(44, "Altersvorsorge", "Sparen & Vorsorge", "Altersvorsorge", "Fix", "Wichtig"),
  suggestion(45, "Sparen für Kinder", "Sparen & Vorsorge", "Sparen für Kinder", "Fix", "Wichtig"),
  suggestion(46, "Spenden", "Sonstiges", "Spenden", "Variabel", "Optional"),
  suggestion(47, "Haustier", "Sonstiges", "Haustier", "Variabel", "Wichtig"),
  suggestion(48, "Sonstige laufende Kosten", "Sonstiges", "Sonstige", "Variabel", "Wichtig"),
];

export const COST_SUGGESTIONS_BY_CATEGORY = COST_CATEGORIES.map((category) => ({
  category,
  items: COST_SUGGESTIONS.filter((item) => item.category === category),
}));

export const CADENCE_MONTHLY_FACTOR: Record<CostCadence, number> = {
  once: 0,
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
  bimonthly: 1 / 2,
  quarterly: 1 / 3,
  semiannual: 1 / 6,
  yearly: 1 / 12,
};

export const toMonthlyAmount = (
  amount: number,
  cadence: CostCadence,
): number => amount * CADENCE_MONTHLY_FACTOR[cadence];
