import type {
  Activity,
  ActivityCollectionSummary,
  Bulletin,
  Feedback,
  LessonPlan,
} from "@educai/contracts";
import { describe, expect, it } from "vitest";

import { computePendencies, menuCounts, type Overview } from "./pendencies.js";

// Fixed clock and school time zone keep the deadline texts deterministic.
const now = new Date("2026-10-16T10:00:00-03:00");

const activity = (id: string, overrides: Partial<Activity> = {}) =>
  ({
    id,
    title: `Atividade ${id}`,
    status: "published",
    dueAt: "2026-10-30T23:59:00-03:00",
    responseCount: 0,
    archivedAt: null,
    ...overrides,
  }) as Activity;

const submission = (
  correctionStatus: string,
  classroomReturnStatus = "pending",
) => ({ correctionStatus, classroomReturnStatus });

const collection = (
  activityId: string,
  submissions: ReturnType<typeof submission>[],
) =>
  ({
    activityId,
    submissions,
  }) as unknown as ActivityCollectionSummary;

const plan = (title: string, overrides: Partial<LessonPlan> = {}) =>
  ({
    id: title,
    title,
    status: "draft",
    isArchived: false,
    ...overrides,
  }) as LessonPlan;

function overview(parts: Partial<Overview> = {}): Overview {
  return {
    plans: [],
    classes: [],
    activities: [],
    collections: [],
    feedbacks: [],
    bulletins: [],
    ...parts,
  };
}

describe("home pendencies", () => {
  it("is empty when everything is up to date", () => {
    expect(computePendencies(overview(), now)).toEqual([]);
  });

  it("lists answers waiting for correction per activity", () => {
    const result = computePendencies(
      overview({
        activities: [activity("a1", { title: "Frações – exercício 1" })],
        collections: [
          collection("a1", [
            submission("pending"),
            submission("manual_required"),
            submission("reviewed"),
            submission("released", "returned"),
          ]),
        ],
      }),
      now,
    );
    expect(result[0]).toMatchObject({
      title: "3 respostas esperando sua correção",
      detail: "Frações – exercício 1",
      actionLabel: "Corrigir",
      route: "correcoes",
    });
  });

  it("uses the singular for one answer", () => {
    const [first] = computePendencies(
      overview({
        activities: [activity("a1")],
        collections: [collection("a1", [submission("suggested")])],
      }),
      now,
    );
    expect(first?.title).toBe("1 resposta esperando sua correção");
  });

  it("reminds about approved grades and failed returns", () => {
    const titles = computePendencies(
      overview({
        activities: [activity("a1")],
        collections: [
          collection("a1", [
            submission("approved"),
            submission("approved"),
            submission("released", "failed"),
          ]),
        ],
      }),
      now,
    ).map((item) => item.title);
    expect(titles).toEqual([
      "2 notas aprovadas ainda não devolvidas",
      "1 nota não chegou ao Google Sala de Aula",
    ]);
  });

  it("names a single plan waiting for approval and ignores approved or archived ones", () => {
    const result = computePendencies(
      overview({
        plans: [
          plan("Sistema solar", { status: "generated" }),
          plan("Frações", { status: "approved" }),
          plan("Antigo", { isArchived: true }),
        ],
      }),
      now,
    );
    expect(result).toEqual([
      expect.objectContaining({
        title: "Plano “Sistema solar” aguardando sua aprovação",
        actionLabel: "Revisar",
        route: "aulas",
      }),
    ]);
  });

  it("groups several plans waiting for approval", () => {
    const [first] = computePendencies(
      overview({ plans: [plan("A"), plan("B", { status: "reviewed" })] }),
      now,
    );
    expect(first?.title).toBe("2 planos aguardando sua aprovação");
  });

  it("asks to define the subject of classes without one", () => {
    const [first] = computePendencies(
      overview({
        classes: [
          { id: "c1", name: "8º ano A", hasSubject: false },
          { id: "c2", name: "7º ano B", hasSubject: true },
        ],
      }),
      now,
    );
    expect(first).toMatchObject({
      title: "A turma 8º ano A ainda não tem matéria definida",
      actionLabel: "Definir",
      route: "turmas",
    });
  });

  it("warns only about sent activities closing in the next 48 hours", () => {
    const titles = computePendencies(
      overview({
        activities: [
          activity("today", {
            title: "Leitura",
            dueAt: "2026-10-16T23:59:00-03:00",
            responseCount: 25,
          }),
          activity("tomorrow", {
            title: "Frações",
            dueAt: "2026-10-17T18:00:00-03:00",
          }),
          activity("later", { dueAt: "2026-10-20T18:00:00-03:00" }),
          activity("past", { dueAt: "2026-10-15T18:00:00-03:00" }),
          activity("draft", {
            status: "draft",
            dueAt: "2026-10-16T20:00:00-03:00",
          }),
        ],
      }),
      now,
      "America/Sao_Paulo",
    );
    expect(titles).toHaveLength(2);
    expect(titles[0]).toMatchObject({
      title: "Leitura fecha hoje às 23:59",
      detail: "25 respostas recebidas",
      route: "atividades",
    });
    expect(titles[1]?.title).toBe("Frações fecha amanhã às 18:00");
  });

  it("reports messages and bulletins that were not sent", () => {
    const titles = computePendencies(
      overview({
        feedbacks: [
          { notification: { status: "failed" } },
          { notification: { status: "sent" } },
          { notification: null },
        ] as unknown as Feedback[],
        bulletins: [
          { status: "failed" },
          { status: "failed" },
          { status: "sent" },
        ] as unknown as Bulletin[],
      }),
      now,
    ).map((item) => [item.title, item.route]);
    expect(titles).toEqual([
      ["1 recado não foi enviado", "recados"],
      ["2 boletins não foram enviados", "boletins"],
    ]);
  });

  it("orders corrections before plans, classes and deadlines", () => {
    const routes = computePendencies(
      overview({
        plans: [plan("A")],
        classes: [{ id: "c1", name: "8º A", hasSubject: false }],
        activities: [activity("a1", { dueAt: "2026-10-16T23:00:00-03:00" })],
        collections: [collection("a1", [submission("pending")])],
      }),
      now,
    ).map((item) => item.route);
    expect(routes).toEqual(["correcoes", "aulas", "turmas", "atividades"]);
  });
});

describe("menu counters", () => {
  it("counts answers to correct and plans to approve", () => {
    expect(
      menuCounts(
        overview({
          plans: [plan("A"), plan("B", { status: "approved" })],
          activities: [activity("a1"), activity("a2")],
          collections: [
            collection("a1", [submission("pending"), submission("approved")]),
            collection("a2", [submission("manual_required")]),
          ],
        }),
      ),
    ).toEqual({
      correcoes: { count: 2, label: "2 respostas para corrigir" },
      aulas: { count: 1, label: "1 plano para aprovar" },
    });
  });

  it("omits counters that are zero", () => {
    expect(menuCounts(overview())).toEqual({});
  });
});
