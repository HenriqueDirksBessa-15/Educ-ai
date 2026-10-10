import {
  feedbackCreateSchema,
  feedbackReviewSchema,
  feedbackUpdateSchema,
} from "@educai/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AuthRepository } from "../auth/repository.js";
import { requireIdentity, sessionCookieName } from "../auth/routes.js";
import type { AppConfig } from "../config.js";
import {
  OpenAIPlanGenerationError,
  type OpenAIAdapter,
} from "../openai/adapter.js";
import type { FeedbackRepository } from "./repository.js";

export function registerFeedbackRoutes(
  app: FastifyInstance,
  dependencies: {
    config: AppConfig;
    authRepository: AuthRepository;
    repository: FeedbackRepository;
    adapter: OpenAIAdapter;
  },
): void {
  const cookieName = sessionCookieName(dependencies.config.nodeEnv);
  const identity = (request: FastifyRequest, reply: FastifyReply) =>
    requireIdentity(request, reply, dependencies.authRepository, cookieName);

  app.get("/api/feedbacks", async (request, reply) => {
    const user = await identity(request, reply);
    if (!user) return;
    return { data: await dependencies.repository.list(user.professorId) };
  });

  app.get("/api/feedbacks/eligible-submissions", async (request, reply) => {
    const user = await identity(request, reply);
    if (!user) return;
    return {
      data: await dependencies.repository.eligibleSubmissions(user.professorId),
    };
  });

  app.post<{ Body: unknown }>("/api/feedbacks", async (request, reply) => {
    const user = await identity(request, reply);
    if (!user) return;
    const parsed = feedbackCreateSchema.safeParse(request.body);
    if (!parsed.success) return validationError(reply);
    try {
      const id = await dependencies.repository.create(
        user.professorId,
        parsed.data,
        dependencies.config.feedbackEditWindowMinutes,
      );
      return reply.code(201).send({ data: { id } });
    } catch (error) {
      if (
        error instanceof Error &&
        ["FEEDBACK_TARGET_NOT_FOUND", "FEEDBACK_MATERIAL_NOT_FOUND"].includes(
          error.message,
        )
      )
        return notFound(reply, "Destinatário ou anexo não encontrado.");
      throw error;
    }
  });

  app.patch<{ Params: { feedbackId: string }; Body: unknown }>(
    "/api/feedbacks/:feedbackId",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const parsed = feedbackUpdateSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply);
      try {
        const result = await dependencies.repository.update(
          user.professorId,
          request.params.feedbackId,
          parsed.data,
        );
        return mutationResult(reply, result);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "FEEDBACK_MATERIAL_NOT_FOUND"
        )
          return notFound(reply, "Anexo não encontrado.");
        throw error;
      }
    },
  );

  app.post<{ Params: { feedbackId: string } }>(
    "/api/feedbacks/:feedbackId/generate",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const context = await dependencies.repository.getPromptContext(
        user.professorId,
        request.params.feedbackId,
      );
      if (!context) return locked(reply);
      try {
        const generated = await dependencies.adapter.generateFeedback(context);
        const result = await dependencies.repository.recordGenerationSuccess(
          user.professorId,
          request.params.feedbackId,
          context,
          generated,
        );
        if (!result) return locked(reply);
        return { data: result };
      } catch (error) {
        const errorCode =
          error instanceof OpenAIPlanGenerationError
            ? error.code
            : "OPENAI_FEEDBACK_FAILED";
        await dependencies.repository.recordGenerationFailure(
          user.professorId,
          request.params.feedbackId,
          context,
          dependencies.config.openai.model,
          dependencies.adapter.isFixture ? "fixture" : "openai",
          errorCode,
        );
        return reply.code(503).send({
          error: {
            code: "INTEGRATION_UNAVAILABLE",
            message: "A sugestão falhou; o texto manual foi preservado.",
          },
        });
      }
    },
  );

  app.post<{ Params: { feedbackId: string }; Body: unknown }>(
    "/api/feedbacks/:feedbackId/review",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const parsed = feedbackReviewSchema.safeParse(request.body);
      if (!parsed.success) return validationError(reply);
      const result = await dependencies.repository.review(
        user.professorId,
        request.params.feedbackId,
        parsed.data,
      );
      if (result === "reviewed") return { data: { status: result } };
      if (result === "not_found")
        return notFound(reply, "Feedback não encontrado.");
      if (result === "window_expired") return windowExpired(reply);
      return locked(reply);
    },
  );

  app.post<{ Params: { feedbackId: string } }>(
    "/api/feedbacks/:feedbackId/send",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const result = await dependencies.repository.send(
        user.professorId,
        request.params.feedbackId,
      );
      if (result === "sent") return { data: { status: result } };
      if (result === "not_found")
        return notFound(reply, "Feedback não encontrado.");
      return locked(reply);
    },
  );

  app.delete<{ Params: { feedbackId: string } }>(
    "/api/feedbacks/:feedbackId",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const result = await dependencies.repository.remove(
        user.professorId,
        request.params.feedbackId,
      );
      if (result === "not_found")
        return notFound(reply, "Feedback não encontrado.");
      if (result === "window_expired") return windowExpired(reply);
      return { data: { status: result } };
    },
  );
}

function mutationResult(
  reply: FastifyReply,
  result: "updated" | "not_found" | "window_expired" | "locked",
) {
  if (result === "updated") return { data: { status: result } };
  if (result === "not_found")
    return notFound(reply, "Feedback não encontrado.");
  if (result === "window_expired") return windowExpired(reply);
  return locked(reply);
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
      message: "O feedback exige revisão ou não está disponível neste estado.",
    },
  });
}

function windowExpired(reply: FastifyReply) {
  return reply.code(409).send({
    error: {
      code: "VALIDATION_ERROR",
      message: "A janela configurada para edição ou exclusão expirou.",
    },
  });
}
