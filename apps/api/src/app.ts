import cors from "@fastify/cors";
import type { ApiError, LiveResponse, ReadyResponse } from "@educai/contracts";
import Fastify, { type FastifyInstance } from "fastify";

import type { AppConfig } from "./config.js";
import { isDatabaseAvailable, type DatabaseClient } from "./database.js";

type AppDependencies = {
  config: AppConfig;
  database: DatabaseClient;
};

export async function createApp({
  config,
  database,
}: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.nodeEnv === "test" ? false : { level: config.logLevel },
    disableRequestLogging: config.nodeEnv === "test",
  });

  await app.register(cors, {
    origin: config.webOrigin,
    credentials: true,
  });

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
