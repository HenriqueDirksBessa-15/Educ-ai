import type { ActivityQuestionInput, ActivityType } from "@educai/contracts";

// Pure rules behind the activity wizard; see docs/telas/05-atividades.md.

export type QuestionKind = ActivityQuestionInput["kind"];
export type QuestionField =
  | "prompt"
  | "points"
  | "alternatives"
  | "correct"
  | "targetAnswer"
  | "criteria";
export type QuestionErrors = Partial<Record<QuestionField, string>>;

// The API rejects a type that does not match the questions, so it is derived.
export function activityTypeFor(
  questions: ActivityQuestionInput[],
): ActivityType | null {
  const kinds = new Set(questions.map((question) => question.kind));
  if (kinds.size === 0) return null;
  if (kinds.size === 2) return "mixed";
  return kinds.has("objective") ? "objective" : "discursive";
}

const blank = (value: string) => value.trim().length === 0;

export function questionErrors(
  questions: ActivityQuestionInput[],
): QuestionErrors[] {
  return questions.map((question) => {
    const errors: QuestionErrors = {};
    if (blank(question.prompt))
      errors.prompt = "Escreva o enunciado da questão.";
    if (question.kind === "objective") {
      if (question.alternatives.length < 2)
        errors.alternatives = "Coloque pelo menos duas alternativas.";
      else if (question.alternatives.some(blank))
        errors.alternatives = "Preencha todas as alternativas.";
      if (
        question.correctAlternativeIndex < 0 ||
        question.correctAlternativeIndex >= question.alternatives.length
      )
        errors.correct = "Marque qual alternativa é a certa.";
    } else {
      if (blank(question.targetAnswer))
        errors.targetAnswer = "Escreva a resposta esperada.";
      if (blank(question.criteria))
        errors.criteria = "Escreva como você vai corrigir.";
    }
    // Google Forms only accepts whole points.
    if (!Number.isInteger(question.points) || question.points < 1)
      errors.points = "Use um número inteiro de pontos, a partir de 1.";
    return errors;
  });
}

export function emptyQuestion(kind: QuestionKind): ActivityQuestionInput {
  return kind === "objective"
    ? {
        kind,
        prompt: "",
        points: 1,
        alternatives: ["", ""],
        correctAlternativeIndex: 0,
      }
    : { kind, prompt: "", points: 1, targetAnswer: "", criteria: "" };
}

export function initialQuestions(type: ActivityType): ActivityQuestionInput[] {
  if (type === "mixed")
    return [emptyQuestion("objective"), emptyQuestion("discursive")];
  return [emptyQuestion(type)];
}

export function provisionalDueAt(now: Date): string {
  const due = new Date(now);
  due.setDate(due.getDate() + 7);
  due.setHours(23, 59, 0, 0);
  return due.toISOString();
}

const pad = (value: number) => String(value).padStart(2, "0");

export function toLocalInput(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}
