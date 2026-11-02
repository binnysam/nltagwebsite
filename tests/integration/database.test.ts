import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { consume } from "@/server/services/rate-limit";

afterAll(closeDb);

type Row = Record<string, unknown>;
const rows = async (q: ReturnType<typeof sql>) => (await getDb().execute(q))[0] as unknown as Row[];

describe("MariaDB engine and character set", () => {
  it("runs on MariaDB (11.8 in CI and production)", async () => {
    const [v] = await rows(sql`SELECT VERSION() AS v`);
    const version = String(v!.v);
    expect(version).toMatch(/MariaDB/);
    if (process.env.CI) expect(version.startsWith("11.8")).toBe(true);
  });

  it("uses utf8mb4_uca1400_ai_ci on every table", async () => {
    const tables = await rows(sql`SELECT table_name AS t, table_collation AS c FROM information_schema.tables WHERE table_schema = DATABASE()`);
    expect(tables.length).toBeGreaterThanOrEqual(9);
    for (const t of tables) expect(t.c, String(t.t)).toBe("utf8mb4_uca1400_ai_ci");
  });

  it("uses ascii_bin for ids, tokens and hashes (case-sensitive), Unicode for human text", async () => {
    const cols = await rows(sql`SELECT table_name AS t, column_name AS c, collation_name AS k FROM information_schema.columns WHERE table_schema = DATABASE() AND collation_name IS NOT NULL`);
    const k = (t: string, c: string) => cols.find((x) => x.t === t && x.c === c)?.k;
    for (const [t, c] of [["session", "token"], ["verification", "identifier"], ["account", "password"], ["user", "id"], ["audit_log", "ip_hash"], ["rate_limit", "key"]]) {
      expect(k(t!, c!), `${t}.${c}`).toBe("ascii_bin");
    }
    expect(k("user", "name")).toBe("utf8mb4_uca1400_ai_ci");
    expect(k("user", "email")).toBe("utf8mb4_uca1400_ai_ci");
    expect(cols.every((x) => x.k === "ascii_bin" || x.k === "utf8mb4_uca1400_ai_ci")).toBe(true);
  });

  it("stores and returns Tamil text exactly (fictional name)", async () => {
    const tamil = "சோதனை நபர் அ"; // "Test Person A"
    const now = new Date();
    await getDb().insert(user).values({ id: "tamil-roundtrip", name: tamil, email: "tamil.roundtrip@nltag.test", emailVerified: false, createdAt: now, updatedAt: now });
    const [r] = await rows(sql`SELECT name, CHAR_LENGTH(name) AS chars, HEX(name) AS hex FROM user WHERE id = 'tamil-roundtrip'`);
    expect(r!.name).toBe(tamil);
    expect(Number(r!.chars)).toBe([...tamil].length);
    expect(String(r!.hex)).toBe(Buffer.from(tamil, "utf8").toString("hex").toUpperCase());
    await getDb().execute(sql`DELETE FROM user WHERE id = 'tamil-roundtrip'`);
  });

  it("keeps session time zone at UTC so datetimes round-trip", async () => {
    const [tz] = await rows(sql`SELECT @@session.time_zone AS tz`);
    expect(tz!.tz).toBe("+00:00");
  });
});

describe("rate-limit counters under concurrency", () => {
  it("20 parallel hits produce exactly 20 counts and only `max` are allowed", async () => {
    const now = Date.now();
    const results = await Promise.all(Array.from({ length: 20 }, () => consume("test:concurrency", { window: 60, max: 5 }, now)));
    const [r] = await rows(sql`SELECT count FROM rate_limit_bucket WHERE bucket_key = 'test:concurrency'`);
    expect(Number(r!.count)).toBe(20);
    expect(results.filter((x) => x.allowed).length).toBeLessThanOrEqual(5);
  });
});
