import type { FastifyBaseLogger } from "fastify";

import type { AuthRepository } from "../auth/repository.js";
import {
  BulletinEmailError,
  type TransactionalEmailSender,
} from "../bulletins/email.js";
import {
  ClassroomAnnouncementError,
  type ClassroomAnnouncementSender,
} from "./classroom.js";
import type {
  NotificationDeliveryLease,
  NotificationRepository,
} from "./repository.js";

export type NotificationCycleSummary = {
  status: "busy" | "completed" | "failed";
  delivered: number;
  failed: number;
  // Entregas devolvidas à fila porque o canal está desativado (ex.: e-mail sem provedor).
  skipped: number;
};

const EMAIL_PROVIDER_NOT_CONFIGURED = "EMAIL_PROVIDER_NOT_CONFIGURED";

export function notificationCycleFailure(
  summary: NotificationCycleSummary,
): string | null {
  if (summary.status === "failed") return "O ciclo de notificações falhou.";
  if (summary.failed > 0 && summary.delivered === 0)
    return `Todas as ${summary.failed} entregas de notificação falharam.`;
  return null;
}

export class NotificationDeliveryWorker {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly repository: NotificationRepository,
    private readonly authRepository: AuthRepository,
    private readonly email: TransactionalEmailSender,
    private readonly classroom: ClassroomAnnouncementSender,
    private readonly options: {
      intervalMs: number;
      maxAttempts: number;
      leaseSeconds: number;
      retryBaseSeconds: number;
      maxAgeDays: number;
    },
    private readonly logger: FastifyBaseLogger,
  ) {}

  start(): void {
    if (this.timer) return;
    void this.runCycle();
    this.timer = setInterval(
      () => void this.runCycle(),
      this.options.intervalMs,
    );
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async runCycle(): Promise<NotificationCycleSummary> {
    const summary: NotificationCycleSummary = {
      status: "busy",
      delivered: 0,
      failed: 0,
      skipped: 0,
    };
    if (this.running) return summary;
    this.running = true;
    const disabledChannels: NotificationDeliveryLease["channel"][] = [];
    try {
      const expired = await this.repository.expireStale(
        this.options.maxAgeDays,
        this.options.maxAttempts,
      );
      if (expired > 0)
        this.logger.warn(
          { expired, maxAgeDays: this.options.maxAgeDays },
          "stale notifications discarded as expired",
        );
      await this.repository.prepareDeliveries();
      for (let processed = 0; processed < 100; processed += 1) {
        const lease = await this.repository.claimNext(
          this.options.maxAttempts,
          this.options.leaseSeconds,
          disabledChannels,
        );
        if (!lease) break;
        const outcome = await this.deliver(lease);
        summary[outcome] += 1;
        if (outcome === "skipped") disabledChannels.push(lease.channel);
      }
      summary.status = "completed";
    } catch (error) {
      summary.status = "failed";
      this.logger.error({ err: error }, "notification delivery cycle failed");
    } finally {
      this.running = false;
    }
    return summary;
  }

  private async deliver(
    lease: NotificationDeliveryLease,
  ): Promise<"delivered" | "failed" | "skipped"> {
    try {
      const externalMessageId =
        lease.channel === "email"
          ? await this.deliverEmail(lease)
          : await this.deliverClassroom(lease);
      await this.repository.complete(
        lease.deliveryId,
        lease.notificationId,
        lease.revision,
        externalMessageId,
      );
      return "delivered";
    } catch (error) {
      const errorCode = normalizeDeliveryError(error);
      if (
        lease.channel === "email" &&
        errorCode === EMAIL_PROVIDER_NOT_CONFIGURED
      ) {
        await this.repository.skip(
          lease.deliveryId,
          lease.notificationId,
          lease.revision,
          errorCode,
        );
        this.logger.warn(
          { notificationId: lease.notificationId, errorCode },
          "email channel disabled; delivery kept in queue",
        );
        return "skipped";
      }
      const terminal = lease.attemptCount >= this.options.maxAttempts;
      const retrySeconds = Math.min(
        this.options.retryBaseSeconds * 2 ** (lease.attemptCount - 1),
        3_600,
      );
      await this.repository.fail(
        lease.deliveryId,
        lease.notificationId,
        lease.revision,
        errorCode,
        retrySeconds,
        terminal,
      );
      if (terminal && lease.channel === "google_classroom")
        await this.repository.fallbackToEmail(
          lease.notificationId,
          lease.revision,
          errorCode,
        );
      this.logger.warn(
        {
          notificationId: lease.notificationId,
          deliveryId: lease.deliveryId,
          errorCode,
          terminal,
        },
        "notification delivery failed",
      );
      return "failed";
    }
  }

  private async deliverEmail(lease: NotificationDeliveryLease): Promise<null> {
    if (!lease.recipientEmail)
      throw new Error("NOTIFICATION_RECIPIENT_MISSING");
    await this.email.send({
      to: lease.recipientEmail,
      subject: lease.title,
      text: notificationText(lease),
      idempotencyKey: `feedback/${lease.deliveryId}`,
    });
    return null;
  }

  private async deliverClassroom(
    lease: NotificationDeliveryLease,
  ): Promise<string> {
    if (!lease.googleClassroomId)
      throw new Error("NOTIFICATION_RECIPIENT_MISSING");
    const credential = await this.authRepository.getCredential(
      lease.professorId,
    );
    if (!credential) throw new Error("GOOGLE_CREDENTIAL_MISSING");
    const result = await this.classroom.ensureAnnouncement(credential, {
      deliveryId: lease.deliveryId,
      courseId: lease.googleClassroomId,
      title: lease.title,
      content: lease.content,
      links: [
        ...lease.links,
        ...lease.materialLinks.map((item) => ({
          label: item.title,
          url: item.url,
        })),
      ],
    });
    await this.authRepository.saveCredential(
      lease.professorId,
      result.credential,
    );
    return result.announcementId;
  }
}

function notificationText(lease: NotificationDeliveryLease): string {
  const resources = [
    ...lease.links,
    ...lease.materialLinks.map((item) => ({
      label: item.title,
      url: item.url,
    })),
  ];
  return [
    lease.content,
    resources.length > 0 ? "Recursos:" : null,
    ...resources.map((item) => `- ${item.label}: ${item.url}`),
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n\n");
}

function normalizeDeliveryError(error: unknown): string {
  if (error instanceof BulletinEmailError) return error.code;
  if (error instanceof ClassroomAnnouncementError) return error.code;
  if (error instanceof Error && /^[A-Z0-9_]+$/.test(error.message))
    return error.message;
  return "NOTIFICATION_DELIVERY_FAILED";
}
