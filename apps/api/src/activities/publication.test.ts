import type { Activity, ActivityPublication } from "@educai/contracts";
import { describe, expect, it, vi } from "vitest";

import type { AuthRepository } from "../auth/repository.js";
import type { GoogleActivityPublisher } from "./google-publisher.js";
import { ActivityPublicationService } from "./publication.js";
import type { ActivitiesRepository } from "./repository.js";

const activity = {
  id: "11111111-1111-4111-8111-111111111111",
  professorId: "21111111-1111-4111-8111-111111111111",
  lessonPlanId: "31111111-1111-4111-8111-111111111111",
  lessonPlanTitle: "Frações",
  title: "Atividade de frações",
  description: "Resolva.",
  type: "objective",
  difficulty: "medium",
  dueAt: "2026-10-20T18:00:00.000Z",
  latePolicy: { mode: "blocked" },
  status: "draft",
  questions: [
    {
      id: "41111111-1111-4111-8111-111111111111",
      position: 0,
      kind: "objective",
      prompt: "Qual representa metade?",
      points: 1,
      alternatives: ["1/2", "1/3"],
      correctAlternativeIndex: 0,
    },
  ],
  totalPoints: 1,
  responseCount: 0,
  publishedAt: null,
  finishedAt: null,
  archivedAt: null,
  createdAt: "2026-10-09T10:00:00.000Z",
  updatedAt: "2026-10-09T10:00:00.000Z",
} satisfies Activity;

function publication(
  overrides: Partial<ActivityPublication> = {},
): ActivityPublication {
  return {
    activityId: activity.id,
    status: "pending",
    googleFormId: null,
    responderUri: null,
    errorCode: null,
    attemptCount: 0,
    collectionScheduledAt: null,
    lastSyncedAt: null,
    distributions: [
      {
        classId: "51111111-1111-4111-8111-111111111111",
        className: "5º ano",
        googleClassroomId: "course-1",
        googleCourseWorkId: null,
        alternateLink: null,
        status: "pending",
        errorCode: null,
        attemptCount: 0,
      },
    ],
    ...overrides,
  };
}

describe("activity publication service", () => {
  it("creates external resources once and completes the local publication", async () => {
    const publications = [
      publication(),
      publication({
        status: "distributing",
        googleFormId: "form-1",
        responderUri: "https://forms.test/form-1",
      }),
      publication({
        status: "published",
        googleFormId: "form-1",
        responderUri: "https://forms.test/form-1",
        collectionScheduledAt: activity.dueAt,
      }),
    ];
    const activities = {
      get: vi.fn().mockResolvedValue(activity),
      preparePublication: vi.fn().mockResolvedValue("ready"),
      getPublication: vi
        .fn()
        .mockImplementation(async () => publications.shift()),
      markPublicationAttempt: vi.fn().mockResolvedValue(true),
      savePublishedForm: vi.fn(),
      saveDistribution: vi.fn(),
      markDistributionFailure: vi.fn(),
      markPublicationFailure: vi.fn(),
      completeExternalPublication: vi.fn().mockResolvedValue(true),
      classroomAssignees: vi.fn().mockResolvedValue(["google-active-1"]),
    };
    const auth = {
      getCredential: vi.fn().mockResolvedValue({
        accessToken: "token",
        scopes: [],
      }),
      saveCredential: vi.fn(),
    };
    const google = {
      isFixture: true,
      ensureForm: vi.fn().mockResolvedValue({
        formId: "form-1",
        responderUri: "https://forms.test/form-1",
        credential: {},
        questions: [
          {
            questionId: activity.questions[0].id,
            googleItemId: "item-1",
            googleQuestionId: "question-1",
            questionPosition: 0,
          },
        ],
      }),
      ensureCourseWork: vi.fn().mockResolvedValue({
        courseWorkId: "work-1",
        alternateLink: "https://classroom.test/work-1",
        credential: {},
      }),
      getForm: vi.fn(),
    } satisfies GoogleActivityPublisher;
    const service = new ActivityPublicationService(
      activities as unknown as ActivitiesRepository,
      auth as unknown as AuthRepository,
      google,
    );

    const result = await service.publish(activity.professorId, activity.id);

    expect(result).toMatchObject({
      status: "publication",
      publication: { status: "published" },
    });
    expect(google.ensureForm).toHaveBeenCalledTimes(1);
    expect(google.ensureCourseWork).toHaveBeenCalledTimes(1);
    // Turma com aluno restrito: a atividade vai só para os ativos.
    expect(google.ensureCourseWork).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ studentIds: ["google-active-1"] }),
    );
    expect(activities.savePublishedForm).toHaveBeenCalledWith(
      activity.professorId,
      activity.id,
      "form-1",
      "https://forms.test/form-1",
      [expect.objectContaining({ googleQuestionId: "question-1" })],
    );
    expect(activities.completeExternalPublication).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate remote resources while another publication owns the lease", async () => {
    const activities = {
      get: vi.fn().mockResolvedValue(activity),
      preparePublication: vi.fn().mockResolvedValue("ready"),
      getPublication: vi
        .fn()
        .mockResolvedValueOnce(publication())
        .mockResolvedValueOnce(publication({ status: "creating_form" })),
      markPublicationAttempt: vi.fn().mockResolvedValue(false),
      markPublicationFailure: vi.fn(),
    };
    const auth = {
      getCredential: vi.fn().mockResolvedValue({
        accessToken: "token",
        scopes: [],
      }),
    };
    const google = {
      isFixture: true,
      ensureForm: vi.fn(),
      ensureCourseWork: vi.fn(),
      getForm: vi.fn(),
    } satisfies GoogleActivityPublisher;
    const service = new ActivityPublicationService(
      activities as unknown as ActivitiesRepository,
      auth as unknown as AuthRepository,
      google,
    );

    const result = await service.publish(activity.professorId, activity.id);

    expect(result).toMatchObject({
      status: "publication",
      publication: { status: "creating_form" },
    });
    expect(google.ensureForm).not.toHaveBeenCalled();
    expect(google.ensureCourseWork).not.toHaveBeenCalled();
  });
});
