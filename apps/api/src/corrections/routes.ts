import {
  discursiveCorrectionGenerateSchema,
  submissionCorrectionReviewSchema,
} from "@educai/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AuthRepository } from "../auth/repository.js";
import { requireIdentity, sessionCookieName } from "../auth/routes.js";
import type { AppConfig } from "../config.js";
import {
  OpenAIPlanGenerationError,
  type OpenAIAdapter,
} from "../openai/adapter.js";
import type { DiscursiveCorrectionsRepository } from "./discursive-repository.js";
import type { SubmissionReleaseService } from "./release.js";

export function registerCorrectionRoutes(
  app: FastifyInstance,
  dependencies: {
    config: AppConfig;
    authRepository: AuthRepository;
    repository: DiscursiveCorrectionsRepository;
    adapter: OpenAIAdapter;
    releaseService: SubmissionReleaseService;
  },
): void {
  const cookieName = sessionCookieName(dependencies.config.nodeEnv);
  const identity = (request: FastifyRequest, reply: FastifyReply) =>
    requireIdentity(request, reply, dependencies.authRepository, cookieName);

  app.post<{ Params: { submissionId: string }; Body: unknown }>(
    "/api/submissions/:submissionId/corrections/suggest",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const parsed = discursiveCorrectionGenerateSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply);
      const context = await dependencies.repository.getContext(
        user.professorId,
        request.params.submissionId,
        parsed.data.answerId,
        parsed.data.rigour,
      );
      if (!context)
        return notFound(reply, "Resposta discursiva não encontrada.");
      try {
        const result =
          await dependencies.adapter.generateDiscursiveCorrection(context);
        const saved = await dependencies.repository.recordSuggestion(
          user.professorId,
          context,
          result,
        );
        if (!saved) return locked(reply);
        return { data: result.suggestion };
      } catch (error) {
        const errorCode =
          error instanceof OpenAIPlanGenerationError
            ? error.code
            : "OPENAI_CORRECTION_FAILED";
        await dependencies.repository.recordFailure(
          user.professorId,
          context,
          errorCode,
          dependencies.config.openai.model,
          dependencies.adapter.isFixture ? "fixture" : "openai",
        );
        return reply.code(503).send({
          error: {
            code: "INTEGRATION_UNAVAILABLE",
            message:
              "A sugestão não foi produzida. A resposta está disponível para correção manual.",
          },
        });
      }
    },
  );

  app.patch<{ Params: { submissionId: string }; Body: unknown }>(
    "/api/submissions/:submissionId/correction",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const parsed = submissionCorrectionReviewSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply);
      const result = await dependencies.repository.review(
        user.professorId,
        request.params.submissionId,
        parsed.data,
      );
      if (result === "not_found")
        return notFound(reply, "Submissão não encontrada.");
      if (result === "invalid_answers")
        return reply.code(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message:
              "Revise todas as discursivas sem exceder a pontuação máxima.",
          },
        });
      if (result === "locked") return locked(reply);
      return { data: { status: result } };
    },
  );

  app.post<{ Params: { submissionId: string } }>(
    "/api/submissions/:submissionId/approve",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const result = await dependencies.repository.approve(
        user.professorId,
        request.params.submissionId,
      );
      if (result === "not_found")
        return notFound(reply, "Submissão não encontrada.");
      if (result === "review_required")
        return reply.code(409).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Revise todas as respostas discursivas antes de aprovar.",
          },
        });
      if (result === "locked") return locked(reply);
      return { data: { status: result } };
    },
  );

  app.post<{ Params: { submissionId: string } }>(
    "/api/submissions/:submissionId/release",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const result = await dependencies.releaseService.release(
        user.professorId,
        request.params.submissionId,
      );
      if (result.status === "not_found")
        return notFound(reply, "Submissão não encontrada.");
      if (result.status === "approval_required") return locked(reply);
      if (result.status === "already_released")
        return { data: { status: "released", idempotent: true } };
      if (result.status === "failed")
        return reply.code(503).send({
          error: {
            code: "INTEGRATION_UNAVAILABLE",
            message:
              "A nota continua aprovada e a devolução ao Classroom pode ser repetida.",
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

function locked(reply: FastifyReply) {
  return reply.code(409).send({
    error: {
      code: "VALIDATION_ERROR",
      message: "A correção não está disponível neste estado.",
    },
  });
}
