import {
  activityApprovalSchema,
  activityGenerationRequestSchema,
  activityInputSchema,
  activityListQuerySchema,
  activityReviewSchema,
  activityUpdateSchema,
} from "@educai/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AuthRepository } from "../auth/repository.js";
import { requireIdentity, sessionCookieName } from "../auth/routes.js";
import type { AppConfig } from "../config.js";
import {
  OpenAIPlanGenerationError,
  type OpenAIAdapter,
} from "../openai/adapter.js";
import { MissingSyllabusError } from "../plans/generation.js";
import type { PlansRepository } from "../plans/repository.js";
import { buildActivityPromptContext } from "./generation.js";
import type { ActivityPublicationService } from "./publication.js";
import type { ActivitiesRepository } from "./repository.js";

export function registerActivitiesRoutes(
  app: FastifyInstance,
  dependencies: {
    config: AppConfig;
    authRepository: AuthRepository;
    activitiesRepository: ActivitiesRepository;
    plansRepository: PlansRepository;
    activityGenerationAdapter: OpenAIAdapter;
    publicationService: ActivityPublicationService;
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

  app.get<{ Params: { activityId: string } }>(
    "/api/activities/:activityId/generation",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const activity = await dependencies.activitiesRepository.get(
        user.professorId,
        request.params.activityId,
      );
      if (!activity) return notFound(reply, "Atividade não encontrada.");
      return {
        data: await dependencies.activitiesRepository.latestGeneration(
          user.professorId,
          request.params.activityId,
        ),
      };
    },
  );

  app.post<{ Params: { activityId: string }; Body: unknown }>(
    "/api/activities/:activityId/generate",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const parsed = activityGenerationRequestSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply);
      const activity = await dependencies.activitiesRepository.get(
        user.professorId,
        request.params.activityId,
      );
      if (!activity) return notFound(reply, "Atividade não encontrada.");
      if (activity.status !== "draft" || activity.archivedAt)
        return lockedError(reply);
      if (activity.type === "mixed" && parsed.data.questionCount < 2)
        return reply.code(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Atividade mista exige ao menos duas questões.",
          },
        });
      const plan = await dependencies.plansRepository.get(
        user.professorId,
        activity.lessonPlanId,
      );
      if (!plan) return notFound(reply, "Plano de aula não encontrado.");
      let context;
      try {
        context = buildActivityPromptContext(
          activity,
          plan,
          parsed.data.questionCount,
        );
      } catch (error) {
        if (error instanceof MissingSyllabusError)
          return reply.code(409).send({
            error: {
              code: "VALIDATION_ERROR",
              message: "O plano precisa de uma ementa antes da geração.",
            },
          });
        throw error;
      }
      try {
        const generated =
          await dependencies.activityGenerationAdapter.generateActivity(
            context,
          );
        const generation =
          await dependencies.activitiesRepository.recordGenerationSuccess(
            user.professorId,
            activity.id,
            context,
            generated,
          );
        if (!generation) return lockedError(reply);
        return { data: generation };
      } catch (error) {
        const errorCode =
          error instanceof OpenAIPlanGenerationError
            ? error.code
            : "OPENAI_GENERATION_FAILED";
        await dependencies.activitiesRepository.recordGenerationFailure(
          user.professorId,
          activity.id,
          context,
          dependencies.config.openai.model,
          dependencies.activityGenerationAdapter.isFixture
            ? "fixture"
            : "openai",
          errorCode,
        );
        return reply.code(503).send({
          error: {
            code: "INTEGRATION_UNAVAILABLE",
            message:
              "A atividade não pôde ser gerada. O rascunho local foi preservado.",
          },
        });
      }
    },
  );

  app.post<{ Params: { activityId: string }; Body: unknown }>(
    "/api/activities/:activityId/review",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const parsed = activityReviewSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply);
      const result = await dependencies.activitiesRepository.reviewGeneration(
        user.professorId,
        request.params.activityId,
        parsed.data,
      );
      if (result === "not_found")
        return notFound(reply, "Atividade não encontrada.");
      if (result === "generation_not_found")
        return notFound(reply, "Sugestão não encontrada para esta atividade.");
      if (result === "locked") return lockedError(reply);
      return { data: { status: result } };
    },
  );

  app.post<{ Params: { activityId: string }; Body: unknown }>(
    "/api/activities/:activityId/approve",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const parsed = activityApprovalSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply);
      const result = await dependencies.activitiesRepository.approveGeneration(
        user.professorId,
        request.params.activityId,
        parsed.data.generationId,
      );
      if (result === "not_found")
        return notFound(reply, "Atividade não encontrada.");
      if (result === "review_required")
        return reply.code(409).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Revise a sugestão escolhida antes de aprovar.",
          },
        });
      return { data: { status: result } };
    },
  );

  app.get<{ Params: { activityId: string } }>(
    "/api/activities/:activityId/publication",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const activity = await dependencies.activitiesRepository.get(
        user.professorId,
        request.params.activityId,
      );
      if (!activity) return notFound(reply, "Atividade não encontrada.");
      return {
        data: await dependencies.activitiesRepository.getPublication(
          user.professorId,
          request.params.activityId,
        ),
      };
    },
  );

  app.post<{ Params: { activityId: string } }>(
    "/api/activities/:activityId/publish",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const result = await dependencies.publicationService.publish(
        user.professorId,
        request.params.activityId,
      );
      if (result.status !== "publication") {
        if (result.status === "not_found")
          return notFound(reply, "Atividade não encontrada.");
        return lockedError(reply);
      }
      return { data: result.publication };
    },
  );

  app.post<{ Params: { activityId: string } }>(
    "/api/activities/:activityId/finish",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const result = await dependencies.activitiesRepository.finish(
        user.professorId,
        request.params.activityId,
      );
      if (result === "not_found")
        return notFound(reply, "Atividade não encontrada.");
      if (result === "locked") return lockedError(reply);
      return { data: { status: result } };
    },
  );

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
