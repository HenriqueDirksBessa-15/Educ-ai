import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GcsMaterialStorage,
  LocalMaterialStorage,
  type GoogleCloudTokenProvider,
} from "./storage.js";

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

describe("GCS private material storage", () => {
  it("uploads, downloads and deletes an opaque object with ADC authorization", async () => {
    let uploaded = Buffer.alloc(0);
    const request = vi.fn(
      async (input: string | URL, init?: RequestInit & { duplex?: "half" }) => {
        const method = init?.method ?? "GET";
        if (method === "POST") {
          const chunks: Buffer[] = [];
          for await (const chunk of init!
            .body as unknown as AsyncIterable<Uint8Array>)
            chunks.push(Buffer.from(chunk));
          uploaded = Buffer.concat(chunks);
          return new Response("{}", { status: 200 });
        }
        if (method === "DELETE") return new Response(null, { status: 204 });
        return new Response("cloud-content", { status: 200 });
      },
    );
    const tokenProvider = {
      getAccessToken: vi.fn().mockResolvedValue("adc-token"),
    } as GoogleCloudTokenProvider;
    const storage = new GcsMaterialStorage(
      "educai-private-test",
      "materials/hml",
      tokenProvider,
      request,
    );

    const stored = await storage.store(
      professorId,
      Readable.from(Buffer.from("private-content")),
    );
    expect(uploaded.toString()).toBe("private-content");
    expect(stored.sizeBytes).toBe(15);
    expect(stored.head.toString()).toBe("private-content");
    const uploadUrl = new URL(String(request.mock.calls[0]![0]));
    expect(uploadUrl.pathname).toContain(
      "/upload/storage/v1/b/educai-private-test/o",
    );
    expect(uploadUrl.searchParams.get("uploadType")).toBe("media");
    expect(uploadUrl.searchParams.get("ifGenerationMatch")).toBe("0");
    expect(uploadUrl.searchParams.get("name")).toBe(
      `materials/hml/${stored.storageKey}`,
    );
    expect(request.mock.calls[0]![1]?.headers).toMatchObject({
      authorization: "Bearer adc-token",
    });

    const chunks: Buffer[] = [];
    for await (const chunk of await storage.open(stored.storageKey))
      chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe("cloud-content");
    await storage.delete(stored.storageKey);
    expect(request).toHaveBeenCalledTimes(3);
    expect(String(request.mock.calls[1]![0])).toContain("alt=media");
    expect(request.mock.calls[2]![1]?.method).toBe("DELETE");
  });

  it("attempts idempotent cleanup when an upload response fails", async () => {
    const request = vi.fn(
      async (
        _input: string | URL,
        init?: RequestInit & { duplex?: "half" },
      ) => {
        if (init?.method === "POST") {
          for await (const chunk of init.body as unknown as AsyncIterable<Uint8Array>)
            void chunk;
          return new Response("failed", { status: 500 });
        }
        return new Response(null, { status: 404 });
      },
    );
    const storage = new GcsMaterialStorage(
      "educai-private-test",
      "materials",
      {
        getAccessToken: vi.fn().mockResolvedValue("adc-token"),
      },
      request,
    );

    await expect(
      storage.store(professorId, Readable.from(Buffer.from("content"))),
    ).rejects.toThrow("GCS_UPLOAD_FAILED_500");
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]![1]?.method).toBe("DELETE");
  });
});
