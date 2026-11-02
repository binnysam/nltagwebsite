// Runs once when the Node.js server starts (Next.js instrumentation hook).
// Phase 4c: logs the media-storage health check so each Hostinger deployment's runtime log shows
// that the external media folder is writable and that the marker from earlier deployments is still
// there (persistence). Never throws; uploads fail closed on their own if the folder is unusable.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { probeMediaStorage } = await import("./server/storage/media-dir");
    const result = await probeMediaStorage();
    console.info(`[nltag-media-storage] ${JSON.stringify(result)}`);
  } catch {
    console.info("[nltag-media-storage] probe unavailable");
  }
}
