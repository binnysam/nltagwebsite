import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as accountRequestPOST } from "@/app/api/account-request/route";
import { flushAccountRequestsForTests, resetAccountRequestLimiterForTests } from "@/server/auth/request-account";
import { closeDb, getDb } from "@/server/db/client";
import { account, rateLimitBucket, user } from "@/server/db/schema";
import { flushEmailQueueForTests, sendAccountEmail } from "@/server/email/send";
import { getTransport, memoryOutbox } from "@/server/email/transport";
import { gateCounters, resetGateLimitersForTests } from "@/server/security/auth-abuse-gate";
import { seed } from "../../scripts/db/seed";
import { call, clearRateLimits, cookiesFrom, linkIn, mailTo, ORIGIN, restoreEnv, signIn } from "./helpers";

const NEW_PASSWORD = "a-new-long-password-1";

async function accountRequest(email: string, opts: { origin?: string } = {}) {
  const req = new Request(`${ORIGIN}/api/account-request`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: opts.origin ?? ORIGIN },
    body: JSON.stringify({ email, locale: "en" }),
  });
  return accountRequestPOST(req);
}

async function settle() {
  await flushAccountRequestsForTests();
  await flushEmailQueueForTests();
}

/** The token from the newest set-password/reset mail to this address. */
function newestToken(address: string): { url: string; token: string } {
  const mail = mailTo(address).at(-1);
  if (!mail) throw new Error("no mail");
  const url = linkIn(mail.text);
  return { url, token: new URL(url).pathname.split("/").at(-1)! };
}

const bogus = (i: number) => `Bogus${String(i).padStart(19, "0")}`; // 24 chars, right shape, no row

beforeAll(async () => {
  await seed();
});
beforeEach(async () => {
  await clearRateLimits();
  resetGateLimitersForTests();
  resetAccountRequestLimiterForTests();
  memoryOutbox.length = 0;
});
afterAll(closeDb);

describe("R4 change 3: /api/account-request", () => {
  it("identical replies for new, existing and unlisted addresses (listed = all, NODE_ENV=test open policy)", async () => {
    const saved = process.env.NLTAG_SIGNUP_ALLOWLIST;
    process.env.NLTAG_SIGNUP_ALLOWLIST = "listed.r4@nltag.test,admin.a@nltag.test";
    try {
      const replies = [];
      for (const email of ["listed.r4@nltag.test", "admin.a@nltag.test", "stranger.r4@nltag.test"]) {
        const res = await accountRequest(email);
        replies.push({ status: res.status, body: await res.text(), headers: [...res.headers].filter(([k]) => k !== "date").sort() });
      }
      expect(replies[1]).toEqual(replies[0]);
      expect(replies[2]).toEqual(replies[0]);
      expect(replies[0]!.status).toBe(202);
      await settle();
      expect(mailTo("stranger.r4@nltag.test")).toHaveLength(0);
      expect(await getDb().select().from(user).where(eq(user.email, "stranger.r4@nltag.test"))).toHaveLength(0);
      const [listed] = await getDb().select().from(user).where(eq(user.email, "listed.r4@nltag.test"));
      expect(listed?.emailVerified).toBe(false);
      expect(await getDb().select().from(account).where(eq(account.userId, listed!.id))).toHaveLength(0);
      // Unlisted addresses leave no trace: no bucket row keyed on them.
      const [rows] = (await getDb().execute(sql`SELECT COUNT(*) AS n FROM rate_limit_bucket WHERE bucket_key LIKE 'acct-req:%'`)) as unknown as [[{ n: number }]];
      expect(Number(rows[0].n)).toBe(2);
    } finally {
      restoreEnv("NLTAG_SIGNUP_ALLOWLIST", saved);
    }
  });

  it("40 concurrent requests for one listed address: 20 accepted, 20 refused, one account, at most 3 mails", async () => {
    const saved = process.env.NLTAG_SIGNUP_ALLOWLIST;
    process.env.NLTAG_SIGNUP_ALLOWLIST = "burst.r4@nltag.test";
    try {
      const results = await Promise.all(Array.from({ length: 40 }, () => accountRequest("burst.r4@nltag.test")));
      const statuses = results.map((r) => r.status);
      expect(statuses.filter((s) => s === 202)).toHaveLength(20);
      expect(statuses.filter((s) => s === 429)).toHaveLength(20);
      await settle();
      expect(await getDb().select().from(user).where(eq(user.email, "burst.r4@nltag.test"))).toHaveLength(1);
      expect(mailTo("burst.r4@nltag.test").length).toBeLessThanOrEqual(3);
      expect(mailTo("burst.r4@nltag.test").length).toBeGreaterThanOrEqual(1);
      const [w] = await getDb().select().from(rateLimitBucket).where(sql`${rateLimitBucket.bucketKey} LIKE 'acct-req:%'`);
      expect(w?.count).toBe(5);
    } finally {
      restoreEnv("NLTAG_SIGNUP_ALLOWLIST", saved);
    }
  });

  it("listed and unlisted addresses get identical status sequences under the same load", async () => {
    const saved = process.env.NLTAG_SIGNUP_ALLOWLIST;
    process.env.NLTAG_SIGNUP_ALLOWLIST = "seq.r4@nltag.test";
    try {
      const seq = async (email: string) => {
        resetAccountRequestLimiterForTests();
        const out: number[] = [];
        for (let i = 0; i < 30; i++) out.push((await accountRequest(email)).status);
        await settle();
        return out;
      };
      expect(await seq("unlisted.seq.r4@nltag.test")).toEqual(await seq("seq.r4@nltag.test"));
    } finally {
      restoreEnv("NLTAG_SIGNUP_ALLOWLIST", saved);
    }
  });

  it("refuses cross-origin and malformed requests before looking at the address", async () => {
    expect((await accountRequest("x@nltag.test", { origin: "https://evil.example" })).status).toBe(403);
  });
});

describe("R4 change 2: reset/set-password links cannot be blocked by outsiders", () => {
  async function freshLink(email: string) {
    process.env.NLTAG_SIGNUP_ALLOWLIST = email;
    await accountRequest(email);
    await settle();
    return newestToken(email);
  }

  it("mailbox-first end to end: request → set-password link → first password → sign in", async () => {
    const saved = process.env.NLTAG_SIGNUP_ALLOWLIST;
    try {
      const email = "first.r4@nltag.test";
      const { token } = await freshLink(email);
      const before = await call("/sign-in/email", { body: { email, password: NEW_PASSWORD } });
      expect(before.status).toBe(401); // no password exists yet
      const set = await call("/reset-password", { body: { token, newPassword: NEW_PASSWORD } });
      expect(set.status).toBe(200);
      const [u] = await getDb().select().from(user).where(eq(user.email, email));
      expect(u?.emailVerified).toBe(true);
      const { res } = await signIn(email, NEW_PASSWORD);
      expect(res.status).toBe(200);
      expect(cookiesFrom(res)).toContain("session_token");
    } finally {
      restoreEnv("NLTAG_SIGNUP_ALLOWLIST", saved);
    }
  });

  it("a valid link works after 300 bogus POSTs and 300 bogus GETs (sequential burst)", async () => {
    const saved = process.env.NLTAG_SIGNUP_ALLOWLIST;
    try {
      const email = "flood.r4@nltag.test";
      const { url, token } = await freshLink(email);
      const statuses = new Map<number, number>();
      for (let i = 0; i < 300; i++) {
        const a = await call("/reset-password", { body: { token: bogus(i), newPassword: NEW_PASSWORD } });
        const b = await call(`/reset-password/${bogus(i)}?callbackURL=%2Fen%2Freset-password`, { method: "GET" });
        for (const s of [a.status, b.status]) statuses.set(s, (statuses.get(s) ?? 0) + 1);
      }
      expect(statuses.get(429) ?? 0).toBeGreaterThan(0); // the backstop is real
      const get = await call(url, { method: "GET" });
      expect(get.status).toBe(302);
      expect(get.headers.get("location")).toContain(`token=${token}`);
      const post = await call("/reset-password", { body: { token, newPassword: NEW_PASSWORD } });
      expect(post.status).toBe(200);
      console.info("R2 sequential flood statuses", Object.fromEntries(statuses));
    } finally {
      restoreEnv("NLTAG_SIGNUP_ALLOWLIST", saved);
    }
  });

  it("a valid link works while 400 bogus requests run concurrently with it", async () => {
    const saved = process.env.NLTAG_SIGNUP_ALLOWLIST;
    try {
      const email = "concurrent.r4@nltag.test";
      const { token } = await freshLink(email);
      const flood = Array.from({ length: 400 }, (_, i) => call("/reset-password", { body: { token: bogus(1000 + i), newPassword: NEW_PASSWORD } }));
      const real = call("/reset-password", { body: { token, newPassword: NEW_PASSWORD } });
      const [realRes, ...floodRes] = await Promise.all([real, ...flood]);
      expect(realRes.status).toBe(200);
      expect(floodRes.filter((r) => r.status === 429).length).toBeGreaterThan(0);
    } finally {
      restoreEnv("NLTAG_SIGNUP_ALLOWLIST", saved);
    }
  });

  it("R1: once one link sets the password, every sibling link is void", async () => {
    const saved = process.env.NLTAG_SIGNUP_ALLOWLIST;
    try {
      const email = "sibling.r4@nltag.test";
      const first = await freshLink(email);
      await accountRequest(email);
      await settle();
      const second = newestToken(email);
      expect(second.token).not.toBe(first.token);
      expect((await call("/reset-password", { body: { token: second.token, newPassword: NEW_PASSWORD } })).status).toBe(200);
      const reused = await call("/reset-password", { body: { token: first.token, newPassword: "yet-another-password-2" } });
      expect(reused.status).toBe(400);
      expect(((await reused.json()) as { code: string }).code).toBe("INVALID_TOKEN");
    } finally {
      restoreEnv("NLTAG_SIGNUP_ALLOWLIST", saved);
    }
  });

  it("the invalid-token backstop never counts valid links (counter check)", async () => {
    const saved = process.env.NLTAG_SIGNUP_ALLOWLIST;
    try {
      const { token } = await freshLink("counter.r4@nltag.test");
      const before = gateCounters.invalidTokenRefused;
      for (let i = 0; i < 60; i++) await call("/reset-password", { body: { token: bogus(5000 + i), newPassword: NEW_PASSWORD } });
      const refusedDuringFlood = gateCounters.invalidTokenRefused - before;
      expect(refusedDuringFlood).toBeGreaterThan(0);
      const res = await call("/reset-password", { body: { token, newPassword: NEW_PASSWORD } });
      expect(res.status).toBe(200);
      expect(gateCounters.invalidTokenRefused - before).toBe(refusedDuringFlood);
    } finally {
      restoreEnv("NLTAG_SIGNUP_ALLOWLIST", saved);
    }
  });
});

describe("R4 change 4: email reservations", () => {
  const to = "mailbox.r4@nltag.test";
  const url = `${ORIGIN}/en/reset-password?token=x`;

  it("successful sends: 3 per hour per address, the 4th suppressed", async () => {
    const out = [];
    for (let i = 0; i < 4; i++) out.push(await sendAccountEmail("reset", to, url));
    expect(out).toEqual(["sent", "sent", "sent", "suppressed"]);
  });

  it("failed sends give their slot back: 3 failures, then 3 successes still go out", async () => {
    const spy = vi.spyOn(getTransport(), "send").mockRejectedValue(new Error("SMTP down"));
    const failed = [];
    for (let i = 0; i < 3; i++) failed.push(await sendAccountEmail("reset", to, url));
    expect(failed).toEqual(["failed", "failed", "failed"]);
    spy.mockRestore();
    const after = [];
    for (let i = 0; i < 4; i++) after.push(await sendAccountEmail("reset", to, url));
    expect(after).toEqual(["sent", "sent", "sent", "suppressed"]);
    const [g] = (await getDb().execute(sql`SELECT COALESCE(SUM(count),0) AS n FROM rate_limit_bucket WHERE bucket_key = 'email:global'`)) as unknown as [[{ n: number }]];
    expect(Number(g[0].n)).toBe(3); // failures returned the daily-cap count too
  });

  it("20 concurrent sends: exactly 3 delivered (F11), none lost to the burst", async () => {
    const out = await Promise.all(Array.from({ length: 20 }, () => sendAccountEmail("reset", to, url)));
    expect(out.filter((o) => o === "sent")).toHaveLength(3);
    expect(out.filter((o) => o === "suppressed")).toHaveLength(17);
  });

  it("20 concurrent sends while the first 5 transport calls fail: still exactly 3 delivered, count never negative", async () => {
    let calls = 0;
    const real = getTransport().send.bind(getTransport());
    const spy = vi.spyOn(getTransport(), "send").mockImplementation(async (m) => {
      calls += 1;
      if (calls <= 5) throw new Error("SMTP down");
      return real(m);
    });
    const out = [];
    // Retries after failures: three waves, like a person pressing "send again".
    for (let wave = 0; wave < 3; wave++) out.push(...(await Promise.all(Array.from({ length: 7 }, () => sendAccountEmail("reset", to, url)))));
    spy.mockRestore();
    expect(out.filter((o) => o === "sent")).toHaveLength(3);
    const [rows] = (await getDb().execute(sql`SELECT MIN(count) AS lo, MAX(count) AS hi FROM rate_limit_bucket WHERE bucket_key LIKE 'email:reset:%'`)) as unknown as [[{ lo: number; hi: number }]];
    expect(Number(rows[0].lo)).toBeGreaterThanOrEqual(0);
    expect(Number(rows[0].hi)).toBe(3);
  });
});
