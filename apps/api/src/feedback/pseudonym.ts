import type { FeedbackSuggestion } from "@educai/contracts";

import type { FeedbackPromptContext } from "../openai/adapter.js";

// Troca o nome do aluno pelo pseudônimo do destinatário no texto livre que vai
// para a OpenAI. Cobre o nome completo e o primeiro nome (quando tiver 3+ letras).
export function pseudonymizeFeedbackContext(
  context: FeedbackPromptContext,
  studentName: string | null,
): FeedbackPromptContext {
  const patterns = namePatterns(studentName);
  if (context.scope !== "individual" || patterns.length === 0) return context;
  const scrub = (text: string) =>
    patterns.reduce(
      (current, pattern) => current.replace(pattern, context.audience),
      text,
    );
  return {
    ...context,
    title: scrub(context.title),
    currentContent: scrub(context.currentContent),
    teacherComment:
      context.teacherComment === null ? null : scrub(context.teacherComment),
    answerSummaries: context.answerSummaries.map(scrub),
  };
}

// Se a IA usar o pseudônimo mesmo assim, devolve o nome real antes de o
// professor ver a sugestão.
export function restoreStudentName(
  suggestion: FeedbackSuggestion,
  pseudonym: string,
  studentName: string | null,
): FeedbackSuggestion {
  if (!studentName) return suggestion;
  const pattern = wordPattern(pseudonym);
  const restore = (text: string) => text.replace(pattern, studentName);
  return {
    strengths: suggestion.strengths.map(restore),
    improvements: suggestion.improvements.map(restore),
    message: restore(suggestion.message),
  };
}

function namePatterns(studentName: string | null): RegExp[] {
  const fullName = studentName?.trim();
  if (!fullName) return [];
  const firstName = fullName.split(/\s+/)[0]!;
  return [
    fullName,
    ...(firstName.length >= 3 && firstName !== fullName ? [firstName] : []),
  ].map(wordPattern);
}

function wordPattern(text: string): RegExp {
  const escaped = text
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu");
}
