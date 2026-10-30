import { join } from "node:path";

import { config as loadDotenv } from "dotenv";
import { z } from "zod";

import { findRepositoryRoot } from "./db/paths.js";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalBucket = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z
    .string()
    .trim()
    .min(3)
    .max(222)
    .regex(/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/)
    .optional(),
);

const booleanString = (defaultValue: "true" | "false") =>
  z
    .enum(["true", "false"])
    .default(defaultValue)
    .transform((value) => value === "true");

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
    RESEND_API_KEY: optionalString,
    EMAIL_FROM: optionalString,
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
    NOTIFICATION_WORKER_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(300_000)
      .default(30_000),
    NOTIFICATION_MAX_ATTEMPTS: z.coerce
      .number()
      .int()
      .min(1)
      .max(20)
      .default(5),
    NOTIFICATION_LEASE_SECONDS: z.coerce
      .number()
      .int()
      .min(30)
      .max(3_600)
      .default(300),
    NOTIFICATION_RETRY_BASE_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .max(3_600)
      .default(60),
    NOTIFICATION_MAX_AGE_DAYS: z.coerce
      .number()
      .int()
      .min(1)
      .max(90)
      .default(7),
    MATERIAL_STORAGE_DIRECTORY: z
      .string()
      .trim()
      .min(1)
      .default("storage/materials"),
    MATERIAL_STORAGE_BACKEND: z.enum(["local", "gcs"]).default("local"),
    MATERIAL_STORAGE_BUCKET: optionalBucket,
    MATERIAL_STORAGE_PREFIX: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*(\/[a-zA-Z0-9][a-zA-Z0-9_-]*)*$/)
      .default("materials"),
    MATERIAL_UPLOAD_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(104_857_600)
      .default(104_857_600),
    ENABLE_DEV_AUTH: booleanString("false"),
    // Entrada pública do aluno por código (DEF-25); desligada até o ajuste
    // de segurança.
    ENABLE_PUBLIC_JOIN: booleanString("false"),
    PUBLIC_JOIN_RATE_LIMIT_MAX: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(5),
    BACKGROUND_WORKERS_ENABLED: booleanString("true"),
    RATE_LIMIT_MAX: z.coerce.number().int().min(10).max(10_000).default(300),
    DATA_RETENTION_DAYS: z.coerce
      .number()
      .int()
      .min(30)
      .max(3_650)
      .default(365),
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
    if (
      data.MATERIAL_STORAGE_BACKEND === "gcs" &&
      !data.MATERIAL_STORAGE_BUCKET
    )
      context.addIssue({
        code: "custom",
        path: ["MATERIAL_STORAGE_BUCKET"],
        message: "bucket obrigatório para o backend gcs",
      });
    if (
      data.NODE_ENV === "production" &&
      data.MATERIAL_STORAGE_BACKEND !== "gcs"
    )
      context.addIssue({
        code: "custom",
        path: ["MATERIAL_STORAGE_BACKEND"],
        message: "produção exige armazenamento persistente gcs",
      });
    if (Boolean(data.RESEND_API_KEY) !== Boolean(data.EMAIL_FROM))
      for (const path of ["RESEND_API_KEY", "EMAIL_FROM"] as const)
        context.addIssue({
          code: "custom",
          path: [path],
          message: "chave Resend e remetente devem ser informados juntos",
        });
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
  email: {
    resendApiKey?: string;
    from?: string;
  };
  tokenEncryptionKey: string;
  sessionTtlSeconds: number;
  integrationMonitorIntervalMs: number;
  feedbackEditWindowMinutes: number;
  notificationWorkerIntervalMs: number;
  notificationMaxAttempts: number;
  notificationLeaseSeconds: number;
  notificationRetryBaseSeconds: number;
  notificationMaxAgeDays: number;
  materialStorageDirectory: string;
  materialStorageBackend: z.infer<
    typeof configSchema
  >["MATERIAL_STORAGE_BACKEND"];
  materialStorageBucket?: string;
  materialStoragePrefix: string;
  materialUploadMaxBytes: number;
  enableDevAuth: boolean;
  enablePublicJoin: boolean;
  publicJoinRateLimitMax: number;
  backgroundWorkersEnabled: boolean;
  rateLimitMax: number;
  dataRetentionDays: number;
};

export class ConfigurationError extends Error {
  constructor(readonly invalidVariables: string[]) {
    super(
      `Configuração inválida: ${invalidVariables.join(", ")}. Consulte o arquivo .env.example.`,
    );
    this.name = "ConfigurationError";
  }
}

export function loadRootEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  environmentPath = join(findRepositoryRoot(), ".env"),
): void {
  loadDotenv({
    path: environmentPath,
    quiet: true,
    override: environment.NODE_ENV !== "production",
    processEnv: environment as Record<string, string>,
  });
}

export function loadConfig(environment: NodeJS.ProcessEnv): AppConfig {
  const result = configSchema.safeParse({
    ...environment,
    API_PORT: environment.API_PORT || environment.PORT,
  });

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
    email: {
      resendApiKey: result.data.RESEND_API_KEY,
      from: result.data.EMAIL_FROM,
    },
    tokenEncryptionKey: result.data.TOKEN_ENCRYPTION_KEY,
    sessionTtlSeconds: result.data.SESSION_TTL_SECONDS,
    integrationMonitorIntervalMs: result.data.INTEGRATION_MONITOR_INTERVAL_MS,
    feedbackEditWindowMinutes: result.data.FEEDBACK_EDIT_WINDOW_MINUTES,
    notificationWorkerIntervalMs: result.data.NOTIFICATION_WORKER_INTERVAL_MS,
    notificationMaxAttempts: result.data.NOTIFICATION_MAX_ATTEMPTS,
    notificationLeaseSeconds: result.data.NOTIFICATION_LEASE_SECONDS,
    notificationRetryBaseSeconds: result.data.NOTIFICATION_RETRY_BASE_SECONDS,
    notificationMaxAgeDays: result.data.NOTIFICATION_MAX_AGE_DAYS,
    materialStorageDirectory: result.data.MATERIAL_STORAGE_DIRECTORY,
    materialStorageBackend: result.data.MATERIAL_STORAGE_BACKEND,
    materialStorageBucket: result.data.MATERIAL_STORAGE_BUCKET,
    materialStoragePrefix: result.data.MATERIAL_STORAGE_PREFIX,
    materialUploadMaxBytes: result.data.MATERIAL_UPLOAD_MAX_BYTES,
    enableDevAuth: result.data.ENABLE_DEV_AUTH,
    enablePublicJoin: result.data.ENABLE_PUBLIC_JOIN,
    publicJoinRateLimitMax: result.data.PUBLIC_JOIN_RATE_LIMIT_MAX,
    backgroundWorkersEnabled: result.data.BACKGROUND_WORKERS_ENABLED,
    rateLimitMax: result.data.RATE_LIMIT_MAX,
    dataRetentionDays: result.data.DATA_RETENTION_DAYS,
  };
}
