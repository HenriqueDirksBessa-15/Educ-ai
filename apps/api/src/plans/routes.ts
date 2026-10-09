import {
  lessonPlanListQuerySchema,
  lessonPlanInputSchema,
  lessonPlanUpdateSchema,
} from "@educai/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AuthRepository } from "../auth/repository.js";
import { requireIdentity, sessionCookieName } from "../auth/routes.js";
import type { AppConfig } from "../config.js";
import type { PlansRepository } from "./repository.js";

export function registerPlansRoutes(
  app: FastifyInstance,
  dependencies: {
    config: AppConfig;
    authRepository: AuthRepository;
    plansRepository: PlansRepository;
  },
): void {
  const cookieName = sessionCookieName(dependencies.config.nodeEnv);
  const identity = (request: FastifyRequest, reply: FastifyReply) =>
    requireIdentity(request, reply, dependencies.authRepository, cookieName);

  app.get<{ Querystring: unknown }>(
    "/api/lesson-plans",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const parsed = lessonPlanListQuerySchema.safeParse(request.query);
      if (!parsed.success) return validationError(reply);
      return {
        data: await dependencies.plansRepository.list(
          user.professorId,
          parsed.data.archived ?? false,
        ),
      };
    },
  );

  app.post<{ Body: unknown }>("/api/lesson-plans", async (request, reply) => {
    const user = await identity(request, reply);
    if (!user) return;
    const parsed = lessonPlanInputSchema.safeParse(request.body);
    if (!parsed.success) return validationError(reply);
    try {
      const id = await dependencies.plansRepository.create(
        user.professorId,
        parsed.data,
      );
      return reply.code(201).send({ data: { id } });
    } catch (error) {
      return referenceError(reply, error);
    }
  });

  app.get<{ Params: { planId: string } }>(
    "/api/lesson-plans/:planId",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const plan = await dependencies.plansRepository.get(
        user.professorId,
        request.params.planId,
      );
      if (!plan) return notFound(reply, "Plano não encontrado.");
      return { data: plan };
    },
  );

  app.patch<{ Params: { planId: string }; Body: unknown }>(
    "/api/lesson-plans/:planId",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const parsed = lessonPlanUpdateSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply);
      const result = await dependencies.plansRepository.update(
        user.professorId,
        request.params.planId,
        parsed.data,
      );
      if (result === "not_found")
        return notFound(reply, "Plano não encontrado.");
      if (result === "locked")
        return reply.code(409).send({
          error: {
            code: "VALIDATION_ERROR",
            message:
              "Plano usado em atividade publicada não pode ser alterado.",
          },
        });
      return { data: { updated: true } };
    },
  );

  app.post<{ Params: { planId: string } }>(
    "/api/lesson-plans/:planId/reuse",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const id = await dependencies.plansRepository.reuse(
        user.professorId,
        request.params.planId,
      );
      if (!id) return notFound(reply, "Plano não encontrado.");
      return reply.code(201).send({ data: { id } });
    },
  );

  app.post<{ Params: { planId: string } }>(
    "/api/lesson-plans/:planId/archive",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const archived = await dependencies.plansRepository.archive(
        user.professorId,
        request.params.planId,
      );
      if (!archived) return notFound(reply, "Plano não encontrado.");
      return { data: { archived: true } };
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

function referenceError(
  reply: { code: (status: number) => { send: (value: unknown) => unknown } },
  error: unknown,
) {
  const messages: Record<string, string> = {
    CLASS_NOT_FOUND: "Uma das turmas não foi encontrada.",
    MATERIAL_NOT_FOUND: "Um dos materiais não foi encontrado.",
    SYLLABUS_NOT_FOUND: "A ementa selecionada não foi encontrada.",
  };
  if (error instanceof Error) {
    const message = messages[error.message];
    if (message) return notFound(reply, message);
  }
  throw error;
}
