import {
  activityInputSchema,
  type Activity,
  type ActivityGeneration,
  type ActivityInput,
  type ActivityPublication,
  type ActivityReview,
  type ActivityStatus,
  type ActivityUpdate,
} from "@educai/contracts";

import type {
  ActivityGenerationResult,
  ActivityPromptContext,
} from "../openai/adapter.js";

import type { DatabaseClient } from "../database.js";

type QueryResult<Row> = { rows: Row[]; rowCount?: number | null };
type ActivityRow = {
  id: string;
  professor_id: string;
  lesson_plan_id: string;
  lesson_plan_title: string;
  title: string;
  description: string;
  type: Activity["type"];
  difficulty: Activity["difficulty"];
  due_at: Date;
  late_mode: Activity["latePolicy"]["mode"];
  late_penalty_percent: number | null;
  status: ActivityStatus;
  questions: Activity["questions"] | null;
  total_points: string | number;
  response_count: string | number;
  published_at: Date | null;
  finished_at: Date | null;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
};
type GenerationRow = {
  id: string;
  activity_id: string;
  version: number;
  model: string;
  origin: ActivityGeneration["origin"];
  status: ActivityGeneration["status"];
  review_status: ActivityGeneration["reviewStatus"];
  suggestion: ActivityGeneration["suggestion"];
  error_code: string | null;
  reviewed_at: Date | null;
  approved_at: Date | null;
  created_at: Date;
};
type PublicationRow = {
  activity_id: string;
  status: ActivityPublication["status"];
  google_form_id: string | null;
  responder_uri: string | null;
  error_code: string | null;
  attempt_count: number;
  collection_scheduled_at: Date | null;
  last_synced_at: Date | null;
};
type DistributionRow = {
  class_group_id: string;
  class_name: string;
  google_classroom_id: string | null;
  google_course_work_id: string | null;
  alternate_link: string | null;
  status: ActivityPublication["distributions"][number]["status"];
  error_code: string | null;
  attempt_count: number;
};

export type ActivityMutationResult = "updated" | "not_found" | "locked";
export type ActivityReviewResult =
  | "reviewed"
  | "not_found"
  | "locked"
  | "generation_not_found";

export class ActivitiesRepository {
  constructor(private readonly database: DatabaseClient) {}

  async list(
    professorId: string,
    status?: ActivityStatus,
    archived = false,
  ): Promise<Activity[]> {
    const result = (await this.database.query(this.activityQuery(), [
      professorId,
      status ?? null,
      archived,
    ])) as QueryResult<ActivityRow>;
    return result.rows.map((row) => this.toActivity(row));
  }

  async get(professorId: string, activityId: string): Promise<Activity | null> {
    const result = (await this.database.query(this.activityQuery(true), [
      professorId,
      activityId,
    ])) as QueryResult<ActivityRow>;
    return result.rows[0] ? this.toActivity(result.rows[0]) : null;
  }

  async create(professorId: string, input: ActivityInput): Promise<string> {
    await this.assertPlan(professorId, input.lessonPlanId);
    const result = (await this.database.query(
      this.aggregateMutationSql(false),
      [
        professorId,
        input.lessonPlanId,
        input.title,
        input.description,
        input.type,
        input.difficulty,
        input.dueAt,
        input.latePolicy.mode,
        input.latePolicy.mode === "allowed_with_penalty"
          ? input.latePolicy.penaltyPercent
          : null,
        JSON.stringify(input.questions),
      ],
    )) as QueryResult<{ id: string }>;
    return result.rows[0]!.id;
  }

  async update(
    professorId: string,
    activityId: string,
    input: ActivityUpdate,
  ): Promise<ActivityMutationResult> {
    const current = await this.get(professorId, activityId);
    if (!current) return "not_found";
    if (current.status !== "draft" || current.archivedAt) return "locked";
    const merged: ActivityInput = {
      lessonPlanId: current.lessonPlanId,
      title: input.title ?? current.title,
      description: input.description ?? current.description,
      type: input.type ?? current.type,
      difficulty: input.difficulty ?? current.difficulty,
      dueAt: input.dueAt ?? current.dueAt,
      latePolicy: input.latePolicy ?? current.latePolicy,
      questions:
        input.questions ??
        current.questions.map((question) =>
          question.kind === "objective"
            ? {
                kind: question.kind,
                prompt: question.prompt,
                points: question.points,
                alternatives: question.alternatives,
                correctAlternativeIndex: question.correctAlternativeIndex,
              }
            : {
                kind: question.kind,
                prompt: question.prompt,
                points: question.points,
                targetAnswer: question.targetAnswer,
                criteria: question.criteria,
              },
        ),
    };
    if (!activityInputSchema.safeParse(merged).success)
      throw new Error("INVALID_ACTIVITY");
    const result = (await this.database.query(this.aggregateMutationSql(true), [
      activityId,
      professorId,
      merged.title,
      merged.description,
      merged.type,
      merged.difficulty,
      merged.dueAt,
      merged.latePolicy.mode,
      merged.latePolicy.mode === "allowed_with_penalty"
        ? merged.latePolicy.penaltyPercent
        : null,
      JSON.stringify(merged.questions),
    ])) as QueryResult<{ id: string }>;
    return result.rows[0] ? "updated" : "locked";
  }

  async publish(
    professorId: string,
    activityId: string,
  ): Promise<"published" | "not_found" | "locked"> {
    const result = (await this.database.query(
      `WITH published AS (
         UPDATE activity SET status = 'published', published_at = now()
         WHERE id = $1 AND professor_id = $2 AND status = 'draft'
           AND archived_at IS NULL
           AND EXISTS (SELECT 1 FROM activity_question WHERE activity_id = activity.id)
           AND (
             NOT EXISTS (SELECT 1 FROM activity_generation
               WHERE activity_id = activity.id AND status = 'succeeded')
             OR EXISTS (SELECT 1 FROM activity_generation
               WHERE activity_id = activity.id AND status = 'succeeded'
                 AND review_status = 'approved')
           )
           AND NOT EXISTS (
             SELECT 1 FROM activity_question question
             WHERE question.activity_id = activity.id
               AND question.kind = 'objective'
               AND (
                 (SELECT count(*) FROM activity_alternative alternative
                  WHERE alternative.question_id = question.id) < 2
                 OR question.correct_alternative_index >=
                   (SELECT count(*) FROM activity_alternative alternative
                    WHERE alternative.question_id = question.id)
               )
           )
           AND (
             (activity.type = 'objective' AND NOT EXISTS (
               SELECT 1 FROM activity_question
               WHERE activity_id = activity.id AND kind <> 'objective'
             ))
             OR
             (activity.type = 'discursive' AND NOT EXISTS (
               SELECT 1 FROM activity_question
               WHERE activity_id = activity.id AND kind <> 'discursive'
             ))
             OR
             (activity.type = 'mixed'
               AND EXISTS (SELECT 1 FROM activity_question
                 WHERE activity_id = activity.id AND kind = 'objective')
               AND EXISTS (SELECT 1 FROM activity_question
                 WHERE activity_id = activity.id AND kind = 'discursive'))
           )
         RETURNING id, lesson_plan_id
       ), linked AS (
         INSERT INTO published_lesson_plan_link (lesson_plan_id)
         SELECT lesson_plan_id FROM published
         ON CONFLICT (lesson_plan_id) DO NOTHING
       )
       SELECT id FROM published`,
      [activityId, professorId],
    )) as QueryResult<{ id: string }>;
    if (result.rows[0]) return "published";
    const current = await this.get(professorId, activityId);
    return current ? "locked" : "not_found";
  }

  async finish(
    professorId: string,
    activityId: string,
  ): Promise<"finished" | "not_found" | "locked"> {
    const result = (await this.database.query(
      `UPDATE activity SET status = 'finished', finished_at = now()
       WHERE id = $1 AND professor_id = $2 AND status = 'published'
         AND archived_at IS NULL RETURNING id`,
      [activityId, professorId],
    )) as QueryResult<{ id: string }>;
    if (result.rows[0]) return "finished";
    const current = await this.get(professorId, activityId);
    return current ? "locked" : "not_found";
  }

  async archive(professorId: string, activityId: string): Promise<boolean> {
    const result = (await this.database.query(
      `UPDATE activity SET archived_at = COALESCE(archived_at, now())
       WHERE id = $1 AND professor_id = $2 RETURNING id`,
      [activityId, professorId],
    )) as QueryResult<{ id: string }>;
    return Boolean(result.rows[0]);
  }

  async latestGeneration(
    professorId: string,
    activityId: string,
  ): Promise<ActivityGeneration | null> {
    const result = (await this.database.query(
      `SELECT generation.id, generation.activity_id, generation.version,
       generation.model, generation.origin, generation.status,
       generation.review_status, generation.suggestion, generation.error_code,
       generation.reviewed_at, generation.approved_at, generation.created_at
       FROM activity_generation generation
       JOIN activity ON activity.id = generation.activity_id
       WHERE generation.activity_id = $1 AND activity.professor_id = $2
       ORDER BY generation.version DESC LIMIT 1`,
      [activityId, professorId],
    )) as QueryResult<GenerationRow>;
    return result.rows[0] ? this.toGeneration(result.rows[0]) : null;
  }

  async recordGenerationSuccess(
    professorId: string,
    activityId: string,
    context: ActivityPromptContext,
    result: ActivityGenerationResult,
  ): Promise<ActivityGeneration | null> {
    const inserted = (await this.database.query(
      `WITH owned AS MATERIALIZED (
         SELECT id FROM activity
         WHERE id = $1 AND professor_id = $2 AND status = 'draft'
           AND archived_at IS NULL FOR UPDATE
       ), next_version AS (
         SELECT COALESCE(MAX(version), 0) + 1 AS version
         FROM owned LEFT JOIN activity_generation ON activity_generation.activity_id = owned.id
       )
       INSERT INTO activity_generation
         (activity_id, version, model, origin, status, review_status,
          prompt_context, suggestion)
       SELECT owned.id, next_version.version, $3, $4, 'succeeded', 'generated',
         $5::jsonb, $6::jsonb
       FROM owned CROSS JOIN next_version
       RETURNING id, activity_id, version, model, origin, status, review_status,
         suggestion, error_code, reviewed_at, approved_at, created_at`,
      [
        activityId,
        professorId,
        result.model,
        result.origin,
        JSON.stringify(context),
        JSON.stringify(result.suggestion),
      ],
    )) as QueryResult<GenerationRow>;
    return inserted.rows[0] ? this.toGeneration(inserted.rows[0]) : null;
  }

  async recordGenerationFailure(
    professorId: string,
    activityId: string,
    context: ActivityPromptContext,
    model: string,
    origin: ActivityGeneration["origin"],
    errorCode: string,
  ): Promise<boolean> {
    const inserted = (await this.database.query(
      `WITH owned AS MATERIALIZED (
         SELECT id FROM activity
         WHERE id = $1 AND professor_id = $2 AND status = 'draft'
           AND archived_at IS NULL FOR UPDATE
       ), next_version AS (
         SELECT COALESCE(MAX(version), 0) + 1 AS version
         FROM owned LEFT JOIN activity_generation ON activity_generation.activity_id = owned.id
       )
       INSERT INTO activity_generation
         (activity_id, version, model, origin, status, prompt_context, error_code)
       SELECT owned.id, next_version.version, $3, $4, 'failed', $5::jsonb, $6
       FROM owned CROSS JOIN next_version RETURNING id`,
      [
        activityId,
        professorId,
        model,
        origin,
        JSON.stringify(context),
        errorCode,
      ],
    )) as QueryResult<{ id: string }>;
    return Boolean(inserted.rows[0]);
  }

  async reviewGeneration(
    professorId: string,
    activityId: string,
    review: ActivityReview,
  ): Promise<ActivityReviewResult> {
    const generation = (await this.database.query(
      `SELECT generation.id FROM activity_generation generation
       JOIN activity ON activity.id = generation.activity_id
       WHERE generation.id = $1 AND generation.activity_id = $2
         AND activity.professor_id = $3 AND activity.status = 'draft'
         AND activity.archived_at IS NULL AND generation.status = 'succeeded'`,
      [review.generationId, activityId, professorId],
    )) as QueryResult<{ id: string }>;
    if (!generation.rows[0]) {
      const activity = await this.get(professorId, activityId);
      if (!activity) return "not_found";
      if (activity.status !== "draft" || activity.archivedAt) return "locked";
      return "generation_not_found";
    }
    const updated = await this.update(professorId, activityId, {
      title: review.suggestion.title,
      description: review.suggestion.description,
      type: review.suggestion.type,
      difficulty: review.suggestion.difficulty,
      questions: review.suggestion.questions,
    });
    if (updated !== "updated") return updated;
    const reviewed = (await this.database.query(
      `UPDATE activity_generation SET review_status = 'reviewed',
       reviewed_suggestion = $4::jsonb, reviewed_at = now(), approved_at = NULL
       WHERE id = $1 AND activity_id = $2
         AND EXISTS (SELECT 1 FROM activity
           WHERE id = $2 AND professor_id = $3 AND status = 'draft')
       RETURNING id`,
      [
        review.generationId,
        activityId,
        professorId,
        JSON.stringify(review.suggestion),
      ],
    )) as QueryResult<{ id: string }>;
    return reviewed.rows[0] ? "reviewed" : "generation_not_found";
  }

  async approveGeneration(
    professorId: string,
    activityId: string,
    generationId: string,
  ): Promise<"approved" | "not_found" | "review_required"> {
    const approved = (await this.database.query(
      `UPDATE activity_generation generation SET review_status = 'approved',
       approved_at = now()
       FROM activity
       WHERE generation.id = $1 AND generation.activity_id = $2
         AND activity.id = generation.activity_id AND activity.professor_id = $3
         AND activity.status = 'draft' AND activity.archived_at IS NULL
         AND generation.status = 'succeeded'
         AND generation.review_status = 'reviewed'
       RETURNING generation.id`,
      [generationId, activityId, professorId],
    )) as QueryResult<{ id: string }>;
    if (approved.rows[0]) return "approved";
    const activity = await this.get(professorId, activityId);
    return activity ? "review_required" : "not_found";
  }

  async preparePublication(
    professorId: string,
    activityId: string,
  ): Promise<"ready" | "not_found" | "locked"> {
    const eligible = (await this.database.query(
      `SELECT activity.id,
         (SELECT generation.id FROM activity_generation generation
          WHERE generation.activity_id = activity.id
            AND generation.status = 'succeeded'
            AND generation.review_status = 'approved'
          ORDER BY generation.version DESC LIMIT 1) AS generation_id,
         EXISTS (SELECT 1 FROM activity_generation generation
          WHERE generation.activity_id = activity.id
            AND generation.status = 'succeeded') AS has_generation
       FROM activity
       WHERE activity.id = $1 AND activity.professor_id = $2
         AND activity.status = 'draft' AND activity.archived_at IS NULL`,
      [activityId, professorId],
    )) as QueryResult<{
      id: string;
      generation_id: string | null;
      has_generation: boolean;
    }>;
    const row = eligible.rows[0];
    if (!row) {
      const current = await this.get(professorId, activityId);
      return current ? "locked" : "not_found";
    }
    if (row.has_generation && !row.generation_id) return "locked";
    await this.database.query(
      `INSERT INTO activity_publication (activity_id, generation_id)
       VALUES ($1, $2)
       ON CONFLICT (activity_id) DO UPDATE SET
         generation_id = COALESCE(activity_publication.generation_id, EXCLUDED.generation_id)`,
      [activityId, row.generation_id],
    );
    await this.database.query(
      `INSERT INTO activity_classroom_distribution
         (activity_id, class_group_id, google_classroom_id)
       SELECT $1, class_group.id, class_group.google_classroom_id
       FROM activity
       JOIN lesson_plan_class ON lesson_plan_class.lesson_plan_id = activity.lesson_plan_id
       JOIN class_group ON class_group.id = lesson_plan_class.class_group_id
       WHERE activity.id = $1 AND activity.professor_id = $2
       ON CONFLICT (activity_id, class_group_id) DO UPDATE SET
         google_classroom_id = EXCLUDED.google_classroom_id`,
      [activityId, professorId],
    );
    return "ready";
  }

  async getPublication(
    professorId: string,
    activityId: string,
  ): Promise<ActivityPublication | null> {
    const publication = (await this.database.query(
      `SELECT publication.activity_id, publication.status,
       publication.google_form_id, publication.responder_uri,
       publication.error_code, publication.attempt_count,
       collection.scheduled_at AS collection_scheduled_at,
       publication.last_synced_at
       FROM activity_publication publication
       JOIN activity ON activity.id = publication.activity_id
       LEFT JOIN activity_collection_job collection
         ON collection.activity_id = publication.activity_id
       WHERE publication.activity_id = $1 AND activity.professor_id = $2`,
      [activityId, professorId],
    )) as QueryResult<PublicationRow>;
    const row = publication.rows[0];
    if (!row) return null;
    const distributions = (await this.database.query(
      `SELECT distribution.class_group_id, class_group.name AS class_name,
       distribution.google_classroom_id, distribution.google_course_work_id,
       distribution.alternate_link, distribution.status,
       distribution.error_code, distribution.attempt_count
       FROM activity_classroom_distribution distribution
       JOIN class_group ON class_group.id = distribution.class_group_id
       JOIN activity ON activity.id = distribution.activity_id
       WHERE distribution.activity_id = $1 AND activity.professor_id = $2
       ORDER BY class_group.name`,
      [activityId, professorId],
    )) as QueryResult<DistributionRow>;
    return {
      activityId: row.activity_id,
      status: row.status,
      googleFormId: row.google_form_id,
      responderUri: row.responder_uri,
      errorCode: row.error_code,
      attemptCount: row.attempt_count,
      collectionScheduledAt: row.collection_scheduled_at?.toISOString() ?? null,
      lastSyncedAt: row.last_synced_at?.toISOString() ?? null,
      distributions: distributions.rows.map((distribution) => ({
        classId: distribution.class_group_id,
        className: distribution.class_name,
        googleClassroomId: distribution.google_classroom_id,
        googleCourseWorkId: distribution.google_course_work_id,
        alternateLink: distribution.alternate_link,
        status: distribution.status,
        errorCode: distribution.error_code,
        attemptCount: distribution.attempt_count,
      })),
    };
  }

  async markPublicationAttempt(
    professorId: string,
    activityId: string,
    status: "creating_form" | "distributing",
  ): Promise<boolean> {
    const result = (await this.database.query(
      `UPDATE activity_publication publication SET status = $3,
       error_code = NULL, attempt_count = attempt_count + 1
       FROM activity WHERE publication.activity_id = $1
         AND activity.id = publication.activity_id AND activity.professor_id = $2
       RETURNING publication.activity_id`,
      [activityId, professorId, status],
    )) as QueryResult<{ activity_id: string }>;
    return Boolean(result.rows[0]);
  }

  async savePublishedForm(
    professorId: string,
    activityId: string,
    formId: string,
    responderUri: string,
  ): Promise<void> {
    await this.database.query(
      `UPDATE activity_publication publication
       SET google_form_id = $3, responder_uri = $4, status = 'distributing',
         error_code = NULL, last_synced_at = now()
       FROM activity WHERE publication.activity_id = $1
         AND activity.id = publication.activity_id AND activity.professor_id = $2`,
      [activityId, professorId, formId, responderUri],
    );
  }

  async markPublicationFailure(
    professorId: string,
    activityId: string,
    errorCode: string,
    reconciliationRequired = false,
  ): Promise<void> {
    await this.database.query(
      `UPDATE activity_publication publication
       SET status = $4, error_code = $3
       FROM activity WHERE publication.activity_id = $1
         AND activity.id = publication.activity_id AND activity.professor_id = $2`,
      [
        activityId,
        professorId,
        errorCode,
        reconciliationRequired ? "reconciliation_required" : "failed",
      ],
    );
  }

  async saveDistribution(
    professorId: string,
    activityId: string,
    classId: string,
    courseWorkId: string,
    alternateLink: string,
  ): Promise<void> {
    await this.database.query(
      `UPDATE activity_classroom_distribution distribution
       SET google_course_work_id = $4, alternate_link = $5,
         status = 'published', error_code = NULL, published_at = now(),
         attempt_count = attempt_count + 1
       FROM activity WHERE distribution.activity_id = $1
         AND distribution.class_group_id = $3
         AND activity.id = distribution.activity_id AND activity.professor_id = $2`,
      [activityId, professorId, classId, courseWorkId, alternateLink],
    );
  }

  async markDistributionFailure(
    professorId: string,
    activityId: string,
    classId: string,
    errorCode: string,
  ): Promise<void> {
    await this.database.query(
      `UPDATE activity_classroom_distribution distribution
       SET status = 'failed', error_code = $4,
         attempt_count = attempt_count + 1
       FROM activity WHERE distribution.activity_id = $1
         AND distribution.class_group_id = $3
         AND activity.id = distribution.activity_id AND activity.professor_id = $2`,
      [activityId, professorId, classId, errorCode],
    );
  }

  async completeExternalPublication(
    professorId: string,
    activityId: string,
  ): Promise<boolean> {
    const result = (await this.database.query(
      `WITH completed AS (
         UPDATE activity_publication publication
         SET status = 'published', error_code = NULL, last_synced_at = now()
         FROM activity
         WHERE publication.activity_id = $1
           AND activity.id = publication.activity_id
           AND activity.professor_id = $2 AND activity.status = 'draft'
           AND publication.google_form_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM activity_classroom_distribution distribution
             WHERE distribution.activity_id = publication.activity_id
               AND distribution.status <> 'published'
           )
         RETURNING publication.activity_id, activity.lesson_plan_id, activity.due_at
       ), published AS (
         UPDATE activity SET status = 'published', published_at = now()
         WHERE id IN (SELECT activity_id FROM completed)
         RETURNING id, lesson_plan_id, due_at
       ), linked AS (
         INSERT INTO published_lesson_plan_link (lesson_plan_id)
         SELECT lesson_plan_id FROM published ON CONFLICT DO NOTHING
       ), scheduled AS (
         INSERT INTO activity_collection_job (activity_id, scheduled_at)
         SELECT id, due_at FROM published
         ON CONFLICT (activity_id) DO NOTHING
       )
       SELECT id FROM published`,
      [activityId, professorId],
    )) as QueryResult<{ id: string }>;
    return Boolean(result.rows[0]);
  }

  private async assertPlan(professorId: string, planId: string): Promise<void> {
    const result = (await this.database.query(
      `SELECT id FROM lesson_plan
       WHERE id = $1 AND professor_id = $2 AND archived_at IS NULL`,
      [planId, professorId],
    )) as QueryResult<{ id: string }>;
    if (!result.rows[0]) throw new Error("LESSON_PLAN_NOT_FOUND");
  }

  private aggregateMutationSql(update: boolean): string {
    const activityMutation = update
      ? `UPDATE activity SET title = $3, description = $4, type = $5,
           difficulty = $6, due_at = $7, late_mode = $8, late_penalty_percent = $9
         WHERE id = $1 AND professor_id = $2 AND status = 'draft'
           AND archived_at IS NULL RETURNING id`
      : `INSERT INTO activity
           (professor_id, lesson_plan_id, title, description, type, difficulty,
            due_at, late_mode, late_penalty_percent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`;
    return `WITH mutated AS (${activityMutation}),
      invalidated_approval AS (
        UPDATE activity_generation SET review_status = 'generated',
          reviewed_suggestion = NULL, reviewed_at = NULL, approved_at = NULL
        WHERE activity_id IN (SELECT id FROM mutated)
          AND review_status IN ('reviewed', 'approved')
        RETURNING id
      ),
      removed AS (
        DELETE FROM activity_question
        WHERE activity_id IN (SELECT id FROM mutated) RETURNING id
      ),
      question_input AS (
        SELECT value AS question, ordinality - 1 AS position
        FROM jsonb_array_elements($10::jsonb) WITH ORDINALITY
      ),
      inserted_questions AS (
        INSERT INTO activity_question
          (activity_id, position, kind, prompt, points, target_answer, criteria,
           correct_alternative_index)
        SELECT mutated.id, question_input.position,
          (question->>'kind')::activity_question_kind,
          question->>'prompt', (question->>'points')::numeric,
          question->>'targetAnswer', question->>'criteria',
          (question->>'correctAlternativeIndex')::smallint
        FROM mutated CROSS JOIN question_input
        LEFT JOIN (SELECT count(*) FROM removed) removal_barrier ON true
        LEFT JOIN (SELECT count(*) FROM invalidated_approval) approval_barrier ON true
        RETURNING id, activity_id, position
      ),
      inserted_alternatives AS (
        INSERT INTO activity_alternative (question_id, position, text)
        SELECT inserted_questions.id, alternative.ordinality - 1,
          alternative.value
        FROM inserted_questions
        JOIN question_input USING (position)
        CROSS JOIN LATERAL jsonb_array_elements_text(
          COALESCE(question_input.question->'alternatives', '[]'::jsonb)
        ) WITH ORDINALITY AS alternative(value, ordinality)
      )
      SELECT id FROM mutated`;
  }

  private activityQuery(byId = false): string {
    return `SELECT activity.id, activity.professor_id, activity.lesson_plan_id,
      lesson_plan.title AS lesson_plan_title, activity.title,
      activity.description, activity.type, activity.difficulty, activity.due_at,
      activity.late_mode, activity.late_penalty_percent, activity.status,
      activity.published_at, activity.finished_at, activity.archived_at,
      activity.created_at, activity.updated_at,
      COALESCE(response_counts.total, 0) AS response_count,
      COALESCE(question_data.total_points, 0) AS total_points,
      COALESCE(question_data.questions, '[]'::jsonb) AS questions
      FROM activity
      JOIN lesson_plan ON lesson_plan.id = activity.lesson_plan_id
      LEFT JOIN LATERAL (
        SELECT SUM(question.points) AS total_points,
          jsonb_agg(
            jsonb_build_object(
              'id', question.id, 'position', question.position,
              'kind', question.kind, 'prompt', question.prompt,
              'points', question.points, 'targetAnswer', question.target_answer,
              'criteria', question.criteria,
              'correctAlternativeIndex', question.correct_alternative_index,
              'alternatives', COALESCE(alternatives.items, '[]'::jsonb)
            ) ORDER BY question.position
          ) AS questions
        FROM activity_question question
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(alternative.text ORDER BY alternative.position) AS items
          FROM activity_alternative alternative
          WHERE alternative.question_id = question.id
        ) alternatives ON true
        WHERE question.activity_id = activity.id
      ) question_data ON true
      LEFT JOIN LATERAL (
        SELECT count(*) AS total FROM activity_response response
        WHERE response.activity_id = activity.id
      ) response_counts ON true
      WHERE activity.professor_id = $1 AND ${
        byId
          ? "activity.id = $2"
          : "($2::activity_status IS NULL OR activity.status = $2) AND $3::boolean = (activity.archived_at IS NOT NULL)"
      }
      ORDER BY activity.updated_at DESC`;
  }

  private toActivity(row: ActivityRow): Activity {
    return {
      id: row.id,
      professorId: row.professor_id,
      lessonPlanId: row.lesson_plan_id,
      lessonPlanTitle: row.lesson_plan_title,
      title: row.title,
      description: row.description,
      type: row.type,
      difficulty: row.difficulty,
      dueAt: row.due_at.toISOString(),
      latePolicy:
        row.late_mode === "blocked"
          ? { mode: "blocked" }
          : {
              mode: "allowed_with_penalty",
              penaltyPercent: row.late_penalty_percent ?? 0,
            },
      status: row.status,
      questions: row.questions ?? [],
      totalPoints: Number(row.total_points),
      responseCount: Number(row.response_count),
      publishedAt: row.published_at?.toISOString() ?? null,
      finishedAt: row.finished_at?.toISOString() ?? null,
      archivedAt: row.archived_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private toGeneration(row: GenerationRow): ActivityGeneration {
    return {
      id: row.id,
      activityId: row.activity_id,
      version: row.version,
      model: row.model,
      origin: row.origin,
      status: row.status,
      reviewStatus: row.review_status,
      suggestion: row.suggestion,
      errorCode: row.error_code,
      reviewedAt: row.reviewed_at?.toISOString() ?? null,
      approvedAt: row.approved_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
    };
  }
}
