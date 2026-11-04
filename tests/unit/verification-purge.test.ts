// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M1 option B (owner decision 4 Nov 2026), unit level: the configuration line, the schedule and the
 * failure handling of src/server/auth/verification-purge.ts. The SQL itself is tested on MariaDB in
 * tests/integration/m1-verification-cleanup.test.ts and m1-verification-concurrency.test.ts.
 */

const execute = vi.fn();
const txExecute = vi.fn();
const transaction = vi.fn(async (fn: (tx: { execute: typeof txExecute }) => unknown, config?: unknown) => {
  transactionConfigs.push(config);
  return fn({ execute: txExecute });
});
const transactionConfigs: unknown[] = [];
vi.mock("@/server/db/client", () => ({ getDb: () => ({ execute, transaction }) }));

const purge = await import("@/server/auth/verification-purge");

const code = (path: string) => readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

beforeEach(() => {
  execute.mockReset();
  txExecute.mockReset();
  transaction.mockClear();
  transactionConfigs.length = 0;
  purge.resetVerificationPurgeScheduleForTests();
});
afterEach(() => vi.restoreAllMocks());

describe("M1 option B: configuration", () => {
  it("auth.ts turns Better Auth's per-lookup cleanup off and keeps identifiers hashed", () => {
    expect(code("src/server/auth/auth.ts")).toMatch(/verification:\s*\{\s*storeIdentifier:\s*"hashed",\s*disableCleanup:\s*true\s*\}/);
  });

  it("the gate starts the purge without awaiting it", () => {
    const gate = code("src/server/security/auth-abuse-gate.ts");
    expect(gate).toMatch(/\n\s*purgeExpiredVerificationsSometimes\(\);/);
    expect(gate).not.toMatch(/await\s+purgeExpiredVerificationsSometimes/);
  });

  it("the purge deletes by primary key with the expiry re-checked, under READ COMMITTED", () => {
    const src = code("src/server/auth/verification-purge.ts");
    expect(src).toMatch(/SELECT id FROM verification WHERE expires_at < \$\{cutoff\} ORDER BY expires_at LIMIT \$\{limit\}/);
    expect(src).toMatch(/DELETE FROM verification WHERE id IN \(/);
    expect(src).toMatch(/\)\}\) AND expires_at < \$\{cutoff\}`/);
    expect(src).toMatch(/isolationLevel: "read committed"/);
    // No range delete anywhere in the module.
    expect(src).not.toMatch(/DELETE FROM verification WHERE expires_at/);
  });

  it("constants: every 10 minutes, one hour of grace, 200 rows per pass", () => {
    expect(purge.VERIFICATION_PURGE).toEqual({ intervalMs: 10 * 60_000, graceMs: 60 * 60_000, batch: 200 });
  });
});

describe("M1 option B: purge pass", () => {
  it("uses a cutoff one hour before now and deletes only the selected ids", async () => {
    execute.mockResolvedValueOnce([[{ id: "a" }, { id: "b" }]]);
    txExecute.mockResolvedValueOnce([{ affectedRows: 2 }]);
    const now = new Date("2026-11-04T12:00:00.000Z");
    expect(await purge.purgeExpiredVerifications(now)).toBe(2);
    const select = execute.mock.calls[0]![0] as { queryChunks: unknown[] };
    expect(JSON.stringify(select)).toContain("2026-11-04T11:00:00.000Z");
    const del = JSON.stringify(txExecute.mock.calls[0]![0]);
    expect(del).toContain('"a"');
    expect(del).toContain('"b"');
    expect(del).toContain("2026-11-04T11:00:00.000Z");
    expect(transactionConfigs).toEqual([{ isolationLevel: "read committed" }]);
  });

  it("nothing expired: no delete, no transaction", async () => {
    execute.mockResolvedValueOnce([[]]);
    expect(await purge.purgeExpiredVerifications()).toBe(0);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("refuses an id list over the batch size", async () => {
    await expect(purge.deleteExpiredVerificationsById(Array.from({ length: 201 }, (_, i) => `id-${i}`), new Date())).rejects.toThrow(/too large/);
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("M1 option B: schedule and failures", () => {
  it("returns synchronously; a second call while one runs or within 10 minutes does nothing", async () => {
    let release!: (v: unknown) => void;
    execute.mockReturnValueOnce(new Promise((r) => (release = r)));
    const t = 1_000_000;
    expect(purge.purgeExpiredVerificationsSometimes(t)).toBeUndefined();
    purge.purgeExpiredVerificationsSometimes(t + 10 * 60_000 + 1); // still running → skipped
    expect(execute).toHaveBeenCalledTimes(1);
    release([[]]);
    await purge.flushVerificationPurgeForTests();
    purge.purgeExpiredVerificationsSometimes(t + 9 * 60_000);
    expect(execute).toHaveBeenCalledTimes(1);
    execute.mockResolvedValueOnce([[]]);
    purge.purgeExpiredVerificationsSometimes(t + 10 * 60_000);
    await purge.flushVerificationPurgeForTests();
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("a failure (e.g. a deadlock) is logged without data, never thrown to the caller, and retried at the next interval", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const err = Object.assign(new Error("Deadlock found when trying to get lock; secret admin@nltag.test"), { code: "ER_LOCK_DEADLOCK", errno: 1213 });
    execute.mockRejectedValueOnce(err);
    const t = 5_000_000;
    expect(() => purge.purgeExpiredVerificationsSometimes(t)).not.toThrow();
    await purge.flushVerificationPurgeForTests();
    expect(warn).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(warn.mock.calls[0]![0])) as Record<string, unknown>;
    expect(line).toMatchObject({ level: "warn", event: "auth.verification_purge_failed", dbError: "ER_LOCK_DEADLOCK", errno: 1213 });
    expect(JSON.stringify(line)).not.toMatch(/nltag\.test|Deadlock found/);

    // Not retried on the next request…
    purge.purgeExpiredVerificationsSometimes(t + 1000);
    expect(execute).toHaveBeenCalledTimes(1);
    // …but at the next interval.
    execute.mockResolvedValueOnce([[{ id: "x" }]]);
    txExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);
    purge.purgeExpiredVerificationsSometimes(t + 10 * 60_000);
    await purge.flushVerificationPurgeForTests();
    expect(execute).toHaveBeenCalledTimes(2);
    expect(txExecute).toHaveBeenCalledTimes(1);
  });
});
