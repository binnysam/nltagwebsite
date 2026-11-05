import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { POST as routePOST } from "@/app/api/auth/[...all]/route";
import { getAuth } from "@/server/auth/auth";
import { flushVerificationPurgeForTests, purgeExpiredVerificationsSometimes } from "@/server/auth/verification-purge";
import { closeDb, getDb, getPool } from "@/server/db/client";
import { user, verification } from "@/server/db/schema";
import { flushEmailQueueForTests } from "@/server/email/send";
import { memoryOutbox } from "@/server/email/transport";
import { resetLifecycleForTests, drain } from "@/server/lifecycle";
import {
  flushGateAuditsForTests,
  flushResetRequestsForTests,
  RESET_REQUEST_ACCEPTED,
  RESET_REQUEST_MAX_PENDING,
  TIMING_FLOOR_MS,
} from "@/server/security/auth-abuse-gate";
import { purgeExpiredBucketsSometimes } from "@/server/services/rate-limit";
import { seed } from "../../scripts/db/seed";
import { call, clearRateLimits, linkIn, mailTo, ORIGIN, requestAccount, restoreEnv, verifiedUser } from "./helpers";

/**
 * Forgot-password request: no account oracle in status, body, headers or timing
 * (security-readiness review 5 Nov 2026, item 4).
 *
 * Before the fix, Better Auth did about four more database round trips (one a write) for an address
 * with an account. Measured with a latency proxy: +40 ms at 30 ms per round trip, +208 ms at 50 ms,
 * despite the 250 ms floor. The gate now answers before any of that work runs.
 *
 * Address shapes, all production-shaped and created through the real routes:
 *   U  = no account, not on the allowlist (a fresh address every probe)
 *   K  = active account (password), NOT on the allowlist
 *   L0 = on the allowlist, no account
 *   L1 = on the allowlist, account requested, no password yet
 *   L2 = on the allowlist, active account (the shape of every production staff account)
 *
 * Simulated database delay: every statement sent through the pool waits `ms` first (the gate's
 * reservation and Better Auth's adapter both use `getPool().query`, outside transactions).
 */

const K = "reset.unlisted.active@nltag.test";
const L0 = "reset.listed.none@nltag.test";
const L1 = "reset.listed.requested@nltag.test";
const L2 = "reset.listed.active@nltag.test";
const STAFF_ALLOWLIST = [L0, L1, L2].join(",");
const CLASSES = ["U", "K", "L0", "L1", "L2"] as const;
type Cls = (typeof CLASSES)[number];
let unknownCounter = 0;
const FIXED: Record<Exclude<Cls, "U">, string> = { K, L0, L1, L2 };
const addressOf = (cls: Cls) => (cls === "U" ? `reset.unknown.${unknownCounter++}@nltag.test` : FIXED[cls]);

let savedAllowlist: string | undefined;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  savedAllowlist = process.env.NLTAG_SIGNUP_ALLOWLIST;
  await seed();
  await clearRateLimits();
  process.env.NLTAG_SIGNUP_ALLOWLIST = STAFF_ALLOWLIST;
  expect((await requestAccount(L1)).status).toBe(202);
  await verifiedUser(L2);
  await verifiedUser(K);
  process.env.NLTAG_SIGNUP_ALLOWLIST = STAFF_ALLOWLIST; // K stays off the list
  await clearRateLimits();
}, 120_000);

afterEach(async () => {
  vi.restoreAllMocks();
  resetLifecycleForTests();
  await flushResetRequestsForTests();
});

afterAll(async () => {
  restoreEnv("NLTAG_SIGNUP_ALLOWLIST", savedAllowlist);
  await closeDb();
});

const resetRequest = (email: string) =>
  new Request(`${ORIGIN}/api/auth/request-password-reset`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": "198.51.100.9", "x-real-ip": "198.51.100.9" },
    body: JSON.stringify({ email, redirectTo: "/en/reset-password" }),
  });

/** Fresh per-address windows and mail caps, so every probe takes the normal path. */
const freshBudgets = () => getDb().execute(sql`DELETE FROM rate_limit_bucket WHERE bucket_key LIKE 'reset-req:%' OR bucket_key LIKE 'mail%' OR bucket_key LIKE '%mail%'`);

/** Runs the background purges now, so neither can start inside a timed or recorded window. */
async function quietPurges() {
  await purgeExpiredBucketsSometimes();
  purgeExpiredVerificationsSometimes();
  await flushVerificationPurgeForTests();
}

/** One request through the real route, timed alone; background work is awaited afterwards. */
async function probe(email: string) {
  await freshBudgets();
  await quietPurges();
  const t0 = performance.now();
  const res = await routePOST(resetRequest(email));
  const text = await res.text();
  const ms = performance.now() - t0;
  await flushResetRequestsForTests();
  await flushGateAuditsForTests();
  await flushEmailQueueForTests();
  const headers = [...res.headers].filter(([k]) => k !== "date").sort();
  return { status: res.status, text, headers, ms };
}

/** Every statement through the pool waits `ms` first. */
function delayEveryQuery(ms: number) {
  const pool = getPool();
  const original = pool.query.bind(pool) as (...args: unknown[]) => Promise<unknown>;
  return vi.spyOn(pool, "query").mockImplementation(((...args: unknown[]) => sleep(ms).then(() => original(...args))) as typeof pool.query);
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

describe("forgot-password request: one answer for every address", () => {
  it("the fixtures have the intended shapes", async () => {
    const shape = async (email: string) => {
      const [row] = await getDb().select({ id: user.id }).from(user).where(eq(user.email, email));
      return row ? "user" : "none";
    };
    expect(await shape(K)).toBe("user");
    expect(await shape(L0)).toBe("none");
    expect(await shape(L1)).toBe("user");
    expect(await shape(L2)).toBe("user");
    expect(process.env.NLTAG_SIGNUP_ALLOWLIST).toBe(STAFF_ALLOWLIST);
  });

  it("answers exactly what Better Auth itself answers for an unknown address", async () => {
    // Better Auth directly (no gate): its own reply for an address without an account.
    const direct = await getAuth().handler(resetRequest("reset.direct.unknown@nltag.test"));
    expect(direct.status).toBe(200);
    expect(await direct.json()).toEqual(RESET_REQUEST_ACCEPTED);
    const gated = await probe(addressOf("U"));
    expect(gated.status).toBe(200);
    expect(JSON.parse(gated.text)).toEqual(RESET_REQUEST_ACCEPTED);
    expect(gated.headers.find(([k]) => k === "content-type")?.[1]).toBe(direct.headers.get("content-type"));
    expect(gated.headers.some(([k]) => k === "set-cookie")).toBe(false);
  });

  it("status, body and headers are identical for every shape, and only real accounts get mail", async () => {
    memoryOutbox.length = 0;
    const answers = new Map<Cls, Awaited<ReturnType<typeof probe>>>();
    const sent: Record<string, string> = {};
    for (const cls of CLASSES) {
      const email = addressOf(cls);
      sent[cls] = email;
      answers.set(cls, await probe(email));
    }
    const u = answers.get("U")!;
    expect(u.status).toBe(200);
    for (const cls of CLASSES) {
      expect(answers.get(cls)!.status, cls).toBe(u.status);
      expect(answers.get(cls)!.text, cls).toBe(u.text);
      expect(answers.get(cls)!.headers, cls).toEqual(u.headers);
    }
    // The background job did the real work: reset mail for the two active accounts, the
    // set-password mail for the requested one, nothing for addresses without an account.
    expect(mailTo(sent.U!)).toHaveLength(0);
    expect(mailTo(L0)).toHaveLength(0);
    expect(mailTo(K).filter((m) => m.subject.includes("Reset"))).toHaveLength(1);
    expect(mailTo(L2).filter((m) => m.subject.includes("Reset"))).toHaveLength(1);
    expect(mailTo(L1)).toHaveLength(1);
    expect(mailTo(L1)[0]!.subject).not.toContain("Reset");
  });

  it("no statement about the address runs before the answer: the same statements for every shape", async () => {
    const before: Record<string, string[]> = {};
    for (const cls of CLASSES) {
      await freshBudgets();
      await quietPurges();
      const spy = vi.spyOn(getPool(), "query");
      const res = await routePOST(resetRequest(addressOf(cls)));
      // Snapshot at the moment the answer exists (the job has not started yet).
      const calls = spy.mock.calls.map(([q]) => (typeof q === "string" ? q : (q as { sql: string }).sql).replace(/\s+/g, " ").trim().toLowerCase());
      expect(res.status).toBe(200);
      before[cls] = calls;
      spy.mockRestore();
      await flushResetRequestsForTests();
      await flushEmailQueueForTests();
    }
    for (const cls of CLASSES) {
      expect(before[cls], cls).toEqual(before.U);
      for (const s of before[cls]!) {
        expect(s, cls).toContain("rate_limit_bucket");
        expect(s, cls).not.toMatch(/`(user|account|verification)`/);
      }
    }
    expect(before.U!.length).toBeGreaterThan(0);
  });

  // Normal conditions and the delays from the review (20, 30 and 50 ms per statement). Before the
  // fix, an account answered ~40 ms later at 30 ms and ~208 ms later at 50 ms. The limit is far
  // below those gaps and far above timer jitter; the floor itself is not asserted on.
  const ROUNDS = 8;
  const MAX_MEDIAN_GAP_MS = 15;
  for (const delayMs of [0, 20, 30, 50]) {
    it(
      `timing: no shape answers measurably later than an unknown address (${delayMs} ms per statement)`,
      async () => {
        if (delayMs) delayEveryQuery(delayMs);
        const times: Record<Cls, number[]> = { U: [], K: [], L0: [], L1: [], L2: [] };
        let reference: string | undefined;
        for (let round = 0; round < ROUNDS; round++) {
          const order = CLASSES.map((_, i) => CLASSES[(i + round) % CLASSES.length]!);
          for (const cls of order) {
            const r = await probe(addressOf(cls));
            expect(r.status, `${cls} round ${round}`).toBe(200);
            reference ??= r.text;
            expect(r.text, cls).toBe(reference);
            times[cls].push(r.ms);
          }
        }
        const u = median(times.U);
        const summary = Object.fromEntries(CLASSES.map((c) => [c, +median(times[c]).toFixed(1)]));
        console.info(`reset-request timing at +${delayMs} ms per statement (median ms)`, JSON.stringify(summary));
        for (const cls of CLASSES) expect(Math.abs(median(times[cls]) - u), `${cls} vs U at ${delayMs} ms`).toBeLessThan(MAX_MEDIAN_GAP_MS);
        // The job still does its work under the delay: an active account gets its reset mail.
        memoryOutbox.length = 0;
        await probe(L2);
        expect(mailTo(L2).filter((m) => m.subject.includes("Reset"))).toHaveLength(1);
      },
      240_000,
    );
  }
});

describe("forgot-password request: protections kept", () => {
  it("the emailed link still works once, and only within its hour", async () => {
    memoryOutbox.length = 0;
    await probe(L2);
    const mail = mailTo(L2).find((m) => m.subject.includes("Reset"))!;
    const redirect = await call(linkIn(mail.text), { method: "GET" });
    const token = new URL(redirect.headers.get("location")!, ORIGIN).searchParams.get("token")!;
    expect(token).toBeTruthy();
    const [row] = await getDb().select({ id: user.id }).from(user).where(eq(user.email, L2));
    const [v] = await getDb().select({ expiresAt: verification.expiresAt }).from(verification).where(eq(verification.value, row!.id));
    const lifetime = v!.expiresAt.getTime() - Date.now();
    expect(lifetime).toBeGreaterThan(55 * 60_000);
    expect(lifetime).toBeLessThanOrEqual(60 * 60_000);
    expect((await call("/reset-password", { body: { token, newPassword: "a-new-long-password-1" } })).status).toBe(200);
    expect((await call("/reset-password", { body: { token, newPassword: "a-new-long-password-2" } })).status).toBe(400);
  });

  it("the per-address window still applies, identically for every shape (5 per 15 minutes, then 429)", async () => {
    const sequence = async (email: string) => {
      await getDb().execute(sql`DELETE FROM rate_limit_bucket WHERE bucket_key LIKE 'reset-req:%'`);
      const statuses: number[] = [];
      for (let i = 0; i < 7; i++) {
        const res = await routePOST(resetRequest(email));
        statuses.push(res.status);
        await flushResetRequestsForTests();
        await flushEmailQueueForTests();
      }
      return statuses;
    };
    const u = await sequence("reset.window.unknown@nltag.test");
    expect(u).toEqual([200, 200, 200, 200, 200, 429, 429]);
    for (const email of [K, L0, L1, L2]) expect(await sequence(email), email).toEqual(u);
  });

  it("origin, redirect target and malformed addresses are refused before anything else, for every shape", async () => {
    for (const email of [addressOf("U"), K, L0, L2]) {
      const foreignOrigin = await call("/request-password-reset", { body: { email, redirectTo: "/en/reset-password" }, origin: "https://evil.example" });
      expect(foreignOrigin.status, email).toBe(403);
      const foreignTarget = await call("/request-password-reset", { body: { email, redirectTo: "https://evil.example/steal" } });
      expect(foreignTarget.status, email).toBe(403);
      const padded = await call("/request-password-reset", { body: { email: ` ${email} ` } });
      expect(padded.status, email).toBe(400);
    }
  });

  it("shutting down: every shape gets the same 503 and no job starts", async () => {
    await drain(1_000);
    memoryOutbox.length = 0;
    const answers: Awaited<ReturnType<typeof probe>>[] = [];
    for (const cls of CLASSES) answers.push(await probe(addressOf(cls)));
    for (const a of answers) {
      expect(a.status).toBe(503);
      expect(a.text).toBe(answers[0]!.text);
    }
    expect(mailTo(K)).toHaveLength(0);
    expect(mailTo(L2)).toHaveLength(0);
  });

  it(`a full queue (${RESET_REQUEST_MAX_PENDING} jobs) answers 503 for every shape, before any address work`, async () => {
    // Hold every job inside its first database statement so the queue fills.
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const pool = getPool();
    const original = pool.query.bind(pool) as (...args: unknown[]) => Promise<unknown>;
    vi.spyOn(pool, "query").mockImplementation(((...args: unknown[]) => {
      const text = typeof args[0] === "string" ? args[0] : (args[0] as { sql: string }).sql;
      return /`user`/.test(text) ? gate.then(() => original(...args)) : original(...args);
    }) as typeof pool.query);
    await getDb().execute(sql`DELETE FROM rate_limit_bucket WHERE bucket_key LIKE 'reset-req:%'`);
    const filling = await Promise.all(
      Array.from({ length: RESET_REQUEST_MAX_PENDING }, (_, i) => routePOST(resetRequest(`reset.fill.${i}@nltag.test`))),
    );
    expect(filling.every((r) => r.status === 200)).toBe(true);
    const full: { status: number; text: string }[] = [];
    for (const email of [addressOf("U"), K, L0, L1, L2]) {
      const res = await routePOST(resetRequest(email));
      full.push({ status: res.status, text: await res.text() });
    }
    for (const f of full) expect(f).toEqual(full[0]);
    expect(full[0]!.status).toBe(503);
    open();
    await flushResetRequestsForTests();
    await flushEmailQueueForTests();
    // The 503s spent no per-address budget.
    const [rows] = (await getDb().execute(sql`SELECT COUNT(*) AS n FROM rate_limit_bucket WHERE bucket_key LIKE 'reset-req:%'`)) as unknown as [[{ n: number }]];
    expect(Number(rows[0].n)).toBe(RESET_REQUEST_MAX_PENDING);
  });

  it("the floor still holds every answer for at least 250 ms", async () => {
    for (const cls of CLASSES) expect((await probe(addressOf(cls))).ms, cls).toBeGreaterThanOrEqual(TIMING_FLOOR_MS.resetRequest - 1);
  });
});

describe("forgot-password request: logs", () => {
  const capture = () => {
    const lines: string[] = [];
    for (const m of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
        lines.push(args.map((a) => (typeof a === "string" ? a : a instanceof Error ? `${a.name}: ${a.message}` : JSON.stringify(a))).join(" "));
      });
    }
    return lines;
  };

  it("normal requests log no address, token or link", async () => {
    const lines = capture();
    memoryOutbox.length = 0;
    const addresses = CLASSES.map((c) => addressOf(c));
    for (const email of addresses) await probe(email);
    const links = [K, L1, L2].flatMap((a) => mailTo(a)).map((m) => linkIn(m.text));
    expect(links.length).toBeGreaterThan(0);
    const all = lines.join("\n");
    for (const email of addresses) expect(all).not.toContain(email);
    for (const link of links) {
      expect(all).not.toContain(link);
      expect(all).not.toContain(new URL(link).pathname.split("/").at(-1)!);
    }
  });

  /**
   * A database failure inside the job. Through Better Auth's HTTP handler its router printed such an
   * error raw (`# SERVER_ERROR`), parameters and address included; the job now uses the server API
   * (owner decision, G2), which throws to the gate's redacting logger. So EVERY console line is
   * checked here, not only the logger's. (Other Better Auth endpoints still go through the HTTP
   * handler: docs/backend/data-and-auth.md → "Reset request: answered before the lookup".)
   */
  it("a failing job: nothing printed carries the address, and the answer is unchanged", async () => {
    const pool = getPool();
    const original = pool.query.bind(pool) as (...args: unknown[]) => Promise<unknown>;
    vi.spyOn(pool, "query").mockImplementation(((...args: unknown[]) => {
      const text = typeof args[0] === "string" ? args[0] : (args[0] as { sql: string }).sql;
      // A driver-style error that carries the address, as a failed query's parameters would.
      if (/`user`/.test(text)) return Promise.reject(new Error(`Failed query: ${text}\nparams: ${L2}`));
      return original(...args);
    }) as typeof pool.query);
    const lines = capture();
    const failing = await probe(L2);
    vi.restoreAllMocks();
    const healthy = await probe(addressOf("U"));
    expect(failing.status).toBe(healthy.status);
    expect(failing.text).toBe(healthy.text);
    expect(lines.length).toBeGreaterThan(0); // the failure is visible ...
    for (const l of lines) expect(l).not.toContain(L2); // ... in no line with the address (any source)
    expect(lines.some((l) => l.includes("# SERVER_ERROR"))).toBe(false);
    // Lines written by the server logger (security/log.ts) are JSON objects with an `event`.
    const loggerLines = lines.filter((l) => l.startsWith('{"level"'));
    const events = loggerLines.map((l) => (JSON.parse(l) as { event: string }).event);
    expect(events).toContain("auth.reset_request.failed");
    expect(loggerLines.join("\n")).toContain("[email]"); // the address was there, and was masked
  });
});

describe("forgot-password request: no path around the gate", () => {
  /** Spies on the two ways into Better Auth: its server API call, and its HTTP handler. */
  function spyOnBetterAuth() {
    const auth = getAuth();
    const api = vi.spyOn(auth.api, "requestPasswordReset");
    const handler = vi.spyOn(auth, "handler");
    return { api, handler };
  }

  it("an accepted request: one server-API call, made only once the held answer is decided, never the HTTP handler", async () => {
    await freshBudgets();
    await quietPurges();
    // Record when the job calls Better Auth: the hold (at least the 250 ms floor) must have ended.
    // That no statement about the address runs during the hold is checked for every shape by the
    // statement-order test above.
    const auth = getAuth();
    const real = auth.api.requestPasswordReset;
    let calledAt = 0;
    const api = vi.spyOn(auth.api, "requestPasswordReset").mockImplementation(((...a: Parameters<typeof real>) => {
      calledAt = performance.now();
      return real(...a);
    }) as typeof real);
    const handler = vi.spyOn(auth, "handler");
    const t0 = performance.now();
    const res = await routePOST(resetRequest(L2));
    const answeredAt = performance.now();
    expect(res.status).toBe(200);
    await flushResetRequestsForTests();
    await flushEmailQueueForTests();
    expect(api).toHaveBeenCalledTimes(1);
    expect(api.mock.calls[0]![0]).toEqual({ body: { email: L2, redirectTo: "/en/reset-password" } });
    expect(handler).not.toHaveBeenCalled();
    // The call came after the hold had ended (the floor), not while the answer was being held.
    expect(calledAt - t0).toBeGreaterThanOrEqual(TIMING_FLOOR_MS.resetRequest - 1);
    expect(calledAt).toBeLessThanOrEqual(answeredAt + 1_000);
  });

  it("every refused request reaches neither the server API nor the HTTP handler", async () => {
    const refused: { name: string; status: number }[] = [];
    const run = async (name: string, send: () => Promise<Response>) => {
      const { api, handler } = spyOnBetterAuth();
      const res = await send();
      await flushResetRequestsForTests();
      refused.push({ name, status: res.status });
      expect(api, name).not.toHaveBeenCalled();
      expect(handler, name).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    };
    await run("malformed address", () => call("/request-password-reset", { body: { email: ` ${L2} ` } }));
    await run("extra field", () => call("/request-password-reset", { body: { email: L2, callbackURL: "/en" } }));
    await run("foreign origin", () => call("/request-password-reset", { body: { email: L2 }, origin: "https://evil.example" }));
    await run("no origin", () => call("/request-password-reset", { body: { email: L2 }, origin: null }));
    await run("foreign redirect", () => call("/request-password-reset", { body: { email: L2, redirectTo: "https://evil.example/x" } }));
    await run("protocol-relative redirect", () => call("/request-password-reset", { body: { email: L2, redirectTo: "//evil.example/x" } }));
    // Window used up: 5 accepted first (their jobs run), then the 6th is refused.
    await getDb().execute(sql`DELETE FROM rate_limit_bucket WHERE bucket_key LIKE 'reset-req:%'`);
    for (let i = 0; i < 5; i++) await call("/request-password-reset", { body: { email: K } });
    await run("window used up", () => call("/request-password-reset", { body: { email: K } }));
    // Shutting down.
    await drain(1_000);
    await run("draining", () => call("/request-password-reset", { body: { email: L2 } }));
    resetLifecycleForTests();
    expect(refused.map((r) => r.status)).toEqual([400, 400, 403, 403, 403, 403, 429, 503]);
  });

  it("the route sends reset requests to the gate, never straight to Better Auth (accounts on), and 404s them with accounts off", async () => {
    const { api, handler } = spyOnBetterAuth();
    await freshBudgets();
    expect((await call("/request-password-reset", { body: { email: L0 } })).status).toBe(200);
    expect(handler).not.toHaveBeenCalled();
    expect(api).toHaveBeenCalledTimes(1);
    const saved = process.env.NLTAG_ACCOUNTS_ENABLED;
    process.env.NLTAG_ACCOUNTS_ENABLED = "0";
    try {
      expect((await call("/request-password-reset", { body: { email: L0 } })).status).toBe(404);
    } finally {
      restoreEnv("NLTAG_ACCOUNTS_ENABLED", saved);
    }
    expect(api).toHaveBeenCalledTimes(1);
    expect(handler).not.toHaveBeenCalled();
  });
});
