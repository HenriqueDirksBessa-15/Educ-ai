import { describe, expect, it } from "vitest";

import { loadRootEnvironment } from "../../src/config.js";
import { ConfiguredOpenAIAdapter } from "../../src/openai/adapter.js";

loadRootEnvironment();

const apiKey = process.env.OPENAI_API_KEY;
const enabled =
  process.env.RUN_OPENAI_INTEGRATION === "true" && Boolean(apiKey);
const describeWithOpenAI = enabled ? describe : describe.skip;

describeWithOpenAI("OpenAI Responses API", () => {
  const adapter = new ConfiguredOpenAIAdapter({
    apiKey,
    baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
  });

  it("validates the key and generates a structured lesson plan", async () => {
    await expect(adapter.checkAvailability()).resolves.toEqual({
      status: "available",
      errorCode: null,
    });

    const result = await adapter.generateLessonPlan({
      title: "Frações equivalentes",
      curricularComponent: "Matemática",
      schoolYear: "5º ano",
      objectives: "Reconhecer frações equivalentes.",
      contents: "Representações numéricas e visuais.",
      methodology: "Problemas curtos em duplas.",
      evaluationStrategy: "Registro individual ao final.",
      syllabus: "Números racionais e suas representações.",
      bnccCodes: ["EF05MA03"],
      materials: ["Cartões de frações"],
    });

    expect(result.origin).toBe("openai");
    expect(result.suggestion.title.length).toBeGreaterThan(0);
    expect(result.suggestion.methodology.length).toBeGreaterThan(0);
  }, 60_000);
});
