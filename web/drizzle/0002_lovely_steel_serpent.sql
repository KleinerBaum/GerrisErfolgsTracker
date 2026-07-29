CREATE TABLE `google_task_metadata` (
	`owner_email` text NOT NULL,
	`task_list_id` text NOT NULL,
	`google_task_id` text NOT NULL,
	`legacy_id` text,
	`area` text DEFAULT 'alltag' NOT NULL,
	`quadrant` text DEFAULT 'plan' NOT NULL,
	`estimate_minutes` integer DEFAULT 30 NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`confidential` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner_email`, `task_list_id`, `google_task_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_task_metadata_owner_legacy_unique` ON `google_task_metadata` (`owner_email`,`legacy_id`);--> statement-breakpoint
CREATE TABLE `google_task_settings` (
	`owner_email` text PRIMARY KEY NOT NULL,
	`task_list_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
