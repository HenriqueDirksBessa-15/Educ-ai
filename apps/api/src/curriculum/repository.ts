import type {
  CurriculumSearchQuery,
  CurriculumSearchResponse,
} from "@educai/contracts";

import type { DatabaseClient } from "../database.js";

type QueryResult<Row> = { rows: Row[] };
type CurriculumRow = {
  syllabus_id: string;
  area_name: string;
  curricular_component: string;
  school_year: string;
  description: string;
  source_label: string;
  syllabus_fixture: boolean;
  skill_id: string | null;
  skill_code: string | null;
  thematic_unit: string | null;
  knowledge_object: string | null;
  skill_description: string | null;
  skill_source_label: string | null;
  skill_official: boolean | null;
  skill_fixture: boolean | null;
};

export class CurriculumRepository {
  constructor(private readonly database: DatabaseClient) {}

  async search(
    query: CurriculumSearchQuery,
  ): Promise<CurriculumSearchResponse> {
    const result = (await this.database.query(
      `SELECT syllabus.id AS syllabus_id,
              area.name AS area_name,
              syllabus.curricular_component,
              syllabus.school_year,
              syllabus.description,
              syllabus.source_label,
              syllabus.is_fixture AS syllabus_fixture,
              skill.id AS skill_id,
              skill.code AS skill_code,
              skill.thematic_unit,
              skill.knowledge_object,
              skill.description AS skill_description,
              skill.source_label AS skill_source_label,
              skill.is_official AS skill_official,
              skill.is_fixture AS skill_fixture
       FROM syllabus
       JOIN curriculum_area area ON area.id = syllabus.curriculum_area_id
       LEFT JOIN bncc_skill skill ON skill.syllabus_id = syllabus.id
       WHERE ($1::text IS NULL OR lower(syllabus.curricular_component) = lower($1))
         AND ($2::text IS NULL OR lower(syllabus.school_year) = lower($2))
         AND ($3::text IS NULL OR skill.code = $3)
       ORDER BY area.name, syllabus.curricular_component, syllabus.school_year,
                skill.code`,
      [
        query.component ?? null,
        query.schoolYear ?? null,
        query.skillCode ?? null,
      ],
    )) as QueryResult<CurriculumRow>;

    const grouped = new Map<string, CurriculumSearchResponse["data"][number]>();
    for (const row of result.rows) {
      const current = grouped.get(row.syllabus_id) ?? {
        id: row.syllabus_id,
        areaName: row.area_name,
        curricularComponent: row.curricular_component,
        schoolYear: row.school_year,
        description: row.description,
        sourceLabel: row.source_label,
        isFixture: row.syllabus_fixture,
        skills: [],
      };
      if (
        row.skill_id &&
        row.skill_code &&
        row.knowledge_object &&
        row.skill_description
      ) {
        current.skills.push({
          id: row.skill_id,
          code: row.skill_code,
          thematicUnit: row.thematic_unit,
          knowledgeObject: row.knowledge_object,
          description: row.skill_description,
          sourceLabel: row.skill_source_label ?? row.source_label,
          isOfficial: row.skill_official ?? false,
          isFixture: row.skill_fixture ?? false,
        });
      }
      grouped.set(row.syllabus_id, current);
    }

    const data = [...grouped.values()];
    const reviewRequired =
      query.skillCode !== undefined &&
      data.every((item) => item.skills.length === 0);
    return {
      data,
      reviewRequired,
      reason: reviewRequired
        ? "SKILL_NOT_FOUND"
        : data.length === 0
          ? "NO_CURRICULUM_MATCH"
          : null,
    };
  }
}
