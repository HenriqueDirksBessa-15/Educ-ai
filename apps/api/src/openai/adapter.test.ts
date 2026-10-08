import { describe, expect, it } from "vitest";

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

  it("does not present a configured key as externally verified before authorization", async () => {
    await expect(
      new ConfiguredOpenAIAdapter({
        apiKey: "fixture-key",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-5-mini",
      }).checkAvailability(),
    ).resolves.toEqual({
      status: "deferred",
      errorCode: "OPENAI_EXTERNAL_CHECK_DEFERRED",
    });
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
});
