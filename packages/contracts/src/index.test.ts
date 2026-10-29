import { describe, expect, it } from "vitest";

import {
  activityCollectionSummarySchema,
  feedbackCreateSchema,
  bulletinCreateSchema,
  apiErrorSchema,
  activityInputSchema,
  authSessionSchema,
  curriculumSearchResponseSchema,
  classCurriculumInputSchema,
  classCreateSchema,
  identitySchema,
  integrationStatusSchema,
  lessonPlanInputSchema,
  materialFileMetadataSchema,
  materialLinkInputSchema,
  materialSchema,
  professorProfileUpdateSchema,
  readyResponseSchema,
} from "./index.js";

describe("shared contracts", () => {
  it("validates a complete teacher-authored lesson plan", () => {
    const input = {
      title: "Frações na prática",
      curricularComponent: "Matemática",
      schoolYear: "8º ano EF",
      objectives: "Resolver problemas com frações.",
      contents: "Frações equivalentes.",
      methodology: "Investigação em grupos.",
      evaluationStrategy: "Registro e discussão coletiva.",
      durationMinutes: 100,
      references: "Material autoral e BNCC.",
      classIds: ["11111111-1111-4111-8111-111111111111"],
      syllabusId: "21111111-1111-4111-8111-111111111111",
      bnccSkillIds: ["31111111-1111-4111-8111-111111111111"],
      materialIds: ["41111111-1111-4111-8111-111111111111"],
    };

    expect(lessonPlanInputSchema.parse(input).durationMinutes).toBe(100);
    expect(() =>
      lessonPlanInputSchema.parse({ ...input, durationMinutes: 0 }),
    ).toThrow();
    expect(() =>
      lessonPlanInputSchema.parse({ ...input, durationMinutes: 601 }),
    ).toThrow();
  });

  it("accepts curriculum ids derived from hashes, as stored in PostgreSQL", () => {
    // IDs reais da BNCC importada em produção: formato 8-4-4-4-12 sem versão RFC.
    const input = {
      title: "Frações na prática",
      curricularComponent: "Matemática",
      schoolYear: "ef-ano-06",
      objectives: "Resolver problemas com frações.",
      contents: "Frações equivalentes.",
      methodology: "Investigação em grupos.",
      evaluationStrategy: "Registro e discussão coletiva.",
      classIds: ["dbcb1b70-6091-4e58-9b23-be4136f0e3c3"],
      syllabusId: "077f455a-1a5f-d7a2-6e0e-8c4899e06d41",
      bnccSkillIds: ["52531744-722f-08a4-ba65-fbd06fbc2c5c"],
    };

    expect(lessonPlanInputSchema.parse(input).syllabusId).toBe(
      "077f455a-1a5f-d7a2-6e0e-8c4899e06d41",
    );
    expect(() =>
      lessonPlanInputSchema.parse({ ...input, syllabusId: "077f455a" }),
    ).toThrow();
    expect(() =>
      lessonPlanInputSchema.parse({ ...input, bnccSkillIds: ["não-é-id"] }),
    ).toThrow();
  });

  it("accepts only unique HTTP(S) links bound to classes", () => {
    const valid = {
      title: "Guia de frações",
      description: "Leitura complementar.",
      category: "reading" as const,
      classIds: ["11111111-1111-4111-8111-111111111111"],
      bnccSkillIds: ["21111111-1111-4111-8111-111111111111"],
      url: "https://example.invalid/guia",
    };

    expect(materialLinkInputSchema.parse(valid).url).toBe(valid.url);
    expect(() =>
      materialLinkInputSchema.parse({ ...valid, url: "file:///segredo.pdf" }),
    ).toThrow();
    expect(() =>
      materialLinkInputSchema.parse({
        ...valid,
        classIds: [valid.classIds[0], valid.classIds[0]],
      }),
    ).toThrow();
    expect(() =>
      materialLinkInputSchema.parse({ ...valid, storageKey: "private/key" }),
    ).toThrow();
  });

  it("validates private file metadata without accepting storage identifiers", () => {
    const metadata = {
      title: "Guia privado",
      category: "reading" as const,
      classIds: ["11111111-1111-4111-8111-111111111111"],
      bnccSkillIds: [],
    };

    expect(materialFileMetadataSchema.parse(metadata)).toEqual(metadata);
    expect(() =>
      materialFileMetadataSchema.parse({
        ...metadata,
        category: "link",
      }),
    ).toThrow();
    expect(() =>
      materialFileMetadataSchema.parse({
        ...metadata,
        storageKey: "private/key",
      }),
    ).toThrow();
    expect(
      materialSchema.parse({
        ...metadata,
        id: "21111111-1111-4111-8111-111111111111",
        description: null,
        url: null,
        fileName: "guia.pdf",
        mimeType: "application/pdf",
        sizeBytes: 4,
        classNames: ["8º A"],
        isArchived: false,
        hasPublishedContent: false,
        createdAt: "2026-10-16T00:00:00.000Z",
        storageKey: "private/key",
      }),
    ).not.toHaveProperty("storageKey");
  });

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

  it("validates an explicit multi-component class curriculum profile", () => {
    expect(
      classCurriculumInputSchema.parse({
        educationStage: "elementary_2",
        schoolYear: "8º ano EF",
        curricularComponents: ["Matemática", "Ciências"],
      }),
    ).toEqual({
      educationStage: "elementary_2",
      schoolYear: "8º ano EF",
      curricularComponents: ["Matemática", "Ciências"],
    });
    expect(() =>
      classCurriculumInputSchema.parse({
        educationStage: "elementary_2",
        schoolYear: "8º ano EF",
        curricularComponents: ["Matemática", "Matemática"],
      }),
    ).toThrow();
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

  it("validates collection summaries and objective grades from 0 to 10", () => {
    const summary = {
      activityId: "11111111-1111-4111-8111-111111111111",
      status: "completed",
      scheduledAt: "2026-10-16T12:00:00.000Z",
      attemptCount: 1,
      lastErrorCode: null,
      completedAt: "2026-10-16T12:01:00.000Z",
      submissionCount: 1,
      gradedCount: 1,
      manualReviewCount: 0,
      submissions: [
        {
          id: "21111111-1111-4111-8111-111111111111",
          activityId: "11111111-1111-4111-8111-111111111111",
          studentId: "31111111-1111-4111-8111-111111111111",
          studentName: "Aluno Teste",
          externalResponseId: "response-1",
          respondentEmail: "aluno@example.test",
          submittedAt: "2026-10-16T11:50:00.000Z",
          status: "objective_graded",
          manualReviewReason: null,
          objectivePointsAwarded: 2,
          objectivePointsPossible: 2,
          grade: 10,
          correctionStatus: "approved",
          teacherComment: "Correção revisada.",
          approvedAt: "2026-10-16T12:01:00.000Z",
          releasedAt: null,
          classroomReturnStatus: "pending",
          classroomReturnErrorCode: null,
          correctionHistory: [],
          answers: [],
        },
      ],
    };
    expect(activityCollectionSummarySchema.parse(summary).gradedCount).toBe(1);
    expect(() =>
      activityCollectionSummarySchema.parse({
        ...summary,
        submissions: [{ ...summary.submissions[0], grade: 11 }],
      }),
    ).toThrow();
  });

  it("distinguishes individual feedback from a global class notice", () => {
    expect(
      feedbackCreateSchema.parse({
        scope: "individual",
        submissionId: "11111111-1111-4111-8111-111111111111",
        title: "Retorno",
        content: "Continue praticando.",
        links: [],
        materialIds: [],
      }).scope,
    ).toBe("individual");
    expect(() =>
      feedbackCreateSchema.parse({
        scope: "global",
        title: "Aviso",
        content: "Mensagem para a turma.",
      }),
    ).toThrow();
  });

  it("validates bulletin periods and requires an explicit average threshold", () => {
    const base = {
      classId: "11111111-1111-4111-8111-111111111111",
      studentIds: ["21111111-1111-4111-8111-111111111111"],
      periodType: "monthly" as const,
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      title: "Boletim de outubro",
    };
    expect(bulletinCreateSchema.parse(base).periodType).toBe("monthly");
    expect(() =>
      bulletinCreateSchema.parse({ ...base, onlyBelowAverage: true }),
    ).toThrow();
    expect(() =>
      bulletinCreateSchema.parse({
        ...base,
        periodStart: "2026-11-01",
        periodEnd: "2026-10-31",
      }),
    ).toThrow();
  });
});
