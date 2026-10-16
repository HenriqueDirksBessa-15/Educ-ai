import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BulletinsPage } from "./BulletinsPage.js";
import { ConfirmProvider } from "./ConfirmDialog.js";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 16, 10, 0));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const classId = "11111111-1111-4111-8111-111111111111";
const students = [
  {
    id: "st1",
    name: "Ana Lima",
    email: "ana@example.invalid",
    classId,
    className: "7º ano B",
  },
  {
    id: "st2",
    name: "Bruno Costa",
    email: "bruno@example.invalid",
    classId,
    className: "7º ano B",
  },
];

const bulletin = (
  id: string,
  name: string,
  overrides: Record<string, unknown> = {},
) => ({
  id,
  classId,
  className: "7º ano B",
  studentId: `st-${id}`,
  studentName: name,
  studentEmail: `${name.split(" ")[0]!.toLowerCase()}@example.invalid`,
  periodType: "bimonthly",
  periodStart: "2026-09-01",
  periodEnd: "2026-10-31",
  title: "Boletim de aprendizagem",
  teacherComment: null,
  average: 8.5,
  activities: [
    {
      activityId: "a1",
      title: "Frações",
      dueAt: "2026-10-10T23:59:00.000Z",
      grade: 8.5,
    },
  ],
  feedbacks: [],
  status: "generated",
  lastErrorCode: null,
  generatedAt: "2026-10-16T10:00:00.000Z",
  sentAt: null,
  pdfSha256: "a".repeat(64),
  deliveries: [],
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

const routes = (bulletins: unknown[] = []) => ({
  "GET /bulletins": { data: bulletins },
  "GET /bulletins/eligible-students": { data: students },
});

async function chooseClassAndPeriod() {
  fireEvent.change(await screen.findByLabelText(/^Turma/), {
    target: { value: classId },
  });
  fireEvent.change(screen.getByLabelText(/^Tipo de período/), {
    target: { value: "bimonthly" },
  });
}

describe("generating bulletins", () => {
  it("generates for the whole class with the period already filled", async () => {
    const fetchMock = mockApi({
      ...routes(),
      "POST /bulletins": { data: { ids: ["b1", "b2"] } },
    });
    withConfirm(<BulletinsPage />);

    await chooseClassAndPeriod();
    expect(screen.getByLabelText(/^Início/)).toHaveValue("2026-09-01");
    expect(screen.getByLabelText(/^Fim/)).toHaveValue("2026-10-31");
    expect(screen.getByRole("checkbox", { name: "Ana Lima" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Bruno Costa" })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Selecionar todos (2)" }),
    ).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Gerar boletins" }));

    expect(await screen.findByText("2 boletins gerados.")).toBeInTheDocument();
    expect(calls(fetchMock, "POST /bulletins")[0]).toEqual({
      classId,
      studentIds: ["st1", "st2"],
      periodType: "bimonthly",
      periodStart: "2026-09-01",
      periodEnd: "2026-10-31",
      title: "Boletim de aprendizagem",
      teacherComment: null,
      onlyBelowAverage: false,
    });
    expect(calls(fetchMock, "GET /bulletins")).toHaveLength(2);
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("professorId");
  });

  it("lets the teacher pick students and filter by average", async () => {
    const fetchMock = mockApi({
      ...routes(),
      "POST /bulletins": { data: { ids: ["b1"] } },
    });
    withConfirm(<BulletinsPage />);

    await chooseClassAndPeriod();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Selecionar todos (2)" }),
    );
    expect(
      screen.getByRole("checkbox", { name: "Ana Lima" }),
    ).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Bruno Costa" }));
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Só alunos com média abaixo de um valor",
      }),
    );
    fireEvent.change(screen.getByLabelText(/^Média mínima/), {
      target: { value: "6" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Gerar boletins" }));

    await waitFor(() =>
      expect(calls(fetchMock, "POST /bulletins")).toHaveLength(1),
    );
    expect(calls(fetchMock, "POST /bulletins")[0]).toMatchObject({
      studentIds: ["st2"],
      onlyBelowAverage: true,
      averageThreshold: 6,
    });
  });

  it("explains when there are no grades in the period", async () => {
    mockApi({
      ...routes(),
      "POST /bulletins": () => ({
        status: 409,
        body: { error: { code: "VALIDATION_ERROR", message: "x" } },
      }),
    });
    withConfirm(<BulletinsPage />);

    await chooseClassAndPeriod();
    fireEvent.click(screen.getByRole("button", { name: "Gerar boletins" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /não há notas aprovadas no período/,
    );
  });

  it("says what is missing instead of generating", async () => {
    const fetchMock = mockApi(routes());
    withConfirm(<BulletinsPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Gerar boletins" }),
    );
    expect(screen.getByText("Escolha a turma.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Turma/)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "POST"),
    ).toBe(false);
  });
});

describe("sending bulletins", () => {
  it("shows the email address and sends only after confirmation", async () => {
    const fetchMock = mockApi({
      ...routes([bulletin("b1", "Ana Lima")]),
      "POST /bulletins/b1/send": { data: { status: "sent" } },
    });
    withConfirm(<BulletinsPage />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Enviar boletim de Ana Lima por e-mail",
      }),
    );
    expect(
      screen.getByRole("alertdialog", { name: "Enviar boletim por e-mail?" }),
    ).toHaveTextContent("ana@example.invalid");
    await confirmDialog("Cancelar");
    expect(calls(fetchMock, "POST /bulletins/b1/send")).toHaveLength(0);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Enviar boletim de Ana Lima por e-mail",
      }),
    );
    await confirmDialog("Enviar boletim");
    expect(
      await screen.findByText("Boletim de Ana Lima enviado."),
    ).toBeInTheDocument();
    expect(calls(fetchMock, "POST /bulletins/b1/send")).toHaveLength(1);
  });

  it("sends every pending bulletin together and reports failures", async () => {
    const fetchMock = mockApi({
      ...routes([
        bulletin("b1", "Ana Lima"),
        bulletin("b2", "Bruno Costa", {
          status: "failed",
          lastErrorCode: "EMAIL_RATE_LIMITED",
        }),
        bulletin("b3", "Carla Mendes", { status: "sent" }),
      ]),
      "POST /bulletins/b1/send": { data: { status: "sent" } },
      "POST /bulletins/b2/send": () => ({
        status: 503,
        body: { error: { code: "INTEGRATION_UNAVAILABLE", message: "x" } },
      }),
    });
    withConfirm(<BulletinsPage />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Enviar 2 boletins ainda não enviados",
      }),
    );
    await confirmDialog("Enviar boletins");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "1 boletim não foi enviado: Bruno Costa. Tente de novo.",
    );
    expect(calls(fetchMock, "POST /bulletins/b1/send")).toHaveLength(1);
    expect(calls(fetchMock, "POST /bulletins/b3/send")).toHaveLength(0);
  });

  it("shows dates, averages and states in plain Portuguese", async () => {
    mockApi(
      routes([
        bulletin("b1", "Ana Lima"),
        bulletin("b2", "Bruno Costa", {
          status: "failed",
          lastErrorCode: "EMAIL_RATE_LIMITED",
        }),
      ]),
    );
    withConfirm(<BulletinsPage />);

    const list = await screen.findByRole("list", { name: "Boletins gerados" });
    expect(within(list).getByText("Ana Lima · média 8,5")).toBeInTheDocument();
    expect(
      within(list).getAllByText(/01\/09\/2026 a 31\/10\/2026/),
    ).toHaveLength(2);
    expect(within(list).getByText("Ainda não enviado")).toBeInTheDocument();
    expect(
      within(list).getByText(/Muitos e-mails enviados de uma vez/),
    ).toBeInTheDocument();
    expect(
      within(list).getByRole("link", { name: "Ver PDF de Ana Lima" }),
    ).toHaveAttribute("href", "/api/bulletins/b1/pdf");
    expect(list.textContent).not.toMatch(/generated|EMAIL_|2026-09-01/);
  });
});
