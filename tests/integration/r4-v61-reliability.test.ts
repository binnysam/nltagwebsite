import { and, eq, like, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getAuth } from "@/server/auth/auth";
import { resetAccountRequestLimiterForTests } from "@/server/auth/request-account";
import { closeDb, getDb } from "@/server/db/client";
import { auditLog, rateLimitBucket, user } from "@/server/db/schema";
import { sendAccountEmail, setMailRetrySleepForTests } from "@/server/email/send";
import { getTransport, memoryOutbox } from "@/server/email/transport";
import { drain, resetLifecycleForTests } from "@/server/lifecycle";
import { hashEmail } from "@/server/security/hash";
import { LIMITS } from "@/server/services/rate-limit";
import { seed } from "../../scripts/db/seed";
import { clearRateLimits, mailTo, ORIGIN, requestAccount, restoreEnv } from "./helpers";

/** R4 v6.1 §1 and §2: account-request limit, release on failure, SMTP retry, audit, drain. */

const savedList = process.env.NLTAG_SIGNUP_ALLOWLIST;
beforeAll(seed);
beforeEach(async () => {
  await clearRateLimits();
  resetAccountRequestLimiterForTests();
  memoryOutbox.length = 0;
});
afterEach(() => {
  vi.restoreAllMocks();
  setMailRetrySleepForTests(null);
  restoreEnv("NLTAG_SIGNUP_ALLOWLIST", savedList);
});
afterAll(closeDb);

const windowCount = async (email: string) =>
  (await getDb().select({ c: rateLimitBucket.count }).from(rateLimitBucket).where(eq(rateLimitBucket.bucketKey, `acct-req:${hashEmail(email)}`)))[0]?.c ?? 0;
const smtpError = (props: Record<string, unknown>) => Object.assign(new Error("smtp"), props);

describe("v6.1 §1: 3 account requests per 15 minutes per listed address", () => {
  it("the limit value", () => {
    expect(LIMITS.accountRequestPerAddress).toEqual({ window: 900, max: 3 });
  });

  it("the 4th request in the window issues nothing; the first three each issue a link", async () => {
    const email = "three.r4@nltag.test";
    process.env.NLTAG_SIGNUP_ALLOWLIST = email;
    for (let i = 0; i < 4; i++) expect((await requestAccount(email)).status).toBe(202);
    expect(await windowCount(email)).toBe(3);
    expect(mailTo(email)).toHaveLength(3);
    const [u] = await getDb().select().from(user).where(eq(user.email, email));
    const issued = await getDb().select().from(auditLog).where(and(eq(auditLog.action, "auth.account_request.link_issued"), eq(auditLog.entityId, u!.id)));
    expect(issued).toHaveLength(3);
  });
});

describe("v6.1 §2.2: a failed provision gives its window slot back", () => {
  it("provision throws → slot released; the next request works and the mail arrives", async () => {
    const email = "release.r4@nltag.test";
    process.env.NLTAG_SIGNUP_ALLOWLIST = email;
    const spy = vi.spyOn(getAuth().api, "requestPasswordReset").mockRejectedValueOnce(new Error("database went away"));
    expect((await requestAccount(email)).status).toBe(202);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await windowCount(email)).toBe(0);
    expect(mailTo(email)).toHaveLength(0);
    expect((await requestAccount(email)).status).toBe(202);
    expect(await windowCount(email)).toBe(1);
    expect(mailTo(email)).toHaveLength(1);
  });

  it("repeated failures never use up the window (3 failures, then 3 working requests)", async () => {
    const email = "release.many.r4@nltag.test";
    process.env.NLTAG_SIGNUP_ALLOWLIST = email;
    const spy = vi.spyOn(getAuth().api, "requestPasswordReset").mockRejectedValue(new Error("down"));
    for (let i = 0; i < 3; i++) await requestAccount(email);
    expect(await windowCount(email)).toBe(0);
    spy.mockRestore();
    for (let i = 0; i < 3; i++) await requestAccount(email);
    expect(mailTo(email)).toHaveLength(3);
  });
});

describe("v6.1 §2.3: transient SMTP failures are retried under the one reserved slot", () => {
  const to = "retry.r4@nltag.test";
  const url = `${ORIGIN}/en/reset-password?token=x`;
  const slot = async () => (await getDb().execute(sql`SELECT COALESCE(SUM(count), 0) AS n FROM rate_limit_bucket WHERE bucket_key LIKE 'email:reset:%'`)) as unknown as [[{ n: number }]];
  const global = async () => (await getDb().execute(sql`SELECT COALESCE(SUM(count), 0) AS n FROM rate_limit_bucket WHERE bucket_key = 'email:global'`)) as unknown as [[{ n: number }]];

  it("two connection failures, then success: sent once, after 5 s and 30 s waits, using one slot", async () => {
    const waits: number[] = [];
    setMailRetrySleepForTests(async (ms) => void waits.push(ms));
    const real = getTransport().send.bind(getTransport());
    let calls = 0;
    vi.spyOn(getTransport(), "send").mockImplementation(async (m) => {
      calls += 1;
      if (calls <= 2) throw smtpError({ code: calls === 1 ? "ECONNECTION" : "ETIMEDOUT" });
      return real(m);
    });
    expect(await sendAccountEmail("reset", to, url)).toBe("sent");
    expect(calls).toBe(3);
    expect(waits).toEqual([5000, 30000]);
    expect(mailTo(to)).toHaveLength(1);
    expect(Number((await slot())[0][0].n)).toBe(1);
    expect(Number((await global())[0][0].n)).toBe(1);
  });

  it("three connection failures: failed, and only then the slot and the daily count are given back", async () => {
    setMailRetrySleepForTests(async () => undefined);
    const spy = vi.spyOn(getTransport(), "send").mockRejectedValue(smtpError({ code: "ECONNECTION" }));
    expect(await sendAccountEmail("reset", to, url)).toBe("failed");
    expect(spy).toHaveBeenCalledTimes(3);
    expect(Number((await slot())[0][0].n)).toBe(0);
    expect(Number((await global())[0][0].n)).toBe(0);
  });

  it("a server reply (4xx or 5xx) or an authentication error is never retried", async () => {
    setMailRetrySleepForTests(async () => undefined);
    for (const e of [smtpError({ code: "EENVELOPE", responseCode: 450 }), smtpError({ code: "EMESSAGE", responseCode: 421 }), smtpError({ code: "EAUTH", responseCode: 535 })]) {
      const spy = vi.spyOn(getTransport(), "send").mockRejectedValue(e);
      expect(await sendAccountEmail("reset", to, url)).toBe("failed");
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    }
    expect(Number((await slot())[0][0].n)).toBe(0);
  });
});

describe("v6.1 §2.5: account requests are audited by entity id only", () => {
  it("provisioned once for a new account, link_issued per link; never the address", async () => {
    const email = "audit.r4@nltag.test";
    process.env.NLTAG_SIGNUP_ALLOWLIST = email;
    await requestAccount(email);
    await requestAccount(email);
    const [u] = await getDb().select().from(user).where(eq(user.email, email));
    const rows = await getDb().select().from(auditLog).where(and(like(auditLog.action, "auth.account_request.%"), eq(auditLog.entityId, u!.id)));
    expect(rows.filter((r) => r.action === "auth.account_request.provisioned")).toHaveLength(1);
    expect(rows.filter((r) => r.action === "auth.account_request.link_issued")).toHaveLength(2);
    expect(rows.every((r) => r.reason === null || r.reason === "set-password")).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/@|audit\.r4/);
  });
});

describe("v6.1 §2.4: while shutting down, no new account request starts", () => {
  afterEach(() => resetLifecycleForTests());

  it("listed and unlisted get the same 503; nothing is provisioned", async () => {
    const email = "drain.r4@nltag.test";
    process.env.NLTAG_SIGNUP_ALLOWLIST = email;
    expect(await drain(1000)).toBe("drained");
    const observe = async (res: Response) => ({ status: res.status, body: await res.text(), headers: [...res.headers].filter(([k]) => k !== "date").sort() });
    const listed = await observe(await requestAccount(email));
    const unlisted = await observe(await requestAccount("not.listed.drain@nltag.test"));
    expect(listed.status).toBe(503);
    expect(unlisted).toEqual(listed);
    expect(await getDb().select().from(user).where(eq(user.email, email))).toHaveLength(0);
    expect(mailTo(email)).toHaveLength(0);
  });
});
