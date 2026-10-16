import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActivitiesPanel } from "./ActivitiesPanel.js";
import { ConfirmProvider } from "./ConfirmDialog.js";

afterEach(() => vi.unstubAllGlobals());

const activity = {
  id: "71111111-1111-4111-8111-111111111111",
  professorId: "61111111-1111-4111-8111-111111111111",
  lessonPlanId: "51111111-1111-4111-8111-111111111111",
  lessonPlanTitle: "Frações na pizza",
  title: "Frações – exercício 1",
  description: "Exercício sobre frações.",
  type: "objective" as const,
  difficulty: "medium" as const,
  dueAt: "2026-10-18T23:59:00.000Z",
  latePolicy: { mode: "blocked" as const },
  status: "draft" as const,
  questions: [],
  totalPoints: 0,
  responseCount: 0,
  publishedAt: null,
  finishedAt: null,
  archivedAt: null,
  createdAt: "2026-10-15T10:00:00.000Z",
  updatedAt: "2026-10-15T10:00:00.000Z",
};

function setup() {
  const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith(`/activities/${activity.id}/publish`))
      return Response.json({
        data: {
          activityId: activity.id,
          status: "published",
          googleFormId: "form",
          responderUri: null,
          errorCode: null,
          attemptCount: 1,
          collectionScheduledAt: null,
          lastSyncedAt: null,
          distributions: [],
        },
      });
    if (url.includes("/activities") && !options?.method)
      return Response.json({ data: [activity] });
    throw new Error(`unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(
    <ConfirmProvider>
      <ActivitiesPanel plans={[]} />
    </ConfirmProvider>,
  );
  return fetchMock;
}

const publishCalls = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/publish"));

describe("activity publication", () => {
  it("does not publish when the teacher cancels the confirmation", async () => {
    const fetchMock = setup();
    fireEvent.click(await screen.findByRole("button", { name: /Publicar/ }));

    expect(
      screen.getByRole("alertdialog", { name: "Enviar para a turma?" }),
    ).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    });
    expect(publishCalls(fetchMock)).toHaveLength(0);
  });

  it("publishes only after an explicit confirmation", async () => {
    const fetchMock = setup();
    fireEvent.click(await screen.findByRole("button", { name: /Publicar/ }));
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Enviar para a turma" }),
      );
    });

    await waitFor(() => expect(publishCalls(fetchMock)).toHaveLength(1));
  });
});
