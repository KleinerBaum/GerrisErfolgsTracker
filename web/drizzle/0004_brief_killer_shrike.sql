CREATE TABLE `calendar_links` (
	`owner_email` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`source_occurrence` text DEFAULT 'main' NOT NULL,
	`calendar_id` text NOT NULL,
	`google_event_id` text NOT NULL,
	`etag` text,
	`desired_hash` text NOT NULL,
	`observed_start_at` text,
	`observed_end_at` text,
	`event_kind` text NOT NULL,
	`sync_status` text DEFAULT 'synced' NOT NULL,
	`last_synced_at` text,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner_email`, `source_type`, `source_id`, `source_occurrence`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_links_owner_event_unique` ON `calendar_links` (`owner_email`,`calendar_id`,`google_event_id`);--> statement-breakpoint
CREATE INDEX `calendar_links_owner_sync_idx` ON `calendar_links` (`owner_email`,`sync_status`);--> statement-breakpoint
CREATE TABLE `day_intents` (
	`owner_email` text NOT NULL,
	`intent_date` text NOT NULL,
	`kind` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner_email`, `intent_date`)
);
--> statement-breakpoint
CREATE INDEX `day_intents_owner_date_idx` ON `day_intents` (`owner_email`,`intent_date`);--> statement-breakpoint
CREATE TABLE `decision_records` (
	`owner_email` text NOT NULL,
	`decision_id` text NOT NULL,
	`topic_id` text,
	`source_journal_id` text,
	`title` text NOT NULL,
	`decision` text NOT NULL,
	`calendar_target` text,
	`applied_at` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`owner_email`, `decision_id`)
);
--> statement-breakpoint
CREATE INDEX `decision_records_owner_topic_idx` ON `decision_records` (`owner_email`,`topic_id`);--> statement-breakpoint
CREATE TABLE `managed_calendars` (
	`owner_email` text NOT NULL,
	`calendar_key` text NOT NULL,
	`name` text NOT NULL,
	`calendar_id` text,
	`status` text NOT NULL,
	`match_count` integer DEFAULT 0 NOT NULL,
	`access_role` text,
	`private_acl_verified` integer,
	`last_checked_at` text,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner_email`, `calendar_key`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `managed_calendars_owner_calendar_unique` ON `managed_calendars` (`owner_email`,`calendar_id`);--> statement-breakpoint
CREATE TABLE `open_topics` (
	`owner_email` text NOT NULL,
	`topic_id` text NOT NULL,
	`topic_group` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`title` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`next_step` text DEFAULT '' NOT NULL,
	`due_at` text,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`evidence` text DEFAULT '' NOT NULL,
	`confidence_permille` integer,
	`requires_calendar_target` integer DEFAULT false NOT NULL,
	`calendar_target` text,
	`snoozed_until` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`resolved_at` text,
	PRIMARY KEY(`owner_email`, `topic_id`)
);
--> statement-breakpoint
CREATE INDEX `open_topics_owner_group_status_idx` ON `open_topics` (`owner_email`,`topic_group`,`status`);--> statement-breakpoint
CREATE TABLE `planning_gaps` (
	`owner_email` text NOT NULL,
	`gap_id` text NOT NULL,
	`kind` text NOT NULL,
	`severity` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`title` text NOT NULL,
	`detail` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`gap_date` text,
	`due_at` text,
	`snoozed_until` text,
	`resolution_note` text,
	`google_task_id` text,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`resolved_at` text,
	PRIMARY KEY(`owner_email`, `gap_id`)
);
--> statement-breakpoint
CREATE INDEX `planning_gaps_owner_status_idx` ON `planning_gaps` (`owner_email`,`status`,`severity`);--> statement-breakpoint
CREATE INDEX `planning_gaps_owner_source_idx` ON `planning_gaps` (`owner_email`,`source_type`,`source_id`);--> statement-breakpoint
CREATE TABLE `planning_settings` (
	`owner_email` text PRIMARY KEY NOT NULL,
	`automation_mode` text DEFAULT 'dry-run' NOT NULL,
	`dry_run_approved_at` text,
	`last_reconcile_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_outbox_items` (
	`owner_email` text NOT NULL,
	`item_id` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`operation` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`source_occurrence` text DEFAULT 'main' NOT NULL,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner_email`, `item_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_outbox_owner_dedupe_unique` ON `sync_outbox_items` (`owner_email`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `sync_outbox_owner_status_next_idx` ON `sync_outbox_items` (`owner_email`,`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`owner_email` text NOT NULL,
	`run_id` text NOT NULL,
	`mode` text NOT NULL,
	`reason` text NOT NULL,
	`status` text NOT NULL,
	`desired_count` integer DEFAULT 0 NOT NULL,
	`create_count` integer DEFAULT 0 NOT NULL,
	`patch_count` integer DEFAULT 0 NOT NULL,
	`delete_count` integer DEFAULT 0 NOT NULL,
	`conflict_count` integer DEFAULT 0 NOT NULL,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	PRIMARY KEY(`owner_email`, `run_id`)
);
--> statement-breakpoint
CREATE INDEX `sync_runs_owner_started_idx` ON `sync_runs` (`owner_email`,`started_at`);