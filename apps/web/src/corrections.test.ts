import type { ActivityCollectionSummary } from "@educai/contracts";
import { describe, expect, it } from "vitest";

import {
  correctionProgress,
  groupSubmissions,
  nextToCorrect,
  previewGrade,
  validateCorrection,
} from "./corrections.js";

type Submission = ActivityCollectionSummary["submissions"][number];
type Answer = Submission["answers"][number];

const answer = (overrides: Partial<Answer>): Answer =>
  ({
    id: "ans",
    kind: "discursive",
    prompt: "Explique.",
    answerText: "Porque sim.",
    pointsAwarded: null,
    pointsPossible: 3,
    isCorrect: null,
    suggestedPointsAwarded: null,
    suggestedComment: null,
    teacherComment: null,
    ...overrides,
  }) as Answer;

const submission = (
  id: string,
  correctionStatus: Submission["correctionStatus"],
  answers: Answer[] = [],
): Submission =>
  ({
    id,
    correctionStatus,
    classroomReturnStatus: "pending",
    answers,
  }) as unknown as Submission;

describe("correction queue", () => {
  const subs = [
    submission("a", "pending"),
    submission("b", "approved"),
    submission("c", "manual_required"),
    submission("d", "released"),
    submission("e", "reviewed"),
    submission("f", "suggested"),
  ];

  it("groups answers by what the teacher still has to do", () => {
    const groups = groupSubmissions(subs);
    expect(groups.toCorrect.map((item) => item.id)).toEqual([
      "a",
      "c",
      "e",
      "f",
    ]);
    expect(groups.approved.map((item) => item.id)).toEqual(["b"]);
    expect(groups.released.map((item) => item.id)).toEqual(["d"]);
  });

  it("counts approved and returned grades as done", () => {
    expect(correctionProgress(subs)).toEqual({ done: 2, total: 6 });
  });

  it("moves to the next answer still to correct, wrapping around", () => {
    expect(nextToCorrect(subs, "a")).toBe("c");
    expect(nextToCorrect(subs, "f")).toBe("a");
    expect(nextToCorrect(subs, "b")).toBe("c");
    expect(nextToCorrect([submission("x", "pending")], "x")).toBeNull();
  });
});

describe("correction form", () => {
  const written = [
    answer({ id: "w1", pointsPossible: 3 }),
    answer({ id: "w2", pointsPossible: 2 }),
  ];

  it("accepts points within the maximum and comments", () => {
    expect(
      validateCorrection(
        written,
        {
          w1: { points: "3", comment: "Muito bem." },
          w2: { points: "0.5", comment: "Faltou explicar." },
        },
        "Bom trabalho.",
      ),
    ).toEqual({ answers: {}, general: undefined });
  });

  it("explains points out of range and missing comments", () => {
    expect(
      validateCorrection(
        written,
        {
          w1: { points: "4", comment: " " },
          w2: { points: "", comment: "Ok." },
        },
        "",
      ),
    ).toEqual({
      answers: {
        w1: {
          points: "Use de 0 a 3 pontos.",
          comment: "Escreva um comentário sobre esta resposta.",
        },
        w2: { points: "Use de 0 a 2 pontos." },
      },
      general: "Escreva um comentário geral para o aluno.",
    });
  });

  it("previews the final grade the way the server computes it", () => {
    const sub = submission("s", "pending", [
      answer({
        id: "o1",
        kind: "objective",
        pointsAwarded: 2,
        pointsPossible: 2,
        isCorrect: true,
      }),
      answer({ id: "w1", pointsPossible: 3 }),
    ]);
    expect(previewGrade(sub, { w1: { points: "1.5", comment: "" } })).toBe(7);
    expect(previewGrade(sub, { w1: { points: "", comment: "" } })).toBeNull();
  });
});
