import { curriculumSearchQuerySchema } from "@educai/contracts";
import type { FastifyInstance } from "fastify";

import type { AppConfig } from "../config.js";
import { requireIdentity, sessionCookieName } from "../auth/routes.js";
import type { AuthRepository } from "../auth/repository.js";
import type { CurriculumRepository } from "./repository.js";

export function registerCurriculumRoutes(
  app: FastifyInstance,
  dependencies: {
    config: AppConfig;
    authRepository: AuthRepository;
    curriculumRepository: CurriculumRepository;
  },
): void {
  const cookieName = sessionCookieName(dependencies.config.nodeEnv);
  app.get<{ Querystring: unknown }>(
    "/api/curriculum",
    async (request, reply) => {
      const identity = await requireIdentity(
        request,
        reply,
        dependencies.authRepository,
        cookieName,
      );
      if (!identity) return;
      const parsed = curriculumSearchQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Filtros curriculares inválidos.",
          },
        });
      }
      return dependencies.curriculumRepository.search(parsed.data);
    },
  );
}
