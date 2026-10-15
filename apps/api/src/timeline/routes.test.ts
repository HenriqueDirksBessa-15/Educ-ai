import cookie from "@fastify/cookie";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthRepository } from "../auth/repository.js";
import type { AppConfig } from "../config.js";
import { registerTimelineRoutes } from "./routes.js";
import type { TimelineRepository } from "./repository.js";

const professorId = "5d73ea1d-9ab8-4384-960e-3a6f00e6328a";
const apps: ReturnType<typeof Fastify>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function build() {
  const app = Fastify({ logger: false });
  apps.push(app);
  await app.register(cookie);
  const authRepository = {
    resolveSession: vi.fn().mockResolvedValue({
      professorId,
      email: "professor@example.invalid",
      displayName: "Professor Teste",
      provider: "google",
    }),
  };
  const timelineRepository = {
    createMaterialLink: vi.fn().mockResolvedValue("material-id"),
    listMaterials: vi.fn().mockResolvedValue([]),
  };
  registerTimelineRoutes(app, {
    config: { nodeEnv: "test" } as AppConfig,
    authRepository: authRepository as unknown as AuthRepository,
    timelineRepository: timelineRepository as unknown as TimelineRepository,
  });
  return { app, timelineRepository };
}

describe("material link routes", () => {
  it("creates a validated link for the session professor", async () => {
    const { app, timelineRepository } = await build();
    const payload = {
      title: "Guia",
      category: "reading",
      classIds: ["11111111-1111-4111-8111-111111111111"],
      bnccSkillIds: [],
      url: "https://example.invalid/guia",
    };

    const response = await app.inject({
      method: "POST",
      url: "/api/materials/links",
      headers: {
        cookie: "educai_session=session-token",
        "content-type": "application/json",
      },
      payload: {
        ...payload,
        professorId: "attacker",
        storageKey: "private/key",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(timelineRepository.createMaterialLink).not.toHaveBeenCalled();

    const accepted = await app.inject({
      method: "POST",
      url: "/api/materials/links",
      headers: {
        cookie: "educai_session=session-token",
        "content-type": "application/json",
      },
      payload,
    });
    expect(accepted.statusCode).toBe(201);
    expect(timelineRepository.createMaterialLink).toHaveBeenCalledWith(
      professorId,
      payload,
    );
  }, 15_000);
});
