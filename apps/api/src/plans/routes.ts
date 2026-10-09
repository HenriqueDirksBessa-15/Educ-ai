import {
  lessonPlanListQuerySchema,
  lessonPlanInputSchema,
  lessonPlanReviewSchema,
  lessonPlanSuggestionSchema,
  lessonPlanUpdateSchema,
} from "@educai/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AuthRepository } from "../auth/repository.js";
import { requireIdentity, sessionCookieName } from "../auth/routes.js";
import type { AppConfig } from "../config.js";
import {
  OpenAIPlanGenerationError,
  type OpenAIAdapter,
} from "../openai/adapter.js";
import {
  buildLessonPlanPromptContext,
  MissingSyllabusError,
} from "./generation.js";
import type { PlansRepository } from "./repository.js";

export function registerPlansRoutes(
  app: FastifyInstance,
  dependencies: {
    config: AppConfig;
    authRepository: AuthRepository;
    plansRepository: PlansRepository;
    planGenerationAdapter: OpenAIAdapter;
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

  app.post<{ Params: { planId: string } }>(
    "/api/lesson-plans/:planId/generate",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const plan = await dependencies.plansRepository.get(
        user.professorId,
        request.params.planId,
      );
      if (!plan) return notFound(reply, "Plano não encontrado.");
      if (plan.isArchived || plan.isLocked)
        return reply.code(409).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Plano arquivado ou em uso não pode receber sugestões.",
          },
        });
      let context;
      try {
        context = buildLessonPlanPromptContext(plan);
      } catch (error) {
        if (error instanceof MissingSyllabusError)
          return reply.code(409).send({
            error: {
              code: "VALIDATION_ERROR",
              message: "Selecione uma ementa antes de gerar sugestões.",
            },
          });
        throw error;
      }
      try {
        const generated =
          await dependencies.planGenerationAdapter.generateLessonPlan(context);
        const parsed = lessonPlanSuggestionSchema.safeParse(
          generated.suggestion,
        );
        if (!parsed.success)
          throw new OpenAIPlanGenerationError("OPENAI_INVALID_RESPONSE");
        const generation =
          await dependencies.plansRepository.recordGenerationSuccess(
            user.professorId,
            request.params.planId,
            context,
            { ...generated, suggestion: parsed.data },
          );
        return { data: generation };
      } catch (error) {
        const errorCode =
          error instanceof OpenAIPlanGenerationError
            ? error.code
            : error instanceof Error && error.name === "AbortError"
              ? "OPENAI_TIMEOUT"
              : "OPENAI_GENERATION_FAILED";
        await dependencies.plansRepository.recordGenerationFailure(
          user.professorId,
          request.params.planId,
          context,
          dependencies.config.openai.model,
          "openai",
          errorCode,
        );
        return reply.code(503).send({
          error: {
            code: "INTEGRATION_UNAVAILABLE",
            message:
              "A sugestão não pôde ser gerada. O plano manual foi preservado.",
          },
        });
      }
    },
  );

  app.post<{ Params: { planId: string }; Body: unknown }>(
    "/api/lesson-plans/:planId/review",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const parsed = lessonPlanReviewSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply);
      const result = await dependencies.plansRepository.reviewGeneration(
        user.professorId,
        request.params.planId,
        parsed.data,
      );
      if (result === "not_found")
        return notFound(reply, "Plano não encontrado.");
      if (result === "generation_not_found")
        return notFound(reply, "Sugestão não encontrada para este plano.");
      if (result === "locked")
        return reply.code(409).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Plano arquivado ou em uso não pode ser revisado.",
          },
        });
      return { data: { status: "reviewed" } };
    },
  );

  app.post<{ Params: { planId: string } }>(
    "/api/lesson-plans/:planId/approve",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const result = await dependencies.plansRepository.approve(
        user.professorId,
        request.params.planId,
      );
      if (result === "not_found")
        return notFound(reply, "Plano não encontrado.");
      if (result === "review_required")
        return reply.code(409).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Revise explicitamente a sugestão antes de aprovar.",
          },
        });
      return { data: { status: "approved" } };
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
