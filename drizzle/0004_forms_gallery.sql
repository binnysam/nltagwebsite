-- Website completion (Nov 2026): prayer requests, contact messages, testimony submissions, public
-- gallery and the Prayer Team role. Additive only (four new tables; one enum value appended to
-- staff_role.role). Staging: applied by `npm run staging:migrate`. Production: NOT applied; needs the
-- owner's explicit approval, a verified backup and the runbook (docs/operations/production-migration-cms.md).
CREATE TABLE `contact_message` (
	`id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`locale` enum('ta','en') NOT NULL,
	`name` varchar(120) NOT NULL,
	`email` varchar(254) NOT NULL,
	`phone` varchar(40) NOT NULL DEFAULT '',
	`subject` varchar(200) NOT NULL,
	`message` text NOT NULL,
	`status` enum('NEW','REPLIED','ARCHIVED') NOT NULL DEFAULT 'NEW',
	`handled_at` datetime(3),
	`handled_by_user_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin,
	`content_hash` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`notified_at` datetime(3),
	CONSTRAINT `contact_message_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gallery_photo` (
	`id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`media_asset_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`caption_ta` varchar(300) NOT NULL DEFAULT '',
	`caption_en` varchar(300) NOT NULL DEFAULT '',
	`status` enum('DRAFT','PUBLISHED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
	`permission` enum('NOT_RECORDED','GRANTED','WITHDRAWN') NOT NULL DEFAULT 'NOT_RECORDED',
	`permission_note` varchar(300) NOT NULL DEFAULT '',
	`permission_recorded_at` datetime(3),
	`permission_recorded_by_user_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin,
	`variants` json,
	`width` int unsigned,
	`height` int unsigned,
	`position` int NOT NULL DEFAULT 0,
	`published_at` datetime(3),
	`created_by_user_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `gallery_photo_id` PRIMARY KEY(`id`),
	CONSTRAINT `gallery_photo_media_uq` UNIQUE(`media_asset_id`)
);
--> statement-breakpoint
CREATE TABLE `prayer_request` (
	`id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`locale` enum('ta','en') NOT NULL,
	`name_enc` text NOT NULL,
	`contact_enc` text NOT NULL,
	`body_enc` mediumtext NOT NULL,
	`contact_requested` boolean NOT NULL DEFAULT false,
	`status` enum('NEW','READ','PRAYED','ARCHIVED') NOT NULL DEFAULT 'NEW',
	`status_changed_at` datetime(3),
	`status_changed_by_user_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin,
	`consent_version` varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`content_hash` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`notified_at` datetime(3),
	CONSTRAINT `prayer_request_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `testimony_submission` (
	`id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`locale` enum('ta','en') NOT NULL,
	`title` varchar(200) NOT NULL,
	`body` text NOT NULL,
	`display` enum('FULL_NAME','FIRST_NAME','ANONYMOUS') NOT NULL,
	`name` varchar(120) NOT NULL DEFAULT '',
	`contact` varchar(254) NOT NULL DEFAULT '',
	`consent_version` varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`status` enum('NEW','ACCEPTED','REJECTED','ARCHIVED') NOT NULL DEFAULT 'NEW',
	`content_item_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin,
	`decided_at` datetime(3),
	`decided_by_user_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin,
	`content_hash` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`notified_at` datetime(3),
	CONSTRAINT `testimony_submission_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `staff_role` MODIFY COLUMN `role` enum('CHURCH_ADMIN','CONTENT_EDITOR','PRAYER_TEAM') NOT NULL;--> statement-breakpoint
ALTER TABLE `contact_message` ADD CONSTRAINT `contact_message_handled_by_user_id_user_id_fk` FOREIGN KEY (`handled_by_user_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gallery_photo` ADD CONSTRAINT `gallery_photo_media_asset_id_media_asset_id_fk` FOREIGN KEY (`media_asset_id`) REFERENCES `media_asset`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gallery_photo` ADD CONSTRAINT `gallery_photo_permission_recorded_by_user_id_user_id_fk` FOREIGN KEY (`permission_recorded_by_user_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gallery_photo` ADD CONSTRAINT `gallery_photo_created_by_user_id_user_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `prayer_request` ADD CONSTRAINT `prayer_request_status_changed_by_user_id_user_id_fk` FOREIGN KEY (`status_changed_by_user_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `testimony_submission` ADD CONSTRAINT `testimony_submission_content_item_id_content_item_id_fk` FOREIGN KEY (`content_item_id`) REFERENCES `content_item`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `testimony_submission` ADD CONSTRAINT `testimony_submission_decided_by_user_id_user_id_fk` FOREIGN KEY (`decided_by_user_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `contact_message_created_idx` ON `contact_message` (`created_at`);--> statement-breakpoint
CREATE INDEX `contact_message_status_idx` ON `contact_message` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `contact_message_hash_idx` ON `contact_message` (`content_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `gallery_photo_public_idx` ON `gallery_photo` (`status`,`permission`,`published_at`);--> statement-breakpoint
CREATE INDEX `prayer_request_created_idx` ON `prayer_request` (`created_at`);--> statement-breakpoint
CREATE INDEX `prayer_request_status_idx` ON `prayer_request` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `prayer_request_hash_idx` ON `prayer_request` (`content_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `testimony_submission_created_idx` ON `testimony_submission` (`created_at`);--> statement-breakpoint
CREATE INDEX `testimony_submission_status_idx` ON `testimony_submission` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `testimony_submission_hash_idx` ON `testimony_submission` (`content_hash`,`created_at`);