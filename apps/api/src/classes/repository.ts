import type {
  ClassCreate,
  ClassDetail,
  ClassSummary,
  ClassUpdate,
  StudentEnrollmentInput,
} from "@educai/contracts";

import type { DatabaseClient } from "../database.js";
import type { ClassroomCourse } from "../classroom/adapter.js";
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
         name = EXCLUDED.name,
         origin = CASE WHEN student.origin = 'google' THEN student.origin ELSE EXCLUDED.origin END
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
        .update(course.googleClassroomId)
        .digest("hex")
        .slice(0, 24)}`;
      await this.database.query(
        `INSERT INTO class_group (
           professor_id, google_classroom_id, name, description, school_year,
           local_access_code, origin, sync_status, last_synced_at, sync_error
         ) VALUES ($1, $2, $3, $4, $5, $6, 'google', 'active', now(), NULL)
         ON CONFLICT (google_classroom_id) DO UPDATE SET
           professor_id = EXCLUDED.professor_id,
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           school_year = EXCLUDED.school_year,
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
