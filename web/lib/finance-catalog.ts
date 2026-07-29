import type {
  CostCadence,
  CostCategory,
} from "./types";

export type CostTemplate = {
  id: number;
  title: string;
  category: CostCategory;
  subcategory: string;
  costType: "Fix" | "Variabel";
  priority: "Notwendig" | "Wichtig" | "Optional";
  cadence: CostCadence;
};

export const COST_TEMPLATES: CostTemplate[] = [
  { id: 1, title: "Kaltmiete / Darlehensrate", category: "Wohnen", subcategory: "Miete / Finanzierung", costType: "Fix", priority: "Notwendig", cadence: "monthly" },
  { id: 2, title: "Nebenkostenvorauszahlung", category: "Wohnen", subcategory: "Nebenkosten", costType: "Fix", priority: "Notwendig", cadence: "monthly" },
  { id: 3, title: "Stellplatz / Garage", category: "Wohnen", subcategory: "Stellplatz / Garage", costType: "Fix", priority: "Wichtig", cadence: "monthly" },
  { id: 4, title: "Rundfunkbeitrag", category: "Wohnen", subcategory: "Rundfunk", costType: "Fix", priority: "Notwendig", cadence: "quarterly" },
  { id: 5, title: "Strom", category: "Energie & Versorgung", subcategory: "Strom", costType: "Variabel", priority: "Notwendig", cadence: "monthly" },
  { id: 6, title: "Gas / Fernwärme", category: "Energie & Versorgung", subcategory: "Gas / Fernwärme", costType: "Variabel", priority: "Notwendig", cadence: "monthly" },
  { id: 7, title: "Wasser / Abwasser", category: "Energie & Versorgung", subcategory: "Wasser / Abwasser", costType: "Variabel", priority: "Notwendig", cadence: "quarterly" },
  { id: 8, title: "Müll / kommunale Dienste", category: "Energie & Versorgung", subcategory: "Müll / kommunale Dienste", costType: "Fix", priority: "Notwendig", cadence: "yearly" },
  { id: 9, title: "Privathaftpflicht", category: "Versicherungen", subcategory: "Privathaftpflicht", costType: "Fix", priority: "Notwendig", cadence: "yearly" },
  { id: 10, title: "Hausratversicherung", category: "Versicherungen", subcategory: "Hausrat", costType: "Fix", priority: "Wichtig", cadence: "yearly" },
  { id: 11, title: "Rechtsschutzversicherung", category: "Versicherungen", subcategory: "Rechtsschutz", costType: "Fix", priority: "Optional", cadence: "yearly" },
  { id: 12, title: "Berufsunfähigkeitsversicherung", category: "Versicherungen", subcategory: "Berufsunfähigkeit", costType: "Fix", priority: "Wichtig", cadence: "monthly" },
  { id: 13, title: "Kranken-Zusatzversicherung", category: "Versicherungen", subcategory: "Kranken-Zusatz", costType: "Fix", priority: "Optional", cadence: "monthly" },
  { id: 14, title: "Kfz-Versicherung", category: "Versicherungen", subcategory: "Kfz-Versicherung", costType: "Fix", priority: "Notwendig", cadence: "yearly" },
  { id: 15, title: "ÖPNV-Abo / Deutschlandticket", category: "Mobilität", subcategory: "ÖPNV", costType: "Fix", priority: "Wichtig", cadence: "monthly" },
  { id: 16, title: "Leasing / Autokredit", category: "Mobilität", subcategory: "Leasing / Autokredit", costType: "Fix", priority: "Wichtig", cadence: "monthly" },
  { id: 17, title: "Kraftstoff / Laden", category: "Mobilität", subcategory: "Kraftstoff", costType: "Variabel", priority: "Wichtig", cadence: "monthly" },
  { id: 18, title: "Kfz-Steuer", category: "Mobilität", subcategory: "Kfz-Steuer", costType: "Fix", priority: "Notwendig", cadence: "yearly" },
  { id: 19, title: "Wartung / TÜV-Rücklage", category: "Mobilität", subcategory: "Wartung / Rücklage", costType: "Variabel", priority: "Wichtig", cadence: "monthly" },
  { id: 20, title: "Internetanschluss", category: "Kommunikation & Medien", subcategory: "Internet", costType: "Fix", priority: "Notwendig", cadence: "monthly" },
  { id: 21, title: "Mobilfunkvertrag", category: "Kommunikation & Medien", subcategory: "Mobilfunk", costType: "Fix", priority: "Notwendig", cadence: "monthly" },
  { id: 22, title: "Video-Streaming", category: "Kommunikation & Medien", subcategory: "Streaming", costType: "Fix", priority: "Optional", cadence: "monthly" },
  { id: 23, title: "Cloud-Speicher", category: "Kommunikation & Medien", subcategory: "Cloud-Speicher", costType: "Fix", priority: "Wichtig", cadence: "monthly" },
  { id: 24, title: "Medikamente / Zuzahlungen", category: "Gesundheit", subcategory: "Medikamente / Zuzahlungen", costType: "Variabel", priority: "Notwendig", cadence: "monthly" },
  { id: 25, title: "Fitnessstudio / Yoga", category: "Gesundheit", subcategory: "Fitness / Yoga", costType: "Fix", priority: "Wichtig", cadence: "monthly" },
  { id: 26, title: "Lebensmittel", category: "Lebensmittel & Haushalt", subcategory: "Lebensmittel", costType: "Variabel", priority: "Notwendig", cadence: "monthly" },
  { id: 27, title: "Drogerie / Haushalt", category: "Lebensmittel & Haushalt", subcategory: "Drogerie / Haushalt", costType: "Variabel", priority: "Notwendig", cadence: "monthly" },
  { id: 28, title: "Auswärts essen / Lieferdienste", category: "Lebensmittel & Haushalt", subcategory: "Auswärts essen", costType: "Variabel", priority: "Optional", cadence: "monthly" },
  { id: 29, title: "Kita / OGS / Kinderbetreuung", category: "Kind & Familie", subcategory: "Kinderbetreuung", costType: "Fix", priority: "Notwendig", cadence: "monthly" },
  { id: 30, title: "Kinderverpflegung", category: "Kind & Familie", subcategory: "Kinderverpflegung", costType: "Variabel", priority: "Notwendig", cadence: "monthly" },
  { id: 31, title: "Kinderaktivitäten / Verein", category: "Kind & Familie", subcategory: "Kinderaktivitäten", costType: "Variabel", priority: "Wichtig", cadence: "monthly" },
  { id: 32, title: "Kurse / Lernplattformen", category: "Bildung & Entwicklung", subcategory: "Kurse / Lernplattformen", costType: "Fix", priority: "Wichtig", cadence: "monthly" },
  { id: 33, title: "Bücher / Fachmedien", category: "Bildung & Entwicklung", subcategory: "Bücher / Fachmedien", costType: "Variabel", priority: "Wichtig", cadence: "monthly" },
  { id: 34, title: "Musik- / Medien-Abo", category: "Freizeit & Abos", subcategory: "Musik / Medien", costType: "Fix", priority: "Optional", cadence: "monthly" },
  { id: 35, title: "Verein / Hobby", category: "Freizeit & Abos", subcategory: "Verein / Hobby", costType: "Fix", priority: "Wichtig", cadence: "monthly" },
  { id: 36, title: "Konsumkredit", category: "Kredite & Verpflichtungen", subcategory: "Konsumkredit", costType: "Fix", priority: "Notwendig", cadence: "monthly" },
  { id: 37, title: "Unterhalt / feste Verpflichtung", category: "Kredite & Verpflichtungen", subcategory: "Unterhalt / Verpflichtung", costType: "Fix", priority: "Notwendig", cadence: "monthly" },
  { id: 38, title: "Mitgliedschaft / Gebühren", category: "Steuern & Gebühren", subcategory: "Mitgliedschaft / Beitrag", costType: "Fix", priority: "Wichtig", cadence: "yearly" },
  { id: 39, title: "OpenAI / AI-Tools / API", category: "Business & Software", subcategory: "AI / API", costType: "Variabel", priority: "Wichtig", cadence: "monthly" },
  { id: 40, title: "Software / SaaS", category: "Business & Software", subcategory: "Software / SaaS", costType: "Fix", priority: "Wichtig", cadence: "monthly" },
  { id: 41, title: "Hosting / Domains", category: "Business & Software", subcategory: "Hosting / Domains", costType: "Fix", priority: "Wichtig", cadence: "yearly" },
  { id: 42, title: "Buchhaltung / Büro", category: "Business & Software", subcategory: "Buchhaltung / Büro", costType: "Variabel", priority: "Wichtig", cadence: "monthly" },
  { id: 43, title: "Notgroschen", category: "Sparen & Vorsorge", subcategory: "Notgroschen", costType: "Fix", priority: "Wichtig", cadence: "monthly" },
  { id: 44, title: "Altersvorsorge", category: "Sparen & Vorsorge", subcategory: "Altersvorsorge", costType: "Fix", priority: "Wichtig", cadence: "monthly" },
  { id: 45, title: "Sparen für Kinder", category: "Sparen & Vorsorge", subcategory: "Sparen für Kinder", costType: "Fix", priority: "Wichtig", cadence: "monthly" },
  { id: 46, title: "Spenden", category: "Sonstiges", subcategory: "Spenden", costType: "Variabel", priority: "Optional", cadence: "monthly" },
  { id: 47, title: "Haustier", category: "Sonstiges", subcategory: "Haustier", costType: "Variabel", priority: "Wichtig", cadence: "monthly" },
  { id: 48, title: "Sonstige laufende Kosten", category: "Sonstiges", subcategory: "Sonstige", costType: "Variabel", priority: "Wichtig", cadence: "monthly" },
];
