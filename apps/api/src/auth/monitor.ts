import type { IntegrationService } from "@educai/contracts";

import { GoogleGatewayError } from "./google-gateway.js";
import type { AuthRepository } from "./repository.js";
import type { GoogleGateway } from "./types.js";
import type { OpenAIAdapter } from "../openai/adapter.js";

const SERVICES: IntegrationService[] = [
  "google_oauth",
  "google_classroom",
  "google_forms",
];

type MonitorLogger = {
  error(bindings: object, message: string): void;
};

export class IntegrationMonitor {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly repository: AuthRepository,
    private readonly gateway: GoogleGateway,
    private readonly intervalMs: number,
    private readonly logger: MonitorLogger,
    private readonly wait: (
      milliseconds: number,
    ) => Promise<void> = defaultWait,
    private readonly openAIAdapter?: OpenAIAdapter,
  ) {}

  start(): void {
    void this.runCycle();
    this.timer = setInterval(() => void this.runCycle(), this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runCycle(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const storedCredentials = await this.repository.getActiveCredentials();
      if (storedCredentials.length === 0) {
        for (const service of SERVICES) await this.checkService(service, null);
      } else {
        for (const stored of storedCredentials) {
          for (const service of SERVICES) {
            await this.checkService(service, stored);
          }
        }
      }
      if (this.openAIAdapter) await this.checkOpenAI();
    } catch (error) {
      this.logger.error({ err: error }, "integration monitor cycle failed");
    } finally {
      this.running = false;
    }
  }

  private async checkOpenAI(): Promise<void> {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        const result = await this.openAIAdapter!.checkAvailability();
        if (result.status === "available") {
          await this.repository.recordIntegrationStatus({
            service: "openai",
            status: "active",
            professorId: null,
            attemptNumber: attempt,
          });
          return;
        }
        await this.repository.recordIntegrationStatus({
          service: "openai",
          status: "inactive",
          professorId: null,
          attemptNumber: attempt,
          errorCode: result.errorCode ?? "OPENAI_UNAVAILABLE",
          errorMessage: "Verificação OpenAI não disponível nesta etapa.",
        });
        if (result.status === "missing" || result.status === "deferred") return;
      } catch (error) {
        await this.repository.recordIntegrationStatus({
          service: "openai",
          status: "inactive",
          professorId: null,
          attemptNumber: attempt,
          errorCode: "OPENAI_SERVICE_UNAVAILABLE",
          errorMessage: "Serviço OpenAI temporariamente indisponível.",
        });
        this.logger.error({ err: error }, "openai monitor attempt failed");
      }
    }
  }

  private async checkService(
    service: IntegrationService,
    stored:
      | Awaited<ReturnType<AuthRepository["getActiveCredentials"]>>[number]
      | null,
  ): Promise<void> {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        if (!this.gateway.configured) {
          throw new GoogleGatewayError(
            "GOOGLE_CREDENTIALS_MISSING",
            "Credenciais Google não configuradas.",
          );
        }
        if (!stored) {
          throw new GoogleGatewayError(
            "GOOGLE_USER_CREDENTIAL_MISSING",
            "Nenhuma conta Google autorizada.",
          );
        }
        const refreshed = await this.gateway.probe(service, stored.credential);
        if (Object.values(refreshed).some((value) => value !== undefined)) {
          await this.repository.saveCredential(stored.professorId, refreshed);
        }
        await this.repository.recordIntegrationStatus({
          service,
          status: "active",
          professorId: stored.professorId,
          attemptNumber: attempt,
        });
        return;
      } catch (error) {
        const normalized = normalizeGoogleError(error);
        await this.repository.recordIntegrationStatus({
          service,
          status: "inactive",
          professorId: stored?.professorId ?? null,
          attemptNumber: attempt,
          errorCode: normalized.code,
          errorMessage: normalized.message,
        });
        if (attempt === 4) {
          this.logger.error(
            {
              service,
              professorId: stored?.professorId ?? null,
              errorCode: normalized.code,
              detail: normalized.message,
            },
            "google integration check failed",
          );
        }
        if (attempt < 4) await this.wait(250 * attempt);
      }
    }
  }
}

// Only the HTTP status and Google's own reason are kept: never tokens or
// request headers.
export function normalizeGoogleError(error: unknown): {
  code: string;
  message: string;
} {
  if (error instanceof GoogleGatewayError) {
    return { code: error.code, message: error.message };
  }
  const response = (
    error as { response?: { status?: unknown; data?: unknown } } | null
  )?.response;
  const status = typeof response?.status === "number" ? response.status : null;
  if (status === null) {
    const cause = error instanceof Error ? error.message : String(error);
    return {
      code: "GOOGLE_SERVICE_UNAVAILABLE",
      message: `Serviço Google temporariamente indisponível: ${cause}`.slice(
        0,
        300,
      ),
    };
  }
  const reason = googleReason(response?.data);
  const message = `HTTP ${status}${reason ? ` ${reason}` : ""}`.slice(0, 300);
  if (status === 400 && /invalid_grant|unauthorized_client/.test(reason)) {
    return { code: "GOOGLE_AUTH_INVALID", message };
  }
  if (status === 401) return { code: "GOOGLE_AUTH_INVALID", message };
  if (status === 403) return { code: "GOOGLE_PERMISSION_DENIED", message };
  if (status === 404) return { code: "GOOGLE_RESOURCE_NOT_FOUND", message };
  if (status === 429 || status >= 500) {
    return { code: "GOOGLE_SERVICE_UNAVAILABLE", message };
  }
  return { code: "GOOGLE_REQUEST_REJECTED", message };
}

function googleReason(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const body = data as {
    error?: unknown;
    error_description?: unknown;
  };
  if (typeof body.error === "string") {
    return [body.error, body.error_description]
      .filter((part) => typeof part === "string")
      .join(": ");
  }
  if (body.error && typeof body.error === "object") {
    const detail = body.error as {
      status?: unknown;
      message?: unknown;
      details?: Array<{ reason?: unknown }>;
    };
    const reasons = (Array.isArray(detail.details) ? detail.details : [])
      .map((item) => item?.reason)
      .filter((item) => typeof item === "string");
    return [detail.status, ...reasons, detail.message]
      .filter((part) => typeof part === "string" && part.length > 0)
      .join(": ");
  }
  return "";
}

function defaultWait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
