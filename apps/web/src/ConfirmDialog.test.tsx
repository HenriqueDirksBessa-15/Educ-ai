import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConfirmProvider, useConfirm } from "./ConfirmDialog.js";

function Probe({ onResult }: { onResult: (value: boolean) => void }) {
  const confirm = useConfirm();
  return (
    <button
      type="button"
      onClick={() =>
        void confirm({
          title: "Enviar para a turma?",
          body: "A atividade aparecerá no Google Sala de Aula.",
          confirmLabel: "Enviar para a turma",
        }).then(onResult)
      }
    >
      Publicar
    </button>
  );
}

function setup() {
  const results: boolean[] = [];
  render(
    <ConfirmProvider>
      <Probe onResult={(value) => results.push(value)} />
    </ConfirmProvider>,
  );
  // Browsers focus a button when it is clicked; jsdom does not.
  const trigger = screen.getByRole("button", { name: "Publicar" });
  trigger.focus();
  fireEvent.click(trigger);
  return results;
}

describe("confirmation dialog", () => {
  it("is a modal alert dialog that receives focus", () => {
    setup();
    const dialog = screen.getByRole("alertdialog", {
      name: "Enviar para a turma?",
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription(
      "A atividade aparecerá no Google Sala de Aula.",
    );
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it("resolves true only when the teacher confirms", async () => {
    const results = setup();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Enviar para a turma" }),
      );
    });
    expect(results).toEqual([true]);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publicar" })).toHaveFocus();
  });

  it("resolves false on cancel or Escape", async () => {
    const results = setup();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    });
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await act(async () => {
      fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    });
    expect(results).toEqual([false, false]);
  });
});
