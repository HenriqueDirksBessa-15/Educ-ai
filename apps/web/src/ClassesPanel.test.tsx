import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ClassesPanel } from "./ClassesPanel";

describe("classes vertical flow", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("opens a local class and publishes it without sending professorId", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: {
            id: "5d73ea1d-9ab8-4384-960e-3a6f00e6328a",
            name: "Matemática",
            description: null,
            schoolYear: "8º ano EF",
            source: "local",
            generalNotice: null,
            syncStatus: "never",
            lastSyncedAt: null,
            students: [],
            curriculum: null,
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ data: { googleClassroomId: "course-id" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const reload = vi.fn().mockResolvedValue(undefined);
    render(
      <ClassesPanel
        classes={[
          {
            id: "5d73ea1d-9ab8-4384-960e-3a6f00e6328a",
            name: "Matemática",
            description: null,
            schoolYear: "8º ano EF",
            source: "local",
          },
        ]}
        reload={reload}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Abrir turma" }));
    expect(
      await screen.findByRole("button", { name: "Publicar no Classroom" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Publicar no Classroom" }),
    );

    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(fetchMock.mock.calls[1]![0]).toBe(
      "/api/classes/5d73ea1d-9ab8-4384-960e-3a6f00e6328a/google",
    );
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("professorId");
  });
});
