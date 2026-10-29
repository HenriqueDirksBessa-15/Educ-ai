import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ClassDetailPage,
  ClassListPage,
  NewClassPage,
} from "./ClassesPages.js";
import { ConfirmProvider } from "./ConfirmDialog.js";
import { resetCatalogCache } from "./curriculumCatalog.js";

afterEach(() => {
  vi.unstubAllGlobals();
  resetCatalogCache();
  window.history.replaceState({}, "", "/");
});

const googleId = "11111111-1111-4111-8111-111111111111";
const localId = "11111111-1111-4111-8111-111111111112";

const summaries = [
  {
    id: googleId,
    name: "7º ano B",
    description: null,
    schoolYear: "7º ano",
    source: "google" as const,
  },
  {
    id: localId,
    name: "Reforço de leitura",
    description: null,
    schoolYear: "6º ano",
    source: "local" as const,
  },
];

const detail = (id: string, overrides: Record<string, unknown> = {}) => ({
  ...summaries.find((item) => item.id === id),
  generalNotice: null,
  syncStatus: "never",
  lastSyncedAt: null,
  students: [],
  curriculum: null,
  ...overrides,
});

const catalog = {
  data: [
    {
      id: "s1",
      curricularComponent: "Matemática",
      schoolYear: "ef-ano-07",
      isFixture: false,
      skills: [],
    },
    {
      id: "s2",
      curricularComponent: "Ciências",
      schoolYear: "ef-ano-07",
      isFixture: false,
      skills: [],
    },
    {
      id: "s3",
      curricularComponent: "Matemática",
      schoolYear: "ef-ano-08",
      isFixture: false,
      skills: [],
    },
    {
      id: "s4",
      curricularComponent: "Língua Portuguesa",
      schoolYear: "ef-ano-06",
      isFixture: false,
      skills: [],
    },
  ],
  reviewRequired: false,
  reason: null,
};

type Handler = (body: unknown) => unknown;

// Routes are "METHOD /path"; unknown requests fail the test loudly.
function mockApi(routes: Record<string, unknown | Handler>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url.replace(/^\/api/, "").split("?")[0]}`;
    if (!(key in routes)) throw new Error(`unexpected request: ${key}`);
    const value = routes[key];
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const payload =
      typeof value === "function" ? (value as Handler)(body) : value;
    return Response.json(payload);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const bodyOf = (fetchMock: ReturnType<typeof mockApi>, key: string) => {
  const call = fetchMock.mock.calls.find(
    ([url, init]) =>
      `${init?.method ?? "GET"} ${String(url).replace(/^\/api/, "")}` === key,
  );
  return call?.[1]?.body ? JSON.parse(String(call[1].body)) : undefined;
};

function renderWithConfirm(node: React.ReactNode) {
  return render(<ConfirmProvider>{node}</ConfirmProvider>);
}

describe("class list", () => {
  it("shows each class with its subject or a warning to define it", async () => {
    mockApi({
      [`GET /classes/${googleId}`]: {
        data: detail(googleId, {
          curriculum: {
            educationStage: "elementary_2",
            schoolYear: "ef-ano-07",
            curricularComponents: ["Matemática"],
          },
        }),
      },
      [`GET /classes/${localId}`]: { data: detail(localId) },
    });
    renderWithConfirm(<ClassListPage classes={summaries} reload={vi.fn()} />);

    const google = (await screen.findByText("7º ano B")).closest("li")!;
    expect(
      await within(google).findByText("Matemática · 7º ano"),
    ).toBeInTheDocument();
    expect(
      within(google).getByText("Do Google Sala de Aula"),
    ).toBeInTheDocument();
    expect(
      within(google).getByRole("link", { name: "Abrir 7º ano B" }),
    ).toHaveAttribute("href", `#/turmas/${googleId}`);

    const local = screen.getByText("Reforço de leitura").closest("li")!;
    expect(
      await within(local).findByText("Matéria não definida"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "+ Criar turma no EDUC.AI" }),
    ).toHaveAttribute("href", "#/nova-turma");
  });

  it("brings classes from Google and reports how many", async () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    mockApi({
      "POST /classes/sync": { data: { imported: 2, isFixture: false } },
    });
    renderWithConfirm(<ClassListPage classes={[]} reload={reload} />);

    expect(screen.getByText(/Você ainda não tem turmas/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Trazer minhas turmas do Google Sala de Aula",
      }),
    );
    expect(
      await screen.findByText("2 turmas trazidas do Google Sala de Aula."),
    ).toBeInTheDocument();
    expect(reload).toHaveBeenCalled();
  });

  it("explains how to recover when Google refuses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: { code: "INTEGRATION_UNAVAILABLE", message: "x" } },
          { status: 503 },
        ),
      ),
    );
    renderWithConfirm(<ClassListPage classes={[]} reload={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Trazer minhas turmas do Google Sala de Aula",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /saia e entre com Google/,
    );
  });
});

describe("class page", () => {
  it("lists students and saves one subject with the BNCC year value", async () => {
    const fetchMock = mockApi({
      [`GET /classes/${googleId}`]: {
        data: detail(googleId, {
          students: [
            {
              id: "st1",
              name: "Carla Mendes",
              email: "carla@example.invalid",
              origin: "google",
              status: "active",
            },
            {
              id: "st2",
              name: "Bruno Costa",
              email: "bruno@example.invalid",
              origin: "google",
              status: "pending",
            },
          ],
        }),
      },
      "GET /curriculum": catalog,
      [`PUT /classes/${googleId}/curriculum`]: { data: { updated: true } },
    });
    const reload = vi.fn().mockResolvedValue(undefined);
    renderWithConfirm(<ClassDetailPage classId={googleId} reload={reload} />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "7º ano B" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Carla Mendes")).toBeInTheDocument();
    expect(screen.getByText("Aguardando confirmação")).toBeInTheDocument();

    fireEvent.change(await screen.findByLabelText(/^Etapa/), {
      target: { value: "elementary_2" },
    });
    fireEvent.change(screen.getByLabelText(/^Ano/), {
      target: { value: "ef-ano-07" },
    });
    expect(
      screen.getAllByRole("radio").map((item) => item.getAttribute("value")),
    ).toEqual(["Ciências", "Matemática"]);
    fireEvent.click(screen.getByRole("radio", { name: "Matemática" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(
      await screen.findByText(
        "Pronto! A matéria e o ano da turma foram salvos.",
      ),
    ).toBeInTheDocument();
    expect(bodyOf(fetchMock, `PUT /classes/${googleId}/curriculum`)).toEqual({
      educationStage: "elementary_2",
      schoolYear: "ef-ano-07",
      curricularComponents: ["Matemática"],
    });
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("professorId");
  });

  it("updates the student list of a Google class", async () => {
    const fetchMock = mockApi({
      [`GET /classes/${googleId}`]: { data: detail(googleId) },
      "GET /curriculum": catalog,
      [`POST /classes/${googleId}/students/sync`]: {
        data: { synchronized: 28 },
      },
    });
    renderWithConfirm(<ClassDetailPage classId={googleId} reload={vi.fn()} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Atualizar lista de alunos" }),
    );
    expect(
      await screen.findByText("Lista de alunos atualizada."),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith(`/classes/${googleId}/students/sync`),
      ),
    ).toBe(true);
  });

  it("asks before creating a local class in Google Classroom", async () => {
    const fetchMock = mockApi({
      [`GET /classes/${localId}`]: { data: detail(localId) },
      "GET /curriculum": catalog,
      [`POST /classes/${localId}/google`]: {
        data: { googleClassroomId: "c1" },
      },
    });
    renderWithConfirm(<ClassDetailPage classId={localId} reload={vi.fn()} />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Criar no Google Sala de Aula",
      }),
    );
    expect(
      screen.getByRole("alertdialog", {
        name: "Criar esta turma no Google Sala de Aula?",
      }),
    ).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    });
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith("/google")),
    ).toBe(false);

    fireEvent.click(
      screen.getByRole("button", { name: "Criar no Google Sala de Aula" }),
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Criar turma no Google" }),
      );
    });
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).endsWith("/google")),
      ).toBe(true),
    );
  });
});

describe("removing classes and students", () => {
  const students = [
    {
      id: "22222222-2222-4222-8222-222222222221",
      name: "Ana Google",
      email: "ana@example.invalid",
      origin: "google",
      status: "active",
      isInconsistent: false,
      inconsistencyReason: null,
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Beto Manual",
      email: "beto@example.invalid",
      origin: "spreadsheet",
      status: "active",
      isInconsistent: false,
      inconsistencyReason: null,
    },
  ];

  const confirmWith = async (label: string) => {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: label }));
    });
  };

  it("deletes a local class without content after confirmation", async () => {
    const fetchMock = mockApi({
      [`GET /classes/${localId}`]: { data: detail(localId) },
      "GET /curriculum": catalog,
      [`GET /classes/${localId}/removal`]: {
        data: { action: "delete", plans: 0, activities: 0, grades: 0 },
      },
      [`DELETE /classes/${localId}`]: { data: { status: "deleted" } },
    });
    const reload = vi.fn().mockResolvedValue(undefined);
    renderWithConfirm(<ClassDetailPage classId={localId} reload={reload} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Excluir Reforço de leitura" }),
    );
    expect(
      await screen.findByRole("alertdialog", {
        name: "Excluir a turma Reforço de leitura?",
      }),
    ).toBeInTheDocument();
    await confirmWith("Excluir turma");

    await waitFor(() => expect(window.location.hash).toBe("#/turmas"));
    expect(reload).toHaveBeenCalled();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          init?.method === "DELETE" &&
          String(url).endsWith(`/classes/${localId}`),
      ),
    ).toBe(true);
  });

  it("offers archiving when the class has plans, activities or grades", async () => {
    const fetchMock = mockApi({
      [`GET /classes/${localId}`]: { data: detail(localId) },
      "GET /curriculum": catalog,
      [`GET /classes/${localId}/removal`]: {
        data: { action: "archive", plans: 2, activities: 1, grades: 0 },
      },
      [`POST /classes/${localId}/archive`]: { data: { archived: true } },
    });
    renderWithConfirm(
      <ClassDetailPage
        classId={localId}
        reload={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Excluir Reforço de leitura" }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "A turma Reforço de leitura não pode ser excluída",
    });
    expect(dialog).toHaveTextContent("2 planos, 1 atividade e 0 boletins");
    await confirmWith("Arquivar turma");

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).endsWith("/archive")),
      ).toBe(true),
    );
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE"),
    ).toBe(false);
  });

  it("removes only the local link of a Google class, with a warning", async () => {
    mockApi({
      [`GET /classes/${googleId}`]: { data: detail(googleId) },
      "GET /curriculum": catalog,
      [`GET /classes/${googleId}/removal`]: {
        data: { action: "unlink", plans: 0, activities: 0, grades: 0 },
      },
    });
    renderWithConfirm(<ClassDetailPage classId={googleId} reload={vi.fn()} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Excluir 7º ano B" }),
    );
    expect(
      await screen.findByRole("alertdialog", {
        name: "Remover 7º ano B do EDUC.AI?",
      }),
    ).toHaveTextContent("continua no Classroom");
  });

  it("removes a manual student but only restricts a Google student", async () => {
    const fetchMock = mockApi({
      [`GET /classes/${googleId}`]: { data: detail(googleId, { students }) },
      "GET /curriculum": catalog,
      [`PATCH /classes/${googleId}/students/${students[0]!.id}`]: {
        data: { status: "restricted" },
      },
      [`DELETE /classes/${googleId}/students/${students[1]!.id}`]: {},
    });
    renderWithConfirm(<ClassDetailPage classId={googleId} reload={vi.fn()} />);

    await screen.findByText("Ana Google");
    expect(
      screen.queryByRole("button", { name: "Remover Ana Google" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Como tirar um aluno do Google Sala de Aula"),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Marcar Ana Google como restrito" }),
    );
    await confirmWith("Marcar como restrito");
    expect(
      await screen.findByText("Ana Google agora está restrito."),
    ).toBeInTheDocument();
    expect(
      bodyOf(
        fetchMock,
        `PATCH /classes/${googleId}/students/${students[0]!.id}`,
      ),
    ).toEqual({ status: "restricted" });

    fireEvent.click(
      screen.getByRole("button", { name: "Remover Beto Manual" }),
    );
    await confirmWith("Remover aluno");
    expect(
      await screen.findByText("Beto Manual saiu da turma."),
    ).toBeInTheDocument();
  });

  it("previews a student sheet line by line and imports only when it is clean", async () => {
    const csv = "nome;matricula;email\nAna;1;\n;2;";
    const rows = [
      {
        line: 2,
        name: "Ana",
        registrationNumber: "1",
        email: null,
        status: "new",
        errors: [],
      },
      {
        line: 3,
        name: "",
        registrationNumber: "2",
        email: null,
        status: "error",
        errors: ["Falta o nome."],
      },
    ];
    const fetchMock = mockApi({
      [`GET /classes/${localId}`]: { data: detail(localId) },
      "GET /curriculum": catalog,
      [`POST /classes/${localId}/students/import/preview`]: (
        body: unknown,
      ) => ({
        data: (body as { csv: string }).csv.includes(";2;")
          ? { rows, canImport: false }
          : { rows: [rows[0]], canImport: true },
      }),
      [`POST /classes/${localId}/students/import/confirm`]: {
        data: { created: 1, linked: 0, unchanged: 0 },
      },
    });
    renderWithConfirm(<ClassDetailPage classId={localId} reload={vi.fn()} />);

    const input = await screen.findByLabelText("Arquivo CSV");
    fireEvent.change(input, {
      target: { files: [new File([csv], "alunos.csv", { type: "text/csv" })] },
    });
    const table = await screen.findByRole("table", {
      name: "Prévia da importação",
    });
    expect(within(table).getByText(/Falta o nome/)).toBeInTheDocument();
    expect(
      screen.getByText(
        "1 linha precisa de correção. Ajuste a planilha e envie de novo.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Importar 2 alunos" }),
    ).toBeDisabled();

    fireEvent.change(input, {
      target: {
        files: [new File(["nome;matricula\nAna;1"], "alunos.csv")],
      },
    });
    const importButton = await screen.findByRole("button", {
      name: "Importar 1 aluno",
    });
    expect(importButton).toBeEnabled();
    fireEvent.click(importButton);
    expect(
      await screen.findByText(/Importação concluída: 1 aluno novo/),
    ).toBeInTheDocument();
    expect(
      bodyOf(fetchMock, `POST /classes/${localId}/students/import/confirm`),
    ).toEqual({ csv: "nome;matricula\nAna;1" });
  });

  it("warns that a student is already enrolled instead of adding twice", async () => {
    const message =
      "Este aluno já está nesta turma e continua restrito. Para reativá-lo, use “Reativar” na lista de alunos.";
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${url.replace(/^\/api/, "").split("?")[0]}`;
      if (key === `GET /classes/${localId}`)
        return Response.json({ data: detail(localId) });
      if (key === "GET /curriculum") return Response.json(catalog);
      if (key === `POST /classes/${localId}/students`)
        return Response.json(
          { error: { code: "VALIDATION_ERROR", message } },
          { status: 409 },
        );
      throw new Error(`unexpected request: ${key}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderWithConfirm(<ClassDetailPage classId={localId} reload={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText("Nome do aluno"), {
      target: { value: "Ana" },
    });
    fireEvent.change(screen.getByLabelText("Matrícula"), {
      target: { value: "2026001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar aluno" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    const sent = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST",
    );
    expect(JSON.parse(String((sent![1] as RequestInit).body))).toEqual({
      name: "Ana",
      registrationNumber: "2026001",
      email: null,
      origin: "spreadsheet",
    });
  });

  it("brings an archived class back to the list", async () => {
    const fetchMock = mockApi({
      [`GET /classes/${localId}`]: {
        data: detail(localId, { archivedAt: "2026-10-29T12:00:00.000Z" }),
      },
      "GET /curriculum": catalog,
      [`POST /classes/${localId}/restore`]: { data: { archived: false } },
    });
    renderWithConfirm(<ClassDetailPage classId={localId} reload={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Desarquivar" }));
    expect(
      await screen.findByText("A turma voltou para a sua lista."),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith("/restore")),
    ).toBe(true);
    expect(
      screen.queryByRole("button", { name: "Excluir Reforço de leitura" }),
    ).not.toBeInTheDocument();
  });
});

describe("new class", () => {
  it("creates the class with a generated code and its subject, then opens it", async () => {
    const newId = "11111111-1111-4111-8111-111111111113";
    const fetchMock = mockApi({
      "GET /curriculum": catalog,
      "POST /classes": { data: { id: newId } },
      [`PUT /classes/${newId}/curriculum`]: { data: { updated: true } },
    });
    const reload = vi.fn().mockResolvedValue(undefined);
    renderWithConfirm(<NewClassPage reload={reload} />);

    const code = (await screen.findByLabelText(
      /^Código da turma/,
    )) as HTMLInputElement;
    expect(code.value.length).toBeGreaterThanOrEqual(4);

    fireEvent.change(screen.getByLabelText(/^Nome da turma/), {
      target: { value: "8º ano C" },
    });
    fireEvent.change(screen.getByLabelText(/^Etapa/), {
      target: { value: "elementary_2" },
    });
    fireEvent.change(screen.getByLabelText(/^Ano/), {
      target: { value: "ef-ano-08" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Matemática" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar turma" }));

    await waitFor(() => expect(window.location.hash).toBe(`#/turmas/${newId}`));
    expect(bodyOf(fetchMock, "POST /classes")).toEqual({
      name: "8º ano C",
      schoolYear: "8º ano",
      localAccessCode: code.value,
    });
    expect(bodyOf(fetchMock, `PUT /classes/${newId}/curriculum`)).toEqual({
      educationStage: "elementary_2",
      schoolYear: "ef-ano-08",
      curricularComponents: ["Matemática"],
    });
    expect(reload).toHaveBeenCalled();
  });

  it("says what is missing instead of sending an incomplete class", async () => {
    const fetchMock = mockApi({ "GET /curriculum": catalog });
    renderWithConfirm(<NewClassPage reload={vi.fn()} />);
    await screen.findByLabelText(/^Etapa/);

    fireEvent.click(screen.getByRole("button", { name: "Criar turma" }));

    expect(
      await screen.findByText("Escreva o nome da turma."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Nome da turma/)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "POST"),
    ).toBe(false);
  });

  it("warns when the BNCC catalog is not loaded", async () => {
    mockApi({
      "GET /curriculum": { data: [], reviewRequired: false, reason: null },
    });
    renderWithConfirm(<NewClassPage reload={vi.fn()} />);
    expect(
      await screen.findByText(/A BNCC ainda não foi carregada neste ambiente/),
    ).toBeInTheDocument();
  });
});
