// Runs once when the Node.js server starts (Next.js instrumentation hook).
// Phase 4c: logs the media-storage health check so each Hostinger deployment's runtime log shows
// that the external media folder is writable and that the marker from earlier deployments is still
// there (persistence). Never throws; uploads fail closed on their own if the folder is unusable.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // R4 v6.1 §2.4: on SIGTERM/SIGINT, stop new account requests and wait (≤ 10 s) for queued
  // account requests and account emails (src/server/lifecycle.ts). Best effort; never throws.
  try {
    const { installGracefulDrain } = await import("./server/lifecycle");
    installGracefulDrain();
  } catch {
    console.info("[nltag-lifecycle] graceful drain unavailable");
  }
  try {
    const { probeMediaStorage } = await import("./server/storage/media-dir");
    const result = await probeMediaStorage();
    console.info(`[nltag-media-storage] ${JSON.stringify(result)}`);
  } catch {
    console.info("[nltag-media-storage] probe unavailable");
  }
}
