import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

export class TokenCipher {
  private readonly key: Buffer;

  constructor(hexKey: string) {
    this.key = Buffer.from(hexKey, "hex");
    if (this.key.length !== 32) {
      throw new Error("TOKEN_ENCRYPTION_KEY deve conter 32 bytes.");
    }
  }

  encrypt(value: string): string {
    const initializationVector = randomBytes(12);
    const cipher = createCipheriv(
      "aes-256-gcm",
      this.key,
      initializationVector,
    );
    const ciphertext = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    return [
      "v1",
      initializationVector.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      ciphertext.toString("base64url"),
    ].join(":");
  }

  decrypt(envelope: string): string {
    const [version, iv, tag, ciphertext] = envelope.split(":");
    if (version !== "v1" || !iv || !tag || !ciphertext) {
      throw new Error("Envelope de token inválido.");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }
}

export function createOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function createCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier, "utf8").digest("base64url");
}
