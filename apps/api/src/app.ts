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
import { registerClassesRoutes } from "./classes/routes.js";
import { ClassesRepository } from "./classes/repository.js";
import { FixtureClassroomAdapter } from "./classroom/adapter.js";
import { isDatabaseAvailable, type DatabaseClient } from "./database.js";
import {
  ConfiguredOpenAIAdapter,
  FixtureOpenAIAdapter,
  type OpenAIAdapter,
} from "./openai/adapter.js";
import { registerProfileRoutes } from "./profile/routes.js";
import { ProfileRepository } from "./profile/repository.js";
import { registerTimelineRoutes } from "./timeline/routes.js";
import { TimelineRepository } from "./timeline/repository.js";
import { registerPlansRoutes } from "./plans/routes.js";
import { PlansRepository } from "./plans/repository.js";
import { registerActivitiesRoutes } from "./activities/routes.js";
import { ActivitiesRepository } from "./activities/repository.js";
import {
  FixtureGoogleActivityPublisher,
  ProductionGoogleActivityPublisher,
  type GoogleActivityPublisher,
} from "./activities/google-publisher.js";
import { ActivityPublicationService } from "./activities/publication.js";
import {
  FixtureGoogleResponseCollector,
  ProductionGoogleResponseCollector,
  type GoogleResponseCollector,
} from "./corrections/google-response-collector.js";
import { CorrectionsRepository } from "./corrections/repository.js";
import { ActivityCollectionService } from "./corrections/collection.js";
import { ActivityCollectionWorker } from "./corrections/worker.js";

type AppDependencies = {
  config: AppConfig;
  database: DatabaseClient;
  googleGateway?: GoogleGateway;
  planGenerationAdapter?: OpenAIAdapter;
  googleActivityPublisher?: GoogleActivityPublisher;
  googleResponseCollector?: GoogleResponseCollector;
  startMonitor?: boolean;
};

export async function createApp({
  config,
  database,
  googleGateway,
  planGenerationAdapter,
  googleActivityPublisher,
  googleResponseCollector,
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
  const classesRepository = new ClassesRepository(database);
  const timelineRepository = new TimelineRepository(database);
  const plansRepository = new PlansRepository(database);
  const activitiesRepository = new ActivitiesRepository(database);
  const correctionsRepository = new CorrectionsRepository(database);
  const openAIAdapter =
    planGenerationAdapter ??
    (config.openai.apiKey
      ? new ConfiguredOpenAIAdapter(config.openai)
      : new FixtureOpenAIAdapter());
  const activityPublisher =
    googleActivityPublisher ??
    (config.nodeEnv === "production"
      ? new ProductionGoogleActivityPublisher(config.google)
      : new FixtureGoogleActivityPublisher());
  const publicationService = new ActivityPublicationService(
    activitiesRepository,
    repository,
    activityPublisher,
  );
  const responseCollector =
    googleResponseCollector ??
    (config.nodeEnv === "production"
      ? new ProductionGoogleResponseCollector(config.google)
      : new FixtureGoogleResponseCollector());
  const collectionService = new ActivityCollectionService(
    activitiesRepository,
    correctionsRepository,
    repository,
    responseCollector,
  );
  const collectionWorker = new ActivityCollectionWorker(
    correctionsRepository,
    collectionService,
    Math.min(config.integrationMonitorIntervalMs, 60_000),
    app.log,
  );
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
  registerClassesRoutes(app, {
    config,
    authRepository: repository,
    classesRepository,
    classroomAdapter:
      config.nodeEnv === "test" ? undefined : new FixtureClassroomAdapter(),
  });
  registerTimelineRoutes(app, {
    config,
    authRepository: repository,
    timelineRepository,
  });
  registerPlansRoutes(app, {
    config,
    authRepository: repository,
    plansRepository,
    planGenerationAdapter: openAIAdapter,
  });
  registerActivitiesRoutes(app, {
    config,
    authRepository: repository,
    activitiesRepository,
    plansRepository,
    activityGenerationAdapter: openAIAdapter,
    publicationService,
    collectionService,
    correctionsRepository,
  });
  if (startMonitor) {
    monitor.start();
    if (!responseCollector.isFixture) collectionWorker.start();
  }
  app.addHook("onClose", async () => {
    monitor.stop();
    collectionWorker.stop();
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
