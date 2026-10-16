import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccountPage } from "./AccountPage.js";

afterEach(() => vi.unstubAllGlobals());

const identity = {
  professorId: "61111111-1111-4111-8111-111111111111",
  email: "professora.ana@example.invalid",
  displayName: "Professora Ana",
  provider: "google" as const,
};

const profile = {
  id: identity.professorId,
  displayName: "Professora Ana",
  email: identity.email,
  profileImageUrl: null,
  notificationPreference: "visual",
  createdAt: "2026-10-07T12:00:00.000Z",
};

type Handler = (body: unknown) => { status?: number; body: unknown };

function mockApi(routes: Record<string, unknown | Handler>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url.replace(/^\/api/, "")}`;
    if (!(key in routes)) throw new Error(`unexpected request: ${key}`);
    const value = routes[key];
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (typeof value === "function") {
      const result = (value as Handler)(body);
      return result.status === 204
        ? new Response(null, { status: 204 })
        : Response.json(result.body, { status: result.status ?? 200 });
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

function renderPage(
  overrides: Partial<Parameters<typeof AccountPage>[0]> = {},
) {
  const props = {
    identity,
    loggingOut: false,
    onLogout: vi.fn(),
    onNameChange: vi.fn(),
    onDeleted: vi.fn(),
    ...overrides,
  };
  render(<AccountPage {...props} />);
  return props;
}

describe("account details", () => {
  it("shows the name, the Google e-mail and the data download", async () => {
    mockApi({ "GET /profile": { data: profile } });
    renderPage();

    expect(await screen.findByLabelText(/^Seu nome/)).toHaveValue(
      "Professora Ana",
    );
    expect(
      screen.getByText("professora.ana@example.invalid"),
    ).toBeInTheDocument();
    expect(screen.getByText(/vem da sua conta do Google/)).toBeInTheDocument();
    expect(
      screen.getByText(/No EDUC.AI desde 07\/10\/2026/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Baixar uma cópia dos meus dados" }),
    ).toHaveAttribute("href", "/api/privacy/export");
    expect(screen.queryByText(/notifica/i)).not.toBeInTheDocument();
  });

  it("saves a new name and updates the menu right away", async () => {
    const fetchMock = mockApi({
      "GET /profile": { data: profile },
      "PATCH /profile": { data: { ...profile, displayName: "Ana Souza" } },
    });
    const props = renderPage();

    fireEvent.change(await screen.findByLabelText(/^Seu nome/), {
      target: { value: "  Ana Souza " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nome" }));

    expect(await screen.findByText("Nome atualizado.")).toBeInTheDocument();
    expect(calls(fetchMock, "PATCH /profile")[0]).toEqual({
      displayName: "Ana Souza",
    });
    expect(props.onNameChange).toHaveBeenCalledWith("Ana Souza");
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("professorId");
  });

  it("does not save an empty name", async () => {
    const fetchMock = mockApi({ "GET /profile": { data: profile } });
    renderPage();

    fireEvent.change(await screen.findByLabelText(/^Seu nome/), {
      target: { value: " " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nome" }));

    expect(screen.getByText("Escreva seu nome.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Seu nome/)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(calls(fetchMock, "PATCH /profile")).toHaveLength(0);
  });

  it("still lets the teacher sign out when the profile cannot load", async () => {
    mockApi({
      "GET /profile": () => ({
        status: 500,
        body: { error: { code: "INTERNAL_ERROR", message: "x" } },
      }),
    });
    const props = renderPage();

    expect(
      await screen.findByText("Não conseguimos carregar seus dados agora."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    expect(props.onLogout).toHaveBeenCalled();
  });
});

describe("unexpected answers", () => {
  it("treats a malformed profile as a load failure instead of breaking", async () => {
    mockApi({ "GET /profile": { data: [] } });
    const props = renderPage();
    expect(
      await screen.findByText("Não conseguimos carregar seus dados agora."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    expect(props.onLogout).toHaveBeenCalled();
  });
});

describe("account deletion", () => {
  it("deletes only after the teacher types EXCLUIR", async () => {
    const fetchMock = mockApi({
      "GET /profile": { data: profile },
      "DELETE /privacy/account": () => ({ status: 204, body: null }),
    });
    const props = renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Excluir minha conta" }),
    );
    const finalButton = screen.getByRole("button", {
      name: "Excluir minha conta para sempre",
    });
    expect(finalButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Para confirmar, digite EXCLUIR/), {
      target: { value: "excluir" },
    });
    expect(finalButton).toBeEnabled();
    fireEvent.click(finalButton);

    await waitFor(() => expect(props.onDeleted).toHaveBeenCalled());
    expect(calls(fetchMock, "DELETE /privacy/account")[0]).toEqual({
      confirmation: "EXCLUIR",
    });
  });

  it("keeps the account when deletion fails", async () => {
    mockApi({
      "GET /profile": { data: profile },
      "DELETE /privacy/account": () => ({
        status: 500,
        body: { error: { code: "INTERNAL_ERROR", message: "x" } },
      }),
    });
    const props = renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: "Excluir minha conta" }),
    );
    fireEvent.change(screen.getByLabelText(/Para confirmar, digite EXCLUIR/), {
      target: { value: "EXCLUIR" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Excluir minha conta para sempre" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível excluir sua conta agora. Tente de novo.",
    );
    expect(props.onDeleted).not.toHaveBeenCalled();
  });
});
