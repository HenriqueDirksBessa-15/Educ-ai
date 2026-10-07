import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

    expect(Number(professors.rows[0]?.count)).toBe(2);
    expect(Number(classes.rows[0]?.count)).toBe(2);
    expect(Number(expectedOwnership.rows[0]?.count)).toBe(2);
  }, 60_000);
});
