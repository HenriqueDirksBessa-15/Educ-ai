import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "../database.js";
import { TimelineRepository } from "./repository.js";

const professorId = "5d73ea1d-9ab8-4384-960e-3a6f00e6328a";
const classId = "11111111-1111-4111-8111-111111111111";

describe("material repository boundaries", () => {
  it("creates the link and all relations in one atomic statement", async () => {
    const database = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: "material-id" }] }),
    };
    const repository = new TimelineRepository(
      database as unknown as DatabaseClient,
    );

    await expect(
      repository.createMaterialLink(professorId, {
        title: "Guia",
        category: "reading",
        classIds: [classId],
        bnccSkillIds: [],
        url: "https://example.invalid/guia",
      }),
    ).resolves.toBe("material-id");

    expect(database.query).toHaveBeenCalledTimes(1);
    const [sql, values] = database.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("WITH requested_classes");
    expect(sql).toContain("INSERT INTO material_class");
    expect(sql).toContain("INSERT INTO material_bncc_skill");
    expect(values).toEqual(
      expect.arrayContaining([
        professorId,
        [classId],
        "https://example.invalid/guia",
      ]),
    );
  });

  it("reports an invalid relation when the atomic insert returns no row", async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const repository = new TimelineRepository(
      database as unknown as DatabaseClient,
    );

    await expect(
      repository.createMaterialLink(professorId, {
        title: "Guia",
        category: "link",
        classIds: [classId],
        bnccSkillIds: [],
        url: "https://example.invalid/guia",
      }),
    ).rejects.toThrow("MATERIAL_RELATION_NOT_FOUND");
  });

  it("lists only the requested archive state and returns relation ids", async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    await new TimelineRepository(
      database as unknown as DatabaseClient,
    ).listMaterials(professorId, undefined, false);

    const [sql, values] = database.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain(
      "(material.archived_at IS NOT NULL) IS NOT DISTINCT FROM",
    );
    expect(sql).toContain("class_ids");
    expect(sql).toContain("bncc_skill_ids");
    expect(values).toEqual([professorId, null, false]);
  });
});
