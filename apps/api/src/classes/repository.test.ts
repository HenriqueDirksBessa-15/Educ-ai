import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "../database.js";
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
    expect(firstValues[5]).not.toEqual(secondValues[5]);
  });
});
