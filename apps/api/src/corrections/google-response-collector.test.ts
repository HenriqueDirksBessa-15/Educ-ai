import { describe, expect, it, vi } from "vitest";

import {
  FixtureGoogleResponseCollector,
  ProductionGoogleResponseCollector,
} from "./google-response-collector.js";

describe("Google Forms response collector", () => {
  it("paginates responses without trusting the mutable Form order", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("/responses"))
        return json({
          responses: [response("r1", "q1", "A")],
          nextPageToken: "next",
        });
      return json({ responses: [response("r2", "q2", "B")] });
    });
    const collector = new ProductionGoogleResponseCollector(
      { clientId: "id", clientSecret: "secret", redirectUri: "http://test" },
      fetcher as typeof fetch,
      vi.fn().mockResolvedValue({ token: "token", credential: {} }),
    );

    const result = await collector.collect({ scopes: [] }, "form-1");

    expect(result.submissions).toHaveLength(2);
    expect(result.submissions[0]?.answers[0]).toMatchObject({
      externalQuestionId: "q1",
      questionPosition: null,
      answerText: "A",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("replays a versioned raw Forms corpus without external calls", async () => {
    const collector = new FixtureGoogleResponseCollector({
      version: 1,
      formId: "form-1",
      pages: [
        { responses: [response("r1", "q1", "A")] },
        { responses: [response("r2", "q2", "")] },
      ],
    });

    const result = await collector.collect({ scopes: [] }, "form-1");

    expect(result.submissions).toEqual([
      expect.objectContaining({
        externalResponseId: "r1",
        answers: [expect.objectContaining({ answerText: "A" })],
      }),
      expect.objectContaining({
        externalResponseId: "r2",
        answers: [expect.objectContaining({ answerText: "" })],
      }),
    ]);
    await expect(
      collector.collect({ scopes: [] }, "other-form"),
    ).rejects.toThrow("FIXTURE_FORM_NOT_FOUND");
  });
});

function response(id: string, questionId: string, value: string) {
  return {
    responseId: id,
    respondentEmail: `${id}@example.test`,
    lastSubmittedTime: "2026-10-16T12:00:00.000Z",
    answers: {
      [questionId]: { textAnswers: { answers: [{ value }] } },
    },
  };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
