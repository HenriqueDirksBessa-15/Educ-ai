import { describe, expect, it } from "vitest";

import {
  apiErrorSchema,
  authSessionSchema,
  curriculumSearchResponseSchema,
  identitySchema,
  integrationStatusSchema,
  professorProfileUpdateSchema,
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

  it("distinguishes anonymous and authenticated sessions", () => {
    expect(authSessionSchema.parse({ authenticated: false })).toEqual({
      authenticated: false,
    });
    expect(
      authSessionSchema.parse({
        authenticated: true,
        identity: {
          professorId: "5d73ea1d-9ab8-4384-960e-3a6f00e6328a",
          email: "professor@example.invalid",
          displayName: "Professor Fictício",
          provider: "google",
        },
      }).authenticated,
    ).toBe(true);
  });

  it("exposes normalized integration state without technical messages", () => {
    const parsed = integrationStatusSchema.parse({
      service: "google_classroom",
      status: "inactive",
      checkedAt: new Date().toISOString(),
      errorCode: "GOOGLE_SERVICE_UNAVAILABLE",
    });
    expect(parsed.status).toBe("inactive");
    expect(parsed).not.toHaveProperty("errorMessage");
  });

  it("does not accept Google-controlled email in profile updates", () => {
    expect(() =>
      professorProfileUpdateSchema.parse({ email: "new@example.invalid" }),
    ).toThrow();
    expect(
      professorProfileUpdateSchema.parse({ displayName: "Novo nome" }),
    ).toEqual({ displayName: "Novo nome" });
  });

  it("represents a curricular fallback without inventing an official skill", () => {
    const response = curriculumSearchResponseSchema.parse({
      data: [],
      reviewRequired: true,
      reason: "SKILL_NOT_FOUND",
    });
    expect(response.reviewRequired).toBe(true);
  });
});
