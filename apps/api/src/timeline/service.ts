import { extname } from "node:path";
import type { Readable } from "node:stream";
import { finished } from "node:stream/promises";

import type { MaterialFileMetadata } from "@educai/contracts";

import type { TimelineRepository } from "./repository.js";
import type { MaterialStorage } from "./storage.js";

const allowedFiles = new Map<string, readonly string[]>([
  [".pdf", ["application/pdf"]],
  [
    ".docx",
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ],
  [".ppt", ["application/vnd.ms-powerpoint"]],
  [
    ".pptx",
    [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
  ],
  [".mp4", ["video/mp4"]],
  [".jpg", ["image/jpeg"]],
  [".jpeg", ["image/jpeg"]],
  [".png", ["image/png"]],
  [".gif", ["image/gif"]],
  [".webp", ["image/webp"]],
]);

export class MaterialUploadError extends Error {
  constructor(
    readonly code:
      | "MATERIAL_FILE_INVALID"
      | "MATERIAL_FILE_TOO_LARGE"
      | "MATERIAL_RELATION_NOT_FOUND",
  ) {
    super(code);
    this.name = "MaterialUploadError";
  }
}

export class MaterialService {
  constructor(
    private readonly repository: TimelineRepository,
    private readonly storage: MaterialStorage,
  ) {}

  async upload(input: {
    professorId: string;
    metadata: MaterialFileMetadata;
    fileName: string;
    mimeType: string;
    stream: Readable;
    wasTruncated: () => boolean;
  }): Promise<string> {
    let fileName: string;
    try {
      fileName = normalizeFileName(input.fileName);
    } catch (error) {
      input.stream.resume();
      await finished(input.stream);
      throw error;
    }
    if (!isAllowedFile(fileName, input.mimeType)) {
      input.stream.resume();
      await finished(input.stream);
      throw new MaterialUploadError("MATERIAL_FILE_INVALID");
    }

    const stored = await this.storage.store(input.professorId, input.stream);
    if (input.wasTruncated()) {
      await this.storage.delete(stored.storageKey);
      throw new MaterialUploadError("MATERIAL_FILE_TOO_LARGE");
    }
    if (!hasAllowedSignature(input.mimeType, stored.head)) {
      await this.storage.delete(stored.storageKey);
      throw new MaterialUploadError("MATERIAL_FILE_INVALID");
    }

    try {
      return await this.repository.createMaterialFile(input.professorId, {
        ...input.metadata,
        fileName,
        mimeType: input.mimeType,
        sizeBytes: stored.sizeBytes,
        storageKey: stored.storageKey,
      });
    } catch (error) {
      await this.storage.delete(stored.storageKey);
      if (
        error instanceof Error &&
        error.message === "MATERIAL_RELATION_NOT_FOUND"
      )
        throw new MaterialUploadError("MATERIAL_RELATION_NOT_FOUND");
      throw error;
    }
  }

  async download(professorId: string, materialId: string) {
    const material = await this.repository.getMaterialFile(
      professorId,
      materialId,
    );
    if (!material) return null;
    return {
      ...material,
      stream: await this.storage.open(material.storageKey),
    };
  }

  async delete(professorId: string, materialId: string) {
    const result = await this.repository.deleteMaterial(
      professorId,
      materialId,
    );
    if (result.status === "deleted" && result.storageKey)
      await this.storage.delete(result.storageKey);
    return result.status;
  }
}

function normalizeFileName(value: string): string {
  const fileName = value.replaceAll("\\", "/").split("/").at(-1)?.trim() ?? "";
  if (
    !fileName ||
    fileName.length > 255 ||
    [...fileName].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  )
    throw new MaterialUploadError("MATERIAL_FILE_INVALID");
  return fileName;
}

function isAllowedFile(fileName: string, mimeType: string): boolean {
  const extension = extname(fileName).toLowerCase();
  return allowedFiles.get(extension)?.includes(mimeType.toLowerCase()) ?? false;
}

function hasAllowedSignature(mimeType: string, head: Buffer): boolean {
  const ascii = head.toString("ascii");
  switch (mimeType.toLowerCase()) {
    case "application/pdf":
      return ascii.startsWith("%PDF-");
    case "image/jpeg":
      return head.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    case "image/png":
      return head
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "image/gif":
      return ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a");
    case "image/webp":
      return ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP";
    case "video/mp4":
      return ascii.slice(4, 8) === "ftyp";
    case "application/vnd.ms-powerpoint":
      return head
        .subarray(0, 8)
        .equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return head.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    default:
      return false;
  }
}
