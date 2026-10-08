import { describe, expect, it } from "vitest";

import { hashToken, TokenCipher } from "./crypto.js";

const key = "9f238e1d4c7a6b05d9e31074a2c8f61b3d0e7a95c4b1286f50d2a9e37c6148fb";

describe("token protection", () => {
  it("encrypts without storing plaintext and decrypts the envelope", () => {
    const cipher = new TokenCipher(key);
    const encrypted = cipher.encrypt("refresh-token-sensitive");

    expect(encrypted).not.toContain("refresh-token-sensitive");
    expect(cipher.decrypt(encrypted)).toBe("refresh-token-sensitive");
  });

  it("hashes opaque session tokens deterministically", () => {
    expect(hashToken("session")).toEqual(hashToken("session"));
    expect(hashToken("session")).not.toEqual(hashToken("another-session"));
  });
});
