import type {
  ClassCurriculum,
  ClassCurriculumInput,
  ClassCreate,
  ClassDetail,
  ClassRemoval,
  ClassSummary,
  ClassUpdate,
  StudentEnrollmentInput,
  StudentImportPreview,
  StudentImportResult,
  StudentImportRow,
} from "@educai/contracts";

import { withTransaction, type DatabaseClient } from "../database.js";
import type {
  ClassroomCourse,
  ClassroomStudent,
} from "../classroom/adapter.js";
import { createHash } from "node:crypto";
import type { ParsedStudentRow } from "./student-import.js";

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
  archived_at: Date | null;
};
type StudentRow = {
  id: string;
  name: string;
  email: string | null;
  registration_number: string | null;
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

  async list(professorId: string, archived = false): Promise<ClassSummary[]> {
    const result = (await this.database.query(
      `SELECT id, name, description, school_year, origin, archived_at
       FROM class_group WHERE professor_id = $1
         AND (archived_at IS NOT NULL) = $2
       ORDER BY name, id`,
      [professorId, archived],
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
              general_notice, origin, sync_status, last_synced_at, archived_at
       FROM class_group WHERE id = $1 AND professor_id = $2`,
      [classId, professorId],
    )) as QueryResult<ClassRow>;
    const group = classResult.rows[0];
    if (!group) return null;
    const students = (await this.database.query(
      `SELECT student.id, student.name, student.email::text, student.origin,
              enrollment.status, enrollment.registration_number,
              student.is_inconsistent, student.inconsistency_reason
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
        registrationNumber: row.registration_number,
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

  async removalPlan(
    professorId: string,
    classId: string,
  ): Promise<ClassRemoval | null> {
    const result = (await this.database.query(
      `SELECT class_group.origin,
              (SELECT count(*)::int FROM lesson_plan_class link
               WHERE link.class_group_id = class_group.id) AS plans,
              (SELECT count(*)::int FROM activity_classroom_distribution destination
               WHERE destination.class_group_id = class_group.id) AS activities,
              (SELECT count(*)::int FROM bulletin
               WHERE bulletin.class_group_id = class_group.id) AS grades,
              (SELECT count(*)::int FROM feedback
               WHERE feedback.class_group_id = class_group.id)
              + (SELECT count(*)::int FROM timeline_milestone milestone
                 JOIN published_milestone_link link ON link.milestone_id = milestone.id
                 WHERE milestone.class_group_id = class_group.id) AS other_content
       FROM class_group WHERE id = $1 AND professor_id = $2`,
      [classId, professorId],
    )) as QueryResult<{
      origin: ClassSummary["source"];
      plans: number;
      activities: number;
      grades: number;
      other_content: number;
    }>;
    const row = result.rows[0];
    if (!row) return null;
    const hasContent =
      row.plans + row.activities + row.grades + row.other_content > 0;
    return {
      action:
        row.origin === "google" ? "unlink" : hasContent ? "archive" : "delete",
      plans: row.plans,
      activities: row.activities,
      grades: row.grades,
    };
  }

  // Exclui de fato só turma local sem conteúdo. Turma do Google perde apenas o
  // vínculo local: fica arquivada aqui e a sincronização não a reativa.
  async remove(
    professorId: string,
    classId: string,
  ): Promise<"deleted" | "unlinked" | "has_content" | "not_found"> {
    const plan = await this.removalPlan(professorId, classId);
    if (!plan) return "not_found";
    if (plan.action === "archive") return "has_content";
    if (plan.action === "unlink") {
      await this.setArchived(professorId, classId, true);
      return "unlinked";
    }
    return withTransaction(this.database, async (database) => {
      await database.query(
        "DELETE FROM material_class WHERE class_group_id = $1",
        [classId],
      );
      await database.query(
        "DELETE FROM timeline_milestone WHERE class_group_id = $1",
        [classId],
      );
      await database.query("DELETE FROM enrollment WHERE class_group_id = $1", [
        classId,
      ]);
      const deleted = (await database.query(
        `DELETE FROM class_group
         WHERE id = $1 AND professor_id = $2 AND origin = 'local'
         RETURNING id`,
        [classId, professorId],
      )) as QueryResult<{ id: string }>;
      return deleted.rows[0] ? "deleted" : "not_found";
    });
  }

  async setArchived(
    professorId: string,
    classId: string,
    archived: boolean,
  ): Promise<boolean> {
    const result = (await this.database.query(
      `UPDATE class_group
       SET archived_at = CASE WHEN $3 THEN coalesce(archived_at, now()) END
       WHERE id = $1 AND professor_id = $2
       RETURNING id`,
      [classId, professorId, archived],
    )) as QueryResult<{ id: string }>;
    return result.rows.length > 0;
  }

  // Aluno do Google só sai pelo Classroom; aqui ele pode ser restringido.
  async removeEnrollment(
    professorId: string,
    classId: string,
    studentId: string,
  ): Promise<"removed" | "google" | "not_found"> {
    const result = (await this.database.query(
      `WITH target AS (
         SELECT enrollment.id, enrollment.origin
         FROM enrollment
         JOIN class_group ON class_group.id = enrollment.class_group_id
         WHERE enrollment.class_group_id = $1 AND enrollment.student_id = $3
           AND class_group.professor_id = $2
       ), removed AS (
         DELETE FROM enrollment USING target
         WHERE enrollment.id = target.id AND target.origin <> 'google'
         RETURNING enrollment.id
       )
       SELECT EXISTS (SELECT 1 FROM removed) AS removed FROM target`,
      [classId, professorId, studentId],
    )) as QueryResult<{ removed: boolean }>;
    const row = result.rows[0];
    if (!row) return "not_found";
    return row.removed ? "removed" : "google";
  }

  async setEnrollmentStatus(
    professorId: string,
    classId: string,
    studentId: string,
    status: "active" | "restricted",
  ): Promise<boolean> {
    const result = (await this.database.query(
      `UPDATE enrollment SET status = $4, updated_at = now()
       FROM class_group
       WHERE class_group.id = enrollment.class_group_id
         AND enrollment.class_group_id = $1 AND class_group.professor_id = $2
         AND enrollment.student_id = $3
       RETURNING enrollment.id`,
      [classId, professorId, studentId, status],
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

  // Classifica cada linha da planilha sem gravar nada. A reconciliação é
  // por e-mail (sem duplicar aluno) e, sem e-mail, pela matrícula na turma.
  async previewStudentImport(
    professorId: string,
    classId: string,
    rows: ParsedStudentRow[],
    database: DatabaseClient = this.database,
  ): Promise<
    (StudentImportPreview & { studentIds: Array<string | null> }) | null
  > {
    const owned = (await database.query(
      "SELECT id FROM class_group WHERE id = $1 AND professor_id = $2",
      [classId, professorId],
    )) as QueryResult<{ id: string }>;
    if (!owned.rows[0]) return null;
    const enrolled = (await database.query(
      `SELECT student.id, lower(student.email::text) AS email,
              lower(enrollment.registration_number) AS registration
       FROM enrollment JOIN student ON student.id = enrollment.student_id
       WHERE enrollment.class_group_id = $1`,
      [classId],
    )) as QueryResult<{
      id: string;
      email: string | null;
      registration: string | null;
    }>;
    const emails = rows.flatMap((row) => (row.email ? [row.email] : []));
    const known = (await database.query(
      `SELECT id, lower(email::text) AS email FROM student
       WHERE lower(email::text) = ANY($1::text[])`,
      [emails],
    )) as QueryResult<{ id: string; email: string }>;
    const byEmail = new Map(known.rows.map((row) => [row.email, row.id]));
    const inClass = new Set(enrolled.rows.map((row) => row.id));
    const byRegistration = new Map(
      enrolled.rows.flatMap((row) =>
        row.registration ? [[row.registration, row.id] as const] : [],
      ),
    );

    const studentIds: Array<string | null> = [];
    const preview: StudentImportRow[] = rows.map((row) => {
      const errors = [...row.errors];
      const studentId = row.email ? (byEmail.get(row.email) ?? null) : null;
      const holder = byRegistration.get(row.registrationNumber.toLowerCase());
      const sameStudent = row.email
        ? studentId !== null && holder === studentId
        : holder !== undefined;
      if (holder && !sameStudent)
        errors.push("Matrícula já usada por outro aluno desta turma.");
      studentIds.push(studentId ?? (sameStudent ? holder! : null));
      const status: StudentImportRow["status"] =
        errors.length > 0
          ? "error"
          : sameStudent || (studentId && inClass.has(studentId))
            ? "unchanged"
            : studentId
              ? "linked"
              : "new";
      return {
        line: row.line,
        name: row.name,
        registrationNumber: row.registrationNumber,
        email: row.email,
        status,
        errors,
      };
    });
    return {
      rows: preview,
      canImport: preview.every((row) => row.status !== "error"),
      studentIds,
    };
  }

  // Grava a planilha numa transação, revalidando antes. Aluno existente não
  // tem o nome trocado (o Google segue fonte primária) e matrícula repetida
  // não reativa aluno restrito.
  async importStudents(
    professorId: string,
    classId: string,
    rows: ParsedStudentRow[],
  ): Promise<
    | { status: "imported"; result: StudentImportResult }
    | { status: "invalid"; preview: StudentImportPreview }
    | { status: "not_found" }
  > {
    return withTransaction(this.database, async (database) => {
      const preview = await this.previewStudentImport(
        professorId,
        classId,
        rows,
        database,
      );
      if (!preview) return { status: "not_found" as const };
      if (!preview.canImport)
        return {
          status: "invalid" as const,
          preview: { rows: preview.rows, canImport: false },
        };
      const result: StudentImportResult = {
        created: 0,
        linked: 0,
        unchanged: 0,
      };
      for (const [index, row] of preview.rows.entries()) {
        let studentId = preview.studentIds[index] ?? null;
        if (!studentId) {
          const inserted = (await database.query(
            `INSERT INTO student (name, email, origin)
             VALUES ($1, $2, 'spreadsheet')
             ON CONFLICT (email) DO UPDATE SET email = student.email
             RETURNING id`,
            [row.name, row.email],
          )) as QueryResult<{ id: string }>;
          studentId = inserted.rows[0]!.id;
        }
        await database.query(
          `INSERT INTO enrollment
             (class_group_id, student_id, status, origin, registration_number)
           VALUES ($1, $2, 'active', 'spreadsheet', $3)
           ON CONFLICT (class_group_id, student_id) DO UPDATE SET
             registration_number = coalesce(
               enrollment.registration_number, EXCLUDED.registration_number),
             updated_at = now()`,
          [classId, studentId, row.registrationNumber],
        );
        if (row.status === "new") result.created += 1;
        else if (row.status === "linked") result.linked += 1;
        else result.unchanged += 1;
      }
      return { status: "imported" as const, result };
    });
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
      archivedAt: row.archived_at?.toISOString() ?? null,
    };
  }
}
