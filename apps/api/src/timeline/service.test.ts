import { Readable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import type { TimelineRepository } from "./repository.js";
import { MaterialService } from "./service.js";
import type { MaterialUploadError } from "./service.js";
import type { MaterialStorage } from "./storage.js";

const professorId = "5d73ea1d-9ab8-4384-960e-3a6f00e6328a";
const metadata = {
  title: "Guia",
  category: "reading" as const,
  classIds: ["11111111-1111-4111-8111-111111111111"],
  bnccSkillIds: [],
};

describe("private material service", () => {
  it("removes the stored object when persistence rejects a relation", async () => {
    const repository = {
      createMaterialFile: vi
        .fn()
        .mockRejectedValue(new Error("MATERIAL_RELATION_NOT_FOUND")),
    };
    const storage = {
      store: vi.fn().mockResolvedValue({
        storageKey: `${professorId}/11111111-1111-4111-8111-111111111111`,
        sizeBytes: 4,
        head: Buffer.from("%PDF-"),
      }),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const service = new MaterialService(
      repository as unknown as TimelineRepository,
      storage as unknown as MaterialStorage,
    );

    await expect(
      service.upload({
        professorId,
        metadata,
        fileName: "guia.pdf",
        mimeType: "application/pdf",
        stream: Readable.from(Buffer.from("%PDF")),
        wasTruncated: () => false,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<MaterialUploadError>>({
        code: "MATERIAL_RELATION_NOT_FOUND",
      }),
    );
    expect(storage.delete).toHaveBeenCalledTimes(1);
  });

  it("rejects executable or mismatched file types before storage", async () => {
    const storage = { store: vi.fn() };
    const service = new MaterialService(
      {} as TimelineRepository,
      storage as unknown as MaterialStorage,
    );

    await expect(
      service.upload({
        professorId,
        metadata,
        fileName: "atividade.pdf.exe",
        mimeType: "application/pdf",
        stream: Readable.from(Buffer.from("unsafe")),
        wasTruncated: () => false,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<MaterialUploadError>>({
        code: "MATERIAL_FILE_INVALID",
      }),
    );
    expect(storage.store).not.toHaveBeenCalled();
  });

  it("deletes a truncated upload instead of persisting it", async () => {
    const repository = { createMaterialFile: vi.fn() };
    const storage = {
      store: vi.fn().mockResolvedValue({
        storageKey: `${professorId}/11111111-1111-4111-8111-111111111111`,
        sizeBytes: 100,
        head: Buffer.from("%PDF-"),
      }),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const service = new MaterialService(
      repository as unknown as TimelineRepository,
      storage as unknown as MaterialStorage,
    );

    await expect(
      service.upload({
        professorId,
        metadata,
        fileName: "guia.pdf",
        mimeType: "application/pdf",
        stream: Readable.from(Buffer.from("truncated")),
        wasTruncated: () => true,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<MaterialUploadError>>({
        code: "MATERIAL_FILE_TOO_LARGE",
      }),
    );
    expect(storage.delete).toHaveBeenCalledTimes(1);
    expect(repository.createMaterialFile).not.toHaveBeenCalled();
  });

  it("deletes content whose signature does not match its declared type", async () => {
    const repository = { createMaterialFile: vi.fn() };
    const storage = {
      store: vi.fn().mockResolvedValue({
        storageKey: `${professorId}/11111111-1111-4111-8111-111111111111`,
        sizeBytes: 8,
        head: Buffer.from("MZunsafe"),
      }),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const service = new MaterialService(
      repository as unknown as TimelineRepository,
      storage as unknown as MaterialStorage,
    );

    await expect(
      service.upload({
        professorId,
        metadata,
        fileName: "guia.pdf",
        mimeType: "application/pdf",
        stream: Readable.from(Buffer.from("MZunsafe")),
        wasTruncated: () => false,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<MaterialUploadError>>({
        code: "MATERIAL_FILE_INVALID",
      }),
    );
    expect(storage.delete).toHaveBeenCalledTimes(1);
    expect(repository.createMaterialFile).not.toHaveBeenCalled();
  });
});
