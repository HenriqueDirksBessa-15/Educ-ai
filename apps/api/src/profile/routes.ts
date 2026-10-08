import {
  apiErrorSchema,
  professorProfileUpdateSchema,
} from "@educai/contracts";
import type { FastifyInstance } from "fastify";

import type { AppConfig } from "../config.js";
import { requireIdentity, sessionCookieName } from "../auth/routes.js";
import type { AuthRepository } from "../auth/repository.js";
import type { ProfileRepository } from "./repository.js";

export function registerProfileRoutes(
  app: FastifyInstance,
  dependencies: {
    config: AppConfig;
    authRepository: AuthRepository;
    profileRepository: ProfileRepository;
  },
): void {
  const cookieName = sessionCookieName(dependencies.config.nodeEnv);
  app.get("/api/profile", async (request, reply) => {
    const identity = await requireIdentity(
      request,
      reply,
      dependencies.authRepository,
      cookieName,
    );
    if (!identity) return;
    const profile = await dependencies.profileRepository.getProfile(
      identity.professorId,
    );
    if (!profile) {
      return reply.code(404).send({
        error: { code: "NOT_FOUND", message: "Perfil não encontrado." },
      });
    }
    return { data: profile };
  });

  app.patch<{ Body: unknown }>("/api/profile", async (request, reply) => {
    const identity = await requireIdentity(
      request,
      reply,
      dependencies.authRepository,
      cookieName,
    );
    if (!identity) return;
    const parsed = professorProfileUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(
        apiErrorSchema.parse({
          error: {
            code: "VALIDATION_ERROR",
            message: "Dados de perfil inválidos.",
          },
        }),
      );
    }
    const profile = await dependencies.profileRepository.updateProfile(
      identity.professorId,
      parsed.data,
    );
    if (!profile) {
      return reply.code(404).send({
        error: { code: "NOT_FOUND", message: "Perfil não encontrado." },
      });
    }
    return { data: profile };
  });
}
