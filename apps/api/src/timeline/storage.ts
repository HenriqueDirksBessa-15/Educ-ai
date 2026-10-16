import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, type ReadStream } from "node:fs";
import { access, mkdir, rename, rm } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { GoogleAuth } from "google-auth-library";

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

export interface GoogleCloudTokenProvider {
  getAccessToken(): Promise<string>;
}

type StorageFetch = (
  input: string | URL,
  init?: RequestInit & { duplex?: "half" },
) => Promise<Response>;

export class ApplicationDefaultTokenProvider
  implements GoogleCloudTokenProvider
{
  private readonly auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/devstorage.read_write"],
  });

  async getAccessToken(): Promise<string> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error("GCS_CREDENTIAL_UNAVAILABLE");
    return token;
  }
}

export class GcsMaterialStorage implements MaterialStorage {
  private readonly prefix: string;

  constructor(
    private readonly bucket: string,
    prefix: string,
    private readonly tokenProvider: GoogleCloudTokenProvider = new ApplicationDefaultTokenProvider(),
    private readonly request: StorageFetch = fetch,
  ) {
    if (!bucket.trim()) throw new Error("GCS_BUCKET_REQUIRED");
    this.prefix = prefix.replace(/^\/+|\/+$/g, "");
  }

  async store(
    professorId: string,
    source: Readable,
  ): Promise<{ storageKey: string; sizeBytes: number; head: Buffer }> {
    const storageKey = `${professorId}/${randomUUID()}`;
    validateStorageKey(storageKey);
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
    const body = source.pipe(counter);

    try {
      const token = await this.tokenProvider.getAccessToken();
      const response = await this.request(this.uploadUrl(storageKey), {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/octet-stream",
        },
        body: body as unknown as BodyInit,
        duplex: "half",
      });
      if (!response.ok) {
        await response.arrayBuffer();
        throw new Error(`GCS_UPLOAD_FAILED_${response.status}`);
      }
      await response.arrayBuffer();
      return { storageKey, sizeBytes, head };
    } catch (error) {
      source.destroy();
      counter.destroy();
      await this.deleteAfterFailedUpload(storageKey);
      throw error;
    }
  }

  async open(storageKey: string): Promise<Readable> {
    validateStorageKey(storageKey);
    const token = await this.tokenProvider.getAccessToken();
    const response = await this.request(this.objectUrl(storageKey, true), {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok || !response.body) {
      await response.arrayBuffer();
      throw new Error(`GCS_DOWNLOAD_FAILED_${response.status}`);
    }
    return Readable.fromWeb(response.body as WebReadableStream<Uint8Array>);
  }

  async delete(storageKey: string): Promise<void> {
    validateStorageKey(storageKey);
    const token = await this.tokenProvider.getAccessToken();
    const response = await this.request(this.objectUrl(storageKey), {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok && response.status !== 404)
      throw new Error(`GCS_DELETE_FAILED_${response.status}`);
  }

  private uploadUrl(storageKey: string): string {
    const url = new URL(
      `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(this.bucket)}/o`,
    );
    url.searchParams.set("uploadType", "media");
    url.searchParams.set("name", this.objectName(storageKey));
    url.searchParams.set("ifGenerationMatch", "0");
    return url.toString();
  }

  private objectUrl(storageKey: string, download = false): string {
    const endpoint = download ? "download/storage/v1" : "storage/v1";
    const name = encodeURIComponent(this.objectName(storageKey));
    const url = new URL(
      `https://storage.googleapis.com/${endpoint}/b/${encodeURIComponent(this.bucket)}/o/${name}`,
    );
    if (download) url.searchParams.set("alt", "media");
    return url.toString();
  }

  private objectName(storageKey: string): string {
    return this.prefix ? `${this.prefix}/${storageKey}` : storageKey;
  }

  private async deleteAfterFailedUpload(storageKey: string): Promise<void> {
    try {
      await this.delete(storageKey);
    } catch {
      // Preserve the upload failure. Bucket lifecycle is the final cleanup
      // boundary if a network loss leaves the outcome ambiguous.
    }
  }
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
    validateStorageKey(storageKey);
    const target = resolve(this.root, ...storageKey.split("/"));
    if (!target.startsWith(`${this.root}${sep}`))
      throw new Error("MATERIAL_STORAGE_KEY_INVALID");
    return target;
  }
}

function validateStorageKey(storageKey: string): void {
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}$/i.test(storageKey))
    throw new Error("MATERIAL_STORAGE_KEY_INVALID");
}
