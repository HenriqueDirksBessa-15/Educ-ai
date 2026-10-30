import { describe, expect, it, vi } from "vitest";

import { GoogleGatewayError } from "./google-gateway.js";
import { IntegrationMonitor, normalizeGoogleError } from "./monitor.js";
import type { AuthRepository } from "./repository.js";
import type { GoogleGateway } from "./types.js";
import type { OpenAIAdapter } from "../openai/adapter.js";

function repositoryMock() {
  return {
    getActiveCredentials: vi.fn().mockResolvedValue([
      {
        professorId: "4bb5d98d-f00b-41ac-8969-3ae902ce6f30",
        credential: { refreshToken: "refresh", scopes: [] },
      },
    ]),
    saveCredential: vi.fn(),
    recordIntegrationStatus: vi.fn(),
  };
}

describe("integration monitor", () => {
  it("makes one initial attempt and three additional attempts", async () => {
    const repository = repositoryMock();
    const gateway: GoogleGateway = {
      configured: true,
      createAuthorizationUrl: vi.fn(),
      exchangeCode: vi.fn(),
      probe: vi
        .fn()
        .mockRejectedValue(
          new GoogleGatewayError("SERVICE_DOWN", "Serviço indisponível."),
        ),
      revoke: vi.fn(),
    };
    const monitor = new IntegrationMonitor(
      repository as unknown as AuthRepository,
      gateway,
      300_000,
      { error: vi.fn() },
      async () => undefined,
      {
        isFixture: true,
        checkAvailability: vi.fn().mockResolvedValue({
          status: "deferred",
          errorCode: "OPENAI_EXTERNAL_CHECK_DEFERRED",
        }),
        generateLessonPlan: vi.fn(),
        generateActivity: vi.fn(),
        generateDiscursiveCorrection: vi.fn(),
        generateFeedback: vi.fn(),
      } satisfies OpenAIAdapter,
    );

    await monitor.runCycle();

    expect(gateway.probe).toHaveBeenCalledTimes(12);
    expect(repository.recordIntegrationStatus).toHaveBeenCalledTimes(13);
    expect(repository.recordIntegrationStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        service: "google_forms",
        attemptNumber: 4,
        errorCode: "SERVICE_DOWN",
      }),
    );
    expect(repository.recordIntegrationStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        service: "openai",
        status: "inactive",
        errorCode: "OPENAI_EXTERNAL_CHECK_DEFERRED",
      }),
    );
  });

  it("stops retrying a service after success", async () => {
    const repository = repositoryMock();
    const gateway: GoogleGateway = {
      configured: true,
      createAuthorizationUrl: vi.fn(),
      exchangeCode: vi.fn(),
      probe: vi.fn().mockResolvedValue({ accessToken: "renewed" }),
      revoke: vi.fn(),
    };
    const monitor = new IntegrationMonitor(
      repository as unknown as AuthRepository,
      gateway,
      300_000,
      { error: vi.fn() },
      async () => undefined,
    );

    await monitor.runCycle();

    expect(gateway.probe).toHaveBeenCalledTimes(3);
    expect(repository.saveCredential).toHaveBeenCalledTimes(3);
    expect(repository.recordIntegrationStatus).toHaveBeenCalledTimes(3);
  });

  it("keeps Google's HTTP status and reason and logs the final failure", async () => {
    const repository = repositoryMock();
    const logger = { error: vi.fn() };
    const gateway: GoogleGateway = {
      configured: true,
      createAuthorizationUrl: vi.fn(),
      exchangeCode: vi.fn(),
      probe: vi.fn().mockRejectedValue(
        Object.assign(new Error("Request failed"), {
          response: {
            status: 400,
            data: {
              error: "invalid_grant",
              error_description: "Token has been expired or revoked.",
            },
          },
        }),
      ),
      revoke: vi.fn(),
    };
    const monitor = new IntegrationMonitor(
      repository as unknown as AuthRepository,
      gateway,
      300_000,
      logger,
      async () => undefined,
    );

    await monitor.runCycle();

    expect(repository.recordIntegrationStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        service: "google_oauth",
        errorCode: "GOOGLE_AUTH_INVALID",
        errorMessage:
          "HTTP 400 invalid_grant: Token has been expired or revoked.",
      }),
    );
    expect(logger.error).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        service: "google_forms",
        errorCode: "GOOGLE_AUTH_INVALID",
      }),
      "google integration check failed",
    );
  });

  it("classifies Google API errors by HTTP status", () => {
    const apiError = (status: number, data?: unknown) =>
      Object.assign(new Error("Request failed"), {
        response: { status, data },
      });

    expect(normalizeGoogleError(apiError(401)).code).toBe(
      "GOOGLE_AUTH_INVALID",
    );
    expect(
      normalizeGoogleError(
        apiError(403, {
          error: {
            status: "PERMISSION_DENIED",
            message: "Insufficient scopes.",
            details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }],
          },
        }),
      ),
    ).toEqual({
      code: "GOOGLE_PERMISSION_DENIED",
      message:
        "HTTP 403 PERMISSION_DENIED: ACCESS_TOKEN_SCOPE_INSUFFICIENT: Insufficient scopes.",
    });
    expect(normalizeGoogleError(apiError(404)).code).toBe(
      "GOOGLE_RESOURCE_NOT_FOUND",
    );
    expect(normalizeGoogleError(apiError(503)).code).toBe(
      "GOOGLE_SERVICE_UNAVAILABLE",
    );
    expect(normalizeGoogleError(new Error("socket hang up"))).toEqual({
      code: "GOOGLE_SERVICE_UNAVAILABLE",
      message: "Serviço Google temporariamente indisponível: socket hang up",
    });
  });

  it("checks Google services independently for every active professor", async () => {
    const repository = repositoryMock();
    repository.getActiveCredentials.mockResolvedValue([
      {
        professorId: "5d73ea1d-9ab8-4384-960e-3a6f00e6328a",
        credential: { refreshToken: "refresh-a", scopes: [] },
      },
      {
        professorId: "4bb5d98d-f00b-41ac-8969-3ae902ce6f30",
        credential: { refreshToken: "refresh-b", scopes: [] },
      },
    ]);
    const gateway: GoogleGateway = {
      configured: true,
      createAuthorizationUrl: vi.fn(),
      exchangeCode: vi.fn(),
      probe: vi.fn().mockResolvedValue({}),
      revoke: vi.fn(),
    };
    const monitor = new IntegrationMonitor(
      repository as unknown as AuthRepository,
      gateway,
      300_000,
      { error: vi.fn() },
      async () => undefined,
    );

    await monitor.runCycle();

    expect(gateway.probe).toHaveBeenCalledTimes(6);
    expect(repository.recordIntegrationStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        professorId: "5d73ea1d-9ab8-4384-960e-3a6f00e6328a",
      }),
    );
    expect(repository.recordIntegrationStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        professorId: "4bb5d98d-f00b-41ac-8969-3ae902ce6f30",
      }),
    );
  });
});
