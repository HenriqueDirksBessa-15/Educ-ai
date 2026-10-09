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
  });
});
