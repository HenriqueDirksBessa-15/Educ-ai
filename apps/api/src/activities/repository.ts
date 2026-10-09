import {
  activityInputSchema,
  type Activity,
  type ActivityInput,
  type ActivityStatus,
  type ActivityUpdate,
} from "@educai/contracts";

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

export type ActivityMutationResult = "updated" | "not_found" | "locked";

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
}
