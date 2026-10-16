import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LessonPlansPanel } from "./App";

afterEach(() => vi.unstubAllGlobals());

const group = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "8º A",
  description: null,
  schoolYear: "8º ano EF",
  source: "local" as const,
};

describe("complete lesson plan flow", () => {
  it("uses class curriculum, BNCC and materials in the manual draft", async () => {
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith(`/classes/${group.id}`))
        return Response.json({
          data: {
            ...group,
            generalNotice: null,
            syncStatus: "never",
            lastSyncedAt: null,
            students: [],
            curriculum: {
              educationStage: "elementary_2",
              schoolYear: "8º ano EF",
              curricularComponents: ["Matemática"],
            },
          },
        });
      if (url.includes("/curriculum?"))
        return Response.json({
          data: [
            {
              id: "21111111-1111-4111-8111-111111111111",
              areaName: "Matemática",
              curricularComponent: "Matemática",
              schoolYear: "8º ano EF",
              description: "Números e operações.",
              sourceLabel: "BNCC",
              isFixture: false,
              skills: [
                {
                  id: "31111111-1111-4111-8111-111111111111",
                  code: "EF08MA01",
                  thematicUnit: "Números",
                  knowledgeObject: "Frações",
                  description: "Resolver problemas com frações.",
                  sourceLabel: "BNCC",
                  isOfficial: true,
                  isFixture: false,
                },
              ],
            },
          ],
          reviewRequired: false,
          reason: null,
        });
      if (url.endsWith("/lesson-plans") && options?.method === "POST")
        return Response.json({ data: { id: "plan-id" } }, { status: 201 });
      throw new Error(`unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const reload = vi.fn().mockResolvedValue(undefined);
    render(
      <LessonPlansPanel
        plans={[]}
        classes={[group]}
        materials={[
          {
            id: "41111111-1111-4111-8111-111111111111",
            title: "Guia de frações",
            description: null,
            category: "reading",
            classIds: [group.id],
            bnccSkillIds: [],
            url: "https://example.invalid/guia",
            fileName: null,
            mimeType: null,
            sizeBytes: null,
            classNames: [group.name],
            isArchived: false,
            hasPublishedContent: false,
            createdAt: "2026-10-15T10:00:00.000Z",
          },
        ]}
        reload={reload}
      />,
    );

    expect(
      await screen.findByRole("option", { name: "Matemática" }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/EF08MA01/)).toBeInTheDocument();
    for (const [label, value] of [
      ["Título do plano", "Frações na prática"],
      ["Objetivos", "Resolver problemas com frações."],
      ["Conteúdos", "Frações equivalentes."],
      ["Metodologia/etapas", "Investigação em grupos."],
      ["Estratégia de avaliação", "Registro e discussão."],
      ["Referências opcionais", "BNCC."],
    ] as const)
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.change(screen.getByLabelText("Duração (minutos)"), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByLabelText(/EF08MA01/));
    fireEvent.click(screen.getByLabelText("Guia de frações"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));

    await waitFor(() => expect(reload).toHaveBeenCalled());
    const createCall = fetchMock.mock.calls.find(
      ([url, options]) =>
        String(url).endsWith("/lesson-plans") && options?.method === "POST",
    )!;
    expect(JSON.parse(createCall[1]!.body as string)).toMatchObject({
      curricularComponent: "Matemática",
      schoolYear: "8º ano EF",
      durationMinutes: 100,
      classIds: [group.id],
      syllabusId: "21111111-1111-4111-8111-111111111111",
      bnccSkillIds: ["31111111-1111-4111-8111-111111111111"],
      materialIds: ["41111111-1111-4111-8111-111111111111"],
    });
  });

  it("requires an explicit teacher action to approve a manual draft", async () => {
    const plan = {
      id: "51111111-1111-4111-8111-111111111111",
      professorId: "61111111-1111-4111-8111-111111111111",
      title: "Plano manual",
      curricularComponent: "Matemática",
      schoolYear: "8º ano EF",
      objectives: "Resolver problemas.",
      contents: "Frações.",
      methodology: "Investigação.",
      evaluationStrategy: "Discussão.",
      durationMinutes: 50,
      references: null,
      classIds: [group.id],
      syllabusId: null,
      bnccSkillIds: [],
      materialIds: [],
      classNames: [group.name],
      syllabusDescription: null,
      bnccCodes: [],
      materialTitles: [],
      isArchived: false,
      isLocked: false,
      status: "draft" as const,
      reviewedAt: null,
      approvedAt: null,
      latestGeneration: null,
      createdAt: "2026-10-15T10:00:00.000Z",
      updatedAt: "2026-10-15T10:00:00.000Z",
    };
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith(`/lesson-plans/${plan.id}/approve`) &&
        options?.method === "POST"
      )
        return Response.json({ data: { status: "approved" } });
      throw new Error(`unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const reload = vi.fn().mockResolvedValue(undefined);
    render(
      <LessonPlansPanel
        plans={[plan]}
        classes={[]}
        materials={[]}
        reload={reload}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Aprovar plano" }));

    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/lesson-plans/${plan.id}/approve`,
      { method: "POST", credentials: "include" },
    );
  });

  it("lists every plan with a translated status", () => {
    vi.stubGlobal("fetch", vi.fn());
    const plans = Array.from({ length: 6 }, (_, index) => ({
      ...draftPlan,
      id: `5111111${index}-1111-4111-8111-111111111111`,
      title: `Plano ${index + 1}`,
    }));
    render(
      <LessonPlansPanel
        plans={plans}
        classes={[]}
        materials={[]}
        reload={vi.fn()}
      />,
    );

    expect(screen.getByText("Plano 6")).toBeInTheDocument();
    expect(screen.getAllByText("Rascunho")).toHaveLength(6);
    expect(screen.queryByText(/draft/)).not.toBeInTheDocument();
  });
});

const draftPlan = {
  id: "51111111-1111-4111-8111-111111111111",
  professorId: "61111111-1111-4111-8111-111111111111",
  title: "Plano manual",
  curricularComponent: "Matemática",
  schoolYear: "8º ano EF",
  objectives: "Resolver problemas.",
  contents: "Frações.",
  methodology: "Investigação.",
  evaluationStrategy: "Discussão.",
  durationMinutes: 50,
  references: null,
  classIds: [group.id],
  syllabusId: null,
  bnccSkillIds: [],
  materialIds: [],
  classNames: [group.name],
  syllabusDescription: null,
  bnccCodes: [],
  materialTitles: [],
  isArchived: false,
  isLocked: false,
  status: "draft" as const,
  reviewedAt: null,
  approvedAt: null,
  latestGeneration: null,
  createdAt: "2026-10-15T10:00:00.000Z",
  updatedAt: "2026-10-15T10:00:00.000Z",
};
