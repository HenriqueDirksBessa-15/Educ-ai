import { describe, expect, it } from "vitest";

import type { FeedbackPromptContext } from "../openai/adapter.js";
import {
  pseudonymizeFeedbackContext,
  restoreStudentName,
} from "./pseudonym.js";

const context: FeedbackPromptContext = {
  scope: "individual",
  audience: "aluno 1a2b3c4d",
  title: "Retorno para Ana Souza",
  currentContent: "Ana, revise a questão 2. ANA SOUZA foi bem na primeira.",
  activityTitle: "Frações",
  grade: 8,
  teacherComment: "Parabéns, Ana!",
  answerSummaries: ["Questão 1: Eu, Ana Souza, acho que 1/2 = 2/4 (1/1)"],
};

describe("feedback pseudonymization", () => {
  it("replaces the student's full and first name in every free-text field", () => {
    const scrubbed = pseudonymizeFeedbackContext(context, "Ana Souza");

    expect(scrubbed).toEqual({
      ...context,
      title: "Retorno para aluno 1a2b3c4d",
      currentContent:
        "aluno 1a2b3c4d, revise a questão 2. aluno 1a2b3c4d foi bem na primeira.",
      teacherComment: "Parabéns, aluno 1a2b3c4d!",
      answerSummaries: [
        "Questão 1: Eu, aluno 1a2b3c4d, acho que 1/2 = 2/4 (1/1)",
      ],
    });
    expect(JSON.stringify(scrubbed)).not.toMatch(/ana|souza/i);
  });

  it("does not touch words that only contain the name", () => {
    const scrubbed = pseudonymizeFeedbackContext(
      { ...context, currentContent: "Analise a banana e a Ana." },
      "Ana Souza",
    );

    expect(scrubbed.currentContent).toBe(
      "Analise a banana e a aluno 1a2b3c4d.",
    );
  });

  it("keeps global feedback and unknown names unchanged", () => {
    expect(
      pseudonymizeFeedbackContext({ ...context, scope: "global" }, "Ana Souza"),
    ).toEqual({ ...context, scope: "global" });
    expect(pseudonymizeFeedbackContext(context, null)).toEqual(context);
  });

  it("restores the real name if the model writes the identifier anyway", () => {
    expect(
      restoreStudentName(
        {
          strengths: ["aluno 1a2b3c4d leu bem o enunciado."],
          improvements: ["Revisar a questão 2."],
          message: "Parabéns, Aluno 1A2B3C4D!",
        },
        "aluno 1a2b3c4d",
        "Ana Souza",
      ),
    ).toEqual({
      strengths: ["Ana Souza leu bem o enunciado."],
      improvements: ["Revisar a questão 2."],
      message: "Parabéns, Ana Souza!",
    });
  });
});
