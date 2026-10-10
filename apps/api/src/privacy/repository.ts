import type { DatabaseClient } from "../database.js";

type QueryResult<Row> = { rows: Row[]; rowCount?: number | null };

export class PrivacyRepository {
  constructor(private readonly database: DatabaseClient) {}

  async exportProfessorData(
    professorId: string,
  ): Promise<Record<string, unknown> | null> {
    const result = (await this.database.query(
      `SELECT jsonb_build_object(
        'exportedAt', now(),
        'profile', jsonb_build_object(
          'id', professor.id, 'displayName', professor.display_name,
          'email', professor.email::text,
          'notificationPreference', professor.notification_preference,
          'createdAt', professor.created_at
        ),
        'classes', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'id', class_group.id, 'name', class_group.name,
          'schoolYear', class_group.school_year, 'origin', class_group.origin)
          ORDER BY class_group.created_at)
          FROM class_group WHERE class_group.professor_id = professor.id), '[]'::jsonb),
        'lessonPlans', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'id', lesson_plan.id, 'title', lesson_plan.title,
          'status', lesson_plan.status, 'createdAt', lesson_plan.created_at)
          ORDER BY lesson_plan.created_at)
          FROM lesson_plan WHERE lesson_plan.professor_id = professor.id), '[]'::jsonb),
        'activities', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'id', activity.id, 'title', activity.title,
          'status', activity.status, 'dueAt', activity.due_at)
          ORDER BY activity.created_at)
          FROM activity WHERE activity.professor_id = professor.id), '[]'::jsonb),
        'feedbacks', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'id', feedback.id, 'scope', feedback.scope,
          'title', feedback.title, 'status', feedback.status,
          'createdAt', feedback.created_at)
          ORDER BY feedback.created_at)
          FROM feedback WHERE feedback.professor_id = professor.id), '[]'::jsonb),
        'bulletins', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'id', bulletin.id, 'studentId', bulletin.student_id,
          'periodStart', bulletin.period_start, 'periodEnd', bulletin.period_end,
          'average', bulletin.average, 'status', bulletin.status,
          'generatedAt', bulletin.generated_at)
          ORDER BY bulletin.generated_at)
          FROM bulletin WHERE bulletin.professor_id = professor.id), '[]'::jsonb)
      ) AS export
      FROM professor WHERE professor.id = $1`,
      [professorId],
    )) as QueryResult<{ export: Record<string, unknown> }>;
    if (!result.rows[0]) return null;
    await this.database.query(
      `INSERT INTO privacy_request (professor_id, type, status, completed_at)
       VALUES ($1, 'export', 'completed', now())`,
      [professorId],
    );
    return result.rows[0].export;
  }

  async anonymizeProfessor(professorId: string): Promise<boolean> {
    const result = (await this.database.query(
      `WITH removed_sessions AS (
         DELETE FROM auth_session WHERE professor_id = $1
       ), removed_credentials AS (
         DELETE FROM google_oauth_credential WHERE professor_id = $1
       ), anonymized AS (
         UPDATE professor SET google_subject = NULL,
           email = ('deleted+' || id::text || '@example.invalid')::citext,
           display_name = 'Conta excluída', profile_image_url = NULL,
           notification_preference = 'visual'
         WHERE id = $1 RETURNING id
       )
       INSERT INTO privacy_request (professor_id, type, status, completed_at)
       SELECT anonymized.id, 'deletion', 'completed', now() FROM anonymized
       RETURNING id`,
      [professorId],
    )) as QueryResult<{ id: string }>;
    return Boolean(result.rows[0]);
  }
}
