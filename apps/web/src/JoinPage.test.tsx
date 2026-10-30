import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { JoinPage } from "./JoinPage";

afterEach(() => vi.unstubAllGlobals());

function fill(code: string) {
  fireEvent.change(screen.getByLabelText("Código da turma"), {
    target: { value: code },
  });
  fireEvent.change(screen.getByLabelText("Seu nome"), {
    target: { value: "Caio" },
  });
  fireEvent.change(screen.getByLabelText("Seu e-mail"), {
    target: { value: "caio@gmail.com" },
  });
  fireEvent.click(
    screen.getByLabelText("Li o aviso de privacidade e estou de acordo"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Entrar na turma" }));
}

describe("student join page", () => {
  it("tells a student from another domain to wait for the teacher", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        { data: { status: "pending", className: "7º A" } },
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<JoinPage />);

    fill(" TURMA-1234 ");

    expect(
      await screen.findByText(/O professor precisa confirmar sua entrada/),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "7º A" })).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toMatch(/\/join$/);
    expect(JSON.parse(String(init.body))).toEqual({
      code: "TURMA-1234",
      name: "Caio",
      email: "caio@gmail.com",
      privacyAccepted: true,
    });
  });

  it("does not send anything before the privacy notice is accepted", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<JoinPage />);

    expect(screen.getByText("Aviso de privacidade")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Código da turma"), {
      target: { value: "TURMA-1234" },
    });
    fireEvent.change(screen.getByLabelText("Seu nome"), {
      target: { value: "Caio" },
    });
    fireEvent.change(screen.getByLabelText("Seu e-mail"), {
      target: { value: "caio@gmail.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Entrar na turma" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Leia o aviso de privacidade",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains an unknown code", async () => {
    const message =
      "Não encontramos uma turma com esse código. Confira com o professor.";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: { code: "NOT_FOUND", message } },
          { status: 404 },
        ),
      ),
    );
    render(<JoinPage />);

    fill("ERRADO");

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });
});
