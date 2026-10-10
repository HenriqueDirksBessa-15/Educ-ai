import type {
  Bulletin,
  BulletinActivitySnapshot,
  BulletinCreate,
  BulletinFeedbackSnapshot,
  EligibleBulletinStudent,
} from "@educai/contracts";

import type { DatabaseClient } from "../database.js";
import type { BulletinPdfSnapshot } from "./pdf.js";

type QueryResult<Row> = { rows: Row[]; rowCount?: number | null };

export type BulletinStudentData = {
  professorName: string;
  className: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  activities: BulletinActivitySnapshot[];
  feedbacks: BulletinFeedbackSnapshot[];
};

export type BulletinDeliveryLease = {
  deliveryId: string;
  recipientEmail: string;
  studentName: string;
  title: string;
  pdf: Uint8Array;
};

export class BulletinsRepository {
  constructor(private readonly database: DatabaseClient) {}

  async eligibleStudents(
    professorId: string,
  ): Promise<EligibleBulletinStudent[]> {
    const result = (await this.database.query(
      `SELECT DISTINCT student.id, student.name, student.email::text,
              class_group.id AS class_id, class_group.name AS class_name
       FROM class_group
       JOIN enrollment ON enrollment.class_group_id = class_group.id
         AND enrollment.status = 'active'
       JOIN student ON student.id = enrollment.student_id
       WHERE class_group.professor_id = $1
       ORDER BY class_group.name, student.name`,
      [professorId],
    )) as QueryResult<{
      id: string;
      name: string;
      email: string;
      class_id: string;
      class_name: string;
    }>;
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      classId: row.class_id,
      className: row.class_name,
    }));
  }

  async getStudentData(
    professorId: string,
    classId: string,
    studentId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<BulletinStudentData | null> {
    const identity = (await this.database.query(
      `SELECT professor.display_name AS professor_name,
              class_group.name AS class_name, student.id AS student_id,
              student.name AS student_name, student.email::text AS student_email
       FROM class_group
       JOIN professor ON professor.id = class_group.professor_id
       JOIN enrollment ON enrollment.class_group_id = class_group.id
         AND enrollment.student_id = $3 AND enrollment.status = 'active'
       JOIN student ON student.id = enrollment.student_id
       WHERE class_group.id = $2 AND class_group.professor_id = $1`,
      [professorId, classId, studentId],
    )) as QueryResult<{
      professor_name: string;
      class_name: string;
      student_id: string;
      student_name: string;
      student_email: string;
    }>;
    const owner = identity.rows[0];
    if (!owner) return null;
    const activities = (await this.database.query(
      `SELECT DISTINCT activity.id AS activity_id, activity.title,
              activity.due_at, submission.grade
       FROM activity_submission submission
       JOIN activity ON activity.id = submission.activity_id
         AND activity.professor_id = $1
       JOIN activity_classroom_distribution destination
         ON destination.activity_id = activity.id AND destination.class_group_id = $2
       WHERE submission.student_id = $3
         AND submission.correction_status IN ('approved', 'released')
         AND submission.grade IS NOT NULL
         AND activity.due_at::date BETWEEN $4::date AND $5::date
       ORDER BY activity.due_at, activity.title`,
      [professorId, classId, studentId, periodStart, periodEnd],
    )) as QueryResult<{
      activity_id: string;
      title: string;
      due_at: Date;
      grade: string | number;
    }>;
    const feedbacks = (await this.database.query(
      `SELECT feedback.id AS feedback_id, feedback.title, feedback.content,
              feedback.sent_at
       FROM feedback
       WHERE feedback.professor_id = $1 AND feedback.student_id = $2
         AND feedback.scope = 'individual' AND feedback.status = 'sent'
         AND feedback.sent_at::date BETWEEN $3::date AND $4::date
       ORDER BY feedback.sent_at`,
      [professorId, studentId, periodStart, periodEnd],
    )) as QueryResult<{
      feedback_id: string;
      title: string;
      content: string;
      sent_at: Date;
    }>;
    return {
      professorName: owner.professor_name,
      className: owner.class_name,
      studentId: owner.student_id,
      studentName: owner.student_name,
      studentEmail: owner.student_email,
      activities: activities.rows.map((row) => ({
        activityId: row.activity_id,
        title: row.title,
        dueAt: row.due_at.toISOString(),
        grade: Number(row.grade),
      })),
      feedbacks: feedbacks.rows.map((row) => ({
        feedbackId: row.feedback_id,
        title: row.title,
        content: row.content,
        sentAt: row.sent_at.toISOString(),
      })),
    };
  }

  async saveForStudent(
    professorId: string,
    classId: string,
    studentId: string,
    input: BulletinCreate,
    snapshot: BulletinPdfSnapshot,
    pdf: Uint8Array,
    checksum: string,
  ): Promise<string> {
    const result = (await this.database.query(
      `INSERT INTO bulletin
         (professor_id, class_group_id, student_id, period_type,
          period_start, period_end, title, teacher_comment, average,
          snapshot, pdf_data, pdf_sha256)
       SELECT $1, class_group.id, $3, $4, $5, $6, $7, $8, $9,
              $10::jsonb, $11, $12
       FROM class_group
       JOIN enrollment ON enrollment.class_group_id = class_group.id
         AND enrollment.student_id = $3 AND enrollment.status = 'active'
       WHERE class_group.id = $2 AND class_group.professor_id = $1
       RETURNING id`,
      [
        professorId,
        classId,
        studentId,
        input.periodType,
        input.periodStart,
        input.periodEnd,
        input.title,
        input.teacherComment ?? null,
        snapshot.average,
        JSON.stringify(snapshot),
        Buffer.from(pdf),
        checksum,
      ],
    )) as QueryResult<{ id: string }>;
    if (!result.rows[0]) throw new Error("BULLETIN_TARGET_NOT_FOUND");
    return result.rows[0].id;
  }

  async list(professorId: string): Promise<Bulletin[]> {
    const result = (await this.database.query(this.bulletinQuery(), [
      professorId,
    ])) as QueryResult<Record<string, unknown>>;
    return result.rows.map(toBulletin);
  }

  async getPdf(
    professorId: string,
    bulletinId: string,
  ): Promise<{ title: string; data: Uint8Array } | null> {
    const result = (await this.database.query(
      `SELECT title, pdf_data FROM bulletin WHERE id = $1 AND professor_id = $2`,
      [bulletinId, professorId],
    )) as QueryResult<{ title: string; pdf_data: Buffer }>;
    const row = result.rows[0];
    return row
      ? { title: row.title, data: new Uint8Array(row.pdf_data) }
      : null;
  }

  async startDelivery(
    professorId: string,
    bulletinId: string,
  ): Promise<BulletinDeliveryLease | "not_found" | "busy"> {
    const result = (await this.database.query(
      `WITH owned AS (
         SELECT bulletin.id, bulletin.title, bulletin.pdf_data,
                student.email::text AS recipient_email, student.name AS student_name
         FROM bulletin JOIN student ON student.id = bulletin.student_id
         WHERE bulletin.id = $1 AND bulletin.professor_id = $2
           AND bulletin.status <> 'pending'
       ), next_attempt AS (
         SELECT coalesce(max(attempt_number), 0) + 1 AS value
         FROM bulletin_delivery WHERE bulletin_id = $1
       ), pending AS (
         UPDATE bulletin SET status = 'pending', last_error_code = NULL,
           sent_at = NULL FROM owned WHERE bulletin.id = owned.id
           AND bulletin.status <> 'pending'
         RETURNING bulletin.id
       ), delivery AS (
         INSERT INTO bulletin_delivery
           (bulletin_id, attempt_number, recipient_email)
         SELECT pending.id, next_attempt.value, owned.recipient_email
         FROM pending JOIN owned ON owned.id = pending.id CROSS JOIN next_attempt
         RETURNING id, bulletin_id
       )
       SELECT delivery.id AS delivery_id, owned.recipient_email,
              owned.student_name, owned.title, owned.pdf_data
       FROM delivery JOIN owned ON owned.id = delivery.bulletin_id`,
      [bulletinId, professorId],
    )) as QueryResult<{
      delivery_id: string;
      recipient_email: string;
      student_name: string;
      title: string;
      pdf_data: Buffer;
    }>;
    const row = result.rows[0];
    if (row)
      return {
        deliveryId: row.delivery_id,
        recipientEmail: row.recipient_email,
        studentName: row.student_name,
        title: row.title,
        pdf: new Uint8Array(row.pdf_data),
      };
    const state = (await this.database.query(
      `SELECT status FROM bulletin WHERE id = $1 AND professor_id = $2`,
      [bulletinId, professorId],
    )) as QueryResult<{ status: string }>;
    if (!state.rows[0]) return "not_found";
    return "busy";
  }

  async completeDelivery(
    professorId: string,
    bulletinId: string,
    deliveryId: string,
  ): Promise<void> {
    await this.database.query(
      `WITH completed AS (
         UPDATE bulletin_delivery delivery SET status = 'sent', completed_at = now()
         FROM bulletin WHERE delivery.id = $3 AND delivery.bulletin_id = bulletin.id
           AND bulletin.id = $1 AND bulletin.professor_id = $2
           AND delivery.status = 'pending' RETURNING delivery.bulletin_id
       )
       UPDATE bulletin SET status = 'sent', sent_at = now(), last_error_code = NULL
       FROM completed WHERE bulletin.id = completed.bulletin_id`,
      [bulletinId, professorId, deliveryId],
    );
  }

  async failDelivery(
    professorId: string,
    bulletinId: string,
    deliveryId: string,
    errorCode: string,
  ): Promise<void> {
    await this.database.query(
      `WITH failed AS (
         UPDATE bulletin_delivery delivery SET status = 'failed',
           error_code = $4, completed_at = now()
         FROM bulletin WHERE delivery.id = $3 AND delivery.bulletin_id = bulletin.id
           AND bulletin.id = $1 AND bulletin.professor_id = $2
           AND delivery.status = 'pending' RETURNING delivery.bulletin_id
       )
       UPDATE bulletin SET status = 'failed', sent_at = NULL, last_error_code = $4
       FROM failed WHERE bulletin.id = failed.bulletin_id`,
      [bulletinId, professorId, deliveryId, errorCode],
    );
  }

  private bulletinQuery(): string {
    return `SELECT bulletin.*, class_group.name AS class_name,
              student.name AS student_name, student.email::text AS student_email,
              coalesce((SELECT jsonb_agg(jsonb_build_object(
                'id', delivery.id, 'attemptNumber', delivery.attempt_number,
                'recipientEmail', delivery.recipient_email::text,
                'status', delivery.status, 'errorCode', delivery.error_code,
                'attemptedAt', delivery.attempted_at,
                'completedAt', delivery.completed_at)
                ORDER BY delivery.attempt_number)
                FROM bulletin_delivery delivery WHERE delivery.bulletin_id = bulletin.id),
                '[]'::jsonb) AS deliveries
       FROM bulletin
       JOIN class_group ON class_group.id = bulletin.class_group_id
       JOIN student ON student.id = bulletin.student_id
       WHERE bulletin.professor_id = $1 ORDER BY bulletin.generated_at DESC`;
  }
}

function toBulletin(row: Record<string, unknown>): Bulletin {
  const snapshot = row.snapshot as BulletinPdfSnapshot;
  return {
    id: String(row.id),
    classId: String(row.class_group_id),
    className: String(row.class_name),
    studentId: String(row.student_id),
    studentName: String(row.student_name),
    studentEmail: String(row.student_email),
    periodType: row.period_type as Bulletin["periodType"],
    periodStart: toDateOnly(row.period_start),
    periodEnd: toDateOnly(row.period_end),
    title: String(row.title),
    teacherComment: row.teacher_comment ? String(row.teacher_comment) : null,
    average: Number(row.average),
    activities: snapshot.activities,
    feedbacks: snapshot.feedbacks,
    status: row.status as Bulletin["status"],
    lastErrorCode: row.last_error_code ? String(row.last_error_code) : null,
    generatedAt: (row.generated_at as Date).toISOString(),
    sentAt: row.sent_at ? (row.sent_at as Date).toISOString() : null,
    pdfSha256: String(row.pdf_sha256),
    deliveries: (row.deliveries as Bulletin["deliveries"]).map((delivery) => ({
      ...delivery,
      attemptedAt: new Date(delivery.attemptedAt).toISOString(),
      completedAt: delivery.completedAt
        ? new Date(delivery.completedAt).toISOString()
        : null,
    })),
  };
}

function toDateOnly(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}
