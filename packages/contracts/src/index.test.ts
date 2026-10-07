import { describe, expect, it } from "vitest";

import {
  apiErrorSchema,
  identitySchema,
  readyResponseSchema,
} from "./index.js";

describe("shared contracts", () => {
  it("requires Google as the identity provider", () => {
    expect(() =>
      identitySchema.parse({
        professorId: "5d73ea1d-9ab8-4384-960e-3a6f00e6328a",
        email: "professor@example.invalid",
        displayName: "Professor Fictício",
        provider: "password",
      }),
    ).toThrow();
  });

  it("represents a database readiness failure without technical details", () => {
    expect(
      readyResponseSchema.parse({
        status: "not_ready",
        service: "educai-api",
        database: "unavailable",
        timestamp: new Date().toISOString(),
      }).database,
    ).toBe("unavailable");
  });

  it("validates the standard error envelope", () => {
    expect(
      apiErrorSchema.parse({
        error: {
          code: "VALIDATION_ERROR",
          message: "Dados inválidos.",
        },
      }).error.code,
    ).toBe("VALIDATION_ERROR");
  });
});
