import cookie from "@fastify/cookie";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthRepository } from "../auth/repository.js";
import type { ClassroomAdapter } from "../classroom/adapter.js";
import type { AppConfig } from "../config.js";
import { registerClassesRoutes } from "./routes.js";
import type { ClassesRepository } from "./repository.js";

const professorId = "5d73ea1d-9ab8-4384-960e-3a6f00e6328a";
const config = {
  nodeEnv: "test",
} as AppConfig;
const apps: ReturnType<typeof Fastify>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function dependencies(credential: unknown) {
  const authRepository = {
    resolveSession: vi.fn().mockResolvedValue({
      professorId,
      email: "professor@example.invalid",
      displayName: "Professor Teste",
      provider: "google",
    }),
    getCredential: vi.fn().mockResolvedValue(credential),
    saveCredential: vi.fn(),
  };
  const classesRepository = { syncGoogleCourses: vi.fn() };
  const classroomAdapter = {
    isFixture: false,
    listCourses: vi.fn(),
  };
  return { authRepository, classesRepository, classroomAdapter };
}

async function build(input: ReturnType<typeof dependencies>) {
  const app = Fastify({ logger: false });
  apps.push(app);
  await app.register(cookie);
  registerClassesRoutes(app, {
    config,
    authRepository: input.authRepository as unknown as AuthRepository,
    classesRepository: input.classesRepository as unknown as ClassesRepository,
    classroomAdapter: input.classroomAdapter as ClassroomAdapter,
  });
  return app;
}

describe("Classroom synchronization route", () => {
  it("does not call Classroom without a professor credential", async () => {
    const input = dependencies(null);
    const app = await build(input);

    const response = await app.inject({
      method: "POST",
      url: "/api/classes/sync",
      headers: { cookie: "educai_session=session-token" },
    });

    expect(response.statusCode).toBe(503);
    expect(input.classroomAdapter.listCourses).not.toHaveBeenCalled();
  });

  it("requires renewed consent for the Classroom synchronization scopes", async () => {
    const input = dependencies({ refreshToken: "refresh", scopes: [] });
    const app = await build(input);

    const response = await app.inject({
      method: "POST",
      url: "/api/classes/sync",
      headers: { cookie: "educai_session=session-token" },
    });

    expect(response.statusCode).toBe(503);
    expect(response.body).toContain("Autorize novamente");
    expect(input.classroomAdapter.listCourses).not.toHaveBeenCalled();
  });
});
