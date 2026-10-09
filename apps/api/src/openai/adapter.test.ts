import { describe, expect, it, vi } from "vitest";

import {
  ConfiguredOpenAIAdapter,
  FixtureOpenAIAdapter,
  normalizeOpenAIError,
} from "./adapter.js";

describe("OpenAI adapter boundary", () => {
  it("blocks external verification when the key is absent", async () => {
    await expect(
      new ConfiguredOpenAIAdapter({
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-5-mini",
      }).checkAvailability(),
    ).resolves.toEqual({
      status: "missing",
      errorCode: "OPENAI_API_KEY_MISSING",
    });
  });

  it("verifies a configured key against the models endpoint", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      );
    await expect(
      new ConfiguredOpenAIAdapter(
        {
          apiKey: "fixture-key",
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-5-mini",
        },
        fetcher as typeof fetch,
      ).checkAvailability(),
    ).resolves.toEqual({
      status: "available",
      errorCode: null,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models",
      expect.objectContaining({
        headers: { authorization: "Bearer fixture-key" },
      }),
    );
  });

  it("supports explicit fixtures and normalizes known failures", async () => {
    await expect(
      new FixtureOpenAIAdapter().checkAvailability(),
    ).resolves.toEqual({
      status: "available",
      errorCode: null,
    });
    expect(normalizeOpenAIError(new Error("401 unauthorized"))).toEqual({
      status: "unavailable",
      errorCode: "OPENAI_API_KEY_INVALID",
    });
  });

  it("returns a structured fixture suggestion without an external call", async () => {
    const result = await new FixtureOpenAIAdapter().generateLessonPlan({
      title: "Frações",
      curricularComponent: "Matemática",
      schoolYear: "5º ano",
      objectives: "Compreender frações.",
      contents: "Representação fracionária.",
      methodology: "Situações-problema.",
      evaluationStrategy: "Registro e discussão.",
      syllabus: "Números e operações.",
      bnccCodes: ["EF05MA03"],
      materials: ["Guia"],
    });

    expect(result.origin).toBe("fixture");
    expect(result.suggestion.title).toContain("Frações");
    expect(result.suggestion.objectives).toContain("EF05MA03");
  });

  it("generates a mixed activity fixture with the requested count", async () => {
    const result = await new FixtureOpenAIAdapter().generateActivity({
      activityTitle: "Atividade de frações",
      activityDescription: "Resolva e explique.",
      activityType: "mixed",
      difficulty: "medium",
      questionCount: 4,
      lessonPlanTitle: "Frações",
      curricularComponent: "Matemática",
      schoolYear: "5º ano",
      objectives: "Comparar frações.",
      contents: "Frações equivalentes.",
      evaluationStrategy: "Avaliação formativa.",
      syllabus: "Números.",
      bnccCodes: ["EF05MA03"],
      materials: ["Guia"],
    });

    expect(result.origin).toBe("fixture");
    expect(result.suggestion.questions).toHaveLength(4);
    expect(
      result.suggestion.questions.map((question) => question.kind),
    ).toEqual(["objective", "discursive", "objective", "discursive"]);
  });

  it("uses Responses structured output and validates the result", async () => {
    const suggestion = {
      title: "Frações revisadas",
      objectives: "Compreender frações equivalentes.",
      contents: "Representações de frações.",
      methodology: "Resolução colaborativa.",
      evaluationStrategy: "Rubrica e registro.",
    };
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              type: "message",
              content: [
                { type: "output_text", text: JSON.stringify(suggestion) },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const adapter = new ConfiguredOpenAIAdapter(
      {
        apiKey: "fixture-key",
        baseUrl: "https://api.openai.com/v1/",
        model: "gpt-5-mini",
      },
      fetcher as typeof fetch,
    );

    await expect(
      adapter.generateLessonPlan({
        title: "Frações",
        curricularComponent: "Matemática",
        schoolYear: "5º ano",
        objectives: "Compreender frações.",
        contents: "Representação fracionária.",
        methodology: "Situações-problema.",
        evaluationStrategy: "Registro e discussão.",
        syllabus: "Números e operações.",
        bnccCodes: ["EF05MA03"],
        materials: ["Guia"],
      }),
    ).resolves.toEqual({
      suggestion,
      model: "gpt-5-mini",
      origin: "openai",
    });

    const [, request] = fetcher.mock.calls[0]!;
    const body = JSON.parse(String(request.body)) as {
      text: { format: { type: string; strict: boolean } };
    };
    expect(body.text.format).toMatchObject({
      type: "json_schema",
      strict: true,
    });
  });

  it("validates a structured activity response", async () => {
    const suggestion = {
      title: "Atividade de frações",
      description: "Resolva.",
      type: "objective",
      difficulty: "easy",
      questions: [
        {
          kind: "objective",
          prompt: "Qual representa metade?",
          points: 1,
          alternatives: ["1/2", "1/3"],
          correctAlternativeIndex: 0,
        },
      ],
    };
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              content: [
                { type: "output_text", text: JSON.stringify(suggestion) },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const adapter = new ConfiguredOpenAIAdapter(
      {
        apiKey: "fixture-key",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-5-mini",
      },
      fetcher as typeof fetch,
    );

    await expect(
      adapter.generateActivity({
        activityTitle: suggestion.title,
        activityDescription: suggestion.description,
        activityType: "objective",
        difficulty: "easy",
        questionCount: 1,
        lessonPlanTitle: "Frações",
        curricularComponent: "Matemática",
        schoolYear: "5º ano",
        objectives: "Compreender frações.",
        contents: "Frações equivalentes.",
        evaluationStrategy: "Atividade.",
        syllabus: "Números.",
        bnccCodes: ["EF05MA03"],
        materials: [],
      }),
    ).resolves.toEqual({
      suggestion,
      model: "gpt-5-mini",
      origin: "openai",
    });
  });
});
