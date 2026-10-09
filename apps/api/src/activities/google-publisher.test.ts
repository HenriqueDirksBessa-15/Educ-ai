import type { Activity } from "@educai/contracts";
import { describe, expect, it, vi } from "vitest";

import { GOOGLE_PUBLISHING_SCOPES } from "../auth/google-gateway.js";
import { ProductionGoogleActivityPublisher } from "./google-publisher.js";

const activity = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Frações",
  description: "Resolva e explique.",
  dueAt: "2026-10-20T18:30:00.000Z",
  totalPoints: 3,
  questions: [
    {
      id: "21111111-1111-4111-8111-111111111111",
      position: 0,
      kind: "objective",
      prompt: "Qual representa metade?",
      points: 1,
      alternatives: ["1/2", "1/3"],
      correctAlternativeIndex: 0,
    },
    {
      id: "31111111-1111-4111-8111-111111111111",
      position: 1,
      kind: "discursive",
      prompt: "Explique a equivalência.",
      points: 2,
      targetAnswer: "Frações com o mesmo valor.",
      criteria: "Conceito e justificativa.",
    },
  ],
} as Activity;

const config = {
  clientId: "client",
  clientSecret: "secret",
  redirectUri: "http://localhost/callback",
};
const credential = { accessToken: "old", scopes: [] };
const tokenProvider = vi.fn().mockResolvedValue({
  token: "access-token",
  credential: { accessToken: "access-token" },
});

describe("Google activity publisher", () => {
  it("requests every scope needed by Days 9 and 10", () => {
    expect(GOOGLE_PUBLISHING_SCOPES).toEqual(
      expect.arrayContaining([
        "https://www.googleapis.com/auth/classroom.coursework.students",
        "https://www.googleapis.com/auth/forms.body",
        "https://www.googleapis.com/auth/forms.responses.readonly",
        "https://www.googleapis.com/auth/drive.file",
      ]),
    );
  });

  it("creates, configures and publishes a quiz form", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("drive/v3/files?")) return jsonResponse({ files: [] });
      if (
        url === "https://forms.googleapis.com/v1/forms" &&
        init?.method === "POST"
      )
        return jsonResponse({ formId: "form-1" });
      if (url.endsWith("/forms/form-1") && !init?.method)
        return jsonResponse({
          formId: "form-1",
          responderUri: "https://forms.test/form-1",
          items: [],
        });
      return jsonResponse({});
    });
    const publisher = new ProductionGoogleActivityPublisher(
      config,
      fetcher as typeof fetch,
      tokenProvider,
    );

    await expect(publisher.ensureForm(credential, activity)).resolves.toEqual({
      formId: "form-1",
      responderUri: "https://forms.test/form-1",
      credential: { accessToken: "access-token" },
    });

    const batchCall = fetcher.mock.calls.find(([url]) =>
      String(url).includes(":batchUpdate"),
    );
    const body = JSON.parse(String(batchCall?.[1]?.body)) as {
      requests: Array<Record<string, unknown>>;
    };
    expect(body.requests).toHaveLength(4);
    expect(JSON.stringify(body)).toContain("correctAnswers");
    expect(JSON.stringify(body)).toContain("textQuestion");
    expect(
      fetcher.mock.calls.some(([url]) =>
        String(url).includes(":setPublishSettings"),
      ),
    ).toBe(true);
  });

  it("reuses Classroom work found through the deterministic marker", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("/courseWork?"))
        return jsonResponse({
          courseWork: [
            {
              id: "work-1",
              alternateLink: "https://classroom.test/work-1",
              description: "[EDUCAI:" + activity.id + "]",
            },
          ],
        });
      throw new Error("unexpected request " + url);
    });
    const publisher = new ProductionGoogleActivityPublisher(
      config,
      fetcher as typeof fetch,
      tokenProvider,
    );

    await expect(
      publisher.ensureCourseWork(credential, {
        activity,
        courseId: "course-1",
        responderUri: "https://forms.test/form-1",
      }),
    ).resolves.toMatchObject({
      courseWorkId: "work-1",
      alternateLink: "https://classroom.test/work-1",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
