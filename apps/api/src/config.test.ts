import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ConfigurationError,
  loadConfig,
  loadRootEnvironment,
} from "./config.js";

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
    expect(loadConfig(validEnvironment).feedbackEditWindowMinutes).toBe(1_440);
    expect(loadConfig(validEnvironment).materialStorageDirectory).toBe(
      "storage/materials",
    );
    expect(loadConfig(validEnvironment).materialUploadMaxBytes).toBe(
      104_857_600,
    );
    expect(loadConfig(validEnvironment).materialStorageBackend).toBe("local");
    expect(loadConfig(validEnvironment).materialStoragePrefix).toBe(
      "materials",
    );
    expect(loadConfig(validEnvironment).notificationWorkerIntervalMs).toBe(
      30_000,
    );
    expect(loadConfig(validEnvironment).notificationMaxAttempts).toBe(5);
    expect(loadConfig(validEnvironment).enableDevAuth).toBe(false);
    expect(loadConfig(validEnvironment).backgroundWorkersEnabled).toBe(true);
    expect(loadConfig(validEnvironment).rateLimitMax).toBe(300);
    expect(loadConfig(validEnvironment).dataRetentionDays).toBe(365);
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

  it("uses the Cloud Run PORT when API_PORT is absent", () => {
    expect(
      loadConfig({ ...validEnvironment, API_PORT: undefined, PORT: "8080" })
        .apiPort,
    ).toBe(8080);
  });

  it("can disable in-process workers for a scheduled production job", () => {
    expect(
      loadConfig({
        ...validEnvironment,
        BACKGROUND_WORKERS_ENABLED: "false",
      }).backgroundWorkersEnabled,
    ).toBe(false);
  });

  it("requires Google client id and secret together", () => {
    expect(() =>
      loadConfig({ ...validEnvironment, GOOGLE_CLIENT_ID: "client-id" }),
    ).toThrow(/GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET/);
  });

  it("accepts absent Google credentials while keeping login disabled", () => {
    expect(loadConfig(validEnvironment).google.clientId).toBeUndefined();
  });

  it("accepts absent OpenAI credentials without enabling external calls", () => {
    expect(loadConfig(validEnvironment).openai.apiKey).toBeUndefined();
  });

  it("requires the Resend key and sender together", () => {
    expect(() =>
      loadConfig({ ...validEnvironment, RESEND_API_KEY: "resend-secret" }),
    ).toThrow(/RESEND_API_KEY, EMAIL_FROM/);
    expect(
      loadConfig({
        ...validEnvironment,
        RESEND_API_KEY: "resend-secret",
        EMAIL_FROM: "EDUC.AI <boletins@example.test>",
      }).email,
    ).toEqual({
      resendApiKey: "resend-secret",
      from: "EDUC.AI <boletins@example.test>",
    });
  });

  it("requires a bucket only when the GCS material backend is selected", () => {
    expect(() =>
      loadConfig({ ...validEnvironment, MATERIAL_STORAGE_BACKEND: "gcs" }),
    ).toThrow("MATERIAL_STORAGE_BUCKET");
    expect(
      loadConfig({
        ...validEnvironment,
        MATERIAL_STORAGE_BACKEND: "gcs",
        MATERIAL_STORAGE_BUCKET: "educai-private-materials",
      }).materialStorageBucket,
    ).toBe("educai-private-materials");
    expect(() =>
      loadConfig({
        ...validEnvironment,
        MATERIAL_STORAGE_BACKEND: "gcs",
        MATERIAL_STORAGE_BUCKET: "INVALID/BUCKET",
      }),
    ).toThrow("MATERIAL_STORAGE_BUCKET");
  });

  it("rejects ephemeral material storage in production", () => {
    expect(() =>
      loadConfig({ ...validEnvironment, NODE_ENV: "production" }),
    ).toThrow("MATERIAL_STORAGE_BACKEND");
  });
});

describe("loadRootEnvironment", () => {
  it("replaces inherited values with the project file outside production", async () => {
    const directory = await mkdtemp(join(tmpdir(), "educai-env-"));
    const environmentPath = join(directory, ".env");
    await writeFile(environmentPath, "OPENAI_API_KEY=current-key\n", "utf8");
    const environment = {
      NODE_ENV: "test",
      OPENAI_API_KEY: "stale-inherited-key",
    };

    try {
      loadRootEnvironment(environment, environmentPath);
      expect(environment.OPENAI_API_KEY).toBe("current-key");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("preserves platform-injected values in production", async () => {
    const directory = await mkdtemp(join(tmpdir(), "educai-env-"));
    const environmentPath = join(directory, ".env");
    await writeFile(environmentPath, "OPENAI_API_KEY=file-key\n", "utf8");
    const environment = {
      NODE_ENV: "production",
      OPENAI_API_KEY: "platform-key",
    };

    try {
      loadRootEnvironment(environment, environmentPath);
      expect(environment.OPENAI_API_KEY).toBe("platform-key");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
