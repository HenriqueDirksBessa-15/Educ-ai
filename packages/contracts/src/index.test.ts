import { describe, expect, it } from "vitest";

import {
  apiErrorSchema,
  activityInputSchema,
  authSessionSchema,
  curriculumSearchResponseSchema,
  classCreateSchema,
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

  it("requires a local access code and rejects Google-controlled fields", () => {
    expect(
      classCreateSchema.parse({
        name: "5º ano",
        schoolYear: "2026",
        localAccessCode: "TURMA-2026",
      }).localAccessCode,
    ).toBe("TURMA-2026");
    const parsed = classCreateSchema.parse({
      name: "5º ano",
      schoolYear: "2026",
      localAccessCode: "TURMA-2026",
      googleClassroomId: "google-controlled",
    });
    expect(parsed).not.toHaveProperty("googleClassroomId");
  });

  it("validates objective, discursive and mixed activities without AI", () => {
    const base = {
      lessonPlanId: "11111111-1111-4111-8111-111111111111",
      title: "Avaliação de frações",
      description: "Responda com atenção.",
      difficulty: "medium" as const,
      dueAt: "2026-10-20T18:00:00.000Z",
      latePolicy: { mode: "blocked" as const },
    };
    const objective = {
      kind: "objective" as const,
      prompt: "Qual fração representa metade?",
      points: 2,
      alternatives: ["1/2", "1/3"],
      correctAlternativeIndex: 0,
    };
    const discursive = {
      kind: "discursive" as const,
      prompt: "Explique como comparar duas frações.",
      points: 3,
      targetAnswer: "Usar denominadores equivalentes.",
      criteria: "Estratégia correta e justificativa clara.",
    };

    expect(
      activityInputSchema.parse({
        ...base,
        type: "objective",
        questions: [objective],
      }).type,
    ).toBe("objective");
    expect(
      activityInputSchema.parse({
        ...base,
        type: "discursive",
        questions: [discursive],
      }).questions[0]?.kind,
    ).toBe("discursive");
    expect(
      activityInputSchema.parse({
        ...base,
        type: "mixed",
        latePolicy: {
          mode: "allowed_with_penalty",
          penaltyPercent: 10,
        },
        questions: [objective, discursive],
      }).questions,
    ).toHaveLength(2);
  });

  it("rejects a mismatched activity type and an invalid answer key", () => {
    const base = {
      lessonPlanId: "11111111-1111-4111-8111-111111111111",
      title: "Avaliação",
      description: "Descrição",
      difficulty: "hard" as const,
      dueAt: "2026-10-20T18:00:00.000Z",
      latePolicy: { mode: "blocked" as const },
      questions: [
        {
          kind: "objective" as const,
          prompt: "Questão",
          points: 1,
          alternatives: ["A", "B"],
          correctAlternativeIndex: 3,
        },
      ],
    };
    expect(() =>
      activityInputSchema.parse({ ...base, type: "discursive" }),
    ).toThrow();
    expect(() =>
      activityInputSchema.parse({ ...base, type: "objective" }),
    ).toThrow();
  });
});
