import { join } from "node:path";

import { config as loadDotenv } from "dotenv";
import { z } from "zod";

import { findRepositoryRoot } from "./db/paths.js";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const configSchema = z
  .object({
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
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    GOOGLE_REDIRECT_URI: z
      .url()
      .default("http://localhost:3000/api/auth/google/callback"),
    GOOGLE_FORMS_TEST_FORM_ID: optionalString,
    OPENAI_API_KEY: optionalString,
    OPENAI_BASE_URL: z.url().default("https://api.openai.com/v1"),
    OPENAI_MODEL: z.string().min(1).default("gpt-5-mini"),
    TOKEN_ENCRYPTION_KEY: z
      .string()
      .regex(/^[a-fA-F0-9]{64}$/, "deve conter 32 bytes em hexadecimal"),
    SESSION_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(86_400)
      .default(28_800),
    INTEGRATION_MONITOR_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(60_000)
      .default(300_000),
    FEEDBACK_EDIT_WINDOW_MINUTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(43_200)
      .default(1_440),
  })
  .superRefine((data, context) => {
    if (Boolean(data.GOOGLE_CLIENT_ID) !== Boolean(data.GOOGLE_CLIENT_SECRET)) {
      for (const path of [
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
      ] as const) {
        context.addIssue({
          code: "custom",
          path: [path],
          message: "client id e secret devem ser informados juntos",
        });
      }
    }
  });

export type AppConfig = {
  nodeEnv: z.infer<typeof configSchema>["NODE_ENV"];
  apiHost: string;
  apiPort: number;
  databaseUrl: string;
  webOrigin: string;
  logLevel: z.infer<typeof configSchema>["LOG_LEVEL"];
  shutdownTimeoutMs: number;
  google: {
    clientId?: string;
    clientSecret?: string;
    redirectUri: string;
    formsTestFormId?: string;
  };
  openai: {
    apiKey?: string;
    baseUrl: string;
    model: string;
  };
  tokenEncryptionKey: string;
  sessionTtlSeconds: number;
  integrationMonitorIntervalMs: number;
  feedbackEditWindowMinutes: number;
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
    google: {
      clientId: result.data.GOOGLE_CLIENT_ID,
      clientSecret: result.data.GOOGLE_CLIENT_SECRET,
      redirectUri: result.data.GOOGLE_REDIRECT_URI,
      formsTestFormId: result.data.GOOGLE_FORMS_TEST_FORM_ID,
    },
    openai: {
      apiKey: result.data.OPENAI_API_KEY,
      baseUrl: result.data.OPENAI_BASE_URL,
      model: result.data.OPENAI_MODEL,
    },
    tokenEncryptionKey: result.data.TOKEN_ENCRYPTION_KEY,
    sessionTtlSeconds: result.data.SESSION_TTL_SECONDS,
    integrationMonitorIntervalMs: result.data.INTEGRATION_MONITOR_INTERVAL_MS,
    feedbackEditWindowMinutes: result.data.FEEDBACK_EDIT_WINDOW_MINUTES,
  };
}
