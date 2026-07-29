import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const userStates = sqliteTable("user_states", {
  ownerEmail: text("owner_email").primaryKey(),
  stateJson: text("state_json").notNull(),
  stateVersion: integer("state_version").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});
