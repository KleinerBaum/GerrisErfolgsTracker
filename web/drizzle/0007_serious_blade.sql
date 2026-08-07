ALTER TABLE `application_generation_jobs` ADD `usage_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `application_generation_jobs` ADD `result_json` text;--> statement-breakpoint
ALTER TABLE `application_generation_jobs` ADD `terminal_error_json` text;--> statement-breakpoint
ALTER TABLE `application_generation_jobs` ADD `completed_at` text;