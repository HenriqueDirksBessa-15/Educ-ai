import {
  classCurriculumInputSchema,
  classCreateSchema,
  classEmailDomainSchema,
  classListQuerySchema,
  classUpdateSchema,
  enrollmentStatusUpdateSchema,
  studentEnrollmentInputSchema,
  studentImportRequestSchema,
  studentJoinSchema,
} from "@educai/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AppConfig } from "../config.js";
import { requireIdentity, sessionCookieName } from "../auth/routes.js";
import type { AuthRepository } from "../auth/repository.js";
import { GOOGLE_CLASSROOM_SYNC_SCOPES } from "../auth/google-gateway.js";
import type { ClassesRepository } from "./repository.js";
import { parseStudentCsv } from "./student-import.js";
import {
  ClassroomAdapterError,
  type ClassroomAdapter,
} from "../classroom/adapter.js";

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
  const owner = (request: FastifyRequest, reply: FastifyReply) =>
    requireIdentity(request, reply, dependencies.authRepository, cookieName);
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
    const credential = await dependencies.authRepository.getCredential(
      identity.professorId,
    );
    if (!credential && !dependencies.classroomAdapter.isFixture)
      return integrationUnavailable(reply, "Credencial Google ausente.");
    if (
      !dependencies.classroomAdapter.isFixture &&
      !GOOGLE_CLASSROOM_SYNC_SCOPES.every((scope) =>
        credential!.scopes.includes(scope),
      )
    )
      return integrationUnavailable(
        reply,
        "Autorize novamente o acesso ao Google Classroom.",
      );
    try {
      const result = await dependencies.classroomAdapter.listCourses(
        credential ?? { scopes: [] },
      );
      if (!dependencies.classroomAdapter.isFixture)
        await dependencies.authRepository.saveCredential(
          identity.professorId,
          result.credential,
        );
      const count = await dependencies.classesRepository.syncGoogleCourses(
        identity.professorId,
        result.courses,
      );
      return {
        data: {
          imported: count,
          isFixture: dependencies.classroomAdapter.isFixture,
        },
      };
    } catch (error) {
      if (error instanceof ClassroomAdapterError)
        return integrationUnavailable(
          reply,
          "Não foi possível sincronizar o Google Classroom.",
        );
      throw error;
    }
  });
  app.get<{ Querystring: unknown }>("/api/classes", async (request, reply) => {
    const identity = await owner(request, reply);
    if (!identity) return;
    const parsed = classListQuerySchema.safeParse(request.query);
    if (!parsed.success) return validationError(reply);
    const { archived, ...filters } = parsed.data;
    return {
      data: await dependencies.classesRepository.list(identity.professorId, {
        ...filters,
        q: filters.q || undefined,
        status: filters.status ?? (archived === "true" ? "archived" : "active"),
      }),
    };
  });

  app.get<{ Params: { classId: string } }>(
    "/api/classes/:classId/removal",
    async (request, reply) => {
      const identity = await owner(request, reply);
      if (!identity) return;
      const plan = await dependencies.classesRepository.removalPlan(
        identity.professorId,
        request.params.classId,
      );
      if (!plan) return notFound(reply, "Turma não encontrada.");
      return { data: plan };
    },
  );

  app.delete<{ Params: { classId: string } }>(
    "/api/classes/:classId",
    async (request, reply) => {
      const identity = await owner(request, reply);
      if (!identity) return;
      const result = await dependencies.classesRepository.remove(
        identity.professorId,
        request.params.classId,
      );
      if (result === "not_found")
        return notFound(reply, "Turma não encontrada.");
      if (result === "has_content")
        return conflict(
          reply,
          "Esta turma tem planos, atividades ou notas. Arquive a turma em vez de excluir.",
        );
      return { data: { status: result } };
    },
  );

  for (const [action, archived] of [
    ["archive", true],
    ["restore", false],
  ] as const)
    app.post<{ Params: { classId: string } }>(
      `/api/classes/:classId/${action}`,
      async (request, reply) => {
        const identity = await owner(request, reply);
        if (!identity) return;
        const updated = await dependencies.classesRepository.setArchived(
          identity.professorId,
          request.params.classId,
          archived,
        );
        if (!updated) return notFound(reply, "Turma não encontrada.");
        return { data: { archived } };
      },
    );

  for (const step of ["preview", "confirm"] as const)
    app.post<{ Params: { classId: string }; Body: unknown }>(
      `/api/classes/:classId/students/import/${step}`,
      async (request, reply) => {
        const identity = await owner(request, reply);
        if (!identity) return;
        const parsed = studentImportRequestSchema.safeParse(request.body);
        if (!parsed.success) return validationError(reply);
        const sheet = parseStudentCsv(parsed.data.csv);
        if (!sheet.ok)
          return reply.code(400).send({
            error: { code: "VALIDATION_ERROR", message: sheet.error },
          });
        if (step === "preview") {
          const preview =
            await dependencies.classesRepository.previewStudentImport(
              identity.professorId,
              request.params.classId,
              sheet.rows,
            );
          if (!preview) return notFound(reply, "Turma não encontrada.");
          return { data: { rows: preview.rows, canImport: preview.canImport } };
        }
        const imported = await dependencies.classesRepository.importStudents(
          identity.professorId,
          request.params.classId,
          sheet.rows,
        );
        if (imported.status === "not_found")
          return notFound(reply, "Turma não encontrada.");
        if (imported.status === "invalid")
          return reply.code(400).send({
            error: {
              code: "VALIDATION_ERROR",
              message: "Corrija as linhas com erro antes de importar.",
            },
            data: imported.preview,
          });
        return { data: imported.result };
      },
    );

  // Pública: o aluno entra pelo código da turma, sem sessão.
  app.post<{ Body: unknown }>("/api/join", async (request, reply) => {
    const parsed = studentJoinSchema.safeParse(request.body);
    if (!parsed.success) return validationError(reply);
    const joined = await dependencies.classesRepository.joinByCode(parsed.data);
    if (!joined)
      return notFound(
        reply,
        "Não encontramos uma turma com esse código. Confira com o professor.",
      );
    return reply.code(201).send({ data: joined });
  });

  app.put<{ Params: { classId: string }; Body: unknown }>(
    "/api/classes/:classId/email-domain",
    async (request, reply) => {
      const identity = await owner(request, reply);
      if (!identity) return;
      const parsed = classEmailDomainSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Escreva só o domínio, por exemplo escola.edu.br.",
          },
        });
      const updated = await dependencies.classesRepository.setEmailDomain(
        identity.professorId,
        request.params.classId,
        parsed.data.domain,
      );
      if (!updated)
        return notFound(
          reply,
          "Turma não encontrada ou controlada pelo Google.",
        );
      return { data: { domain: parsed.data.domain } };
    },
  );

  app.delete<{ Params: { classId: string; studentId: string } }>(
    "/api/classes/:classId/students/:studentId",
    async (request, reply) => {
      const identity = await owner(request, reply);
      if (!identity) return;
      const result = await dependencies.classesRepository.removeEnrollment(
        identity.professorId,
        request.params.classId,
        request.params.studentId,
      );
      if (result === "not_found")
        return notFound(reply, "Aluno não encontrado nesta turma.");
      if (result === "google")
        return conflict(
          reply,
          "Este aluno vem do Google Sala de Aula. Remova-o no Classroom ou marque-o como restrito aqui.",
        );
      return reply.code(204).send();
    },
  );

  app.patch<{ Params: { classId: string; studentId: string }; Body: unknown }>(
    "/api/classes/:classId/students/:studentId",
    async (request, reply) => {
      const identity = await owner(request, reply);
      if (!identity) return;
      const parsed = enrollmentStatusUpdateSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply);
      const updated = await dependencies.classesRepository.setEnrollmentStatus(
        identity.professorId,
        request.params.classId,
        request.params.studentId,
        parsed.data.status,
      );
      if (!updated) return notFound(reply, "Aluno não encontrado nesta turma.");
      return { data: { status: parsed.data.status } };
    },
  );

  app.post<{ Params: { classId: string } }>(
    "/api/classes/:classId/google",
    async (request, reply) => {
      const identity = await requireIdentity(
        request,
        reply,
        dependencies.authRepository,
        cookieName,
      );
      if (!identity) return;
      if (!dependencies.classroomAdapter)
        return integrationUnavailable(
          reply,
          "Integração Classroom não configurada.",
        );
      const context =
        await dependencies.classesRepository.getGoogleCourseContext(
          identity.professorId,
          request.params.classId,
        );
      if (!context) return notFound(reply, "Turma não encontrada.");
      if (context.googleClassroomId)
        return { data: { googleClassroomId: context.googleClassroomId } };
      const credential = await dependencies.authRepository.getCredential(
        identity.professorId,
      );
      if (!credential && !dependencies.classroomAdapter.isFixture)
        return integrationUnavailable(reply, "Credencial Google ausente.");
      if (
        !dependencies.classroomAdapter.isFixture &&
        !GOOGLE_CLASSROOM_SYNC_SCOPES.every((scope) =>
          credential!.scopes.includes(scope),
        )
      )
        return integrationUnavailable(
          reply,
          "Autorize novamente o acesso ao Google Classroom.",
        );
      try {
        const created = await dependencies.classroomAdapter.ensureCourse(
          credential ?? { scopes: [] },
          {
            localClassId: context.id,
            name: context.name,
            description: context.description,
          },
        );
        if (!dependencies.classroomAdapter.isFixture)
          await dependencies.authRepository.saveCredential(
            identity.professorId,
            created.credential,
          );
        const linked = await dependencies.classesRepository.linkGoogleCourse(
          identity.professorId,
          context.id,
          created.googleClassroomId,
        );
        if (!linked)
          return conflict(reply, "A turma não pode mais ser publicada.");
        return { data: { googleClassroomId: created.googleClassroomId } };
      } catch (error) {
        if (error instanceof ClassroomAdapterError)
          return integrationUnavailable(
            reply,
            "Não foi possível criar a turma no Google Classroom.",
          );
        throw error;
      }
    },
  );

  app.post<{ Params: { classId: string } }>(
    "/api/classes/:classId/students/sync",
    async (request, reply) => {
      const identity = await requireIdentity(
        request,
        reply,
        dependencies.authRepository,
        cookieName,
      );
      if (!identity) return;
      if (!dependencies.classroomAdapter)
        return integrationUnavailable(
          reply,
          "Integração Classroom não configurada.",
        );
      const googleClassroomId =
        await dependencies.classesRepository.getGoogleClassroomId(
          identity.professorId,
          request.params.classId,
        );
      if (googleClassroomId === undefined)
        return notFound(reply, "Turma não encontrada.");
      if (googleClassroomId === null)
        return conflict(
          reply,
          "A turma ainda não está vinculada ao Classroom.",
        );
      const credential = await dependencies.authRepository.getCredential(
        identity.professorId,
      );
      if (!credential && !dependencies.classroomAdapter.isFixture)
        return integrationUnavailable(reply, "Credencial Google ausente.");
      if (
        !dependencies.classroomAdapter.isFixture &&
        !GOOGLE_CLASSROOM_SYNC_SCOPES.every((scope) =>
          credential!.scopes.includes(scope),
        )
      )
        return integrationUnavailable(
          reply,
          "Autorize novamente o acesso ao Google Classroom.",
        );
      try {
        const roster = await dependencies.classroomAdapter.listStudents(
          credential ?? { scopes: [] },
          googleClassroomId,
        );
        if (!dependencies.classroomAdapter.isFixture)
          await dependencies.authRepository.saveCredential(
            identity.professorId,
            roster.credential,
          );
        const synchronized =
          await dependencies.classesRepository.syncGoogleStudents(
            identity.professorId,
            request.params.classId,
            roster.students,
          );
        return { data: { synchronized } };
      } catch (error) {
        if (error instanceof ClassroomAdapterError)
          return integrationUnavailable(
            reply,
            "Não foi possível sincronizar os alunos do Classroom.",
          );
        throw error;
      }
    },
  );

  app.put<{ Params: { classId: string }; Body: unknown }>(
    "/api/classes/:classId/curriculum",
    async (request, reply) => {
      const identity = await requireIdentity(
        request,
        reply,
        dependencies.authRepository,
        cookieName,
      );
      if (!identity) return;
      const parsed = classCurriculumInputSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply);
      const updated = await dependencies.classesRepository.setCurriculumProfile(
        identity.professorId,
        request.params.classId,
        parsed.data,
      );
      if (!updated) return notFound(reply, "Turma não encontrada.");
      return { data: { updated: true } };
    },
  );

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
        const result = await dependencies.classesRepository.enrollStudent(
          identity.professorId,
          request.params.classId,
          parsed.data,
        );
        if (result !== "enrolled")
          return conflict(
            reply,
            result.existing === "restricted"
              ? "Este aluno já está nesta turma e continua restrito. Para reativá-lo, use “Reativar” na lista de alunos."
              : "Este aluno já está matriculado nesta turma.",
          );
        return reply.code(201).send({ data: { status: "enrolled" } });
      } catch (error) {
        if (error instanceof Error && error.message === "CLASS_NOT_FOUND")
          return reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Turma não encontrada." },
          });
        if (isUniqueViolation(error))
          return conflict(
            reply,
            "Esta matrícula já é de outro aluno desta turma.",
          );
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

function notFound(
  reply: { code: (status: number) => { send: (value: unknown) => unknown } },
  message: string,
) {
  return reply.code(404).send({ error: { code: "NOT_FOUND", message } });
}

function conflict(
  reply: { code: (status: number) => { send: (value: unknown) => unknown } },
  message: string,
) {
  return reply.code(409).send({ error: { code: "VALIDATION_ERROR", message } });
}

function integrationUnavailable(
  reply: { code: (status: number) => { send: (value: unknown) => unknown } },
  message: string,
) {
  return reply
    .code(503)
    .send({ error: { code: "INTEGRATION_UNAVAILABLE", message } });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}
