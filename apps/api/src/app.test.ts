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
  });

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
