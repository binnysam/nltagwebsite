// @vitest-environment node
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MARKER_FILE, probeMediaStorage, resolveMediaDir, unsafeLocation } from "@/server/storage/media-dir";

describe("resolveMediaDir", () => {
  const app = "/home/u1/domains/example.com/nodejs/versions/abc";
  it("defaults to <home>/nltag-data/media in production", () => {
    expect(resolveMediaDir({ NODE_ENV: "production" }, "/home/u339364475", app)).toEqual({
      ok: true, dir: "/home/u339364475/nltag-data/media", source: "home",
    });
  });
  it("accepts an absolute NLTAG_MEDIA_DIR", () => {
    expect(resolveMediaDir({ NODE_ENV: "production", NLTAG_MEDIA_DIR: "/srv/media/" }, "/home/u1", app)).toMatchObject({ ok: true, dir: "/srv/media/" , source: "env" });
  });
  it("refuses relative, app-internal and web-root locations", () => {
    expect(resolveMediaDir({ NLTAG_MEDIA_DIR: "media" }, "/home/u1", app).ok).toBe(false);
    expect(resolveMediaDir({ NLTAG_MEDIA_DIR: `${app}/uploads` }, "/home/u1", app).ok).toBe(false);
    expect(resolveMediaDir({ NLTAG_MEDIA_DIR: "/home/u1/domains/example.com/public_html/media" }, "/home/u1", app).ok).toBe(false);
    expect(unsafeLocation("/home/u1/nltag-data/media", app)).toBeNull();
  });
  it("uses the git-ignored .data folder outside production", () => {
    expect(resolveMediaDir({ NODE_ENV: "test" }, "/home/u1", app)).toMatchObject({ ok: true, dir: `${app}/.data/media`, source: "dev" });
  });
});

describe("probeMediaStorage", () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(path.join(os.tmpdir(), "nltag-media-")); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("creates a private folder, round-trips a probe and keeps a marker across runs", async () => {
    const dir = path.join(root, "nltag-data", "media");
    const first = await probeMediaStorage({ NLTAG_MEDIA_DIR: dir }, new Date("2026-11-02T10:00:00Z"));
    expect(first).toMatchObject({ writable: true, readBack: true, dirMode: "700", markerExisted: false });
    expect(first.error).toBeUndefined();
    expect(readdirSync(dir)).toEqual([MARKER_FILE]); // probe file removed
    expect(statSync(path.join(dir, MARKER_FILE)).mode & 0o777).toBe(0o600);

    const second = await probeMediaStorage({ NLTAG_MEDIA_DIR: dir }, new Date("2026-11-02T11:00:00Z"));
    expect(second).toMatchObject({ markerExisted: true, markerCreatedAt: "2026-11-02T10:00:00.000Z" });
  });

  it("reports an unsafe location without touching the disk", async () => {
    const r = await probeMediaStorage({ NLTAG_MEDIA_DIR: path.join(process.cwd(), "uploads") });
    expect(r.writable).toBe(false);
    expect(r.error).toMatch(/inside the application folder/);
  });
});

describe("account home and markers", () => {
  it("reads the account home from the user database", async () => {
    const { accountHome } = await import("@/server/storage/media-dir");
    expect(accountHome()).toBe(os.userInfo().homedir);
  });
  it("reports a missing marker without creating anything", async () => {
    const { readMarker } = await import("@/server/storage/media-dir");
    const dir = mkdtempSync(path.join(os.tmpdir(), "nltag-marker-"));
    expect(await readMarker(dir)).toEqual({ dir, markerExisted: false, markerCreatedAt: null });
    expect(readdirSync(dir)).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });
});
