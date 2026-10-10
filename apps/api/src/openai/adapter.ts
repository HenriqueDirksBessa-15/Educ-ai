import type {
  ActivitySuggestion,
  DiscursiveCorrectionSuggestion,
  CorrectionRigour,
  LessonPlanSuggestion,
  OpenAiAvailability,
} from "@educai/contracts";
import {
  activitySuggestionSchema,
  discursiveCorrectionSuggestionSchema,
  lessonPlanSuggestionSchema,
} from "@educai/contracts";

import type { AppConfig } from "../config.js";

export type OpenAIAdapter = {
  readonly isFixture: boolean;
  checkAvailability(): Promise<OpenAiAvailability>;
  generateLessonPlan(
    context: LessonPlanPromptContext,
  ): Promise<LessonPlanGenerationResult>;
  generateActivity(
    context: ActivityPromptContext,
  ): Promise<ActivityGenerationResult>;
  generateDiscursiveCorrection(
    context: DiscursiveCorrectionPromptContext,
  ): Promise<DiscursiveCorrectionResult>;
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

export type ActivityPromptContext = {
  activityTitle: string;
  activityDescription: string;
  activityType: "objective" | "discursive" | "mixed";
  difficulty: "easy" | "medium" | "hard";
  questionCount: number;
  lessonPlanTitle: string;
  curricularComponent: string;
  schoolYear: string;
  objectives: string;
  contents: string;
  evaluationStrategy: string;
  syllabus: string;
  bnccCodes: string[];
  materials: string[];
};

export type ActivityGenerationResult = {
  suggestion: ActivitySuggestion;
  model: string;
  origin: "fixture" | "openai";
};

export type DiscursiveCorrectionPromptContext = {
  question: string;
  answer: string;
  targetAnswer: string | null;
  criteria: string;
  maxPoints: number;
  rigour: CorrectionRigour;
  schoolYear: string;
  difficulty: "easy" | "medium" | "hard";
  content: string;
};

export type DiscursiveCorrectionResult = {
  suggestion: DiscursiveCorrectionSuggestion;
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
  readonly isFixture = false;
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

  async generateActivity(
    context: ActivityPromptContext,
  ): Promise<ActivityGenerationResult> {
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
                "Você cria avaliações para professores brasileiros. Use somente o contexto fornecido, respeite exatamente o tipo, a dificuldade e a quantidade solicitados e responda em português do Brasil.",
            },
            { role: "user", content: buildActivityPrompt(context) },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "activity_suggestion",
              strict: true,
              schema: activityJsonSchema,
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
    const parsed = activitySuggestionSchema.safeParse(parsedJson);
    if (
      !parsed.success ||
      parsed.data.questions.length !== context.questionCount
    )
      throw new OpenAIPlanGenerationError("OPENAI_INVALID_RESPONSE");
    return {
      suggestion: parsed.data,
      model: this.config.model,
      origin: "openai",
    };
  }

  async generateDiscursiveCorrection(
    context: DiscursiveCorrectionPromptContext,
  ): Promise<DiscursiveCorrectionResult> {
    assertDiscursiveAnswer(context.answer);
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
                "Você sugere correções discursivas para professores brasileiros. Não tome a decisão final, use somente os critérios fornecidos e sinalize incerteza.",
            },
            { role: "user", content: buildDiscursiveCorrectionPrompt(context) },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "discursive_correction_suggestion",
              strict: true,
              schema: discursiveCorrectionJsonSchema,
            },
          },
        }),
      });
    } catch (error) {
      if (error instanceof OpenAIPlanGenerationError) throw error;
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
    const outputText = extractOutputText((await response.json()) as unknown);
    if (!outputText)
      throw new OpenAIPlanGenerationError("OPENAI_INVALID_RESPONSE");
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(outputText);
    } catch {
      throw new OpenAIPlanGenerationError("OPENAI_INVALID_RESPONSE");
    }
    const parsed = discursiveCorrectionSuggestionSchema.safeParse(parsedJson);
    if (!parsed.success || parsed.data.pointsAwarded > context.maxPoints)
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
  readonly isFixture = true;
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

  async generateActivity(
    context: ActivityPromptContext,
  ): Promise<ActivityGenerationResult> {
    const objective = (position: number) => ({
      kind: "objective" as const,
      prompt: `Questão objetiva ${position + 1} sobre ${context.contents}`,
      points: 1,
      alternatives: ["Alternativa correta", "Alternativa incorreta"],
      correctAlternativeIndex: 0,
    });
    const discursive = (position: number) => ({
      kind: "discursive" as const,
      prompt: `Explique o conteúdo ${context.contents} na questão ${position + 1}.`,
      points: 1,
      targetAnswer: `Resposta fundamentada nos objetivos: ${context.objectives}`,
      criteria: "Clareza, correção conceitual e justificativa.",
    });
    const questions = Array.from(
      { length: context.questionCount },
      (_, index) => {
        if (context.activityType === "objective") return objective(index);
        if (context.activityType === "discursive") return discursive(index);
        return index % 2 === 0 ? objective(index) : discursive(index);
      },
    );
    return {
      model: "fixture-activity-v1",
      origin: "fixture",
      suggestion: {
        title: context.activityTitle,
        description: context.activityDescription,
        type: context.activityType,
        difficulty: context.difficulty,
        questions,
      },
    };
  }

  async generateDiscursiveCorrection(
    context: DiscursiveCorrectionPromptContext,
  ): Promise<DiscursiveCorrectionResult> {
    assertDiscursiveAnswer(context.answer);
    const ratio =
      context.rigour === "supportive"
        ? 0.9
        : context.rigour === "balanced"
          ? 0.75
          : 0.6;
    return {
      model: "fixture-discursive-correction-v1",
      origin: "fixture",
      suggestion: {
        pointsAwarded: round2(context.maxPoints * ratio),
        comment: `A resposta aborda o enunciado. Revise a aderência a: ${context.criteria}`,
        requiresReview: true,
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

const activityJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "description", "type", "difficulty", "questions"],
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    type: { type: "string", enum: ["objective", "discursive", "mixed"] },
    difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
    questions: {
      type: "array",
      items: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            required: [
              "kind",
              "prompt",
              "points",
              "alternatives",
              "correctAlternativeIndex",
            ],
            properties: {
              kind: { type: "string", enum: ["objective"] },
              prompt: { type: "string" },
              points: { type: "number", exclusiveMinimum: 0 },
              alternatives: {
                type: "array",
                minItems: 2,
                maxItems: 10,
                items: { type: "string" },
              },
              correctAlternativeIndex: { type: "integer", minimum: 0 },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["kind", "prompt", "points", "targetAnswer", "criteria"],
            properties: {
              kind: { type: "string", enum: ["discursive"] },
              prompt: { type: "string" },
              points: { type: "number", exclusiveMinimum: 0 },
              targetAnswer: { type: "string" },
              criteria: { type: "string" },
            },
          },
        ],
      },
    },
  },
} as const;

const discursiveCorrectionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["pointsAwarded", "comment", "requiresReview"],
  properties: {
    pointsAwarded: { type: "number", minimum: 0 },
    comment: { type: "string" },
    requiresReview: { type: "boolean" },
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

function buildActivityPrompt(context: ActivityPromptContext): string {
  return [
    `Atividade: ${context.activityTitle}`,
    `Descrição: ${context.activityDescription}`,
    `Tipo obrigatório: ${context.activityType}`,
    `Dificuldade obrigatória: ${context.difficulty}`,
    `Quantidade exata de questões: ${context.questionCount}`,
    `Plano: ${context.lessonPlanTitle}`,
    `Componente curricular: ${context.curricularComponent}`,
    `Ano escolar: ${context.schoolYear}`,
    `Ementa: ${context.syllabus}`,
    `Habilidades BNCC permitidas: ${context.bnccCodes.join(", ") || "nenhuma informada"}`,
    `Materiais permitidos: ${context.materials.join(", ") || "nenhum informado"}`,
    `Objetivos: ${context.objectives}`,
    `Conteúdos: ${context.contents}`,
    `Estratégia de avaliação: ${context.evaluationStrategy}`,
    "Não invente habilidades BNCC nem materiais. Forneça gabarito e alternativas nas objetivas; resposta-alvo e critérios nas discursivas.",
  ].join("\n\n");
}

function buildDiscursiveCorrectionPrompt(
  context: DiscursiveCorrectionPromptContext,
): string {
  return [
    `Enunciado: ${context.question}`,
    `Resposta do aluno: ${context.answer}`,
    `Resposta-alvo: ${context.targetAnswer || "não informada"}`,
    `Critérios: ${context.criteria}`,
    `Pontuação máxima: ${context.maxPoints}`,
    `Rigor: ${context.rigour}`,
    `Ano/nível: ${context.schoolYear}`,
    `Dificuldade: ${context.difficulty}`,
    `Conteúdo-base: ${context.content}`,
    "Sugira pontos e comentário. Marque requiresReview sempre que houver ambiguidade, informação insuficiente ou baixa confiança.",
  ].join("\n\n");
}

function assertDiscursiveAnswer(answer: string): void {
  const normalized = answer.trim();
  if (!normalized)
    throw new OpenAIPlanGenerationError("DISCURSIVE_ANSWER_EMPTY");
  if (normalized.length < 8)
    throw new OpenAIPlanGenerationError("DISCURSIVE_ANSWER_AMBIGUOUS");
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
