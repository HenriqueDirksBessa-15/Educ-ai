import type { Activity } from "@educai/contracts";
import { describe, expect, it, vi } from "vitest";

import type { ActivitiesRepository } from "../activities/repository.js";
import type { AuthRepository } from "../auth/repository.js";
import { ActivityCollectionService } from "./collection.js";
import type { GoogleResponseCollector } from "./google-response-collector.js";
import type { CorrectionsRepository } from "./repository.js";

describe("activity collection service", () => {
  it("upserts repeated external responses through the repository boundary", async () => {
    const activities = { get: vi.fn().mockResolvedValue(activity()) };
    const corrections = {
      startCollection: vi
        .fn()
        .mockResolvedValue({ runId: "run-1", googleFormId: "form-1" }),
      reconcileStudent: vi.fn().mockResolvedValue({
        studentId: "21111111-1111-4111-8111-111111111111",
        reason: null,
      }),
      persistSubmission: vi
        .fn()
        .mockResolvedValueOnce({ created: true, manualReview: false })
        .mockResolvedValueOnce({ created: false, manualReview: false }),
      completeCollection: vi.fn(),
      failCollection: vi.fn(),
      getSummary: vi.fn().mockResolvedValue({
        activityId: "11111111-1111-4111-8111-111111111111",
        status: "completed",
        scheduledAt: "2026-10-16T10:00:00.000Z",
        attemptCount: 1,
        lastErrorCode: null,
        completedAt: "2026-10-16T12:00:00.000Z",
        submissionCount: 1,
        gradedCount: 1,
        manualReviewCount: 0,
        submissions: [],
      }),
    };
    const auth = {
      getCredential: vi.fn().mockResolvedValue({ scopes: [] }),
      saveCredential: vi.fn(),
    };
    const collector = {
      isFixture: true,
      collect: vi.fn().mockResolvedValue({
        credential: {},
        submissions: [submission("r1"), submission("r1")],
      }),
    } satisfies GoogleResponseCollector;
    const service = new ActivityCollectionService(
      activities as unknown as ActivitiesRepository,
      corrections as unknown as CorrectionsRepository,
      auth as unknown as AuthRepository,
      collector,
    );

    const result = await service.collect(
      "professor-1",
      "11111111-1111-4111-8111-111111111111",
    );

    expect(result.status).toBe("collected");
    expect(corrections.completeCollection).toHaveBeenCalledWith(
      "professor-1",
      expect.any(String),
      "run-1",
      { received: 2, created: 1, updated: 1, manualReview: 0 },
    );
  });
});

function activity(): Activity {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    type: "objective",
    questions: [
      {
        id: "31111111-1111-4111-8111-111111111111",
        position: 0,
        kind: "objective",
        prompt: "Quanto?",
        points: 1,
        alternatives: ["1", "2"],
        correctAlternativeIndex: 0,
      },
    ],
  } as Activity;
}

function submission(id: string) {
  return {
    externalResponseId: id,
    respondentEmail: "student@example.test",
    submittedAt: "2026-10-16T11:00:00.000Z",
    rawPayload: { responseId: id },
    answers: [
      { externalQuestionId: "q1", questionPosition: 0, answerText: "1" },
    ],
  };
}
