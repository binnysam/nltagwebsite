-- Phase 6b: authenticator-app two-factor sign-in for staff (Better Auth two-factor plugin).
-- Additive only: one new table and one new column with a default, so existing accounts are unchanged
-- (two_factor_enabled = false) and the running site keeps working before and after it is applied.
-- secret and backup_codes hold Better Auth ciphertext (encrypted with BETTER_AUTH_SECRET), never plain codes.
-- Rollback (only before any staff has enrolled): DROP TABLE two_factor; ALTER TABLE user DROP COLUMN two_factor_enabled;
-- Production: not applied. Needs the owner's explicit approval and a verified backup first.
CREATE TABLE `two_factor` (
	`id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`secret` text NOT NULL,
	`backup_codes` text NOT NULL,
	`user_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`verified` boolean NOT NULL DEFAULT false,
	`failed_verification_count` int NOT NULL DEFAULT 0,
	`locked_until` datetime(3),
	CONSTRAINT `two_factor_id` PRIMARY KEY(`id`),
	CONSTRAINT `two_factor_user_uq` UNIQUE(`user_id`)
);
--> statement-breakpoint
ALTER TABLE `user` ADD `two_factor_enabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `two_factor` ADD CONSTRAINT `two_factor_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;