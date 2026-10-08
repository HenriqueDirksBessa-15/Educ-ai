import type { OpenAiAvailability } from "@educai/contracts";

import type { AppConfig } from "../config.js";

export type OpenAIAdapter = {
  checkAvailability(): Promise<OpenAiAvailability>;
};

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
