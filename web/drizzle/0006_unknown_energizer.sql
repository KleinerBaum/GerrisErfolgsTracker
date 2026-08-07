CREATE TABLE `application_generation_jobs` (
	`job_id` text PRIMARY KEY NOT NULL,
	`owner_hash` text NOT NULL,
	`stage` text NOT NULL,
	`response_id` text NOT NULL,
	`request_json` text NOT NULL,
	`draft_json` text,
	`issues_json` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `application_generation_jobs_owner_expiry_idx` ON `application_generation_jobs` (`owner_hash`,`expires_at`);