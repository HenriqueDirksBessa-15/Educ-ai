import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App.js";

function response(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

const identity = {
  professorId: "5d73ea1d-9ab8-4384-960e-3a6f00e6328a",
  email: "professora@example.invalid",
  displayName: "Professora Teste",
  provider: "google",
};

// Answers each API path with its fixture; anything else is an empty list.
function mockApi(routes: Record<string, unknown> = {}) {
  const fetchMock = vi.fn(async (url: string) => {
    const path = url.replace(/^\/api/, "").split("?")[0]!;
    if (path in routes) return response(routes[path]);
    return response({ data: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function signedIn(integrations: unknown[] = []) {
  return mockApi({
    "/auth/session": { data: { authenticated: true, identity } },
    "/integrations/status": { data: integrations },
    "/auth/logout": undefined,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("Google authentication screen", () => {
  it("shows Google as the exclusive login when there is no session", async () => {
    mockApi({ "/auth/session": { data: { authenticated: false } } });

    render(<App />);

    const login = await screen.findByRole("link", {
      name: "Entrar com Google",
    });
    expect(login).toHaveAttribute("href", "/api/auth/google/start");
    expect(screen.queryByLabelText(/senha/i)).not.toBeInTheDocument();
  });

  it("logs out from the account page without sending a professor identifier", async () => {
    window.location.hash = "#/conta";
    const fetchMock = signedIn();

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Sair" }));

    expect(
      await screen.findByRole("link", { name: "Entrar com Google" }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("professorId");
  });

  it("shows a recoverable error when the server cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(<App />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Não conseguimos abrir o EDUC.AI");
    expect(alert).not.toHaveTextContent(/API/);
    expect(
      screen.getByRole("button", { name: "Tentar novamente" }),
    ).toBeEnabled();
  });
});

describe("teacher shell", () => {
  it("offers task navigation with the current page marked", async () => {
    signedIn();

    render(<App />);

    const menu = await screen.findByRole("navigation", {
      name: "Menu principal",
    });
    expect(within(menu).getByRole("link", { name: /Início/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    for (const label of [
      "Turmas",
      "Aulas",
      "Atividades",
      "Correções",
      "Recados",
      "Boletins",
    ])
      expect(
        within(menu).getByRole("link", { name: new RegExp(label) }),
      ).toBeInTheDocument();
    expect(within(menu).getByRole("link", { name: "+ Criar" })).toHaveAttribute(
      "href",
      "#/criar",
    );
    expect(
      within(menu).getByRole("link", { name: /Professora Teste/ }),
    ).toHaveAttribute("href", "#/conta");
  });

  it("changes page, heading and tab title when the address changes", async () => {
    signedIn();
    render(<App />);
    await screen.findByRole("heading", { level: 1, name: /Olá/ });

    window.location.hash = "#/boletins";
    window.dispatchEvent(new HashChangeEvent("hashchange"));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Boletins" }),
    ).toBeInTheDocument();
    expect(document.title).toBe("Boletins · EDUC.AI");
    const menu = screen.getByRole("navigation", { name: "Menu principal" });
    expect(
      within(menu).getByRole("link", { name: /Boletins/ }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("warns about Google only when one of its services is down", async () => {
    signedIn([
      {
        service: "google_classroom",
        status: "inactive",
        checkedAt: new Date().toISOString(),
        errorCode: "GOOGLE_SERVICE_UNAVAILABLE",
      },
    ]);
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "O Google Sala de Aula está fora do ar agora",
    );
  });

  it("stays quiet when Google services are working or unchecked", async () => {
    signedIn([
      {
        service: "google_oauth",
        status: "active",
        checkedAt: new Date().toISOString(),
        errorCode: null,
      },
    ]);
    render(<App />);
    await screen.findByRole("heading", { level: 1, name: /Olá/ });
    expect(screen.queryByText(/fora do ar/)).not.toBeInTheDocument();
    expect(screen.queryByText("Google OAuth")).not.toBeInTheDocument();
  });

  it("never shows implementation markers or technical jargon", async () => {
    const pages: Array<[string, string]> = [
      ["#/inicio", "Olá, Professora Teste"],
      ["#/criar", "O que você quer criar?"],
      ["#/turmas", "Turmas"],
      ["#/aulas", "Aulas"],
      ["#/atividades", "Atividades"],
      ["#/correcoes", "Correções"],
      ["#/recados", "Recados"],
      ["#/boletins", "Boletins"],
      ["#/conta", "Minha conta"],
    ];
    for (const [hash, heading] of pages) {
      window.location.hash = hash;
      signedIn();
      const view = render(<App />);
      await screen.findByRole("heading", { level: 1, name: heading });
      await waitFor(() =>
        expect(screen.queryByText("Carregando…")).not.toBeInTheDocument(),
      );
      const text = document.body.textContent ?? "";
      expect(text, hash).not.toMatch(
        /Dia \d|RF0\d\d|Ciclo vertical|OAuth|\bAPI\b|fixture|Fundação|Monitoramento técnico|tokens?\b/i,
      );
      view.unmount();
    }
  }, 30_000);
});
