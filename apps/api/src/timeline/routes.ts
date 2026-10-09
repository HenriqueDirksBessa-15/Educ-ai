import {
  materialCategorySchema,
  materialInputSchema,
  milestoneCreateSchema,
  milestoneUpdateSchema,
} from "@educai/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AppConfig } from "../config.js";
import { requireIdentity, sessionCookieName } from "../auth/routes.js";
import type { AuthRepository } from "../auth/repository.js";
import type { TimelineRepository } from "./repository.js";

export function registerTimelineRoutes(
  app: FastifyInstance,
  dependencies: {
    config: AppConfig;
    authRepository: AuthRepository;
    timelineRepository: TimelineRepository;
  },
): void {
  const cookieName = sessionCookieName(dependencies.config.nodeEnv);
  const identity = async (request: FastifyRequest, reply: FastifyReply) =>
    requireIdentity(request, reply, dependencies.authRepository, cookieName);

  app.get("/api/timeline/milestones", async (request, reply) => {
    const user = await identity(request, reply);
    if (!user) return;
    return {
      data: await dependencies.timelineRepository.listMilestones(
        user.professorId,
      ),
    };
  });

  app.post<{ Body: unknown }>(
    "/api/timeline/milestones",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const parsed = milestoneCreateSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply);
      try {
        const id = await dependencies.timelineRepository.createMilestone(
          user.professorId,
          parsed.data,
        );
        return reply.code(201).send({ data: { id } });
      } catch (error) {
        if (error instanceof Error && error.message === "CLASS_NOT_FOUND")
          return notFound(reply, "Turma não encontrada.");
        throw error;
      }
    },
  );

  app.patch<{ Params: { milestoneId: string }; Body: unknown }>(
    "/api/timeline/milestones/:milestoneId",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const parsed = milestoneUpdateSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply);
      const result = await dependencies.timelineRepository.updateMilestone(
        user.professorId,
        request.params.milestoneId,
        parsed.data,
      );
      if (result === "not_found")
        return notFound(reply, "Marco não encontrado.");
      if (result === "past")
        return reply.code(409).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Marcos passados não podem ser editados.",
          },
        });
      return { data: { updated: true } };
    },
  );

  app.delete<{
    Params: { milestoneId: string };
    Querystring: { confirm?: string };
  }>("/api/timeline/milestones/:milestoneId", async (request, reply) => {
    const user = await identity(request, reply);
    if (!user) return;
    const result = await dependencies.timelineRepository.deleteMilestone(
      user.professorId,
      request.params.milestoneId,
      request.query.confirm === "true",
    );
    if (result === "not_found") return notFound(reply, "Marco não encontrado.");
    if (result === "confirmation_required")
      return reply.code(409).send({
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Confirme a exclusão do marco vinculado a conteúdo publicado.",
        },
      });
    return reply.code(204).send();
  });

  app.get<{ Querystring: { category?: string } }>(
    "/api/materials",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const category = request.query.category
        ? materialCategorySchema.safeParse(request.query.category)
        : null;
      if (category && !category.success) return validationError(reply);
      return {
        data: await dependencies.timelineRepository.listMaterials(
          user.professorId,
          category?.data,
        ),
      };
    },
  );

  app.post<{ Body: unknown }>("/api/materials", async (request, reply) => {
    const user = await identity(request, reply);
    if (!user) return;
    const parsed = materialInputSchema.safeParse(request.body);
    if (!parsed.success || (!parsed.data.url && !parsed.data.storageKey))
      return validationError(reply);
    try {
      const id = await dependencies.timelineRepository.createMaterial(
        user.professorId,
        parsed.data,
      );
      return reply.code(201).send({ data: { id } });
    } catch (error) {
      if (error instanceof Error && error.message === "CLASS_NOT_FOUND")
        return notFound(reply, "Uma das turmas não foi encontrada.");
      throw error;
    }
  });

  app.post<{ Params: { materialId: string } }>(
    "/api/materials/:materialId/archive",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const archived = await dependencies.timelineRepository.archiveMaterial(
        user.professorId,
        request.params.materialId,
      );
      if (!archived) return notFound(reply, "Material não encontrado.");
      return { data: { archived: true } };
    },
  );

  app.delete<{ Params: { materialId: string } }>(
    "/api/materials/:materialId",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const result = await dependencies.timelineRepository.deleteMaterial(
        user.professorId,
        request.params.materialId,
      );
      if (result === "not_found")
        return notFound(reply, "Material não encontrado.");
      if (result === "linked")
        return reply.code(409).send({
          error: {
            code: "VALIDATION_ERROR",
            message:
              "Material vinculado a conteúdo publicado não pode ser apagado.",
          },
        });
      return reply.code(204).send();
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
