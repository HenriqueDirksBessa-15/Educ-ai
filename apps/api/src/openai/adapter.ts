import type {
  LessonPlanSuggestion,
  OpenAiAvailability,
} from "@educai/contracts";

import type { AppConfig } from "../config.js";

export type OpenAIAdapter = {
  checkAvailability(): Promise<OpenAiAvailability>;
  generateLessonPlan(
    context: LessonPlanPromptContext,
  ): Promise<LessonPlanGenerationResult>;
};

export type LessonPlanPromptContext = {
  title: string;
  curricularComponent: string;
  schoolYear: string;
  objectives: string;
  contents: string;
  methodology: string;
  evaluationStrategy: string;
  syllabus: string;
  bnccCodes: string[];
  materials: string[];
};

export type LessonPlanGenerationResult = {
  suggestion: LessonPlanSuggestion;
  model: string;
  origin: "fixture" | "openai";
};

export class OpenAIPlanGenerationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "OpenAIPlanGenerationError";
  }
}

export class ConfiguredOpenAIAdapter implements OpenAIAdapter {
  constructor(private readonly config: AppConfig["openai"]) {}

  async checkAvailability(): Promise<OpenAiAvailability> {
    if (!this.config.apiKey) {
      return { status: "missing", errorCode: "OPENAI_API_KEY_MISSING" };
    }

    // Integrações OpenAI reais permanecem bloqueadas até 12/10.
    return {
      status: "deferred",
      errorCode: "OPENAI_EXTERNAL_CHECK_DEFERRED",
    };
  }

  async generateLessonPlan(): Promise<LessonPlanGenerationResult> {
    if (!this.config.apiKey)
      throw new OpenAIPlanGenerationError("OPENAI_API_KEY_MISSING");
    throw new OpenAIPlanGenerationError("OPENAI_EXTERNAL_GENERATION_DEFERRED");
  }
}

export class FixtureOpenAIAdapter implements OpenAIAdapter {
  constructor(
    private readonly result: OpenAiAvailability = {
      status: "available",
      errorCode: null,
    },
  ) {}

  async checkAvailability(): Promise<OpenAiAvailability> {
    return this.result;
  }

  async generateLessonPlan(
    context: LessonPlanPromptContext,
  ): Promise<LessonPlanGenerationResult> {
    return {
      model: "fixture-lesson-plan-v1",
      origin: "fixture",
      suggestion: {
        title: `${context.title} — proposta assistida`,
        objectives: `${context.objectives}\nAlinhar a aprendizagem à ementa e às habilidades ${context.bnccCodes.join(", ") || "selecionadas pelo professor"}.`,
        contents: `${context.contents}\nReferência curricular: ${context.syllabus}`,
        methodology: `${context.methodology}\nOrganizar abertura, prática guiada e síntese com participação ativa da turma.`,
        evaluationStrategy: `${context.evaluationStrategy}\nRegistrar evidências durante a aula e revisar os resultados ao final.`,
      },
    };
  }
}

export function normalizeOpenAIError(error: unknown): OpenAiAvailability {
  if (error instanceof Error && error.message.includes("401")) {
    return { status: "unavailable", errorCode: "OPENAI_API_KEY_INVALID" };
  }
  if (error instanceof Error && error.message.includes("429")) {
    return { status: "unavailable", errorCode: "OPENAI_RATE_LIMITED" };
  }
  return { status: "unavailable", errorCode: "OPENAI_SERVICE_UNAVAILABLE" };
}
