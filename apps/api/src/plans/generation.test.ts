import type { LessonPlan } from "@educai/contracts";
import { describe, expect, it } from "vitest";

import {
  buildLessonPlanPromptContext,
  MissingSyllabusError,
} from "./generation.js";

const plan: LessonPlan = {
  id: "11111111-1111-4111-8111-111111111111",
  professorId: "22222222-2222-4222-8222-222222222222",
  title: "Frações",
  curricularComponent: "Matemática",
  schoolYear: "5º ano",
  objectives: "Compreender frações.",
  contents: "Representação fracionária.",
  methodology: "Situações-problema.",
  evaluationStrategy: "Registro e discussão.",
  classIds: [],
  syllabusId: "33333333-3333-4333-8333-333333333333",
  bnccSkillIds: [],
  materialIds: [],
  classNames: ["Turma A"],
  syllabusDescription: "Números e operações.",
  bnccCodes: ["EF05MA03"],
  materialTitles: ["Guia de frações"],
  isArchived: false,
  isLocked: false,
  status: "draft",
  reviewedAt: null,
  approvedAt: null,
  latestGeneration: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("lesson plan prompt context", () => {
  it("includes the syllabus, BNCC skills and allowed materials", () => {
    expect(buildLessonPlanPromptContext(plan)).toMatchObject({
      syllabus: "Números e operações.",
      bnccCodes: ["EF05MA03"],
      materials: ["Guia de frações"],
    });
  });

  it("blocks generation when the syllabus is absent", () => {
    expect(() =>
      buildLessonPlanPromptContext({
        ...plan,
        syllabusId: null,
        syllabusDescription: null,
      }),
    ).toThrow(MissingSyllabusError);
  });
});
