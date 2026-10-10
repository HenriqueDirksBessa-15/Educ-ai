import type {
  DiscursiveCorrectionSuggestion,
  SubmissionCorrectionReview,
} from "@educai/contracts";

import type { DatabaseClient } from "../database.js";
import type { DiscursiveCorrectionPromptContext } from "../openai/adapter.js";

type QueryResult<Row> = { rows: Row[]; rowCount?: number | null };

export type OwnedCorrectionContext = DiscursiveCorrectionPromptContext & {
  submissionId: string;
  answerId: string;
  correctionStatus: string;
};

export type ClassroomReleaseContext = {
  submissionId: string;
  correctionStatus: string;
  googleCourseId: string | null;
  googleCourseWorkId: string | null;
  googleUserId: string | null;
  gradePoints: number;
};

export class DiscursiveCorrectionsRepository {
  constructor(private readonly database: DatabaseClient) {}

  async getContext(
    professorId: string,
    submissionId: string,
    answerId: string,
    rigour: DiscursiveCorrectionPromptContext["rigour"],
  ): Promise<OwnedCorrectionContext | null> {
    const result = (await this.database.query(
      `SELECT submission.id AS submission_id, answer.id AS answer_id,
              answer.answer_text, question.prompt, question.target_answer,
              question.criteria, question.points, activity.difficulty,
              plan.school_year, plan.contents, submission.correction_status
       FROM activity_submission submission
       JOIN activity ON activity.id = submission.activity_id
         AND activity.professor_id = $1
       JOIN lesson_plan plan ON plan.id = activity.lesson_plan_id
       JOIN activity_submission_answer answer
         ON answer.submission_id = submission.id AND answer.id = $3
       JOIN activity_question question ON question.id = answer.question_id
         AND question.kind = 'discursive'
       WHERE submission.id = $2
         AND submission.correction_status NOT IN ('approved', 'released')`,
      [professorId, submissionId, answerId],
    )) as QueryResult<{
      submission_id: string;
      answer_id: string;
      answer_text: string | null;
      prompt: string;
      target_answer: string | null;
      criteria: string;
      points: string | number;
      difficulty: OwnedCorrectionContext["difficulty"];
      school_year: string;
      contents: string;
      correction_status: string;
    }>;
    const row = result.rows[0];
    if (!row) return null;
    return {
      submissionId: row.submission_id,
      answerId: row.answer_id,
      question: row.prompt,
      answer: row.answer_text ?? "",
      targetAnswer: row.target_answer,
      criteria: row.criteria,
      maxPoints: Number(row.points),
      rigour,
      schoolYear: row.school_year,
      difficulty: row.difficulty,
      content: row.contents,
      correctionStatus: row.correction_status,
    };
  }

  async recordSuggestion(
    professorId: string,
    context: OwnedCorrectionContext,
    result: {
      suggestion: DiscursiveCorrectionSuggestion;
      model: string;
      origin: "fixture" | "openai";
    },
  ): Promise<boolean> {
    const saved = (await this.database.query(
      `WITH owned AS (
         SELECT answer.id, answer.submission_id
         FROM activity_submission_answer answer
         JOIN activity_submission submission ON submission.id = answer.submission_id
         JOIN activity ON activity.id = submission.activity_id
         WHERE answer.id = $3 AND submission.id = $2
           AND activity.professor_id = $1
           AND submission.correction_status NOT IN ('approved', 'released')
       ), updated_answer AS (
         UPDATE activity_submission_answer answer SET
           suggested_points_awarded = $4,
           suggested_comment = $5,
           suggestion_requires_review = $6
         FROM owned WHERE answer.id = owned.id
         RETURNING answer.id, answer.submission_id
       ), updated_submission AS (
         UPDATE activity_submission submission SET correction_status = 'suggested'
         FROM updated_answer WHERE submission.id = updated_answer.submission_id
         RETURNING submission.id
       ), next_version AS (
         SELECT coalesce(max(version), 0) + 1 AS value
         FROM activity_correction_history WHERE submission_id = $2
       )
       INSERT INTO activity_correction_history
         (submission_id, answer_id, version, action, origin, model,
          points_awarded, comment, requires_review, prompt_context, snapshot)
       SELECT updated_submission.id, $3, next_version.value, 'ai_suggestion',
              $7::correction_history_origin, $8, $4, $5, $6, $9::jsonb,
              jsonb_build_object('suggestion', $10::jsonb)
       FROM updated_submission CROSS JOIN next_version
       RETURNING id`,
      [
        professorId,
        context.submissionId,
        context.answerId,
        result.suggestion.pointsAwarded,
        result.suggestion.comment,
        result.suggestion.requiresReview,
        result.origin,
        result.model,
        JSON.stringify(context),
        JSON.stringify(result.suggestion),
      ],
    )) as QueryResult<{ id: string }>;
    return Boolean(saved.rows[0]);
  }

  async recordFailure(
    professorId: string,
    context: OwnedCorrectionContext,
    errorCode: string,
    model: string,
    origin: "fixture" | "openai",
  ): Promise<void> {
    await this.database.query(
      `WITH owned AS (
         SELECT submission.id
         FROM activity_submission submission
         JOIN activity ON activity.id = submission.activity_id
         WHERE submission.id = $2 AND activity.professor_id = $1
           AND submission.correction_status NOT IN ('approved', 'released')
       ), updated AS (
         UPDATE activity_submission submission SET correction_status = 'manual_required'
         FROM owned WHERE submission.id = owned.id RETURNING submission.id
       ), next_version AS (
         SELECT coalesce(max(version), 0) + 1 AS value
         FROM activity_correction_history WHERE submission_id = $2
       )
       INSERT INTO activity_correction_history
         (submission_id, answer_id, version, action, origin, model,
          error_code, prompt_context, snapshot)
       SELECT updated.id, $3, next_version.value, 'ai_failure',
              $4::correction_history_origin, $5, $6, $7::jsonb,
              jsonb_build_object('errorCode', $6)
       FROM updated CROSS JOIN next_version`,
      [
        professorId,
        context.submissionId,
        context.answerId,
        origin,
        model,
        errorCode,
        JSON.stringify(context),
      ],
    );
  }

  async review(
    professorId: string,
    submissionId: string,
    review: SubmissionCorrectionReview,
  ): Promise<"reviewed" | "not_found" | "locked" | "invalid_answers"> {
    const current = (await this.database.query(
      `SELECT answer.id, question.points
       FROM activity_submission submission
       JOIN activity ON activity.id = submission.activity_id
       JOIN activity_submission_answer answer ON answer.submission_id = submission.id
       JOIN activity_question question ON question.id = answer.question_id
         AND question.kind = 'discursive'
       WHERE submission.id = $1 AND activity.professor_id = $2
         AND submission.correction_status NOT IN ('approved', 'released')
       ORDER BY answer.id`,
      [submissionId, professorId],
    )) as QueryResult<{ id: string; points: string | number }>;
    if (current.rows.length === 0) {
      const exists = (await this.database.query(
        `SELECT 1 FROM activity_submission submission
         JOIN activity ON activity.id = submission.activity_id
         WHERE submission.id = $1 AND activity.professor_id = $2`,
        [submissionId, professorId],
      )) as QueryResult<Record<string, never>>;
      return exists.rows[0] ? "locked" : "not_found";
    }
    const provided = new Map(
      review.answers.map((answer) => [answer.answerId, answer]),
    );
    if (
      provided.size !== current.rows.length ||
      current.rows.some((answer) => {
        const input = provided.get(answer.id);
        return !input || input.pointsAwarded > Number(answer.points);
      })
    )
      return "invalid_answers";

    const result = (await this.database.query(
      `WITH updated_answers AS (
         UPDATE activity_submission_answer answer SET
           status = 'teacher_reviewed', points_awarded = item.points_awarded,
           teacher_comment = item.comment, review_reason = NULL
         FROM jsonb_to_recordset($3::jsonb) AS item(
           answer_id uuid, points_awarded numeric, comment text
         )
         WHERE answer.id = item.answer_id AND answer.submission_id = $1
         RETURNING answer.id
       ), updated_submission AS (
         UPDATE activity_submission SET correction_status = 'reviewed',
           teacher_comment = $4, grade = NULL, approved_at = NULL
         WHERE id = $1 AND (SELECT count(*) FROM updated_answers) = $5
         RETURNING id
       ), next_version AS (
         SELECT coalesce(max(version), 0) + 1 AS value
         FROM activity_correction_history WHERE submission_id = $1
       )
       INSERT INTO activity_correction_history
         (submission_id, version, action, origin, comment, snapshot, professor_id)
       SELECT updated_submission.id, next_version.value, 'teacher_revision',
              'teacher', $4, $6::jsonb, $2
       FROM updated_submission CROSS JOIN next_version RETURNING id`,
      [
        submissionId,
        professorId,
        JSON.stringify(
          review.answers.map((answer) => ({
            answer_id: answer.answerId,
            points_awarded: answer.pointsAwarded,
            comment: answer.comment,
          })),
        ),
        review.teacherComment,
        current.rows.length,
        JSON.stringify(review),
      ],
    )) as QueryResult<{ id: string }>;
    return result.rows[0] ? "reviewed" : "locked";
  }

  async approve(
    professorId: string,
    submissionId: string,
  ): Promise<"approved" | "not_found" | "review_required" | "locked"> {
    const result = (await this.database.query(
      `WITH totals AS (
         SELECT submission.id,
                round((sum(answer.points_awarded) / sum(question.points) * 10)::numeric, 2) AS grade,
                jsonb_agg(jsonb_build_object(
                  'answerId', answer.id, 'pointsAwarded', answer.points_awarded,
                  'pointsPossible', question.points, 'comment', answer.teacher_comment
                ) ORDER BY question.position) AS snapshot
         FROM activity_submission submission
         JOIN activity ON activity.id = submission.activity_id
           AND activity.professor_id = $1
         JOIN activity_submission_answer answer ON answer.submission_id = submission.id
         JOIN activity_question question ON question.id = answer.question_id
         WHERE submission.id = $2
           AND (
             submission.correction_status = 'reviewed'
             OR (
               submission.correction_status = 'pending'
               AND submission.status = 'objective_graded'
               AND NOT EXISTS (
                 SELECT 1 FROM activity_question discursive_question
                 WHERE discursive_question.activity_id = activity.id
                   AND discursive_question.kind = 'discursive'
               )
             )
           )
           AND NOT EXISTS (
             SELECT 1 FROM activity_submission_answer pending
             JOIN activity_question pending_question ON pending_question.id = pending.question_id
             WHERE pending.submission_id = submission.id
               AND pending_question.kind = 'discursive'
               AND pending.status <> 'teacher_reviewed'
           )
           AND NOT EXISTS (
             SELECT 1 FROM activity_submission_answer unresolved
             WHERE unresolved.submission_id = submission.id
               AND unresolved.points_awarded IS NULL
           )
         GROUP BY submission.id
       ), approved AS (
         UPDATE activity_submission submission SET correction_status = 'approved',
           grade = totals.grade, approved_at = now()
         FROM totals WHERE submission.id = totals.id
         RETURNING submission.id, submission.grade, totals.snapshot
       ), next_version AS (
         SELECT coalesce(max(version), 0) + 1 AS value
         FROM activity_correction_history WHERE submission_id = $2
       )
       INSERT INTO activity_correction_history
         (submission_id, version, action, origin, grade, comment,
          snapshot, professor_id)
       SELECT approved.id, next_version.value, 'approval', 'teacher',
              approved.grade, submission.teacher_comment, approved.snapshot, $1
       FROM approved
       JOIN activity_submission submission ON submission.id = approved.id
       CROSS JOIN next_version RETURNING id`,
      [professorId, submissionId],
    )) as QueryResult<{ id: string }>;
    if (result.rows[0]) return "approved";
    const state = (await this.database.query(
      `SELECT submission.correction_status
       FROM activity_submission submission
       JOIN activity ON activity.id = submission.activity_id
       WHERE submission.id = $1 AND activity.professor_id = $2`,
      [submissionId, professorId],
    )) as QueryResult<{ correction_status: string }>;
    if (!state.rows[0]) return "not_found";
    if (["reviewed", "pending"].includes(state.rows[0].correction_status))
      return "review_required";
    if (["approved", "released"].includes(state.rows[0].correction_status))
      return "locked";
    return "review_required";
  }

  async getReleaseContext(
    professorId: string,
    submissionId: string,
  ): Promise<ClassroomReleaseContext | null> {
    const result = (await this.database.query(
      `SELECT submission.id, submission.correction_status, student.google_subject,
              destination.google_classroom_id, destination.google_course_work_id,
              round((submission.grade / 10 * sum(question.points))::numeric, 2)
                AS grade_points
       FROM activity_submission submission
       JOIN activity ON activity.id = submission.activity_id
         AND activity.professor_id = $1
       JOIN activity_question question ON question.activity_id = activity.id
       LEFT JOIN student ON student.id = submission.student_id
       LEFT JOIN enrollment ON enrollment.student_id = student.id
       LEFT JOIN activity_classroom_distribution destination
         ON destination.activity_id = activity.id
         AND destination.class_group_id = enrollment.class_group_id
       WHERE submission.id = $2
       GROUP BY submission.id, student.google_subject,
                destination.google_classroom_id, destination.google_course_work_id
       ORDER BY destination.google_course_work_id NULLS LAST
       LIMIT 1`,
      [professorId, submissionId],
    )) as QueryResult<{
      id: string;
      correction_status: string;
      google_subject: string | null;
      google_classroom_id: string | null;
      google_course_work_id: string | null;
      grade_points: string | number | null;
    }>;
    const row = result.rows[0];
    if (!row) return null;
    return {
      submissionId: row.id,
      correctionStatus: row.correction_status,
      googleCourseId: row.google_classroom_id,
      googleCourseWorkId: row.google_course_work_id,
      googleUserId: row.google_subject,
      gradePoints: Number(row.grade_points ?? 0),
    };
  }

  async markReleased(
    professorId: string,
    submissionId: string,
    classroomStatus: "not_available" | "returned",
  ): Promise<boolean> {
    const result = (await this.database.query(
      `WITH released AS (
         UPDATE activity_submission submission SET correction_status = 'released',
           released_at = now(), classroom_return_status = $3,
           classroom_return_error_code = NULL
         FROM activity WHERE submission.activity_id = activity.id
           AND submission.id = $2 AND activity.professor_id = $1
           AND submission.correction_status = 'approved'
         RETURNING submission.id, submission.grade
       ), next_version AS (
         SELECT coalesce(max(version), 0) + 1 AS value
         FROM activity_correction_history WHERE submission_id = $2
       )
       INSERT INTO activity_correction_history
         (submission_id, version, action, origin, grade, snapshot, professor_id)
       SELECT released.id, next_version.value, 'release', 'system', released.grade,
              jsonb_build_object('classroomStatus', $3), $1
       FROM released CROSS JOIN next_version RETURNING id`,
      [professorId, submissionId, classroomStatus],
    )) as QueryResult<{ id: string }>;
    return Boolean(result.rows[0]);
  }

  async markReleaseFailure(
    professorId: string,
    submissionId: string,
    errorCode: string,
  ): Promise<void> {
    await this.database.query(
      `WITH failed AS (
         UPDATE activity_submission submission SET classroom_return_status = 'failed',
           classroom_return_error_code = $3
         FROM activity WHERE submission.activity_id = activity.id
           AND submission.id = $2 AND activity.professor_id = $1
           AND submission.correction_status = 'approved'
         RETURNING submission.id, submission.grade
       ), next_version AS (
         SELECT coalesce(max(version), 0) + 1 AS value
         FROM activity_correction_history WHERE submission_id = $2
       )
       INSERT INTO activity_correction_history
         (submission_id, version, action, origin, grade, error_code, snapshot)
       SELECT failed.id, next_version.value, 'release_failure', 'system',
              failed.grade, $3, jsonb_build_object('errorCode', $3)
       FROM failed CROSS JOIN next_version`,
      [professorId, submissionId, errorCode],
    );
  }
}
