export type ViewKey =
  | "today"
  | "tasks"
  | "calendar"
  | "finance"
  | "documents"
  | "applications"
  | "journal";

export type LifeArea =
  | "alltag"
  | "arbeit"
  | "finanzen"
  | "gesundheit"
  | "wohnen"
  | "persoenlich";

export type TaskQuadrant = "do" | "plan" | "delegate" | "drop";

export type Task = {
  id: string;
  title: string;
  area: LifeArea;
  quadrant: TaskQuadrant;
  dueAt: string | null;
  estimateMinutes: number;
  progress: number;
  completed: boolean;
  confidential: boolean;
};

export const COST_CATEGORIES = [
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
] as const;

export type CostCategory = (typeof COST_CATEGORIES)[number];
export type CostCadence =
  | "once"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "bimonthly"
  | "quarterly"
  | "semiannual"
  | "yearly";
export type CostStatus = "paid" | "due" | "planned";
export type CostType = "Fix" | "Variabel";
export type CostPriority = "Notwendig" | "Wichtig" | "Optional";

export type Cost = {
  id: string;
  title: string;
  category: CostCategory;
  amount: number;
  dueAt: string;
  cadence: CostCadence;
  status: CostStatus;
  payee: string;
  contactEmail: string;
  note: string;
  confidential: true;
  active?: boolean;
  account?: string;
  costType?: CostType;
  priority?: CostPriority;
  subcategory?: string;
};

export type Income = {
  id: string;
  title: string;
  amount: number;
  receivedAt: string;
  cadence: CostCadence;
  source: string;
  note: string;
};

export type AccountBalances = {
  paypal: number | null;
  revolut: number | null;
  updatedAt: string | null;
};

export type DocumentKind = "pdf" | "document" | "sheet" | "folder" | "other";

export type DrivePreviewKind = "pdf" | "image" | "text" | null;

export type DriveItem = {
  id: string;
  name: string;
  kind: "folder" | "file";
  mimeType: string;
  modifiedAt: string | null;
  sizeBytes: number | null;
  webViewLink: string;
  previewKind: DrivePreviewKind;
};

export type DriveFolderContent = {
  folder: DriveItem;
  breadcrumbs: DriveItem[];
  items: DriveItem[];
};

export type DriveConnectionStatus = {
  configured: boolean;
  connected: boolean;
  googleEmail: string | null;
  root: DriveItem | null;
};

export type DocumentRef = {
  id: string;
  name: string;
  folderPath: string;
  kind: DocumentKind;
  driveUrl: string;
  fileId: string | null;
  modifiedAt: string;
  tags: string[];
  confidential: true;
  storage?: "drive" | "upload";
  downloadUrl?: string | null;
  contentType?: string;
  sizeBytes?: number;
  note?: string;
  reviewAt?: string | null;
};

export type CalendarEvent = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  source: "google" | "kompass";
  kind: "appointment" | "focus" | "payment";
  private: boolean;
  location?: string;
  note?: string;
  reminderMinutes?: number;
};

export type JournalEntry = {
  id: string;
  date: string;
  mood: number;
  text: string;
  win: string;
  nextStep: string;
};

export type ApplicationStatus =
  | "research"
  | "planned"
  | "draft"
  | "submitted"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn"
  | "closed";

export type SalaryOutlook = "yes" | "borderline" | "open" | "no";

export type ApplicationResearchTier = "top" | "plausible" | "stretch" | "own";

export type ApplicationArtifactKind =
  | "cover-letter"
  | "tailored-cv"
  | "research"
  | "job-posting"
  | "job-screenshot"
  | "certificate"
  | "other";

export type ApplicationArtifact = {
  id: string;
  kind: ApplicationArtifactKind;
  documentId: string;
  label: string;
  createdAt: string;
};

export type ApplicationProcess = {
  id: string;
  researchRank: number | null;
  researchTier: ApplicationResearchTier;
  shortlisted: boolean;
  jobTitle: string;
  company: string;
  location: string;
  deadline: string | null;
  publishedTerms: string;
  compensation: string;
  salaryOutlook: SalaryOutlook;
  fitRating: string;
  researchSummary: string;
  sourceUrl: string;
  sourceVerifiedAt: string;
  status: ApplicationStatus;
  appliedAt: string | null;
  applicationChannel: string;
  appliedTerms: string;
  contactPerson: string;
  contactEmail: string;
  nextStep: string;
  nextStepAt: string | null;
  notes: string;
  artifacts: ApplicationArtifact[];
};

export type AppState = {
  schemaVersion: 1;
  revision: number;
  updatedAt: string;
  ownerName: string;
  monthlyBudget: number;
  points: number;
  rhythmDays: number;
  tasks: Task[];
  costs: Cost[];
  incomes?: Income[];
  accountBalances?: AccountBalances;
  documents: DocumentRef[];
  calendarEvents: CalendarEvent[];
  applications: ApplicationProcess[];
  masterCvDocumentId: string | null;
  journal: JournalEntry[];
};

export type IntegrationConfig = {
  calendarId: string;
  calendarEmbedUrl: string;
  driveFolderUrl: string;
  driveLocalPath: string;
  gmailAccount: string;
};

export type SyncStatus = "lade" | "synchronisiert" | "lokal" | "fehler";

export type CaptureKind = "task" | "cost" | "income" | "document" | "journal";

export const LIFE_AREA_LABELS: Record<LifeArea, string> = {
  alltag: "Alltag",
  arbeit: "Arbeit",
  finanzen: "Finanzen",
  gesundheit: "Gesundheit",
  wohnen: "Wohnen",
  persoenlich: "Persönlich",
};

export const QUADRANT_LABELS: Record<TaskQuadrant, string> = {
  do: "Jetzt tun",
  plan: "Einplanen",
  delegate: "Abgeben",
  drop: "Loslassen",
};

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  research: "Recherche",
  planned: "Vorgemerkt",
  draft: "In Vorbereitung",
  submitted: "Beworben",
  interview: "Gespräch",
  offer: "Angebot",
  rejected: "Absage",
  withdrawn: "Zurückgezogen",
  closed: "Abgeschlossen",
};

export const SALARY_OUTLOOK_LABELS: Record<SalaryOutlook, string> = {
  yes: "50k realistisch",
  borderline: "50k Grenzfall",
  open: "50k offen",
  no: "50k nicht erreichbar",
};

export const COST_CADENCE_LABELS: Record<CostCadence, string> = {
  once: "Einmalig",
  weekly: "Wöchentlich",
  biweekly: "14-tägig",
  monthly: "Monatlich",
  bimonthly: "Zweimonatlich",
  quarterly: "Vierteljährlich",
  semiannual: "Halbjährlich",
  yearly: "Jährlich",
};
