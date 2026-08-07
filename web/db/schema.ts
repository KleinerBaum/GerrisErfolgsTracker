import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const userStates = sqliteTable("user_states", {
  ownerEmail: text("owner_email").primaryKey(),
  stateJson: text("state_json").notNull(),
  stateVersion: integer("state_version").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});

export const applicationGenerationJobs = sqliteTable(
  "application_generation_jobs",
  {
    jobId: text("job_id").primaryKey(),
    ownerHash: text("owner_hash").notNull(),
    stage: text("stage").notNull(),
    responseId: text("response_id").notNull(),
    requestJson: text("request_json").notNull(),
    draftJson: text("draft_json"),
    issuesJson: text("issues_json").notNull().default("[]"),
    usageJson: text("usage_json").notNull().default("[]"),
    resultJson: text("result_json"),
    terminalErrorJson: text("terminal_error_json"),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    index("application_generation_jobs_owner_expiry_idx").on(
      table.ownerHash,
      table.expiresAt,
    ),
  ],
);

export const googleDriveConnections = sqliteTable("google_drive_connections", {
  ownerEmail: text("owner_email").primaryKey(),
  googleSubject: text("google_subject"),
  googleEmail: text("google_email").notNull(),
  encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
  grantedScopes: text("granted_scopes").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const googleTaskSettings = sqliteTable("google_task_settings", {
  ownerEmail: text("owner_email").primaryKey(),
  taskListId: text("task_list_id").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const googleTaskMetadata = sqliteTable(
  "google_task_metadata",
  {
    ownerEmail: text("owner_email").notNull(),
    taskListId: text("task_list_id").notNull(),
    googleTaskId: text("google_task_id").notNull(),
    legacyId: text("legacy_id"),
    area: text("area").notNull().default("alltag"),
    quadrant: text("quadrant").notNull().default("plan"),
    estimateMinutes: integer("estimate_minutes").notNull().default(30),
    progress: integer("progress").notNull().default(0),
    confidential: integer("confidential", { mode: "boolean" })
      .notNull()
      .default(true),
    reminderAt: text("reminder_at"),
    reminderCalendarId: text("reminder_calendar_id"),
    reminderEventId: text("reminder_event_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.ownerEmail, table.taskListId, table.googleTaskId],
    }),
    uniqueIndex("google_task_metadata_owner_legacy_unique").on(
      table.ownerEmail,
      table.legacyId,
    ),
  ],
);

export const managedCalendars = sqliteTable(
  "managed_calendars",
  {
    ownerEmail: text("owner_email").notNull(),
    calendarKey: text("calendar_key").notNull(),
    name: text("name").notNull(),
    calendarId: text("calendar_id"),
    status: text("status").notNull(),
    matchCount: integer("match_count").notNull().default(0),
    accessRole: text("access_role"),
    privateAclVerified: integer("private_acl_verified", { mode: "boolean" }),
    lastCheckedAt: text("last_checked_at"),
    error: text("error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerEmail, table.calendarKey] }),
    uniqueIndex("managed_calendars_owner_calendar_unique").on(
      table.ownerEmail,
      table.calendarId,
    ),
  ],
);

export const calendarLinks = sqliteTable(
  "calendar_links",
  {
    ownerEmail: text("owner_email").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    sourceOccurrence: text("source_occurrence").notNull().default("main"),
    calendarId: text("calendar_id").notNull(),
    googleEventId: text("google_event_id").notNull(),
    etag: text("etag"),
    desiredHash: text("desired_hash").notNull(),
    observedStartAt: text("observed_start_at"),
    observedEndAt: text("observed_end_at"),
    eventKind: text("event_kind").notNull(),
    syncStatus: text("sync_status").notNull().default("synced"),
    lastSyncedAt: text("last_synced_at"),
    error: text("error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.ownerEmail,
        table.sourceType,
        table.sourceId,
        table.sourceOccurrence,
      ],
    }),
    uniqueIndex("calendar_links_owner_event_unique").on(
      table.ownerEmail,
      table.calendarId,
      table.googleEventId,
    ),
    index("calendar_links_owner_sync_idx").on(
      table.ownerEmail,
      table.syncStatus,
    ),
  ],
);

export const planningGaps = sqliteTable(
  "planning_gaps",
  {
    ownerEmail: text("owner_email").notNull(),
    gapId: text("gap_id").notNull(),
    kind: text("kind").notNull(),
    severity: text("severity").notNull(),
    status: text("status").notNull().default("open"),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    gapDate: text("gap_date"),
    dueAt: text("due_at"),
    snoozedUntil: text("snoozed_until"),
    resolutionNote: text("resolution_note"),
    googleTaskId: text("google_task_id"),
    firstSeenAt: text("first_seen_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    resolvedAt: text("resolved_at"),
  },
  (table) => [
    primaryKey({ columns: [table.ownerEmail, table.gapId] }),
    index("planning_gaps_owner_status_idx").on(
      table.ownerEmail,
      table.status,
      table.severity,
    ),
    index("planning_gaps_owner_source_idx").on(
      table.ownerEmail,
      table.sourceType,
      table.sourceId,
    ),
  ],
);

export const dayIntents = sqliteTable(
  "day_intents",
  {
    ownerEmail: text("owner_email").notNull(),
    intentDate: text("intent_date").notNull(),
    kind: text("kind").notNull(),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerEmail, table.intentDate] }),
    index("day_intents_owner_date_idx").on(
      table.ownerEmail,
      table.intentDate,
    ),
  ],
);

export const openTopics = sqliteTable(
  "open_topics",
  {
    ownerEmail: text("owner_email").notNull(),
    topicId: text("topic_id").notNull(),
    topicGroup: text("topic_group").notNull(),
    status: text("status").notNull().default("open"),
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    nextStep: text("next_step").notNull().default(""),
    dueAt: text("due_at"),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    evidence: text("evidence").notNull().default(""),
    confidencePermille: integer("confidence_permille"),
    requiresCalendarTarget: integer("requires_calendar_target", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    calendarTarget: text("calendar_target"),
    snoozedUntil: text("snoozed_until"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    resolvedAt: text("resolved_at"),
  },
  (table) => [
    primaryKey({ columns: [table.ownerEmail, table.topicId] }),
    index("open_topics_owner_group_status_idx").on(
      table.ownerEmail,
      table.topicGroup,
      table.status,
    ),
  ],
);

export const decisionRecords = sqliteTable(
  "decision_records",
  {
    ownerEmail: text("owner_email").notNull(),
    decisionId: text("decision_id").notNull(),
    topicId: text("topic_id"),
    sourceJournalId: text("source_journal_id"),
    title: text("title").notNull(),
    decision: text("decision").notNull(),
    calendarTarget: text("calendar_target"),
    appliedAt: text("applied_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerEmail, table.decisionId] }),
    index("decision_records_owner_topic_idx").on(
      table.ownerEmail,
      table.topicId,
    ),
  ],
);

export const syncOutboxItems = sqliteTable(
  "sync_outbox_items",
  {
    ownerEmail: text("owner_email").notNull(),
    itemId: text("item_id").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    operation: text("operation").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    sourceOccurrence: text("source_occurrence").notNull().default("main"),
    payloadJson: text("payload_json").notNull(),
    status: text("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: text("next_attempt_at").notNull(),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerEmail, table.itemId] }),
    uniqueIndex("sync_outbox_owner_dedupe_unique").on(
      table.ownerEmail,
      table.dedupeKey,
    ),
    index("sync_outbox_owner_status_next_idx").on(
      table.ownerEmail,
      table.status,
      table.nextAttemptAt,
    ),
  ],
);

export const syncRuns = sqliteTable(
  "sync_runs",
  {
    ownerEmail: text("owner_email").notNull(),
    runId: text("run_id").notNull(),
    mode: text("mode").notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull(),
    desiredCount: integer("desired_count").notNull().default(0),
    createCount: integer("create_count").notNull().default(0),
    patchCount: integer("patch_count").notNull().default(0),
    deleteCount: integer("delete_count").notNull().default(0),
    conflictCount: integer("conflict_count").notNull().default(0),
    retryCount: integer("retry_count").notNull().default(0),
    summary: text("summary").notNull().default(""),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
  },
  (table) => [
    primaryKey({ columns: [table.ownerEmail, table.runId] }),
    index("sync_runs_owner_started_idx").on(
      table.ownerEmail,
      table.startedAt,
    ),
  ],
);

export const planningSettings = sqliteTable("planning_settings", {
  ownerEmail: text("owner_email").primaryKey(),
  automationMode: text("automation_mode").notNull().default("dry-run"),
  dryRunApprovedAt: text("dry_run_approved_at"),
  lastReconcileAt: text("last_reconcile_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
