import type { ClassSummary, Material } from "@educai/contracts";
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
import { MessagesPage } from "./MessagesPage.js";

afterEach(() => vi.unstubAllGlobals());

const classes = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "7º ano B",
    description: null,
    schoolYear: "7º ano",
    source: "google",
  },
] as ClassSummary[];

const materials = [
  {
    id: "41111111-1111-4111-8111-111111111111",
    title: "Vídeo: frações no dia a dia",
    isArchived: false,
  },
] as unknown as Material[];

const carla = {
  id: "s1",
  studentName: "Carla Mendes",
  activityTitle: "Frações – exercício 1",
  grade: 8,
  correctionStatus: "released",
};

const savedFeedback = (overrides: Record<string, unknown> = {}) => ({
  id: "f1",
  scope: "individual",
  submissionId: "s1",
  studentId: "st1",
  studentName: "Carla Mendes",
  activityId: "a1",
  activityTitle: "Frações – exercício 1",
  classId: null,
  className: null,
  title: "Recado sobre Frações – exercício 1",
  content: "Texto salvo",
  teacherObservation: null,
  origin: "manual",
  status: "draft",
  editableUntil: "2099-01-01T00:00:00.000Z",
  canEdit: true,
  sentAt: null,
  createdAt: "2026-10-16T10:00:00.000Z",
  updatedAt: "2026-10-16T10:00:00.000Z",
  links: [],
  attachments: [],
  latestGeneration: null,
  history: [],
  notification: null,
  ...overrides,
});

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

const baseRoutes = (feedbacks: unknown[] = []) => ({
  "GET /feedbacks": { data: feedbacks },
  "GET /feedbacks/eligible-submissions": { data: [carla] },
});

async function chooseCarla() {
  fireEvent.change(await screen.findByLabelText(/^Aluno/), {
    target: { value: "s1" },
  });
}

describe("new message", () => {
  it("sends a message to one student only after confirmation", async () => {
    const fetchMock = mockApi({
      ...baseRoutes(),
      "POST /feedbacks": { data: { id: "f1" } },
      "POST /feedbacks/f1/send": { data: { status: "sent" } },
    });
    withConfirm(<MessagesPage classes={classes} materials={materials} />);

    await chooseCarla();
    expect(screen.getByLabelText(/^Título/)).toHaveValue(
      "Recado sobre Frações – exercício 1",
    );
    fireEvent.change(screen.getByLabelText(/^Mensagem/), {
      target: { value: "Carla, você foi muito bem!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar recado" }));

    const dialog = screen.getByRole("alertdialog", {
      name: "Enviar recado para Carla Mendes?",
    });
    expect(dialog).toHaveTextContent("por e-mail só para Carla Mendes");
    await confirmDialog("Enviar recado");

    expect(
      await screen.findByText("Recado enviado para Carla Mendes."),
    ).toBeInTheDocument();
    expect(calls(fetchMock, "POST /feedbacks")[0]).toEqual({
      scope: "individual",
      submissionId: "s1",
      title: "Recado sobre Frações – exercício 1",
      content: "Carla, você foi muito bem!",
      links: [],
      materialIds: [],
    });
    expect(calls(fetchMock, "POST /feedbacks/f1/send")).toHaveLength(1);
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("professorId");
  });

  it("warns that a class notice is seen by everyone and creates nothing when cancelled", async () => {
    const fetchMock = mockApi(baseRoutes());
    withConfirm(<MessagesPage classes={classes} materials={materials} />);

    fireEvent.click(await screen.findByRole("radio", { name: /A turma toda/ }));
    fireEvent.change(screen.getByLabelText(/^Turma/), {
      target: { value: classes[0]!.id },
    });
    expect(
      screen.getByText(
        "Todos os alunos da turma verão este aviso. Não cite notas nem dados de um aluno.",
      ),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Mensagem/), {
      target: { value: "Prova na sexta-feira." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar recado" }));

    expect(
      screen.getByRole("alertdialog", {
        name: "Enviar aviso para a turma 7º ano B?",
      }),
    ).toHaveTextContent(/mural do Google Sala de Aula/);
    await confirmDialog("Cancelar");
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "POST"),
    ).toBe(false);
  });

  it("lets the AI fill the message and sends the teacher's edited text", async () => {
    const fetchMock = mockApi({
      ...baseRoutes(),
      "POST /feedbacks": { data: { id: "f1" } },
      "POST /feedbacks/f1/generate": {
        data: {
          id: "g1",
          version: 1,
          status: "succeeded",
          suggestion: {
            strengths: ["Acertou as objetivas."],
            improvements: ["Explicar melhor."],
            message: "Carla, parabéns pelas objetivas!",
          },
          errorCode: null,
        },
      },
      "PATCH /feedbacks/f1": { data: { status: "updated" } },
      "POST /feedbacks/f1/send": { data: { status: "sent" } },
    });
    withConfirm(<MessagesPage classes={classes} materials={materials} />);

    await chooseCarla();
    fireEvent.change(screen.getByLabelText(/^Mensagem/), {
      target: { value: "Rascunho" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Pedir ajuda à IA" }));

    await waitFor(() =>
      expect(screen.getByLabelText(/^Mensagem/)).toHaveValue(
        "Carla, parabéns pelas objetivas!",
      ),
    );
    fireEvent.change(screen.getByLabelText(/^Mensagem/), {
      target: { value: "Carla, parabéns! Continue assim." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar recado" }));
    await confirmDialog("Enviar recado");

    await waitFor(() =>
      expect(calls(fetchMock, "POST /feedbacks/f1/send")).toHaveLength(1),
    );
    expect(calls(fetchMock, "POST /feedbacks")).toHaveLength(1);
    expect(calls(fetchMock, "PATCH /feedbacks/f1")[0]).toMatchObject({
      content: "Carla, parabéns! Continue assim.",
    });
  });

  it("says what is missing instead of saving", async () => {
    const fetchMock = mockApi(baseRoutes());
    withConfirm(<MessagesPage classes={classes} materials={materials} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Enviar recado" }),
    );

    expect(screen.getByText("Escolha quem vai receber.")).toBeInTheDocument();
    expect(screen.getByText("Escreva a mensagem.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Mensagem/)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "POST"),
    ).toBe(false);
  });
});

describe("loading", () => {
  it("only shows the form once the students are known", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    withConfirm(<MessagesPage classes={classes} materials={materials} />);
    expect(screen.queryByLabelText(/^Aluno/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Carregando…").length).toBeGreaterThan(0);
  });
});

describe("previous messages", () => {
  it("continues a draft and saves the teacher's changes", async () => {
    const fetchMock = mockApi({
      ...baseRoutes([savedFeedback()]),
      "PATCH /feedbacks/f1": { data: { status: "updated" } },
    });
    withConfirm(<MessagesPage classes={classes} materials={materials} />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Continuar Recado sobre Frações – exercício 1",
      }),
    );
    expect(screen.getByLabelText(/^Mensagem/)).toHaveValue("Texto salvo");
    expect(screen.getByText("Para: Carla Mendes")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Mensagem/), {
      target: { value: "Texto revisado" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));

    await waitFor(() =>
      expect(calls(fetchMock, "PATCH /feedbacks/f1")[0]).toMatchObject({
        content: "Texto revisado",
      }),
    );
  });

  it("deletes a draft only after confirmation", async () => {
    const fetchMock = mockApi({
      ...baseRoutes([savedFeedback()]),
      "DELETE /feedbacks/f1": { data: { status: "deleted" } },
    });
    withConfirm(<MessagesPage classes={classes} materials={materials} />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Excluir Recado sobre Frações – exercício 1",
      }),
    );
    expect(
      screen.getByRole("alertdialog", { name: "Excluir este recado?" }),
    ).toBeInTheDocument();
    await confirmDialog("Excluir recado");
    await waitFor(() =>
      expect(calls(fetchMock, "DELETE /feedbacks/f1")).toHaveLength(1),
    );
  });

  it("shows delivery in plain words", async () => {
    mockApi(
      baseRoutes([
        savedFeedback({
          status: "sent",
          canEdit: false,
          notification: { channel: "email", status: "sent", errorCode: null },
        }),
        savedFeedback({
          id: "f2",
          title: "Prova na sexta",
          scope: "global",
          studentName: null,
          className: "7º ano B",
          status: "sent",
          canEdit: false,
          notification: {
            channel: "google_classroom",
            status: "pending",
            errorCode: null,
          },
        }),
        savedFeedback({ id: "f3", title: "Apagado", status: "deleted" }),
      ]),
    );
    withConfirm(<MessagesPage classes={classes} materials={materials} />);

    const list = await screen.findByRole("list", {
      name: "Recados anteriores",
    });
    expect(within(list).getByText("Enviado por e-mail")).toBeInTheDocument();
    expect(
      within(list).getByText("Publicando no Google Sala de Aula…"),
    ).toBeInTheDocument();
    expect(within(list).getByText("Turma 7º ano B")).toBeInTheDocument();
    expect(within(list).queryByText("Apagado")).not.toBeInTheDocument();
    expect(list.textContent).not.toMatch(/pending|google_classroom|email ·/);
  });
});
