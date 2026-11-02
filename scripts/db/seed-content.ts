// Fictional sample content for local review of the CMS admin (Phase 4c). Never church content.
//   npm run db:seed && npm run db:seed:content
// Every title is bracketed so it can never be mistaken for real church information, and nothing
// is Scripture. Refuses to run in production or against a non-local database (same rule as seed.ts).
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "../../src/server/db/client";
import { contentItem, user } from "../../src/server/db/schema";
import { parseContentForm } from "../../src/server/cms/schemas";
import { createItem, recordTestimonyPermission, transition, type Ctx } from "../../src/server/cms/service";
import type { ContentType } from "../../src/server/db/schema";
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

const day = (offset: number, hhmm: string) => {
  const d = new Date(Date.now() + 3 * 3600_000 + offset * 86_400_000);
  return `${d.toISOString().slice(0, 10)}T${hhmm}`;
};

export async function seedContent() {
  assertSeedAllowed();
  const [any] = await getDb().select({ id: contentItem.id }).from(contentItem).limit(1);
  if (any) return false;
  const admin = await ctxFor(SEED_USERS[0]!.email, ["CHURCH_ADMIN"]);
  const editor = await ctxFor(SEED_USERS[1]!.email, ["CONTENT_EDITOR"]);
  const body = "## [Sample heading]\n\n[Sample paragraph. Replace with approved church content.]\n\n- [Sample point one]\n- [Sample point two]";
  const bodyTa = "## [மாதிரி தலைப்பு]\n\n[மாதிரி உள்ளடக்கம்]";

  const page = await createItem(admin, "PAGE", data("PAGE", { slug: "sample-page", "en.title": "[Sample page]", "ta.title": "[மாதிரி பக்கம்]", "en.bodyMd": body, "ta.bodyMd": bodyTa, "en.seoDescription": "[Sample description]" }));
  await transition(admin, page.id, "publish");
  await createItem(editor, "PAGE", data("PAGE", { slug: "sample-draft-page", "en.title": "[Sample draft page]", "en.bodyMd": body }));

  const a1 = await createItem(editor, "ANNOUNCEMENT", data("ANNOUNCEMENT", { "en.title": "[Sample announcement]", "ta.title": "[மாதிரி அறிவிப்பு]", "en.summary": "[Sample summary]", "en.bodyMd": body, "ta.bodyMd": bodyTa, featured: "on" }));
  await transition(editor, a1.id, "submit");
  const a2 = await createItem(admin, "ANNOUNCEMENT", data("ANNOUNCEMENT", { "en.title": "[Sample scheduled announcement]", publishAt: day(3, "09:00"), expiresAt: day(10, "21:00"), "en.bodyMd": body }));
  await transition(admin, a2.id, "publish");

  const e1 = await createItem(admin, "EVENT", data("EVENT", { "en.title": "[Sample special meeting]", "ta.title": "[மாதிரி விசேஷ கூட்டம்]", "detail.startsAt": day(4, "19:00"), "detail.endsAt": day(4, "21:00"), "detail.locationKind": "NECK", "en.bodyMd": body }));
  await transition(admin, e1.id, "publish");
  await createItem(editor, "EVENT", data("EVENT", { "en.title": "[Sample draft meeting]", "detail.startsAt": day(12, "19:30"), "detail.locationKind": "TO_BE_ANNOUNCED" }));

  await createItem(editor, "SERMON", data("SERMON", { "en.title": "[Sample sermon]", "detail.speaker": "[Speaker name]", "detail.bibleReference": "[Book 1:1]", "detail.sermonDate": day(-2, "00:00").slice(0, 10), "detail.videoUrl": "https://www.youtube.com/watch?v=sample" }));
  await createItem(editor, "MINISTRY", data("MINISTRY", { "en.title": "[Sample ministry]", "ta.title": "[மாதிரி ஊழியம்]", "en.bodyMd": body }));
  const t = await createItem(editor, "TESTIMONY", data("TESTIMONY", { "en.title": "[Sample testimony]", "en.bodyMd": "[Fictional testimony text for testing.]", "detail.anonymous": "on" }));
  await transition(editor, t.id, "submit");
  await recordTestimonyPermission(admin, t.id, "NOT_RECORDED");
  await createItem(editor, "VERSE", data("VERSE", { "en.title": "[Sample verse card]", "detail.referenceEn": "[Book 1:1]", "detail.referenceTa": "[புத்தகம் 1:1]" }));
  return true;
}

if (process.argv[1]?.endsWith("seed-content.ts")) {
  try {
    console.info((await seedContent()) ? "Seeded fictional sample content." : "Content already exists; nothing seeded.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Seed failed");
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
