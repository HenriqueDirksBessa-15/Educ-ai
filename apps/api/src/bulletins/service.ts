import { createHash } from "node:crypto";

import type { BulletinCreate } from "@educai/contracts";

import { calculateBulletinAverage } from "./average.js";
import { BulletinEmailError, type BulletinEmailSender } from "./email.js";
import { generateBulletinPdf, type BulletinPdfSnapshot } from "./pdf.js";
import type { BulletinsRepository } from "./repository.js";

export class BulletinService {
  constructor(
    private readonly repository: BulletinsRepository,
    private readonly email: BulletinEmailSender,
  ) {}

  async generate(
    professorId: string,
    input: BulletinCreate,
  ): Promise<string[]> {
    const prepared: Array<{
      studentId: string;
      snapshot: BulletinPdfSnapshot;
    }> = [];
    const generatedAt = new Date().toISOString();
    for (const studentId of input.studentIds) {
      const data = await this.repository.getStudentData(
        professorId,
        input.classId,
        studentId,
        input.periodStart,
        input.periodEnd,
      );
      if (!data) throw new Error("BULLETIN_TARGET_NOT_FOUND");
      const average = calculateBulletinAverage(
        data.activities.map((activity) => activity.grade),
      );
      if (
        input.onlyBelowAverage &&
        average >= (input.averageThreshold as number)
      )
        continue;
      prepared.push({
        studentId,
        snapshot: {
          title: input.title,
          professorName: data.professorName,
          className: data.className,
          studentName: data.studentName,
          studentEmail: data.studentEmail,
          periodType: input.periodType,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          average,
          teacherComment: input.teacherComment ?? null,
          activities: data.activities,
          feedbacks: data.feedbacks,
          generatedAt,
        },
      });
    }
    if (prepared.length === 0) throw new Error("BULLETIN_FILTER_EMPTY");
    const ids: string[] = [];
    for (const item of prepared) {
      const pdf = await generateBulletinPdf(item.snapshot);
      const checksum = createHash("sha256").update(pdf).digest("hex");
      ids.push(
        await this.repository.saveForStudent(
          professorId,
          input.classId,
          item.studentId,
          input,
          item.snapshot,
          pdf,
          checksum,
        ),
      );
    }
    return ids;
  }

  async send(
    professorId: string,
    bulletinId: string,
  ): Promise<
    | { status: "sent" }
    | { status: "not_found" | "busy" }
    | { status: "failed"; errorCode: string }
  > {
    const lease = await this.repository.startDelivery(professorId, bulletinId);
    if (typeof lease === "string") return { status: lease };
    try {
      await this.email.send({
        to: lease.recipientEmail,
        subject: lease.title,
        text: `Olá, ${lease.studentName}. Seu boletim está anexado.`,
        fileName: `${safeFileName(lease.title)}.pdf`,
        pdf: lease.pdf,
      });
      await this.repository.completeDelivery(
        professorId,
        bulletinId,
        lease.deliveryId,
      );
      return { status: "sent" };
    } catch (error) {
      const errorCode =
        error instanceof BulletinEmailError
          ? error.code
          : "EMAIL_DELIVERY_FAILED";
      await this.repository.failDelivery(
        professorId,
        bulletinId,
        lease.deliveryId,
        errorCode,
      );
      return { status: "failed", errorCode };
    }
  }
}

function safeFileName(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "boletim"
  );
}
