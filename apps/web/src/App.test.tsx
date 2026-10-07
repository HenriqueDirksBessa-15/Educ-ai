import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App.js";

function response(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("foundation status screen", () => {
  it("renders API and database availability", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          response({
            status: "alive",
            service: "educai-api",
            timestamp: new Date().toISOString(),
          }),
        )
        .mockResolvedValueOnce(
          response({
            status: "ready",
            service: "educai-api",
            database: "available",
            timestamp: new Date().toISOString(),
          }),
        ),
    );

    render(<App />);

    expect(screen.getByText("Verificando os serviços…")).toBeInTheDocument();
    expect(
      await screen.findByText("Conexão pronta para consultas"),
    ).toBeInTheDocument();
  });

  it("distinguishes an unavailable database from an active API", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          response({
            status: "alive",
            service: "educai-api",
            timestamp: new Date().toISOString(),
          }),
        )
        .mockResolvedValueOnce(
          response(
            {
              status: "not_ready",
              service: "educai-api",
              database: "unavailable",
              timestamp: new Date().toISOString(),
            },
            false,
          ),
        ),
    );

    render(<App />);

    expect(
      await screen.findByText("API ativa, banco indisponível"),
    ).toBeInTheDocument();
  });

  it("shows a recoverable communication error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connection refused")),
    );

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "API indisponível",
    );
    expect(
      screen.getByRole("button", { name: "Verificar novamente" }),
    ).toBeEnabled();
  });
});
