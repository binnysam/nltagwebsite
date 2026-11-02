// Runs once when the Node.js server starts (Next.js instrumentation hook).
// Phase 4c: logs the media-storage probe so each Hostinger deployment's runtime log shows whether
// the external media folder is writable and survived the previous deployment. Never throws.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { earlierProbeDir, probeMediaStorage, readMarker } = await import("./server/storage/media-dir");
    const result = await probeMediaStorage();
    console.info(`[nltag-media-storage] ${JSON.stringify(result)}`);
    // Persistence evidence for the folder the first production probe used ($HOME = domain folder).
    if (process.env.NODE_ENV === "production") {
      const earlier = earlierProbeDir();
      if (earlier !== result.dir) console.info(`[nltag-media-storage:earlier] ${JSON.stringify(await readMarker(earlier))}`);
    }
  } catch {
    console.info("[nltag-media-storage] probe unavailable");
  }
}
