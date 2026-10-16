import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import { LocalMaterialStorage } from "./storage.js";

const directories: string[] = [];
const professorId = "5d73ea1d-9ab8-4384-960e-3a6f00e6328a";

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("local private material storage", () => {
  it("writes, reads and deletes an opaque professor-scoped object", async () => {
    const directory = await mkdtemp(join(tmpdir(), "educai-material-"));
    directories.push(directory);
    const storage = new LocalMaterialStorage(directory);

    const stored = await storage.store(
      professorId,
      Readable.from(Buffer.from("private-content")),
    );

    expect(stored.storageKey).toMatch(new RegExp(`^${professorId}/`));
    expect(stored.sizeBytes).toBe(15);
    const chunks: Buffer[] = [];
    for await (const chunk of await storage.open(stored.storageKey))
      chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe("private-content");

    await storage.delete(stored.storageKey);
    await expect(storage.open(stored.storageKey)).rejects.toThrow();
  });

  it("rejects path traversal keys", async () => {
    const directory = await mkdtemp(join(tmpdir(), "educai-material-"));
    directories.push(directory);
    const storage = new LocalMaterialStorage(directory);

    await expect(storage.open("../../outside")).rejects.toThrow(
      "MATERIAL_STORAGE_KEY_INVALID",
    );
  });
});
