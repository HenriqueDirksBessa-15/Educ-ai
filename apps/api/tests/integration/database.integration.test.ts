import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createApp } from "../../src/app.js";
import { ActivitiesRepository } from "../../src/activities/repository.js";
import { TokenCipher } from "../../src/auth/crypto.js";
import { AuthRepository } from "../../src/auth/repository.js";
import type { GoogleGateway } from "../../src/auth/types.js";
import type { AppConfig } from "../../src/config.js";
import { loadRootEnvironment } from "../../src/config.js";
import { runMigrations } from "../../src/db/migrations.js";
import { findRepositoryRoot } from "../../src/db/paths.js";
import { runSeeds } from "../../src/db/seeds.js";
import { CorrectionsRepository } from "../../src/corrections/repository.js";
import { ActivityCollectionService } from "../../src/corrections/collection.js";
import {
  FixtureGoogleResponseCollector,
  type GoogleFormsResponseFixtureV1,
} from "../../src/corrections/google-response-collector.js";
import { DiscursiveCorrectionsRepository } from "../../src/corrections/discursive-repository.js";
import { SubmissionReleaseService } from "../../src/corrections/release.js";
import { FixtureClassroomGradeReturner } from "../../src/corrections/classroom-return.js";
import { FeedbackRepository } from "../../src/feedback/repository.js";
import { BulletinsRepository } from "../../src/bulletins/repository.js";
import { BulletinService } from "../../src/bulletins/service.js";
import { FixtureBulletinEmailSender } from "../../src/bulletins/email.js";
import { RetentionService } from "../../src/privacy/retention.js";
import { ClassesRepository } from "../../src/classes/repository.js";
import { parseStudentCsv } from "../../src/classes/student-import.js";
import { TimelineRepository } from "../../src/timeline/repository.js";
import { PlansRepository } from "../../src/plans/repository.js";
import { NotificationRepository } from "../../src/notifications/repository.js";
import { NotificationDeliveryWorker } from "../../src/notifications/worker.js";
import { FixtureClassroomAnnouncementSender } from "../../src/notifications/classroom.js";

loadRootEnvironment();
const baseUrl = process.env.DATABASE_URL;
const describeWithDatabase = baseUrl ? describe : describe.skip;
const formsResponseFixture = JSON.parse(
  readFileSync(
    join(
      findRepositoryRoot(),
      "apps",
      "api",
      "tests",
      "fixtures",
      "google-forms-responses-v1.json",
    ),
    "utf8",
  ),
) as GoogleFormsResponseFixtureV1;

describeWithDatabase("PostgreSQL migrations and seeds", () => {
  const databaseName = `educai_test_${randomUUID().replaceAll("-", "")}`;
  const parsedUrl = new URL(
    baseUrl || "postgresql://skipped:skipped@localhost/educai_skipped",
  );
  const adminUrl = new URL(parsedUrl);
  adminUrl.pathname = "/postgres";
  const testUrl = new URL(parsedUrl);
  testUrl.pathname = `/${databaseName}`;
  const adminPool = new Pool({ connectionString: adminUrl.toString() });
  let testPool: Pool;

  beforeAll(async () => {
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);
    testPool = new Pool({ connectionString: testUrl.toString() });
  }, 60_000);

  afterAll(async () => {
    if (testPool) await testPool.end();
    await adminPool.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = $1 AND usename = current_user AND pid <> pg_backend_pid()`,
      [databaseName],
    );
    await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await adminPool.end();
  }, 60_000);

  it("applies migrations to an empty database exactly once", async () => {
    const migrationsDirectory = join(
      findRepositoryRoot(),
      "database",
      "migrations",
    );

    expect(await runMigrations(testPool, migrationsDirectory)).toEqual([
      "001_foundation.sql",
      "002_google_auth.sql",
      "003_curriculum_profile.sql",
      "004_bncc_canonical.sql",
      "005_bncc_identifier_width.sql",
      "006_classes_students.sql",
      "007_timeline_materials.sql",
      "008_lesson_plans.sql",
      "009_lesson_plan_ai.sql",
      "010_bncc_compatibility_projection.sql",
      "011_syllabus_school_year_width.sql",
      "012_bncc_compatibility_document_key.sql",
      "013_bncc_skill_text_width.sql",
      "014_classroom_tenant_isolation.sql",
      "015_activities.sql",
      "016_activity_ai_publication.sql",
      "017_defer_activity_question_keys.sql",
      "018_activity_submissions_objective_grading.sql",
      "019_discursive_corrections.sql",
      "020_feedback_notifications.sql",
      "021_bulletins.sql",
      "022_security_privacy_audit.sql",
      "023_class_curriculum_profile.sql",
      "024_lesson_plan_teacher_fields.sql",
      "025_activity_form_question_mapping.sql",
      "026_notification_delivery.sql",
      "027_class_archive.sql",
      "028_student_registration.sql",
      "029_access_code_domain.sql",
    ]);
    expect(await runMigrations(testPool, migrationsDirectory)).toEqual([]);

    const tables = await testPool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    expect(tables.rows.map((row) => row.table_name)).toEqual(
      expect.arrayContaining([
        "professor",
        "class_group",
        "student",
        "enrollment",
        "google_oauth_credential",
        "auth_session",
        "oauth_authorization_state",
        "timeline_milestone",
        "material",
        "lesson_plan",
        "lesson_plan_generation",
        "activity",
        "activity_question",
        "activity_alternative",
        "activity_response",
        "activity_generation",
        "activity_publication",
        "activity_classroom_distribution",
        "activity_collection_job",
        "activity_submission",
        "activity_submission_answer",
        "activity_collection_run",
        "activity_correction_history",
        "feedback",
        "feedback_generation",
        "feedback_history",
        "notification_outbox",
        "bulletin",
        "bulletin_delivery",
        "privacy_request",
        "audit_event",
        "class_curriculum_profile",
        "class_curriculum_component",
      ]),
    );
  }, 60_000);

  it("persists an isolated curriculum profile and idempotent Google roster", async () => {
    const professors = await testPool.query<{ id: string }>(
      `INSERT INTO professor (google_subject, email, display_name)
       VALUES
         ($1, $2, 'Professor Vertical A'),
         ($3, $4, 'Professor Vertical B')
       RETURNING id`,
      [
        `vertical-a-${randomUUID()}`,
        `vertical-a-${randomUUID()}@example.invalid`,
        `vertical-b-${randomUUID()}`,
        `vertical-b-${randomUUID()}@example.invalid`,
      ],
    );
    const professorA = professors.rows[0]!.id;
    const professorB = professors.rows[1]!.id;
    const repository = new ClassesRepository(testPool);
    const classId = await repository.create(professorA, {
      name: "Turma vertical",
      schoolYear: "8º ano EF",
      localAccessCode: `vertical-${randomUUID().slice(0, 8)}`,
    });

    expect(
      await repository.setCurriculumProfile(professorB, classId, {
        educationStage: "elementary_2",
        schoolYear: "8º ano EF",
        curricularComponents: ["Matemática"],
      }),
    ).toBe(false);
    expect(
      await repository.setCurriculumProfile(professorA, classId, {
        educationStage: "elementary_2",
        schoolYear: "8º ano EF",
        curricularComponents: ["Matemática", "Ciências"],
      }),
    ).toBe(true);
    expect(
      await repository.setCurriculumProfile(professorA, classId, {
        educationStage: "elementary_2",
        schoolYear: "8º ano EF",
        curricularComponents: ["Matemática", "História"],
      }),
    ).toBe(true);
    expect(
      await repository.linkGoogleCourse(professorA, classId, "course-vertical"),
    ).toBe(true);

    const roster = [
      {
        googleSubject: "student-vertical",
        name: "Aluno Vertical",
        email: `student-${randomUUID()}@example.invalid`,
      },
    ];
    expect(
      await repository.syncGoogleStudents(professorA, classId, roster),
    ).toBe(1);
    expect(
      await repository.syncGoogleStudents(professorA, classId, roster),
    ).toBe(1);

    const detail = await repository.getDetail(professorA, classId);
    expect(detail?.curriculum).toEqual({
      educationStage: "elementary_2",
      schoolYear: "8º ano EF",
      curricularComponents: ["História", "Matemática"],
    });
    expect(detail?.students).toHaveLength(1);
    expect(await repository.getDetail(professorB, classId)).toBeNull();
  }, 60_000);

  it("keeps a student's name when another professor enrolls the same email", async () => {
    const professors = await testPool.query<{ id: string }>(
      `INSERT INTO professor (google_subject, email, display_name)
       VALUES ($1, $2, 'Professor Aluno A'), ($3, $4, 'Professor Aluno B')
       RETURNING id`,
      [
        `student-a-${randomUUID()}`,
        `student-a-${randomUUID()}@example.invalid`,
        `student-b-${randomUUID()}`,
        `student-b-${randomUUID()}@example.invalid`,
      ],
    );
    const professorA = professors.rows[0]!.id;
    const professorB = professors.rows[1]!.id;
    const repository = new ClassesRepository(testPool);
    const classA = await repository.create(professorA, {
      name: "Turma do aluno A",
      schoolYear: "6º ano EF",
      localAccessCode: `aluno-a-${randomUUID().slice(0, 8)}`,
    });
    const classB = await repository.create(professorB, {
      name: "Turma do aluno B",
      schoolYear: "6º ano EF",
      localAccessCode: `aluno-b-${randomUUID().slice(0, 8)}`,
    });
    const email = `shared-${randomUUID()}@example.invalid`;

    await repository.enrollStudent(professorA, classA, {
      name: "Aluno Original",
      email,
      origin: "spreadsheet",
    });
    await repository.enrollStudent(professorB, classB, {
      name: "Nome Trocado",
      email,
      origin: "access_code",
    });

    const studentA = (
      await repository.getDetail(professorA, classA)
    )?.students.find((student) => student.email === email);
    expect(studentA).toMatchObject({
      name: "Aluno Original",
      origin: "spreadsheet",
    });

    // O Google continua sendo a fonte primária: a sincronização atualiza nome e origem.
    expect(
      await repository.linkGoogleCourse(professorA, classA, "course-shared"),
    ).toBe(true);
    expect(
      await repository.syncGoogleStudents(professorA, classA, [
        {
          googleSubject: `google-${randomUUID()}`,
          name: "Nome do Google",
          email,
        },
      ]),
    ).toBe(1);
    const synced = await testPool.query<{ name: string; origin: string }>(
      "SELECT name, origin FROM student WHERE email = $1",
      [email],
    );
    expect(synced.rows).toEqual([{ name: "Nome do Google", origin: "google" }]);
    // Cadastro repetido na mesma turma é recusado e não altera o aluno.
    expect(
      await repository.enrollStudent(professorB, classB, {
        name: "Outro Nome Manual",
        email,
        origin: "spreadsheet",
      }),
    ).toEqual({ existing: "active" });
    const afterManual = await testPool.query<{ name: string; origin: string }>(
      "SELECT name, origin FROM student WHERE email = $1",
      [email],
    );
    expect(afterManual.rows).toEqual([
      { name: "Nome do Google", origin: "google" },
    ]);
  }, 60_000);

  it("deletes, archives or unlinks classes and protects Google students", async () => {
    const professors = await testPool.query<{ id: string }>(
      `INSERT INTO professor (google_subject, email, display_name)
       VALUES ($1, $2, 'Professor Remoção A'), ($3, $4, 'Professor Remoção B')
       RETURNING id`,
      [
        `removal-a-${randomUUID()}`,
        `removal-a-${randomUUID()}@example.invalid`,
        `removal-b-${randomUUID()}`,
        `removal-b-${randomUUID()}@example.invalid`,
      ],
    );
    const professorA = professors.rows[0]!.id;
    const professorB = professors.rows[1]!.id;
    const classes = new ClassesRepository(testPool);
    const newClass = (name: string) =>
      classes.create(professorA, {
        name,
        schoolYear: "6º ano EF",
        localAccessCode: `rem-${randomUUID().slice(0, 12)}`,
      });

    // Turma local sem conteúdo: excluída de fato, com alunos e marcos.
    const emptyClass = await newClass("Turma vazia");
    await classes.enrollStudent(professorA, emptyClass, {
      name: "Aluno Manual",
      email: `manual-${randomUUID()}@example.invalid`,
      origin: "spreadsheet",
    });
    await new TimelineRepository(testPool).createMilestone(professorA, {
      classId: emptyClass,
      date: "2026-12-01",
      type: "lesson",
      description: "Aula de revisão.",
    });
    expect(await classes.remove(professorB, emptyClass)).toBe("not_found");
    expect(await classes.removalPlan(professorA, emptyClass)).toEqual({
      action: "delete",
      plans: 0,
      activities: 0,
      grades: 0,
    });
    expect(await classes.remove(professorA, emptyClass)).toBe("deleted");
    expect(await classes.getDetail(professorA, emptyClass)).toBeNull();

    // Turma local com plano: só pode ser arquivada, e volta ao desarquivar.
    const planClass = await newClass("Turma com plano");
    await new PlansRepository(testPool).create(professorA, {
      title: "Plano que impede a exclusão",
      curricularComponent: "Matemática",
      schoolYear: "6º ano EF",
      objectives: "Objetivo.",
      contents: "Conteúdo.",
      methodology: "Metodologia.",
      evaluationStrategy: "Avaliação.",
      classIds: [planClass],
      bnccSkillIds: [],
      materialIds: [],
    });
    expect(await classes.remove(professorA, planClass)).toBe("has_content");
    expect(await classes.setArchived(professorB, planClass, true)).toBe(false);
    expect(await classes.setArchived(professorA, planClass, true)).toBe(true);
    expect(
      (await classes.list(professorA)).some((item) => item.id === planClass),
    ).toBe(false);
    expect(
      (await classes.list(professorA, { status: "archived" })).map(
        (item) => item.id,
      ),
    ).toContain(planClass);
    expect(await classes.setArchived(professorA, planClass, false)).toBe(true);
    expect(
      (await classes.list(professorA)).find((item) => item.id === planClass),
    ).toMatchObject({ archivedAt: null });

    // Turma do Google: perde só o vínculo local e a sincronização não a reativa.
    const googleClass = await newClass("Turma do Google");
    const courseId = `course-removal-${randomUUID()}`;
    expect(
      await classes.linkGoogleCourse(professorA, googleClass, courseId),
    ).toBe(true);
    const googleSubject = `google-${randomUUID()}`;
    await classes.syncGoogleStudents(professorA, googleClass, [
      {
        googleSubject,
        name: "Aluna do Google",
        email: `google-${randomUUID()}@example.invalid`,
      },
    ]);
    const manualEmail = `manual-g-${randomUUID()}@example.invalid`;
    await classes.enrollStudent(professorA, googleClass, {
      name: "Aluno Manual na Turma Google",
      email: manualEmail,
      origin: "spreadsheet",
    });
    const roster = (await classes.getDetail(professorA, googleClass))!.students;
    const googleStudent = roster.find((item) => item.origin === "google")!;
    const manualStudent = roster.find((item) => item.email === manualEmail)!;

    expect(
      await classes.removeEnrollment(professorA, googleClass, googleStudent.id),
    ).toBe("google");
    expect(
      await classes.removeEnrollment(professorB, googleClass, manualStudent.id),
    ).toBe("not_found");
    expect(
      await classes.removeEnrollment(professorA, googleClass, manualStudent.id),
    ).toBe("removed");

    // Restrito não recebe a atividade: a publicação lista só os ativos.
    const activities = new ActivitiesRepository(testPool);
    expect(await activities.classroomAssignees(professorA, googleClass)).toBe(
      null,
    );
    expect(
      await classes.setEnrollmentStatus(
        professorB,
        googleClass,
        googleStudent.id,
        "restricted",
      ),
    ).toBe(false);
    expect(
      await classes.setEnrollmentStatus(
        professorA,
        googleClass,
        googleStudent.id,
        "restricted",
      ),
    ).toBe(true);
    expect(
      await activities.classroomAssignees(professorA, googleClass),
    ).toEqual([]);
    await classes.syncGoogleStudents(professorA, googleClass, [
      {
        googleSubject,
        name: "Aluna do Google",
        email: googleStudent.email,
      },
    ]);
    expect(
      (await classes.getDetail(professorA, googleClass))!.students[0],
    ).toMatchObject({ status: "restricted" });

    expect(await classes.remove(professorA, googleClass)).toBe("unlinked");
    await classes.syncGoogleCourses(professorA, [
      {
        googleClassroomId: courseId,
        name: "Turma do Google",
        description: null,
        schoolYear: "6º ano EF",
      },
    ]);
    expect(
      (await classes.list(professorA)).some((item) => item.id === googleClass),
    ).toBe(false);
    expect(
      (await classes.getDetail(professorA, googleClass))!.archivedAt,
    ).not.toBeNull();
  }, 60_000);

  it("imports students from a sheet reconciling by email without duplicates", async () => {
    const professors = await testPool.query<{ id: string }>(
      `INSERT INTO professor (google_subject, email, display_name)
       VALUES ($1, $2, 'Professor Planilha A'), ($3, $4, 'Professor Planilha B')
       RETURNING id`,
      [
        `sheet-a-${randomUUID()}`,
        `sheet-a-${randomUUID()}@example.invalid`,
        `sheet-b-${randomUUID()}`,
        `sheet-b-${randomUUID()}@example.invalid`,
      ],
    );
    const professorA = professors.rows[0]!.id;
    const professorB = professors.rows[1]!.id;
    const classes = new ClassesRepository(testPool);
    const target = await classes.create(professorA, {
      name: "Turma da planilha",
      schoolYear: "7º ano EF",
      localAccessCode: `sheet-${randomUUID().slice(0, 12)}`,
    });
    // Aluna que já veio do Google por outra turma: a planilha não a altera.
    const googleClass = await classes.create(professorA, {
      name: "Turma Google da planilha",
      schoolYear: "7º ano EF",
      localAccessCode: `sheet-g-${randomUUID().slice(0, 12)}`,
    });
    await classes.linkGoogleCourse(
      professorA,
      googleClass,
      `course-sheet-${randomUUID()}`,
    );
    const googleEmail = `google-sheet-${randomUUID()}@example.invalid`;
    await classes.syncGoogleStudents(professorA, googleClass, [
      {
        googleSubject: `google-${randomUUID()}`,
        name: "Nome do Google",
        email: googleEmail,
      },
    ]);
    const newEmail = `novo-${randomUUID()}@example.invalid`;
    const noEmailName = `Sem Email ${randomUUID().slice(0, 8)}`;
    const sheet = parseStudentCsv(
      [
        "nome;matricula;email",
        `Aluno Novo;R1;${newEmail.toUpperCase()}`,
        `Nome Trocado na Planilha;R2;${googleEmail}`,
        `${noEmailName};R3;`,
      ].join("\n"),
    );
    if (!sheet.ok) throw new Error(sheet.error);

    expect(
      await classes.previewStudentImport(professorB, target, sheet.rows),
    ).toBeNull();
    const preview = await classes.previewStudentImport(
      professorA,
      target,
      sheet.rows,
    );
    expect(preview!.rows.map((row) => row.status)).toEqual([
      "new",
      "linked",
      "new",
    ]);
    expect(
      await classes.importStudents(professorA, target, sheet.rows),
    ).toEqual({
      status: "imported",
      result: { created: 2, linked: 1, unchanged: 0 },
    });
    const google = await testPool.query<{ name: string; origin: string }>(
      "SELECT name, origin FROM student WHERE email = $1",
      [googleEmail],
    );
    expect(google.rows).toEqual([{ name: "Nome do Google", origin: "google" }]);
    const roster = (await classes.getDetail(professorA, target))!.students;
    expect(
      roster.map((student) => [student.registrationNumber, student.email]),
    ).toEqual(
      expect.arrayContaining([
        ["R1", newEmail],
        ["R2", googleEmail],
        ["R3", null],
      ]),
    );

    // Repetir a planilha não duplica nem reativa aluno restrito.
    const googleStudent = roster.find(
      (student) => student.email === googleEmail,
    )!;
    await classes.setEnrollmentStatus(
      professorA,
      target,
      googleStudent.id,
      "restricted",
    );
    expect(
      await classes.importStudents(professorA, target, sheet.rows),
    ).toEqual({
      status: "imported",
      result: { created: 0, linked: 0, unchanged: 3 },
    });
    const again = (await classes.getDetail(professorA, target))!.students;
    expect(again).toHaveLength(3);
    expect(
      again.find((student) => student.id === googleStudent.id),
    ).toMatchObject({ status: "restricted" });
    // Cadastro manual repetido: 409 na rota, sem reativar o aluno restrito.
    expect(
      await classes.enrollStudent(professorA, target, {
        name: "Outro Nome",
        email: googleEmail,
        origin: "spreadsheet",
        status: "active",
      }),
    ).toEqual({ existing: "restricted" });
    expect(
      await classes.enrollStudent(professorA, target, {
        name: "Sem Email Repetido",
        registrationNumber: "r3",
        origin: "spreadsheet",
      }),
    ).toEqual({ existing: "active" });
    expect(
      (await classes.getDetail(professorA, target))!.students.find(
        (student) => student.id === googleStudent.id,
      ),
    ).toMatchObject({ status: "restricted" });
    const noEmail = await testPool.query<{ count: string }>(
      "SELECT count(*) FROM student WHERE name = $1 AND email IS NULL",
      [noEmailName],
    );
    expect(Number(noEmail.rows[0]!.count)).toBe(1);

    // Matrícula de outro aluno da turma: erro na linha, nada é gravado.
    const conflict = parseStudentCsv(
      `nome,matricula,email\nOutra Pessoa,r1,outra-${randomUUID()}@example.invalid`,
    );
    if (!conflict.ok) throw new Error(conflict.error);
    const refused = await classes.importStudents(
      professorA,
      target,
      conflict.rows,
    );
    expect(refused).toMatchObject({
      status: "invalid",
      preview: {
        canImport: false,
        rows: [
          {
            status: "error",
            errors: ["Matrícula já usada por outro aluno desta turma."],
          },
        ],
      },
    });
    expect(
      (await classes.getDetail(professorA, target))!.students,
    ).toHaveLength(3);
  }, 60_000);

  it("keeps a student from another domain pending until the teacher decides", async () => {
    const professor = await testPool.query<{ id: string }>(
      `INSERT INTO professor (google_subject, email, display_name)
       VALUES ($1, $2, 'Professor Código') RETURNING id`,
      [`join-${randomUUID()}`, `prof-${randomUUID()}@escola.edu.br`],
    );
    const professorId = professor.rows[0]!.id;
    const classes = new ClassesRepository(testPool);
    const code = `JOIN-${randomUUID().slice(0, 8)}`;
    const classId = await classes.create(professorId, {
      name: "Turma por código",
      schoolYear: "8º ano EF",
      localAccessCode: code,
    });
    const insider = `dentro-${randomUUID()}@ESCOLA.edu.br`;
    const outsider = `fora-${randomUUID()}@gmail.com`;

    expect(
      await classes.joinByCode({
        code,
        name: "Aluno da Escola",
        email: insider,
      }),
    ).toEqual({ status: "active", className: "Turma por código" });
    expect(
      await classes.joinByCode({
        code: code.toLowerCase(),
        name: "Aluno de Fora",
        email: outsider,
      }),
    ).toEqual({ status: "pending", className: "Turma por código" });
    // Entrar de novo não muda a situação, nem depois de restringir.
    const external = (await classes.getDetail(
      professorId,
      classId,
    ))!.students.find((student) => student.email === outsider)!;
    expect(external).toMatchObject({
      status: "pending",
      origin: "access_code",
    });
    await classes.setEnrollmentStatus(
      professorId,
      classId,
      external.id,
      "restricted",
    );
    expect(
      await classes.joinByCode({
        code,
        name: "Aluno de Fora",
        email: outsider,
      }),
    ).toEqual({ status: "restricted", className: "Turma por código" });

    // Domínio configurado na turma passa a valer no lugar do do professor.
    expect(
      await classes.setEmailDomain(professorId, classId, "gmail.com"),
    ).toBe(true);
    const another = `outro-${randomUUID()}@gmail.com`;
    expect(
      await classes.joinByCode({ code, name: "Outro Aluno", email: another }),
    ).toMatchObject({ status: "active" });
    expect(await classes.getDetail(professorId, classId)).toMatchObject({
      accessCode: code,
      emailDomain: "gmail.com",
      effectiveEmailDomain: "gmail.com",
    });

    // Turma arquivada não aceita entrada por código.
    await classes.setArchived(professorId, classId, true);
    expect(
      await classes.joinByCode({
        code,
        name: "Atrasado",
        email: `x-${randomUUID()}@gmail.com`,
      }),
    ).toBeNull();
  }, 60_000);

  it("searches classes by name or code and filters by status, subject and year", async () => {
    const professors = await testPool.query<{ id: string }>(
      `INSERT INTO professor (google_subject, email, display_name)
       VALUES ($1, $2, 'Professor Busca A'), ($3, $4, 'Professor Busca B')
       RETURNING id`,
      [
        `search-a-${randomUUID()}`,
        `search-a-${randomUUID()}@example.invalid`,
        `search-b-${randomUUID()}`,
        `search-b-${randomUUID()}@example.invalid`,
      ],
    );
    const [professorA, professorB] = professors.rows.map((row) => row.id);
    const classes = new ClassesRepository(testPool);
    const tag = randomUUID().slice(0, 6);
    const create = async (
      professorId: string,
      name: string,
      code: string,
      year: string,
      component: string,
    ) => {
      const id = await classes.create(professorId, {
        name,
        schoolYear: "texto livre",
        localAccessCode: code,
      });
      await classes.setCurriculumProfile(professorId, id, {
        educationStage: "elementary_2",
        schoolYear: year,
        curricularComponents: [component],
      });
      return id;
    };
    const math7 = await create(
      professorA!,
      `7º A ${tag}`,
      `MAT7-${tag}`,
      "ef-ano-07",
      "Matemática",
    );
    const science7 = await create(
      professorA!,
      `7º B ${tag}`,
      `CIE7-${tag}`,
      "ef-ano-07",
      "Ciências",
    );
    const math8 = await create(
      professorA!,
      `8º A ${tag}`,
      `MAT8-${tag}`,
      "ef-ano-08",
      "Matemática",
    );
    await create(
      professorB!,
      `7º A ${tag} do B`,
      `OUTRO-${tag}`,
      "ef-ano-07",
      "Matemática",
    );
    await classes.setArchived(professorA!, math8, true);
    const ids = async (filters: Parameters<ClassesRepository["list"]>[1]) =>
      (await classes.list(professorA!, filters)).map((item) => item.id).sort();

    expect(await ids({ q: tag })).toEqual([math7, science7].sort());
    expect(await ids({ q: `cie7-${tag}` })).toEqual([science7]);
    expect(await ids({ q: tag, status: "all" })).toEqual(
      [math7, science7, math8].sort(),
    );
    expect(await ids({ q: tag, status: "archived" })).toEqual([math8]);
    expect(
      await ids({ q: tag, status: "all", component: "Matemática" }),
    ).toEqual([math7, math8].sort());
    expect(await ids({ q: tag, schoolYear: "ef-ano-07" })).toEqual(
      [math7, science7].sort(),
    );
    expect(await ids({ q: "%" })).toEqual([]);
  }, 60_000);

  it("creates materials atomically and isolates links and files by professor", async () => {
    const professors = await testPool.query<{ id: string }>(
      `INSERT INTO professor (google_subject, email, display_name)
       VALUES ($1, $2, 'Professor Material A'), ($3, $4, 'Professor Material B')
       RETURNING id`,
      [
        `material-a-${randomUUID()}`,
        `material-a-${randomUUID()}@example.invalid`,
        `material-b-${randomUUID()}`,
        `material-b-${randomUUID()}@example.invalid`,
      ],
    );
    const professorA = professors.rows[0]!.id;
    const professorB = professors.rows[1]!.id;
    const classes = new ClassesRepository(testPool);
    const classA = await classes.create(professorA, {
      name: "Turma de materiais A",
      schoolYear: "8º ano EF",
      localAccessCode: `mat-a-${randomUUID().slice(0, 8)}`,
    });
    const classB = await classes.create(professorB, {
      name: "Turma de materiais B",
      schoolYear: "8º ano EF",
      localAccessCode: `mat-b-${randomUUID().slice(0, 8)}`,
    });
    const repository = new TimelineRepository(testPool);
    const before = await testPool.query<{ count: string }>(
      "SELECT count(*) FROM material WHERE professor_id = $1",
      [professorA],
    );

    await expect(
      repository.createMaterialLink(professorA, {
        title: "Material alheio",
        category: "link",
        classIds: [classB],
        bnccSkillIds: [],
        url: "https://example.invalid/alheio",
      }),
    ).rejects.toThrow("MATERIAL_RELATION_NOT_FOUND");
    const afterRejected = await testPool.query<{ count: string }>(
      "SELECT count(*) FROM material WHERE professor_id = $1",
      [professorA],
    );
    expect(afterRejected.rows[0]!.count).toBe(before.rows[0]!.count);

    const materialId = await repository.createMaterialLink(professorA, {
      title: "Guia de frações",
      description: "Leitura de apoio",
      category: "reading",
      classIds: [classA],
      bnccSkillIds: [],
      url: "https://example.invalid/guia",
    });
    expect(await repository.listMaterials(professorB)).toEqual([]);
    expect(await repository.listMaterials(professorA)).toEqual([
      expect.objectContaining({
        id: materialId,
        classIds: [classA],
        classNames: ["Turma de materiais A"],
        url: "https://example.invalid/guia",
      }),
    ]);

    expect(await repository.archiveMaterial(professorA, materialId)).toBe(true);
    expect(await repository.listMaterials(professorA)).toEqual([]);
    expect(await repository.listMaterials(professorA, undefined, true)).toEqual(
      [expect.objectContaining({ id: materialId, isArchived: true })],
    );

    const storageKey = `${professorA}/${randomUUID()}`;
    const fileMaterialId = await repository.createMaterialFile(professorA, {
      title: "Guia privado de frações",
      category: "reading",
      classIds: [classA],
      bnccSkillIds: [],
      fileName: "guia.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4,
      storageKey,
    });
    expect(
      await repository.getMaterialFile(professorB, fileMaterialId),
    ).toBeNull();
    expect(
      await repository.getMaterialFile(professorA, fileMaterialId),
    ).toEqual({
      storageKey,
      fileName: "guia.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4,
    });
    expect(await repository.listMaterials(professorA)).toEqual([
      expect.not.objectContaining({ storageKey }),
    ]);
    expect(await repository.deleteMaterial(professorA, fileMaterialId)).toEqual(
      { status: "deleted", storageKey },
    );
  }, 60_000);

  it("persists and approves a complete plan before allowing an activity", async () => {
    const professor = await testPool.query<{ id: string }>(
      `INSERT INTO professor (google_subject, email, display_name)
       VALUES ($1, $2, 'Professor Plano Completo') RETURNING id`,
      [`plan-${randomUUID()}`, `plan-${randomUUID()}@example.invalid`],
    );
    const professorId = professor.rows[0]!.id;
    const classes = new ClassesRepository(testPool);
    const classId = await classes.create(professorId, {
      name: "Turma do plano completo",
      schoolYear: "8º ano EF",
      localAccessCode: `plan-${randomUUID().slice(0, 8)}`,
    });
    const area = await testPool.query<{ id: string }>(
      `INSERT INTO curriculum_area (name, source_label)
       VALUES ($1, $2) RETURNING id`,
      [`Matemática ${randomUUID()}`, `CV-B2 ${randomUUID()}`],
    );
    const syllabus = await testPool.query<{ id: string }>(
      `INSERT INTO syllabus
       (curriculum_area_id, curricular_component, school_year, description, source_label)
       VALUES ($1, 'Matemática', '8º ano EF', 'Números e operações.', 'CV-B2')
       RETURNING id`,
      [area.rows[0]!.id],
    );
    const skill = await testPool.query<{ id: string }>(
      `INSERT INTO bncc_skill
       (syllabus_id, code, thematic_unit, knowledge_object, description,
        source_label, is_official)
       VALUES ($1, $2, 'Números', 'Frações', 'Resolver problemas com frações.',
               'BNCC', true) RETURNING id`,
      [
        syllabus.rows[0]!.id,
        `T${randomUUID().replaceAll("-", "").slice(0, 20)}`,
      ],
    );
    const materialId = await new TimelineRepository(
      testPool,
    ).createMaterialLink(professorId, {
      title: "Guia do plano",
      category: "reading",
      classIds: [classId],
      bnccSkillIds: [skill.rows[0]!.id],
      url: "https://example.invalid/plano",
    });
    const plans = new PlansRepository(testPool);
    const planId = await plans.create(professorId, {
      title: "Frações na prática",
      curricularComponent: "Matemática",
      schoolYear: "8º ano EF",
      objectives: "Resolver problemas com frações.",
      contents: "Frações equivalentes.",
      methodology: "Investigação em grupos.",
      evaluationStrategy: "Registro e discussão.",
      durationMinutes: 100,
      references: "BNCC.",
      classIds: [classId],
      syllabusId: syllabus.rows[0]!.id,
      bnccSkillIds: [skill.rows[0]!.id],
      materialIds: [materialId],
    });
    expect(await plans.get(professorId, planId)).toMatchObject({
      durationMinutes: 100,
      references: "BNCC.",
      classIds: [classId],
      bnccSkillIds: [skill.rows[0]!.id],
      materialIds: [materialId],
      status: "draft",
    });

    const activities = new ActivitiesRepository(testPool);
    const activityInput = {
      lessonPlanId: planId,
      title: "Atividade de frações",
      description: "Verificação do plano aprovado.",
      type: "objective" as const,
      difficulty: "medium" as const,
      dueAt: "2026-10-30T12:00:00.000Z",
      latePolicy: { mode: "blocked" as const },
      questions: [
        {
          kind: "objective" as const,
          prompt: "Qual fração equivale a 1/2?",
          points: 10,
          alternatives: ["2/4", "1/3"],
          correctAlternativeIndex: 0,
        },
      ],
    };
    await expect(activities.create(professorId, activityInput)).rejects.toThrow(
      "LESSON_PLAN_NOT_APPROVED",
    );
    expect(await plans.approve(professorId, planId)).toBe("approved");
    await expect(
      activities.create(professorId, activityInput),
    ).resolves.toEqual(expect.any(String));
  }, 60_000);

  it("seeds fictitious isolated data repeatedly without duplication", async () => {
    const seedsDirectory = join(findRepositoryRoot(), "database", "seeds");

    await runSeeds(testPool, seedsDirectory);
    await runSeeds(testPool, seedsDirectory);

    const professors = await testPool.query<{ count: string }>(
      "SELECT count(*) FROM professor WHERE is_fixture = true",
    );
    const classes = await testPool.query<{ count: string }>(
      "SELECT count(*) FROM class_group WHERE is_fixture = true",
    );
    const expectedOwnership = await testPool.query<{ count: string }>(`
      SELECT count(*)
      FROM enrollment e
      JOIN class_group c ON c.id = e.class_group_id
      JOIN professor p ON p.id = c.professor_id
      JOIN student s ON s.id = e.student_id
      WHERE (p.email = 'professora.ana@example.invalid' AND s.email = 'aluna.ana@example.invalid')
         OR (p.email = 'professor.beto@example.invalid' AND s.email = 'aluno.beto@example.invalid')
    `);
    const curriculumLoads = await testPool.query<{ count: string }>(
      "SELECT count(*) FROM curriculum_load WHERE is_fixture = true",
    );

    expect(Number(professors.rows[0]?.count)).toBe(2);
    expect(Number(classes.rows[0]?.count)).toBe(2);
    expect(Number(expectedOwnership.rows[0]?.count)).toBe(2);
    expect(Number(curriculumLoads.rows[0]?.count)).toBe(1);
  }, 60_000);

  it("removes expired technical data according to retention policy", async () => {
    const professor = await testPool.query<{ id: string }>(
      "SELECT id FROM professor ORDER BY id LIMIT 1",
    );
    await testPool.query(
      `INSERT INTO auth_session
        (professor_id, token_hash, created_at, expires_at, last_seen_at)
       VALUES ($1, gen_random_bytes(32), now() - interval '3 days',
               now() - interval '2 days', now() - interval '3 days')`,
      [professor.rows[0]!.id],
    );
    await testPool.query(
      `INSERT INTO oauth_authorization_state
        (state_hash, code_verifier, created_at, expires_at)
       VALUES (gen_random_bytes(32), 'expired-verifier',
               now() - interval '3 days', now() - interval '2 days')`,
    );

    const result = await new RetentionService(testPool, 365).run();

    expect(result.sessions).toBeGreaterThanOrEqual(1);
    expect(result.oauthStates).toBeGreaterThanOrEqual(1);
  });

  it("persists a mixed activity and locks its structure after publication", async () => {
    const owner = await testPool.query<{
      professor_id: string;
      class_id: string;
    }>(
      `SELECT professor.id AS professor_id, class_group.id AS class_id
       FROM professor
       JOIN class_group ON class_group.professor_id = professor.id
       WHERE professor.email = 'professora.ana@example.invalid'
       LIMIT 1`,
    );
    const { professor_id: professorId, class_id: classId } = owner.rows[0]!;
    await testPool.query(
      `UPDATE class_group SET google_classroom_id = 'course-fixture-1'
       WHERE id = $1`,
      [classId],
    );
    const plan = await testPool.query<{ id: string }>(
      `INSERT INTO lesson_plan
       (professor_id, title, curricular_component, school_year, objectives,
        contents, methodology, evaluation_strategy, status, approved_at)
       VALUES ($1, 'Plano para atividade', 'Matemática', '5º ano',
        'Compreender frações', 'Frações', 'Resolução de problemas',
        'Avaliação formativa', 'approved', now()) RETURNING id`,
      [professorId],
    );
    await testPool.query(
      `INSERT INTO lesson_plan_class (lesson_plan_id, class_group_id)
       VALUES ($1, $2)`,
      [plan.rows[0]!.id, classId],
    );
    const repository = new ActivitiesRepository(testPool);
    const activityId = await repository.create(professorId, {
      lessonPlanId: plan.rows[0]!.id,
      title: "Atividade mista de frações",
      description: "Resolva e justifique.",
      type: "mixed",
      difficulty: "medium",
      dueAt: "2026-10-20T18:00:00.000Z",
      latePolicy: { mode: "allowed_with_penalty", penaltyPercent: 10 },
      questions: [
        {
          kind: "objective",
          prompt: "Qual opção representa metade?",
          points: 2,
          alternatives: ["1/2", "1/3"],
          correctAlternativeIndex: 0,
        },
        {
          kind: "discursive",
          prompt: "Explique a comparação.",
          points: 3,
          targetAnswer: "Denominadores equivalentes.",
          criteria: "Estratégia e justificativa.",
        },
      ],
    });

    const draft = await repository.get(professorId, activityId);
    expect(draft).toMatchObject({
      status: "draft",
      type: "mixed",
      totalPoints: 5,
      questions: [{ kind: "objective" }, { kind: "discursive" }],
    });
    const generation = await repository.recordGenerationSuccess(
      professorId,
      activityId,
      {
        activityTitle: draft!.title,
        activityDescription: draft!.description,
        activityType: draft!.type,
        difficulty: draft!.difficulty,
        questionCount: 2,
        lessonPlanTitle: "Plano de frações",
        curricularComponent: "Matemática",
        schoolYear: "5º ano",
        objectives: "Compreender frações",
        contents: "Frações equivalentes",
        evaluationStrategy: "Atividade mista",
        syllabus: "Números",
        bnccCodes: [],
        materials: [],
      },
      {
        model: "fixture-activity-v1",
        origin: "fixture",
        suggestion: {
          title: draft!.title,
          description: draft!.description,
          type: draft!.type,
          difficulty: draft!.difficulty,
          questions: [
            {
              kind: "objective",
              prompt: "Quanto é 1/2?",
              points: 2,
              alternatives: ["0,5", "2"],
              correctAlternativeIndex: 0,
            },
            {
              kind: "discursive",
              prompt: "Explique.",
              points: 3,
              targetAnswer: "Metade do inteiro.",
              criteria: "Justificativa coerente.",
            },
          ],
        },
      },
    );
    expect(generation).toMatchObject({ version: 1, reviewStatus: "generated" });
    expect(await repository.latestGeneration(professorId, activityId)).toEqual(
      generation,
    );
    expect(
      await repository.reviewGeneration(professorId, activityId, {
        generationId: generation!.id,
        suggestion: generation!.suggestion!,
      }),
    ).toBe("reviewed");
    expect(
      await repository.approveGeneration(
        professorId,
        activityId,
        generation!.id,
      ),
    ).toBe("approved");
    expect(
      (await repository.latestGeneration(professorId, activityId))
        ?.reviewStatus,
    ).toBe("approved");
    expect(
      await repository.update(professorId, activityId, {
        description: "Alteração posterior à aprovação.",
      }),
    ).toBe("updated");
    expect(
      (await repository.latestGeneration(professorId, activityId))
        ?.reviewStatus,
    ).toBe("generated");
    expect(await repository.publish(professorId, activityId)).toBe("locked");
    const revisedSuggestion = {
      ...generation!.suggestion!,
      description: "Alteração posterior à aprovação.",
    };
    expect(
      await repository.reviewGeneration(professorId, activityId, {
        generationId: generation!.id,
        suggestion: revisedSuggestion,
      }),
    ).toBe("reviewed");
    expect(
      await repository.approveGeneration(
        professorId,
        activityId,
        generation!.id,
      ),
    ).toBe("approved");
    expect(await repository.preparePublication(professorId, activityId)).toBe(
      "ready",
    );
    expect(
      await repository.update(professorId, activityId, {
        description: "Não pode mudar durante a publicação.",
      }),
    ).toBe("locked");
    const prepared = await repository.getPublication(professorId, activityId);
    expect(prepared).toMatchObject({
      status: "pending",
      distributions: [
        { googleClassroomId: "course-fixture-1", status: "pending" },
      ],
    });
    const preparedActivity = await repository.get(professorId, activityId);
    await repository.savePublishedForm(
      professorId,
      activityId,
      "form-fixture-1",
      "https://forms.test/form-fixture-1",
      preparedActivity!.questions.map((question) => ({
        questionId: question.id,
        googleItemId: `item-${question.position}`,
        googleQuestionId: `q${question.position + 1}`,
        questionPosition: question.position,
      })),
    );
    expect(
      await repository.getFormQuestionMappings(professorId, activityId),
    ).toEqual([
      expect.objectContaining({ googleQuestionId: "q1", questionPosition: 0 }),
      expect.objectContaining({ googleQuestionId: "q2", questionPosition: 1 }),
    ]);
    await repository.saveDistribution(
      professorId,
      activityId,
      classId,
      "work-fixture-1",
      "https://classroom.test/work-fixture-1",
    );
    expect(
      await repository.completeExternalPublication(professorId, activityId),
    ).toBe(true);
    expect(
      await repository.getPublication(professorId, activityId),
    ).toMatchObject({
      status: "published",
      googleFormId: "form-fixture-1",
      collectionScheduledAt: "2026-10-20T18:00:00.000Z",
      distributions: [{ status: "published" }],
    });
    expect(
      await repository.update(professorId, activityId, { title: "Alterada" }),
    ).toBe("locked");
    await expect(
      testPool.query("UPDATE activity SET title = 'Forçada' WHERE id = $1", [
        activityId,
      ]),
    ).rejects.toThrow("published activity structure is immutable");
    expect(await repository.finish(professorId, activityId)).toBe("finished");
    const corrections = new CorrectionsRepository(testPool);
    const otherProfessor = await testPool.query<{ id: string }>(
      `SELECT id FROM professor WHERE id <> $1 ORDER BY id LIMIT 1`,
      [professorId],
    );
    expect(
      await corrections.startCollection(otherProfessor.rows[0]!.id, activityId),
    ).toBe("not_found");
    const student = await testPool.query<{ email: string }>(
      `SELECT student.email::text
       FROM student JOIN enrollment ON enrollment.student_id = student.id
       WHERE enrollment.class_group_id = $1 LIMIT 1`,
      [classId],
    );
    const corpus = structuredClone(formsResponseFixture);
    for (const response of corpus.pages.flatMap(
      (page) => page.responses ?? [],
    )) {
      if (
        ["response-fixture-1", "response-empty-objective"].includes(
          response.responseId ?? "",
        )
      )
        response.respondentEmail = student.rows[0]!.email;
    }
    const collectionAuth = {
      getCredential: vi.fn().mockResolvedValue({
        accessToken: "fixture-token",
        scopes: [],
      }),
      saveCredential: vi.fn(),
    };
    const collectionService = new ActivityCollectionService(
      repository,
      corrections,
      collectionAuth as unknown as AuthRepository,
      new FixtureGoogleResponseCollector(corpus),
    );
    await expect(
      collectionService.collect(otherProfessor.rows[0]!.id, activityId),
    ).resolves.toEqual({ status: "not_found" });
    await expect(
      collectionService.collect(professorId, activityId),
    ).resolves.toMatchObject({
      status: "collected",
      summary: {
        submissionCount: 4,
        manualReviewCount: 3,
      },
    });
    await expect(
      collectionService.collect(professorId, activityId),
    ).resolves.toMatchObject({
      status: "collected",
      summary: {
        attemptCount: 2,
        submissionCount: 4,
        manualReviewCount: 3,
      },
    });
    const reconciliation = await corrections.reconcileStudent(
      professorId,
      activityId,
      student.rows[0]!.email,
    );
    const collectedSummary = await corrections.getSummary(
      professorId,
      activityId,
    );
    expect(collectedSummary).toMatchObject({
      status: "completed",
      attemptCount: 2,
      submissionCount: 4,
      manualReviewCount: 3,
    });
    expect(
      collectedSummary!.submissions.filter(
        (item) => item.status === "manual_review_required",
      ),
    ).toHaveLength(3);
    const submission = collectedSummary!.submissions.find(
      (item) => item.externalResponseId === "response-fixture-1",
    )!;
    expect(submission).toMatchObject({
      status: "collected",
      grade: null,
      objectivePointsAwarded: 2,
    });
    const discursiveAnswer = submission.answers.find(
      (answer) => answer.kind === "discursive",
    )!;
    const discursiveRepository = new DiscursiveCorrectionsRepository(testPool);
    expect(
      await discursiveRepository.getContext(
        otherProfessor.rows[0]!.id,
        submission.id,
        discursiveAnswer.id,
        "balanced",
      ),
    ).toBeNull();
    const context = await discursiveRepository.getContext(
      professorId,
      submission.id,
      discursiveAnswer.id,
      "balanced",
    );
    expect(context).toMatchObject({
      answer: "Metade do inteiro.",
      criteria: "Justificativa coerente.",
      maxPoints: 3,
    });
    const failureClient = await testPool.connect();
    try {
      await failureClient.query("BEGIN");
      await new DiscursiveCorrectionsRepository(failureClient).recordFailure(
        professorId,
        context!,
        "OPENAI_API_KEY_INVALID",
        "gpt-5-mini",
        "openai",
      );
      const failure = await failureClient.query<{
        error_code: string;
        snapshot: { errorCode: string };
        correction_status: string;
      }>(
        `SELECT history.error_code, history.snapshot, submission.correction_status
         FROM activity_correction_history history
         JOIN activity_submission submission ON submission.id = history.submission_id
         WHERE history.submission_id = $1 AND history.action = 'ai_failure'`,
        [submission.id],
      );
      expect(failure.rows).toEqual([
        {
          error_code: "OPENAI_API_KEY_INVALID",
          snapshot: { errorCode: "OPENAI_API_KEY_INVALID" },
          correction_status: "manual_required",
        },
      ]);
    } finally {
      await failureClient.query("ROLLBACK");
      failureClient.release();
    }
    expect(
      await discursiveRepository.recordSuggestion(professorId, context!, {
        model: "fixture-discursive-correction-v1",
        origin: "fixture",
        suggestion: {
          pointsAwarded: 2,
          comment: "Conceito correto; ampliar justificativa.",
          requiresReview: true,
        },
      }),
    ).toBe(true);
    expect(
      await discursiveRepository.review(professorId, submission.id, {
        answers: [
          {
            answerId: discursiveAnswer.id,
            pointsAwarded: 2,
            comment: "Resposta adequada, com justificativa breve.",
          },
        ],
        teacherComment: "Correção revisada pelo professor.",
      }),
    ).toBe("reviewed");
    expect(await discursiveRepository.approve(professorId, submission.id)).toBe(
      "approved",
    );
    const releaseService = new SubmissionReleaseService(
      discursiveRepository,
      collectionAuth as unknown as AuthRepository,
      new FixtureClassroomGradeReturner(),
    );
    await expect(
      releaseService.release(professorId, submission.id),
    ).resolves.toEqual({
      status: "released",
      classroomStatus: "not_available",
    });
    await expect(
      releaseService.release(professorId, submission.id),
    ).resolves.toEqual({ status: "already_released" });
    const correctedSummary = await corrections.getSummary(
      professorId,
      activityId,
    );
    expect(correctedSummary?.gradedCount).toBe(1);
    expect(
      correctedSummary?.submissions.find(
        (item) => item.externalResponseId === "response-fixture-1",
      ),
    ).toMatchObject({
      correctionStatus: "released",
      grade: 8,
      classroomReturnStatus: "not_available",
      correctionHistory: [
        { version: 1, action: "ai_suggestion" },
        { version: 2, action: "teacher_revision" },
        { version: 3, action: "approval" },
        { version: 4, action: "release" },
      ],
    });
    await expect(
      testPool.query(
        `UPDATE activity_correction_history SET comment = 'alterado'
         WHERE submission_id = $1`,
        [submission.id],
      ),
    ).rejects.toThrow("activity correction history is immutable");
    const feedbacks = new FeedbackRepository(testPool);
    await expect(
      feedbacks.create(
        otherProfessor.rows[0]!.id,
        {
          scope: "individual",
          submissionId: submission.id,
          title: "Retorno",
          content: "Revise o resultado.",
          links: [],
          materialIds: [],
        },
        1_440,
      ),
    ).rejects.toThrow("FEEDBACK_TARGET_NOT_FOUND");
    const feedbackStudent = await testPool.query<{
      name: string;
      email: string;
    }>(
      `SELECT student.name, student.email::text
       FROM activity_submission submission
       JOIN student ON student.id = submission.student_id
       WHERE submission.id = $1`,
      [submission.id],
    );
    const studentName = feedbackStudent.rows[0]!.name;
    const feedbackId = await feedbacks.create(
      professorId,
      {
        scope: "individual",
        submissionId: submission.id,
        title: `Retorno da atividade de ${studentName}`,
        content: `${studentName}, revise o resultado e a justificativa.`,
        teacherObservation: "Mensagem inicial.",
        links: [{ label: "Apoio", url: "https://example.test/apoio" }],
        materialIds: [],
      },
      1_440,
    );
    const promptSource = await feedbacks.getPromptContext(
      professorId,
      feedbackId,
    );
    const feedbackContext = promptSource!.context;
    expect(promptSource!.studentName).toBe(studentName);
    expect(feedbackContext).toMatchObject({
      scope: "individual",
      audience: expect.stringMatching(/^aluno [0-9a-f]{8}$/),
      title: `Retorno da atividade de ${feedbackContext.audience}`,
      currentContent: `${feedbackContext.audience}, revise o resultado e a justificativa.`,
      activityTitle: "Atividade mista de frações",
      grade: 8,
    });
    const serializedContext = JSON.stringify(feedbackContext);
    expect(serializedContext).not.toContain(studentName);
    expect(serializedContext).not.toContain(feedbackStudent.rows[0]!.email);
    const feedbackGeneration = await feedbacks.recordGenerationSuccess(
      professorId,
      feedbackId,
      feedbackContext,
      {
        model: "fixture-feedback-v1",
        origin: "fixture",
        suggestion: {
          strengths: ["Acerto na questão objetiva."],
          improvements: ["Detalhar a justificativa."],
          message: "Continue praticando frações equivalentes.",
        },
      },
    );
    expect(feedbackGeneration).toMatchObject({
      version: 1,
      status: "succeeded",
    });
    expect(
      await feedbacks.review(professorId, feedbackId, {
        generationId: feedbackGeneration!.id,
        content: "Você acertou a objetiva; detalhe melhor a justificativa.",
        teacherObservation: "Texto revisado pelo professor.",
      }),
    ).toBe("reviewed");
    expect(await feedbacks.send(professorId, feedbackId)).toBe("sent");
    expect(await feedbacks.send(professorId, feedbackId)).toBe("sent");
    const globalFeedbackId = await feedbacks.create(
      professorId,
      {
        scope: "global",
        classId,
        title: "Aviso para a turma",
        content: "Revisem o conteúdo antes da próxima aula.",
        links: [],
        materialIds: [],
      },
      1_440,
    );
    expect(await feedbacks.send(professorId, globalFeedbackId)).toBe("sent");
    await testPool.query(
      "UPDATE feedback SET editable_until = now() - interval '1 minute' WHERE id = $1",
      [globalFeedbackId],
    );
    expect(
      await feedbacks.update(professorId, globalFeedbackId, {
        content: "Tentativa fora da janela.",
      }),
    ).toBe("window_expired");
    expect(await feedbacks.remove(professorId, globalFeedbackId)).toBe(
      "window_expired",
    );
    const feedbackList = await feedbacks.list(professorId);
    expect(feedbackList).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: feedbackId,
          scope: "individual",
          status: "sent",
          origin: "fixture",
          latestGeneration: expect.objectContaining({ version: 1 }),
          notification: expect.objectContaining({ status: "pending" }),
          history: [
            expect.objectContaining({ action: "created", origin: "teacher" }),
            expect.objectContaining({
              action: "ai_suggestion",
              origin: "fixture",
            }),
            expect.objectContaining({
              action: "teacher_revision",
              origin: "teacher",
            }),
            expect.objectContaining({ action: "sent", origin: "system" }),
          ],
        }),
        expect.objectContaining({
          id: globalFeedbackId,
          scope: "global",
          status: "sent",
          canEdit: false,
        }),
      ]),
    );
    const notifications = await testPool.query<{ count: string }>(
      "SELECT count(*) FROM notification_outbox WHERE feedback_id = ANY($1::uuid[])",
      [[feedbackId, globalFeedbackId]],
    );
    expect(Number(notifications.rows[0]!.count)).toBe(2);
    const notificationEmailSender = {
      isFixture: false,
      send: vi.fn().mockResolvedValue(undefined),
    };
    const announcementSender = new FixtureClassroomAnnouncementSender();
    const announce = vi.spyOn(announcementSender, "ensureAnnouncement");
    const notificationWorker = new NotificationDeliveryWorker(
      new NotificationRepository(testPool),
      collectionAuth as unknown as AuthRepository,
      notificationEmailSender,
      announcementSender,
      {
        intervalMs: 30_000,
        maxAttempts: 5,
        leaseSeconds: 300,
        retryBaseSeconds: 60,
        maxAgeDays: 7,
      },
      { error: vi.fn(), warn: vi.fn() } as never,
    );
    await expect(notificationWorker.runCycle()).resolves.toEqual({
      status: "completed",
      delivered: 2,
      failed: 0,
      skipped: 0,
    });
    // O feedback individual sai por e-mail; o aviso global vira anúncio no Classroom.
    expect(notificationEmailSender.send).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ courseId: expect.any(String) }),
    );
    const completedNotifications = await testPool.query<{
      recipient_kind: string;
      status: string;
      channel: string;
    }>(
      `SELECT notification.recipient_kind, notification.status, notification.channel
       FROM notification_outbox notification
       WHERE notification.feedback_id = ANY($1::uuid[])
       ORDER BY notification.recipient_kind::text`,
      [[feedbackId, globalFeedbackId]],
    );
    expect(completedNotifications.rows).toEqual([
      {
        recipient_kind: "class_group",
        status: "sent",
        channel: "google_classroom",
      },
      { recipient_kind: "student", status: "sent", channel: "email" },
    ]);
    const notificationDeliveries = await testPool.query<{ count: string }>(
      `SELECT count(*) FROM notification_delivery
       WHERE notification_id IN (
         SELECT id FROM notification_outbox
         WHERE feedback_id = ANY($1::uuid[])
       ) AND status = 'sent'`,
      [[feedbackId, globalFeedbackId]],
    );
    expect(Number(notificationDeliveries.rows[0]!.count)).toBe(2);
    // Fila velha: depois de 7 dias a notificação é descartada como EXPIRED e não
    // volta para a fila; a recente segue saindo.
    const expiryClient = await testPool.connect();
    try {
      await expiryClient.query("BEGIN");
      await expiryClient.query(
        `UPDATE notification_outbox SET status = 'pending', error_code = NULL,
           sent_at = NULL, revision = revision + 1,
           created_at = CASE WHEN feedback_id = $2 THEN now() - interval '8 days'
             ELSE now() END
         WHERE feedback_id = ANY($1::uuid[])`,
        [[feedbackId, globalFeedbackId], globalFeedbackId],
      );
      const expiryEmail = {
        isFixture: false,
        send: vi.fn().mockResolvedValue(undefined),
      };
      const expiryAnnouncements = new FixtureClassroomAnnouncementSender();
      const expiryAnnounce = vi.spyOn(
        expiryAnnouncements,
        "ensureAnnouncement",
      );
      const expiryLogger = { error: vi.fn(), warn: vi.fn() };
      const expiryWorker = new NotificationDeliveryWorker(
        new NotificationRepository(expiryClient),
        collectionAuth as unknown as AuthRepository,
        expiryEmail,
        expiryAnnouncements,
        {
          intervalMs: 30_000,
          maxAttempts: 5,
          leaseSeconds: 300,
          retryBaseSeconds: 60,
          maxAgeDays: 7,
        },
        expiryLogger as never,
      );
      await expect(expiryWorker.runCycle()).resolves.toEqual({
        status: "completed",
        delivered: 1,
        failed: 0,
        skipped: 0,
      });
      await expect(expiryWorker.runCycle()).resolves.toEqual({
        status: "completed",
        delivered: 0,
        failed: 0,
        skipped: 0,
      });
      expect(expiryEmail.send).toHaveBeenCalledTimes(1);
      expect(expiryAnnounce).not.toHaveBeenCalled();
      expect(expiryLogger.warn).toHaveBeenCalledWith(
        { expired: 1, maxAgeDays: 7 },
        "stale notifications discarded as expired",
      );
      const expiredRows = await expiryClient.query<{
        recipient_kind: string;
        status: string;
        error_code: string | null;
        deliveries: number;
      }>(
        `SELECT notification.recipient_kind, notification.status,
                notification.error_code,
                (SELECT count(*)::int FROM notification_delivery delivery
                 WHERE delivery.notification_id = notification.id
                   AND delivery.revision = notification.revision) AS deliveries
         FROM notification_outbox notification
         WHERE notification.feedback_id = ANY($1::uuid[])
         ORDER BY notification.recipient_kind::text`,
        [[feedbackId, globalFeedbackId]],
      );
      expect(expiredRows.rows).toEqual([
        {
          recipient_kind: "class_group",
          status: "failed",
          error_code: "EXPIRED",
          deliveries: 0,
        },
        {
          recipient_kind: "student",
          status: "sent",
          error_code: null,
          deliveries: 1,
        },
      ]);
    } finally {
      await expiryClient.query("ROLLBACK");
      expiryClient.release();
    }
    const bulletins = new BulletinsRepository(testPool);
    const bulletinService = new BulletinService(
      bulletins,
      new FixtureBulletinEmailSender(),
    );
    const bulletinInput = {
      classId,
      studentIds: [reconciliation.studentId!],
      periodType: "monthly" as const,
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      title: "Boletim de outubro",
      teacherComment: "Bom progresso no período.",
      onlyBelowAverage: false,
    };
    await expect(
      bulletinService.generate(professorId, {
        ...bulletinInput,
        periodStart: "2025-01-01",
        periodEnd: "2025-01-31",
      }),
    ).rejects.toThrow("BULLETIN_WITHOUT_GRADES");
    await expect(
      bulletinService.generate(professorId, {
        ...bulletinInput,
        onlyBelowAverage: true,
        averageThreshold: 7,
      }),
    ).rejects.toThrow("BULLETIN_FILTER_EMPTY");
    const bulletinIds = await bulletinService.generate(
      professorId,
      bulletinInput,
    );
    expect(bulletinIds).toHaveLength(1);
    const bulletinId = bulletinIds[0]!;
    const bulletinList = await bulletins.list(professorId);
    expect(bulletinList).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: bulletinId,
          studentId: reconciliation.studentId,
          average: 8,
          status: "generated",
          activities: [expect.objectContaining({ grade: 8 })],
          feedbacks: [expect.objectContaining({ feedbackId })],
        }),
      ]),
    );
    expect(
      await bulletins.getPdf(otherProfessor.rows[0]!.id, bulletinId),
    ).toBeNull();
    const pdf = await bulletins.getPdf(professorId, bulletinId);
    expect(new TextDecoder().decode(pdf!.data.slice(0, 5))).toBe("%PDF-");
    expect(await bulletinService.send(professorId, bulletinId)).toEqual({
      status: "sent",
    });
    expect(await bulletinService.send(professorId, bulletinId)).toEqual({
      status: "sent",
    });
    expect(await bulletins.list(professorId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: bulletinId,
          status: "sent",
          deliveries: [
            expect.objectContaining({ attemptNumber: 1, status: "sent" }),
            expect.objectContaining({ attemptNumber: 2, status: "sent" }),
          ],
        }),
      ]),
    );
    await expect(
      testPool.query("UPDATE bulletin SET average = 1 WHERE id = $1", [
        bulletinId,
      ]),
    ).rejects.toThrow("bulletin historical copy is immutable");
    expect(await feedbacks.remove(professorId, feedbackId)).toBe("deleted");
    await expect(
      testPool.query(
        "UPDATE feedback_history SET origin = 'system' WHERE feedback_id = $1",
        [feedbackId],
      ),
    ).rejects.toThrow("feedback history is immutable");
    expect(await repository.archive(professorId, activityId)).toBe(true);
    const archived = await repository.get(professorId, activityId);
    expect(archived?.responseCount).toBe(3);
    expect(archived?.archivedAt).not.toBeNull();
  }, 60_000);

  it("creates a Google professor and resolves identity only from the session", async () => {
    const encryptionKey =
      "9f238e1d4c7a6b05d9e31074a2c8f61b3d0e7a95c4b1286f50d2a9e37c6148fb";
    const config: AppConfig = {
      nodeEnv: "test",
      apiHost: "127.0.0.1",
      apiPort: 3000,
      databaseUrl: testUrl.toString(),
      webOrigin: "http://localhost:5173",
      logLevel: "silent",
      shutdownTimeoutMs: 10_000,
      google: {
        clientId: "test-client",
        clientSecret: "test-secret",
        redirectUri: "http://localhost:3000/api/auth/google/callback",
      },
      openai: {
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-5-mini",
      },
      email: {},
      tokenEncryptionKey: encryptionKey,
      sessionTtlSeconds: 28_800,
      integrationMonitorIntervalMs: 300_000,
      feedbackEditWindowMinutes: 1_440,
      notificationWorkerIntervalMs: 30_000,
      notificationMaxAttempts: 5,
      notificationLeaseSeconds: 300,
      notificationRetryBaseSeconds: 60,
      notificationMaxAgeDays: 7,
      materialStorageDirectory: "storage/materials-test",
      materialStorageBackend: "local",
      materialStoragePrefix: "materials-test",
      materialUploadMaxBytes: 104_857_600,
      enableDevAuth: false,
      rateLimitMax: 300,
      dataRetentionDays: 365,
    };
    let issuedState = "";
    const gateway: GoogleGateway = {
      configured: true,
      createAuthorizationUrl: ({ state }) => {
        issuedState = state;
        return `https://accounts.example.invalid/authorize?state=${state}`;
      },
      exchangeCode: vi.fn().mockResolvedValue({
        profile: {
          subject: "google-subject-integration-test",
          email: "oauth.professor@example.invalid",
          displayName: "Professor OAuth Fictício",
        },
        credential: {
          accessToken: "access-token-sensitive",
          refreshToken: "refresh-token-sensitive",
          scopes: ["openid", "email"],
        },
      }),
      probe: vi.fn(),
      revoke: vi.fn(),
    };
    const app = await createApp({
      config,
      database: testPool,
      googleGateway: gateway,
      startMonitor: false,
    });

    try {
      const start = await app.inject({
        method: "GET",
        url: "/api/auth/google/start",
      });
      expect(start.statusCode).toBe(302);
      expect(issuedState).not.toBe("");

      const callback = await app.inject({
        method: "GET",
        url: `/api/auth/google/callback?code=authorization-code&state=${encodeURIComponent(issuedState)}`,
      });
      expect(callback.statusCode).toBe(302);
      expect(callback.headers.location).toContain("auth=success");
      const cookie = callback.headers["set-cookie"]?.split(";", 1)[0];
      expect(cookie).toContain("educai_session=");

      const shell = await app.inject({
        method: "GET",
        url: "/api/professor/shell?professorId=00000000-0000-0000-0000-000000000000",
        headers: { cookie: cookie! },
      });
      expect(shell.statusCode).toBe(200);
      expect(shell.json()).toMatchObject({
        data: {
          identity: {
            email: "oauth.professor@example.invalid",
            provider: "google",
          },
        },
      });

      const storedTokens = await testPool.query<{
        access_token_ciphertext: string;
        refresh_token_ciphertext: string;
      }>(
        `SELECT access_token_ciphertext, refresh_token_ciphertext
         FROM google_oauth_credential credential
         JOIN professor ON professor.id = credential.professor_id
         WHERE professor.email = 'oauth.professor@example.invalid'`,
      );
      expect(storedTokens.rows[0]?.access_token_ciphertext).not.toContain(
        "access-token-sensitive",
      );
      expect(storedTokens.rows[0]?.refresh_token_ciphertext).not.toContain(
        "refresh-token-sensitive",
      );

      const repository = new AuthRepository(
        testPool,
        new TokenCipher(encryptionKey),
        config.sessionTtlSeconds,
      );
      expect(
        await repository.consumeAuthorizationState(issuedState),
      ).toBeNull();

      // A BNCC importada em produção usa IDs derivados de hash, sem versão RFC.
      const hashId = () => {
        const id = randomUUID();
        return `${id.slice(0, 14)}d${id.slice(15, 19)}6${id.slice(20)}`;
      };
      const hashArea = await testPool.query<{ id: string }>(
        `INSERT INTO curriculum_area (name, source_label)
         VALUES ($1, 'BNCC') RETURNING id`,
        [`Ciências ${randomUUID()}`],
      );
      const hashSyllabusId = hashId();
      const hashSkillId = hashId();
      await testPool.query(
        `INSERT INTO syllabus
         (id, curriculum_area_id, curricular_component, school_year, description, source_label)
         VALUES ($1, $2, 'Ciências', 'ef-ano-06', 'Matéria e energia.', 'BNCC')`,
        [hashSyllabusId, hashArea.rows[0]!.id],
      );
      await testPool.query(
        `INSERT INTO bncc_skill
         (id, syllabus_id, code, knowledge_object, description, source_label, is_official)
         VALUES ($1, $2, $3, 'Misturas', 'Classificar misturas.', 'BNCC', true)`,
        [
          hashSkillId,
          hashSyllabusId,
          `H${randomUUID().replaceAll("-", "").slice(0, 20)}`,
        ],
      );
      const createdClass = await app.inject({
        method: "POST",
        url: "/api/classes",
        headers: { cookie: cookie! },
        payload: {
          name: "Turma com BNCC importada",
          schoolYear: "ef-ano-06",
          localAccessCode: `HASH${randomUUID().slice(0, 8)}`,
        },
      });
      expect(createdClass.statusCode).toBe(201);
      const createdPlan = await app.inject({
        method: "POST",
        url: "/api/lesson-plans",
        headers: { cookie: cookie! },
        payload: {
          title: "Misturas no cotidiano",
          curricularComponent: "Ciências",
          schoolYear: "ef-ano-06",
          objectives: "Classificar misturas.",
          contents: "Misturas homogêneas e heterogêneas.",
          methodology: "Experimentos em grupo.",
          evaluationStrategy: "Relatório da experiência.",
          durationMinutes: 50,
          classIds: [createdClass.json().data.id],
          syllabusId: hashSyllabusId,
          bnccSkillIds: [hashSkillId],
          materialIds: [],
        },
      });
      expect(createdPlan.statusCode).toBe(201);

      const exported = await app.inject({
        method: "GET",
        url: "/api/privacy/export",
        headers: { cookie: cookie! },
      });
      expect(exported.statusCode).toBe(200);
      expect(exported.json()).toMatchObject({
        profile: { email: "oauth.professor@example.invalid" },
      });

      const deletion = await app.inject({
        method: "DELETE",
        url: "/api/privacy/account",
        headers: {
          cookie: cookie!,
          "content-type": "application/json",
        },
        payload: { confirmation: "EXCLUIR" },
      });
      expect(deletion.statusCode).toBe(204);
      const afterDeletion = await app.inject({
        method: "GET",
        url: "/api/professor/shell",
        headers: { cookie: cookie! },
      });
      expect(afterDeletion.statusCode).toBe(401);
      const anonymized = await testPool.query<{
        email: string;
        display_name: string;
        google_subject: string | null;
      }>(
        `SELECT email::text, display_name, google_subject FROM professor
         WHERE email::text LIKE 'deleted+%@example.invalid'`,
      );
      expect(anonymized.rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            display_name: "Conta excluída",
            google_subject: null,
          }),
        ]),
      );
      const privacyRequests = await testPool.query<{ count: string }>(
        "SELECT count(*) FROM privacy_request WHERE status = 'completed'",
      );
      expect(Number(privacyRequests.rows[0]!.count)).toBeGreaterThanOrEqual(2);
      const auditEvents = await testPool.query<{ count: string }>(
        "SELECT count(*) FROM audit_event WHERE route = '/api/privacy/account'",
      );
      expect(Number(auditEvents.rows[0]!.count)).toBe(1);
      await expect(
        testPool.query(
          "UPDATE audit_event SET action = 'changed' WHERE route = '/api/privacy/account'",
        ),
      ).rejects.toThrow("audit event is immutable");
    } finally {
      await app.close();
    }
  }, 60_000);
});
