import type { Activity, LessonPlan } from "@educai/contracts";

import type { ActivityPromptContext } from "../openai/adapter.js";
import { MissingSyllabusError } from "../plans/generation.js";

export function buildActivityPromptContext(
  activity: Activity,
  plan: LessonPlan,
  questionCount: number,
): ActivityPromptContext {
  if (!plan.syllabusId || !plan.syllabusDescription)
    throw new MissingSyllabusError();
  return {
    activityTitle: activity.title,
    activityDescription: activity.description,
    activityType: activity.type,
    difficulty: activity.difficulty,
    questionCount,
    lessonPlanTitle: plan.title,
    curricularComponent: plan.curricularComponent,
    schoolYear: plan.schoolYear,
    objectives: plan.objectives,
    contents: plan.contents,
    evaluationStrategy: plan.evaluationStrategy,
    syllabus: plan.syllabusDescription,
    bnccCodes: plan.bnccCodes,
    materials: plan.materialTitles,
  };
}
