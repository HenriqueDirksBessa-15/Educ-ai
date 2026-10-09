import type {
  LessonPlan,
  LessonPlanGeneration,
  LessonPlanInput,
  LessonPlanReview,
  LessonPlanSuggestion,
  LessonPlanUpdate,
} from "@educai/contracts";

import type { DatabaseClient } from "../database.js";
import type {
  LessonPlanGenerationResult,
  LessonPlanPromptContext,
} from "../openai/adapter.js";

type QueryResult<Row> = { rows: Row[]; rowCount?: number | null };
type PlanRow = {
  id: string;
  professor_id: string;
  title: string;
  curricular_component: string;
  school_year: string;
  objectives: string;
  contents: string;
  methodology: string;
  evaluation_strategy: string;
  syllabus_id: string | null;
  syllabus_description: string | null;
  class_names: string[];
  bncc_codes: string[];
  material_titles: string[];
  archived_at: Date | null;
  is_locked: boolean;
  status: LessonPlan["status"];
  reviewed_at: Date | null;
  approved_at: Date | null;
  generation_id: string | null;
  generation_version: number | null;
  generation_model: string | null;
  generation_origin: LessonPlanGeneration["origin"] | null;
  generation_status: LessonPlanGeneration["status"] | null;
  generation_suggestion: LessonPlanSuggestion | null;
  generation_error_code: string | null;
  generation_created_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export class PlansRepository {
  constructor(private readonly database: DatabaseClient) {}

  async list(professorId: string, archived = false): Promise<LessonPlan[]> {
    const result = (await this.database.query(this.planQuery(), [
      professorId,
      archived,
    ])) as QueryResult<PlanRow>;
    return result.rows.map((row) => this.toPlan(row));
  }

  async get(professorId: string, planId: string): Promise<LessonPlan | null> {
    const result = (await this.database.query(this.planQuery(true), [
      professorId,
      planId,
    ])) as QueryResult<PlanRow>;
    return result.rows[0] ? this.toPlan(result.rows[0]) : null;
  }

  async create(professorId: string, input: LessonPlanInput): Promise<string> {
    await this.assertReferences(professorId, input);
    const result = (await this.database.query(
      `INSERT INTO lesson_plan
       (professor_id, title, curricular_component, school_year, objectives,
        contents, methodology, evaluation_strategy, syllabus_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        professorId,
        input.title,
        input.curricularComponent,
        input.schoolYear,
        input.objectives,
        input.contents,
        input.methodology,
        input.evaluationStrategy,
        input.syllabusId ?? null,
      ],
    )) as QueryResult<{ id: string }>;
    const planId = result.rows[0]!.id;
    await this.replaceLinks(planId, input);
    await this.saveRevision(planId, 1, input);
    return planId;
  }

  async update(
    professorId: string,
    planId: string,
    input: LessonPlanUpdate,
  ): Promise<"updated" | "not_found" | "locked"> {
    const current = await this.get(professorId, planId);
    if (!current) return "not_found";
    if (current.isArchived || current.isLocked) return "locked";
    const merged: LessonPlanInput = {
      title: input.title ?? current.title,
      curricularComponent:
        input.curricularComponent ?? current.curricularComponent,
      schoolYear: input.schoolYear ?? current.schoolYear,
      objectives: input.objectives ?? current.objectives,
      contents: input.contents ?? current.contents,
      methodology: input.methodology ?? current.methodology,
      evaluationStrategy:
        input.evaluationStrategy ?? current.evaluationStrategy,
      classIds: input.classIds ?? [],
      syllabusId: input.syllabusId ?? current.syllabusId,
      bnccSkillIds: input.bnccSkillIds ?? [],
      materialIds: input.materialIds ?? [],
    };
    if (!input.classIds)
      merged.classIds = await this.idsFor(
        "lesson_plan_class",
        planId,
        "class_group_id",
      );
    if (!input.bnccSkillIds)
      merged.bnccSkillIds = await this.idsFor(
        "lesson_plan_bncc_skill",
        planId,
        "bncc_skill_id",
      );
    if (!input.materialIds)
      merged.materialIds = await this.idsFor(
        "lesson_plan_material",
        planId,
        "material_id",
      );
    await this.assertReferences(professorId, merged);
    await this.database.query(
      `UPDATE lesson_plan SET title = $3, curricular_component = $4,
       school_year = $5, objectives = $6, contents = $7, methodology = $8,
       evaluation_strategy = $9, syllabus_id = $10, status = 'draft',
       reviewed_at = NULL, approved_at = NULL
       WHERE id = $1 AND professor_id = $2`,
      [
        planId,
        professorId,
        merged.title,
        merged.curricularComponent,
        merged.schoolYear,
        merged.objectives,
        merged.contents,
        merged.methodology,
        merged.evaluationStrategy,
        merged.syllabusId ?? null,
      ],
    );
    await this.replaceLinks(planId, merged);
    await this.saveRevision(planId, await this.nextVersion(planId), merged);
    return "updated";
  }

  async reuse(professorId: string, planId: string): Promise<string | null> {
    const source = await this.get(professorId, planId);
    if (!source) return null;
    return this.create(professorId, {
      title: `${source.title} (cópia)`,
      curricularComponent: source.curricularComponent,
      schoolYear: source.schoolYear,
      objectives: source.objectives,
      contents: source.contents,
      methodology: source.methodology,
      evaluationStrategy: source.evaluationStrategy,
      classIds: await this.idsFor(
        "lesson_plan_class",
        planId,
        "class_group_id",
      ),
      syllabusId: source.syllabusId,
      bnccSkillIds: await this.idsFor(
        "lesson_plan_bncc_skill",
        planId,
        "bncc_skill_id",
      ),
      materialIds: await this.idsFor(
        "lesson_plan_material",
        planId,
        "material_id",
      ),
    });
  }

  async archive(professorId: string, planId: string): Promise<boolean> {
    const result = (await this.database.query(
      `UPDATE lesson_plan SET archived_at = COALESCE(archived_at, now())
       WHERE id = $1 AND professor_id = $2 RETURNING id`,
      [planId, professorId],
    )) as QueryResult<{ id: string }>;
    return result.rows.length > 0;
  }

  async recordGenerationSuccess(
    professorId: string,
    planId: string,
    context: LessonPlanPromptContext,
    result: LessonPlanGenerationResult,
  ): Promise<LessonPlanGeneration | null> {
    const plan = await this.get(professorId, planId);
    if (!plan) return null;
    const version = await this.nextGenerationVersion(planId);
    const inserted = (await this.database.query(
      `INSERT INTO lesson_plan_generation
       (lesson_plan_id, version, model, origin, status, prompt_context, suggestion)
       VALUES ($1, $2, $3, $4, 'succeeded', $5::jsonb, $6::jsonb)
       RETURNING id, created_at`,
      [
        planId,
        version,
        result.model,
        result.origin,
        JSON.stringify(context),
        JSON.stringify(result.suggestion),
      ],
    )) as QueryResult<{ id: string; created_at: Date }>;
    await this.database.query(
      `UPDATE lesson_plan SET status = 'generated', reviewed_at = NULL,
       approved_at = NULL WHERE id = $1 AND professor_id = $2`,
      [planId, professorId],
    );
    return {
      id: inserted.rows[0]!.id,
      planId,
      version,
      model: result.model,
      origin: result.origin,
      status: "succeeded",
      suggestion: result.suggestion,
      errorCode: null,
      createdAt: inserted.rows[0]!.created_at.toISOString(),
    };
  }

  async recordGenerationFailure(
    professorId: string,
    planId: string,
    context: LessonPlanPromptContext,
    model: string,
    origin: LessonPlanGeneration["origin"],
    errorCode: string,
  ): Promise<boolean> {
    const plan = await this.get(professorId, planId);
    if (!plan) return false;
    await this.database.query(
      `INSERT INTO lesson_plan_generation
       (lesson_plan_id, version, model, origin, status, prompt_context, error_code)
       VALUES ($1, $2, $3, $4, 'failed', $5::jsonb, $6)`,
      [
        planId,
        await this.nextGenerationVersion(planId),
        model,
        origin,
        JSON.stringify(context),
        errorCode,
      ],
    );
    return true;
  }

  async reviewGeneration(
    professorId: string,
    planId: string,
    review: LessonPlanReview,
  ): Promise<"reviewed" | "not_found" | "locked" | "generation_not_found"> {
    const plan = await this.get(professorId, planId);
    if (!plan) return "not_found";
    if (plan.isArchived || plan.isLocked) return "locked";
    const generation = (await this.database.query(
      `SELECT generation.model FROM lesson_plan_generation generation
       JOIN lesson_plan ON lesson_plan.id = generation.lesson_plan_id
       WHERE generation.id = $1 AND generation.lesson_plan_id = $2
         AND lesson_plan.professor_id = $3 AND generation.status = 'succeeded'`,
      [review.generationId, planId, professorId],
    )) as QueryResult<{ model: string }>;
    if (!generation.rows[0]) return "generation_not_found";
    await this.database.query(
      `UPDATE lesson_plan SET title = $3, objectives = $4, contents = $5,
       methodology = $6, evaluation_strategy = $7, status = 'reviewed',
       reviewed_at = now(), approved_at = NULL
       WHERE id = $1 AND professor_id = $2`,
      [
        planId,
        professorId,
        review.suggestion.title,
        review.suggestion.objectives,
        review.suggestion.contents,
        review.suggestion.methodology,
        review.suggestion.evaluationStrategy,
      ],
    );
    const snapshot: LessonPlanInput = {
      title: review.suggestion.title,
      curricularComponent: plan.curricularComponent,
      schoolYear: plan.schoolYear,
      objectives: review.suggestion.objectives,
      contents: review.suggestion.contents,
      methodology: review.suggestion.methodology,
      evaluationStrategy: review.suggestion.evaluationStrategy,
      classIds: await this.idsFor(
        "lesson_plan_class",
        planId,
        "class_group_id",
      ),
      syllabusId: plan.syllabusId,
      bnccSkillIds: await this.idsFor(
        "lesson_plan_bncc_skill",
        planId,
        "bncc_skill_id",
      ),
      materialIds: await this.idsFor(
        "lesson_plan_material",
        planId,
        "material_id",
      ),
    };
    await this.saveRevision(
      planId,
      await this.nextVersion(planId),
      snapshot,
      "ai_reviewed",
      generation.rows[0].model,
      review.generationId,
    );
    return "reviewed";
  }

  async approve(
    professorId: string,
    planId: string,
  ): Promise<"approved" | "not_found" | "review_required"> {
    const result = (await this.database.query(
      `UPDATE lesson_plan SET status = 'approved', approved_at = now()
       WHERE id = $1 AND professor_id = $2 AND status = 'reviewed'
       RETURNING id`,
      [planId, professorId],
    )) as QueryResult<{ id: string }>;
    if (result.rows[0]) return "approved";
    const plan = await this.get(professorId, planId);
    return plan ? "review_required" : "not_found";
  }

  private async assertReferences(
    professorId: string,
    input: LessonPlanInput,
  ): Promise<void> {
    const classes = (await this.database.query(
      `SELECT id FROM class_group WHERE professor_id = $1 AND id = ANY($2::uuid[])`,
      [professorId, input.classIds],
    )) as QueryResult<{ id: string }>;
    if (classes.rows.length !== new Set(input.classIds).size)
      throw new Error("CLASS_NOT_FOUND");
    if (input.materialIds.length > 0) {
      const materials = (await this.database.query(
        `SELECT id FROM material WHERE professor_id = $1 AND id = ANY($2::uuid[])`,
        [professorId, input.materialIds],
      )) as QueryResult<{ id: string }>;
      if (materials.rows.length !== new Set(input.materialIds).size)
        throw new Error("MATERIAL_NOT_FOUND");
    }
    if (input.syllabusId) {
      const syllabus = (await this.database.query(
        "SELECT id FROM syllabus WHERE id = $1",
        [input.syllabusId],
      )) as QueryResult<{ id: string }>;
      if (!syllabus.rows[0]) throw new Error("SYLLABUS_NOT_FOUND");
    }
  }

  private async replaceLinks(
    planId: string,
    input: LessonPlanInput,
  ): Promise<void> {
    await this.database.query(
      "DELETE FROM lesson_plan_class WHERE lesson_plan_id = $1",
      [planId],
    );
    await this.database.query(
      "DELETE FROM lesson_plan_bncc_skill WHERE lesson_plan_id = $1",
      [planId],
    );
    await this.database.query(
      "DELETE FROM lesson_plan_material WHERE lesson_plan_id = $1",
      [planId],
    );
    for (const id of input.classIds)
      await this.database.query(
        "INSERT INTO lesson_plan_class (lesson_plan_id, class_group_id) VALUES ($1, $2)",
        [planId, id],
      );
    for (const id of input.bnccSkillIds)
      await this.database.query(
        "INSERT INTO lesson_plan_bncc_skill (lesson_plan_id, bncc_skill_id) VALUES ($1, $2)",
        [planId, id],
      );
    for (const id of input.materialIds)
      await this.database.query(
        "INSERT INTO lesson_plan_material (lesson_plan_id, material_id) VALUES ($1, $2)",
        [planId, id],
      );
  }

  private async saveRevision(
    planId: string,
    version: number,
    snapshot: LessonPlanInput,
    origin = "manual",
    model: string | null = null,
    generationId: string | null = null,
  ): Promise<void> {
    await this.database.query(
      `INSERT INTO lesson_plan_revision
       (lesson_plan_id, version, snapshot, origin, model, generation_id)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6)`,
      [planId, version, JSON.stringify(snapshot), origin, model, generationId],
    );
  }

  private async nextGenerationVersion(planId: string): Promise<number> {
    const result = (await this.database.query(
      "SELECT COALESCE(MAX(version), 0) + 1 AS version FROM lesson_plan_generation WHERE lesson_plan_id = $1",
      [planId],
    )) as QueryResult<{ version: number }>;
    return result.rows[0]!.version;
  }

  private async nextVersion(planId: string): Promise<number> {
    const result = (await this.database.query(
      "SELECT COALESCE(MAX(version), 0) + 1 AS version FROM lesson_plan_revision WHERE lesson_plan_id = $1",
      [planId],
    )) as QueryResult<{ version: number }>;
    return result.rows[0]!.version;
  }

  private async idsFor(
    table: string,
    planId: string,
    column: string,
  ): Promise<string[]> {
    const result = (await this.database.query(
      `SELECT ${column} AS id FROM ${table} WHERE lesson_plan_id = $1`,
      [planId],
    )) as QueryResult<{ id: string }>;
    return result.rows.map((row) => row.id);
  }

  private planQuery(byId = false): string {
    return `SELECT lesson_plan.id, lesson_plan.professor_id, lesson_plan.title,
      lesson_plan.curricular_component, lesson_plan.school_year,
      lesson_plan.objectives, lesson_plan.contents, lesson_plan.methodology,
      lesson_plan.evaluation_strategy, lesson_plan.syllabus_id,
      syllabus.description AS syllabus_description, lesson_plan.archived_at,
      lesson_plan.status, lesson_plan.reviewed_at, lesson_plan.approved_at,
      lesson_plan.created_at, lesson_plan.updated_at,
      COALESCE(array_agg(DISTINCT class_group.name) FILTER (WHERE class_group.name IS NOT NULL), '{}') AS class_names,
      COALESCE(array_agg(DISTINCT bncc_skill.code) FILTER (WHERE bncc_skill.code IS NOT NULL), '{}') AS bncc_codes,
      COALESCE(array_agg(DISTINCT material.title) FILTER (WHERE material.title IS NOT NULL), '{}') AS material_titles,
      EXISTS (SELECT 1 FROM published_lesson_plan_link published WHERE published.lesson_plan_id = lesson_plan.id) AS is_locked
      , generation.id AS generation_id, generation.version AS generation_version,
      generation.model AS generation_model, generation.origin AS generation_origin,
      generation.status AS generation_status, generation.suggestion AS generation_suggestion,
      generation.error_code AS generation_error_code,
      generation.created_at AS generation_created_at
      FROM lesson_plan
      LEFT JOIN syllabus ON syllabus.id = lesson_plan.syllabus_id
      LEFT JOIN lesson_plan_class ON lesson_plan_class.lesson_plan_id = lesson_plan.id
      LEFT JOIN class_group ON class_group.id = lesson_plan_class.class_group_id
      LEFT JOIN lesson_plan_bncc_skill ON lesson_plan_bncc_skill.lesson_plan_id = lesson_plan.id
      LEFT JOIN bncc_skill ON bncc_skill.id = lesson_plan_bncc_skill.bncc_skill_id
      LEFT JOIN lesson_plan_material ON lesson_plan_material.lesson_plan_id = lesson_plan.id
      LEFT JOIN material ON material.id = lesson_plan_material.material_id
      LEFT JOIN LATERAL (
        SELECT id, version, model, origin, status, suggestion, error_code, created_at
        FROM lesson_plan_generation
        WHERE lesson_plan_id = lesson_plan.id
        ORDER BY version DESC LIMIT 1
      ) generation ON true
      WHERE lesson_plan.professor_id = $1
        AND ${byId ? "lesson_plan.id = $2" : "$2::boolean = (lesson_plan.archived_at IS NOT NULL)"}
      GROUP BY lesson_plan.id, syllabus.description, generation.id,
        generation.version, generation.model, generation.origin, generation.status,
        generation.suggestion, generation.error_code, generation.created_at`;
  }

  private toPlan(row: PlanRow): LessonPlan {
    return {
      id: row.id,
      professorId: row.professor_id,
      title: row.title,
      curricularComponent: row.curricular_component,
      schoolYear: row.school_year,
      objectives: row.objectives,
      contents: row.contents,
      methodology: row.methodology,
      evaluationStrategy: row.evaluation_strategy,
      classIds: [],
      syllabusId: row.syllabus_id,
      bnccSkillIds: [],
      materialIds: [],
      classNames: row.class_names,
      syllabusDescription: row.syllabus_description,
      bnccCodes: row.bncc_codes,
      materialTitles: row.material_titles,
      isArchived: row.archived_at !== null,
      isLocked: row.is_locked,
      status: row.status,
      reviewedAt: row.reviewed_at?.toISOString() ?? null,
      approvedAt: row.approved_at?.toISOString() ?? null,
      latestGeneration:
        row.generation_id &&
        row.generation_version &&
        row.generation_model &&
        row.generation_origin &&
        row.generation_status &&
        row.generation_created_at
          ? {
              id: row.generation_id,
              planId: row.id,
              version: row.generation_version,
              model: row.generation_model,
              origin: row.generation_origin,
              status: row.generation_status,
              suggestion: row.generation_suggestion,
              errorCode: row.generation_error_code,
              createdAt: row.generation_created_at.toISOString(),
            }
          : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
