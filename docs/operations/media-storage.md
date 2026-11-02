# Media storage (uploaded images)

Owner decision, 2 Nov 2026: uploaded images live in a persistent folder **outside** the deployment.

| | |
|---|---|
| Folder | `/home/u339364475/nltag-data/media` (account home from the system user database + `nltag-data/media`; `NLTAG_MEDIA_DIR` overrides it with an absolute path) |
| Layout | `<first two characters of the id>/<id>` — no file extension. Folders `0700`, files `0600` |
| Database | `media_asset` keeps type, size, SHA-256, alt text (Tamil/English) and `storage_key`; never the bytes |
| Code | `src/server/storage/media-dir.ts` (location, safety rules, health probe) · `src/server/storage/media-store.ts` (atomic write, hash-checked read) · `src/server/cms/service.ts` (`uploadMedia`, `getMediaForStaff`) |

## Why here, and the verification
Hostinger builds every release into a new `~/domains/nltagkuwait.com/hbuilds/versions/<build>/` folder and syncs `public_html`, so anything inside the app is lost on the next deploy. On 2 Nov 2026 the startup probe showed, on production:
- build `01a19b95…` (commit `c0aecbf`): `/home/u339364475/nltag-data/media` created by the Node.js app, writable, read back, mode `700`; marker written;
- build `01a19b98…` (fresh rebuild of `main`, new version folder): marker from the previous build still present → the folder survives a fresh deployment.

Note: the app's `$HOME` is `/home/u339364475/domains/nltagkuwait.com`, which is why the location is resolved from the system user database. The first probe left an empty-apart-from-a-marker folder at `/home/u339364475/domains/nltagkuwait.com/nltag-data/` (private, not web-served); it can be deleted in hPanel File Manager.

Every server start logs one line `[nltag-media-storage] {...}` (Hostinger → Node.js → runtime logs): `writable`, `readBack`, `dirMode`, `markerExisted` and the marker's `markerCreatedAt`. `markerExisted:false` after the first start means the folder was lost or moved — investigate before staff upload anything.

## Safety rules (enforced in code and tests)
- Refused locations: inside the application folder, anywhere under `public_html`, relative paths. Uploads then fail closed ("Images cannot be saved right now"); nothing is written to the database.
- Not executable as application code: outside the web root (the web server never serves or runs it), no extensions, `0600`, never imported by the app.
- Upload checks: staff with `media.upload` only; JPEG/PNG/WebP detected from the bytes (SVG, HTML, PDF refused); 2 MB limit (server action body 3 MB); alt text without HTML.
- Serving: staff only, `/admin/media/<id>` behind the accounts gate, `private, no-store`, `nosniff`, sandbox CSP. A file whose SHA-256 no longer matches its row is not served.
- File first, then the row in a transaction with the audit entry; if the row fails, the file is removed. Audit rows carry the id and type only.
- Not in Git (`.data/` is ignored for local development) and not in any deployment archive.

## Backup
Images and their rows must be backed up **together** (same day):
1. Database: hPanel → Databases → phpMyAdmin → `u339364475_nltag` → Export (SQL, all tables), or hPanel → Backups → Database backups → generate and download.
2. Files: hPanel → Files → File Manager → home folder → `nltag-data` → Compress (zip) → download, then delete the zip from the server. Hostinger's own account backups also include the home folder; check that `nltag-data` appears in a file backup before relying on it.
3. Keep both downloads together, named with the date, off the server.

## Restore
1. Restore the database export (phpMyAdmin → Import) or a Hostinger database backup.
2. Upload the zip to the home folder and extract so the result is `/home/u339364475/nltag-data/media/<xx>/<id>`.
3. Permissions: folders `700`, files `600` (File Manager → Permissions).
4. Restart the Node.js app (hPanel) and check the runtime log line: `writable:true`, `readBack:true`. Open an image in the admin media library: a missing or altered file shows as unavailable instead of being served.

## Moving the folder
Set `NLTAG_MEDIA_DIR` (absolute, outside the app and `public_html`) in the Hostinger environment **through hPanel's editor** (the API replaces the whole variable set), copy the folder contents across, restart, and check the log line.
