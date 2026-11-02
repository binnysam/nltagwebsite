# Production migration: CMS tables (`0001_cms_content` + `0002_media_file_storage`)

**Status: prepared, NOT run.** Runs only after the owner's explicit approval in writing. Accounts stay off (`NLTAG_ACCOUNTS_ENABLED=0`) before and after; the public site does not read these tables yet.

## What changes
Database `u339364475_nltag` (MariaDB 11.8.9 on 127.0.0.1). Already applied: `0000_identity_access_audit` (Phase 4b). This run applies two files, in order, in one build:

| File | Effect |
|---|---|
| `0001_cms_content.sql` | **Creates 11 new tables:** `content_item`, `content_translation`, `event_detail`, `sermon_detail`, `ministry_detail`, `testimony_detail`, `bible_translation`, `verse_detail`, `verse_text`, `verse_schedule`, `media_asset`. Indexes and foreign keys (to the new tables and `SET NULL` to `user.id`). **Inserts 2 rows** into `bible_translation`: `bsi-ta` and `nkjv-en`, both `NOT_VERIFIED`, empty credit lines. |
| `0002_media_file_storage.sql` | On the (empty) `media_asset`: adds `storage_key`, drops `data`. |

Not touched: `user`, `session`, `account`, `verification`, `staff_role`, `audit_log`, rate-limit and email tables, and all existing rows. `__drizzle_migrations` gains 2 rows. No church content is inserted.

## 1. Backup (immediately before)
1. hPanel → Databases → phpMyAdmin → `u339364475_nltag` → **Export** → Custom → all tables, structure and data, SQL → download. Name it `nltag-db-before-cms-YYYYMMDD-HHMM.sql`.
2. Open the file and check it ends with the last table's data and lists `__drizzle_migrations` with **1** row (`0000`).
3. Optionally also hPanel → Backups → Database backups → generate. Keep the export off the server.

## 2. Exact procedure
There is no SSH step: the Hostinger build script runs the migration when one environment variable is present (`scripts/hostinger-build.mjs` → `npm run db:migrate`, which refuses production without it).
1. hPanel → Websites → nltagkuwait.com → Node.js → **Environment variables** → **add** `NLTAG_APPROVED_PRODUCTION_MIGRATION` = `1`. Use hPanel's editor: the API replaces the whole variable set and would erase the masked secrets.
2. hPanel → Deployments → **Redeploy** (or push an approved commit to `main`). The build log must show:
   `Owner-approved production migration requested for this build.` → `Migrating database on 127.0.0.1…` → `Migrations applied.`
3. **Remove** `NLTAG_APPROVED_PRODUCTION_MIGRATION` straight after the build completes (another build without it then never migrates).

Command that the build runs (for reference; not run by hand): `NODE_ENV=production npm run db:migrate`.

## 3. Check
In phpMyAdmin (SQL tab, read-only queries):
```sql
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()
  AND table_name IN ('content_item','content_translation','event_detail','sermon_detail','ministry_detail','testimony_detail','bible_translation','verse_detail','verse_text','verse_schedule','media_asset');  -- 11
SELECT id, permission_status FROM bible_translation;                       -- bsi-ta, nkjv-en: NOT_VERIFIED
SHOW COLUMNS FROM media_asset LIKE 'storage_key';                           -- 1 row; no 'data' column
SELECT COUNT(*) FROM __drizzle_migrations;                                  -- 3
SELECT COUNT(*) FROM `user`;                                                 -- unchanged from before
```
Then: https://nltagkuwait.com/ta and /en load; `/admin` still 404 (accounts off); runtime log shows the `[nltag-media-storage]` line with `writable:true`.

## 4. Rollback / recovery
MariaDB applies DDL outside transactions, so a failure can leave some tables created. The old release keeps serving if the build fails, and nothing reads these tables yet, so there is no outage.
- **Preferred — drop only what was added** (no existing data is affected). phpMyAdmin SQL:
  ```sql
  SET FOREIGN_KEY_CHECKS = 0;
  DROP TABLE IF EXISTS verse_schedule, verse_text, verse_detail, testimony_detail, ministry_detail,
    sermon_detail, event_detail, content_translation, content_item, media_asset, bible_translation;
  SET FOREIGN_KEY_CHECKS = 1;
  DELETE FROM __drizzle_migrations ORDER BY id DESC LIMIT 2;  -- only if 2 rows were added; check first
  ```
  Remove `NLTAG_APPROVED_PRODUCTION_MIGRATION` if still set. Fix the cause, then repeat from step 1.
- **Full restore** (only if something outside these tables was harmed): phpMyAdmin → drop all tables → Import the step-1 export. Accounts are off, so no sign-ups are lost between backup and restore.
- Media files: none exist before the migration; nothing to restore.
