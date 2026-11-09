# Website completeness audit — 9 November 2026

**Base:** `main` at `c2301e2` (PR #24). **Method:** code read of every public route, CMS module, server loader and schema; then a production build (`scripts/serve-gallery.sh`) against MariaDB 11.8.9 seeded with the public fixtures (`npm run db:seed:public`), every public route opened at 390 px and 1280 px in Tamil and English, links and status codes recorded. Nothing below is assumed from documentation alone.

**Out of scope here (owner instruction):** credential rotation and unrelated security work. **Unchanged boundaries:** Tamil default, light only, `noindex,nofollow`, `NLTAG_ACCOUNTS_ENABLED=0`, no Church Admin, no membership, no migration, no production or Hostinger change, no deploy or merge.

## What was verified working

- All 7 fixed public routes and `/{slug}` CMS pages render 200 in both languages, one `h1` each, no sideways scroll at 390 px, hreflang and canonical present, `noindex` on every page.
- Gate 0 schedule matches the brief exactly: Main Worship Fri 7:30–9:30 AM NECK · Sunday School **Fri** 9:30–10:30 AM NECK · Fasting Prayer Sat 7:30–8:30 PM NECK · Cottage Meeting Tue 7:30–8:30 PM members' homes (no address) · Ladies Meeting last Thu 7–9 PM NECK · Asia/Kuwait. Source: `src/content/schedule.ts`.
- Published-only reads: drafts, in-review, archived, deleted, future and expired fixtures are absent; testimonies need Granted permission; ministry contacts need approval; verse text needs Verified permission (placeholder shown otherwise).
- Special meetings: NECK / members' homes never carry an address; they leave the site at their end time.
- CMS: seven modules with one shared workflow (Draft → In review → Published/Scheduled → Archived, soft delete/restore), role checks in `rules.ts` + `service.ts`, preview, title search and status filter, media upload with byte sniffing, staff and audit pages. Covered by the existing unit, MariaDB and browser suites.

## Feature-completeness matrix

Status: ✅ complete · 🟡 partial · ❌ missing · ⛔ blocked on an owner decision, church content or a forbidden change (migration). Effort: S < ½ day, M ½–2 days, L > 2 days.

### Public website

| Feature | Status | What's missing | Required change | Priority | Dependencies | Effort |
|---|---|---|---|---|---|---|
| Hero + welcome | 🟡 | Welcome text is CONTENT REQUIRED (shows the approved "being prepared" notice) | None in code: publish the `welcome` page | P1 | Church content | — |
| About / vision / mission / history / leadership | 🟡 | No text; extra CMS pages (e.g. `history`, `leadership`) are **unreachable — no menu links to them** | List published public CMS pages in the footer menu (**A1**); content from the church | P1 | Church content (names only if approved) | S |
| Worship schedule | ✅ | — | — | — | — | — |
| Special meetings (upcoming) | ✅ | — | — | — | — | — |
| Special meetings (past), event detail pages | ❌ | Past list and per-meeting page | Past list + detail route (**B1**) | P2 | 2–3 new Tamil strings | M |
| Event images | ⛔ | Media is staff-only by design (Phase 5 decision) | Public image route with resizing | P3 | Owner security decision; image dependency (`sharp`) needs approval | M |
| Announcements | ✅ list · ❌ detail | Long announcements show in full on Worship times only | Detail route (**B1**) | P3 | — | S |
| Sermon list | ✅ | — | — | — | — | — |
| Sermon detail | ❌ | No per-sermon page or link | `/sermons/{slug-or-id}` (**A2**) | P1 | — | S |
| Sermon search / filter / pagination | ❌ | None | Text search, speaker filter, paging (**A3**) | P1 | ~10 new Tamil strings (draft-review) | M |
| Sermon share | ❌ | — | Share button (**A2**), reuses approved "Share" | P1 | 1 new Tamil string | S |
| Sermon category, audio | ⛔ | No columns | Needs migration 0004+ | P3 | **Migration approval** | M |
| Sermon video playback | 🟡 | Link-out only ("Watch the sermon") | Embedded player (youtube-nocookie) | P3 | Owner privacy decision (third-party embed, cookies) | S |
| Ministries | ✅ (list) | Images not public (see Event images) | — | P3 | as above | — |
| Testimony list | ✅ | — | — | — | — | — |
| Testimony detail | ❌ | — | `/testimonies/{id}` (**A2**) | P2 | — | S |
| Testimony public submission | ⛔ | No form | Form + storage + consent wording | P2 | **Privacy decision, consent wording, migration or email recipient** | L |
| Prayer request form | ⛔ | Nothing exists; admin guide says prayer requests are never in the CMS | Form, validation, spam protection, review | P1 | **Owner privacy decision**: store (needs migration) or email-only (needs a church recipient address and SMTP in production), who reads, retention | L |
| Contact form | ⛔ | None | Form → email | P2 | Recipient address, SMTP live, privacy wording | M |
| Contact details | 🟡 | Text is CONTENT REQUIRED (CMS `contact` page) | None in code | P1 | Church content | — |
| Map | ⛔ | No approved address or coordinates (Gate 0: no address) | — | P3 | Owner decision | S |
| Membership invitation | ⛔ | Membership not authorised (4d) | — | — | Separate milestone | — |
| Bible verse showcase | ✅ (placeholder) | Real text needs documented permission | None in code | P2 | Permission records | — |
| Footer | 🟡 | Fixed links only | CMS pages (**A1**) | P1 | — | S |
| 404 page | ❌ | Unbranded Next.js default, English only, no navigation, wrong language for `/ta` | Branded bilingual not-found in the public shell (**A1**) | P1 | 2 new Tamil strings | S |
| Error page | ❌ | Unbranded default on a server error | Bilingual `error.tsx` (**B2**) | P2 | 2–3 new Tamil strings | S |
| Social sharing previews | ❌ | No Open Graph / Twitter tags | `openGraph` in `pageMetadata` (**A4**) | P1 | — | S |
| Social image, favicon, logo | ⛔ | No church logo asset in the repository | Icon + OG image | P2 | **Church asset** | S |
| robots.txt / sitemap | ❌ (by design) | Indexing off until launch gate | Add at launch | P3 | Owner launch approval | S |

### CMS

| Feature | Status | What's missing | Required change | Priority | Dependencies | Effort |
|---|---|---|---|---|---|---|
| Dashboard | ✅ | — | — | — | — | — |
| Pages, announcements, special meetings, sermons, ministries, testimonies, verses | ✅ | — | — | — | — | — |
| Draft / review / publish / schedule / archive / delete-restore | ✅ | — | — | — | — | — |
| Preview | ✅ | — | — | — | — | — |
| Search and filter | ✅ | Title and slug search, status filter | — | — | — | — |
| Pagination | 🟡 | Lists stop at 200 items with no notice | Page links (**B3**) | P2 | — | S |
| Navigation / menu | 🟡 | No menu editor | Page visibility (Public = in footer) drives the menu after **A1**; a full menu editor would need a migration | P1 / P3 | — / migration | S / M |
| Media library | 🟡 | Upload, list, delete; no resizing or public delivery | Public image route + resizing | P3 | Owner security decision, dependency approval | M |
| Prayer request management | ⛔ | — | Depends on the prayer decision | P1 | Owner privacy decision | L |
| Testimony consent | ✅ | Admin records permission; withdrawal unpublishes | — | — | — | — |
| Tamil and English editing | ✅ | — | — | — | — | — |
| Validation and errors | ✅ | — | — | — | — | — |
| Role boundaries | ✅ | Tested in `authorization.test.ts`, `cms.test.ts`, `admin.spec.ts` | — | — | — | — |

## Implementation phases

| Phase | Contents | Needs approval before merge |
|---|---|---|
| **A (this PR)** | A1 CMS pages in the footer menu + branded bilingual 404 · A2 sermon and testimony detail pages with share · A3 sermon search, speaker filter, pagination · A4 Open Graph metadata | New Tamil strings (`draft-review`, listed in the PR) |
| B | B1 past special meetings and meeting/announcement detail pages · B2 bilingual error page · B3 admin list pagination | New Tamil strings |
| C — decisions first | Prayer requests, contact form, testimony submission, embedded video, public images, map, logo/favicon/OG image | Owner privacy / security / content decisions; some need a migration |
| D — content | Welcome, about, history, vision and mission, leadership, contact text, sermons, ministries, testimonies | Church-supplied content entered in the CMS |

## Decisions and content needed from the owner

1. **Prayer requests**: email-only (no storage; needs a church recipient mailbox and production SMTP) or stored for staff review (needs a new table, i.e. a migration), who may read them, and how long they are kept.
2. **Contact form**: same choice and recipient.
3. **Testimony submissions from the public**: consent wording and where submissions go.
4. **Embedded video**: allow a privacy-enhanced YouTube embed, or keep link-out.
5. **Public images** for ministries, sermons and meetings: approve a public image route (and, if wanted, an image-resizing dependency).
6. **Sermon category and audio**: needs migration 0004+.
7. **Church logo / favicon / social image** asset.
8. **Tamil wording** for the strings added in each phase.
9. **Church content** listed in phase D.

## npm audit: the 12 moderate findings (report only; nothing updated)

`npm audit` on `main` (9 Nov 2026): 12 moderate, 0 high, 0 critical. Two chains, both tooling, none in code the running site executes:

| Chain | Advisory | Packages counted | Runtime exposure |
|---|---|---|---|
| `drizzle-kit@0.31.11` → `@esbuild-kit/esm-loader@2.6.5` → `@esbuild-kit/core-utils@3.3.2` → `esbuild@0.18.20` | GHSA-67mh-4wv8-2f99: esbuild's **development server** lets any website send requests to it and read the response | 4 (esbuild, both @esbuild-kit packages, drizzle-kit) | None. The site never runs esbuild's dev server; drizzle-kit is a migration-generation CLI. These 4 also appear in `npm audit --omit=dev` because `better-auth@1.7.15` lists `drizzle-kit` in its dependency tree, which is why Hostinger's scan (production install) reports them. |
| `eslint-config-next@16.4.3` → `typescript-eslint` → `@typescript-eslint/*` → `minimatch` (7.x–11.0.0) | GHSA-g3hv-75wg-m249: `minimatch` denial of service via glob-pattern amplification | 8 | None. Lint only, dev dependency, patterns are our own config. |

`npm audit fix --force` would **downgrade** `drizzle-kit` to 0.18.1 and `eslint-config-next` to 15.5.29 — both wrong and breaking; do not run it. Proper fixes when dependency changes are approved: a `drizzle-kit` release that drops `@esbuild-kit` (or an `overrides` entry pinning `esbuild` ≥ 0.25 for that path, tested with `db:generate`), and an `eslint-config-next` / `typescript-eslint` release on `minimatch` ≥ 11.0.1 (or an override). CI's `npm audit --omit=dev --audit-level=high` gate is unaffected (moderate only).
