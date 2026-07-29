import {
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
