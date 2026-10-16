import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, type ReadStream } from "node:fs";
import { access, mkdir, rename, rm } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { findRepositoryRoot } from "../db/paths.js";

export interface MaterialStorage {
  store(
    professorId: string,
    source: Readable,
  ): Promise<{
    storageKey: string;
    sizeBytes: number;
    head: Buffer;
  }>;
  open(storageKey: string): Promise<Readable>;
  delete(storageKey: string): Promise<void>;
}

export class LocalMaterialStorage implements MaterialStorage {
  private readonly root: string;

  constructor(directory: string) {
    this.root = resolve(
      isAbsolute(directory) ? directory : join(findRepositoryRoot(), directory),
    );
  }

  async store(
    professorId: string,
    source: Readable,
  ): Promise<{ storageKey: string; sizeBytes: number; head: Buffer }> {
    const storageKey = `${professorId}/${randomUUID()}`;
    const target = this.resolveKey(storageKey);
    const temporary = `${target}.uploading`;
    await mkdir(join(this.root, professorId), { recursive: true });
    let sizeBytes = 0;
    let head = Buffer.alloc(0);
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        sizeBytes += chunk.length;
        if (head.length < 16)
          head = Buffer.concat([head, chunk]).subarray(0, 16);
        callback(null, chunk);
      },
    });

    try {
      await pipeline(
        source,
        counter,
        createWriteStream(temporary, { flags: "wx" }),
      );
      await rename(temporary, target);
      return { storageKey, sizeBytes, head };
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async open(storageKey: string): Promise<ReadStream> {
    const target = this.resolveKey(storageKey);
    await access(target);
    return createReadStream(target);
  }

  async delete(storageKey: string): Promise<void> {
    await rm(this.resolveKey(storageKey), { force: true });
  }

  private resolveKey(storageKey: string): string {
    if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}$/i.test(storageKey))
      throw new Error("MATERIAL_STORAGE_KEY_INVALID");
    const target = resolve(this.root, ...storageKey.split("/"));
    if (!target.startsWith(`${this.root}${sep}`))
      throw new Error("MATERIAL_STORAGE_KEY_INVALID");
    return target;
  }
}
