CREATE TABLE `bible_translation` (
	`id` varchar(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`locale` enum('ta','en') NOT NULL,
	`name` varchar(120) NOT NULL,
	`publisher` varchar(200) NOT NULL,
	`credit_line` varchar(300) NOT NULL DEFAULT '',
	`permission_status` enum('NOT_VERIFIED','VERIFIED') NOT NULL DEFAULT 'NOT_VERIFIED',
	`permission_reference` varchar(300) NOT NULL DEFAULT '',
	`permission_verified_at` datetime(3),
	`permission_verified_by_user_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin,
	`downloads_allowed` boolean NOT NULL DEFAULT false,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `bible_translation_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `content_item` (
	`id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`type` enum('PAGE','ANNOUNCEMENT','EVENT','SERMON','MINISTRY','TESTIMONY','VERSE') NOT NULL,
	`status` enum('DRAFT','IN_REVIEW','PUBLISHED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
	`slug` varchar(120) CHARACTER SET ascii COLLATE ascii_bin,
	`visibility` enum('PUBLIC','UNLISTED') NOT NULL DEFAULT 'PUBLIC',
	`featured` boolean NOT NULL DEFAULT false,
	`publish_at` datetime(3),
	`expires_at` datetime(3),
	`first_published_at` datetime(3),
	`published_at` datetime(3),
	`submitted_at` datetime(3),
	`version` int unsigned NOT NULL DEFAULT 1,
	`created_by_user_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin,
	`updated_by_user_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`deleted_at` datetime(3),
	`deleted_by_user_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin,
	CONSTRAINT `content_item_id` PRIMARY KEY(`id`),
	CONSTRAINT `content_item_type_slug_uq` UNIQUE(`type`,`slug`)
);
--> statement-breakpoint
CREATE TABLE `content_translation` (
	`item_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`locale` enum('ta','en') NOT NULL,
	`title` varchar(200) NOT NULL DEFAULT '',
	`summary` varchar(500) NOT NULL DEFAULT '',
	`body_md` mediumtext NOT NULL,
	`seo_title` varchar(120) NOT NULL DEFAULT '',
	`seo_description` varchar(320) NOT NULL DEFAULT '',
	`state` enum('EMPTY','DRAFT','READY') NOT NULL DEFAULT 'EMPTY',
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `content_translation_pk` PRIMARY KEY(`item_id`,`locale`)
);
--> statement-breakpoint
CREATE TABLE `event_detail` (
	`item_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`starts_at` datetime(3) NOT NULL,
	`ends_at` datetime(3),
	`location_kind` enum('NECK','MEMBERS_HOMES','OTHER','TO_BE_ANNOUNCED') NOT NULL DEFAULT 'TO_BE_ANNOUNCED',
	`location_text` varchar(200) NOT NULL DEFAULT '',
	CONSTRAINT `event_detail_item_id` PRIMARY KEY(`item_id`)
);
--> statement-breakpoint
CREATE TABLE `media_asset` (
	`id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`mime_type` enum('image/jpeg','image/png','image/webp') NOT NULL,
	`byte_size` int unsigned NOT NULL,
	`sha256` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`alt_ta` varchar(300) NOT NULL DEFAULT '',
	`alt_en` varchar(300) NOT NULL DEFAULT '',
	`data` mediumblob NOT NULL,
	`created_by_user_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin,
	`created_at` datetime(3) NOT NULL,
	`deleted_at` datetime(3),
	CONSTRAINT `media_asset_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ministry_detail` (
	`item_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`image_asset_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin,
	`contact_text` varchar(300) NOT NULL DEFAULT '',
	`contact_approved` boolean NOT NULL DEFAULT false,
	CONSTRAINT `ministry_detail_item_id` PRIMARY KEY(`item_id`)
);
--> statement-breakpoint
CREATE TABLE `sermon_detail` (
	`item_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`speaker` varchar(200) NOT NULL DEFAULT '',
	`bible_reference` varchar(120) NOT NULL DEFAULT '',
	`sermon_date` date,
	`video_url` varchar(500) NOT NULL DEFAULT '',
	`thumbnail_asset_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin,
	CONSTRAINT `sermon_detail_item_id` PRIMARY KEY(`item_id`)
);
--> statement-breakpoint
CREATE TABLE `testimony_detail` (
	`item_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`author_display_name` varchar(120) NOT NULL DEFAULT '',
	`anonymous` boolean NOT NULL DEFAULT true,
	`permission_status` enum('NOT_RECORDED','GRANTED','WITHDRAWN') NOT NULL DEFAULT 'NOT_RECORDED',
	`permission_recorded_at` datetime(3),
	`permission_recorded_by_user_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin,
	CONSTRAINT `testimony_detail_item_id` PRIMARY KEY(`item_id`)
);
--> statement-breakpoint
CREATE TABLE `verse_detail` (
	`item_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`card_variant` enum('compact','landscape','square','portrait') NOT NULL DEFAULT 'compact',
	`preset` enum('vaigarai','manal','kadal','andhi','thalir') NOT NULL DEFAULT 'vaigarai',
	CONSTRAINT `verse_detail_item_id` PRIMARY KEY(`item_id`)
);
--> statement-breakpoint
CREATE TABLE `verse_schedule` (
	`date_key` varchar(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`item_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`scheduled_by_user_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `verse_schedule_date_key` PRIMARY KEY(`date_key`)
);
--> statement-breakpoint
CREATE TABLE `verse_text` (
	`item_id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`translation_id` varchar(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`reference` varchar(120) NOT NULL DEFAULT '',
	`text` varchar(2000) NOT NULL DEFAULT '',
	CONSTRAINT `verse_text_pk` PRIMARY KEY(`item_id`,`translation_id`)
);
--> statement-breakpoint
ALTER TABLE `bible_translation` ADD CONSTRAINT `bible_translation_permission_verified_by_user_id_user_id_fk` FOREIGN KEY (`permission_verified_by_user_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_item` ADD CONSTRAINT `content_item_created_by_user_id_user_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_item` ADD CONSTRAINT `content_item_updated_by_user_id_user_id_fk` FOREIGN KEY (`updated_by_user_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_item` ADD CONSTRAINT `content_item_deleted_by_user_id_user_id_fk` FOREIGN KEY (`deleted_by_user_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_translation` ADD CONSTRAINT `content_translation_item_id_content_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `content_item`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_detail` ADD CONSTRAINT `event_detail_item_id_content_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `content_item`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `media_asset` ADD CONSTRAINT `media_asset_created_by_user_id_user_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ministry_detail` ADD CONSTRAINT `ministry_detail_item_id_content_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `content_item`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ministry_detail` ADD CONSTRAINT `ministry_detail_image_asset_id_media_asset_id_fk` FOREIGN KEY (`image_asset_id`) REFERENCES `media_asset`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sermon_detail` ADD CONSTRAINT `sermon_detail_item_id_content_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `content_item`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sermon_detail` ADD CONSTRAINT `sermon_detail_thumbnail_asset_id_media_asset_id_fk` FOREIGN KEY (`thumbnail_asset_id`) REFERENCES `media_asset`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `testimony_detail` ADD CONSTRAINT `testimony_detail_item_id_content_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `content_item`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `testimony_detail` ADD CONSTRAINT `testimony_detail_permission_recorded_by_user_id_user_id_fk` FOREIGN KEY (`permission_recorded_by_user_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `verse_detail` ADD CONSTRAINT `verse_detail_item_id_content_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `content_item`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `verse_schedule` ADD CONSTRAINT `verse_schedule_item_id_content_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `content_item`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `verse_schedule` ADD CONSTRAINT `verse_schedule_scheduled_by_user_id_user_id_fk` FOREIGN KEY (`scheduled_by_user_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `verse_text` ADD CONSTRAINT `verse_text_item_id_content_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `content_item`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `verse_text` ADD CONSTRAINT `verse_text_translation_id_bible_translation_id_fk` FOREIGN KEY (`translation_id`) REFERENCES `bible_translation`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `content_item_listing_idx` ON `content_item` (`type`,`deleted_at`,`status`,`publish_at`);--> statement-breakpoint
CREATE INDEX `content_item_updated_idx` ON `content_item` (`updated_at`);--> statement-breakpoint
CREATE INDEX `event_detail_starts_idx` ON `event_detail` (`starts_at`);--> statement-breakpoint
CREATE INDEX `media_asset_created_idx` ON `media_asset` (`created_at`);--> statement-breakpoint
CREATE INDEX `media_asset_sha_idx` ON `media_asset` (`sha256`);--> statement-breakpoint
CREATE INDEX `verse_schedule_item_idx` ON `verse_schedule` (`item_id`);--> statement-breakpoint
-- Reviewed by hand (Phase 4c): only new tables; no existing identity, access or audit table is altered.
-- The two Gate 0 translations, both without reproduction permission. Credit lines stay empty until
-- the publishers' terms are documented; a Church Admin records verification in the admin.
INSERT INTO `bible_translation` (`id`, `locale`, `name`, `publisher`, `credit_line`, `permission_status`, `permission_reference`, `downloads_allowed`, `updated_at`) VALUES
	('bsi-ta', 'ta', 'BSI Tamil Bible (edition to confirm)', 'The Bible Society of India', '', 'NOT_VERIFIED', '', false, UTC_TIMESTAMP(3)),
	('nkjv-en', 'en', 'New King James Version (NKJV)', 'Thomas Nelson', '', 'NOT_VERIFIED', '', false, UTC_TIMESTAMP(3));
