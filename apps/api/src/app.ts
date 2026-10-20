import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import type { ApiError, LiveResponse, ReadyResponse } from "@educai/contracts";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

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
import {
  FixtureClassroomAdapter,
  ProductionClassroomAdapter,
  type ClassroomAdapter,
} from "./classroom/adapter.js";
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
import { MaterialService } from "./timeline/service.js";
import {
  GcsMaterialStorage,
  LocalMaterialStorage,
  type MaterialStorage,
} from "./timeline/storage.js";
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
import { DiscursiveCorrectionsRepository } from "./corrections/discursive-repository.js";
import {
  FixtureClassroomGradeReturner,
  ProductionClassroomGradeReturner,
  type ClassroomGradeReturner,
} from "./corrections/classroom-return.js";
import { SubmissionReleaseService } from "./corrections/release.js";
import { registerCorrectionRoutes } from "./corrections/routes.js";
import { FeedbackRepository } from "./feedback/repository.js";
import { registerFeedbackRoutes } from "./feedback/routes.js";
import { BulletinsRepository } from "./bulletins/repository.js";
import {
  FixtureBulletinEmailSender,
  ResendEmailSender,
  UnavailableBulletinEmailSender,
  type BulletinEmailSender,
} from "./bulletins/email.js";
import { BulletinService } from "./bulletins/service.js";
import { registerBulletinRoutes } from "./bulletins/routes.js";
import { AuditRepository } from "./audit/repository.js";
import { PrivacyRepository } from "./privacy/repository.js";
import { registerPrivacyRoutes } from "./privacy/routes.js";
import { findRepositoryRoot } from "./db/paths.js";
import {
  FixtureClassroomAnnouncementSender,
  ProductionClassroomAnnouncementSender,
  type ClassroomAnnouncementSender,
} from "./notifications/classroom.js";
import { NotificationRepository } from "./notifications/repository.js";
import { NotificationDeliveryWorker } from "./notifications/worker.js";

type AppDependencies = {
  config: AppConfig;
  database: DatabaseClient;
  googleGateway?: GoogleGateway;
  classroomAdapter?: ClassroomAdapter;
  planGenerationAdapter?: OpenAIAdapter;
  googleActivityPublisher?: GoogleActivityPublisher;
  googleResponseCollector?: GoogleResponseCollector;
  classroomGradeReturner?: ClassroomGradeReturner;
  bulletinEmailSender?: BulletinEmailSender;
  classroomAnnouncementSender?: ClassroomAnnouncementSender;
  materialStorage?: MaterialStorage;
  startMonitor?: boolean;
};

export async function createApp({
  config,
  database,
  googleGateway,
  classroomAdapter,
  planGenerationAdapter,
  googleActivityPublisher,
  googleResponseCollector,
  classroomGradeReturner,
  bulletinEmailSender,
  classroomAnnouncementSender,
  materialStorage,
  startMonitor = config.nodeEnv !== "test" && config.backgroundWorkersEnabled,
}: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: 1_048_576,
    trustProxy:
      config.nodeEnv === "production"
        ? (_address: string, hop: number) => hop < 2
        : false,
    logger:
      config.nodeEnv === "test"
        ? false
        : {
            level: config.logLevel,
            redact: {
              paths: [
                "req.headers.authorization",
                "req.headers.cookie",
                "req.url",
                "res.headers.set-cookie",
              ],
              censor: "[REDACTED]",
            },
          },
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: config.nodeEnv === "production" ? ["'self'"] : ["'none'"],
        scriptSrc: config.nodeEnv === "production" ? ["'self'"] : ["'none'"],
        styleSrc: config.nodeEnv === "production" ? ["'self'"] : ["'none'"],
        imgSrc:
          config.nodeEnv === "production"
            ? ["'self'", "data:", "https:"]
            : ["'none'"],
        connectSrc: config.nodeEnv === "production" ? ["'self'"] : ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  });
  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: "1 minute",
  });
  await app.register(cors, {
    origin: config.webOrigin,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(multipart, {
    limits: {
      fields: 1,
      files: 1,
      parts: 2,
      fileSize: config.materialUploadMaxBytes,
    },
    throwFileSizeLimit: false,
  });

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
  const fileStorage =
    materialStorage ?? createConfiguredMaterialStorage(config);
  const materialService = new MaterialService(timelineRepository, fileStorage);
  const plansRepository = new PlansRepository(database);
  const activitiesRepository = new ActivitiesRepository(database);
  const correctionsRepository = new CorrectionsRepository(database);
  const discursiveCorrectionsRepository = new DiscursiveCorrectionsRepository(
    database,
  );
  const feedbackRepository = new FeedbackRepository(database);
  const bulletinsRepository = new BulletinsRepository(database);
  const auditRepository = new AuditRepository(database);
  const privacyRepository = new PrivacyRepository(database);
  const openAIAdapter =
    planGenerationAdapter ??
    (config.nodeEnv === "production" || config.openai.apiKey
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
  const gradeReturner =
    classroomGradeReturner ??
    (config.nodeEnv === "production"
      ? new ProductionClassroomGradeReturner(config.google)
      : new FixtureClassroomGradeReturner());
  const releaseService = new SubmissionReleaseService(
    discursiveCorrectionsRepository,
    repository,
    gradeReturner,
  );
  const emailSender =
    bulletinEmailSender ??
    (config.email.resendApiKey && config.email.from
      ? new ResendEmailSender(config.email.resendApiKey, config.email.from)
      : config.nodeEnv === "production"
        ? new UnavailableBulletinEmailSender()
        : new FixtureBulletinEmailSender());
  const bulletinService = new BulletinService(bulletinsRepository, emailSender);
  const notificationRepository = new NotificationRepository(database);
  const announcementSender =
    classroomAnnouncementSender ??
    (config.nodeEnv === "production"
      ? new ProductionClassroomAnnouncementSender(config.google)
      : new FixtureClassroomAnnouncementSender());
  const notificationWorker = new NotificationDeliveryWorker(
    notificationRepository,
    repository,
    emailSender,
    announcementSender,
    {
      intervalMs: config.notificationWorkerIntervalMs,
      maxAttempts: config.notificationMaxAttempts,
      leaseSeconds: config.notificationLeaseSeconds,
      retryBaseSeconds: config.notificationRetryBaseSeconds,
    },
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
  app.addHook("onRequest", async (request, reply) => {
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(request.method) &&
      request.headers.origin &&
      request.headers.origin !== config.webOrigin
    )
      return reply.code(403).send({
        error: {
          code: "FORBIDDEN",
          message: "Origem não autorizada.",
          requestId: request.id,
        },
      });
  });

  app.addHook("onResponse", async (request, reply) => {
    if (
      !["POST", "PUT", "PATCH", "DELETE"].includes(request.method) ||
      !request.url.startsWith("/api/")
    )
      return;
    try {
      await auditRepository.record({
        professorId: request.authenticatedIdentity?.professorId ?? null,
        requestId: request.id,
        method: request.method,
        route: request.url,
        statusCode: reply.statusCode,
      });
    } catch (error) {
      request.log.error({ err: error }, "audit event persistence failed");
    }
  });

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
      classroomAdapter ??
      (config.nodeEnv === "production"
        ? new ProductionClassroomAdapter(config.google)
        : new FixtureClassroomAdapter()),
  });
  registerTimelineRoutes(app, {
    config,
    authRepository: repository,
    timelineRepository,
    materialService,
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
  registerCorrectionRoutes(app, {
    config,
    authRepository: repository,
    repository: discursiveCorrectionsRepository,
    adapter: openAIAdapter,
    releaseService,
  });
  registerFeedbackRoutes(app, {
    config,
    authRepository: repository,
    repository: feedbackRepository,
    adapter: openAIAdapter,
  });
  registerBulletinRoutes(app, {
    config,
    authRepository: repository,
    repository: bulletinsRepository,
    service: bulletinService,
  });
  registerPrivacyRoutes(app, {
    config,
    authRepository: repository,
    privacyRepository,
  });

  if (startMonitor) {
    monitor.start();
    if (!responseCollector.isFixture) collectionWorker.start();
    if (config.nodeEnv === "production") notificationWorker.start();
  }
  app.addHook("onClose", async () => {
    monitor.stop();
    collectionWorker.stop();
    notificationWorker.stop();
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

  if (config.nodeEnv === "production") {
    app.get<{ Params: { file: string } }>(
      "/assets/:file",
      async (request, reply) => {
        if (!/^[a-zA-Z0-9._-]+$/.test(request.params.file))
          return reply.code(404).send();
        return sendWebFile(reply, join("assets", request.params.file));
      },
    );
    app.get("/", async (_request, reply) => sendWebFile(reply, "index.html"));
  }

  app.setNotFoundHandler((request, reply) => {
    if (
      config.nodeEnv === "production" &&
      request.method === "GET" &&
      !request.url.startsWith("/api/")
    )
      return sendWebFile(reply, "index.html");
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
    const errorStatus =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : null;
    const clientStatus =
      errorStatus !== null && errorStatus >= 400 && errorStatus < 500
        ? errorStatus
        : null;
    const response: ApiError = {
      error: {
        code:
          clientStatus === 403
            ? "FORBIDDEN"
            : clientStatus
              ? "VALIDATION_ERROR"
              : "INTERNAL_ERROR",
        message: clientStatus
          ? "A requisição foi rejeitada. Revise os dados e cabeçalhos."
          : "Ocorreu um erro interno.",
        requestId: request.id,
      },
    };
    return reply.code(clientStatus ?? 500).send(response);
  });

  return app;
}

async function sendWebFile(reply: FastifyReply, relativePath: string) {
  const root = join(findRepositoryRoot(), "apps", "web", "dist");
  const data = await readFile(join(root, relativePath));
  const contentTypes: Record<string, string> = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
  };
  return reply
    .header(
      "cache-control",
      relativePath === "index.html"
        ? "no-cache"
        : "public, max-age=31536000, immutable",
    )
    .type(contentTypes[extname(relativePath)] ?? "application/octet-stream")
    .send(data);
}

function createConfiguredMaterialStorage(config: AppConfig): MaterialStorage {
  if (config.materialStorageBackend === "gcs") {
    if (!config.materialStorageBucket) throw new Error("GCS_BUCKET_REQUIRED");
    return new GcsMaterialStorage(
      config.materialStorageBucket,
      config.materialStoragePrefix,
    );
  }
  return new LocalMaterialStorage(config.materialStorageDirectory);
}
