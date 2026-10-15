import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient, TransactionClient } from "../database.js";
import { PlansRepository } from "./repository.js";

const professorId = "11111111-1111-4111-8111-111111111111";
const classId = "21111111-1111-4111-8111-111111111111";
const syllabusId = "31111111-1111-4111-8111-111111111111";
const skillId = "41111111-1111-4111-8111-111111111111";
const materialId = "51111111-1111-4111-8111-111111111111";
const planId = "61111111-1111-4111-8111-111111111111";

const input = {
  title: "Frações na prática",
  curricularComponent: "Matemática",
  schoolYear: "8º ano EF",
  objectives: "Resolver problemas com frações.",
  contents: "Frações equivalentes.",
  methodology: "Investigação em grupos.",
  evaluationStrategy: "Registro e discussão coletiva.",
  durationMinutes: 100,
  references: "BNCC.",
  classIds: [classId],
  syllabusId,
  bnccSkillIds: [skillId],
  materialIds: [materialId],
};

function transactionalDatabase(failOnMaterialLink = false) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("FROM class_group")) return { rows: [{ id: classId }] };
    if (sql.includes("FROM material")) return { rows: [{ id: materialId }] };
    if (sql.includes("FROM syllabus")) return { rows: [{ id: syllabusId }] };
    if (sql.includes("FROM bncc_skill")) return { rows: [{ id: skillId }] };
    if (sql.includes("INSERT INTO lesson_plan\n"))
      return { rows: [{ id: planId }] };
    if (failOnMaterialLink && sql.includes("INSERT INTO lesson_plan_material"))
      throw new Error("link failed");
    return { rows: [] };
  });
  const client = { query, release: vi.fn() } as unknown as TransactionClient;
  const database = {
    query: vi.fn(),
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as DatabaseClient;
  return { database, client, query };
}

describe("lesson plan transactions", () => {
  it("commits the plan, relations and revision as one transaction", async () => {
    const { database, query, client } = transactionalDatabase();

    await expect(
      new PlansRepository(database).create(professorId, input),
    ).resolves.toBe(planId);

    expect(query.mock.calls[0]![0]).toBe("BEGIN");
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO lesson_plan_revision"),
      expect.any(Array),
    );
    expect(query).toHaveBeenLastCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalled();
  });

  it("rolls back when a relation fails after the plan insert", async () => {
    const { database, query, client } = transactionalDatabase(true);

    await expect(
      new PlansRepository(database).create(professorId, input),
    ).rejects.toThrow("link failed");

    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(query).not.toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalled();
  });

  it("allows explicit approval of a manual draft but not an unreviewed generation", async () => {
    const database = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: planId }] }),
    } as unknown as DatabaseClient;

    await expect(
      new PlansRepository(database).approve(professorId, planId),
    ).resolves.toBe("approved");
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining("status IN ('draft', 'reviewed')"),
      [planId, professorId],
    );
  });
});
