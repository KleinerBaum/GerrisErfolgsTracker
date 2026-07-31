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
  taskListId?: string;
  legacyId?: string | null;
  title: string;
  notes?: string;
  area: LifeArea;
  quadrant: TaskQuadrant;
  dueAt: string | null;
  estimateMinutes: number;
  progress: number;
  completed: boolean;
  completedAt?: string | null;
  updatedAt?: string | null;
  etag?: string | null;
  webViewLink?: string | null;
  assigned?: boolean;
  parentId?: string | null;
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
  googleEventId?: string;
  title: string;
  startAt: string;
  endAt: string;
  source: "google" | "kompass";
  kind: "appointment" | "focus" | "payment";
  private: boolean;
  calendarId?: string;
  allDay?: boolean;
  location?: string;
  note?: string;
  reminderMinutes?: number;
  etag?: string;
  updatedAt?: string;
  managed?: boolean;
  managedCalendarKey?: ManagedCalendarKey;
  sourceType?: PlanningSourceType;
  sourceId?: string;
  sourceOccurrence?: string;
  desiredHash?: string;
};

export type GoogleCalendar = {
  id: string;
  name: string;
  description?: string;
  backgroundColor: string;
  foregroundColor: string;
  primary: boolean;
  selected: boolean;
  accessRole: "freeBusyReader" | "reader" | "writer" | "owner";
  timeZone: string;
};

export const MANAGED_CALENDAR_NAMES = {
  focus: "Fokus & Aufgaben & Fristen",
  applications: "Bewerbungen",
  birthdays_holidays: "Geburtstage und Feiertage",
  private: "Privat",
} as const;

export type ManagedCalendarKey = keyof typeof MANAGED_CALENDAR_NAMES;
export type ManagedCalendarStatus =
  | "missing"
  | "ambiguous"
  | "ready"
  | "private_unverified"
  | "error";

export type ManagedCalendar = {
  key: ManagedCalendarKey;
  name: string;
  calendarId: string | null;
  status: ManagedCalendarStatus;
  matchCount: number;
  accessRole: GoogleCalendar["accessRole"] | null;
  privateAclVerified: boolean | null;
  lastCheckedAt: string | null;
  error: string | null;
};

export type PlanningSourceType =
  | "task"
  | "cost"
  | "document"
  | "application"
  | "day-intent"
  | "open-topic"
  | "calendar"
  | "sync";

export type CalendarLink = {
  sourceType: PlanningSourceType;
  sourceId: string;
  sourceOccurrence: string;
  calendarId: string;
  googleEventId: string;
  etag: string | null;
  desiredHash: string;
  observedStartAt: string | null;
  observedEndAt: string | null;
  syncStatus: "pending" | "synced" | "conflict" | "failed";
  lastSyncedAt: string | null;
  error: string | null;
};

export type PlanningHealthState =
  | "unknown"
  | "stale"
  | "incomplete"
  | "conflicted"
  | "healthy"
  | "intentionally_free";

export type PlanningGapSeverity = "critical" | "important";
export type PlanningGapStatus = "open" | "snoozed" | "resolved";
export type PlanningGapKind =
  | "calendar_connection_unknown"
  | "calendar_selection_empty"
  | "calendar_load_failed"
  | "calendar_stale"
  | "calendar_day_empty"
  | "calendar_conflict"
  | "calendar_buffer_missing"
  | "calendar_overload"
  | "task_undated"
  | "task_focus_missing"
  | "application_next_step_missing"
  | "application_schedule_missing"
  | "payment_reminder_missing"
  | "document_review_missing"
  | "decision_open"
  | "open_topic_schedule_missing"
  | "managed_calendar_missing"
  | "managed_calendar_duplicate"
  | "private_calendar_unverified"
  | "sync_failed"
  | "calendar_event_changed"
  | "calendar_event_deleted";

export type PlanningGap = {
  id: string;
  kind: PlanningGapKind;
  severity: PlanningGapSeverity;
  status: PlanningGapStatus;
  title: string;
  detail: string;
  sourceType: PlanningSourceType;
  sourceId: string;
  date: string | null;
  dueAt: string | null;
  firstSeenAt?: string;
  lastSeenAt?: string;
  snoozedUntil?: string | null;
  resolutionNote?: string | null;
  googleTaskId?: string | null;
};

export type DayIntentKind = "intentionally_free" | "vacation" | "sick";

export type DayIntent = {
  date: string;
  kind: DayIntentKind;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type OpenTopicGroup =
  | "decision"
  | "next_step"
  | "waiting"
  | "scheduled";
export type OpenTopicStatus = "open" | "snoozed" | "resolved";
export type CalendarTargetChoice = "private" | "specialist";

export type OpenTopic = {
  id: string;
  group: OpenTopicGroup;
  status: OpenTopicStatus;
  title: string;
  detail: string;
  nextStep: string;
  dueAt: string | null;
  sourceType: PlanningSourceType;
  sourceId: string;
  evidence: string;
  confidence: number | null;
  requiresCalendarTarget: boolean;
  calendarTarget: CalendarTargetChoice | null;
  snoozedUntil: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type DecisionRecord = {
  id: string;
  topicId: string | null;
  sourceJournalId: string | null;
  title: string;
  decision: string;
  calendarTarget: CalendarTargetChoice | null;
  appliedAt: string | null;
  createdAt: string;
};

export type SyncOutboxOperation =
  | "calendar_create"
  | "calendar_patch"
  | "calendar_delete";
export type SyncOutboxStatus = "pending" | "processing" | "done" | "failed";

export type SyncOutboxItem = {
  id: string;
  dedupeKey: string;
  operation: SyncOutboxOperation;
  sourceType: PlanningSourceType;
  sourceId: string;
  sourceOccurrence: string;
  payloadJson: string;
  status: SyncOutboxStatus;
  attemptCount: number;
  nextAttemptAt: string;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SyncRun = {
  id: string;
  mode: "dry-run" | "safe";
  reason: string;
  status: "running" | "succeeded" | "partial" | "failed";
  desiredCount: number;
  createCount: number;
  patchCount: number;
  deleteCount: number;
  conflictCount: number;
  retryCount: number;
  summary: string;
  startedAt: string;
  finishedAt: string | null;
};

export type PlanningDaySummary = {
  date: string;
  state: "planned" | "gap" | "intentionally_free";
  intent: DayIntentKind | null;
  planBlockCount: number;
  hardEventCount: number;
  focusMinutes: number;
  conflictCount: number;
  gapIds: string[];
};

export type PlanningHealthReport = {
  state: PlanningHealthState;
  title: string;
  message: string;
  generatedAt: string;
  calendarFetchedAt: string | null;
  calendarConnected: boolean;
  selectedCalendarIds: string[];
  criticalCount: number;
  importantCount: number;
  gaps: PlanningGap[];
  days: PlanningDaySummary[];
  managedCalendars: ManagedCalendar[];
  dayIntents: DayIntent[];
  openTopics: OpenTopic[];
  automationMode: "dry-run" | "safe";
  lastSyncRun: SyncRun | null;
};

export type JournalAnalysisSuggestionKind =
  | "decision"
  | "next_step"
  | "waiting"
  | "calendar";

export type JournalAnalysisSuggestion = {
  kind: JournalAnalysisSuggestionKind;
  title: string;
  detail: string;
  evidence: string;
  confidence: number;
  proposedNextStep: string;
  proposedDueAt: string | null;
  requiresCalendarTarget: boolean;
};

export type JournalAnalysisResult = {
  summary: string;
  suggestions: JournalAnalysisSuggestion[];
};

export type DiaryReviewArea =
  | "tasks"
  | "calendar"
  | "applications"
  | "finance"
  | "documents";

export type DiarySnapshot = {
  openTasks: number;
  overdueTasks: number;
  tomorrowTasks: number;
  tomorrowEvents: number;
  weekEvents: number;
  activeApplications: number;
  upcomingApplicationSteps: number;
  dueCosts: number;
  documentsToReview: number;
};

export type JournalEntry = {
  id: string;
  date: string;
  mood: number;
  text: string;
  win: string;
  nextStep: string;
  weekPlan?: string;
  reviewedAreas?: DiaryReviewArea[];
  closedAt?: string | null;
  plannedTaskId?: string | null;
  linkedApplicationIds?: string[];
  snapshot?: DiarySnapshot;
};

export type DiarySaveInput = {
  text: string;
  mood: number;
  win: string;
  nextStep: string;
  weekPlan?: string;
  reviewedAreas?: DiaryReviewArea[];
  closeDay?: boolean;
  plannedTaskId?: string | null;
  linkedApplicationIds?: string[];
  snapshot?: DiarySnapshot;
  appendToDay?: boolean;
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
  pendingTaskImports?: Task[];
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

export type SyncStatus =
  | "lade"
  | "synchronisiert"
  | "lokal"
  | "fehler"
  | "konflikt";

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
