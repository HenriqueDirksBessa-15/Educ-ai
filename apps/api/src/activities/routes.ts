import {
  activityInputSchema,
  activityListQuerySchema,
  activityUpdateSchema,
} from "@educai/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AuthRepository } from "../auth/repository.js";
import { requireIdentity, sessionCookieName } from "../auth/routes.js";
import type { AppConfig } from "../config.js";
import type { ActivitiesRepository } from "./repository.js";

export function registerActivitiesRoutes(
  app: FastifyInstance,
  dependencies: {
    config: AppConfig;
    authRepository: AuthRepository;
    activitiesRepository: ActivitiesRepository;
  },
): void {
  const cookieName = sessionCookieName(dependencies.config.nodeEnv);
  const identity = (request: FastifyRequest, reply: FastifyReply) =>
    requireIdentity(request, reply, dependencies.authRepository, cookieName);

  app.get<{ Querystring: unknown }>(
    "/api/activities",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const parsed = activityListQuerySchema.safeParse(request.query);
      if (!parsed.success) return validationError(reply);
      return {
        data: await dependencies.activitiesRepository.list(
          user.professorId,
          parsed.data.status,
          parsed.data.archived ?? false,
        ),
      };
    },
  );

  app.post<{ Body: unknown }>("/api/activities", async (request, reply) => {
    const user = await identity(request, reply);
    if (!user) return;
    const parsed = activityInputSchema.safeParse(request.body);
    if (!parsed.success) return validationError(reply);
    try {
      const id = await dependencies.activitiesRepository.create(
        user.professorId,
        parsed.data,
      );
      return reply.code(201).send({ data: { id } });
    } catch (error) {
      if (error instanceof Error && error.message === "LESSON_PLAN_NOT_FOUND")
        return notFound(reply, "Plano de aula não encontrado.");
      throw error;
    }
  });

  app.get<{ Params: { activityId: string } }>(
    "/api/activities/:activityId",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const activity = await dependencies.activitiesRepository.get(
        user.professorId,
        request.params.activityId,
      );
      if (!activity) return notFound(reply, "Atividade não encontrada.");
      return { data: activity };
    },
  );

  app.patch<{ Params: { activityId: string }; Body: unknown }>(
    "/api/activities/:activityId",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const parsed = activityUpdateSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply);
      let result;
      try {
        result = await dependencies.activitiesRepository.update(
          user.professorId,
          request.params.activityId,
          parsed.data,
        );
      } catch (error) {
        if (error instanceof Error && error.message === "INVALID_ACTIVITY")
          return validationError(reply);
        throw error;
      }
      if (result === "not_found")
        return notFound(reply, "Atividade não encontrada.");
      if (result === "locked") return lockedError(reply);
      return { data: { updated: true } };
    },
  );

  for (const action of ["publish", "finish"] as const) {
    app.post<{ Params: { activityId: string } }>(
      `/api/activities/:activityId/${action}`,
      async (request, reply) => {
        const user = await identity(request, reply);
        if (!user) return;
        const result = await dependencies.activitiesRepository[action](
          user.professorId,
          request.params.activityId,
        );
        if (result === "not_found")
          return notFound(reply, "Atividade não encontrada.");
        if (result === "locked") return lockedError(reply);
        return { data: { status: result } };
      },
    );
  }

  app.post<{ Params: { activityId: string } }>(
    "/api/activities/:activityId/archive",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const archived = await dependencies.activitiesRepository.archive(
        user.professorId,
        request.params.activityId,
      );
      if (!archived) return notFound(reply, "Atividade não encontrada.");
      return { data: { archived: true } };
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

function lockedError(reply: FastifyReply) {
  return reply.code(409).send({
    error: {
      code: "VALIDATION_ERROR",
      message: "A atividade não está disponível para esta alteração.",
    },
  });
}
