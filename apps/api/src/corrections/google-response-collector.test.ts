import { describe, expect, it, vi } from "vitest";

import { ProductionGoogleResponseCollector } from "./google-response-collector.js";

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
