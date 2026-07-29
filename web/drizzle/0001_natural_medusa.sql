CREATE TABLE `google_drive_connections` (
	`owner_email` text PRIMARY KEY NOT NULL,
	`google_email` text NOT NULL,
	`encrypted_refresh_token` text NOT NULL,
	`granted_scopes` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
