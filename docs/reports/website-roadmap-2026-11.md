# NLTAG website and Church Family Directory — implementation roadmap

**Date:** 9 November 2026 · **Status:** plan for owner approval. Nothing in it has been built. **Base:** `main` `c2301e2`; PR #25 (`4217ca1`, draft, CI green).
**Inputs:** the owner's product decisions of 9 November 2026, the Phase A audit (`docs/reports/website-completeness-audit-2026-11.md`) and a review of the code.
**Standing rules (unchanged):** accounts off, Church Admin inactive, no membership registration, `noindex,nofollow`, no production migration, environment change or deployment, no merge, no invented content, no unauthorised Bible text, approved Tamil kept exactly.

---

## 0. Findings that change the plan

1. **Pushes to a PR branch deploy a public preview.** Hostinger's bot builds every push to `claude/adoring-planck-sh413q` at `powderblue-fly-151112.hostingersite.com` (PR #25 comment). So a push is a deployment to a public URL, even though merging is the only production deploy. The preview cannot be reached from this sandbox, so it is unknown which environment variables and **which database** it uses. `scripts/hostinger-build.mjs` runs migrations only when `NLTAG_APPROVED_PRODUCTION_MIGRATION=1`. If the preview shares production's variables and that flag were ever left set, a preview build of a branch with new migration files would migrate production. **Before any branch with a migration is pushed**, the owner should confirm in hPanel that previews use their own database, or none, and that the flag is unset (decision **D1**).
2. **Every staff feature depends on the activation milestone.** `/admin` returns 404 until accounts are on (SMTP configured, `NLTAG_ACCOUNTS_ENABLED=1`, `AUTH_RATE_LIMIT=on`) and a Church Admin with two-factor exists. Prayer, contact and testimony inboxes, gallery management and the Family Directory are therefore usable only after activation. The owner treats activation as a separate milestone; this roadmap places it before the public forms go live (§16).
3. **The production migration queue is not empty.** `0003_two_factor` is merged but **not applied to production**. The R4 work reserved "0004" (deferred). New tables in this roadmap must be numbered after these, and each production application needs its own approval and verified backup (`docs/operations/production-migration-cms.md`).
4. **Conflicts with earlier decisions** (owner decisions rank highest; listed so they are superseded on purpose, not silently):
   - **Gate 0 membership model** (self-service applications, family-head registration, email verification, Draft → Approved lifecycle, `NLTAG-2026-0001` membership IDs) versus the new **Church Family Directory**: staff-maintained, no applications, no workflow statuses, no member accounts. The existing permissions `membership.own` (every signed-in user), `membership.decide`, `membership.reports` and `membership.export`, and the `nl-tag-membership` skill, describe the old model. **D2:** confirm that the Directory replaces the Gate 0 membership model, and that the old permissions and skill will be retired when Phase I is built.
   - **Gate 0 "no address"** versus the **map**. The owner now approves the church's own verified address and coordinates for the map. Cottage Meeting hosts stay private, and no other address is ever published. **D3:** confirm this scope.
   - **"Prayer requests are never in the CMS"** (admin guide) versus a secure prayer inbox. The new decision replaces it; the guide will be rewritten in Phase D.
   - **Round-1 matrix "membership invitation" on the homepage.** With a staff-only directory there is nothing to join online, so it becomes a "New here? Visit us" invitation (§3).
5. **No logo file exists in the repository.** The site shows a text wordmark ("NLTAG", Inter Tight 500, +0.08em; Phase 1 foundations). The previous logo lived in the old site (`Mersheena-1/nltagkuwait`, private, not readable here). To "inspect the current logo" the owner needs to supply the file(s) (**C1**).
6. **The client IP cannot be trusted** (`CLIENT_IP_SOURCE` unset; R4 retired every IP-based limit). Spam protection for the public forms therefore cannot use per-visitor IP limits (§5.4).
7. **Image processing needs no new dependency.** `sharp` is already installed as Next.js's optional dependency (`next` → `sharp ^0.35.5`). Whether it loads on Hostinger's Node build must be checked in a preview (**H-check**).

---

## 1. Current feature-completeness matrix

✅ complete · 🟡 partial · ❌ missing · ⛔ blocked on a decision or content. "A" = done in PR #25.

| Area | Feature | Status | Notes |
|---|---|---|---|
| Public | Homepage structure | 🟡 | All sections render; hero welcome, about and contact text are CONTENT REQUIRED; no prayer, gallery or map sections |
| Public | About, vision, mission, history | 🟡 | CMS pages work and appear in the footer (A); text needed |
| Public | Leadership | ⛔ | Page possible; names and photos need church content and permission |
| Public | Worship schedule | ✅ | Gate 0, verified |
| Public | Special meetings: upcoming | ✅ | |
| Public | Special meetings: past list, detail pages, images | ❌ | Images need an event image field (migration) |
| Public | Announcements: detail pages | ❌ | |
| Public | Ministries | ✅ list · ❌ images | |
| Public | Sermons: list, detail, search, filter, paging, share | ✅ (A) | |
| Public | YouTube embedding | ❌ | Sermon video links exist; embed not built |
| Public | Testimonies: list, detail | ✅ (A) | |
| Public | Testimony submission | ❌ | Phase D |
| Public | Prayer request form | ❌ | Phase D |
| Public | Contact form | ❌ | Contact page shows facts only |
| Public | Gallery | ❌ | Phase E |
| Public | Map | ⛔ | Needs the owner's verified address and coordinates |
| Public | Footer and navigation | 🟡 | Footer complete (A); header has 4 fixed links; no About sub-menu |
| Public | 404 | ✅ (A) | Error page (500) still the framework default |
| Public | SEO and link previews | 🟡 | Tags (A); no preview image or favicon (needs logo) |
| Public | Responsive and accessibility | ✅ | 390/768/1280, axe WCAG 2.2 AA in CI |
| CMS | Dashboard | ✅ | Will gain inbox and birthday counts |
| CMS | Pages, announcements, special meetings, sermons, ministries, testimonies, verses | ✅ | |
| CMS | Workflow, preview, role checks | ✅ | |
| CMS | Search and filter | ✅ | Titles and status |
| CMS | Pagination | 🟡 | Lists stop at 200 |
| CMS | Navigation | 🟡 | Visibility drives the footer (A); no ordering or About group |
| CMS | Media library | 🟡 | Upload (2 MB) and delete; staff-only; no resizing, no public delivery, no photo permission |
| CMS | Gallery, video management | ❌ | |
| CMS | Prayer, contact, testimony-submission inboxes | ❌ | |
| CMS | Role-based access | ✅ | Two staff roles; new roles needed (§11) |
| Directory | Church Family Directory | ❌ | Design in Phase G, build in Phase I |

---

## 2. Complete, incomplete, missing (summary)

- **Complete:** schedule, sermon experience, testimonies (read), 404, CMS core (seven types, workflow, preview, roles, audit), accounts and security foundation, design system, bilingual routing.
- **Incomplete:** homepage content, navigation depth, events (past and detail), media library (private only), CMS pagination, link-preview image.
- **Missing:** prayer requests, contact form, testimony submission, gallery, YouTube embeds, map, inboxes, logo and favicon, error page, Family Directory.
- **Blocked on the owner:** church content, logo file, address and coordinates, photo permissions, the decisions in §18.

---

## 3. Public website roadmap (Phase B)

All items reuse `PublicShell`, `SectionIntro`, `EntryList`, `SpecialMeetingCard`, `Button` and the existing tokens. No new visual language.

| # | Item | Detail | Migration |
|---|---|---|---|
| B1 | Special meetings: detail pages and a past list | `/special-meetings/{key}`; Worship times shows upcoming, then a "Past special meetings" list (latest 12, paged). Add-to-calendar (`.ics`, generated on our server, Kuwait time) on upcoming meetings. Members' homes and NECK never carry an address. | No |
| B2 | Announcement detail pages | `/announcements/{key}`, for long notices; the homepage shows summaries | No |
| B3 | Bilingual error page | `[locale]/error.tsx` and `global-error.tsx`, same shell, "Try again" | No |
| B4 | YouTube embed for sermons | Privacy-enhanced (`youtube-nocookie.com`) behind a **click-to-load facade**: nothing loads from Google until the visitor presses play. Responsive 16:9. Accepted URL shapes: `watch?v=`, `youtu.be/`, `/live/`, `/shorts/`, `/embed/`. Anything else keeps today's link-out. "Watch on YouTube" link always shown below as the fallback. | No |
| B5 | Homepage completion | New sections in the approved order: welcome → about → schedule → special meetings → announcements → **latest sermon with video** → ministries → testimonies (+ "Share your testimony" after Phase D) → **gallery highlights** (after E) → verse → **prayer invitation** (after D) → **visit us: map + contact** (after the map) → footer. Sections hide or show their designed empty state until content exists. | No |
| B6 | About section structure | About page with a sub-navigation to history, vision and mission, leadership (CMS pages); needs C2 for ordering | C2 |
| B7 | Map and visit block | Owner-supplied address and coordinates stored as approved constants in `src/content/church.ts` (like the schedule), not CMS-editable. A static location card (address, "Get directions" buttons for Google Maps / Apple Maps) plus an OpenStreetMap or Google Maps embed loaded only on click. No API key, no paid service. | No |
| B8 | Link-preview image and favicon | Generated from the approved logo (Phase F) | No |
| B9 | Header navigation review | Keep 4 links + CTA at 1280 (5 Tamil links overflowed in Phase 2). New pages go in the footer, the About sub-navigation and homepage sections; the mobile menu lists everything. "Prayer request" as a secondary header action only if it fits in Tamil at 1280 (to test). | No |

---

## 4. CMS roadmap (Phase C)

| # | Item | Detail | Migration |
|---|---|---|---|
| C1 | List pagination | Page links on every module list, 25 per page; filters kept | No |
| C2 | Navigation control | Page fields: **menu placement** (Footer / About section / None) and **menu order**. Replaces "Public = in footer" from Phase A with an explicit choice, defaulting to today's behaviour. | Yes (2 columns on `content_item`) |
| C3 | Page images and images in text | One optional lead image per page, sermon, ministry, meeting or album. A Markdown image form `![alt](media:ID)` that renders only approved public images (E2). Covers leadership, history and ministry photos without a new module. | Yes (event image column) |
| C4 | Video links beyond sermons | Same YouTube field and facade on special meetings and albums. **No separate Videos module** (avoids duplication), unless the owner wants a /videos page (**D10**). | Yes (column) |
| C5 | Dashboard | Counts: new prayer requests, new contact messages, testimony submissions, items in review; today's birthdays (Phase I, Directory roles only). Each card appears only for roles that may see it. | No |
| C6 | Inboxes | Prayer, Contact, Testimony submissions (Phase D), same `DataTable`, filters and pagination as content lists | With D |
| C7 | Gallery management | Albums as a content type (same workflow), photo ordering, captions, photo permission (Phase E) | With E |
| C8 | Admin language | The admin stays English-first (Phase 4c decision) with bilingual content fields. **D11:** keep, or translate the admin into Tamil (about 250 new strings). | No |

**Explicitly not added:** separate modules for videos, leaders, categories or menus; WYSIWYG/HTML editing (Markdown stays); member announcements; attendance; exports.

---

## 5. Prayer request architecture (Phase D)

### 5.1 Form (`/{locale}/prayer`)
| Field | Required | Notes |
|---|---|---|
| Your name | Optional | "Leave blank to stay anonymous" |
| Email or phone | Optional | Only if they want the church to contact them; a "Please contact me" checkbox enables it |
| Prayer request | Required | Plain text, 10–2,000 characters |
| Who may read it | Fixed text, not a choice | "Read only by the Church Admin and the church's prayer team" |
| Consent | Required checkbox | Agrees to the privacy note (§12) |
| Hidden: honeypot field, signed form token | — | §5.4 |

Language is recorded (ta/en). No date of birth, address, health category or other fields.

### 5.2 Storage
New table `prayer_request`: `id`, `created_at`, `locale`, `name`, `contact` (email or phone), `contact_requested`, `body`, `status` (`NEW` → `READ` → `PRAYED` → `ARCHIVED`), `status_changed_by/at`, `consent_version`, `content_hash` (for duplicate detection), `notified_at`.
- **Recommended:** `name`, `contact` and `body` encrypted at rest with AES-256-GCM (Node `crypto`, no dependency). The key goes in a new environment variable `NLTAG_DATA_KEY` (hPanel change, owner action), so a leaked database dump or backup does not reveal prayer text. Costs: no text search inside requests, and losing the key loses the data (key backup procedure in §12). **D4.**
- **Deletion:** "until manually deleted". A staff delete is a real row delete (not a soft delete), behind a confirmation dialog; the audit row keeps only the id and the action.

### 5.3 Notification email
Sent to the church mailbox (address **C3**) through the existing nodemailer/SMTP path, as a background task (no queue workers on Hostinger). If sending fails, the request is still stored, `notified_at` stays empty and the inbox shows "Email not sent". Content choice (**D5**):
- **(a) Notice only (recommended once the inbox is live):** "A new prayer request was received", plus a link to the inbox. Prayer text stays out of mailboxes, forwards and phones.
- **(b) Full text:** convenient, but copies sensitive text into email permanently.
- A possible bridge: (b) until activation, then (a).

### 5.4 Spam and abuse (no IP, no paid service)
1. Honeypot field (hidden from people and screen readers).
2. Signed form token (HMAC of the issue time); submissions faster than about 3 s or older than 2 h are refused.
3. Duplicate refusal: same normalised text hash within 24 h → the same "received" message, nothing stored twice.
4. A link limit (≤ 2 URLs) and the length caps.
5. Site-wide ceilings per form (e.g. 20 per 10 minutes, 200 per day) using the existing `rate_limit_bucket` (`reserveWindow`). Over the ceiling, the form shows "Please try again later" and staff get one alert. **Trade-off:** a flood can block real visitors for that window, but it cannot fill the inbox or the mailbox.
6. Optional later, only if spam gets through: a self-hosted proof-of-work check (ALTCHA, MIT, would be a new dependency) or Cloudflare Turnstile (free, third-party, sends visitor data to Cloudflare). **D6:** start with 1–5.

### 5.5 Inbox (`/admin/prayer`)
List (newest first; date, language, status, "contact requested"); no text preview in the list. Opening a request records `prayer.viewed` in the audit. Actions: mark read or prayed, archive, delete (confirmation). Filters: status, date range. Pagination.
**Access:** Church Admin and the new **Prayer Team** role only. Content Editors and everyone else get 404. Two-factor is mandatory for Prayer Team (recommended, **D7**).
**Audit actions** (ids only, never text or names): `prayer.received`, `prayer.viewed`, `prayer.status_changed`, `prayer.deleted`, `prayer.notify_failed`.

---

## 6. Contact form architecture (Phase D)

Fields (approved): **Name, Email, Phone (optional), Subject, Message**, plus a short privacy note (consent checkbox not required: the visitor is asking to be contacted; the note says how data is used). Same validation, token, honeypot, duplicate and ceiling protections as prayer.
Table `contact_message`: `id`, `created_at`, `locale`, `name`, `email`, `phone`, `subject`, `message`, `status` (`NEW` → `REPLIED` → `ARCHIVED`), `handled_by/at`, `content_hash`, `notified_at`.
**Email:** full message to the church mailbox, with `Reply-To` set to the visitor's address (staff reply from their mail program). Not encrypted at rest (ordinary correspondence) unless D4 is extended.
**Inbox** `/admin/contact`: Church Admin, plus anyone given the **Contact Inbox** permission (**D8**: Church Admin only, or also a named role). Audit: `contact.received/viewed/status_changed/deleted`.
**Retention (decision D9):** recommended automatic deletion 12 months after archiving, or manual only, like prayer.
**Messages:** success and error text in Tamil and English (new strings, §13). On failure: "Your message could not be sent. Please try again." Typed data is kept in the form.

---

## 7. Testimony submission architecture (Phase D)

Re-uses the existing TESTIMONY content type and its permission rule, so there is no second testimony module.
1. **Public form** `/{locale}/testimonies/share`: title, testimony text (plain, ≤ 5,000), display choice **Full name / First name only / Anonymous**, the name, an optional email or phone (private, only for staff questions), language, and two required consents: (a) "I agree that the church may publish this testimony, edited for length and clarity, with the name I chose", and (b) "I have not included private details about other people without their permission". Same spam protections.
2. **Storage:** `testimony_submission` (private: contact, consent text version and time, original text, display choice, status `NEW` → `ACCEPTED` / `REJECTED` / `ARCHIVED`, `content_item_id` once accepted).
3. **Review** `/admin/testimony-submissions` (Church Admin and Content Editors; contact details visible to Church Admin only, **D12**). "Accept as draft" creates a TESTIMONY **draft** carrying the text and the chosen display name (`anonymous` / `authorDisplayName` = full or first name), with permission recorded as **Granted, by the submitter, at <time>, consent version <n>**. The normal workflow then applies: edit → review → publish by Church Admin. Reject or archive keeps it unpublished.
4. **Never public:** contact details, the original text, the consent record and rejected submissions. Withdrawal: a later request to remove is handled by recording **Withdrawn** (existing behaviour: unpublishes at once).
5. **Retention (D9):** rejected submissions deleted after 90 days (recommended); accepted ones keep the consent record as long as the testimony exists.

---

## 8. Media, gallery, video and map (Phase E, with B4/B7)

### 8.1 Image pipeline
- Upload limit raised from 2 MB to **15 MB** (phone photos) for JPEG, PNG and WebP (HEIC: **D13**, needs conversion support). Server-action body limit adjusted. Hostinger storage check: about 1,000 photos ≈ 3–5 GB originals.
- On upload, `sharp` (already installed) writes resized **WebP variants** at 480, 960 and 1600 px wide. Re-encoding **strips metadata (including GPS location)**. The original stays private.
- Variants are files in the existing persistent media folder (`/home/u339364475/nltag-data/media`), never in the deployment.

### 8.2 Public delivery (owner approval needed for this security change, **D14**)
`/media/{id}/{width}.webp`: served **only** when the asset is attached to published, visible content (or a published album) **and** its photo permission is **Granted**. Otherwise 404 (the same answer as "does not exist"). `Cache-Control: public, max-age=31536000, immutable` with the hash in the URL; `nosniff`. Staff-only originals stay at `/admin/media/{id}`. Responsive `<img srcset>` with width and height to avoid layout shift; lazy loading below the fold.

### 8.3 Photo permission
New `media_asset` fields: `public_permission` (`NOT_RECORDED` / `GRANTED` / `WITHDRAWN`), `permission_note` (e.g. "consent forms on file, Harvest Festival 2026"), recorded by Church Admin. Default Not recorded: an image cannot appear publicly until a Church Admin records Granted. Children in photos: **D15** (recommend publishing only with recorded parental consent; avoid close-up identifiable children by default).

### 8.4 Gallery
- New content type **ALBUM** (same workflow, Tamil/English title and description, publish/archive), category, cover photo, ordered photos with optional captions in both languages.
- **Categories:** a short fixed list approved by the owner (e.g. Worship, Special meetings, Ministries, Fellowship, Children & youth; wording **C6**), stored as an enum.
- Public: `/gallery` (albums grid, category filter, pagination), `/gallery/{key}` (photo grid → full-size view with captions, keyboard and swipe, Esc to close, focus returned). Static: no animation beyond the hero rule.
- Tables: `album_detail` (category, cover media id), `album_photo` (album, media, position, caption ta/en).

### 8.5 Video (with B4/C4)
YouTube links on sermons, special meetings and albums. Validated when saved (URL shape plus a YouTube oEmbed check from the server, free and keyless; the save is not blocked if YouTube is unreachable). Rendered with the click-to-load facade and the link fallback.

### 8.6 Map (B7)
From the owner's verified address and coordinates only (**C2**). Click-to-load map (OpenStreetMap embed recommended: free, no key; Google Maps embed as an alternative, **D16**) plus "Get directions" links. No location appears anywhere until C2 arrives.

---

## 9. Church Family Directory architecture (Phase G design, Phase I build)

### 9.1 Principles
Staff-maintained records (no member accounts, no self-service, no applications or IDs). Minimum data. Archive before delete. History of family changes kept. Separate from the CMS: its own section, roles and audit actions.

### 9.2 Data model (planned migration; not created now)
**`family`**: `id`, `household_name` (e.g. "Samuel family"), `status` (`ACTIVE` / `ARCHIVED`), `archived_reason` (Moved away / Other), `archived_at/by`, `phone`, `email` (optional household contact), `notes` (restricted, encrypted per D4), `created/updated_at/by`, `version`.
**`person`**: `id`, `full_name`, `birth_day`, `birth_month`, `birth_year` (year optional: many adults prefer not to give it; ages shown only when known), `baptism_status` (`BAPTIZED` / `NOT_BAPTIZED` / `UNKNOWN`), `baptism_date` (only when baptized; optional), `phone`, `email` (optional, adults), `status` (`ACTIVE` / `ARCHIVED`), `archived_reason` (Moved away / Left the church / Deceased / Other), `archived_at/by`, `created/updated_at/by`, `version`.
**`family_membership`** (history of who belonged to which family): `id`, `family_id`, `person_id`, `relationship` (`HEAD`, `SPOUSE`, `CHILD`, `PARENT`, `SIBLING`, `GRANDCHILD`, `RELATIVE`, `OTHER`), `is_primary_contact`, `from_date`, `to_date` (empty = current), `end_reason` (`MARRIED`, `MOVED_FAMILY`, `SEPARATED`, `ARCHIVED`, `CORRECTION`), `created_by/at`.
- **One current family per person**, enforced in the service and by a unique index on (`person_id`, generated `is_current` = 1 when `to_date` is empty, otherwise NULL). MariaDB has no partial indexes; NULLs do not collide.
- **Never in the directory:** addresses (unless decided, **D17**), gender, national ID or civil ID, photos, occupation, ministry or group, attendance, giving, membership category.

### 9.3 Workflows (each a guided form with a "what will change" summary before saving)
| Case | Steps | Effect |
|---|---|---|
| New child | Family → Add member → name, date of birth, relationship Child, baptism status | New person plus a current membership; family unchanged |
| Marriage | Person → "Start a new family" → choose or create the spouse → household name | Old memberships end (`MARRIED`); new family with both as Head/Spouse; no duplicate person; history shows both families |
| Join spouse's family | Person → "Move to another family" → pick the family and relationship | Old membership ends (`MOVED_FAMILY`), new one starts |
| Separation or family change | Move members one by one, or "Split family" (pick the members who form the new household) | Memberships end and start with `SEPARATED`; the original family stays with its remaining members |
| Person leaves or dies | Person → Archive → reason | Hidden from lists and birthdays; family shows "1 archived member"; history kept |
| Wrong entry or erasure request | Church Admin → Delete permanently → type the name to confirm | Person and memberships deleted; audit keeps ids only; the dialog explains the family effect |
| Family inactive | Family → Archive | All current members are archived too, or moved first (the dialog lists them) |
| Primary contact | Family → choose the member | Single primary per family |

### 9.4 Birthdays (Asia/Kuwait)
- Dashboard card: **Today** and the **next 7 days** (name, family, age turning if the year is known).
- `/admin/directory/birthdays`: this month (default), month picker, next 30 days; printable view (screen print only, no file export).
- 29 February birthdays show on 28 February in non-leap years (**D18**, recommended).
- Archived people are excluded. "Today" uses the Kuwait date (`src/lib/date.ts`).
- **No automated emails or messages** (owner decision; any reminder email needs separate approval).

### 9.5 Interface
- `/admin/directory`: search by person or family name (Tamil and English, accent-insensitive collation already in use); filters: Active/Archived, baptism status, birthday month; results grouped by family (household name → members with relationship, date of birth/age, baptism badge).
- Family page: members table, contact, notes (Directory Keeper and Church Admin only), history timeline, actions.
- Person page: details, current family, family history, actions.
- English-first like the admin (D11), large targets, plain words ("Move to another family", not "Reassign membership").

### 9.6 Access and audit
New role **Directory Keeper**. Directory permissions also go to Church Admin. Content Editors, Prayer Team and visitors get 404. Two-factor mandatory. No public route or API ever reads directory tables (enforced by a test that greps routes, like the G2 allowlist test). Audit (ids and field **names** only, never values): `directory.family.created/updated/archived/deleted`, `directory.person.created/updated/archived/deleted/moved`, `directory.person.viewed`, `directory.birthdays.viewed`.

### 9.7 Policies (owner to approve in Phase G, **D19**)
- **Notice to the congregation:** the church tells members what it records and why, and how to correct or remove it (draft provided in Phase G).
- **Correction:** any member may ask staff to correct their family's details; staff edit.
- **Retention:** active records kept while people are part of the church; archived records kept N years (proposal: 5), then deleted unless the church decides otherwise; deceased: archived, kept for church history unless the family asks otherwise.
- **Deletion:** on request, by Church Admin, permanent.
- **Backups:** Hostinger database backups contain directory data; download rules: no copies on personal devices, encrypted storage only. The key for encrypted notes is held by two named people.
- **Children:** recorded under the family by staff; never public; no contact details for minors.
- **Development:** fictional data only (`[Example family]`), no real records until Phase I is approved.

### 9.8 Phase G deliverables (design only)
Data model and migration SQL as a reviewed document (**not applied**), permission matrix, workflow wireframes and a clickable prototype with fictional data (staff-only gallery page or local HTML, never deployed with real data), the policy drafts in 9.7, and a test plan. Then owner approval → Phase I.

---

## 10. Database and API changes

| Migration (proposed, after `0003` and the reserved `0004`) | Phase | Contents |
|---|---|---|
| `M-c` website structure | C | `content_item.menu_placement`, `menu_order`; `event_detail.image_media_id`; `video_url` columns on event and album |
| `M-d` forms and roles | D | `prayer_request`, `contact_message`, `testimony_submission`; `staff_role.role` enum + `PRAYER_TEAM` (+ `DIRECTORY_KEEPER` reserved for I) |
| `M-e` gallery | E | `content_item.type` enum + `ALBUM`; `album_detail`, `album_photo`; `media_asset.public_permission`, `permission_note`, `permission_by/at`, `variants` |
| `M-i` directory | I | `family`, `person`, `family_membership` |

**Recommendation:** develop and test them separately. For production, apply C+D+E together in **one approved migration window** (one backup, one runbook, fewer risky events), after `0003`. Apply `M-i` only after Phase I approval.

**Routes and actions.** Public: `/prayer`, `/testimonies/share`, a contact form on `/contact`, `/gallery`, `/gallery/{key}`, `/special-meetings/{key}`, `/announcements/{key}`, `/media/{id}/{w}.webp`. Submissions use **server actions** (no new public JSON API). Admin: `/admin/prayer`, `/admin/contact`, `/admin/testimony-submissions`, `/admin/gallery` (module), `/admin/directory/*`. Every write goes through a service module (`src/server/forms/*`, `src/server/directory/*`), which checks permissions itself, as `cms/service.ts` does. The accounts gate covers `/admin` as today.

**New environment variables (owner adds in hPanel at activation):** `NLTAG_CHURCH_INBOX` (church mailbox address), `NLTAG_DATA_KEY` (if D4), and the SMTP variables (already designed).

---

## 11. Role and permission matrix (proposed)

| Permission | Visitor | Content Editor | Prayer Team | Directory Keeper | Church Admin |
|---|---|---|---|---|---|
| Read published content | ✓ | ✓ | ✓ | ✓ | ✓ |
| Submit public forms | ✓ | ✓ | ✓ | ✓ | ✓ |
| Admin access (dashboard) | | ✓ | ✓ (prayer only) | ✓ (directory only) | ✓ |
| Draft and edit content, upload media | | ✓ | | | ✓ |
| Publish, archive, delete content; photo permission | | | | | ✓ |
| Testimony submissions: read text, accept/reject | | ✓ | | | ✓ |
| Testimony submissions: submitter contact details | | | | | ✓ |
| Prayer inbox: read, mark, archive | | | ✓ | | ✓ |
| Prayer: delete | | | ✓ (D7) | | ✓ |
| Contact inbox | | | | | ✓ (+ D8) |
| Directory: read, birthdays | | | | ✓ | ✓ |
| Directory: add, edit, move, archive | | | | ✓ | ✓ |
| Directory: permanent delete | | | | | ✓ |
| Staff and roles; audit log | | | | | ✓ |
| Two-factor required | — | optional | **required** | **required** | required |

Retired with Phase I (D2): `membership.own`, `membership.decide`, `membership.reports`, `membership.export`. The dashboard shows each person only the cards for their own permissions.

---

## 12. Privacy and consent requirements

- **Privacy page** `/{locale}/privacy` (new; Claude drafts, owner approves, **C4**): what each form collects, why, who reads it, how long it is kept, how to ask for correction or deletion, the church contact. Linked from every form and the footer.
- **Consent texts** (prayer, testimony publication, testimony third-party, photo permission notes, the directory notice), each with a version number stored with the record so later wording changes are traceable.
- **Data minimisation:** only the fields listed above. No tracking, analytics or third-party scripts (embeds load on click only).
- **Security:** forms over HTTPS, server validation, no personal data in logs or audit rows, HMAC tokens, optional encryption at rest (D4), staff 2FA for sensitive roles, `no-store` on every admin page.
- **Law:** Kuwait's CITRA Data Privacy Protection Regulation may apply to a church processing personal data; the owner should confirm obligations with a qualified adviser before the forms and the directory go live (Claude cannot give legal advice).
- **Prayer retention:** "until manually deleted" is approved. Still open: a reminder to review requests older than e.g. 12 months (recommended: a dashboard nudge, no automatic deletion), and the email content (D5).

---

## 13. Tamil translation requirements

| Phase | New strings (estimate) | What |
|---|---|---|
| A | 13 | **Approved 9 Nov 2026**; to be recorded as `confirmed` (A-1) |
| B | ~25 | Past meetings, add to calendar, error page, video facade ("Play video", "Watch on YouTube"), map ("Get directions", "Load map"), About sub-navigation |
| D | ~70 | Three forms: labels, hints, errors, success, consent and privacy text (the longest and most sensitive wording) |
| E | ~20 | Gallery, categories (C6), photo viewer controls |
| F | — | Church copy, written in both languages as CMS content (not interface strings) |
| G/I | 0 public | The admin is English (D11) |

Each phase adds `draft-review` strings, updates the review record (`npm run review:tamil`) and the pending list in `tests/unit/tamil-review.test.ts`, and is not merged until approved. Consent and privacy text gets a separate careful review (owner, ideally a native-speaker reader in the church).

---

## 14. Design and responsive QA requirements

- Before UI work: foundations → token reference → component spec → page composition (CLAUDE.md). Tokens only; new component tokens as `[ADDITION]` for approval. Expected additions: gallery grid gap/ratio, video and map facade aspect ratio, lightbox scrim (reuses `--color-scrim`).
- New components (spec + gallery entry + tests each): `VideoEmbed` (facade), `MapEmbed` (facade), `PhotoGrid`, `PhotoViewer`, `FormNotice` patterns built from `TextField`/`Notice`, `Pagination` (Phase A, to be documented as a component), `BirthdayList` (directory).
- Widths: 390, 768, 1024, 1280 (+1440 visual check); Tamil and English; no sideways scroll; 44px targets; one h1; focus visible; reduced motion; only the hero animates; light only.
- Real-device checks: low-end Android (open pre-launch item 10), iPhone Safari (forms, photo viewer, video facade).
- Performance budget (mobile, 4G throttled): LCP ≤ 2.5 s, CLS ≤ 0.1, no third-party requests before user action.

---

## 15. Testing and acceptance criteria

Per phase, definition of done as in CLAUDE.md (`verify`, MariaDB integration, browser suites at 390/1280 with axe), plus:

| Phase | Acceptance criteria (examples, all automated unless noted) |
|---|---|
| B | Past meetings never show members' homes addresses; the video facade makes **zero** requests to Google before a click (network assertion); map facade likewise; error page in both languages |
| C | Lists paginate correctly at 0, 1, 25, 26, 500 rows; menu placement and order drive the footer and About menus; images in text render only for Granted public media |
| D | Each form: valid → stored + one email; invalid → field errors, nothing stored; honeypot, early/late token, duplicate and ceiling refusals; no submission readable by Content Editor (prayer, contact) or by visitors (all); audit rows carry no text; prayer delete removes the row; encrypted columns unreadable in the raw table (if D4); testimony accept → draft with Granted-by-submitter, never auto-published |
| E | Ungranted or unpublished image → 404 on `/media`; variants carry no EXIF/GPS; srcset widths correct; lightbox keyboard and focus; album workflow same as other content |
| G | Owner sign-off on model, workflows, policies and prototype (manual) |
| H | Full suite green on the release candidate; content checklist complete; Lighthouse mobile budget met; real-device checks; no CONTENT REQUIRED visible; links check (no 404 links); preview smoke test |
| I | Every workflow in 9.3 as an integration test (including "no duplicate person", "one current family", history kept); role isolation (Content Editor/Prayer Team/visitor see 404); birthday maths in Kuwait time, incl. 29 Feb, year unknown, year boundaries; no public route touches directory tables |

---

## 16. Dependencies and recommended order

```
A (PR #25 approval) ─┬─> B (no migration) ───────────────┐
                     ├─> C1, C5 (no migration)            │
                     │                                    ├─> H (QA + launch prep) ─> owner launch
F (content, logo) ───┼─> B8, B5/B6 content, C4 privacy ───┤
  starts now         │                                    │
G (directory design) │  parallel, no code dependency      │
                     └─> C2–C4 + D + E (code, tests) ─────┤
                              │                           │
     D1 preview DB check ─────┤ (before pushing migrations)
     Activation milestone ────┴─> production migration window (C+D+E) ─> forms and gallery live
                                                    └─> I (directory build, after G approval)
```

**Recommended order:**
1. **A:** record the Tamil approval (A-1), owner reviews the PR, merge only on the owner's word.
2. **F starts immediately, in parallel**, because it has the longest lead time: church facts, logo files, address and coordinates, photos with permission, mailbox address.
3. **B:** public features that need no migration (B1–B4, B9; B7 when coordinates arrive).
4. **C1/C5** (no migration), then **C2–C4, D, E** developed together on one branch with migrations `M-c`, `M-d`, `M-e`, tested on local MariaDB, **pushed only after D1**.
5. **G** in parallel with B–E (design documents and prototype only).
6. **Activation milestone (owner's separate approval):** SMTP and mailbox in hPanel, `0003` + `M-c/d/e` production migration window with backup, first Church Admin with two-factor, staff roles. Forms go public only after this, so nothing is collected that no one can read.
7. **H:** full QA, content complete, indexing decision.
8. **I:** directory build after G approval (its own migration window).

---

## 17. Estimated complexity

Engineering effort (Claude working time, excluding owner review time and waiting for content):

| Phase | Complexity | Estimate | Main risk |
|---|---|---|---|
| A | Low | ½ day | None |
| B | Medium | 4–6 days | Header fit in Tamil; map waits for coordinates |
| C | Medium | 4–6 days | Migration coordination |
| D | High | 8–12 days | Privacy wording, spam without IP, email reliability |
| E | High | 7–10 days | `sharp` on Hostinger, storage size, photo permissions |
| F | Medium (Claude) / owner-dependent | 3–5 days drafts + logo concepts | Content availability |
| G | Medium | 4–6 days | Policy decisions |
| H | Medium | 4–6 days | Real-device access, content completeness |
| I | High | 10–15 days | Data correctness, history handling, training staff |

---

## 18. Decisions and content needed from the owner

**Decisions**
- **D1** Preview builds: confirm they use a separate database (or none) and `NLTAG_APPROVED_PRODUCTION_MIGRATION` is not set for them, before any branch with a migration is pushed. Also whether docs-only pushes to PR #25 (which rebuild the preview) are acceptable.
- **D2** The Family Directory supersedes the Gate 0 membership model; retire the old `membership.*` permissions and skill in Phase I.
- **D3** The map may show the church's own verified address (Gate 0 "no address" relaxed for the church location only).
- **D4** Encrypt prayer requests (and directory notes) at rest with `NLTAG_DATA_KEY` (recommended), and name two key holders.
- **D5** Prayer notification email: notice only, full text, or full text until activation.
- **D6** Spam: start with honeypot + token + duplicates + site-wide ceilings, no third-party captcha.
- **D7** Prayer Team role: two-factor mandatory; may they delete requests or only Church Admin?
- **D8** Contact inbox: Church Admin only, or also another role?
- **D9** Retention: contact messages (recommend 12 months after archiving), rejected testimony submissions (90 days), prayer review reminder after 12 months.
- **D10** YouTube: videos on sermons, meetings and albums only (recommended), or also a separate /videos page.
- **D11** Admin interface language: English-first (as now) or Tamil too.
- **D12** May Content Editors read testimony submissions (without contact details)?
- **D13** Accept iPhone HEIC photos (conversion), or JPEG/PNG/WebP only.
- **D14** Approve the public image route (security change to the Phase 5 "staff-only media" rule) and the 15 MB upload limit.
- **D15** Policy for photos of children.
- **D16** Map: OpenStreetMap (recommended) or Google Maps embed.
- **D17** Directory: no addresses (recommended) or a household address field.
- **D18** 29 February birthdays shown on 28 February.
- **D19** Directory policies in 9.7 (notice, correction, retention years, deletion, backups, key holders).
- **D20** Production timing: forms and gallery open only after the activation milestone (recommended).

**Content and assets** (F)
- **C1** The current logo files (and any brand material) from the old site or the church.
- **C2** Verified church address (Tamil and English wording) and map coordinates.
- **C3** The church mailbox address for notifications.
- **C4** Approval of the privacy page and consent texts (Claude drafts).
- **C5** Church facts for the copy: welcome message intent, history (dates, founders only as the church wants named), vision and mission wording or source, leadership names and roles (with photo permission), ministries and their contacts, public phone/email, social accounts if any.
- **C6** Gallery category names.
- **C7** First photos with recorded permission; first sermons with YouTube links.
- **C8** Bible permission records (BSI Tamil, NKJV) if verse text is wanted at launch (otherwise the placeholder stays).

---

## Phase summaries

- **Phase A: PR #25 review.** The 13 Tamil strings are approved (9 Nov 2026). Verified identical in `src/content/ui-strings.ts` and `docs/content/tamil-content-review.md`, still marked `draft-review`. A-1: mark them `confirmed`, add a `phaseAApprovedTamil` approval record, update the review sheet, the pending list and CLAUDE.md (one commit; push = preview rebuild, D1). The PR stays a draft until the owner's review; no merge, no deploy.
- **Phase B: remaining public features** (§3).
- **Phase C: CMS completion** (§4).
- **Phase D: prayer, contact, testimony workflows** (§5–7).
- **Phase E: gallery, video, map** (§8).
- **Phase F: content and branding.** Content intake questionnaire per page (facts the church must give vs copy Claude may draft); drafts of welcome, about structure, ministry introductions, the privacy page and consent texts, all marked DRAFT and unpublished until approved; every published fact traceable to an owner message. Logo: review the supplied current logo, a short brief (values, Tamil and English names, use at 16 px to signage), **three concepts** as SVG on an isolated review page (wordmark-led, monogram, symbol + wordmark), each shown in Tamil and English lockups, one colour, favicon, on the hero and on paper. No production change until the owner chooses; then favicon, OG image and header wordmark in one approved PR. No paid fonts or services.
- **Phase G: Family Directory design** (§9.8).
- **Phase H: QA and launch preparation.** §14–15; pre-launch checklist (Tamil records complete, Bible permission, real-device hero check, `robots`/sitemap and indexing switch prepared but off until the owner approves); npm moderate advisories cleared if dependency changes are approved.
- **Phase I: Family Directory build** (after G approval and activation).
