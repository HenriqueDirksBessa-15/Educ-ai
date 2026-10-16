import type { ActivityCollectionSummary } from "@educai/contracts";

// Pure rules behind the correction queue; see docs/telas/06-correcoes.md.

export type Submission = ActivityCollectionSummary["submissions"][number];
export type Answer = Submission["answers"][number];
export type AnswerDraft = { points: string; comment: string };
export type CorrectionDrafts = Record<string, AnswerDraft>;
export type CorrectionErrors = {
  answers: Record<string, { points?: string; comment?: string }>;
  general: string | undefined;
};

const TO_CORRECT = new Set<Submission["correctionStatus"]>([
  "pending",
  "suggested",
  "manual_required",
  "reviewed",
]);

export const isToCorrect = (submission: Submission) =>
  TO_CORRECT.has(submission.correctionStatus);

export function groupSubmissions(submissions: Submission[]) {
  return {
    toCorrect: submissions.filter(isToCorrect),
    approved: submissions.filter(
      (item) => item.correctionStatus === "approved",
    ),
    released: submissions.filter(
      (item) => item.correctionStatus === "released",
    ),
  };
}

export function correctionProgress(submissions: Submission[]) {
  return {
    done: submissions.filter((item) => !isToCorrect(item)).length,
    total: submissions.length,
  };
}

export function nextToCorrect(
  submissions: Submission[],
  currentId: string,
): string | null {
  const start = submissions.findIndex((item) => item.id === currentId);
  for (let step = 1; step <= submissions.length; step += 1) {
    const candidate = submissions[(start + step) % submissions.length]!;
    if (candidate.id !== currentId && isToCorrect(candidate))
      return candidate.id;
  }
  return null;
}

export const writtenAnswers = (submission: Submission) =>
  submission.answers.filter((answer) => answer.kind === "discursive");

const parsePoints = (value: string) =>
  value.trim() === "" ? Number.NaN : Number(value.replace(",", "."));

export function validateCorrection(
  answers: Answer[],
  drafts: CorrectionDrafts,
  generalComment: string,
): CorrectionErrors {
  const errors: CorrectionErrors = { answers: {}, general: undefined };
  for (const answer of answers) {
    const draft = drafts[answer.id] ?? { points: "", comment: "" };
    const max = answer.pointsPossible ?? 0;
    const points = parsePoints(draft.points);
    const found: { points?: string; comment?: string } = {};
    if (!Number.isFinite(points) || points < 0 || points > max)
      found.points = `Use de 0 a ${max.toLocaleString("pt-BR")} pontos.`;
    // The API still requires text here (pending B-07).
    if (!draft.comment.trim())
      found.comment = "Escreva um comentário sobre esta resposta.";
    if (Object.keys(found).length > 0) errors.answers[answer.id] = found;
  }
  if (answers.length > 0 && !generalComment.trim())
    errors.general = "Escreva um comentário geral para o aluno.";
  return errors;
}

export const hasErrors = (errors: CorrectionErrors) =>
  Object.keys(errors.answers).length > 0 || Boolean(errors.general);

export const pointsValue = (draft: AnswerDraft | undefined) =>
  parsePoints(draft?.points ?? "");

// Same formula as the server: awarded ÷ possible × 10, two decimals.
export function previewGrade(
  submission: Submission,
  drafts: CorrectionDrafts,
): number | null {
  let awarded = 0;
  let possible = 0;
  for (const answer of submission.answers) {
    possible += answer.pointsPossible ?? 0;
    if (answer.kind === "discursive") {
      const points = pointsValue(drafts[answer.id]);
      if (!Number.isFinite(points)) return null;
      awarded += points;
    } else awarded += answer.pointsAwarded ?? 0;
  }
  if (possible === 0) return null;
  return Math.round((awarded / possible) * 10 * 100) / 100;
}
