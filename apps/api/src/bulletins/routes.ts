import { bulletinCreateSchema } from "@educai/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AuthRepository } from "../auth/repository.js";
import { requireIdentity, sessionCookieName } from "../auth/routes.js";
import type { AppConfig } from "../config.js";
import type { BulletinsRepository } from "./repository.js";
import type { BulletinService } from "./service.js";

export function registerBulletinRoutes(
  app: FastifyInstance,
  dependencies: {
    config: AppConfig;
    authRepository: AuthRepository;
    repository: BulletinsRepository;
    service: BulletinService;
  },
): void {
  const cookieName = sessionCookieName(dependencies.config.nodeEnv);
  const identity = (request: FastifyRequest, reply: FastifyReply) =>
    requireIdentity(request, reply, dependencies.authRepository, cookieName);

  app.get("/api/bulletins", async (request, reply) => {
    const user = await identity(request, reply);
    if (!user) return;
    return { data: await dependencies.repository.list(user.professorId) };
  });

  app.get("/api/bulletins/eligible-students", async (request, reply) => {
    const user = await identity(request, reply);
    if (!user) return;
    return {
      data: await dependencies.repository.eligibleStudents(user.professorId),
    };
  });

  app.post<{ Body: unknown }>("/api/bulletins", async (request, reply) => {
    const user = await identity(request, reply);
    if (!user) return;
    const parsed = bulletinCreateSchema.safeParse(request.body);
    if (!parsed.success) return validationError(reply);
    try {
      const ids = await dependencies.service.generate(
        user.professorId,
        parsed.data,
      );
      return reply.code(201).send({ data: { ids } });
    } catch (error) {
      if (error instanceof Error && error.message === "BULLETIN_WITHOUT_GRADES")
        return reply.code(409).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Não há notas aprovadas no período selecionado.",
          },
        });
      if (error instanceof Error && error.message === "BULLETIN_FILTER_EMPTY")
        return reply.code(409).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Nenhum aluno ficou abaixo do limiar informado.",
          },
        });
      if (
        error instanceof Error &&
        error.message === "BULLETIN_TARGET_NOT_FOUND"
      )
        return notFound(reply, "Turma ou aluno não encontrado.");
      throw error;
    }
  });

  app.get<{ Params: { bulletinId: string } }>(
    "/api/bulletins/:bulletinId/pdf",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const pdf = await dependencies.repository.getPdf(
        user.professorId,
        request.params.bulletinId,
      );
      if (!pdf) return notFound(reply, "Boletim não encontrado.");
      return reply
        .header("content-type", "application/pdf")
        .header(
          "content-disposition",
          `inline; filename="${encodeURIComponent(pdf.title)}.pdf"`,
        )
        .send(Buffer.from(pdf.data));
    },
  );

  app.post<{ Params: { bulletinId: string } }>(
    "/api/bulletins/:bulletinId/send",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const result = await dependencies.service.send(
        user.professorId,
        request.params.bulletinId,
      );
      if (result.status === "not_found")
        return notFound(reply, "Boletim não encontrado.");
      if (result.status === "busy")
        return reply.code(409).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Já existe um envio em andamento.",
          },
        });
      if (result.status === "failed")
        return reply.code(503).send({
          error: {
            code: "INTEGRATION_UNAVAILABLE",
            message: "O PDF foi preservado e o envio pode ser repetido.",
          },
        });
      return { data: result };
    },
  );
}

function validationError(reply: FastifyReply) {
  return reply.code(400).send({
    error: { code: "VALIDATION_ERROR", message: "Dados inválidos." },
  });
}

function notFound(reply: FastifyReply, message: string) {
  return reply.code(404).send({ error: { code: "NOT_FOUND", message } });
}
