import { describe, expect, it } from "vitest";

import {
  bulletinStatusLabel,
  classSourceLabel,
  errorMessage,
  formatDate,
  lessonPlanStatusLabel,
  materialCategoryLabel,
  milestoneTypeLabel,
  notificationLabel,
} from "./labels.js";

describe("teacher-facing labels", () => {
  it("translates lesson plan states", () => {
    expect(lessonPlanStatusLabel("draft")).toBe("Rascunho");
    expect(lessonPlanStatusLabel("generated")).toBe("Sugestão para revisar");
    expect(lessonPlanStatusLabel("reviewed")).toBe("Revisado");
    expect(lessonPlanStatusLabel("approved")).toBe("Aprovado");
  });

  it("translates class origins, material categories and milestones", () => {
    expect(classSourceLabel("google")).toBe("Do Google Sala de Aula");
    expect(classSourceLabel("local")).toBe("Criada no EDUC.AI");
    expect(materialCategoryLabel("reading")).toBe("Leitura");
    expect(materialCategoryLabel("presentation")).toBe("Apresentação");
    expect(milestoneTypeLabel("assessment")).toBe("Avaliação");
    expect(milestoneTypeLabel("deadline")).toBe("Prazo");
  });

  it("describes notification delivery without internal values", () => {
    expect(
      notificationLabel({
        channel: "email",
        status: "pending",
        errorCode: null,
      }),
    ).toBe("Enviando por e-mail…");
    expect(
      notificationLabel({
        channel: "google_classroom",
        status: "sent",
        errorCode: null,
      }),
    ).toBe("Publicado no Google Sala de Aula");
    expect(
      notificationLabel({
        channel: "email",
        status: "failed",
        errorCode: "EMAIL_RATE_LIMITED",
      }),
    ).toBe("Não enviado – tente de novo");
    expect(bulletinStatusLabel("failed")).toBe("Não enviado – tente de novo");
  });

  it("explains known error codes with what to do next", () => {
    expect(errorMessage("GOOGLE_RECONSENT_REQUIRED")).toMatch(
      /permissão no Google/,
    );
    expect(errorMessage("GOOGLE_RATE_LIMITED")).toMatch(/Tente de novo/);
    expect(errorMessage("OPENAI_TIMEOUT")).toMatch(/IA não conseguiu/);
    expect(errorMessage("EMAIL_PROVIDER_UNAVAILABLE")).toMatch(/e-mail/);
  });

  it("never shows an error code to the teacher", () => {
    for (const code of [
      "GOOGLE_RATE_LIMITED",
      "OPENAI_GENERATION_FAILED",
      "EMAIL_CREDENTIAL_INVALID",
      "SOMETHING_NEW",
      null,
      undefined,
    ]) {
      const message = errorMessage(code);
      expect(message).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
      expect(message.length).toBeGreaterThan(10);
    }
  });

  it("formats dates in Brazilian Portuguese", () => {
    expect(formatDate("2026-10-01")).toBe("01/10/2026");
  });
});
