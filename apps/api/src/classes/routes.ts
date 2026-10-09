import {
  classCreateSchema,
  classUpdateSchema,
  studentEnrollmentInputSchema,
} from "@educai/contracts";
import type { FastifyInstance } from "fastify";

import type { AppConfig } from "../config.js";
import { requireIdentity, sessionCookieName } from "../auth/routes.js";
import type { AuthRepository } from "../auth/repository.js";
import type { ClassesRepository } from "./repository.js";
import type { ClassroomAdapter } from "../classroom/adapter.js";

export function registerClassesRoutes(
  app: FastifyInstance,
  dependencies: {
    config: AppConfig;
    authRepository: AuthRepository;
    classesRepository: ClassesRepository;
    classroomAdapter?: ClassroomAdapter;
  },
): void {
  const cookieName = sessionCookieName(dependencies.config.nodeEnv);
  app.post("/api/classes/sync", async (request, reply) => {
    const identity = await requireIdentity(
      request,
      reply,
      dependencies.authRepository,
      cookieName,
    );
    if (!identity) return;
    if (!dependencies.classroomAdapter) {
      return reply.code(503).send({
        error: {
          code: "INTEGRATION_UNAVAILABLE",
          message: "Sincronização Classroom não configurada.",
        },
      });
    }
    const courses = await dependencies.classroomAdapter.listCourses();
    const count = await dependencies.classesRepository.syncGoogleCourses(
      identity.professorId,
      courses,
    );
    return {
      data: {
        imported: count,
        isFixture: dependencies.classroomAdapter.isFixture,
      },
    };
  });
  app.get("/api/classes", async (request, reply) => {
    const identity = await requireIdentity(
      request,
      reply,
      dependencies.authRepository,
      cookieName,
    );
    if (!identity) return;
    return {
      data: await dependencies.classesRepository.list(identity.professorId),
    };
  });

  app.post<{ Body: unknown }>("/api/classes", async (request, reply) => {
    const identity = await requireIdentity(
      request,
      reply,
      dependencies.authRepository,
      cookieName,
    );
    if (!identity) return;
    const parsed = classCreateSchema.safeParse(request.body);
    if (!parsed.success) return validationError(reply);
    try {
      const id = await dependencies.classesRepository.create(
        identity.professorId,
        parsed.data,
      );
      return reply.code(201).send({ data: { id } });
    } catch (error) {
      if (isUniqueViolation(error))
        return conflict(reply, "Código de acesso já utilizado.");
      throw error;
    }
  });

  app.get<{ Params: { classId: string }; Querystring: { status?: string } }>(
    "/api/classes/:classId",
    async (request, reply) => {
      const identity = await requireIdentity(
        request,
        reply,
        dependencies.authRepository,
        cookieName,
      );
      if (!identity) return;
      const status = request.query.status;
      const detail = await dependencies.classesRepository.getDetail(
        identity.professorId,
        request.params.classId,
        status === "active" || status === "restricted" || status === "pending"
          ? status
          : undefined,
      );
      if (!detail)
        return reply.code(404).send({
          error: { code: "NOT_FOUND", message: "Turma não encontrada." },
        });
      return { data: detail };
    },
  );

  app.patch<{ Params: { classId: string }; Body: unknown }>(
    "/api/classes/:classId",
    async (request, reply) => {
      const identity = await requireIdentity(
        request,
        reply,
        dependencies.authRepository,
        cookieName,
      );
      if (!identity) return;
      const parsed = classUpdateSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply);
      const updated = await dependencies.classesRepository.update(
        identity.professorId,
        request.params.classId,
        parsed.data,
      );
      if (!updated)
        return reply.code(404).send({
          error: {
            code: "NOT_FOUND",
            message: "Turma não encontrada ou controlada pelo Google.",
          },
        });
      return {
        data: await dependencies.classesRepository.getDetail(
          identity.professorId,
          request.params.classId,
        ),
      };
    },
  );

  app.post<{ Params: { classId: string }; Body: unknown }>(
    "/api/classes/:classId/students",
    async (request, reply) => {
      const identity = await requireIdentity(
        request,
        reply,
        dependencies.authRepository,
        cookieName,
      );
      if (!identity) return;
      const parsed = studentEnrollmentInputSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply);
      try {
        await dependencies.classesRepository.enrollStudent(
          identity.professorId,
          request.params.classId,
          parsed.data,
        );
        return reply.code(201).send({ data: { status: "enrolled" } });
      } catch (error) {
        if (error instanceof Error && error.message === "CLASS_NOT_FOUND")
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Turma não encontrada." },
          });
        if (isUniqueViolation(error))
          return conflict(reply, "Aluno já matriculado ou e-mail duplicado.");
        throw error;
      }
    },
  );
}

function validationError(reply: {
  code: (status: number) => { send: (value: unknown) => unknown };
}) {
  return reply
    .code(400)
    .send({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos." } });
}

function conflict(
  reply: { code: (status: number) => { send: (value: unknown) => unknown } },
  message: string,
) {
  return reply.code(409).send({ error: { code: "VALIDATION_ERROR", message } });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}
