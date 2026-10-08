import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App.js";

function response(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("Google authentication screen", () => {
  it("shows Google as the exclusive login when there is no session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ data: { authenticated: false } })),
    );

    render(<App />);

    const login = await screen.findByRole("link", {
      name: "Entrar com Google",
    });
    expect(login).toHaveAttribute("href", "/api/auth/google/start");
    expect(screen.queryByLabelText(/senha/i)).not.toBeInTheDocument();
  });

  it("renders the protected professor shell and integration states", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          response({
            data: {
              authenticated: true,
              identity: {
                professorId: "5d73ea1d-9ab8-4384-960e-3a6f00e6328a",
                email: "professora@example.invalid",
                displayName: "Professora Teste",
                provider: "google",
              },
            },
          }),
        )
        .mockResolvedValueOnce(
          response({
            data: [
              {
                service: "google_oauth",
                status: "active",
                checkedAt: new Date().toISOString(),
                errorCode: null,
              },
            ],
          }),
        ),
    );

    render(<App />);

    expect(
      await screen.findByText("Olá, Professora Teste."),
    ).toBeInTheDocument();
    expect(screen.getByText("Google Classroom")).toBeInTheDocument();
    expect(screen.getAllByText("Aguardando verificação")).toHaveLength(2);
  });

  it("logs out without sending a professor identifier", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          data: {
            authenticated: true,
            identity: {
              professorId: "5d73ea1d-9ab8-4384-960e-3a6f00e6328a",
              email: "professora@example.invalid",
              displayName: "Professora Teste",
              provider: "google",
            },
          },
        }),
      )
      .mockResolvedValueOnce(response({ data: [] }))
      .mockResolvedValueOnce(response(undefined));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Sair" }));

    expect(
      await screen.findByRole("link", { name: "Entrar com Google" }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  });

  it("shows a recoverable API error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não conseguimos abrir o EDUC.AI",
    );
    expect(
      screen.getByRole("button", { name: "Tentar novamente" }),
    ).toBeEnabled();
  });
});
