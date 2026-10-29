import type {
  Material,
  MaterialFileMetadata,
  MaterialLinkInput,
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
  title: string;
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
  archived_at: Date | null;
  created_at: Date;
  class_names: string[];
  class_ids: string[];
  bncc_skill_ids: string[];
  has_published_content: boolean;
};

export class TimelineRepository {
  constructor(private readonly database: DatabaseClient) {}

  async listMilestones(
    professorId: string,
    classId?: string,
  ): Promise<Milestone[]> {
    const result = (await this.database.query(
      `SELECT milestone.id, milestone.class_group_id AS class_id,
              class_group.name AS class_name, milestone.title,
              milestone.milestone_date::text,
              milestone.type, milestone.description, milestone.archived_at,
              EXISTS (SELECT 1 FROM published_milestone_link link
                      WHERE link.milestone_id = milestone.id) AS has_published_content
       FROM timeline_milestone milestone
       JOIN class_group ON class_group.id = milestone.class_group_id
       WHERE milestone.professor_id = $1
         AND ($2::uuid IS NULL OR milestone.class_group_id = $2)
       ORDER BY milestone.milestone_date, milestone.id`,
      [professorId, classId ?? null],
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
       (professor_id, class_group_id, title, milestone_date, type, description)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        professorId,
        input.classId,
        input.title,
        input.date,
        input.type,
        input.description,
      ],
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
           type = COALESCE($4, type), description = COALESCE($5, description),
           title = COALESCE($6, title)
       WHERE id = $1 AND professor_id = $2`,
      [
        milestoneId,
        professorId,
        input.date ?? null,
        input.type ?? null,
        input.description ?? null,
        input.title ?? null,
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
    archived = false,
  ): Promise<Material[]> {
    const result = (await this.database.query(
      `SELECT material.id, material.title, material.description, material.category,
              material.url, material.file_name, material.mime_type, material.size_bytes::int,
              material.archived_at, material.created_at,
              COALESCE(array_agg(DISTINCT class_group.id) FILTER (WHERE class_group.id IS NOT NULL), '{}') AS class_ids,
              COALESCE(array_agg(DISTINCT class_group.name) FILTER (WHERE class_group.name IS NOT NULL), '{}') AS class_names,
              COALESCE(array_agg(DISTINCT material_bncc_skill.bncc_skill_id) FILTER (WHERE material_bncc_skill.bncc_skill_id IS NOT NULL), '{}') AS bncc_skill_ids,
              EXISTS (SELECT 1 FROM published_material_link link
                      WHERE link.material_id = material.id) AS has_published_content
       FROM material
       LEFT JOIN material_class ON material_class.material_id = material.id
       LEFT JOIN class_group ON class_group.id = material_class.class_group_id
       LEFT JOIN material_bncc_skill ON material_bncc_skill.material_id = material.id
       WHERE material.professor_id = $1 AND ($2::material_category IS NULL OR material.category = $2)
         AND ((material.archived_at IS NOT NULL) IS NOT DISTINCT FROM $3::boolean)
       GROUP BY material.id
       ORDER BY material.created_at DESC, material.id`,
      [professorId, category ?? null, archived],
    )) as QueryResult<MaterialRow>;
    return result.rows.map((row) => this.toMaterial(row));
  }

  async createMaterialLink(
    professorId: string,
    input: MaterialLinkInput,
  ): Promise<string> {
    const result = (await this.database.query(
      `WITH requested_classes AS (
         SELECT unnest($2::uuid[]) AS id
       ), owned_classes AS (
         SELECT class_group.id FROM class_group
         JOIN requested_classes ON requested_classes.id = class_group.id
         WHERE class_group.professor_id = $1
       ), requested_skills AS (
         SELECT unnest($3::uuid[]) AS id
       ), valid_skills AS (
         SELECT bncc_skill.id FROM bncc_skill
         JOIN requested_skills ON requested_skills.id = bncc_skill.id
       ), inserted_material AS (
         INSERT INTO material (professor_id, title, description, category, url)
         SELECT $1, $4, $5, $6, $7
         WHERE (SELECT count(*) FROM owned_classes) = cardinality($2::uuid[])
           AND (SELECT count(*) FROM valid_skills) = cardinality($3::uuid[])
         RETURNING id
       ), linked_classes AS (
         INSERT INTO material_class (material_id, class_group_id)
         SELECT inserted_material.id, owned_classes.id
         FROM inserted_material CROSS JOIN owned_classes
       ), linked_skills AS (
         INSERT INTO material_bncc_skill (material_id, bncc_skill_id)
         SELECT inserted_material.id, valid_skills.id
         FROM inserted_material CROSS JOIN valid_skills
       )
       SELECT id FROM inserted_material`,
      [
        professorId,
        input.classIds,
        input.bnccSkillIds,
        input.title,
        input.description ?? null,
        input.category,
        input.url,
      ],
    )) as QueryResult<{ id: string }>;
    const materialId = result.rows[0]?.id;
    if (!materialId) throw new Error("MATERIAL_RELATION_NOT_FOUND");
    return materialId;
  }

  async createMaterialFile(
    professorId: string,
    input: MaterialFileMetadata & {
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      storageKey: string;
    },
  ): Promise<string> {
    const result = (await this.database.query(
      `WITH requested_classes AS (
         SELECT unnest($2::uuid[]) AS id
       ), owned_classes AS (
         SELECT class_group.id FROM class_group
         JOIN requested_classes ON requested_classes.id = class_group.id
         WHERE class_group.professor_id = $1
       ), requested_skills AS (
         SELECT unnest($3::uuid[]) AS id
       ), valid_skills AS (
         SELECT bncc_skill.id FROM bncc_skill
         JOIN requested_skills ON requested_skills.id = bncc_skill.id
       ), inserted_material AS (
         INSERT INTO material
           (professor_id, title, description, category, file_name, mime_type,
            size_bytes, storage_key)
         SELECT $1, $4, $5, $6, $7, $8, $9, $10
         WHERE (SELECT count(*) FROM owned_classes) = cardinality($2::uuid[])
           AND (SELECT count(*) FROM valid_skills) = cardinality($3::uuid[])
         RETURNING id
       ), linked_classes AS (
         INSERT INTO material_class (material_id, class_group_id)
         SELECT inserted_material.id, owned_classes.id
         FROM inserted_material CROSS JOIN owned_classes
       ), linked_skills AS (
         INSERT INTO material_bncc_skill (material_id, bncc_skill_id)
         SELECT inserted_material.id, valid_skills.id
         FROM inserted_material CROSS JOIN valid_skills
       )
       SELECT id FROM inserted_material`,
      [
        professorId,
        input.classIds,
        input.bnccSkillIds,
        input.title,
        input.description ?? null,
        input.category,
        input.fileName,
        input.mimeType,
        input.sizeBytes,
        input.storageKey,
      ],
    )) as QueryResult<{ id: string }>;
    const materialId = result.rows[0]?.id;
    if (!materialId) throw new Error("MATERIAL_RELATION_NOT_FOUND");
    return materialId;
  }

  async getMaterialFile(
    professorId: string,
    materialId: string,
  ): Promise<{
    storageKey: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  } | null> {
    const result = (await this.database.query(
      `SELECT storage_key, file_name, mime_type, size_bytes::int
       FROM material
       WHERE id = $1 AND professor_id = $2 AND archived_at IS NULL
         AND storage_key IS NOT NULL AND file_name IS NOT NULL
         AND mime_type IS NOT NULL AND size_bytes IS NOT NULL`,
      [materialId, professorId],
    )) as QueryResult<{
      storage_key: string;
      file_name: string;
      mime_type: string;
      size_bytes: number;
    }>;
    const row = result.rows[0];
    return row
      ? {
          storageKey: row.storage_key,
          fileName: row.file_name,
          mimeType: row.mime_type,
          sizeBytes: row.size_bytes,
        }
      : null;
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
  ): Promise<{
    status: "deleted" | "not_found" | "linked";
    storageKey: string | null;
  }> {
    const result = (await this.database.query(
      `SELECT material.id, material.storage_key,
              EXISTS (SELECT 1 FROM published_material_link link
                      WHERE link.material_id = material.id) AS linked
       FROM material WHERE material.id = $1 AND material.professor_id = $2`,
      [materialId, professorId],
    )) as QueryResult<{
      id: string;
      linked: boolean;
      storage_key: string | null;
    }>;
    const row = result.rows[0];
    if (!row) return { status: "not_found", storageKey: null };
    if (row.linked) return { status: "linked", storageKey: row.storage_key };
    await this.database.query(
      `WITH deleted_classes AS (
         DELETE FROM material_class WHERE material_id = $1
       ), deleted_skills AS (
         DELETE FROM material_bncc_skill WHERE material_id = $1
       )
       DELETE FROM material WHERE id = $1 AND professor_id = $2`,
      [materialId, professorId],
    );
    return { status: "deleted", storageKey: row.storage_key };
  }

  private toMilestone(row: MilestoneRow): Milestone {
    return {
      id: row.id,
      classId: row.class_id,
      className: row.class_name,
      title: row.title,
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
      classIds: row.class_ids,
      bnccSkillIds: row.bncc_skill_ids,
      url: row.url,
      fileName: row.file_name,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      classNames: row.class_names,
      isArchived: row.archived_at !== null,
      hasPublishedContent: row.has_published_content,
      createdAt: row.created_at.toISOString(),
    };
  }
}
