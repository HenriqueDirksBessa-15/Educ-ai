import type {
  Material,
  MaterialInput,
  Milestone,
  MilestoneCreate,
  MilestoneUpdate,
} from "@educai/contracts";

import type { DatabaseClient } from "../database.js";

type QueryResult<Row> = { rows: Row[]; rowCount?: number | null };
type MilestoneRow = {
  id: string;
  class_id: string;
  class_name: string;
  milestone_date: string;
  type: Milestone["type"];
  description: string;
  archived_at: Date | null;
  has_published_content: boolean;
};
type MaterialRow = {
  id: string;
  title: string;
  description: string | null;
  category: Material["category"];
  url: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  storage_key: string | null;
  archived_at: Date | null;
  created_at: Date;
  class_names: string[];
  has_published_content: boolean;
};

export class TimelineRepository {
  constructor(private readonly database: DatabaseClient) {}

  async listMilestones(professorId: string): Promise<Milestone[]> {
    const result = (await this.database.query(
      `SELECT milestone.id, milestone.class_group_id AS class_id,
              class_group.name AS class_name, milestone.milestone_date::text,
              milestone.type, milestone.description, milestone.archived_at,
              EXISTS (SELECT 1 FROM published_milestone_link link
                      WHERE link.milestone_id = milestone.id) AS has_published_content
       FROM timeline_milestone milestone
       JOIN class_group ON class_group.id = milestone.class_group_id
       WHERE milestone.professor_id = $1
       ORDER BY milestone.milestone_date, milestone.id`,
      [professorId],
    )) as QueryResult<MilestoneRow>;
    return result.rows.map((row) => this.toMilestone(row));
  }

  async createMilestone(
    professorId: string,
    input: MilestoneCreate,
  ): Promise<string> {
    const ownership = (await this.database.query(
      "SELECT id FROM class_group WHERE id = $1 AND professor_id = $2",
      [input.classId, professorId],
    )) as QueryResult<{ id: string }>;
    if (!ownership.rows[0]) throw new Error("CLASS_NOT_FOUND");
    const result = (await this.database.query(
      `INSERT INTO timeline_milestone
       (professor_id, class_group_id, milestone_date, type, description)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [professorId, input.classId, input.date, input.type, input.description],
    )) as QueryResult<{ id: string }>;
    return result.rows[0]!.id;
  }

  async updateMilestone(
    professorId: string,
    milestoneId: string,
    input: MilestoneUpdate,
  ): Promise<"updated" | "not_found" | "past"> {
    const current = (await this.database.query(
      `SELECT milestone_date::text FROM timeline_milestone
       WHERE id = $1 AND professor_id = $2 AND archived_at IS NULL`,
      [milestoneId, professorId],
    )) as QueryResult<{ milestone_date: string }>;
    if (!current.rows[0]) return "not_found";
    if (current.rows[0].milestone_date < new Date().toISOString().slice(0, 10))
      return "past";
    await this.database.query(
      `UPDATE timeline_milestone
       SET milestone_date = COALESCE($3, milestone_date),
           type = COALESCE($4, type), description = COALESCE($5, description)
       WHERE id = $1 AND professor_id = $2`,
      [
        milestoneId,
        professorId,
        input.date ?? null,
        input.type ?? null,
        input.description ?? null,
      ],
    );
    return "updated";
  }

  async deleteMilestone(
    professorId: string,
    milestoneId: string,
    confirmed: boolean,
  ): Promise<"deleted" | "not_found" | "confirmation_required"> {
    const result = (await this.database.query(
      `SELECT milestone.id,
              EXISTS (SELECT 1 FROM published_milestone_link link
                      WHERE link.milestone_id = milestone.id) AS linked
       FROM timeline_milestone milestone
       WHERE milestone.id = $1 AND milestone.professor_id = $2`,
      [milestoneId, professorId],
    )) as QueryResult<{ id: string; linked: boolean }>;
    const row = result.rows[0];
    if (!row) return "not_found";
    if (row.linked && !confirmed) return "confirmation_required";
    await this.database.query(
      "DELETE FROM timeline_milestone WHERE id = $1 AND professor_id = $2",
      [milestoneId, professorId],
    );
    return "deleted";
  }

  async listMaterials(
    professorId: string,
    category?: Material["category"],
  ): Promise<Material[]> {
    const result = (await this.database.query(
      `SELECT material.id, material.title, material.description, material.category,
              material.url, material.file_name, material.mime_type, material.size_bytes,
              material.storage_key, material.archived_at, material.created_at,
              COALESCE(array_agg(DISTINCT class_group.name) FILTER (WHERE class_group.name IS NOT NULL), '{}') AS class_names,
              EXISTS (SELECT 1 FROM published_material_link link
                      WHERE link.material_id = material.id) AS has_published_content
       FROM material
       LEFT JOIN material_class ON material_class.material_id = material.id
       LEFT JOIN class_group ON class_group.id = material_class.class_group_id
       WHERE material.professor_id = $1 AND ($2::material_category IS NULL OR material.category = $2)
       GROUP BY material.id
       ORDER BY material.created_at DESC, material.id`,
      [professorId, category ?? null],
    )) as QueryResult<MaterialRow>;
    return result.rows.map((row) => this.toMaterial(row));
  }

  async createMaterial(
    professorId: string,
    input: MaterialInput,
  ): Promise<string> {
    const classes = (await this.database.query(
      `SELECT id FROM class_group WHERE professor_id = $1 AND id = ANY($2::uuid[])`,
      [professorId, input.classIds],
    )) as QueryResult<{ id: string }>;
    if (classes.rows.length !== new Set(input.classIds).size)
      throw new Error("CLASS_NOT_FOUND");
    const result = (await this.database.query(
      `INSERT INTO material
       (professor_id, title, description, category, url, file_name, mime_type, size_bytes, storage_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        professorId,
        input.title,
        input.description ?? null,
        input.category,
        input.url ?? null,
        input.fileName ?? null,
        input.mimeType ?? null,
        input.sizeBytes ?? null,
        input.storageKey ?? null,
      ],
    )) as QueryResult<{ id: string }>;
    const materialId = result.rows[0]!.id;
    for (const classId of input.classIds) {
      await this.database.query(
        "INSERT INTO material_class (material_id, class_group_id) VALUES ($1, $2)",
        [materialId, classId],
      );
    }
    for (const skillId of input.bnccSkillIds) {
      await this.database.query(
        "INSERT INTO material_bncc_skill (material_id, bncc_skill_id) VALUES ($1, $2)",
        [materialId, skillId],
      );
    }
    return materialId;
  }

  async archiveMaterial(
    professorId: string,
    materialId: string,
  ): Promise<boolean> {
    const result = (await this.database.query(
      `UPDATE material SET archived_at = COALESCE(archived_at, now())
       WHERE id = $1 AND professor_id = $2 RETURNING id`,
      [materialId, professorId],
    )) as QueryResult<{ id: string }>;
    return result.rows.length > 0;
  }

  async deleteMaterial(
    professorId: string,
    materialId: string,
  ): Promise<"deleted" | "not_found" | "linked"> {
    const result = (await this.database.query(
      `SELECT material.id,
              EXISTS (SELECT 1 FROM published_material_link link
                      WHERE link.material_id = material.id) AS linked
       FROM material WHERE material.id = $1 AND material.professor_id = $2`,
      [materialId, professorId],
    )) as QueryResult<{ id: string; linked: boolean }>;
    const row = result.rows[0];
    if (!row) return "not_found";
    if (row.linked) return "linked";
    await this.database.query(
      "DELETE FROM material WHERE id = $1 AND professor_id = $2",
      [materialId, professorId],
    );
    return "deleted";
  }

  private toMilestone(row: MilestoneRow): Milestone {
    return {
      id: row.id,
      classId: row.class_id,
      className: row.class_name,
      date: row.milestone_date,
      type: row.type,
      description: row.description,
      isPast: row.milestone_date < new Date().toISOString().slice(0, 10),
      isArchived: row.archived_at !== null,
      hasPublishedContent: row.has_published_content,
    };
  }

  private toMaterial(row: MaterialRow): Material {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      classIds: [],
      bnccSkillIds: [],
      url: row.url,
      fileName: row.file_name,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      storageKey: row.storage_key,
      classNames: row.class_names,
      isArchived: row.archived_at !== null,
      hasPublishedContent: row.has_published_content,
      createdAt: row.created_at.toISOString(),
    };
  }
}
