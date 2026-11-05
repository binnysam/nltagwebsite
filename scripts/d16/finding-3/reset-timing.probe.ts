// Password-reset REQUEST timing by address shape (security-readiness review 5 Nov 2026, item 4), in
// one process, through the real /api/auth route and the gate's real hold. Test tooling, not part of
// the integration suite (its own config, reset.vitest.config.ts); run with scripts/d16/finding-3/reset-run.sh.
// Modelled on allowlist-timing.probe.ts. The regression test is tests/integration/r4-reset-request.test.ts.
//   U  = no account, not on the allowlist (fresh address every probe)
//   K  = account with a password, not on the allowlist
//   L1 = on the allowlist, user row without a credential (set-password mail branch)
//   L2 = on the allowlist, account with a password (production staff shape; reset mail branch)
// Before every probe the address's reset-request window is cleared; the reset job and its mail are
// awaited OUTSIDE the timed window. The timing estimator is reset once (no sign-in traffic).
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { POST } from "@/app/api/auth/[...all]/route";
import { closeDb, getDb } from "@/server/db/client";
import { account, user } from "@/server/db/schema";
import { flushEmailQueueForTests } from "@/server/email/send";
import { flushGateAuditsForTests, flushResetRequestsForTests, resetGateLimitersForTests, resetTimingEstimatorForTests } from "@/server/security/auth-abuse-gate";
import { seed, SEED_USERS } from "../../db/seed";
import { clearRateLimits } from "../../../tests/integration/helpers";

const N = Number(process.env.F3_N ?? 40);
const OUT = process.env.F3_OUT ?? "reset-probes.csv";
const L1 = "rt.listed.row@nltag.test";
const L2 = "rt.listed.acct@nltag.test";
const K = SEED_USERS[2]!.email;
const ORIGIN = "http://localhost:3000";

beforeAll(async () => {
  await seed();
  await clearRateLimits();
  resetGateLimitersForTests();
  resetTimingEstimatorForTests();
  const now = new Date();
  await getDb().insert(user).values({ id: randomUUID(), name: "", email: L1, emailVerified: false, createdAt: now, updatedAt: now });
  const id = randomUUID();
  await getDb().insert(user).values({ id, name: "RT Listed", email: L2, emailVerified: true, createdAt: now, updatedAt: now });
  const hash = await hashPassword(`rt-nobody-knows-${randomUUID()}`);
  await getDb().insert(account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: hash, createdAt: now, updatedAt: now });
  process.env.NLTAG_SIGNUP_ALLOWLIST = [L1, L2].join(",");
}, 120_000);
afterAll(closeDb);

it("reset-request class timings", async () => {
  const classes = ["U", "K", "L1", "L2"] as const;
  const fixed: Record<string, string> = { K, L1, L2 };
  const rows = ["round,class,position,status,ms"];
  let u = 0;
  for (let round = 0; round < N; round++) {
    const order = classes.map((_, i) => classes[(i + round) % classes.length]!);
    for (const [position, cls] of order.entries()) {
      const email = cls === "U" ? `rt.unknown.${u++}@nltag.test` : fixed[cls]!;
      await getDb().execute(sql`DELETE FROM rate_limit_bucket WHERE bucket_key LIKE 'reset-req:%' OR bucket_key LIKE 'mail%' OR bucket_key LIKE '%mail%'`);
      const req = new Request(`${ORIGIN}/api/auth/request-password-reset`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": "198.51.100.7", "x-real-ip": "198.51.100.7" },
        body: JSON.stringify({ email }),
      });
      const t0 = performance.now();
      const res = await POST(req);
      await res.text();
      const ms = performance.now() - t0;
      rows.push(`${round},${cls},${position},${res.status},${ms.toFixed(3)}`);
      await flushResetRequestsForTests();
      await flushGateAuditsForTests();
      await flushEmailQueueForTests();
    }
  }
  writeFileSync(OUT, rows.join("\n") + "\n");
  expect(rows.slice(1).filter((r) => r.split(",")[3] !== "200")).toEqual([]);
}, 3_600_000);
