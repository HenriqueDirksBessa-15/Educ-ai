import { privacyDeletionSchema } from "@educai/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AuthRepository } from "../auth/repository.js";
import { requireIdentity, sessionCookieName } from "../auth/routes.js";
import type { AppConfig } from "../config.js";
import type { PrivacyRepository } from "./repository.js";

export function registerPrivacyRoutes(
  app: FastifyInstance,
  dependencies: {
    config: AppConfig;
    authRepository: AuthRepository;
    privacyRepository: PrivacyRepository;
  },
): void {
  const cookieName = sessionCookieName(dependencies.config.nodeEnv);
  const identity = (request: FastifyRequest, reply: FastifyReply) =>
    requireIdentity(request, reply, dependencies.authRepository, cookieName);

  app.get("/api/privacy/export", async (request, reply) => {
    const user = await identity(request, reply);
    if (!user) return;
    const exported = await dependencies.privacyRepository.exportProfessorData(
      user.professorId,
    );
    if (!exported)
      return reply.code(404).send({
        error: { code: "NOT_FOUND", message: "Conta não encontrada." },
      });
    return reply
      .header("content-type", "application/json; charset=utf-8")
      .header(
        "content-disposition",
        `attachment; filename="educai-export-${user.professorId}.json"`,
      )
      .send(exported);
  });

  app.delete<{ Body: unknown }>(
    "/api/privacy/account",
    async (request, reply) => {
      const user = await identity(request, reply);
      if (!user) return;
      const parsed = privacyDeletionSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Confirmação inválida.",
          },
        });
      const deleted = await dependencies.privacyRepository.anonymizeProfessor(
        user.professorId,
      );
      if (!deleted)
        return reply.code(404).send({
          error: { code: "NOT_FOUND", message: "Conta não encontrada." },
        });
      reply.clearCookie(cookieName, { path: "/" });
      return reply.code(204).send();
    },
  );
}
