// Runs once when the Node.js server starts (Next.js instrumentation hook).
// Phase 4c: logs the media-storage probe so each Hostinger deployment's runtime log shows whether
// the external media folder is writable and survived the previous deployment. Never throws.
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
