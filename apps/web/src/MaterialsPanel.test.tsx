import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MaterialsPanel } from "./MaterialsPanel";

afterEach(() => vi.unstubAllGlobals());

describe("material links", () => {
  it("creates a link for the selected class and reloads materials", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ data: { id: "material-id" } }, { status: 201 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const reload = vi.fn().mockResolvedValue(undefined);
    render(
      <MaterialsPanel
        materials={[]}
        classes={[
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "8º A",
            description: null,
            schoolYear: "8º ano EF",
            source: "local",
          },
        ]}
        reload={reload}
      />,
    );

    fireEvent.change(screen.getByLabelText("Título do material"), {
      target: { value: "Guia de frações" },
    });
    fireEvent.change(screen.getByLabelText("Endereço do material"), {
      target: { value: "https://example.invalid/guia" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar material" }));

    await waitFor(() => expect(reload).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body).toMatchObject({
      title: "Guia de frações",
      classIds: ["11111111-1111-4111-8111-111111111111"],
      url: "https://example.invalid/guia",
    });
    expect(body).not.toHaveProperty("professorId");
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/materials/links");
  });

  it("uploads a private file with its validated metadata", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ data: { id: "file-id" } }, { status: 201 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const reload = vi.fn().mockResolvedValue(undefined);
    render(
      <MaterialsPanel
        materials={[]}
        classes={[
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "8º A",
            description: null,
            schoolYear: "8º ano EF",
            source: "local",
          },
        ]}
        reload={reload}
      />,
    );

    const sourceSelect = screen.getByLabelText("Origem") as HTMLSelectElement;
    sourceSelect.value = "file";
    fireEvent.change(sourceSelect);
    fireEvent.change(screen.getByLabelText("Título do material"), {
      target: { value: "Guia privado" },
    });
    const file = new File(["%PDF"], "guia.pdf", {
      type: "application/pdf",
    });
    const fileInput = screen.getByLabelText(/^Arquivo privado/);
    Object.defineProperty(fileInput, "files", { value: [file] });
    fireEvent.submit(fileInput.closest("form")!);

    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/materials/files");
    const body = fetchMock.mock.calls[0]![1].body as FormData;
    expect(JSON.parse(String(body.get("metadata")))).toMatchObject({
      title: "Guia privado",
      classIds: ["11111111-1111-4111-8111-111111111111"],
    });
    expect(body.get("file")).toBe(file);
  });

  it("opens a persisted external link without exposing the parent window", () => {
    render(
      <MaterialsPanel
        materials={[
          {
            id: "21111111-1111-4111-8111-111111111111",
            title: "Guia seguro",
            description: null,
            category: "reading",
            classIds: ["11111111-1111-4111-8111-111111111111"],
            bnccSkillIds: [],
            url: "https://example.invalid/guia",
            fileName: null,
            mimeType: null,
            sizeBytes: null,
            classNames: ["8º A"],
            isArchived: false,
            hasPublishedContent: false,
            createdAt: "2026-10-15T10:00:00.000Z",
          },
        ]}
        classes={[]}
        reload={vi.fn()}
      />,
    );

    expect(screen.getByRole("link", { name: "Guia seguro" })).toMatchObject({
      target: "_blank",
      rel: "noopener noreferrer",
    });
  });
});
