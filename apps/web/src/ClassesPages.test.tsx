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
