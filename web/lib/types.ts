export type ViewKey =
  | "today"
  | "tasks"
  | "calendar"
  | "finance"
  | "documents"
  | "applications"
  | "contacts"
  | "journal";

export type DashboardKpiKey =
  | "weekly_task_completions"
  | "daily_focus_minutes"
  | "planned_days"
  | "monthly_spending_limit"
  | "active_applications"
  | "weekly_journal_entries";

export type DashboardKpiTarget = {
  key: DashboardKpiKey;
  enabled: boolean;
  target: number;
};

export type DashboardSettings = {
  kpis: DashboardKpiTarget[];
};

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
  taskListTitle?: string;
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
  reminderAt?: string | null;
  reminderCalendarId?: string | null;
  reminderEventId?: string | null;
  confidential: boolean;
};

export const DIFFICULTY_BANDS = ["D1", "D2", "D3", "D4", "D5", "BOSS"] as const;
export type DifficultyBand = (typeof DIFFICULTY_BANDS)[number];

export const REWARD_MODES = ["POINTS", "FANTASY", "ADAPTIVE"] as const;
export type RewardMode = (typeof REWARD_MODES)[number];

export const MESSAGE_CATEGORIES = [
  "DIRECT",
  "SUPPORT",
  "RECOVER",
  "CELEBRATE",
] as const;
export type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];

export const VERIFICATION_TYPES = [
  "USER_CONFIRM",
  "CHECKLIST",
  "ARTIFACT",
  "GOOGLE_TASK",
] as const;
export type VerificationType = (typeof VERIFICATION_TYPES)[number];

export type AnchorRole = "KEY" | "QUICK_WIN" | "SUPPLY";
export type AnchorDayStatus = "PLANNED" | "REST" | "VACATION" | "PAUSED";
export type RewardFeedbackRating = "MOTIVATING" | "NEUTRAL" | "DISTURBING";
export type RewardPresentation = "POINTS" | "FANTASY" | "MESSAGE";
export type ApprovedMessageType =
  | "VERIFIED_QUOTE"
  | "APPROVED_PARAPHRASE"
  | "GENERIC_AI";
export type WorldDistrictKey =
  | "ARCHIVE"
  | "TREASURY"
  | "WORKSHOP"
  | "LIBRARY"
  | "HEARTH"
  | "GARDEN";

export type ComplexityAssessment = {
  effort: number;
  cognitiveLoad: number;
  activationBarrier: number;
  coordination: number;
  weightedScore: number;
  suggestedBand: DifficultyBand;
  explanation: string;
  source: "AI" | "FALLBACK";
  suggestedAt: string;
};

export type TaskGamificationProfile = {
  taskId: string;
  difficultyBand: DifficultyBand;
  assessment: ComplexityAssessment;
  confirmedAt: string | null;
  verificationType: VerificationType;
  weeklyAnchor: boolean;
  scheduledBlock: boolean;
  verifiedMilestone: boolean;
  anchorRole: AnchorRole | null;
  anchorDate: string | null;
};

export type RewardLedgerEntryKind =
  | "OPENING_BALANCE"
  | "TASK_REWARD"
  | "COST_REWARD"
  | "DAY_CLOSE_REWARD"
  | "BOSS_REWARD"
  | "REWARD_REDEMPTION"
  | "WORLD_BUILD";

export type RewardLedgerEntry = {
  id: string;
  sequence: number;
  engineVersion: 1;
  idempotencyKey: string;
  createdAt: string;
  kind: RewardLedgerEntryKind;
  sourceId: string;
  budgetKey: string;
  description: string;
  difficultyBand: DifficultyBand | null;
  verificationType: VerificationType | null;
  district: WorldDistrictKey | null;
  bonusPercent: number;
  xpDelta: number;
  energyDelta: number;
  runeDelta: number;
  blueprintDelta: number;
  bossKeyDelta: number;
  courageEmberDelta: number;
};

export type WorldUpgradeKind =
  | "DECORATION"
  | "ROOM"
  | "BUILDING"
  | "LANDMARK"
  | "REGION";

export type WorldUpgrade = {
  id: string;
  district: WorldDistrictKey;
  kind: WorldUpgradeKind;
  title: string;
  unlockedAt: string;
  surprise: boolean;
};

export type WorldState = {
  upgrades: WorldUpgrade[];
  eligibleCompletionsSinceSurprise: number;
  surpriseHistory: string[];
};

export type ApprovedMessage = {
  id: string;
  category: MessageCategory;
  contentType: ApprovedMessageType;
  text: string;
  approvedAt: string | null;
  permissionReference: string;
  active: boolean;
};

export type RewardFeedback = {
  id: string;
  ledgerEntryId: string;
  presentation: RewardPresentation;
  rating: RewardFeedbackRating;
  createdAt: string;
};

export type PersonalReward = {
  id: string;
  title: string;
  cost: number;
  active: boolean;
};

export type GoalMilestone = {
  id: string;
  title: string;
  completedAt: string | null;
};

export type Goal = {
  id: string;
  title: string;
  definitionOfDone: string;
  nextStep: string;
  ifThenPlan: string;
  milestones: GoalMilestone[];
  completedAt: string | null;
};

export type AnchorDay = {
  date: string;
  status: AnchorDayStatus;
  taskIds: string[];
  completedTaskIds: string[];
};

export type AdaptiveRewardWeights = {
  points: number;
  fantasy: number;
  lastAdjustedAt: string | null;
};

export type XpGoals = {
  daily: number;
  weekly: number;
  monthly: number;
};

export type GamificationState = {
  schemaVersion: 1;
  rewardMode: RewardMode;
  drRossEnabled: boolean;
  surprisesEnabled: boolean;
  celebrationsEnabled: boolean;
  milestoneStepXp: number;
  xpGoals: XpGoals;
  quietHours: { start: string; end: string };
  profiles: TaskGamificationProfile[];
  ledger: RewardLedgerEntry[];
  world: WorldState;
  approvedMessages: ApprovedMessage[];
  feedback: RewardFeedback[];
  rewardCatalog: PersonalReward[];
  goals: Goal[];
  anchorDays: AnchorDay[];
  adaptiveWeights: AdaptiveRewardWeights;
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
  kind:
    | "appointment"
    | "focus"
    | "payment"
    | "job_interview"
    | "employment_agency"
    | "networking"
    | "family"
    | "school_childcare"
    | "health"
    | "public_office"
    | "learning"
    | "birthday";
  private: boolean;
  calendarId?: string;
  allDay?: boolean;
  availability?: "busy" | "free";
  recurrence?: "none" | "yearly";
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

export type ApplicationKpiKey =
  | "new_vacancies"
  | "complete_application_packs"
  | "sent_applications"
  | "phone_interviews"
  | "onsite_interviews";

export type ApplicationKpiPeriod = "day" | "week" | "month";

export type ApplicationKpiGoal = {
  key: ApplicationKpiKey;
  enabled: boolean;
  targets: Record<ApplicationKpiPeriod, number>;
};

export type ApplicationKpiSettings = {
  goals: ApplicationKpiGoal[];
};

export type ApplicationActivityType =
  | "vacancy_added"
  | "application_pack_completed"
  | "application_sent"
  | "phone_interview"
  | "onsite_interview";

export type ApplicationActivity = {
  id: string;
  type: ApplicationActivityType;
  occurredAt: string;
  note: string;
};

export type ApplicationResearchScope =
  | "job_posting"
  | "company"
  | "department"
  | "projects"
  | "publications"
  | "salary";

export type LlmModelTier = "luna" | "terra" | "sol";

export type LlmReasoningEffort =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export type ApplicationOutputKind =
  | "tailored-cv"
  | "cover-letter"
  | "application-email"
  | "company-brief"
  | "interview-prep";

export type ApplicationArtifactModelSetting = {
  model: LlmModelTier;
  effort: LlmReasoningEffort;
};

export type ApplicationArtifactModelSettings = Record<
  ApplicationOutputKind,
  ApplicationArtifactModelSetting
>;

export type ApplicationDocumentKind = Exclude<
  ApplicationOutputKind,
  "application-email"
>;

export type ApplicationDocumentPresetId =
  | "gerris"
  | "modern-stylish"
  | "professional-stylish"
  | "conservative-chic";

export type ApplicationVisualizationPlacement =
  | "after-profile"
  | "after-skills"
  | "end";

export type ApplicationDocumentVisualization = {
  id: string;
  sourceDocumentId: string;
  title: string;
  altText: string;
  targetKinds: ApplicationDocumentKind[];
  placement: ApplicationVisualizationPlacement;
  confirmedAt: string | null;
};

export type ApplicationDocumentDesign = {
  basePresetId: ApplicationDocumentPresetId;
  presetOverrides: Record<
    ApplicationDocumentKind,
    ApplicationDocumentPresetId | null
  >;
  templateDocumentIds: Record<ApplicationDocumentKind, string | null>;
  visualizations: ApplicationDocumentVisualization[];
};

export type ApplicationFormality =
  | "modern"
  | "balanced"
  | "formal";

export type ApplicationResearchSelectionMode =
  | "all_confirmed"
  | "selected_only"
  | "none";

export type ApplicationGenerationPreferences = {
  formality: ApplicationFormality;
  addressStyle: "auto" | "sie" | "du";
  language: "Deutsch" | "Englisch";
  cvLength: "compact" | "two_pages" | "detailed";
  focusThemes: string[];
  customFocus: string;
  outputKinds: ApplicationOutputKind[];
  modelSettings: ApplicationArtifactModelSettings;
  researchScopes: ApplicationResearchScope[];
  researchSelectionMode: ApplicationResearchSelectionMode;
  selectedResearchClaimIds: string[];
  desiredSalaryAnnual: number | null;
  minimumSalaryAnnual: number | null;
  salaryFlexibility: "fixed" | "negotiable" | "open";
  mentionSalary: "never" | "if_requested" | "always";
};

export type ApplicationGenerationInputs = {
  motivation: string;
  achievements: string;
  strengths: string;
  constraints: string;
  availability: string;
};

export type ApplicationContact = {
  id: string;
  kind: "functional" | "recruiting" | "general";
  name: string;
  email: string;
  phone: string;
  note: string;
};

export type JobDiscoveryProvider =
  | "indeed"
  | "jooble"
  | "linkedin"
  | "employer"
  | "recruiter"
  | "manual";

export type JobSearchProfile = {
  schemaVersion: 1;
  targetTracks: string[];
  locations: string[];
  remoteAllowed: boolean;
  employmentTypes: string[];
  minimumSalaryAnnual: number | null;
  salaryCurrency: "EUR";
  hardExclusions: {
    employers: string[];
    titles: string[];
    keywords: string[];
    contractTypes: string[];
  };
  reviewedAt: string | null;
  updatedAt: string;
};

export type JobDiscoverySource = {
  provider: JobDiscoveryProvider;
  providerJobId: string | null;
  url: string;
  sourceKind: "discovery" | "claimed_original";
  capturedAt: string;
  checkedAt: string | null;
};

export type RoleVerificationStatus =
  | "unverified"
  | "verified"
  | "stale"
  | "closed";

export type SalaryBasis =
  | "listed"
  | "not_listed"
  | "market_estimate"
  | "unknown";

export type RoleRecommendation =
  | "undecided"
  | "apply"
  | "maybe"
  | "skip";

export type RoleWarmPath = {
  personName: string;
  personRole: string;
  sourceUrl: string;
  publicContext: string;
  commonContactsNote: string;
  commonContactsConfirmedAt: string | null;
};

export type RoleAssessment = {
  recommendation: Exclude<RoleRecommendation, "undecided">;
  fitScore: number | null;
  shortlistChancePercent: number | null;
  mainMatch: string;
  mainRisk: string;
  cvAngle: string;
  evidenceUrls: string[];
  hardExclusionMatches: string[];
  importedAt: string;
  approvedAt: string | null;
};

export type ApplicationResearchMigration = {
  version: 1;
  status: "pending" | "completed";
  completedAt: string | null;
  archivedCount: number;
  retainedCount: number;
};

export type CareerEvidenceConfidence =
  | "source_only"
  | "user_confirmed"
  | "externally_corroborated";

export type CareerPassportSource = {
  sourceId: string;
  name: string;
  sourceType: string;
  isPrimary: boolean;
  notes: string[];
};

export type CareerPassportEvidence = {
  evidenceId: string;
  claim: string;
  safeWording: string;
  sourceType: string;
  sourceName: string;
  confidence: CareerEvidenceConfidence;
  restrictions: string[];
  roleRelevance: string[];
  capturedAt: string | null;
};

export type CareerPassportSnapshot = {
  schemaVersion: string;
  profileName: string;
  targetDirections: string[];
  sourceDocuments: CareerPassportSource[];
  evidence: CareerPassportEvidence[];
  documentVersionStatus: string | null;
  importedAt: string;
};

export type MasterCvSectionKind =
  | "profile"
  | "value"
  | "experience"
  | "projects"
  | "skills"
  | "education"
  | "languages"
  | "other";

export type MasterCvSection = {
  id: string;
  heading: string;
  content: string;
  kind: MasterCvSectionKind;
};

export type MasterCvLink = {
  id: string;
  label: string;
  url: string;
  kind: "web" | "email" | "phone" | "portfolio";
};

export type MasterCvCoverageStats = {
  totalWords: number;
  evidenceItems: number;
  experienceEntries: number;
  projectItems: number;
  skillItems: number;
  educationItems: number;
  languageItems: number;
  linkedContacts: number;
  sectionsByKind: Record<MasterCvSectionKind, number>;
};

export type MasterCvContent = {
  schemaVersion: 2;
  sourceDocumentId: string;
  passportDocumentId: string | null;
  name: string;
  headline: string;
  subheadline: string;
  contactLine: string;
  language: string;
  sections: MasterCvSection[];
  links: MasterCvLink[];
  sourceFingerprint: string;
  coverage: MasterCvCoverageStats;
  passport: CareerPassportSnapshot;
  importedAt: string;
  updatedAt: string;
  editRevision: number;
};

export type MasterCvImportBundle = {
  cvDocument: DocumentRef;
  passportDocument?: DocumentRef | null;
  masterCvContent: MasterCvContent;
};

export type JobResearchFactKey =
  | "role.title"
  | "company.name"
  | "role.purpose"
  | "role.tasks"
  | "role.must_skills"
  | "role.nice_skills"
  | "role.tools"
  | "offer.location"
  | "offer.contract"
  | "offer.hours"
  | "offer.salary"
  | "offer.work_model"
  | "offer.travel"
  | "offer.shifts"
  | "offer.reporting_line"
  | "offer.benefits"
  | "process.deadline"
  | "process.published_at"
  | "process.posting_status"
  | "process.contact"
  | "process.selection"
  | "process.interview"
  | "process.onboarding"
  | "company.context"
  | "company.current_developments"
  | "company.department"
  | "company.projects"
  | "company.publications"
  | "market.salary"
  | "market.talent_supply"
  | "market.skill_demand"
  | "market.competing_roles"
  | "market.remote_prevalence"
  | "process.retention_risks";

export type JobResearchEvidenceClass =
  | "job_ad_explicit"
  | "employer_official_assertion"
  | "market_primary"
  | "market_secondary"
  | "user_provided_ad_text"
  | "model_inference";

export type JobResearchEvidenceStatus =
  | "supported"
  | "ambiguous"
  | "contradicted"
  | "stale"
  | "unsupported";

export type JobResearchDecisionStatus =
  | "pending"
  | "confirmed"
  | "edited"
  | "rejected";

export type JobResearchClaim = {
  id: string;
  factKey: JobResearchFactKey;
  value: string;
  evidenceClass: JobResearchEvidenceClass;
  evidenceStatus: JobResearchEvidenceStatus;
  sourceUrls: string[];
  asOf: string | null;
  whyItMatters: string;
  decision: {
    status: JobResearchDecisionStatus;
    value: string | null;
    decidedAt: string | null;
  };
};

export type JobResearchGap = {
  factKey: JobResearchFactKey;
  priority: "blocking" | "high" | "medium" | "low";
  question: string;
  rationale: string;
};

export type JobResearchSource = {
  url: string;
  title: string;
  domain: string;
  discoveredBy: "consulted" | "citation" | "both";
};

export type VacancyResearch = {
  schemaVersion: 1;
  retrievalStatus:
    | "exact_page_accessed"
    | "provided_text"
    | "snippet_only"
    | "blocked_or_login"
    | "not_found"
    | "ambiguous";
  requestedUrl: string;
  canonicalUrl: string | null;
  adFacts: JobResearchClaim[];
  enrichment: JobResearchClaim[];
  gaps: JobResearchGap[];
  conflicts: string[];
  warnings: string[];
  sources: JobResearchSource[];
  researchedAt: string;
  promptVersion: string;
  model: string;
  responseId: string;
  validation: {
    consultedSources: number;
    totalClaims: number;
    supportedClaims: number;
    unsupportedClaims: number;
    matchedSourceUrls: number;
  };
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    webSearchCalls: number;
  };
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
  discoverySources: JobDiscoverySource[];
  checkedAt: string;
  publishedAt: string | null;
  contractType: string;
  salaryBasis: SalaryBasis;
  marketSalaryEstimate: string;
  verificationStatus: RoleVerificationStatus;
  contentFingerprint: string;
  recommendation: RoleRecommendation;
  assessment: RoleAssessment | null;
  warmPath: RoleWarmPath | null;
  status: ApplicationStatus;
  appliedAt: string | null;
  applicationChannel: string;
  appliedTerms: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  contacts: ApplicationContact[];
  jobDescriptionText: string;
  tags: string[];
  nextStep: string;
  nextStepAt: string | null;
  notes: string;
  artifacts: ApplicationArtifact[];
  vacancyResearch: VacancyResearch | null;
  generationInputs: ApplicationGenerationInputs;
  generationPreferences: ApplicationGenerationPreferences;
  documentDesign: ApplicationDocumentDesign;
  activities: ApplicationActivity[];
};

export type Contact = {
  id: string;
  firstName: string;
  lastName: string;
  organization: string;
  role: string;
  email: string;
  phone: string;
  mobile: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  birthday: string | null;
  website: string;
  notes: string;
  tags: string[];
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AppState = {
  schemaVersion: 1;
  revision: number;
  updatedAt: string;
  ownerName: string;
  monthlyBudget: number;
  points: number;
  rhythmDays: number;
  gamification?: GamificationState;
  tasks: Task[];
  pendingTaskImports?: Task[];
  costs: Cost[];
  incomes?: Income[];
  accountBalances?: AccountBalances;
  documents: DocumentRef[];
  calendarEvents: CalendarEvent[];
  applications: ApplicationProcess[];
  jobSearchProfile?: JobSearchProfile;
  applicationResearchMigration?: ApplicationResearchMigration;
  qaFixtureVersion?: number;
  masterCvDocumentId: string | null;
  careerPassportDocumentId: string | null;
  masterCvContent: MasterCvContent | null;
  contacts: Contact[];
  journal: JournalEntry[];
  dashboardSettings: DashboardSettings;
  applicationKpiSettings: ApplicationKpiSettings;
};

export type IntegrationConfig = {
  calendarId: string;
  calendarEmbedUrl: string;
  driveFolderUrl: string;
  driveLocalPath: string;
  gmailAccount: string;
};

export type GerrisSiteRole = "production" | "qa";

export type SyncStatus =
  | "lade"
  | "synchronisiert"
  | "lokal"
  | "fehler"
  | "konflikt";

export type CaptureKind =
  | "task"
  | "event"
  | "cost"
  | "income"
  | "document"
  | "journal";

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
