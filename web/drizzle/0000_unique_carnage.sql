CREATE TABLE `user_states` (
	`owner_email` text PRIMARY KEY NOT NULL,
	`state_json` text NOT NULL,
	`state_version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
