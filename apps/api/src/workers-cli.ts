import Fastify from "fastify";

import { TokenCipher } from "./auth/crypto.js";
import { ProductionGoogleGateway } from "./auth/google-gateway.js";
import { IntegrationMonitor } from "./auth/monitor.js";
import { AuthRepository } from "./auth/repository.js";
import {
  ResendEmailSender,
  UnavailableBulletinEmailSender,
} from "./bulletins/email.js";
import {
  ConfigurationError,
  loadConfig,
  loadRootEnvironment,
} from "./config.js";
import { ActivitiesRepository } from "./activities/repository.js";
import { ActivityCollectionService } from "./corrections/collection.js";
import { ProductionGoogleResponseCollector } from "./corrections/google-response-collector.js";
import { CorrectionsRepository } from "./corrections/repository.js";
import { ActivityCollectionWorker } from "./corrections/worker.js";
import { createDatabasePool } from "./database.js";
import { ProductionClassroomAnnouncementSender } from "./notifications/classroom.js";
import { NotificationRepository } from "./notifications/repository.js";
import {
  NotificationDeliveryWorker,
  notificationCycleFailure,
} from "./notifications/worker.js";
import { ConfiguredOpenAIAdapter } from "./openai/adapter.js";

async function runWorkersOnce(): Promise<void> {
  loadRootEnvironment();
  const config = loadConfig(process.env);
  const loggerHost = Fastify({
    logger: {
      level: config.logLevel,
      redact: {
        paths: ["req.headers.authorization", "req.headers.cookie", "req.url"],
        censor: "[REDACTED]",
      },
    },
  });
  const database = createDatabasePool(config.databaseUrl);

  try {
    const authRepository = new AuthRepository(
      database,
      new TokenCipher(config.tokenEncryptionKey),
      config.sessionTtlSeconds,
    );
    const activitiesRepository = new ActivitiesRepository(database);
    const correctionsRepository = new CorrectionsRepository(database);
    const collectionWorker = new ActivityCollectionWorker(
      correctionsRepository,
      new ActivityCollectionService(
        activitiesRepository,
        correctionsRepository,
        authRepository,
        new ProductionGoogleResponseCollector(config.google),
      ),
      Math.min(config.integrationMonitorIntervalMs, 60_000),
      loggerHost.log,
    );
    const emailSender =
      config.email.resendApiKey && config.email.from
        ? new ResendEmailSender(config.email.resendApiKey, config.email.from)
        : new UnavailableBulletinEmailSender();
    const notificationWorker = new NotificationDeliveryWorker(
      new NotificationRepository(database),
      authRepository,
      emailSender,
      new ProductionClassroomAnnouncementSender(config.google),
      {
        intervalMs: config.notificationWorkerIntervalMs,
        maxAttempts: config.notificationMaxAttempts,
        leaseSeconds: config.notificationLeaseSeconds,
        retryBaseSeconds: config.notificationRetryBaseSeconds,
        maxAgeDays: config.notificationMaxAgeDays,
      },
      loggerHost.log,
    );
    const monitor = new IntegrationMonitor(
      authRepository,
      new ProductionGoogleGateway(config.google),
      config.integrationMonitorIntervalMs,
      loggerHost.log,
      undefined,
      new ConfiguredOpenAIAdapter(config.openai),
    );

    await monitor.runCycle();
    await collectionWorker.runCycle();
    const failure = notificationCycleFailure(
      await notificationWorker.runCycle(),
    );
    if (failure) throw new NotificationCycleError(failure);
  } finally {
    await database.end();
    await loggerHost.close();
  }
}

class NotificationCycleError extends Error {}

runWorkersOnce().catch((error: unknown) => {
  console.error(
    error instanceof ConfigurationError ||
      error instanceof NotificationCycleError
      ? error.message
      : "Falha ao executar os workers operacionais.",
  );
  process.exitCode = 1;
});
