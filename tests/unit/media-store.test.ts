// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { discardMediaFile, readMediaFile, storageKey, writeMediaFile } from "@/server/storage/media-store";

const ID = "3f2a9c1e-7b4d-4e8a-9c3b-1d2e3f4a5b6c";
const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const sha = createHash("sha256").update(bytes).digest("hex");

describe("media file store", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), "nltag-store-"));
    vi.stubEnv("NLTAG_MEDIA_DIR", root);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it("writes atomically to a sharded, extension-less, private file and reads it back", async () => {
    const key = await writeMediaFile(ID, bytes);
    expect(key).toBe(`3f/${ID}`);
    const file = path.join(root, "3f", ID);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(path.join(root, "3f")).mode & 0o777).toBe(0o700);
    expect(readdirSync(path.join(root, "3f"))).toEqual([ID]); // no temp files left
    expect(new Uint8Array((await readMediaFile(key, sha))!)).toEqual(bytes);
  });

  it("returns null for a missing file or content that no longer matches its hash", async () => {
    expect(await readMediaFile(`3f/${ID}`, sha)).toBeNull();
    const key = await writeMediaFile(ID, bytes);
    writeFileSync(path.join(root, "3f", ID), "<script>alert(1)</script>");
    expect(await readMediaFile(key, sha)).toBeNull();
  });

  it("refuses keys and ids that could escape the folder", async () => {
    expect(() => storageKey("../../etc/passwd")).toThrow();
    await expect(readMediaFile("../x", sha)).rejects.toThrow();
    await expect(readMediaFile(`3f/${ID}/../../x`, sha)).rejects.toThrow();
    await expect(readMediaFile(`aa/${ID}`, sha)).rejects.toThrow(); // shard must match the id
    await expect(writeMediaFile("not-a-uuid", bytes)).rejects.toThrow();
  });

  it("discards a file", async () => {
    const key = await writeMediaFile(ID, bytes);
    await discardMediaFile(key);
    expect(readdirSync(path.join(root, "3f"))).toEqual([]);
  });

  it("fails closed when the configured folder is unsafe", async () => {
    vi.stubEnv("NLTAG_MEDIA_DIR", path.join(process.cwd(), "public", "media"));
    await expect(writeMediaFile(ID, bytes)).rejects.toThrow(/not available/);
  });
});
