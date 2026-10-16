import type { EligibleFeedbackSubmission, Feedback } from "@educai/contracts";
import { describe, expect, it } from "vitest";

import {
  confirmationFor,
  groupEligible,
  messageStatusLabel,
  recipientText,
  suggestedTitle,
  validateMessage,
} from "./messages.js";

const feedback = (overrides: Partial<Feedback>) =>
  ({
    scope: "individual",
    studentName: "Carla Mendes",
    className: null,
    status: "draft",
    notification: null,
    ...overrides,
  }) as Feedback;

const eligible = (
  id: string,
  studentName: string,
  activityTitle: string,
  grade = 8,
) =>
  ({
    id,
    studentName,
    activityTitle,
    grade,
    correctionStatus: "released",
  }) as EligibleFeedbackSubmission;

describe("message labels", () => {
  it("translates states, including how a sent message was delivered", () => {
    expect(messageStatusLabel(feedback({ status: "draft" }))).toBe("Rascunho");
    expect(messageStatusLabel(feedback({ status: "generated" }))).toBe(
      "Sugestão da IA para revisar",
    );
    expect(
      messageStatusLabel(
        feedback({
          status: "sent",
          notification: {
            channel: "email",
            status: "sent",
            errorCode: null,
          },
        }),
      ),
    ).toBe("Enviado por e-mail");
    expect(
      messageStatusLabel(
        feedback({
          status: "sent",
          notification: {
            channel: "google_classroom",
            status: "failed",
            errorCode: "GOOGLE_RATE_LIMITED",
          },
        }),
      ),
    ).toBe("Não foi enviado – avise o suporte");
    expect(messageStatusLabel(feedback({ status: "sent" }))).toBe("Enviado");
  });

  it("names who receives the message", () => {
    expect(recipientText(feedback({}))).toBe("Carla Mendes");
    expect(
      recipientText(
        feedback({ scope: "global", studentName: null, className: "7º ano B" }),
      ),
    ).toBe("Turma 7º ano B");
  });
});

describe("students who can receive a message", () => {
  it("groups them by corrected activity, in alphabetical order", () => {
    expect(
      groupEligible([
        eligible("1", "Davi Rocha", "Leitura"),
        eligible("2", "Carla Mendes", "Frações"),
        eligible("3", "Ana Lima", "Leitura"),
      ]).map((group) => [
        group.activityTitle,
        group.items.map((item) => item.studentName),
      ]),
    ).toEqual([
      ["Frações", ["Carla Mendes"]],
      ["Leitura", ["Ana Lima", "Davi Rocha"]],
    ]);
  });

  it("suggests a title the teacher can change", () => {
    expect(suggestedTitle("individual", "Frações – exercício 1")).toBe(
      "Recado sobre Frações – exercício 1",
    );
    expect(suggestedTitle("global", "7º ano B")).toBe("Aviso para a turma");
  });
});

describe("message form", () => {
  it("asks for who receives, a title and a message", () => {
    expect(
      validateMessage({ targetId: "", title: " ", content: "", linkUrl: "" }),
    ).toEqual({
      target: "Escolha quem vai receber.",
      title: "Escreva o título.",
      content: "Escreva a mensagem.",
    });
  });

  it("accepts an empty link but rejects an invalid one", () => {
    const base = { targetId: "x", title: "Oi", content: "Mensagem" };
    expect(validateMessage({ ...base, linkUrl: "" })).toEqual({});
    expect(validateMessage({ ...base, linkUrl: "site sem endereço" })).toEqual({
      link: "Use um endereço completo, começando com https://",
    });
  });

  it("explains channel and audience before sending", () => {
    expect(confirmationFor("individual", "Carla Mendes")).toEqual({
      title: "Enviar recado para Carla Mendes?",
      body: "O recado será enviado por e-mail só para Carla Mendes.",
    });
    expect(confirmationFor("global", "7º ano B")).toEqual({
      title: "Enviar aviso para a turma 7º ano B?",
      body: "O aviso aparecerá no mural do Google Sala de Aula da turma 7º ano B e todos os alunos poderão vê-lo. Se o Google falhar, enviamos por e-mail para cada aluno.",
    });
  });
});
