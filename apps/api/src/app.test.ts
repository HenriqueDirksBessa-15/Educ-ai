import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "./app.js";
import type { AppConfig } from "./config.js";

const config: AppConfig = {
  nodeEnv: "test",
  apiHost: "127.0.0.1",
  apiPort: 3000,
  databaseUrl: "postgresql://user:secret@localhost:5432/educai",
  webOrigin: "http://localhost:5173",
  logLevel: "silent",
  shutdownTimeoutMs: 10_000,
  google: {
    redirectUri: "http://localhost:3000/api/auth/google/callback",
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5-mini",
  },
  tokenEncryptionKey:
    "9f238e1d4c7a6b05d9e31074a2c8f61b3d0e7a95c4b1286f50d2a9e37c6148fb",
  sessionTtlSeconds: 28_800,
  integrationMonitorIntervalMs: 300_000,
  feedbackEditWindowMinutes: 1_440,
};

const apps: Awaited<ReturnType<typeof createApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("technical health endpoints", () => {
  it("reports the process alive independently of the database", async () => {
    const app = await createApp({
      config,
      database: {
        query: vi.fn().mockRejectedValue(new Error("connection refused")),
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/health/live",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "alive",
      service: "educai-api",
    });
  }, 15_000);

  it("reports readiness when PostgreSQL responds", async () => {
    const app = await createApp({
      config,
      database: {
        query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/health/ready",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ready",
      database: "available",
    });
  });

  it("distinguishes a running API from an unavailable database", async () => {
    const app = await createApp({
      config,
      database: {
        query: vi.fn().mockRejectedValue(new Error("secret connection detail")),
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/health/ready",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual(
      expect.objectContaining({ status: "not_ready", database: "unavailable" }),
    );
    expect(response.body).not.toContain("secret connection detail");
  });
});

describe("authentication boundary", () => {
  it("protects lesson plans with the Google session", async () => {
    const app = await createApp({
      config,
      database: { query: vi.fn() },
    });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/lesson-plans",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: "UNAUTHENTICATED" },
    });
  });

  it("protects activities with the Google session", async () => {
    const app = await createApp({
      config,
      database: { query: vi.fn() },
    });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/activities?status=draft",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: "UNAUTHENTICATED" },
    });
  });

  it("protects feedbacks with the Google session", async () => {
    const app = await createApp({
      config,
      database: { query: vi.fn() },
    });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/feedbacks" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: "UNAUTHENTICATED" },
    });
  });

  it("keeps Google login unavailable when credentials are absent", async () => {
    const app = await createApp({
      config,
      database: { query: vi.fn() },
    });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/google/start",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: { code: "INTEGRATION_UNAVAILABLE" },
    });
  });

  it("rejects a protected route even when professorId is sent by the client", async () => {
    const app = await createApp({
      config,
      database: { query: vi.fn() },
    });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/professor/shell?professorId=5d73ea1d-9ab8-4384-960e-3a6f00e6328a",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: "UNAUTHENTICATED" },
    });
  });
});
