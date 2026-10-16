import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { loadRootEnvironment } from "../../src/config.js";
import { GcsMaterialStorage } from "../../src/timeline/storage.js";

loadRootEnvironment();

const bucket = process.env.MATERIAL_STORAGE_BUCKET;
const enabled = process.env.RUN_GCS_INTEGRATION === "true" && Boolean(bucket);
const describeWithGcs = enabled ? describe : describe.skip;

describeWithGcs("Google Cloud Storage material adapter", () => {
  it("uploads, downloads and deletes a private object through ADC", async () => {
    const storage = new GcsMaterialStorage(
      bucket!,
      `educai-integration/${Date.now()}`,
    );
    const professorId = "5d73ea1d-9ab8-4384-960e-3a6f00e6328a";
    let storageKey: string | null = null;

    try {
      const stored = await storage.store(
        professorId,
        Readable.from(Buffer.from("EDUCAI GCS integration fixture")),
      );
      storageKey = stored.storageKey;
      const chunks: Buffer[] = [];
      for await (const chunk of await storage.open(storageKey))
        chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks).toString()).toBe(
        "EDUCAI GCS integration fixture",
      );
    } finally {
      if (storageKey) await storage.delete(storageKey);
    }
  }, 60_000);
});
