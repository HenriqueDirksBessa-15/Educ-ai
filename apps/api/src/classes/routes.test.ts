import cookie from "@fastify/cookie";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthRepository } from "../auth/repository.js";
import { GOOGLE_CLASSROOM_SYNC_SCOPES } from "../auth/google-gateway.js";
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
  const classesRepository = {
    syncGoogleCourses: vi.fn(),
    getGoogleCourseContext: vi.fn(),
    linkGoogleCourse: vi.fn(),
    getGoogleClassroomId: vi.fn(),
    syncGoogleStudents: vi.fn(),
    setCurriculumProfile: vi.fn(),
  };
  const classroomAdapter = {
    isFixture: false,
    listCourses: vi.fn(),
    ensureCourse: vi.fn(),
    listStudents: vi.fn(),
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

  it("publishes an owned local class and persists the remote id", async () => {
    const input = dependencies({
      refreshToken: "refresh",
      scopes: GOOGLE_CLASSROOM_SYNC_SCOPES,
    });
    input.classesRepository.getGoogleCourseContext.mockResolvedValue({
      id: "class-id",
      name: "Matemática",
      description: null,
      source: "local",
      googleClassroomId: null,
    });
    input.classroomAdapter.ensureCourse.mockResolvedValue({
      googleClassroomId: "course-id",
      credential: { accessToken: "renewed" },
    });
    input.classesRepository.linkGoogleCourse.mockResolvedValue(true);
    const app = await build(input);

    const response = await app.inject({
      method: "POST",
      url: "/api/classes/class-id/google",
      headers: { cookie: "educai_session=session-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(input.classesRepository.linkGoogleCourse).toHaveBeenCalledWith(
      professorId,
      "class-id",
      "course-id",
    );
    expect(input.authRepository.saveCredential).toHaveBeenCalled();
  });

  it("does not request a roster for a local-only class", async () => {
    const input = dependencies({
      refreshToken: "refresh",
      scopes: GOOGLE_CLASSROOM_SYNC_SCOPES,
    });
    input.classesRepository.getGoogleClassroomId.mockResolvedValue(null);
    const app = await build(input);

    const response = await app.inject({
      method: "POST",
      url: "/api/classes/class-id/students/sync",
      headers: { cookie: "educai_session=session-token" },
    });

    expect(response.statusCode).toBe(409);
    expect(input.classroomAdapter.listStudents).not.toHaveBeenCalled();
  });

  it("persists a roster returned for an owned Google class", async () => {
    const input = dependencies({
      refreshToken: "refresh",
      scopes: GOOGLE_CLASSROOM_SYNC_SCOPES,
    });
    input.classesRepository.getGoogleClassroomId.mockResolvedValue("course-id");
    input.classroomAdapter.listStudents.mockResolvedValue({
      students: [
        {
          googleSubject: "student-id",
          name: "Aluno Teste",
          email: "aluno@example.invalid",
        },
      ],
      credential: { accessToken: "renewed" },
    });
    input.classesRepository.syncGoogleStudents.mockResolvedValue(1);
    const app = await build(input);

    const response = await app.inject({
      method: "POST",
      url: "/api/classes/class-id/students/sync",
      headers: { cookie: "educai_session=session-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { synchronized: 1 } });
    expect(input.classesRepository.syncGoogleStudents).toHaveBeenCalledWith(
      professorId,
      "class-id",
      expect.arrayContaining([
        expect.objectContaining({ googleSubject: "student-id" }),
      ]),
    );
  });

  it("rejects duplicated curricular components before persistence", async () => {
    const input = dependencies(null);
    const app = await build(input);

    const response = await app.inject({
      method: "PUT",
      url: "/api/classes/class-id/curriculum",
      headers: {
        cookie: "educai_session=session-token",
        "content-type": "application/json",
      },
      payload: {
        educationStage: "elementary_2",
        schoolYear: "8º ano EF",
        curricularComponents: ["Matemática", "Matemática"],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(input.classesRepository.setCurriculumProfile).not.toHaveBeenCalled();
  });
});
