import type {
  ClassCurriculum,
  ClassCurriculumInput,
  ClassCreate,
  ClassDetail,
  ClassSummary,
  ClassUpdate,
  StudentEnrollmentInput,
} from "@educai/contracts";

import { withTransaction, type DatabaseClient } from "../database.js";
import type {
  ClassroomCourse,
  ClassroomStudent,
} from "../classroom/adapter.js";
import { createHash } from "node:crypto";

type QueryResult<Row> = { rows: Row[]; rowCount?: number | null };
type ClassRow = {
  id: string;
  name: string;
  description: string | null;
  school_year: string;
  local_access_code: string;
  general_notice: string | null;
  origin: ClassSummary["source"];
  sync_status: ClassDetail["syncStatus"];
  last_synced_at: Date | null;
};
type StudentRow = {
  id: string;
  name: string;
  email: string;
  origin: "google" | "spreadsheet" | "access_code";
  status: "active" | "restricted" | "pending";
  is_inconsistent: boolean;
  inconsistency_reason: string | null;
};
type CurriculumRow = {
  education_stage: ClassCurriculum["educationStage"];
  school_year: string;
  curricular_components: string[];
};

export type GoogleCourseContext = {
  id: string;
  name: string;
  description: string | null;
  source: ClassSummary["source"];
  googleClassroomId: string | null;
};

export class ClassesRepository {
  constructor(private readonly database: DatabaseClient) {}

  async list(professorId: string): Promise<ClassSummary[]> {
    const result = (await this.database.query(
      `SELECT id, name, description, school_year, origin
       FROM class_group WHERE professor_id = $1 ORDER BY name, id`,
      [professorId],
    )) as QueryResult<ClassRow>;
    return result.rows.map((row) => this.toSummary(row));
  }

  async getDetail(
    professorId: string,
    classId: string,
    status?: StudentRow["status"],
  ): Promise<ClassDetail | null> {
    const classResult = (await this.database.query(
      `SELECT id, name, description, school_year, local_access_code,
              general_notice, origin, sync_status, last_synced_at
       FROM class_group WHERE id = $1 AND professor_id = $2`,
      [classId, professorId],
    )) as QueryResult<ClassRow>;
    const group = classResult.rows[0];
    if (!group) return null;
    const students = (await this.database.query(
      `SELECT student.id, student.name, student.email::text, student.origin,
              enrollment.status, student.is_inconsistent, student.inconsistency_reason
       FROM enrollment
       JOIN student ON student.id = enrollment.student_id
       WHERE enrollment.class_group_id = $1
         AND ($2::enrollment_status IS NULL OR enrollment.status = $2)
       ORDER BY student.name, student.id`,
      [classId, status ?? null],
    )) as QueryResult<StudentRow>;
    const curriculum = (await this.database.query(
      `SELECT profile.education_stage, profile.school_year,
              array_agg(component.curricular_component ORDER BY component.curricular_component)
                AS curricular_components
       FROM class_curriculum_profile profile
       JOIN class_curriculum_component component
         ON component.class_group_id = profile.class_group_id
       WHERE profile.class_group_id = $1
       GROUP BY profile.class_group_id, profile.education_stage, profile.school_year`,
      [classId],
    )) as QueryResult<CurriculumRow>;
    return {
      ...this.toSummary(group),
      generalNotice: group.general_notice,
      syncStatus: group.sync_status,
      lastSyncedAt: group.last_synced_at?.toISOString() ?? null,
      students: students.rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        origin: row.origin,
        status: row.status,
        isInconsistent: row.is_inconsistent,
        inconsistencyReason: row.inconsistency_reason,
      })),
      curriculum: curriculum.rows[0]
        ? {
            educationStage: curriculum.rows[0].education_stage,
            schoolYear: curriculum.rows[0].school_year,
            curricularComponents: curriculum.rows[0].curricular_components,
          }
        : null,
    };
  }

  async create(professorId: string, input: ClassCreate): Promise<string> {
    const result = (await this.database.query(
      `INSERT INTO class_group (
         professor_id, name, description, school_year, local_access_code,
         general_notice, origin
       ) VALUES ($1, $2, $3, $4, $5, $6, 'local')
       RETURNING id`,
      [
        professorId,
        input.name,
        input.description ?? null,
        input.schoolYear,
        input.localAccessCode,
        input.generalNotice ?? null,
      ],
    )) as QueryResult<{ id: string }>;
    return result.rows[0]!.id;
  }

  async update(
    professorId: string,
    classId: string,
    input: ClassUpdate,
  ): Promise<boolean> {
    const result = (await this.database.query(
      `UPDATE class_group
       SET name = COALESCE($3, name),
           description = COALESCE($4, description),
           school_year = COALESCE($5, school_year),
           general_notice = COALESCE($6, general_notice)
       WHERE id = $1 AND professor_id = $2 AND origin = 'local'
       RETURNING id`,
      [
        classId,
        professorId,
        input.name ?? null,
        input.description ?? null,
        input.schoolYear ?? null,
        input.generalNotice ?? null,
      ],
    )) as QueryResult<{ id: string }>;
    return result.rows.length > 0;
  }

  async remove(professorId: string, classId: string): Promise<boolean> {
    const result = (await this.database.query(
      `DELETE FROM class_group
       WHERE id = $1 AND professor_id = $2 AND origin = 'local'
       RETURNING id`,
      [classId, professorId],
    )) as QueryResult<{ id: string }>;
    return result.rows.length > 0;
  }

  async enrollStudent(
    professorId: string,
    classId: string,
    input: StudentEnrollmentInput,
  ): Promise<void> {
    const ownership = (await this.database.query(
      "SELECT id FROM class_group WHERE id = $1 AND professor_id = $2",
      [classId, professorId],
    )) as QueryResult<{ id: string }>;
    if (!ownership.rows[0]) throw new Error("CLASS_NOT_FOUND");
    const student = (await this.database.query(
      `INSERT INTO student (name, email, origin)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET
         name = CASE
           WHEN EXCLUDED.origin = 'google' THEN EXCLUDED.name
           ELSE student.name
         END,
         origin = CASE
           WHEN EXCLUDED.origin = 'google' OR student.origin = 'google'
             THEN 'google'::record_origin
           ELSE student.origin
         END
       RETURNING id`,
      [input.name, input.email, input.origin],
    )) as QueryResult<{ id: string }>;
    await this.database.query(
      `INSERT INTO enrollment (class_group_id, student_id, status, origin)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (class_group_id, student_id) DO UPDATE SET
         status = EXCLUDED.status,
         origin = CASE WHEN enrollment.origin = 'google' THEN enrollment.origin ELSE EXCLUDED.origin END,
         updated_at = now()`,
      [classId, student.rows[0]!.id, input.status ?? "active", input.origin],
    );
  }

  async syncGoogleCourses(
    professorId: string,
    courses: ClassroomCourse[],
  ): Promise<number> {
    for (const course of courses) {
      const accessCode = `g-${createHash("sha256")
        .update(`${professorId}:${course.googleClassroomId}`)
        .digest("hex")
        .slice(0, 24)}`;
      await this.database.query(
        `INSERT INTO class_group (
           professor_id, google_classroom_id, name, description, school_year,
           local_access_code, origin, sync_status, last_synced_at, sync_error
         ) VALUES ($1, $2, $3, $4, $5, $6, 'google', 'active', now(), NULL)
         ON CONFLICT (professor_id, google_classroom_id) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           school_year = CASE WHEN EXISTS (
             SELECT 1 FROM class_curriculum_profile profile
             WHERE profile.class_group_id = class_group.id
           ) THEN class_group.school_year ELSE EXCLUDED.school_year END,
           sync_status = 'active',
           last_synced_at = now(),
           sync_error = NULL`,
        [
          professorId,
          course.googleClassroomId,
          course.name,
          course.description,
          course.schoolYear,
          accessCode,
        ],
      );
    }
    return courses.length;
  }

  async getGoogleCourseContext(
    professorId: string,
    classId: string,
  ): Promise<GoogleCourseContext | null> {
    const result = (await this.database.query(
      `SELECT id, name, description, origin, google_classroom_id
       FROM class_group WHERE id = $1 AND professor_id = $2`,
      [classId, professorId],
    )) as QueryResult<{
      id: string;
      name: string;
      description: string | null;
      origin: ClassSummary["source"];
      google_classroom_id: string | null;
    }>;
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          name: row.name,
          description: row.description,
          source: row.origin,
          googleClassroomId: row.google_classroom_id,
        }
      : null;
  }

  async linkGoogleCourse(
    professorId: string,
    classId: string,
    googleClassroomId: string,
  ): Promise<boolean> {
    const result = (await this.database.query(
      `UPDATE class_group SET google_classroom_id = $3, origin = 'google',
         sync_status = 'active', last_synced_at = now(), sync_error = NULL
       WHERE id = $1 AND professor_id = $2 AND origin = 'local'
       RETURNING id`,
      [classId, professorId, googleClassroomId],
    )) as QueryResult<{ id: string }>;
    return Boolean(result.rows[0]);
  }

  async getGoogleClassroomId(
    professorId: string,
    classId: string,
  ): Promise<string | null | undefined> {
    const result = (await this.database.query(
      `SELECT google_classroom_id FROM class_group
       WHERE id = $1 AND professor_id = $2`,
      [classId, professorId],
    )) as QueryResult<{ google_classroom_id: string | null }>;
    return result.rows[0]?.google_classroom_id;
  }

  async syncGoogleStudents(
    professorId: string,
    classId: string,
    students: ClassroomStudent[],
  ): Promise<number> {
    const result = (await this.database.query(
      `WITH owned AS (
         SELECT id FROM class_group
         WHERE id = $2 AND professor_id = $1 AND google_classroom_id IS NOT NULL
       ), roster AS (
         SELECT DISTINCT ON (value->>'googleSubject')
           value->>'googleSubject' AS google_subject,
           value->>'name' AS name,
           lower(value->>'email') AS email
         FROM jsonb_array_elements($3::jsonb)
         ORDER BY value->>'googleSubject'
       ), updated AS (
         UPDATE student SET name = roster.name, email = roster.email,
           origin = 'google', google_subject = roster.google_subject,
           is_inconsistent = false, inconsistency_reason = NULL
         FROM roster, owned
         WHERE student.google_subject = roster.google_subject
         RETURNING student.id, student.google_subject
       ), remaining AS (
         SELECT roster.* FROM roster
         WHERE NOT EXISTS (
           SELECT 1 FROM updated WHERE updated.google_subject = roster.google_subject
         )
       ), inserted AS (
         INSERT INTO student (google_subject, name, email, origin)
         SELECT remaining.google_subject, remaining.name, remaining.email, 'google'
         FROM remaining, owned
         ON CONFLICT (email) DO UPDATE SET
           google_subject = EXCLUDED.google_subject,
           name = EXCLUDED.name,
           origin = 'google',
           is_inconsistent = false,
           inconsistency_reason = NULL
         RETURNING student.id, student.google_subject
       ), resolved AS (
         SELECT * FROM updated UNION ALL SELECT * FROM inserted
       ), enrolled AS (
         INSERT INTO enrollment (
           class_group_id, student_id, status, origin,
           external_enrollment_id, last_synced_at
         )
         SELECT owned.id, resolved.id, 'active', 'google',
           resolved.google_subject, now()
         FROM owned CROSS JOIN resolved
         ON CONFLICT (class_group_id, student_id) DO UPDATE SET
           status = CASE WHEN enrollment.status = 'restricted'
             THEN enrollment.status ELSE 'active' END,
           origin = 'google',
           external_enrollment_id = EXCLUDED.external_enrollment_id,
           last_synced_at = now(), updated_at = now()
         RETURNING student_id
       ), synced AS (
         UPDATE class_group SET sync_status = 'active', last_synced_at = now(),
           sync_error = NULL WHERE id IN (SELECT id FROM owned)
       )
       SELECT count(*)::int AS count FROM enrolled`,
      [professorId, classId, JSON.stringify(students)],
    )) as QueryResult<{ count: number }>;
    return result.rows[0]?.count ?? 0;
  }

  async setCurriculumProfile(
    professorId: string,
    classId: string,
    input: ClassCurriculumInput,
  ): Promise<boolean> {
    return withTransaction(this.database, async (database) => {
      const owned = (await database.query(
        `UPDATE class_group SET school_year = $3
         WHERE id = $2 AND professor_id = $1 RETURNING id`,
        [professorId, classId, input.schoolYear],
      )) as QueryResult<{ id: string }>;
      if (!owned.rows[0]) return false;

      await database.query(
        `INSERT INTO class_curriculum_profile (
           class_group_id, education_stage, school_year
         ) VALUES ($1, $2::education_stage, $3)
         ON CONFLICT (class_group_id) DO UPDATE SET
           education_stage = EXCLUDED.education_stage,
           school_year = EXCLUDED.school_year`,
        [classId, input.educationStage, input.schoolYear],
      );
      await database.query(
        `DELETE FROM class_curriculum_component WHERE class_group_id = $1`,
        [classId],
      );
      await database.query(
        `INSERT INTO class_curriculum_component (
           class_group_id, curricular_component
         ) SELECT $1, component FROM unnest($2::text[]) AS component`,
        [classId, input.curricularComponents],
      );
      return true;
    });
  }

  private toSummary(row: ClassRow): ClassSummary {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      schoolYear: row.school_year,
      source: row.origin,
    };
  }
}
