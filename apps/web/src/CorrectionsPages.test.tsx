import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfirmProvider } from "./ConfirmDialog.js";
import { CorrectionListPage, CorrectionQueuePage } from "./CorrectionsPages.js";

afterEach(() => vi.unstubAllGlobals());

const activityId = "71111111-1111-4111-8111-111111111111";
const questionId = "q2";

const activity = {
  id: activityId,
  title: "Frações – exercício 1",
  lessonPlanTitle: "Frações na pizza",
  status: "published",
  dueAt: "2026-10-10T23:59:00.000Z",
  responseCount: 3,
  archivedAt: null,
  questions: [
    {
      id: "q1",
      position: 0,
      kind: "objective",
      prompt: "Quanto é 1/2 + 1/2?",
      points: 2,
      alternatives: ["1", "2"],
      correctAlternativeIndex: 0,
    },
    {
      id: questionId,
      position: 1,
      kind: "discursive",
      prompt: "Explique por que 2/4 = 1/2.",
      points: 3,
      targetAnswer: "As duas são metade do inteiro.",
      criteria: "Cita metade.",
    },
  ],
};

const objectiveAnswer = (id: string, isCorrect = true) => ({
  id,
  questionId: "q1",
  externalQuestionId: "e1",
  questionPosition: 0,
  kind: "objective",
  prompt: "Quanto é 1/2 + 1/2?",
  answerText: "1",
  status: "graded",
  isCorrect,
  pointsAwarded: isCorrect ? 2 : 0,
  pointsPossible: 2,
  reviewReason: null,
  suggestedPointsAwarded: null,
  suggestedComment: null,
  suggestionRequiresReview: null,
  teacherComment: null,
});

const writtenAnswer = (
  id: string,
  overrides: Record<string, unknown> = {},
) => ({
  ...objectiveAnswer(id),
  questionId,
  questionPosition: 1,
  kind: "discursive",
  prompt: "Explique por que 2/4 = 1/2.",
  answerText: "Porque cortando em 4 e pegando 2 fica metade.",
  status: "pending_discursive",
  isCorrect: null,
  pointsAwarded: null,
  pointsPossible: 3,
  ...overrides,
});

const submission = (
  id: string,
  studentName: string | null,
  correctionStatus: string,
  answers: unknown[],
  overrides: Record<string, unknown> = {},
) => ({
  id,
  activityId,
  studentId: studentName ? `st-${id}` : null,
  studentName,
  externalResponseId: `r-${id}`,
  respondentEmail: null,
  submittedAt: "2026-10-09T12:00:00.000Z",
  status: "collected",
  manualReviewReason: null,
  objectivePointsAwarded: 2,
  objectivePointsPossible: 2,
  grade: null,
  correctionStatus,
  teacherComment: null,
  approvedAt: null,
  releasedAt: null,
  classroomReturnStatus: "pending",
  classroomReturnErrorCode: null,
  correctionHistory: [],
  answers,
  ...overrides,
});

const collection = (submissions: unknown[]) => ({
  activityId,
  status: "completed",
  scheduledAt: "2026-10-11T00:00:00.000Z",
  attemptCount: 1,
  lastErrorCode: null,
  completedAt: "2026-10-11T00:01:00.000Z",
  submissionCount: submissions.length,
  gradedCount: 0,
  manualReviewCount: 0,
  submissions,
});

const carla = submission("s1", "Carla Mendes", "pending", [
  objectiveAnswer("a1"),
  writtenAnswer("a2"),
]);
const bruno = submission("s2", "Bruno Costa", "pending", [
  objectiveAnswer("a3", false),
]);
const davi = submission(
  "s3",
  "Davi Rocha",
  "approved",
  [objectiveAnswer("a4")],
  { grade: 10 },
);

type Handler = (body: unknown) => { status?: number; body: unknown };

function mockApi(routes: Record<string, unknown | Handler>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url.replace(/^\/api/, "")}`;
    if (!(key in routes)) throw new Error(`unexpected request: ${key}`);
    const value = routes[key];
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (typeof value === "function") {
      const result = (value as Handler)(body);
      return Response.json(result.body, { status: result.status ?? 200 });
    }
    return Response.json(value);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const calls = (fetchMock: ReturnType<typeof mockApi>, key: string) =>
  fetchMock.mock.calls
    .filter(
      ([url, init]) =>
        `${init?.method ?? "GET"} ${String(url).replace(/^\/api/, "")}` === key,
    )
    .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : null));

const withConfirm = (node: ReactNode) =>
  render(<ConfirmProvider>{node}</ConfirmProvider>);

async function confirmDialog(label: string) {
  const dialog = screen.getByRole("alertdialog");
  await act(async () => {
    fireEvent.click(within(dialog).getByRole("button", { name: label }));
  });
}

const queueRoutes = (submissions: unknown[]) => ({
  [`GET /activities/${activityId}`]: { data: activity },
  [`GET /activities/${activityId}/collection`]: {
    data: collection(submissions),
  },
});

describe("correction list", () => {
  it("shows how much is left in each sent activity", async () => {
    mockApi({
      "GET /activities": {
        data: [
          activity,
          { ...activity, id: "a-draft", title: "Rascunho", status: "draft" },
          {
            ...activity,
            id: "a-none",
            title: "Leitura",
            responseCount: 0,
          },
        ],
      },
      [`GET /activities/${activityId}/collection`]: {
        data: collection([carla, bruno, davi]),
      },
    });
    withConfirm(<CorrectionListPage />);

    const card = (await screen.findByText("Frações – exercício 1")).closest(
      "li",
    )!;
    expect(
      await within(card).findByText("1 de 3 corrigidas · faltam 2"),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole("link", {
        name: "Corrigir Frações – exercício 1",
      }),
    ).toHaveAttribute("href", `#/correcoes/${activityId}`);
    expect(screen.queryByText("Rascunho")).not.toBeInTheDocument();
    const empty = screen.getByText("Leitura").closest("li")!;
    expect(
      within(empty).getByText("Nenhuma resposta ainda"),
    ).toBeInTheDocument();
  });
});

describe("correction queue", () => {
  it("corrects a written answer, approves it and moves to the next student", async () => {
    const fetchMock = mockApi({
      ...queueRoutes([carla, bruno, davi]),
      "PATCH /submissions/s1/correction": { data: { status: "reviewed" } },
      "POST /submissions/s1/approve": { data: { status: "approved" } },
    });
    withConfirm(<CorrectionQueuePage activityId={activityId} />);

    expect(
      await screen.findByRole("heading", { name: "Falta corrigir (2)" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Corrigir Carla Mendes" }),
    );

    const form = screen.getByRole("region", {
      name: "Correção de Carla Mendes",
    });
    expect(
      within(form).getByRole("heading", { name: "Carla Mendes" }),
    ).toHaveFocus();
    expect(within(form).getByText("Certa · 2 de 2 pontos")).toBeInTheDocument();
    expect(
      within(form).getByText("As duas são metade do inteiro."),
    ).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText("Pontos (de 0 a 3)"), {
      target: { value: "1.5" },
    });
    fireEvent.change(
      within(form).getByLabelText("Comentário sobre esta resposta"),
      {
        target: { value: "Faltou dizer que é metade." },
      },
    );
    fireEvent.change(
      within(form).getByLabelText("Comentário geral para o aluno"),
      {
        target: { value: "Bom começo." },
      },
    );
    expect(
      within(form).getByText("Nota final prevista: 7 de 10"),
    ).toBeInTheDocument();
    fireEvent.click(
      within(form).getByRole("button", {
        name: "Aprovar nota e ir para o próximo",
      }),
    );

    expect(
      await screen.findByText("Nota de Carla Mendes aprovada."),
    ).toBeInTheDocument();
    expect(calls(fetchMock, "PATCH /submissions/s1/correction")[0]).toEqual({
      answers: [
        {
          answerId: "a2",
          pointsAwarded: 1.5,
          comment: "Faltou dizer que é metade.",
        },
      ],
      teacherComment: "Bom começo.",
    });
    expect(calls(fetchMock, "POST /submissions/s1/approve")).toHaveLength(1);
    expect(
      screen.getByRole("region", { name: "Correção de Bruno Costa" }),
    ).toBeInTheDocument();
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("professorId");
  });

  it("approves a multiple-choice-only answer directly", async () => {
    const fetchMock = mockApi({
      ...queueRoutes([bruno]),
      "POST /submissions/s2/approve": { data: { status: "approved" } },
    });
    withConfirm(<CorrectionQueuePage activityId={activityId} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Corrigir Bruno Costa" }),
    );
    const form = screen.getByRole("region", {
      name: "Correção de Bruno Costa",
    });
    expect(
      within(form).getByText("Errada · 0 de 2 pontos"),
    ).toBeInTheDocument();
    fireEvent.click(
      within(form).getByRole("button", {
        name: "Aprovar nota e ir para o próximo",
      }),
    );
    await waitFor(() =>
      expect(calls(fetchMock, "POST /submissions/s2/approve")).toHaveLength(1),
    );
    expect(calls(fetchMock, "PATCH /submissions/s2/correction")).toHaveLength(
      0,
    );
  });

  it("requires points and comments before approving a written answer", async () => {
    const fetchMock = mockApi(queueRoutes([carla]));
    withConfirm(<CorrectionQueuePage activityId={activityId} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Corrigir Carla Mendes" }),
    );
    const form = screen.getByRole("region", {
      name: "Correção de Carla Mendes",
    });
    fireEvent.click(
      within(form).getByRole("button", {
        name: "Aprovar nota e ir para o próximo",
      }),
    );

    expect(
      within(form).getByText("Escreva um comentário sobre esta resposta."),
    ).toBeInTheDocument();
    expect(
      within(form).getByText("Escreva um comentário geral para o aluno."),
    ).toBeInTheDocument();
    expect(within(form).getByLabelText("Pontos (de 0 a 3)")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH"),
    ).toBe(false);
  });

  it("fills the fields with the AI suggestion without saving it", async () => {
    const fetchMock = mockApi({
      ...queueRoutes([carla]),
      "POST /submissions/s1/corrections/suggest": {
        data: {
          pointsAwarded: 3,
          comment: "Explicou bem a ideia de metade.",
          requiresReview: false,
        },
      },
    });
    withConfirm(<CorrectionQueuePage activityId={activityId} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Corrigir Carla Mendes" }),
    );
    const form = screen.getByRole("region", {
      name: "Correção de Carla Mendes",
    });
    fireEvent.click(
      within(form).getByRole("button", { name: "Pedir sugestão à IA" }),
    );

    await waitFor(() =>
      expect(within(form).getByLabelText("Pontos (de 0 a 3)")).toHaveValue(3),
    );
    expect(
      within(form).getByLabelText("Comentário sobre esta resposta"),
    ).toHaveValue("Explicou bem a ideia de metade.");
    expect(
      calls(fetchMock, "POST /submissions/s1/corrections/suggest")[0],
    ).toEqual({ answerId: "a2", rigour: "balanced" });
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH"),
    ).toBe(false);
  });

  it("explains when answers cannot be fetched yet", async () => {
    mockApi({
      [`GET /activities/${activityId}`]: { data: activity },
      [`GET /activities/${activityId}/collection`]: { data: null },
      [`POST /activities/${activityId}/collect`]: () => ({
        status: 409,
        body: { error: { code: "VALIDATION_ERROR", message: "x" } },
      }),
    });
    withConfirm(<CorrectionQueuePage activityId={activityId} />);

    expect(
      await screen.findByText(/Nenhuma resposta buscada ainda/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Buscar respostas" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /espere o prazo terminar ou encerre as respostas/,
    );
  });

  it("returns approved grades together after confirmation and reports failures", async () => {
    const ana = submission(
      "s4",
      "Ana Lima",
      "approved",
      [objectiveAnswer("a5")],
      {
        grade: 10,
      },
    );
    const fetchMock = mockApi({
      ...queueRoutes([davi, ana]),
      "POST /submissions/s3/release": { data: { status: "released" } },
      "POST /submissions/s4/release": () => ({
        status: 503,
        body: { error: { code: "INTEGRATION_UNAVAILABLE", message: "x" } },
      }),
    });
    withConfirm(<CorrectionQueuePage activityId={activityId} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Devolver 2 notas aprovadas" }),
    );
    expect(
      screen.getByRole("alertdialog", {
        name: "Devolver as notas aos alunos?",
      }),
    ).toBeInTheDocument();
    await confirmDialog("Devolver notas");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "1 nota não chegou ao Google Sala de Aula: Ana Lima. Tente de novo.",
    );
    expect(calls(fetchMock, "POST /submissions/s3/release")).toHaveLength(1);
    expect(calls(fetchMock, "POST /submissions/s4/release")).toHaveLength(1);
  });

  it("shows answers without an identified student with the reason", async () => {
    mockApi(
      queueRoutes([
        submission("s9", null, "manual_required", [objectiveAnswer("a9")], {
          respondentEmail: null,
          manualReviewReason: "E-mail do respondente não coletado.",
        }),
      ]),
    );
    withConfirm(<CorrectionQueuePage activityId={activityId} />);
    expect(
      await screen.findByText("Resposta sem aluno identificado"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("E-mail do respondente não coletado."),
    ).toBeInTheDocument();
  });
});
