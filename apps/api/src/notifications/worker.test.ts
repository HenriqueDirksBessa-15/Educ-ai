import { describe, expect, it, vi } from "vitest";

import type { AuthRepository } from "../auth/repository.js";
import {
  BulletinEmailError,
  type TransactionalEmailSender,
} from "../bulletins/email.js";
import type { ClassroomAnnouncementSender } from "./classroom.js";
import type {
  NotificationDeliveryLease,
  NotificationRepository,
} from "./repository.js";
import {
  NotificationDeliveryWorker,
  notificationCycleFailure,
} from "./worker.js";

const baseLease: NotificationDeliveryLease = {
  deliveryId: "delivery-1",
  notificationId: "notification-1",
  revision: 1,
  attemptCount: 1,
  professorId: "professor-1",
  feedbackId: "feedback-1",
  channel: "email",
  recipientEmail: "aluno@example.test",
  googleClassroomId: null,
  title: "Retorno",
  content: "Revise a justificativa.",
  links: [{ label: "Apoio", url: "https://example.test/apoio" }],
  materialLinks: [],
};

function build(lease: NotificationDeliveryLease) {
  const repository = {
    prepareDeliveries: vi.fn(),
    claimNext: vi.fn().mockResolvedValueOnce(lease).mockResolvedValueOnce(null),
    complete: vi.fn(),
    fail: vi.fn(),
    skip: vi.fn(),
    fallbackToEmail: vi.fn(),
  };
  const authRepository = {
    getCredential: vi
      .fn()
      .mockResolvedValue({ accessToken: "token", scopes: [] }),
    saveCredential: vi.fn(),
  };
  const email = { isFixture: false, send: vi.fn() };
  const classroom = {
    isFixture: false,
    ensureAnnouncement: vi.fn().mockResolvedValue({
      announcementId: "announcement-1",
      credential: { accessToken: "renewed" },
    }),
  };
  const logger = { error: vi.fn(), warn: vi.fn() };
  const worker = new NotificationDeliveryWorker(
    repository as unknown as NotificationRepository,
    authRepository as unknown as AuthRepository,
    email as TransactionalEmailSender,
    classroom as ClassroomAnnouncementSender,
    {
      intervalMs: 30_000,
      maxAttempts: 5,
      leaseSeconds: 300,
      retryBaseSeconds: 60,
    },
    logger as never,
  );
  return { worker, repository, authRepository, email, classroom, logger };
}

describe("notification delivery worker", () => {
  it("delivers individual feedback by idempotent email", async () => {
    const { worker, repository, email, classroom } = build(baseLease);

    await worker.runCycle();

    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "aluno@example.test",
        idempotencyKey: "feedback/delivery-1",
        text: expect.stringContaining("https://example.test/apoio"),
      }),
    );
    expect(classroom.ensureAnnouncement).not.toHaveBeenCalled();
    expect(repository.complete).toHaveBeenCalledWith(
      "delivery-1",
      "notification-1",
      1,
      null,
    );
  });

  it("publishes only a global delivery as a Classroom announcement", async () => {
    const lease = {
      ...baseLease,
      channel: "google_classroom" as const,
      recipientEmail: null,
      googleClassroomId: "course-1",
    };
    const { worker, repository, authRepository, email, classroom } =
      build(lease);

    await worker.runCycle();

    expect(email.send).not.toHaveBeenCalled();
    expect(classroom.ensureAnnouncement).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "token" }),
      expect.objectContaining({ courseId: "course-1" }),
    );
    expect(authRepository.saveCredential).toHaveBeenCalledWith("professor-1", {
      accessToken: "renewed",
    });
    expect(repository.complete).toHaveBeenCalledWith(
      "delivery-1",
      "notification-1",
      1,
      "announcement-1",
    );
  });

  it("records exponential retry without losing the outbox item", async () => {
    const lease = { ...baseLease, attemptCount: 3 };
    const { worker, repository, email, logger } = build(lease);
    email.send.mockRejectedValue(new Error("temporary failure"));

    await worker.runCycle();

    expect(repository.fail).toHaveBeenCalledWith(
      "delivery-1",
      "notification-1",
      1,
      "NOTIFICATION_DELIVERY_FAILED",
      240,
      false,
    );
    expect(logger.warn).toHaveBeenCalled();
  });

  it("falls back to class email deliveries after terminal Classroom failure", async () => {
    const lease = {
      ...baseLease,
      attemptCount: 5,
      channel: "google_classroom" as const,
      recipientEmail: null,
      googleClassroomId: "course-1",
    };
    const { worker, repository, classroom } = build(lease);
    classroom.ensureAnnouncement.mockRejectedValue(
      new Error("GOOGLE_SERVICE_UNAVAILABLE"),
    );

    await worker.runCycle();

    expect(repository.fail).toHaveBeenCalledWith(
      "delivery-1",
      "notification-1",
      1,
      "GOOGLE_SERVICE_UNAVAILABLE",
      960,
      true,
    );
    expect(repository.fallbackToEmail).toHaveBeenCalledWith(
      "notification-1",
      1,
      "GOOGLE_SERVICE_UNAVAILABLE",
    );
  });

  it("summarizes delivered and failed items in the cycle", async () => {
    const delivered = build(baseLease);
    await expect(delivered.worker.runCycle()).resolves.toEqual({
      status: "completed",
      delivered: 1,
      failed: 0,
      skipped: 0,
    });

    const failing = build(baseLease);
    failing.email.send.mockRejectedValue(new Error("EMAIL_UNAVAILABLE"));
    await expect(failing.worker.runCycle()).resolves.toEqual({
      status: "completed",
      delivered: 0,
      failed: 1,
      skipped: 0,
    });
  });

  it("keeps email deliveries queued while no email provider is configured", async () => {
    const classroomLease = {
      ...baseLease,
      deliveryId: "delivery-2",
      channel: "google_classroom" as const,
      recipientEmail: null,
      googleClassroomId: "course-1",
    };
    const { worker, repository, email, logger } = build(baseLease);
    repository.claimNext
      .mockReset()
      .mockResolvedValueOnce(baseLease)
      .mockResolvedValueOnce(classroomLease)
      .mockResolvedValueOnce(null);
    email.send.mockRejectedValue(
      new BulletinEmailError("EMAIL_PROVIDER_NOT_CONFIGURED"),
    );

    const summary = await worker.runCycle();

    expect(summary).toEqual({
      status: "completed",
      delivered: 1,
      failed: 0,
      skipped: 1,
    });
    expect(notificationCycleFailure(summary)).toBeNull();
    expect(repository.skip).toHaveBeenCalledWith(
      "delivery-1",
      "notification-1",
      1,
      "EMAIL_PROVIDER_NOT_CONFIGURED",
    );
    expect(repository.fail).not.toHaveBeenCalled();
    expect(repository.claimNext).toHaveBeenLastCalledWith(5, 300, ["email"]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "EMAIL_PROVIDER_NOT_CONFIGURED" }),
      "email channel disabled; delivery kept in queue",
    );
  });

  it("reports a broken cycle instead of hiding it", async () => {
    const { worker, repository, logger } = build(baseLease);
    repository.prepareDeliveries.mockRejectedValue(
      new Error("column is of type notification_channel"),
    );

    await expect(worker.runCycle()).resolves.toMatchObject({
      status: "failed",
    });
    expect(logger.error).toHaveBeenCalled();
  });

  it("fails the job only when the cycle breaks or every delivery fails", () => {
    const base = { delivered: 0, failed: 0, skipped: 0 };
    expect(notificationCycleFailure({ ...base, status: "failed" })).toBe(
      "O ciclo de notificações falhou.",
    );
    expect(
      notificationCycleFailure({ ...base, status: "completed", failed: 3 }),
    ).toBe("Todas as 3 entregas de notificação falharam.");
    expect(
      notificationCycleFailure({
        ...base,
        status: "completed",
        delivered: 1,
        failed: 2,
      }),
    ).toBeNull();
    expect(
      notificationCycleFailure({ ...base, status: "completed", skipped: 4 }),
    ).toBeNull();
    expect(notificationCycleFailure({ ...base, status: "busy" })).toBeNull();
  });
});
