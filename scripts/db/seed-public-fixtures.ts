// Fictional fixtures for the public-site browser tests (Phase 5). Never church content.
//   npm run db:seed && npm run db:seed:public
// Every visible record is marked "[E2E …]"; every record that must NOT reach the public site is
// marked "[E2E hidden …]" so the browser suite can assert both. Nothing here is Scripture.
// Refuses to run in production or against a non-local database (same rule as seed.ts).
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "../../src/server/db/client";
import { contentItem, contentTranslation, user } from "../../src/server/db/schema";
import { parseContentForm } from "../../src/server/cms/schemas";
import { createItem, recordTestimonyPermission, scheduleVerse, transition, type Ctx } from "../../src/server/cms/service";
import type { ContentType } from "../../src/server/db/schema";
import { kuwaitDateKey, utcToKuwaitLocal } from "../../src/lib/date";
import { assertSeedAllowed, SEED_USERS } from "./seed";

async function ctxFor(email: string, roles: ("CHURCH_ADMIN" | "CONTENT_EDITOR")[]): Promise<Ctx> {
  const [u] = await getDb().select().from(user).where(eq(user.email, email));
  if (!u) throw new Error(`Run npm run db:seed first (${email} missing)`);
  return { actor: { principal: { kind: "user", userId: u.id, emailVerified: true, roles }, userId: u.id, sessionId: "seed", email: u.email, name: u.name } };
}

function data(type: ContentType, fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  const r = parseContentForm(type, f);
  if (!r.ok) throw new Error(`${type}: ${JSON.stringify(r.errors)}`);
  return r.data;
}

/** Kuwait wall-clock "YYYY-MM-DDTHH:mm", `days` from now (fractions allowed). */
const at = (days: number) => utcToKuwaitLocal(new Date(Date.now() + days * 86_400_000));

const both = (en: string, ta: string, extra: Record<string, string> = {}) => ({ "en.title": en, "ta.title": ta, ...extra });

export async function seedPublicFixtures() {
  assertSeedAllowed();
  const [exists] = await getDb().select({ id: contentTranslation.itemId }).from(contentTranslation).where(eq(contentTranslation.title, "[E2E visible announcement]")).limit(1);
  if (exists) return false;
  const admin = await ctxFor(SEED_USERS[0]!.email, ["CHURCH_ADMIN"]);
  const editor = await ctxFor(SEED_USERS[1]!.email, ["CONTENT_EDITOR"]);
  const publish = async (type: ContentType, fields: Record<string, string>) => {
    const { id } = await createItem(admin, type, data(type, fields));
    await transition(admin, id, "publish");
    return id;
  };

  // Pages (reserved slugs)
  await publish("PAGE", { slug: "welcome", visibility: "UNLISTED", ...both("[E2E welcome]", "[E2E வரவேற்பு]"), "en.summary": "[E2E welcome lead]", "ta.summary": "[E2E வரவேற்பு முன்னுரை]" });
  await publish("PAGE", { slug: "about", ...both("[E2E about]", "[E2E சபை]"), "en.summary": "[E2E about summary]", "ta.summary": "[E2E சுருக்கம்]", "en.bodyMd": "## [E2E about heading]\n\n[E2E about body]", "ta.bodyMd": "[E2E உள்ளடக்கம்]" });
  await publish("PAGE", { slug: "contact", ...both("[E2E contact]", "[E2E தொடர்பு]"), "en.bodyMd": "[E2E contact body]", "ta.bodyMd": "[E2E தொடர்பு உள்ளடக்கம்]" });

  await publish("PAGE", { slug: "e2e-extra-page", ...both("[E2E extra page]", "[E2E கூடுதல் பக்கம்]"), "en.bodyMd": "[E2E extra body]", "ta.bodyMd": "[E2E கூடுதல் உள்ளடக்கம்]" });
  await createItem(admin, "PAGE", data("PAGE", { slug: "e2e-hidden-page", ...both("[E2E hidden page]", "[E2E hidden page ta]") }));

  // Announcements: one visible, the rest must never appear
  await publish("ANNOUNCEMENT", { ...both("[E2E visible announcement]", "[E2E அறிவிப்பு]"), "en.summary": "[E2E announcement summary]", "ta.summary": "[E2E அறிவிப்பு சுருக்கம்]" });
  await createItem(admin, "ANNOUNCEMENT", data("ANNOUNCEMENT", both("[E2E hidden draft]", "[E2E hidden draft ta]")));
  const review = await createItem(editor, "ANNOUNCEMENT", data("ANNOUNCEMENT", both("[E2E hidden review]", "[E2E hidden review ta]")));
  await transition(editor, review.id, "submit");
  const archived = await publish("ANNOUNCEMENT", both("[E2E hidden archived]", "[E2E hidden archived ta]"));
  await transition(admin, archived, "archive");
  const deleted = await publish("ANNOUNCEMENT", both("[E2E hidden deleted]", "[E2E hidden deleted ta]"));
  await transition(admin, deleted, "delete");
  await publish("ANNOUNCEMENT", { ...both("[E2E hidden future]", "[E2E hidden future ta]"), publishAt: at(30) });
  await publish("ANNOUNCEMENT", { ...both("[E2E hidden expired]", "[E2E hidden expired ta]"), publishAt: at(-10), expiresAt: at(-1) });

  // Special meetings
  await publish("EVENT", { ...both("[E2E meeting NECK]", "[E2E கூட்டம் NECK]"), "en.summary": "[E2E meeting summary]", "detail.startsAt": at(5), "detail.endsAt": at(5.08), "detail.locationKind": "NECK" });
  await publish("EVENT", { ...both("[E2E meeting homes]", "[E2E கூட்டம் வீடுகள்]"), "detail.startsAt": at(9), "detail.locationKind": "MEMBERS_HOMES" });
  await publish("EVENT", { ...both("[E2E meeting other]", "[E2E கூட்டம் இடம்]"), "detail.startsAt": at(14), "detail.locationKind": "OTHER", "detail.locationText": "[E2E hall]" });
  await publish("EVENT", { ...both("[E2E hidden past meeting]", "[E2E hidden past meeting ta]"), "detail.startsAt": at(-3), "detail.endsAt": at(-2.9), "detail.locationKind": "NECK" });
  await createItem(admin, "EVENT", data("EVENT", { ...both("[E2E hidden draft meeting]", "[E2E hidden draft meeting ta]"), "detail.startsAt": at(6), "detail.locationKind": "NECK" }));

  // Sermons
  await publish("SERMON", { ...both("[E2E sermon]", "[E2E செய்தி]"), "en.summary": "[E2E sermon summary]", "detail.speaker": "[E2E Speaker]", "detail.bibleReference": "[Book 1:1]", "detail.sermonDate": at(-2).slice(0, 10), "detail.videoUrl": "https://video.example.test/e2e" });
  await createItem(admin, "SERMON", data("SERMON", both("[E2E hidden draft sermon]", "[E2E hidden draft sermon ta]")));

  // Ministries: approved contact visible; an editor-entered contact stays hidden
  await publish("MINISTRY", { ...both("[E2E ministry]", "[E2E ஊழியம்]"), "en.summary": "[E2E ministry summary]", "detail.contactText": "[E2E approved contact]", "detail.contactApproved": "on" });
  const m2 = await createItem(editor, "MINISTRY", data("MINISTRY", { ...both("[E2E second ministry]", "[E2E இரண்டாம் ஊழியம்]"), "detail.contactText": "[E2E hidden contact]", "detail.contactApproved": "on" }));
  await transition(editor, m2.id, "submit");
  await transition(admin, m2.id, "publish");

  // Testimonies: granted (named) visible; not recorded hidden
  const t1 = await createItem(editor, "TESTIMONY", data("TESTIMONY", { ...both("[E2E testimony]", "[E2E சாட்சி]"), "en.bodyMd": "[E2E fictional testimony]", "ta.bodyMd": "[E2E சாட்சி உரை]", "detail.authorDisplayName": "[E2E Name]" }));
  await recordTestimonyPermission(admin, t1.id, "GRANTED");
  await transition(admin, t1.id, "publish");
  const t2 = await createItem(editor, "TESTIMONY", data("TESTIMONY", { ...both("[E2E hidden testimony]", "[E2E hidden testimony ta]"), "en.bodyMd": "[x]", "detail.anonymous": "on" }));
  await transition(editor, t2.id, "submit");

  // Verse for today: published with text, but permission is NOT verified → text must not appear
  const v = await publish("VERSE", { "en.title": "[E2E verse card]", "detail.referenceEn": "[E2E Book 1:1]", "detail.referenceTa": "[E2E புத்தகம் 1:1]", "detail.textEn": "[E2E hidden verse text]", "detail.textTa": "[E2E hidden verse text ta]" });
  await scheduleVerse(admin, kuwaitDateKey(new Date()), v);

  const [count] = await getDb().select({ id: contentItem.id }).from(contentItem).limit(1);
  return Boolean(count);
}

if (process.argv[1]?.endsWith("seed-public-fixtures.ts")) {
  try {
    console.info((await seedPublicFixtures()) ? "Seeded public-site fixtures." : "Fixtures already exist; nothing seeded.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Seed failed");
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
