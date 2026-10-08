import { describe, expect, it, vi } from "vitest";

import { GoogleGatewayError } from "./google-gateway.js";
import { IntegrationMonitor } from "./monitor.js";
import type { AuthRepository } from "./repository.js";
import type { GoogleGateway } from "./types.js";

function repositoryMock() {
  return {
    getLatestCredential: vi.fn().mockResolvedValue({
      professorId: "4bb5d98d-f00b-41ac-8969-3ae902ce6f30",
      credential: { refreshToken: "refresh", scopes: [] },
    }),
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
    );

    await monitor.runCycle();

    expect(gateway.probe).toHaveBeenCalledTimes(12);
    expect(repository.recordIntegrationStatus).toHaveBeenCalledTimes(12);
    expect(repository.recordIntegrationStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        service: "google_forms",
        attemptNumber: 4,
        errorCode: "SERVICE_DOWN",
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
});
