import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient, TransactionClient } from "../database.js";
import { ClassesRepository } from "./repository.js";

const professorA = "5d73ea1d-9ab8-4384-960e-3a6f00e6328a";
const professorB = "4bb5d98d-f00b-41ac-8969-3ae902ce6f30";

describe("classes repository boundaries", () => {
  it("always scopes class listing by the authenticated professor", async () => {
    const database = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    await new ClassesRepository(database as unknown as DatabaseClient).list(
      professorA,
    );

    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE professor_id = $1"),
      [professorA],
    );
    expect(database.query).not.toHaveBeenCalledWith(expect.any(String), [
      professorB,
    ]);
  });

  it("uses an upsert for repeated student synchronization", async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: "class-id" }] })
        .mockResolvedValueOnce({ rows: [{ id: "student-id" }] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    await new ClassesRepository(
      database as unknown as DatabaseClient,
    ).enrollStudent(professorA, "class-id", {
      name: "Aluno Teste",
      email: "aluno@example.invalid",
      origin: "spreadsheet",
    });

    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT (class_group_id, student_id)"),
      expect.any(Array),
    );
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining(
        "student.origin = 'google' AND EXCLUDED.origin <> 'google'",
      ),
      expect.any(Array),
    );
  });

  it("keeps Google course identity scoped to each professor", async () => {
    const database = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    const repository = new ClassesRepository(
      database as unknown as DatabaseClient,
    );
    const course = {
      googleClassroomId: "shared-google-course",
      name: "Turma compartilhada",
      description: null,
      schoolYear: "2026",
    };

    await repository.syncGoogleCourses(professorA, [course]);
    await repository.syncGoogleCourses(professorB, [course]);

    const [firstSql, firstValues] = database.query.mock.calls[0] as [
      string,
      unknown[],
    ];
    const [, secondValues] = database.query.mock.calls[1] as [
      string,
      unknown[],
    ];
    expect(firstSql).toContain(
      "ON CONFLICT (professor_id, google_classroom_id)",
    );
    expect(firstSql).not.toContain("professor_id = EXCLUDED.professor_id");
    expect(firstSql).toContain("class_curriculum_profile");
    expect(firstValues[5]).not.toEqual(secondValues[5]);
  });

  it("links only an owned local class to the created Google course", async () => {
    const database = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: "class-id" }] }),
    };
    const repository = new ClassesRepository(
      database as unknown as DatabaseClient,
    );

    await expect(
      repository.linkGoogleCourse(professorA, "class-id", "course-id"),
    ).resolves.toBe(true);
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining("origin = 'local'"),
      ["class-id", professorA, "course-id"],
    );
  });

  it("upserts Google students without clearing a local restriction", async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const repository = new ClassesRepository(
      database as unknown as DatabaseClient,
    );

    await repository.syncGoogleStudents(professorA, "class-id", [
      {
        googleSubject: "google-student-1",
        name: "Aluno Teste",
        email: "aluno@example.invalid",
      },
    ]);

    const [sql, values] = database.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("enrollment.status = 'restricted'");
    expect(String(values[2])).toContain("google-student-1");
  });

  it("replaces the curriculum profile only for an owned class", async () => {
    const query = vi.fn(async (sql: string) =>
      sql.includes("UPDATE class_group")
        ? { rows: [{ id: "class-id" }] }
        : { rows: [] },
    );
    const client = { query, release: vi.fn() } as unknown as TransactionClient;
    const database = {
      query: vi.fn(),
      connect: vi.fn().mockResolvedValue(client),
    };
    const repository = new ClassesRepository(
      database as unknown as DatabaseClient,
    );

    await expect(
      repository.setCurriculumProfile(professorA, "class-id", {
        educationStage: "elementary_2",
        schoolYear: "8º ano EF",
        curricularComponents: ["Matemática", "Ciências"],
      }),
    ).resolves.toBe(true);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN",
      expect.stringContaining("UPDATE class_group"),
      expect.stringContaining("INSERT INTO class_curriculum_profile"),
      expect.stringContaining("DELETE FROM class_curriculum_component"),
      expect.stringContaining("INSERT INTO class_curriculum_component"),
      "COMMIT",
    ]);
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("WHERE id = $2 AND professor_id = $1"),
      [professorA, "class-id", "8º ano EF"],
    );
    expect(client.release).toHaveBeenCalled();
  });
});
