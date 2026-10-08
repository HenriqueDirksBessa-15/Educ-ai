import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import type { ApiError, LiveResponse, ReadyResponse } from "@educai/contracts";
import Fastify, { type FastifyInstance } from "fastify";

import type { AppConfig } from "./config.js";
import { TokenCipher } from "./auth/crypto.js";
import { ProductionGoogleGateway } from "./auth/google-gateway.js";
import { IntegrationMonitor } from "./auth/monitor.js";
import { AuthRepository } from "./auth/repository.js";
import { registerAuthRoutes } from "./auth/routes.js";
import type { GoogleGateway } from "./auth/types.js";
import { registerCurriculumRoutes } from "./curriculum/routes.js";
import { CurriculumRepository } from "./curriculum/repository.js";
import { isDatabaseAvailable, type DatabaseClient } from "./database.js";
import { ConfiguredOpenAIAdapter } from "./openai/adapter.js";
import { registerProfileRoutes } from "./profile/routes.js";
import { ProfileRepository } from "./profile/repository.js";

type AppDependencies = {
  config: AppConfig;
  database: DatabaseClient;
  googleGateway?: GoogleGateway;
  startMonitor?: boolean;
};

export async function createApp({
  config,
  database,
  googleGateway,
  startMonitor = config.nodeEnv !== "test",
}: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.nodeEnv === "test" ? false : { level: config.logLevel },
  });

  await app.register(cors, {
    origin: config.webOrigin,
    credentials: true,
  });
  await app.register(cookie);

  const repository = new AuthRepository(
    database,
    new TokenCipher(config.tokenEncryptionKey),
    config.sessionTtlSeconds,
  );
  const gateway = googleGateway ?? new ProductionGoogleGateway(config.google);
  const profileRepository = new ProfileRepository(database);
  const curriculumRepository = new CurriculumRepository(database);
  const monitor = new IntegrationMonitor(
    repository,
    gateway,
    config.integrationMonitorIntervalMs,
    app.log,
    undefined,
    new ConfiguredOpenAIAdapter(config.openai),
  );
  registerAuthRoutes(app, { config, repository, gateway });
  registerProfileRoutes(app, {
    config,
    authRepository: repository,
    profileRepository,
  });
  registerCurriculumRoutes(app, {
    config,
    authRepository: repository,
    curriculumRepository,
  });
  if (startMonitor) monitor.start();
  app.addHook("onClose", async () => monitor.stop());

  app.get<{ Reply: LiveResponse }>("/api/health/live", async () => ({
    status: "alive",
    service: "educai-api",
    timestamp: new Date().toISOString(),
  }));

  app.get<{ Reply: ReadyResponse }>(
    "/api/health/ready",
    async (_request, reply) => {
      const databaseAvailable = await isDatabaseAvailable(database);
      const response: ReadyResponse = {
        status: databaseAvailable ? "ready" : "not_ready",
        service: "educai-api",
        database: databaseAvailable ? "available" : "unavailable",
        timestamp: new Date().toISOString(),
      };

      return reply.code(databaseAvailable ? 200 : 503).send(response);
    },
  );

  app.setNotFoundHandler((request, reply) => {
    const response: ApiError = {
      error: {
        code: "NOT_FOUND",
        message: "Recurso não encontrado.",
        requestId: request.id,
      },
    };
    return reply.code(404).send(response);
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "request failed");
    const response: ApiError = {
      error: {
        code: "INTERNAL_ERROR",
        message: "Ocorreu um erro interno.",
        requestId: request.id,
      },
    };
    return reply.code(500).send(response);
  });

  return app;
}
