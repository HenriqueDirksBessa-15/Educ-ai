import type {
  ActivityCollectionSummary,
  ActivitySubmission,
} from "@educai/contracts";

import type { DatabaseClient } from "../database.js";
import type { GoogleCollectedSubmission } from "./google-response-collector.js";
import type { ObjectiveGradingResult } from "./objective-grader.js";

type QueryResult<Row> = { rows: Row[]; rowCount?: number | null };

export type CollectionLease = { runId: string; googleFormId: string };
export type PersistResult = { created: boolean; manualReview: boolean };

export class CorrectionsRepository {
  constructor(private readonly database: DatabaseClient) {}

  async listDueCollections(
    limit = 20,
  ): Promise<Array<{ professorId: string; activityId: string }>> {
    const result = (await this.database.query(
      `SELECT activity.professor_id, job.activity_id
       FROM activity_collection_job job
       JOIN activity ON activity.id = job.activity_id
       WHERE job.status IN ('pending', 'failed') AND job.scheduled_at <= now()
         AND activity.archived_at IS NULL
       ORDER BY job.scheduled_at
       LIMIT $1`,
      [limit],
    )) as QueryResult<{ professor_id: string; activity_id: string }>;
    return result.rows.map((row) => ({
      professorId: row.professor_id,
      activityId: row.activity_id,
    }));
  }

  async startCollection(
    professorId: string,
    activityId: string,
  ): Promise<CollectionLease | "not_found" | "not_due" | "busy"> {
    const result = (await this.database.query(
      `WITH owned AS (
         SELECT activity.id, publication.google_form_id, job.status, job.scheduled_at
         FROM activity
         JOIN activity_publication publication ON publication.activity_id = activity.id
         JOIN activity_collection_job job ON job.activity_id = activity.id
         WHERE activity.id = $1 AND activity.professor_id = $2
           AND activity.status IN ('published', 'finished')
           AND publication.status = 'published'
       ), acquired AS (
         UPDATE activity_collection_job job
         SET status = 'running', attempt_count = attempt_count + 1,
             last_error_code = NULL, started_at = now(), completed_at = NULL
         FROM owned
         WHERE job.activity_id = owned.id
           AND owned.google_form_id IS NOT NULL
           AND (owned.scheduled_at <= now() OR EXISTS (
             SELECT 1 FROM activity WHERE id = owned.id AND status = 'finished'
           ))
           AND owned.status <> 'running'
         RETURNING job.activity_id
       ), run AS (
         INSERT INTO activity_collection_run (activity_id, professor_id)
         SELECT acquired.activity_id, $2 FROM acquired
         RETURNING id, activity_id
       )
       SELECT run.id AS run_id, owned.google_form_id
       FROM run JOIN owned ON owned.id = run.activity_id`,
      [activityId, professorId],
    )) as QueryResult<{ run_id: string; google_form_id: string }>;
    const lease = result.rows[0];
    if (lease)
      return { runId: lease.run_id, googleFormId: lease.google_form_id };
    const state = (await this.database.query(
      `SELECT job.status, job.scheduled_at, activity.status AS activity_status
       FROM activity
       LEFT JOIN activity_collection_job job ON job.activity_id = activity.id
       WHERE activity.id = $1 AND activity.professor_id = $2`,
      [activityId, professorId],
    )) as QueryResult<{
      status: string | null;
      scheduled_at: Date | null;
      activity_status: string;
    }>;
    if (!state.rows[0]) return "not_found";
    if (state.rows[0].status === "running") return "busy";
    return "not_due";
  }

  async reconcileStudent(
    professorId: string,
    activityId: string,
    email: string | null,
  ): Promise<{ studentId: string | null; reason: string | null }> {
    if (!email) return { studentId: null, reason: "RESPONDENT_EMAIL_MISSING" };
    const result = (await this.database.query(
      `SELECT DISTINCT student.id
       FROM activity
       JOIN activity_classroom_distribution destination
         ON destination.activity_id = activity.id
       JOIN enrollment ON enrollment.class_group_id = destination.class_group_id
         AND enrollment.status = 'active'
       JOIN student ON student.id = enrollment.student_id
       WHERE activity.id = $1 AND activity.professor_id = $2
         AND lower(student.email::text) = lower($3)`,
      [activityId, professorId, email],
    )) as QueryResult<{ id: string }>;
    if (result.rows.length === 1)
      return { studentId: result.rows[0]!.id, reason: null };
    return {
      studentId: null,
      reason:
        result.rows.length > 1
          ? "STUDENT_RECONCILIATION_AMBIGUOUS"
          : "STUDENT_NOT_ENROLLED",
    };
  }

  async persistSubmission(
    professorId: string,
    activityId: string,
    collected: GoogleCollectedSubmission,
    student: { studentId: string | null; reason: string | null },
    grading: ObjectiveGradingResult,
  ): Promise<PersistResult> {
    const manualReason = student.reason ?? grading.manualReviewReason;
    const status = manualReason ? "manual_review_required" : grading.status;
    const result = (await this.database.query(
      `WITH owned AS (
         SELECT id FROM activity WHERE id = $1 AND professor_id = $2
       ), previous AS (
         SELECT id FROM activity_submission
         WHERE activity_id = $1 AND external_response_id = $3
       ), saved AS (
         INSERT INTO activity_submission
           (activity_id, student_id, external_response_id, respondent_email,
            submitted_at, status, manual_review_reason,
            objective_points_awarded, objective_points_possible, grade, raw_payload)
         SELECT owned.id, $4, $3, $5, $6, $7::activity_submission_status, $8,
                $9, $10, $11, $12::jsonb
         FROM owned
         ON CONFLICT (activity_id, external_response_id) DO UPDATE SET
           student_id = EXCLUDED.student_id,
           respondent_email = EXCLUDED.respondent_email,
           submitted_at = EXCLUDED.submitted_at,
           status = CASE
             WHEN activity_submission.correction_status IN ('approved', 'released')
               THEN activity_submission.status
             ELSE EXCLUDED.status
           END,
           manual_review_reason = CASE
             WHEN activity_submission.correction_status IN ('approved', 'released')
               THEN activity_submission.manual_review_reason
             ELSE EXCLUDED.manual_review_reason
           END,
           objective_points_awarded = CASE
             WHEN activity_submission.correction_status IN ('approved', 'released')
               THEN activity_submission.objective_points_awarded
             ELSE EXCLUDED.objective_points_awarded
           END,
           objective_points_possible = CASE
             WHEN activity_submission.correction_status IN ('approved', 'released')
               THEN activity_submission.objective_points_possible
             ELSE EXCLUDED.objective_points_possible
           END,
           grade = CASE
             WHEN activity_submission.correction_status IN ('approved', 'released')
               THEN activity_submission.grade
             ELSE EXCLUDED.grade
           END,
           raw_payload = EXCLUDED.raw_payload
         RETURNING id
       ), answers AS (
         INSERT INTO activity_submission_answer
           (submission_id, question_id, external_question_id, question_position,
            answer_text, status, is_correct, points_awarded, review_reason)
         SELECT saved.id, item.question_id, item.external_question_id,
                item.question_position, item.answer_text,
                item.status::activity_answer_status, item.is_correct,
                item.points_awarded, item.review_reason
         FROM saved
         CROSS JOIN jsonb_to_recordset($13::jsonb) AS item(
           question_id uuid, external_question_id text, question_position smallint,
           answer_text text, status text, is_correct boolean,
           points_awarded numeric, review_reason text
         )
         ON CONFLICT (submission_id, external_question_id) DO UPDATE SET
           question_id = EXCLUDED.question_id,
           question_position = EXCLUDED.question_position,
           answer_text = EXCLUDED.answer_text,
           status = CASE
             WHEN activity_submission_answer.status = 'teacher_reviewed'
               THEN activity_submission_answer.status
             ELSE EXCLUDED.status
           END,
           is_correct = CASE
             WHEN activity_submission_answer.status = 'teacher_reviewed'
               THEN activity_submission_answer.is_correct
             ELSE EXCLUDED.is_correct
           END,
           points_awarded = CASE
             WHEN activity_submission_answer.status = 'teacher_reviewed'
               THEN activity_submission_answer.points_awarded
             ELSE EXCLUDED.points_awarded
           END,
           review_reason = CASE
             WHEN activity_submission_answer.status = 'teacher_reviewed'
               THEN activity_submission_answer.review_reason
             ELSE EXCLUDED.review_reason
           END
       ), compatibility AS (
         INSERT INTO activity_response
           (activity_id, external_student_id, submitted_at)
         SELECT $1, coalesce($5, $3), $6 FROM owned
         ON CONFLICT (activity_id, external_student_id) DO UPDATE SET
           submitted_at = EXCLUDED.submitted_at
       )
       SELECT saved.id, NOT EXISTS (SELECT 1 FROM previous) AS created
       FROM saved`,
      [
        activityId,
        professorId,
        collected.externalResponseId,
        student.studentId,
        collected.respondentEmail,
        collected.submittedAt,
        status,
        manualReason,
        grading.objectivePointsAwarded,
        grading.objectivePointsPossible,
        manualReason ? null : grading.grade,
        JSON.stringify(collected.rawPayload),
        JSON.stringify(
          grading.answers.map((answer) => ({
            question_id: answer.questionId,
            external_question_id: answer.externalQuestionId,
            question_position: answer.questionPosition,
            answer_text: answer.answerText,
            status: answer.status,
            is_correct: answer.isCorrect,
            points_awarded: answer.pointsAwarded,
            review_reason: answer.reviewReason,
          })),
        ),
      ],
    )) as QueryResult<{ id: string; created: boolean }>;
    if (!result.rows[0]) throw new Error("ACTIVITY_NOT_OWNED");
    return {
      created: result.rows[0].created,
      manualReview: status === "manual_review_required",
    };
  }

  async completeCollection(
    professorId: string,
    activityId: string,
    runId: string,
    counts: {
      received: number;
      created: number;
      updated: number;
      manualReview: number;
    },
  ): Promise<void> {
    await this.database.query(
      `WITH finished_run AS (
         UPDATE activity_collection_run SET
           status = 'completed', received_count = $4, created_count = $5,
           updated_count = $6, manual_review_count = $7, completed_at = now()
         WHERE id = $3 AND activity_id = $1 AND professor_id = $2
         RETURNING activity_id
       )
       UPDATE activity_collection_job job SET
         status = 'completed', completed_at = now(), last_error_code = NULL
       FROM finished_run WHERE job.activity_id = finished_run.activity_id`,
      [
        activityId,
        professorId,
        runId,
        counts.received,
        counts.created,
        counts.updated,
        counts.manualReview,
      ],
    );
  }

  async failCollection(
    professorId: string,
    activityId: string,
    runId: string,
    errorCode: string,
  ): Promise<void> {
    await this.database.query(
      `WITH failed_run AS (
         UPDATE activity_collection_run SET
           status = 'failed', error_code = $4, completed_at = now()
         WHERE id = $3 AND activity_id = $1 AND professor_id = $2
         RETURNING activity_id
       )
       UPDATE activity_collection_job job SET
         status = 'failed', last_error_code = $4, completed_at = now()
       FROM failed_run WHERE job.activity_id = failed_run.activity_id`,
      [activityId, professorId, runId, errorCode],
    );
  }

  async getSummary(
    professorId: string,
    activityId: string,
  ): Promise<ActivityCollectionSummary | null> {
    const job = (await this.database.query(
      `SELECT job.activity_id, job.status, job.scheduled_at, job.attempt_count,
              job.last_error_code, job.completed_at,
              count(submission.id)::int AS submission_count,
              count(submission.id) FILTER (
                WHERE submission.grade IS NOT NULL)::int AS graded_count,
              count(submission.id) FILTER (
                WHERE submission.status = 'manual_review_required')::int
                AS manual_review_count
       FROM activity_collection_job job
       JOIN activity ON activity.id = job.activity_id
       LEFT JOIN activity_submission submission
         ON submission.activity_id = activity.id
       WHERE activity.id = $1 AND activity.professor_id = $2
       GROUP BY job.activity_id, job.status, job.scheduled_at, job.attempt_count,
                job.last_error_code, job.completed_at`,
      [activityId, professorId],
    )) as QueryResult<{
      activity_id: string;
      status: ActivityCollectionSummary["status"];
      scheduled_at: Date;
      attempt_count: number;
      last_error_code: string | null;
      completed_at: Date | null;
      submission_count: number;
      graded_count: number;
      manual_review_count: number;
    }>;
    if (!job.rows[0]) return null;
    const submissions = (await this.database.query(
      `SELECT submission.id, submission.activity_id, submission.student_id,
              student.name AS student_name, submission.external_response_id,
              submission.respondent_email::text, submission.submitted_at,
              submission.status, submission.manual_review_reason,
              submission.objective_points_awarded,
              submission.objective_points_possible, submission.grade,
              submission.correction_status, submission.teacher_comment,
              submission.approved_at, submission.released_at,
              submission.classroom_return_status,
              submission.classroom_return_error_code,
              coalesce(jsonb_agg(jsonb_build_object(
                'id', answer.id,
                'questionId', answer.question_id,
                'externalQuestionId', answer.external_question_id,
                'questionPosition', answer.question_position,
                'kind', question.kind,
                'prompt', question.prompt,
                'answerText', answer.answer_text,
                'status', answer.status,
                'isCorrect', answer.is_correct,
                'pointsAwarded', answer.points_awarded,
                'pointsPossible', question.points,
                'reviewReason', answer.review_reason,
                'suggestedPointsAwarded', answer.suggested_points_awarded,
                'suggestedComment', answer.suggested_comment,
                'suggestionRequiresReview', answer.suggestion_requires_review,
                'teacherComment', answer.teacher_comment
              ) ORDER BY answer.question_position)
                FILTER (WHERE answer.id IS NOT NULL), '[]'::jsonb) AS answers,
              (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'id', history.id, 'version', history.version,
                'answerId', history.answer_id, 'action', history.action,
                'origin', history.origin, 'model', history.model,
                'pointsAwarded', history.points_awarded,
                'grade', history.grade, 'comment', history.comment,
                'requiresReview', history.requires_review,
                'errorCode', history.error_code, 'createdAt', history.created_at
              ) ORDER BY history.version), '[]'::jsonb)
               FROM activity_correction_history history
               WHERE history.submission_id = submission.id) AS correction_history
       FROM activity_submission submission
       LEFT JOIN student ON student.id = submission.student_id
       LEFT JOIN activity_submission_answer answer
         ON answer.submission_id = submission.id
       LEFT JOIN activity_question question ON question.id = answer.question_id
       WHERE submission.activity_id = $1
       GROUP BY submission.id, student.name
       ORDER BY submission.submitted_at DESC`,
      [activityId],
    )) as QueryResult<
      Record<string, unknown> & { answers: ActivitySubmission["answers"] }
    >;
    const row = job.rows[0];
    return {
      activityId: row.activity_id,
      status: row.status,
      scheduledAt: row.scheduled_at.toISOString(),
      attemptCount: row.attempt_count,
      lastErrorCode: row.last_error_code,
      completedAt: row.completed_at?.toISOString() ?? null,
      submissionCount: row.submission_count,
      gradedCount: row.graded_count,
      manualReviewCount: row.manual_review_count,
      submissions: submissions.rows.map(toSubmission),
    };
  }
}

function toSubmission(row: Record<string, unknown>): ActivitySubmission {
  return {
    id: String(row.id),
    activityId: String(row.activity_id),
    studentId: row.student_id ? String(row.student_id) : null,
    studentName: row.student_name ? String(row.student_name) : null,
    externalResponseId: String(row.external_response_id),
    respondentEmail: row.respondent_email ? String(row.respondent_email) : null,
    submittedAt: (row.submitted_at as Date).toISOString(),
    status: row.status as ActivitySubmission["status"],
    manualReviewReason: row.manual_review_reason
      ? String(row.manual_review_reason)
      : null,
    objectivePointsAwarded: Number(row.objective_points_awarded),
    objectivePointsPossible: Number(row.objective_points_possible),
    grade: row.grade === null ? null : Number(row.grade),
    correctionStatus: String(
      row.correction_status,
    ) as ActivitySubmission["correctionStatus"],
    teacherComment: row.teacher_comment ? String(row.teacher_comment) : null,
    approvedAt: row.approved_at
      ? (row.approved_at as Date).toISOString()
      : null,
    releasedAt: row.released_at
      ? (row.released_at as Date).toISOString()
      : null,
    classroomReturnStatus: String(
      row.classroom_return_status,
    ) as ActivitySubmission["classroomReturnStatus"],
    classroomReturnErrorCode: row.classroom_return_error_code
      ? String(row.classroom_return_error_code)
      : null,
    correctionHistory: (
      row.correction_history as ActivitySubmission["correctionHistory"]
    ).map((history) => ({
      ...history,
      pointsAwarded:
        history.pointsAwarded === null ? null : Number(history.pointsAwarded),
      grade: history.grade === null ? null : Number(history.grade),
      createdAt: new Date(history.createdAt).toISOString(),
    })),
    answers: (row.answers as ActivitySubmission["answers"]).map((answer) => ({
      ...answer,
      pointsAwarded:
        answer.pointsAwarded === null ? null : Number(answer.pointsAwarded),
      pointsPossible:
        answer.pointsPossible === null ? null : Number(answer.pointsPossible),
      suggestedPointsAwarded:
        answer.suggestedPointsAwarded === null
          ? null
          : Number(answer.suggestedPointsAwarded),
    })),
  };
}
