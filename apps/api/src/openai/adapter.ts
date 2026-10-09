import type {
  LessonPlanSuggestion,
  OpenAiAvailability,
} from "@educai/contracts";
import { lessonPlanSuggestionSchema } from "@educai/contracts";

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
  constructor(
    private readonly config: AppConfig["openai"],
    private readonly fetcher: typeof fetch = globalThis.fetch,
  ) {}

  async checkAvailability(): Promise<OpenAiAvailability> {
    if (!this.config.apiKey) {
      return { status: "missing", errorCode: "OPENAI_API_KEY_MISSING" };
    }

    try {
      const response = await this.fetcher(`${this.baseUrl()}/models`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok)
        return normalizeOpenAIError(new Error(String(response.status)));
      return { status: "available", errorCode: null };
    } catch (error) {
      return normalizeOpenAIError(error);
    }
  }

  async generateLessonPlan(
    context: LessonPlanPromptContext,
  ): Promise<LessonPlanGenerationResult> {
    if (!this.config.apiKey)
      throw new OpenAIPlanGenerationError("OPENAI_API_KEY_MISSING");

    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl()}/responses`, {
        method: "POST",
        headers: { ...this.headers(), "content-type": "application/json" },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          model: this.config.model,
          input: [
            {
              role: "developer",
              content:
                "Você auxilia professores brasileiros a revisar planos de aula. Preserve a intenção docente, use apenas o contexto fornecido e devolva todos os campos em português do Brasil.",
            },
            {
              role: "user",
              content: buildLessonPlanPrompt(context),
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "lesson_plan_suggestion",
              strict: true,
              schema: lessonPlanJsonSchema,
            },
          },
        }),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError")
        throw new OpenAIPlanGenerationError("OPENAI_TIMEOUT");
      throw new OpenAIPlanGenerationError("OPENAI_SERVICE_UNAVAILABLE");
    }

    if (!response.ok) {
      if (response.status === 401)
        throw new OpenAIPlanGenerationError("OPENAI_API_KEY_INVALID");
      if (response.status === 429)
        throw new OpenAIPlanGenerationError("OPENAI_RATE_LIMITED");
      throw new OpenAIPlanGenerationError("OPENAI_SERVICE_UNAVAILABLE");
    }

    const payload = (await response.json()) as unknown;
    const outputText = extractOutputText(payload);
    if (!outputText)
      throw new OpenAIPlanGenerationError("OPENAI_INVALID_RESPONSE");
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(outputText);
    } catch {
      throw new OpenAIPlanGenerationError("OPENAI_INVALID_RESPONSE");
    }
    const parsed = lessonPlanSuggestionSchema.safeParse(parsedJson);
    if (!parsed.success)
      throw new OpenAIPlanGenerationError("OPENAI_INVALID_RESPONSE");
    return {
      suggestion: parsed.data,
      model: this.config.model,
      origin: "openai",
    };
  }

  private baseUrl(): string {
    return this.config.baseUrl.replace(/\/$/, "");
  }

  private headers(): Record<string, string> {
    return { authorization: `Bearer ${this.config.apiKey}` };
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

const lessonPlanJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "objectives",
    "contents",
    "methodology",
    "evaluationStrategy",
  ],
  properties: {
    title: { type: "string" },
    objectives: { type: "string" },
    contents: { type: "string" },
    methodology: { type: "string" },
    evaluationStrategy: { type: "string" },
  },
} as const;

function buildLessonPlanPrompt(context: LessonPlanPromptContext): string {
  return [
    `Título atual: ${context.title}`,
    `Componente curricular: ${context.curricularComponent}`,
    `Ano escolar: ${context.schoolYear}`,
    `Ementa: ${context.syllabus}`,
    `Habilidades BNCC permitidas: ${context.bnccCodes.join(", ") || "nenhuma informada"}`,
    `Materiais permitidos: ${context.materials.join(", ") || "nenhum informado"}`,
    `Objetivos atuais: ${context.objectives}`,
    `Conteúdos atuais: ${context.contents}`,
    `Metodologia atual: ${context.methodology}`,
    `Avaliação atual: ${context.evaluationStrategy}`,
    "Proponha uma versão revisada e pedagogicamente coerente sem inventar habilidades BNCC ou materiais.",
  ].join("\n\n");
}

function extractOutputText(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.output)) return null;
  for (const item of payload.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (
        isRecord(content) &&
        content.type === "output_text" &&
        typeof content.text === "string"
      )
        return content.text;
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
