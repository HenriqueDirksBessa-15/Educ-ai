import type { Activity, LessonPlan } from "@educai/contracts";
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

import {
  ActivityListPage,
  ActivityPage,
  ActivityWizard,
} from "./ActivitiesPages.js";
import { ConfirmProvider } from "./ConfirmDialog.js";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

const activityId = "71111111-1111-4111-8111-111111111111";
const generationId = "91111111-1111-4111-8111-111111111111";

const plans = [
  {
    id: "51111111-1111-4111-8111-111111111111",
    title: "Frações na pizza",
    status: "approved",
    isArchived: false,
    classNames: ["7º ano B"],
    curricularComponent: "Matemática",
  },
  {
    id: "51111111-1111-4111-8111-111111111112",
    title: "Plano ainda em rascunho",
    status: "draft",
    isArchived: false,
    classNames: ["8º ano A"],
    curricularComponent: "Ciências",
  },
] as unknown as LessonPlan[];

const activity = (overrides: Partial<Activity> = {}) =>
  ({
    id: activityId,
    professorId: "61111111-1111-4111-8111-111111111111",
    lessonPlanId: plans[0]!.id,
    lessonPlanTitle: "Frações na pizza",
    title: "Frações – exercício 1",
    description: "Leia com atenção e responda a todas as questões.",
    type: "objective",
    difficulty: "medium",
    dueAt: "2026-10-23T02:59:00.000Z",
    latePolicy: { mode: "blocked" },
    status: "draft",
    questions: [],
    totalPoints: 0,
    responseCount: 0,
    publishedAt: null,
    finishedAt: null,
    archivedAt: null,
    createdAt: "2026-10-16T10:00:00.000Z",
    updatedAt: "2026-10-16T10:00:00.000Z",
    ...overrides,
  }) as Activity;

const publication = (overrides: Record<string, unknown> = {}) => ({
  activityId,
  status: "published",
  googleFormId: "form-1",
  responderUri: "https://docs.google.com/forms/d/e/form-1/viewform",
  errorCode: null,
  attemptCount: 1,
  collectionScheduledAt: null,
  lastSyncedAt: null,
  distributions: [
    {
      classId: "11111111-1111-4111-8111-111111111111",
      className: "7º ano B",
      googleClassroomId: "c1",
      googleCourseWorkId: "w1",
      alternateLink: "https://classroom.google.com/c/c1/a/w1",
      status: "published",
      errorCode: null,
      attemptCount: 1,
    },
  ],
  ...overrides,
});

type Handler = (body: unknown) => { status?: number; body: unknown };

// Routes are "METHOD /path"; anything else fails the test loudly.
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

// Every step is listed in the progress bar; only the current one is marked.
const currentStep = () =>
  document.querySelector('[aria-current="step"]')?.textContent ?? "";

async function fillStepOne() {
  fireEvent.click(
    await screen.findByRole("radio", { name: /Frações na pizza/ }),
  );
  fireEvent.change(screen.getByLabelText(/^Título da atividade/), {
    target: { value: "Frações – exercício 1" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
}

describe("activity list", () => {
  it("lists activities with their state and the right next step", async () => {
    const fetchMock = mockApi({
      "GET /activities": {
        data: [
          activity({ title: "Quiz de leitura" }),
          activity({
            id: "72222222-2222-4222-8222-222222222222",
            title: "Frações – exercício 1",
            status: "published",
            responseCount: 25,
          }),
        ],
      },
      "GET /activities?status=published": { data: [] },
    });
    withConfirm(<ActivityListPage />);

    const draft = (await screen.findByText("Quiz de leitura")).closest("li")!;
    expect(within(draft).getByText("Rascunho")).toBeInTheDocument();
    expect(
      within(draft).getByRole("link", { name: "Continuar Quiz de leitura" }),
    ).toHaveAttribute("href", `#/atividades/${activityId}`);

    const sent = screen.getByText("Frações – exercício 1").closest("li")!;
    expect(within(sent).getByText("Enviada para a turma")).toBeInTheDocument();
    expect(within(sent).getByText(/25 respostas/)).toBeInTheDocument();
    expect(
      within(sent).getByRole("link", { name: "Ver Frações – exercício 1" }),
    ).toHaveAttribute(
      "href",
      "#/atividades/72222222-2222-4222-8222-222222222222",
    );

    expect(
      screen.getByRole("link", { name: "Criar atividade" }),
    ).toHaveAttribute("href", "#/nova-atividade");

    fireEvent.click(screen.getByRole("button", { name: "Enviadas" }));
    await waitFor(() =>
      expect(calls(fetchMock, "GET /activities?status=published")).toHaveLength(
        1,
      ),
    );
    expect(screen.getByRole("button", { name: "Enviadas" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("creating an activity", () => {
  it("only offers approved plans and points to planning when there is none", async () => {
    mockApi({});
    const { unmount } = withConfirm(<ActivityWizard plans={plans} />);
    expect(
      screen.getByRole("radio", { name: /Frações na pizza/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: /Plano ainda em rascunho/ }),
    ).not.toBeInTheDocument();
    unmount();

    withConfirm(<ActivityWizard plans={[plans[1]!]} />);
    expect(
      screen.getByText("Você ainda não tem plano aprovado."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Planejar uma aula" }),
    ).toHaveAttribute("href", "#/aulas");
  });

  it("writes questions by hand and sends them only after confirmation", async () => {
    const fetchMock = mockApi({
      "POST /activities": { data: activity() },
      [`PATCH /activities/${activityId}`]: { data: activity() },
      [`POST /activities/${activityId}/publish`]: { data: publication() },
    });
    withConfirm(<ActivityWizard plans={plans} />);

    await fillStepOne();
    expect(currentStep()).toContain("Passo 2 de 4");
    fireEvent.click(screen.getByRole("radio", { name: "Múltipla escolha" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Escrever as questões" }),
    );

    const question = screen.getByRole("group", { name: /Questão 1/ });
    fireEvent.change(within(question).getByLabelText("Enunciado"), {
      target: { value: "Quanto é 1/2 + 1/2?" },
    });
    fireEvent.change(within(question).getByLabelText("Alternativa 1"), {
      target: { value: "1" },
    });
    fireEvent.change(within(question).getByLabelText("Alternativa 2"), {
      target: { value: "2" },
    });
    fireEvent.click(
      within(question).getByRole("radio", { name: "Alternativa 1 é a certa" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Aprovar questões" }));

    await waitFor(() => expect(currentStep()).toContain("Passo 4 de 4"));
    expect(calls(fetchMock, "POST /activities")[0]).toMatchObject({
      lessonPlanId: plans[0]!.id,
      title: "Frações – exercício 1",
      type: "objective",
      questions: [
        {
          kind: "objective",
          prompt: "Quanto é 1/2 + 1/2?",
          alternatives: ["1", "2"],
          correctAlternativeIndex: 0,
          points: 1,
        },
      ],
    });
    expect(screen.getByText(/Vai para: 7º ano B/)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Enviar para a turma" }),
    );
    expect(
      screen.getByRole("alertdialog", { name: "Enviar para a turma?" }),
    ).toHaveTextContent("7º ano B");
    await confirmDialog("Cancelar");
    expect(
      calls(fetchMock, `POST /activities/${activityId}/publish`),
    ).toHaveLength(0);

    fireEvent.click(
      screen.getByRole("button", { name: "Enviar para a turma" }),
    );
    await confirmDialog("Enviar para a turma");

    await waitFor(() =>
      expect(window.location.hash).toBe(`#/atividades/${activityId}`),
    );
    expect(
      calls(fetchMock, `PATCH /activities/${activityId}`)[0],
    ).toMatchObject({
      latePolicy: { mode: "blocked" },
      dueAt: expect.any(String),
    });
    expect(
      calls(fetchMock, `POST /activities/${activityId}/publish`),
    ).toHaveLength(1);
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("professorId");
  });

  it("asks the AI, lets the teacher edit and approves that version", async () => {
    const suggestion = {
      title: "Frações – exercício 1",
      description: "Responda.",
      type: "mixed",
      difficulty: "medium",
      questions: [
        {
          kind: "objective",
          prompt: "Pergunta da IA",
          points: 2,
          alternatives: ["3/8", "5/8"],
          correctAlternativeIndex: 0,
        },
        {
          kind: "discursive",
          prompt: "Explique 2/4 = 1/2.",
          points: 3,
          targetAnswer: "Metade.",
          criteria: "Cita metade.",
        },
      ],
    };
    const fetchMock = mockApi({
      "POST /activities": { data: activity({ type: "mixed" }) },
      [`POST /activities/${activityId}/generate`]: {
        data: {
          id: generationId,
          activityId,
          version: 1,
          status: "succeeded",
          reviewStatus: "generated",
          suggestion,
          errorCode: null,
        },
      },
      [`POST /activities/${activityId}/review`]: {
        data: { status: "reviewed" },
      },
      [`POST /activities/${activityId}/approve`]: {
        data: { status: "approved" },
      },
    });
    withConfirm(<ActivityWizard plans={plans} />);

    await fillStepOne();
    fireEvent.click(screen.getByRole("radio", { name: "As duas" }));
    fireEvent.change(screen.getByLabelText("Quantas questões?"), {
      target: { value: "4" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Pedir questões à IA" }),
    );

    const first = await screen.findByRole("group", { name: /Questão 1/ });
    expect(screen.getByText(/Sugestão da IA/)).toBeInTheDocument();
    fireEvent.change(within(first).getByLabelText("Enunciado"), {
      target: { value: "Pergunta revisada" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aprovar questões" }));

    await waitFor(() => expect(currentStep()).toContain("Passo 4 de 4"));
    expect(calls(fetchMock, "POST /activities")[0]).toMatchObject({
      type: "mixed",
      difficulty: "medium",
      questions: [],
    });
    expect(
      calls(fetchMock, `POST /activities/${activityId}/generate`)[0],
    ).toEqual({
      questionCount: 4,
    });
    const review = calls(fetchMock, `POST /activities/${activityId}/review`)[0];
    expect(review.generationId).toBe(generationId);
    expect(review.suggestion.type).toBe("mixed");
    expect(review.suggestion.questions[0].prompt).toBe("Pergunta revisada");
    expect(
      calls(fetchMock, `POST /activities/${activityId}/approve`)[0],
    ).toEqual({
      generationId,
    });
  });

  it("keeps the teacher on track when the AI fails", async () => {
    mockApi({
      "POST /activities": { data: activity() },
      [`POST /activities/${activityId}/generate`]: () => ({
        status: 503,
        body: { error: { code: "INTEGRATION_UNAVAILABLE", message: "x" } },
      }),
    });
    withConfirm(<ActivityWizard plans={plans} />);

    await fillStepOne();
    fireEvent.click(
      screen.getByRole("button", { name: "Pedir questões à IA" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /IA não conseguiu/,
    );
    expect(currentStep()).toContain("Passo 2 de 4");
    expect(
      screen.getByRole("button", { name: "Escrever as questões" }),
    ).toBeEnabled();
  });

  it("shows what is wrong next to the question instead of saving", async () => {
    const fetchMock = mockApi({});
    withConfirm(<ActivityWizard plans={plans} />);

    await fillStepOne();
    fireEvent.click(
      screen.getByRole("button", { name: "Escrever as questões" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Aprovar questões" }));

    const question = screen.getByRole("group", { name: /Questão 1/ });
    expect(
      within(question).getByText("Escreva o enunciado da questão."),
    ).toBeInTheDocument();
    expect(within(question).getByLabelText("Enunciado")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("existing activity", () => {
  it("reopens a draft with questions at the review step", async () => {
    mockApi({
      [`GET /activities/${activityId}`]: {
        data: activity({
          questions: [
            {
              id: "q1",
              position: 0,
              kind: "discursive",
              prompt: "Pergunta salva",
              points: 2,
              targetAnswer: "Resposta",
              criteria: "Critério",
            },
          ] as Activity["questions"],
        }),
      },
      [`GET /activities/${activityId}/generation`]: { data: null },
      [`GET /activities/${activityId}/publication`]: { data: null },
    });
    withConfirm(<ActivityPage activityId={activityId} plans={plans} />);

    await waitFor(() => expect(currentStep()).toContain("Passo 3 de 4"));
    expect(screen.getByDisplayValue("Pergunta salva")).toBeInTheDocument();
  });

  it("follows a sent activity and closes it after confirmation", async () => {
    const fetchMock = mockApi({
      [`GET /activities/${activityId}`]: {
        data: activity({ status: "published", responseCount: 25 }),
      },
      [`GET /activities/${activityId}/publication`]: { data: publication() },
      [`POST /activities/${activityId}/finish`]: {
        data: { status: "finished" },
      },
    });
    withConfirm(<ActivityPage activityId={activityId} plans={plans} />);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Frações – exercício 1",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Enviada para a turma")).toBeInTheDocument();
    expect(screen.getByText(/25 respostas recebidas/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Abrir o formulário" }),
    ).toHaveAttribute("href", publication().responderUri);
    expect(
      screen.getByRole("link", {
        name: "Abrir no Google Sala de Aula (7º ano B)",
      }),
    ).toHaveAttribute("href", "https://classroom.google.com/c/c1/a/w1");
    expect(screen.getByRole("link", { name: "Ver respostas" })).toHaveAttribute(
      "href",
      `#/correcoes/${activityId}`,
    );

    fireEvent.click(screen.getByRole("button", { name: "Encerrar respostas" }));
    await confirmDialog("Encerrar respostas");
    await waitFor(() =>
      expect(
        calls(fetchMock, `POST /activities/${activityId}/finish`),
      ).toHaveLength(1),
    );
  });

  it("explains a failed delivery and retries it", async () => {
    const fetchMock = mockApi({
      [`GET /activities/${activityId}`]: {
        data: activity({
          questions: [
            {
              id: "q1",
              position: 0,
              kind: "discursive",
              prompt: "P",
              points: 2,
              targetAnswer: "R",
              criteria: "C",
            },
          ] as Activity["questions"],
        }),
      },
      [`GET /activities/${activityId}/generation`]: { data: null },
      [`GET /activities/${activityId}/publication`]: {
        data: publication({
          status: "failed",
          errorCode: "GOOGLE_RATE_LIMITED",
        }),
      },
      [`POST /activities/${activityId}/publish`]: { data: publication() },
    });
    withConfirm(<ActivityPage activityId={activityId} plans={plans} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /O Google está ocupado/,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Tentar enviar de novo" }),
    );
    await waitFor(() =>
      expect(
        calls(fetchMock, `POST /activities/${activityId}/publish`),
      ).toHaveLength(1),
    );
  });
});
