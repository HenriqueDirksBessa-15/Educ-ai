import { createApp } from "./app.js";
import {
  ConfigurationError,
  loadConfig,
  loadRootEnvironment,
} from "./config.js";
import { createDatabasePool } from "./database.js";

async function start(): Promise<void> {
  loadRootEnvironment();
  let config;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigurationError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const pool = createDatabasePool(config.databaseUrl);
  const app = await createApp({ config, database: pool });
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, "graceful shutdown started");

    const timeout = new Promise<never>((_resolve, reject) => {
      setTimeout(
        () => reject(new Error("shutdown timeout")),
        config.shutdownTimeoutMs,
      ).unref();
    });

    try {
      await Promise.race([Promise.all([app.close(), pool.end()]), timeout]);
      app.log.info("graceful shutdown completed");
    } catch (error) {
      app.log.error({ err: error }, "graceful shutdown failed");
      process.exitCode = 1;
    }
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => void shutdown(signal));
  }

  await app.listen({ host: config.apiHost, port: config.apiPort });
}

start().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Falha desconhecida ao iniciar a API.",
  );
  process.exitCode = 1;
});
