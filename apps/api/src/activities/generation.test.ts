import type { Activity, LessonPlan } from "@educai/contracts";
import { describe, expect, it } from "vitest";

import { buildActivityPromptContext } from "./generation.js";

describe("activity prompt context", () => {
  it("uses only persisted pedagogical context", () => {
    const activity = {
      title: "Frações",
      description: "Avaliação formativa",
      type: "mixed",
      difficulty: "medium",
    } as Activity;
    const plan = {
      title: "Plano de frações",
      curricularComponent: "Matemática",
      schoolYear: "5º ano",
      objectives: "Comparar frações",
      contents: "Frações equivalentes",
      evaluationStrategy: "Questões comentadas",
      syllabusId: "11111111-1111-4111-8111-111111111111",
      syllabusDescription: "Números",
      bnccCodes: ["EF05MA03"],
      materialTitles: ["Guia de frações"],
    } as LessonPlan;

    expect(buildActivityPromptContext(activity, plan, 4)).toMatchObject({
      activityType: "mixed",
      difficulty: "medium",
      questionCount: 4,
      bnccCodes: ["EF05MA03"],
      materials: ["Guia de frações"],
    });
  });
});
