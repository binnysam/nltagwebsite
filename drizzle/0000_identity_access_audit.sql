-- Reviewed by hand (Phase 4b). Sets the database default so every table and text column is utf8mb4
-- with the Unicode 14 collation (Tamil). Secrets, ids and hashes override it with ascii_bin per column.
ALTER DATABASE CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;
--> statement-breakpoint
CREATE TABLE `account` (
	`id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`account_id` varchar(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`provider_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`user_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` datetime(3),
	`refresh_token_expires_at` datetime(3),
	`scope` varchar(1024),
	`password` varchar(255) CHARACTER SET ascii COLLATE ascii_bin,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `account_id` PRIMARY KEY(`id`),
	CONSTRAINT `account_provider_uq` UNIQUE(`provider_id`,`account_id`)
);
--> statement-breakpoint
CREATE TABLE `rate_limit` (
	`id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`key` varchar(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`count` int NOT NULL,
	`last_request` bigint NOT NULL,
	CONSTRAINT `rate_limit_id` PRIMARY KEY(`id`),
	CONSTRAINT `rate_limit_key_uq` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`token` varchar(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`ip_address` varchar(64),
	`user_agent` varchar(512),
	`user_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	CONSTRAINT `session_id` PRIMARY KEY(`id`),
	CONSTRAINT `session_token_uq` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`name` varchar(200) NOT NULL,
	`email` varchar(254) NOT NULL,
	`email_verified` boolean NOT NULL DEFAULT false,
	`image` varchar(2048),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `user_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_email_uq` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`identifier` varchar(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`value` text NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `verification_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`actor_user_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin,
	`action` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`outcome` enum('SUCCESS','DENIED','FAILURE') NOT NULL,
	`entity` varchar(64) CHARACTER SET ascii COLLATE ascii_bin,
	`entity_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin,
	`ip_hash` varchar(64) CHARACTER SET ascii COLLATE ascii_bin,
	`reason` varchar(500),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rate_limit_bucket` (
	`bucket_key` varchar(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`window_start` bigint unsigned NOT NULL,
	`count` int unsigned NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	CONSTRAINT `rate_limit_bucket_pk` PRIMARY KEY(`bucket_key`,`window_start`)
);
--> statement-breakpoint
CREATE TABLE `staff_role` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`role` enum('CHURCH_ADMIN','CONTENT_EDITOR') NOT NULL,
	`granted_by_user_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin,
	`granted_at` datetime(3) NOT NULL,
	CONSTRAINT `staff_role_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_role_user_role_uq` UNIQUE(`user_id`,`role`)
);
--> statement-breakpoint
ALTER TABLE `account` ADD CONSTRAINT `account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session` ADD CONSTRAINT `session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_role` ADD CONSTRAINT `staff_role_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `account_user_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `session_expires_idx` ON `session` (`expires_at`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `verification_expires_idx` ON `verification` (`expires_at`);--> statement-breakpoint
CREATE INDEX `audit_log_actor_idx` ON `audit_log` (`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_log_action_idx` ON `audit_log` (`action`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_log_created_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `rate_limit_bucket_expires_idx` ON `rate_limit_bucket` (`expires_at`);