import type { Activity } from "@educai/contracts";
import { describe, expect, it } from "vitest";

import { gradeObjectiveAnswers } from "./objective-grader.js";

const activity = {
  type: "objective",
  questions: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      position: 0,
      kind: "objective",
      prompt: "Metade?",
      points: 1,
      alternatives: ["1/2", "1/3"],
      correctAlternativeIndex: 0,
    },
    {
      id: "21111111-1111-4111-8111-111111111111",
      position: 1,
      kind: "objective",
      prompt: "Um terço?",
      points: 3,
      alternatives: ["1/2", "1/3"],
      correctAlternativeIndex: 1,
    },
  ],
} as Activity;

describe("objective grading", () => {
  it("grades by answer key and normalizes the weighted result to 0-10", () => {
    const result = gradeObjectiveAnswers(activity, [
      { externalQuestionId: "q1", questionPosition: 0, answerText: " 1/2 " },
      { externalQuestionId: "q2", questionPosition: 1, answerText: "1/2" },
    ]);

    expect(result).toMatchObject({
      status: "objective_graded",
      objectivePointsAwarded: 1,
      objectivePointsPossible: 4,
      grade: 2.5,
    });
    expect(result.answers.map((answer) => answer.isCorrect)).toEqual([
      true,
      false,
    ]);
  });

  it("routes empty answers and missing questions to manual review", () => {
    const result = gradeObjectiveAnswers(activity, [
      { externalQuestionId: "q1", questionPosition: 0, answerText: "" },
      { externalQuestionId: "unknown", questionPosition: 9, answerText: "x" },
    ]);

    expect(result.status).toBe("manual_review_required");
    expect(result.grade).toBeNull();
    expect(result.answers.every((answer) => answer.reviewReason)).toBe(true);
  });

  it("keeps a mixed activity partial until discursive grading", () => {
    const mixed = {
      ...activity,
      type: "mixed",
      questions: [
        activity.questions[0],
        {
          id: "31111111-1111-4111-8111-111111111111",
          position: 1,
          kind: "discursive",
          prompt: "Explique.",
          points: 2,
          targetAnswer: "Explicação.",
          criteria: "Clareza.",
        },
      ],
    } as Activity;
    const result = gradeObjectiveAnswers(mixed, [
      { externalQuestionId: "q1", questionPosition: 0, answerText: "1/2" },
      {
        externalQuestionId: "q2",
        questionPosition: 1,
        answerText: "Minha explicação",
      },
    ]);

    expect(result.status).toBe("collected");
    expect(result.grade).toBeNull();
    expect(result.answers[1]?.status).toBe("pending_discursive");
  });
});
