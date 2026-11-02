import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { AuthRepository } from "../../src/auth/repository.js";
import { TokenCipher } from "../../src/auth/crypto.js";
import { loadConfig } from "../../src/config.js";
import { runMigrations } from "../../src/db/migrations.js";
import { findRepositoryRoot } from "../../src/db/paths.js";

// Integração HTTP + autenticação + PostgreSQL real, sem serviços externos.
const databaseUrl = process.env.DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
const key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

integration("Auditoria TFC: currículo de turma via API e PostgreSQL", () => {
  const databaseName = `educai_audit_${randomUUID().replaceAll("-", "")}`;
  const base = new URL(databaseUrl || "postgresql://skip:skip@localhost/skip");
  const admin = new URL(base);
  admin.pathname = "/postgres";
  const test = new URL(base);
  test.pathname = "/" + databaseName;
  const adminPool = new Pool({ connectionString: admin.toString() });
  let pool: Pool;
  let app: Awaited<ReturnType<typeof createApp>>;
  let ownerCookie: string;
  let otherCookie: string;
  const profile = (components: string[]) => ({
    educationStage: "elementary_2",
    schoolYear: "8º ano EF",
    curricularComponents: components,
  });
  async function createClass(): Promise<string> {
    const response = await app.inject({
      method: "POST", url: "/api/classes",
      headers: { cookie: ownerCookie },
      payload: {
        name: "Turma de auditoria", schoolYear: "8º ano EF",
        localAccessCode: `audit-${randomUUID().slice(0, 12)}`,
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json().data.id as string;
  }
  async function components(id: string): Promise<string[]> {
    const rows = await pool.query<{ curricular_component: string }>(
      "SELECT curricular_component FROM class_curriculum_component WHERE class_group_id = $1 ORDER BY curricular_component",
      [id],
    );
    return rows.rows.map((r) => r.curricular_component);
  }
  async function update(id: string, cookie: string, values: string[]) {
    return app.inject({
      method: "PUT", url: `/api/classes/${id}/curriculum`,
      headers: { cookie }, payload: profile(values),
    });
  }
  beforeAll(async () => {
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);
    pool = new Pool({ connectionString: test.toString() });
    await runMigrations(pool, join(findRepositoryRoot(), "database", "migrations"));
    const config = loadConfig({
      NODE_ENV: "test", DATABASE_URL: test.toString(),
      WEB_ORIGIN: "http://localhost:5173",
      TOKEN_ENCRYPTION_KEY: key, BACKGROUND_WORKERS_ENABLED: "false",
    });
    const auth = new AuthRepository(pool, new TokenCipher(key), config.sessionTtlSeconds);
    const owner = await auth.upsertProfessor({
      subject: `owner-${randomUUID()}`,
      email: `owner-${randomUUID()}@example.invalid`,
      displayName: "Professor A",
    });
    const other = await auth.upsertProfessor({
      subject: `other-${randomUUID()}`,
      email: `other-${randomUUID()}@example.invalid`,
      displayName: "Professor B",
    });
    ownerCookie = `educai_session=${(await auth.createSession(owner)).token}`;
    otherCookie = `educai_session=${(await auth.createSession(other)).token}`;
    app = await createApp({ config, database: pool, startMonitor: false });
  }, 90_000);
  afterAll(async () => {
    if (app) await app.close();
    if (pool) await pool.end();
    await adminPool.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [databaseName],
    );
    await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await adminPool.end();
  }, 90_000);
  it("persiste o currículo via API e o recupera no PostgreSQL", async () => {
    const id = await createClass();
    const response = await update(id, ownerCookie, ["Matemática", "Ciências"]);
    expect(response.statusCode).toBe(200);
    const detail = await app.inject({
      method: "GET", url: `/api/classes/${id}`,
      headers: { cookie: ownerCookie },
    });
    expect(detail.statusCode).toBe(200);
    expect([...detail.json().data.curriculum.curricularComponents].sort()).toEqual(["Ciências", "Matemática"]);
    expect(await components(id)).toEqual(["Ciências", "Matemática"]);
  }, 60_000);
  it("substitui componentes repetidos sem erro HTTP 500", async () => {
    const id = await createClass();
    for (const c of [
      ["Matemática", "Ciências"],
      ["Matemática", "História"],
      ["Matemática", "História"],
    ]) expect((await update(id, ownerCookie, c)).statusCode).toBe(200);
    expect(await components(id)).toEqual(["História", "Matemática"]);
  }, 60_000);
  it("impede que outro professor consulte ou altere a turma", async () => {
    const id = await createClass();
    expect((await update(id, ownerCookie, ["Matemática"])).statusCode).toBe(200);
    const read = await app.inject({
      method: "GET", url: `/api/classes/${id}`,
      headers: { cookie: otherCookie },
    });
    expect(read.statusCode).toBe(404);
    expect((await update(id, otherCookie, ["História"])).statusCode).toBe(404);
    expect(await components(id)).toEqual(["Matemática"]);
  }, 60_000);
  it("rejeita currículo inválido sem alterar dados persistidos", async () => {
    const id = await createClass();
    expect((await update(id, ownerCookie, ["Matemática"])).statusCode).toBe(200);
    const invalid = await update(id, ownerCookie, ["Matemática", "Matemática"]);
    expect(invalid.statusCode).toBe(400);
    expect(await components(id)).toEqual(["Matemática"]);
  }, 60_000);
});
