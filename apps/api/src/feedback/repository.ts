import type {
  EligibleFeedbackSubmission,
  Feedback,
  FeedbackCreate,
  FeedbackGeneration,
  FeedbackReview,
  FeedbackUpdate,
} from "@educai/contracts";

import type { DatabaseClient } from "../database.js";
import type {
  FeedbackGenerationResult,
  FeedbackPromptContext,
} from "../openai/adapter.js";

type QueryResult<Row> = { rows: Row[]; rowCount?: number | null };

export class FeedbackRepository {
  constructor(private readonly database: DatabaseClient) {}

  async list(professorId: string): Promise<Feedback[]> {
    const result = (await this.database.query(this.feedbackQuery(), [
      professorId,
    ])) as QueryResult<Record<string, unknown>>;
    return result.rows.map(toFeedback);
  }

  async eligibleSubmissions(
    professorId: string,
  ): Promise<EligibleFeedbackSubmission[]> {
    const result = (await this.database.query(
      `SELECT submission.id, student.name AS student_name,
              activity.title AS activity_title, submission.grade,
              submission.correction_status
       FROM activity_submission submission
       JOIN activity ON activity.id = submission.activity_id
       JOIN student ON student.id = submission.student_id
       WHERE activity.professor_id = $1
         AND submission.correction_status IN ('approved', 'released')
         AND submission.grade IS NOT NULL
       ORDER BY submission.updated_at DESC`,
      [professorId],
    )) as QueryResult<{
      id: string;
      student_name: string;
      activity_title: string;
      grade: string | number;
      correction_status: "approved" | "released";
    }>;
    return result.rows.map((row) => ({
      id: row.id,
      studentName: row.student_name,
      activityTitle: row.activity_title,
      grade: Number(row.grade),
      correctionStatus: row.correction_status,
    }));
  }

  async create(
    professorId: string,
    input: FeedbackCreate,
    editWindowMinutes: number,
  ): Promise<string> {
    const target = await this.resolveTarget(professorId, input);
    if (!target) throw new Error("FEEDBACK_TARGET_NOT_FOUND");
    await this.assertMaterials(professorId, input.materialIds);
    const result = (await this.database.query(
      `WITH inserted AS (
         INSERT INTO feedback
           (professor_id, scope, submission_id, student_id, activity_id,
            class_group_id, title, content, teacher_observation, editable_until)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                 now() + ($10 * interval '1 minute'))
         RETURNING id, title, content, teacher_observation, scope
       ), links AS (
         INSERT INTO feedback_link (feedback_id, label, url, position)
         SELECT inserted.id, item.label, item.url, item.position
         FROM inserted
         CROSS JOIN jsonb_to_recordset($11::jsonb) AS item(
           label text, url text, position smallint
         )
       ), attachments AS (
         INSERT INTO feedback_attachment (feedback_id, material_id)
         SELECT inserted.id, value::uuid FROM inserted,
           jsonb_array_elements_text($12::jsonb) AS value
       )
       INSERT INTO feedback_history
         (feedback_id, version, action, origin, snapshot)
       SELECT inserted.id, 1, 'created', 'teacher',
              jsonb_build_object(
                'title', inserted.title, 'content', inserted.content,
                'teacherObservation', inserted.teacher_observation,
                'scope', inserted.scope, 'links', $11::jsonb,
                'materialIds', $12::jsonb
              )
       FROM inserted RETURNING feedback_id`,
      [
        professorId,
        input.scope,
        target.submissionId,
        target.studentId,
        target.activityId,
        target.classId,
        input.title,
        input.content,
        input.teacherObservation ?? null,
        editWindowMinutes,
        JSON.stringify(
          input.links.map((link, position) => ({ ...link, position })),
        ),
        JSON.stringify(input.materialIds),
      ],
    )) as QueryResult<{ feedback_id: string }>;
    return result.rows[0]!.feedback_id;
  }

  async update(
    professorId: string,
    feedbackId: string,
    input: FeedbackUpdate,
  ): Promise<"updated" | "not_found" | "window_expired" | "locked"> {
    if (input.materialIds)
      await this.assertMaterials(professorId, input.materialIds);
    const result = (await this.database.query(
      `WITH current AS (
         SELECT * FROM feedback WHERE id = $1 AND professor_id = $2
       ), updated AS (
         UPDATE feedback SET
           title = coalesce($3, title), content = coalesce($4, content),
           teacher_observation = CASE WHEN $5::boolean THEN $6 ELSE teacher_observation END,
           origin = 'manual',
           status = CASE WHEN status = 'generated' THEN 'draft' ELSE status END
         WHERE id = $1 AND professor_id = $2 AND status <> 'deleted'
           AND editable_until >= now()
         RETURNING *
       ), removed_links AS (
         DELETE FROM feedback_link link USING updated
         WHERE link.feedback_id = updated.id AND $7::boolean
         RETURNING link.id
       ), links_cleared AS (
         SELECT count(*) FROM removed_links
       ), links AS (
         INSERT INTO feedback_link (feedback_id, label, url, position)
         SELECT updated.id, item.label, item.url, item.position
         FROM updated
         CROSS JOIN links_cleared
         CROSS JOIN jsonb_to_recordset($8::jsonb) AS item(
           label text, url text, position smallint
         ) WHERE $7::boolean
       ), removed_attachments AS (
         DELETE FROM feedback_attachment attachment USING updated
         WHERE attachment.feedback_id = updated.id AND $9::boolean
         RETURNING attachment.material_id
       ), attachments_cleared AS (
         SELECT count(*) FROM removed_attachments
       ), attachments AS (
         INSERT INTO feedback_attachment (feedback_id, material_id)
         SELECT updated.id, value::uuid FROM updated
         CROSS JOIN attachments_cleared,
           jsonb_array_elements_text($10::jsonb) AS value
         WHERE $9::boolean
       ), notification AS (
         UPDATE notification_outbox notification SET status = 'pending',
           error_code = NULL, sent_at = NULL
         FROM updated WHERE notification.feedback_id = updated.id
       ), next_version AS (
         SELECT coalesce(max(version), 0) + 1 AS value
         FROM feedback_history WHERE feedback_id = $1
       )
       INSERT INTO feedback_history
         (feedback_id, version, action, origin, snapshot)
       SELECT updated.id, next_version.value, 'teacher_edit', 'teacher',
              jsonb_build_object(
                'title', updated.title, 'content', updated.content,
                'teacherObservation', updated.teacher_observation,
                'links', $8::jsonb, 'materialIds', $10::jsonb
              )
       FROM updated CROSS JOIN next_version RETURNING id`,
      [
        feedbackId,
        professorId,
        input.title ?? null,
        input.content ?? null,
        Object.hasOwn(input, "teacherObservation"),
        input.teacherObservation ?? null,
        Boolean(input.links),
        JSON.stringify(
          (input.links ?? []).map((link, position) => ({ ...link, position })),
        ),
        Boolean(input.materialIds),
        JSON.stringify(input.materialIds ?? []),
      ],
    )) as QueryResult<{ id: string }>;
    if (result.rows[0]) return "updated";
    const state = (await this.database.query(
      `SELECT status, editable_until < now() AS expired
       FROM feedback WHERE id = $1 AND professor_id = $2`,
      [feedbackId, professorId],
    )) as QueryResult<{ status: string; expired: boolean }>;
    if (!state.rows[0]) return "not_found";
    if (state.rows[0].expired) return "window_expired";
    return "locked";
  }

  async getPromptContext(
    professorId: string,
    feedbackId: string,
  ): Promise<FeedbackPromptContext | null> {
    const result = (await this.database.query(
      `SELECT feedback.scope, feedback.title, feedback.content,
              coalesce(student.name, class_group.name) AS audience,
              activity.title AS activity_title, submission.grade,
              submission.teacher_comment,
              coalesce((SELECT array_agg(
                question.prompt || ': ' || coalesce(answer.answer_text, 'sem resposta') ||
                ' (' || coalesce(answer.points_awarded::text, 'pendente') ||
                '/' || question.points::text || ')'
                ORDER BY question.position)
               FROM activity_submission_answer answer
               JOIN activity_question question ON question.id = answer.question_id
               WHERE answer.submission_id = submission.id), ARRAY[]::text[])
                AS answer_summaries
       FROM feedback
       LEFT JOIN activity_submission submission ON submission.id = feedback.submission_id
       LEFT JOIN student ON student.id = feedback.student_id
       LEFT JOIN activity ON activity.id = feedback.activity_id
       LEFT JOIN class_group ON class_group.id = feedback.class_group_id
       WHERE feedback.id = $1 AND feedback.professor_id = $2
         AND feedback.status IN ('draft', 'generated', 'reviewed')
         AND feedback.editable_until >= now()`,
      [feedbackId, professorId],
    )) as QueryResult<{
      scope: "individual" | "global";
      title: string;
      content: string;
      audience: string;
      activity_title: string | null;
      grade: string | number | null;
      teacher_comment: string | null;
      answer_summaries: string[];
    }>;
    const row = result.rows[0];
    if (!row) return null;
    return {
      scope: row.scope,
      audience: row.audience,
      title: row.title,
      currentContent: row.content,
      activityTitle: row.activity_title,
      grade: row.grade === null ? null : Number(row.grade),
      teacherComment: row.teacher_comment,
      answerSummaries: row.answer_summaries,
    };
  }

  async recordGenerationSuccess(
    professorId: string,
    feedbackId: string,
    context: FeedbackPromptContext,
    generated: FeedbackGenerationResult,
  ): Promise<FeedbackGeneration | null> {
    const result = (await this.database.query(
      `WITH owned AS (
         SELECT id FROM feedback WHERE id = $1 AND professor_id = $2
           AND status IN ('draft', 'generated', 'reviewed')
           AND editable_until >= now()
       ), next_version AS (
         SELECT coalesce(max(version), 0) + 1 AS value
         FROM feedback_generation WHERE feedback_id = $1
       ), inserted AS (
         INSERT INTO feedback_generation
           (feedback_id, version, model, origin, status, prompt_context, suggestion)
         SELECT owned.id, next_version.value, $3, $4, 'succeeded', $5::jsonb, $6::jsonb
         FROM owned CROSS JOIN next_version RETURNING *
       ), updated AS (
         UPDATE feedback SET status = 'generated', origin = $4
         FROM inserted WHERE feedback.id = inserted.feedback_id
       ), history_version AS (
         SELECT coalesce(max(version), 0) + 1 AS value
         FROM feedback_history WHERE feedback_id = $1
       ), history AS (
         INSERT INTO feedback_history (feedback_id, version, action, origin, snapshot)
         SELECT inserted.feedback_id, history_version.value, 'ai_suggestion',
                $4::text::feedback_history_origin,
                jsonb_build_object('suggestion', inserted.suggestion)
         FROM inserted CROSS JOIN history_version
       ) SELECT * FROM inserted`,
      [
        feedbackId,
        professorId,
        generated.model,
        generated.origin,
        JSON.stringify(context),
        JSON.stringify(generated.suggestion),
      ],
    )) as QueryResult<Record<string, unknown>>;
    return result.rows[0] ? toGeneration(result.rows[0]) : null;
  }

  async recordGenerationFailure(
    professorId: string,
    feedbackId: string,
    context: FeedbackPromptContext,
    model: string,
    origin: "fixture" | "openai",
    errorCode: string,
  ): Promise<void> {
    await this.database.query(
      `WITH owned AS (
         SELECT id FROM feedback WHERE id = $1 AND professor_id = $2
           AND status <> 'deleted' AND editable_until >= now()
       ), next_version AS (
         SELECT coalesce(max(version), 0) + 1 AS value
         FROM feedback_generation WHERE feedback_id = $1
       ), inserted AS (
         INSERT INTO feedback_generation
           (feedback_id, version, model, origin, status, prompt_context, error_code)
         SELECT owned.id, next_version.value, $3, $4, 'failed', $5::jsonb, $6
         FROM owned CROSS JOIN next_version RETURNING feedback_id, error_code
       ), history_version AS (
         SELECT coalesce(max(version), 0) + 1 AS value
         FROM feedback_history WHERE feedback_id = $1
       )
       INSERT INTO feedback_history (feedback_id, version, action, origin, snapshot)
       SELECT inserted.feedback_id, history_version.value, 'ai_failure',
              $4::text::feedback_history_origin,
              jsonb_build_object('errorCode', inserted.error_code)
       FROM inserted CROSS JOIN history_version`,
      [
        feedbackId,
        professorId,
        model,
        origin,
        JSON.stringify(context),
        errorCode,
      ],
    );
  }

  async review(
    professorId: string,
    feedbackId: string,
    input: FeedbackReview,
  ): Promise<
    "reviewed" | "not_found" | "generation_not_found" | "window_expired"
  > {
    const result = (await this.database.query(
      `WITH generation AS (
         SELECT generation.id, generation.origin
         FROM feedback_generation generation
         JOIN feedback ON feedback.id = generation.feedback_id
         WHERE generation.id = $3 AND generation.feedback_id = $1
           AND generation.status = 'succeeded' AND feedback.professor_id = $2
           AND feedback.editable_until >= now() AND feedback.status = 'generated'
       ), updated AS (
         UPDATE feedback SET content = $4, teacher_observation = $5,
           status = 'reviewed'
         FROM generation WHERE feedback.id = $1 RETURNING feedback.*
       ), next_version AS (
         SELECT coalesce(max(version), 0) + 1 AS value
         FROM feedback_history WHERE feedback_id = $1
       )
       INSERT INTO feedback_history (feedback_id, version, action, origin, snapshot)
       SELECT updated.id, next_version.value, 'teacher_revision', 'teacher',
              jsonb_build_object('content', updated.content,
                'teacherObservation', updated.teacher_observation,
                'generationId', $3)
       FROM updated CROSS JOIN next_version RETURNING id`,
      [
        feedbackId,
        professorId,
        input.generationId,
        input.content,
        input.teacherObservation,
      ],
    )) as QueryResult<{ id: string }>;
    if (result.rows[0]) return "reviewed";
    const state = (await this.database.query(
      `SELECT feedback.editable_until < now() AS expired,
              EXISTS (SELECT 1 FROM feedback_generation
                WHERE id = $3 AND feedback_id = feedback.id) AS generation_exists
       FROM feedback WHERE feedback.id = $1 AND feedback.professor_id = $2`,
      [feedbackId, professorId, input.generationId],
    )) as QueryResult<{ expired: boolean; generation_exists: boolean }>;
    if (!state.rows[0]) return "not_found";
    if (state.rows[0].expired) return "window_expired";
    return "generation_not_found";
  }

  async send(
    professorId: string,
    feedbackId: string,
  ): Promise<"sent" | "not_found" | "review_required" | "deleted"> {
    const result = (await this.database.query(
      `WITH ready AS (
         SELECT feedback.*,
                CASE WHEN feedback.scope = 'global' THEN class_group.google_classroom_id
                     ELSE (SELECT destination.google_classroom_id
                       FROM activity_classroom_distribution destination
                       JOIN enrollment ON enrollment.class_group_id = destination.class_group_id
                       WHERE destination.activity_id = feedback.activity_id
                         AND enrollment.student_id = feedback.student_id
                       LIMIT 1) END AS google_classroom_id
         FROM feedback
         LEFT JOIN class_group ON class_group.id = feedback.class_group_id
         WHERE feedback.id = $1 AND feedback.professor_id = $2
           AND feedback.status IN ('draft', 'reviewed', 'sent')
       ), sent AS (
         UPDATE feedback SET status = 'sent',
           sent_at = coalesce(feedback.sent_at, now())
         FROM ready WHERE feedback.id = ready.id RETURNING feedback.*, ready.google_classroom_id
       ), notification AS (
         INSERT INTO notification_outbox
           (feedback_id, recipient_kind, student_id, class_group_id, channel)
         SELECT sent.id,
                CASE WHEN sent.scope = 'individual' THEN 'student'::notification_recipient_kind
                     ELSE 'class_group'::notification_recipient_kind END,
                sent.student_id, sent.class_group_id,
                CASE WHEN sent.google_classroom_id IS NOT NULL
                     THEN 'google_classroom'::notification_channel
                     ELSE 'email'::notification_channel END
         FROM sent ON CONFLICT (feedback_id) DO NOTHING
       ), next_version AS (
         SELECT coalesce(max(version), 0) + 1 AS value
         FROM feedback_history WHERE feedback_id = $1
       )
       INSERT INTO feedback_history (feedback_id, version, action, origin, snapshot)
       SELECT sent.id, next_version.value, 'sent', 'system',
              jsonb_build_object('sentAt', sent.sent_at)
       FROM sent CROSS JOIN next_version
       WHERE NOT EXISTS (SELECT 1 FROM feedback_history
         WHERE feedback_id = sent.id AND action = 'sent')
       RETURNING id`,
      [feedbackId, professorId],
    )) as QueryResult<{ id: string }>;
    if (result.rows[0]) return "sent";
    const state = (await this.database.query(
      `SELECT status FROM feedback WHERE id = $1 AND professor_id = $2`,
      [feedbackId, professorId],
    )) as QueryResult<{ status: string }>;
    if (!state.rows[0]) return "not_found";
    if (state.rows[0].status === "sent") return "sent";
    if (state.rows[0].status === "deleted") return "deleted";
    return "review_required";
  }

  async remove(
    professorId: string,
    feedbackId: string,
  ): Promise<"deleted" | "not_found" | "window_expired"> {
    const result = (await this.database.query(
      `WITH removed AS (
         UPDATE feedback SET status = 'deleted', deleted_at = now()
         WHERE id = $1 AND professor_id = $2 AND status <> 'deleted'
           AND editable_until >= now() RETURNING *
       ), next_version AS (
         SELECT coalesce(max(version), 0) + 1 AS value
         FROM feedback_history WHERE feedback_id = $1
       )
       INSERT INTO feedback_history (feedback_id, version, action, origin, snapshot)
       SELECT removed.id, next_version.value, 'deleted', 'teacher',
              jsonb_build_object('title', removed.title, 'content', removed.content)
       FROM removed CROSS JOIN next_version RETURNING id`,
      [feedbackId, professorId],
    )) as QueryResult<{ id: string }>;
    if (result.rows[0]) return "deleted";
    const state = (await this.database.query(
      `SELECT editable_until < now() AS expired FROM feedback
       WHERE id = $1 AND professor_id = $2`,
      [feedbackId, professorId],
    )) as QueryResult<{ expired: boolean }>;
    if (!state.rows[0]) return "not_found";
    return state.rows[0].expired ? "window_expired" : "deleted";
  }

  private async resolveTarget(professorId: string, input: FeedbackCreate) {
    if (input.scope === "global") {
      const result = (await this.database.query(
        `SELECT id FROM class_group WHERE id = $1 AND professor_id = $2`,
        [input.classId, professorId],
      )) as QueryResult<{ id: string }>;
      return result.rows[0]
        ? {
            submissionId: null,
            studentId: null,
            activityId: null,
            classId: result.rows[0].id,
          }
        : null;
    }
    const result = (await this.database.query(
      `SELECT submission.id, submission.student_id, submission.activity_id
       FROM activity_submission submission
       JOIN activity ON activity.id = submission.activity_id
       WHERE submission.id = $1 AND activity.professor_id = $2
         AND submission.student_id IS NOT NULL
         AND submission.correction_status IN ('approved', 'released')`,
      [input.submissionId, professorId],
    )) as QueryResult<{ id: string; student_id: string; activity_id: string }>;
    const row = result.rows[0];
    return row
      ? {
          submissionId: row.id,
          studentId: row.student_id,
          activityId: row.activity_id,
          classId: null,
        }
      : null;
  }

  private async assertMaterials(professorId: string, materialIds: string[]) {
    if (materialIds.length === 0) return;
    const result = (await this.database.query(
      `SELECT count(*)::int AS count FROM material
       WHERE professor_id = $1 AND id = ANY($2::uuid[]) AND archived_at IS NULL`,
      [professorId, materialIds],
    )) as QueryResult<{ count: number }>;
    if (result.rows[0]?.count !== new Set(materialIds).size)
      throw new Error("FEEDBACK_MATERIAL_NOT_FOUND");
  }

  private feedbackQuery(): string {
    return `SELECT feedback.*, student.name AS student_name,
              activity.title AS activity_title, class_group.name AS class_name,
              coalesce((SELECT jsonb_agg(jsonb_build_object(
                'id', link.id, 'label', link.label, 'url', link.url)
                ORDER BY link.position) FROM feedback_link link
                WHERE link.feedback_id = feedback.id), '[]'::jsonb) AS links,
              coalesce((SELECT jsonb_agg(jsonb_build_object(
                'id', material.id, 'title', material.title,
                'category', material.category) ORDER BY material.title)
                FROM feedback_attachment attachment
                JOIN material ON material.id = attachment.material_id
                WHERE attachment.feedback_id = feedback.id), '[]'::jsonb) AS attachments,
              (SELECT jsonb_build_object(
                'id', generation.id, 'version', generation.version,
                'model', generation.model, 'origin', generation.origin,
                'status', generation.status, 'suggestion', generation.suggestion,
                'errorCode', generation.error_code, 'createdAt', generation.created_at)
                FROM feedback_generation generation
                WHERE generation.feedback_id = feedback.id
                ORDER BY generation.version DESC LIMIT 1) AS latest_generation,
              coalesce((SELECT jsonb_agg(jsonb_build_object(
                'id', history.id, 'version', history.version,
                'action', history.action, 'origin', history.origin,
                'createdAt', history.created_at) ORDER BY history.version)
                FROM feedback_history history WHERE history.feedback_id = feedback.id),
                '[]'::jsonb) AS history,
              (SELECT jsonb_build_object('channel', notification.channel,
                'status', notification.status, 'errorCode', notification.error_code)
                FROM notification_outbox notification
                WHERE notification.feedback_id = feedback.id) AS notification
       FROM feedback
       LEFT JOIN student ON student.id = feedback.student_id
       LEFT JOIN activity ON activity.id = feedback.activity_id
       LEFT JOIN class_group ON class_group.id = feedback.class_group_id
       WHERE feedback.professor_id = $1
       ORDER BY feedback.created_at DESC`;
  }
}

function toFeedback(row: Record<string, unknown>): Feedback {
  const latest = row.latest_generation as Record<string, unknown> | null;
  return {
    id: String(row.id),
    scope: row.scope as Feedback["scope"],
    submissionId: row.submission_id ? String(row.submission_id) : null,
    studentId: row.student_id ? String(row.student_id) : null,
    studentName: row.student_name ? String(row.student_name) : null,
    activityId: row.activity_id ? String(row.activity_id) : null,
    activityTitle: row.activity_title ? String(row.activity_title) : null,
    classId: row.class_group_id ? String(row.class_group_id) : null,
    className: row.class_name ? String(row.class_name) : null,
    title: String(row.title),
    content: String(row.content),
    teacherObservation: row.teacher_observation
      ? String(row.teacher_observation)
      : null,
    origin: row.origin as Feedback["origin"],
    status: row.status as Feedback["status"],
    editableUntil: (row.editable_until as Date).toISOString(),
    canEdit:
      new Date(row.editable_until as Date).getTime() >= Date.now() &&
      row.status !== "deleted",
    sentAt: row.sent_at ? (row.sent_at as Date).toISOString() : null,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
    links: row.links as Feedback["links"],
    attachments: row.attachments as Feedback["attachments"],
    latestGeneration: latest ? toGeneration(latest) : null,
    history: (row.history as Feedback["history"]).map((item) => ({
      ...item,
      createdAt: new Date(item.createdAt).toISOString(),
    })),
    notification: row.notification as Feedback["notification"],
  };
}

function toGeneration(row: Record<string, unknown>): FeedbackGeneration {
  const errorCode = row.error_code ?? row.errorCode;
  const createdAt = row.created_at ?? row.createdAt;
  return {
    id: String(row.id),
    version: Number(row.version),
    model: String(row.model),
    origin: row.origin as FeedbackGeneration["origin"],
    status: row.status as FeedbackGeneration["status"],
    suggestion: (row.suggestion as FeedbackGeneration["suggestion"]) ?? null,
    errorCode: errorCode ? String(errorCode) : null,
    createdAt: new Date(createdAt as Date | string).toISOString(),
  };
}
