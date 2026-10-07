import { describe, expect, it } from "vitest";

import { ConfigurationError, loadConfig } from "./config.js";

const validEnvironment = {
  NODE_ENV: "test",
  API_HOST: "127.0.0.1",
  API_PORT: "3000",
  DATABASE_URL: "postgresql://user:secret@localhost:5432/educai",
  WEB_ORIGIN: "http://localhost:5173",
  LOG_LEVEL: "silent",
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
});
