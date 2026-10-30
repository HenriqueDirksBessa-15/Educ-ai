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
    remove: vi.fn(),
    removeEnrollment: vi.fn(),
    setEnrollmentStatus: vi.fn(),
    previewStudentImport: vi.fn(),
    importStudents: vi.fn(),
    enrollStudent: vi.fn(),
    joinByCode: vi.fn(),
    setEmailDomain: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
  };
  const classroomAdapter = {
    isFixture: false,
    listCourses: vi.fn(),
    ensureCourse: vi.fn(),
    listStudents: vi.fn(),
  };
  return { authRepository, classesRepository, classroomAdapter };
}

async function build(
  input: ReturnType<typeof dependencies>,
  overrides: Partial<AppConfig> = {},
) {
  const app = Fastify({ logger: false });
  apps.push(app);
  await app.register(cookie);
  registerClassesRoutes(app, {
    config: { ...config, ...overrides },
    authRepository: input.authRepository as unknown as AuthRepository,
    classesRepository: input.classesRepository as unknown as ClassesRepository,
    classroomAdapter: input.classroomAdapter as ClassroomAdapter,
  });
  return app;
}

describe("class and student removal routes", () => {
  const classId = "8b7f2c1e-5d4a-4f3b-9c2d-1e0f9a8b7c6d";
  const studentId = "7a6b5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d";
  const headers = { cookie: "educai_session=session-token" };

  it("refuses to delete a class with content and points to archiving", async () => {
    const input = dependencies(null);
    input.classesRepository.remove.mockResolvedValue("has_content");
    const app = await build(input);

    const response = await app.inject({
      method: "DELETE",
      url: `/api/classes/${classId}`,
      headers,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.message).toContain("Arquive a turma");
    expect(input.classesRepository.remove).toHaveBeenCalledWith(
      professorId,
      classId,
    );
  });

  it("reports when a Google class only lost its local link", async () => {
    const input = dependencies(null);
    input.classesRepository.remove.mockResolvedValue("unlinked");
    const app = await build(input);

    const response = await app.inject({
      method: "DELETE",
      url: `/api/classes/${classId}`,
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { status: "unlinked" } });
  });

  it("blocks removing a Google student and removes a manual one", async () => {
    const input = dependencies(null);
    input.classesRepository.removeEnrollment
      .mockResolvedValueOnce("google")
      .mockResolvedValueOnce("removed");
    const app = await build(input);
    const url = `/api/classes/${classId}/students/${studentId}`;

    const blocked = await app.inject({ method: "DELETE", url, headers });
    const removed = await app.inject({ method: "DELETE", url, headers });

    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.message).toContain("marque-o como restrito");
    expect(removed.statusCode).toBe(204);
  });

  it("only accepts active or restricted as a new enrollment status", async () => {
    const input = dependencies(null);
    input.classesRepository.setEnrollmentStatus.mockResolvedValue(true);
    const app = await build(input);
    const url = `/api/classes/${classId}/students/${studentId}`;

    const invalid = await app.inject({
      method: "PATCH",
      url,
      headers,
      payload: { status: "pending" },
    });
    const restricted = await app.inject({
      method: "PATCH",
      url,
      headers,
      payload: { status: "restricted" },
    });

    expect(invalid.statusCode).toBe(400);
    expect(restricted.statusCode).toBe(200);
    expect(input.classesRepository.setEnrollmentStatus).toHaveBeenCalledWith(
      professorId,
      classId,
      studentId,
      "restricted",
    );
  });
});

describe("class search route", () => {
  const headers = { cookie: "educai_session=session-token" };

  it("passes search and filters to the repository and rejects unknown status", async () => {
    const input = dependencies(null);
    const app = await build(input);

    const filtered = await app.inject({
      method: "GET",
      url: "/api/classes?q=%207%C2%BA%20&status=all&component=Matem%C3%A1tica&schoolYear=ef-ano-07",
      headers,
    });
    const legacy = await app.inject({
      method: "GET",
      url: "/api/classes?archived=true",
      headers,
    });
    const invalid = await app.inject({
      method: "GET",
      url: "/api/classes?status=deleted",
      headers,
    });

    expect(filtered.statusCode).toBe(200);
    expect(legacy.statusCode).toBe(200);
    expect(input.classesRepository.list).toHaveBeenNthCalledWith(
      1,
      professorId,
      {
        q: "7º",
        status: "all",
        component: "Matemática",
        schoolYear: "ef-ano-07",
      },
    );
    expect(input.classesRepository.list).toHaveBeenNthCalledWith(
      2,
      professorId,
      {
        q: undefined,
        status: "archived",
      },
    );
    expect(invalid.statusCode).toBe(400);
  });
});

describe("join by access code", () => {
  it("lets a student join without a session and reports the result", async () => {
    const input = dependencies(null);
    input.classesRepository.joinByCode
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ status: "pending", className: "7º A" });
    const app = await build(input, { enablePublicJoin: true });
    const payload = {
      code: "TURMA-1234",
      name: "Caio",
      email: "caio@gmail.com",
      privacyAccepted: true,
    };

    const unknown = await app.inject({
      method: "POST",
      url: "/api/join",
      payload,
    });
    const joined = await app.inject({
      method: "POST",
      url: "/api/join",
      payload,
    });

    const withoutConsent = await app.inject({
      method: "POST",
      url: "/api/join",
      payload: { ...payload, privacyAccepted: false },
    });

    expect(withoutConsent.statusCode).toBe(400);
    expect(unknown.statusCode).toBe(404);
    expect(joined.statusCode).toBe(201);
    expect(joined.json()).toEqual({
      data: { status: "pending", className: "7º A" },
    });
    expect(input.authRepository.resolveSession).not.toHaveBeenCalled();
  });

  it("does not exist while the public join is switched off", async () => {
    const input = dependencies(null);
    const app = await build(input);

    const response = await app.inject({
      method: "POST",
      url: "/api/join",
      payload: { code: "TURMA-1234", name: "Caio", email: "caio@gmail.com" },
    });

    expect(response.statusCode).toBe(404);
    expect(input.classesRepository.joinByCode).not.toHaveBeenCalled();
  });

  it("accepts only a bare domain for the class", async () => {
    const input = dependencies(null);
    input.classesRepository.setEmailDomain.mockResolvedValue(true);
    const app = await build(input);
    const url =
      "/api/classes/8b7f2c1e-5d4a-4f3b-9c2d-1e0f9a8b7c6d/email-domain";
    const headers = { cookie: "educai_session=session-token" };

    const invalid = await app.inject({
      method: "PUT",
      url,
      headers,
      payload: { domain: "@escola" },
    });
    const valid = await app.inject({
      method: "PUT",
      url,
      headers,
      payload: { domain: " Escola.EDU.br ", autoAccept: true },
    });

    expect(invalid.statusCode).toBe(400);
    expect(valid.statusCode).toBe(200);
    expect(input.classesRepository.setEmailDomain).toHaveBeenCalledWith(
      professorId,
      "8b7f2c1e-5d4a-4f3b-9c2d-1e0f9a8b7c6d",
      "escola.edu.br",
      true,
    );
  });
});

describe("manual enrollment route", () => {
  const classId = "8b7f2c1e-5d4a-4f3b-9c2d-1e0f9a8b7c6d";
  const headers = { cookie: "educai_session=session-token" };
  const enroll = (app: Awaited<ReturnType<typeof build>>, payload: unknown) =>
    app.inject({
      method: "POST",
      url: `/api/classes/${classId}/students`,
      headers,
      payload,
    });

  it("answers 409 with a warning for a repeated enrollment", async () => {
    const input = dependencies(null);
    input.classesRepository.enrollStudent
      .mockResolvedValueOnce({ existing: "active" })
      .mockResolvedValueOnce({ existing: "restricted" });
    const app = await build(input);
    const payload = {
      name: "Ana",
      email: "ana@example.invalid",
      origin: "spreadsheet",
    };

    const active = await enroll(app, payload);
    const restricted = await enroll(app, payload);

    expect(active.statusCode).toBe(409);
    expect(active.json().error.message).toBe(
      "Este aluno já está matriculado nesta turma.",
    );
    expect(restricted.statusCode).toBe(409);
    expect(restricted.json().error.message).toContain("continua restrito");
  });

  it("needs an email or a registration number", async () => {
    const input = dependencies(null);
    input.classesRepository.enrollStudent.mockResolvedValue("enrolled");
    const app = await build(input);

    const missing = await enroll(app, { name: "Ana", origin: "spreadsheet" });
    const byRegistration = await enroll(app, {
      name: "Ana",
      registrationNumber: "2026001",
      origin: "spreadsheet",
    });

    expect(missing.statusCode).toBe(400);
    expect(byRegistration.statusCode).toBe(201);
  });
});

describe("student import routes", () => {
  const classId = "8b7f2c1e-5d4a-4f3b-9c2d-1e0f9a8b7c6d";
  const headers = { cookie: "educai_session=session-token" };

  it("explains a sheet without the required columns before touching the database", async () => {
    const input = dependencies(null);
    const app = await build(input);

    const response = await app.inject({
      method: "POST",
      url: `/api/classes/${classId}/students/import/preview`,
      headers,
      payload: { csv: "nome,email\nAna,ana@example.invalid" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toContain("nome e matricula");
    expect(input.classesRepository.previewStudentImport).not.toHaveBeenCalled();
  });

  it("returns the preview without the internal student ids", async () => {
    const input = dependencies(null);
    input.classesRepository.previewStudentImport.mockResolvedValue({
      rows: [
        {
          line: 2,
          name: "Ana",
          registrationNumber: "1",
          email: null,
          status: "new",
          errors: [],
        },
      ],
      canImport: true,
      studentIds: [null],
    });
    const app = await build(input);

    const response = await app.inject({
      method: "POST",
      url: `/api/classes/${classId}/students/import/preview`,
      headers,
      payload: { csv: "nome,matricula\nAna,1" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      rows: [expect.objectContaining({ status: "new" })],
      canImport: true,
    });
    expect(input.classesRepository.previewStudentImport).toHaveBeenCalledWith(
      professorId,
      classId,
      [expect.objectContaining({ name: "Ana", registrationNumber: "1" })],
    );
  });

  it("refuses to import while a line still has an error", async () => {
    const input = dependencies(null);
    input.classesRepository.importStudents.mockResolvedValue({
      status: "invalid",
      preview: { rows: [], canImport: false },
    });
    const app = await build(input);

    const response = await app.inject({
      method: "POST",
      url: `/api/classes/${classId}/students/import/confirm`,
      headers,
      payload: { csv: "nome,matricula\n,1" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toBe(
      "Corrija as linhas com erro antes de importar.",
    );
  });
});

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
  }, 15_000);

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
