import "server-only";
import { log } from "./security/log";

/**
 * R4 v6.1 §2.4 graceful drain. Background work that runs after a reply has been sent (account
 * requests, account emails) lives only in memory. On SIGTERM/SIGINT the process stops taking new
 * account requests and waits up to DRAIN_TIMEOUT_MS for the work already queued.
 *
 * Best effort by design (addendum §2): a hard kill still loses the job, and every interruption
 * point leaves a recoverable state (the person requests again). Next.js's own server also exits on
 * these signals; the wait is only guaranteed when NEXT_MANUAL_SIG_HANDLE is set, in which case this
 * module exits the process itself once the drain is done. Setting that variable on the server is a
 * separate deployment decision; without it the drain races Next.js's own shutdown.
 */
export const DRAIN_TIMEOUT_MS = 10_000;

type Waiter = () => Promise<void>;
interface LifecycleState {
  waiters: Map<string, Waiter>;
  draining: boolean;
  installed: boolean;
}
/**
 * One state per process, not per module copy: Next.js bundles src/instrumentation.ts separately
 * from the route handlers, so a module-level variable would not be shared between them.
 */
const KEY = Symbol.for("nltag.lifecycle");
const state: LifecycleState = ((globalThis as Record<symbol, unknown>)[KEY] as LifecycleState | undefined) ??
  ((globalThis as Record<symbol, unknown>)[KEY] = { waiters: new Map(), draining: false, installed: false } satisfies LifecycleState) as LifecycleState;

/** True once shutdown has begun: no new background jobs may start. */
export const isDraining = () => state.draining;

/** Registers a queue to wait for at shutdown (idempotent by name). */
export function registerDrainWaiter(name: string, wait: Waiter) {
  state.waiters.set(name, wait);
}

/** Stops new background work and waits for registered queues, at most `timeoutMs`. */
export async function drain(timeoutMs = DRAIN_TIMEOUT_MS): Promise<"drained" | "timeout"> {
  state.draining = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  const all = Promise.all([...state.waiters.values()].map((w) => w().catch(() => undefined))).then(() => "drained" as const);
  const result = await Promise.race([all, timeout]);
  if (timer) clearTimeout(timer);
  return result;
}

/** Called once from src/instrumentation.ts (Node.js runtime only). */
export function installGracefulDrain(proc: NodeJS.Process = process) {
  if (state.installed) return;
  state.installed = true;
  const onSignal = (signal: "SIGTERM" | "SIGINT") => {
    void drain().then((result) => {
      log(result === "drained" ? "info" : "warn", "lifecycle.drain", { signal, result });
      if (proc.env.NEXT_MANUAL_SIG_HANDLE) proc.exit(signal === "SIGINT" ? 130 : 143);
    });
  };
  proc.once("SIGTERM", () => onSignal("SIGTERM"));
  proc.once("SIGINT", () => onSignal("SIGINT"));
}

/** Tests only. */
export function resetLifecycleForTests() {
  state.draining = false;
}
