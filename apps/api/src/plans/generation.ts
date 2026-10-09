import type { LessonPlan } from "@educai/contracts";

import type { LessonPlanPromptContext } from "../openai/adapter.js";

export class MissingSyllabusError extends Error {
  constructor() {
    super("MISSING_SYLLABUS");
    this.name = "MissingSyllabusError";
  }
}

export function buildLessonPlanPromptContext(
  plan: LessonPlan,
): LessonPlanPromptContext {
  if (!plan.syllabusId || !plan.syllabusDescription)
    throw new MissingSyllabusError();

  return {
    title: plan.title,
    curricularComponent: plan.curricularComponent,
    schoolYear: plan.schoolYear,
    objectives: plan.objectives,
    contents: plan.contents,
    methodology: plan.methodology,
    evaluationStrategy: plan.evaluationStrategy,
    syllabus: plan.syllabusDescription,
    bnccCodes: plan.bnccCodes,
    materials: plan.materialTitles,
  };
}
