import { describe, expect, it } from "vitest";

import { ConfigurationError, loadConfig } from "./config.js";

const validEnvironment = {
  NODE_ENV: "test",
  API_HOST: "127.0.0.1",
  API_PORT: "3000",
  DATABASE_URL: "postgresql://user:secret@localhost:5432/educai",
  WEB_ORIGIN: "http://localhost:5173",
  LOG_LEVEL: "silent",
  TOKEN_ENCRYPTION_KEY:
    "9f238e1d4c7a6b05d9e31074a2c8f61b3d0e7a95c4b1286f50d2a9e37c6148fb",
};

describe("loadConfig", () => {
  it("loads a valid environment", () => {
    expect(loadConfig(validEnvironment).apiPort).toBe(3000);
  });

  it("reports missing variables without exposing secret values", () => {
    const secret = "do-not-print-this-password";

    expect(() =>
      loadConfig({
        ...validEnvironment,
        DATABASE_URL: undefined,
        UNUSED_SECRET: secret,
      }),
    ).toThrowError(ConfigurationError);

    try {
      loadConfig({
        ...validEnvironment,
        DATABASE_URL: undefined,
        UNUSED_SECRET: secret,
      });
    } catch (error) {
      expect(String(error)).toContain("DATABASE_URL");
      expect(String(error)).not.toContain(secret);
    }
  });

  it("rejects an invalid port before the server starts", () => {
    expect(() =>
      loadConfig({ ...validEnvironment, API_PORT: "99999" }),
    ).toThrow("API_PORT");
  });

  it("requires Google client id and secret together", () => {
    expect(() =>
      loadConfig({ ...validEnvironment, GOOGLE_CLIENT_ID: "client-id" }),
    ).toThrow(/GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET/);
  });

  it("accepts absent Google credentials while keeping login disabled", () => {
    expect(loadConfig(validEnvironment).google.clientId).toBeUndefined();
  });
});
