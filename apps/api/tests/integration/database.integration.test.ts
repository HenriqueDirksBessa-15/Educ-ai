import { randomUUID } from "node:crypto";
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

loadRootEnvironment();
const baseUrl = process.env.DATABASE_URL;
const describeWithDatabase = baseUrl ? describe : describe.skip;

describeWithDatabase("PostgreSQL migrations and seeds", () => {
  const databaseName = `educai_test_${randomUUID().replaceAll("-", "")}`;
  const parsedUrl = new URL(baseUrl!);
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
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1",
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
      ]),
    );
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
    const plan = await testPool.query<{ id: string }>(
      `INSERT INTO lesson_plan
       (professor_id, title, curricular_component, school_year, objectives,
        contents, methodology, evaluation_strategy)
       VALUES ($1, 'Plano para atividade', 'Matemática', '5º ano',
        'Compreender frações', 'Frações', 'Resolução de problemas',
        'Avaliação formativa') RETURNING id`,
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
    expect(await repository.publish(professorId, activityId)).toBe("published");
    expect(
      await repository.update(professorId, activityId, { title: "Alterada" }),
    ).toBe("locked");
    await expect(
      testPool.query("UPDATE activity SET title = 'Forçada' WHERE id = $1", [
        activityId,
      ]),
    ).rejects.toThrow("published activity structure is immutable");

    await testPool.query(
      `INSERT INTO activity_response
       (activity_id, external_student_id, submitted_at)
       VALUES ($1, 'student-fixture', now())`,
      [activityId],
    );
    expect(await repository.archive(professorId, activityId)).toBe(true);
    const archived = await repository.get(professorId, activityId);
    expect(archived?.responseCount).toBe(1);
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
      tokenEncryptionKey: encryptionKey,
      sessionTtlSeconds: 28_800,
      integrationMonitorIntervalMs: 300_000,
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
    } finally {
      await app.close();
    }
  }, 60_000);
});
