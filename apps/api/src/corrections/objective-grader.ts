import type {
  Activity,
  ActivityAnswerStatus,
  ActivitySubmissionStatus,
} from "@educai/contracts";

export type CollectedAnswer = {
  externalQuestionId: string;
  questionPosition: number | null;
  answerText: string | null;
};

export type GradedAnswer = CollectedAnswer & {
  questionId: string | null;
  status: ActivityAnswerStatus;
  isCorrect: boolean | null;
  pointsAwarded: number | null;
  pointsPossible: number | null;
  reviewReason: string | null;
};

export type ObjectiveGradingResult = {
  status: ActivitySubmissionStatus;
  manualReviewReason: string | null;
  objectivePointsAwarded: number;
  objectivePointsPossible: number;
  grade: number | null;
  answers: GradedAnswer[];
};

export function gradeObjectiveAnswers(
  activity: Activity,
  collected: CollectedAnswer[],
): ObjectiveGradingResult {
  const answers: GradedAnswer[] = collected.map((answer) => {
    const question =
      answer.questionPosition === null
        ? undefined
        : activity.questions.find(
            (candidate) => candidate.position === answer.questionPosition,
          );
    if (!question) return manualAnswer(answer, "QUESTION_NOT_RECONCILED", null);
    if (question.kind === "discursive")
      return {
        ...answer,
        questionId: question.id,
        status: "pending_discursive",
        isCorrect: null,
        pointsAwarded: null,
        pointsPossible: question.points,
        reviewReason: null,
      };
    const normalized = answer.answerText?.trim();
    if (!normalized)
      return manualAnswer(answer, "OBJECTIVE_ANSWER_EMPTY", question);
    const expected =
      question.alternatives[question.correctAlternativeIndex]?.trim();
    if (!expected) return manualAnswer(answer, "ANSWER_KEY_INVALID", question);
    const correct = normalized === expected;
    return {
      ...answer,
      questionId: question.id,
      status: "graded",
      isCorrect: correct,
      pointsAwarded: correct ? question.points : 0,
      pointsPossible: question.points,
      reviewReason: null,
    };
  });

  const answeredPositions = new Set(
    collected
      .map((answer) => answer.questionPosition)
      .filter((position): position is number => position !== null),
  );
  for (const question of activity.questions) {
    if (!answeredPositions.has(question.position))
      answers.push(
        manualAnswer(
          {
            externalQuestionId: `missing-position-${question.position}`,
            questionPosition: question.position,
            answerText: null,
          },
          "ANSWER_MISSING",
          question,
        ),
      );
  }

  const objective = answers.filter(
    (answer) => answer.pointsPossible !== null && answer.status === "graded",
  );
  const objectivePointsAwarded = sum(
    objective.map((answer) => answer.pointsAwarded ?? 0),
  );
  const objectiveQuestions = activity.questions.filter(
    (question) => question.kind === "objective",
  );
  const objectivePointsPossible = sum(
    objectiveQuestions.map((question) => question.points),
  );
  const manual = answers.find(
    (answer) => answer.status === "manual_review_required",
  );
  const fullyObjective = activity.type === "objective";
  return {
    status: manual
      ? "manual_review_required"
      : fullyObjective
        ? "objective_graded"
        : "collected",
    manualReviewReason: manual?.reviewReason ?? null,
    objectivePointsAwarded,
    objectivePointsPossible,
    grade:
      fullyObjective && !manual && objectivePointsPossible > 0
        ? round2((objectivePointsAwarded / objectivePointsPossible) * 10)
        : null,
    answers,
  };
}

function manualAnswer(
  answer: CollectedAnswer,
  reason: string,
  question: Activity["questions"][number] | null,
): GradedAnswer {
  return {
    ...answer,
    questionId: question?.id ?? null,
    status: "manual_review_required",
    isCorrect: null,
    pointsAwarded: null,
    pointsPossible: question?.points ?? null,
    reviewReason: reason,
  };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
