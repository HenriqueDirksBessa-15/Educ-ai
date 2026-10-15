import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "../database.js";
import { ActivitiesRepository } from "./repository.js";

const professorId = "11111111-1111-4111-8111-111111111111";
const planId = "21111111-1111-4111-8111-111111111111";
const activity = {
  lessonPlanId: planId,
  title: "Atividade",
  description: "Avaliação de frações.",
  type: "objective" as const,
  difficulty: "medium" as const,
  dueAt: "2026-10-30T12:00:00.000Z",
  latePolicy: { mode: "blocked" as const },
  questions: [
    {
      kind: "objective" as const,
      prompt: "Qual fração equivale a 1/2?",
      points: 10,
      alternatives: ["2/4", "1/3"],
      correctAlternativeIndex: 0,
    },
  ],
};

describe("activity lesson-plan gate", () => {
  it("rejects an owned plan that has not been approved", async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValue({ rows: [{ id: planId, status: "draft" }] }),
    } as unknown as DatabaseClient;

    await expect(
      new ActivitiesRepository(database).create(professorId, activity),
    ).rejects.toThrow("LESSON_PLAN_NOT_APPROVED");
    expect(database.query).toHaveBeenCalledTimes(1);
  });
});
