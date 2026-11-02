-- Phase 4c (owner decision 2 Nov 2026): image bytes move from the database to the persistent media
-- folder outside the deployment. Not applied to production yet; it runs together with 0001, so
-- media_asset is empty when it does. Review: no data is lost (no uploads exist anywhere in production).
ALTER TABLE `media_asset` ADD `storage_key` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;--> statement-breakpoint
ALTER TABLE `media_asset` DROP COLUMN `data`;