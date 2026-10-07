import { join } from "node:path";

import { config as loadDotenv } from "dotenv";
import { z } from "zod";

import { findRepositoryRoot } from "./db/paths.js";

const configSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_HOST: z.string().min(1).default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  WEB_ORIGIN: z.url(),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  SHUTDOWN_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(60_000)
    .default(10_000),
});

export type AppConfig = {
  nodeEnv: z.infer<typeof configSchema>["NODE_ENV"];
  apiHost: string;
  apiPort: number;
  databaseUrl: string;
  webOrigin: string;
  logLevel: z.infer<typeof configSchema>["LOG_LEVEL"];
  shutdownTimeoutMs: number;
};

export class ConfigurationError extends Error {
  constructor(readonly invalidVariables: string[]) {
    super(
      `Configuração inválida: ${invalidVariables.join(", ")}. Consulte o arquivo .env.example.`,
    );
    this.name = "ConfigurationError";
  }
}

export function loadRootEnvironment(): void {
  loadDotenv({ path: join(findRepositoryRoot(), ".env"), quiet: true });
}

export function loadConfig(environment: NodeJS.ProcessEnv): AppConfig {
  const result = configSchema.safeParse(environment);

  if (!result.success) {
    const invalidVariables = [
      ...new Set(
        result.error.issues.map((issue) => String(issue.path[0] ?? "ambiente")),
      ),
    ];
    throw new ConfigurationError(invalidVariables);
  }

  return {
    nodeEnv: result.data.NODE_ENV,
    apiHost: result.data.API_HOST,
    apiPort: result.data.API_PORT,
    databaseUrl: result.data.DATABASE_URL,
    webOrigin: result.data.WEB_ORIGIN,
    logLevel: result.data.LOG_LEVEL,
    shutdownTimeoutMs: result.data.SHUTDOWN_TIMEOUT_MS,
  };
}
