import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "../database.js";
import { CurriculumRepository } from "./repository.js";

describe("curriculum repository", () => {
  it("groups syllabus skills and preserves source metadata", async () => {
    const database = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            syllabus_id: "5d73ea1d-9ab8-4384-960e-3a6f00e6328a",
            area_name: "Matemática",
            curricular_component: "Matemática",
            school_year: "5º ano",
            description: "Fixture curricular para testes.",
            source_label: "SIMULATED",
            syllabus_fixture: true,
            skill_id: "c8cc5db9-8f68-4ae4-b1a2-5db6b5c7f2bb",
            skill_code: "SIM-NAO-OFICIAL-01",
            thematic_unit: "Números",
            knowledge_object: "Operações",
            skill_description: "Referência simulada.",
            skill_source_label: "SIMULATED",
            skill_official: false,
            skill_fixture: true,
          },
        ],
      }),
    };

    const result = await new CurriculumRepository(
      database as unknown as DatabaseClient,
    ).search({ component: "Matemática", schoolYear: "5º ano" });

    expect(result.reviewRequired).toBe(false);
    expect(result.data[0]?.skills[0]).toMatchObject({
      code: "SIM-NAO-OFICIAL-01",
      isOfficial: false,
      isFixture: true,
    });
  });

  it("returns a review fallback when a skill is absent", async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const result = await new CurriculumRepository(
      database as unknown as DatabaseClient,
    ).search({ skillCode: "EF00SIMULADA" });

    expect(result).toMatchObject({
      data: [],
      reviewRequired: true,
      reason: "SKILL_NOT_FOUND",
    });
  });
});
