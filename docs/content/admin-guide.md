# NLTAG admin — user guide

For Church Admins and Content Editors. The admin is at **nltagkuwait.com/admin** (available once accounts are switched on). Sign in with your church website account; if you have a staff role, your account page shows **Open the admin**.

## Roles
- **Content Editor** writes and edits drafts, uploads images and submits work for review. Editors cannot publish, change published items, delete, or see staff and the audit log.
- **Church Admin** does everything an editor can, and publishes, unpublishes, archives, deletes and restores content, records permissions, manages staff roles and reads the audit log.

## Writing in two languages
Every form has a **Tamil** and an **English** column (stacked on phones). Fill one or both. A language appears on the website only if it has a title. Use *This language is* to mark a language "Ready for review" for whoever publishes.

Text uses simple Markdown:
```
## Heading         ### Smaller heading
**bold**           *italic*
- list item        1. numbered item
> quotation        [link text](https://example.org)
```
HTML is not accepted. If something is wrong, the form lists each problem with a link to the field; nothing you typed is lost.

## Publishing workflow
1. **Save draft** — nothing is public.
2. **Submit for review** (editors) — the item appears under *Dashboard → Review submitted content*.
3. **Publish** (Church Admin) — live straight away, or at *Publish from* if set (shown as *Scheduled*). Announcements stop showing at *Expires*.
4. **Unpublish** returns it to draft; **Archive** keeps it off the site for the record; **Delete** hides it everywhere (admins can restore it from the *Deleted* filter). Each of these asks for confirmation.

Use **Preview** to see both languages as they will read. Previews are visible only to signed-in staff.

If someone else saved the same item while you were editing, your save is refused: reload, then make your change again.

## Modules
- **Pages** — each has an address (slug), e.g. `about-us` → `/ta/about-us` and `/en/about-us`; SEO title and description; Published pages that are *Public* appear in the website's footer menu (in each language that has a title); *Unlisted* pages are left out of menus but can still be opened by their address. Use this for pages such as history, vision and mission or leadership once the church has written them. Three addresses are special on the website: **`welcome`** (its summary is the line under the church name at the top of the homepage — make it *Unlisted*), **`about`** (the homepage introduction and the About page) and **`contact`** (shown under "Visit us" on the homepage and on the Contact page: phone, email or directions exactly as the church wants them public — never a member's address).
- **Announcements** — can be featured, scheduled and set to expire.
- **Special meetings** — date and time in **Kuwait time**; place: NECK, church members' homes (no address is ever shown), another named place, or to be announced. The regular weekly schedule is fixed (Gate 0) and shown for reference only; changes need the website owner.
- **Sermons** — speaker, Bible reference (no verse text), date, a https link to the church's own video (never downloaded or re-hosted), optional thumbnail. Each published sermon has its own page (at its address, or its id if it has none); visitors can search sermons and filter by speaker, so spell each speaker's name the same way every time.
- **Ministries** — text, image and a public contact line that appears only after a Church Admin ticks *approved*.
- **Testimonies** — anonymous by default. A Church Admin records the author's permission before publishing; recording *withdrawn* takes it off the site immediately. Do not include private details.
- **Bible verses** — reference and text for BSI Tamil and NKJV. Text is stored but **never shown** until a Church Admin records the publisher's permission (credit line + where it is documented) under *Translations*. Verse-card downloads stay off unless also allowed. *Daily verse schedule* pins a verse to a Kuwait date; other days use the automatic daily choice.
- **Media** — JPEG, PNG or WebP up to 2 MB, with a description for screen-reader users. Only upload images the church may use.

## Staff and audit (Church Admin)
- **Staff and roles**: grant *Content Editor*, *Prayer Team* (when the inboxes are enabled) or *Church Admin* to a verified account by email; remove roles. You cannot change your own roles, and the last Church Admin cannot be removed.
- **Audit log**: who did what and when (ids and actions only, no content or personal details).

## Inboxes and gallery (Nov 2026; on once migration 0004 is applied and `NLTAG_PUBLIC_FORMS=1`)
- **Prayer requests** (Church Admin and Prayer Team only; Content Editors never see them): the list shows date, language and status, never names or text. Opening one is recorded in the audit log. Mark it *Read*, *Prayed for* or *Archived*. Only a Church Admin deletes, and deletion is permanent (requests are otherwise kept until deleted). Stored encrypted; the notification email says only that a request arrived.
- **Contact messages** (Church Admin): the visitor's name, email, optional phone, subject and message. Reply from the church mailbox; mark *Replied* or *Archived*; delete when no longer needed.
- **Testimony submissions** (Church Admin; Content Editors without the submitter's contact details): *Accept as draft* creates an unpublished testimony with the submitter's chosen name; then edit, submit and publish as usual. A Church Admin's acceptance records the submitter's consent as the permission. *Do not accept* and *Archive* keep it off the site.
- **Gallery**: add library images with Tamil and English captions (the caption is also the image description). A Church Admin records where the photo permission is documented, then publishes. The site shows resized copies with camera and location data removed; never the original. Withdrawing permission or unpublishing removes the photo at once.

## Never in the CMS
Membership records, home addresses, invented church facts. Missing information stays a draft marked `CONTENT REQUIRED`. Prayer requests live only in their own restricted inbox (above), never in pages or content.
