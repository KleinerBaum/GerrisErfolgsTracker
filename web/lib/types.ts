export type ViewKey =
  | "today"
  | "tasks"
  | "calendar"
  | "finance"
  | "documents"
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
