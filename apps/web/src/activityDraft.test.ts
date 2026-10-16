import type { ActivityQuestionInput } from "@educai/contracts";
import { describe, expect, it } from "vitest";

import {
  activityTypeFor,
  emptyQuestion,
  fromLocalInput,
  initialQuestions,
  provisionalDueAt,
  questionErrors,
  toLocalInput,
} from "./activityDraft.js";

const objective = (
  overrides: Partial<
    Extract<ActivityQuestionInput, { kind: "objective" }>
  > = {},
): ActivityQuestionInput => ({
  kind: "objective",
  prompt: "Quanto é 1/2 + 1/2?",
  points: 2,
  alternatives: ["1", "2"],
  correctAlternativeIndex: 0,
  ...overrides,
});

const discursive = (
  overrides: Partial<
    Extract<ActivityQuestionInput, { kind: "discursive" }>
  > = {},
): ActivityQuestionInput => ({
  kind: "discursive",
  prompt: "Explique 2/4 = 1/2.",
  points: 3,
  targetAnswer: "Metade do inteiro.",
  criteria: "Cita metade.",
  ...overrides,
});

describe("activity type from questions", () => {
  it("follows the kinds of questions present", () => {
    expect(activityTypeFor([objective(), objective()])).toBe("objective");
    expect(activityTypeFor([discursive()])).toBe("discursive");
    expect(activityTypeFor([objective(), discursive()])).toBe("mixed");
    expect(activityTypeFor([])).toBeNull();
  });
});

describe("question validation", () => {
  it("accepts complete questions", () => {
    expect(questionErrors([objective(), discursive()])).toEqual([{}, {}]);
  });

  it("explains each missing field of an objective question", () => {
    const [errors] = questionErrors([
      objective({ prompt: " ", alternatives: ["1", " "], points: 1.5 }),
    ]);
    expect(errors).toEqual({
      prompt: "Escreva o enunciado da questão.",
      alternatives: "Preencha todas as alternativas.",
      points: "Use um número inteiro de pontos, a partir de 1.",
    });
  });

  it("requires at least two alternatives and a valid answer key", () => {
    const [errors] = questionErrors([
      objective({ alternatives: ["Só uma"], correctAlternativeIndex: 3 }),
    ]);
    expect(errors).toMatchObject({
      alternatives: "Coloque pelo menos duas alternativas.",
      correct: "Marque qual alternativa é a certa.",
    });
  });

  it("asks for the expected answer and criteria of written questions", () => {
    const [errors] = questionErrors([
      discursive({ targetAnswer: "", criteria: "", points: 0 }),
    ]);
    expect(errors).toEqual({
      targetAnswer: "Escreva a resposta esperada.",
      criteria: "Escreva como você vai corrigir.",
      points: "Use um número inteiro de pontos, a partir de 1.",
    });
  });
});

describe("starting questions", () => {
  it("creates blank questions matching the chosen type", () => {
    expect(emptyQuestion("objective")).toMatchObject({
      kind: "objective",
      alternatives: ["", ""],
      correctAlternativeIndex: 0,
      points: 1,
    });
    expect(initialQuestions("mixed").map((item) => item.kind)).toEqual([
      "objective",
      "discursive",
    ]);
    expect(initialQuestions("discursive").map((item) => item.kind)).toEqual([
      "discursive",
    ]);
  });
});

describe("deadline helpers", () => {
  it("suggests seven days ahead at 23:59", () => {
    const due = new Date(provisionalDueAt(new Date(2026, 9, 16, 10, 30)));
    expect([due.getFullYear(), due.getMonth(), due.getDate()]).toEqual([
      2026, 9, 23,
    ]);
    expect([due.getHours(), due.getMinutes()]).toEqual([23, 59]);
  });

  it("round-trips the date field value", () => {
    const iso = new Date(2026, 9, 18, 23, 59).toISOString();
    expect(toLocalInput(iso)).toBe("2026-10-18T23:59");
    expect(fromLocalInput("2026-10-18T23:59")).toBe(iso);
  });
});
