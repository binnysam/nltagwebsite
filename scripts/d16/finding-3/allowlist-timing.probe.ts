// D16 finding 3 investigation (test tooling, not part of the integration suite: its own config,
// scripts/d16/finding-3/vitest.config.ts). Times the sign-in failure answer for five
// production-shaped address classes in one process, through the real /api/auth route and the
// gate's real adaptive hold. It asserts only that every probe answered 401; the comparison is
// printed by summarize.mjs. Procedure and results: docs/reports/d16-timing/finding-3-allowlist-timing.md.
//   U  = no account, not on the allowlist (a fresh address every probe)
//   K  = account with a password, NOT on the allowlist (the D16 harness "known" class)
//   L0 = on the allowlist, no user row (the D16 harness "listed" class)
//   L1 = on the allowlist, user row without a credential (what /api/account-request leaves)
//   L2 = on the allowlist, account with a password (the shape of every production staff account)
// The route is called directly and timed alone; audit flushes happen outside the timed window.
// Before every probe the address's own key and every class:K:* window are cleared (scratch DB).
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { POST } from "@/app/api/auth/[...all]/route";
import { closeDb, getDb } from "@/server/db/client";
import { account, user } from "@/server/db/schema";
import { flushGateAuditsForTests, resetGateLimitersForTests, resetTimingEstimatorForTests } from "@/server/security/auth-abuse-gate";
import { hashEmail } from "@/server/security/hash";
import { signInAccountKey } from "@/server/services/rate-limit";
import { seed, SEED_USERS } from "../../db/seed";
import { clearRateLimits } from "../../../tests/integration/helpers";

const N = Number(process.env.F3_N ?? 40);
const OUT = process.env.F3_OUT ?? "f3-probes.csv";
const L0 = "f3.listed.none@nltag.test";
const L1 = "f3.listed.row@nltag.test";
const L2 = "f3.listed.acct@nltag.test";
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
  await getDb().insert(user).values({ id, name: "F3 Listed", email: L2, emailVerified: true, createdAt: now, updatedAt: now });
  const hash = await hashPassword(`f3-nobody-knows-${randomUUID()}`);
  await getDb().insert(account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: hash, createdAt: now, updatedAt: now });
  // A production-shaped policy: an explicit staff allowlist (without it, outside production the
  // policy is "open" and the gate treats every address as allowlisted).
  process.env.NLTAG_SIGNUP_ALLOWLIST = [L0, L1, L2].join(",");
}, 120_000);
afterAll(closeDb);

it("finding-3 class timings", async () => {
  const classes = ["U", "K", "L0", "L1", "L2"] as const;
  const fixed: Record<string, string> = { K, L0, L1, L2 };
  const rows = ["round,class,position,status,ms"];
  let u = 0;
  for (let round = 0; round < N; round++) {
    const order = classes.map((_, i) => classes[(i + round) % classes.length]!);
    for (const [position, cls] of order.entries()) {
      const email = cls === "U" ? `f3.unknown.${u++}@nltag.test` : fixed[cls]!;
      await getDb().execute(sql`DELETE FROM rate_limit_bucket WHERE bucket_key = ${signInAccountKey(hashEmail(email))} OR bucket_key LIKE 'class:K:%'`);
      const req = new Request(`${ORIGIN}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": "198.51.100.7", "x-real-ip": "198.51.100.7" },
        body: JSON.stringify({ email, password: "f3-definitely-wrong" }),
      });
      const t0 = performance.now();
      const res = await POST(req);
      await res.text();
      const ms = performance.now() - t0;
      rows.push(`${round},${cls},${position},${res.status},${ms.toFixed(3)}`);
      await flushGateAuditsForTests();
    }
  }
  writeFileSync(OUT, rows.join("\n") + "\n");
  expect(rows.slice(1).filter((r) => r.split(",")[3] !== "401")).toEqual([]);
}, 3_600_000);
