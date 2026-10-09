CREATE TYPE milestone_type AS ENUM ('lesson', 'assessment', 'event', 'deadline', 'other');
CREATE TYPE material_category AS ENUM ('reading', 'presentation', 'video', 'image', 'link', 'other');

CREATE TABLE timeline_milestone (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid NOT NULL REFERENCES professor(id) ON DELETE RESTRICT,
  class_group_id uuid NOT NULL REFERENCES class_group(id) ON DELETE RESTRICT,
  milestone_date date NOT NULL,
  type milestone_type NOT NULL,
  description varchar(500) NOT NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT timeline_milestone_description_not_blank CHECK (btrim(description) <> '')
);

CREATE TABLE material (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid NOT NULL REFERENCES professor(id) ON DELETE RESTRICT,
  title varchar(160) NOT NULL,
  description text,
  category material_category NOT NULL,
  url text,
  file_name varchar(255),
  mime_type varchar(120),
  size_bytes bigint,
  storage_key varchar(500),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT material_source_present CHECK (url IS NOT NULL OR storage_key IS NOT NULL),
  CONSTRAINT material_size_nonnegative CHECK (size_bytes IS NULL OR size_bytes >= 0)
);

CREATE TABLE material_class (
  material_id uuid NOT NULL REFERENCES material(id) ON DELETE RESTRICT,
  class_group_id uuid NOT NULL REFERENCES class_group(id) ON DELETE RESTRICT,
  PRIMARY KEY (material_id, class_group_id)
);

CREATE TABLE material_bncc_skill (
  material_id uuid NOT NULL REFERENCES material(id) ON DELETE RESTRICT,
  bncc_skill_id uuid NOT NULL REFERENCES bncc_skill(id) ON DELETE RESTRICT,
  PRIMARY KEY (material_id, bncc_skill_id)
);

-- These tables reserve the linkage boundary for plans/activities introduced later.
-- Deletion is refused as soon as published content references a resource.
CREATE TABLE published_milestone_link (
  milestone_id uuid PRIMARY KEY REFERENCES timeline_milestone(id) ON DELETE RESTRICT
);

CREATE TABLE published_material_link (
  material_id uuid PRIMARY KEY REFERENCES material(id) ON DELETE RESTRICT
);

CREATE INDEX timeline_milestone_professor_date_idx
  ON timeline_milestone (professor_id, milestone_date, id);
CREATE INDEX material_professor_category_idx
  ON material (professor_id, category, archived_at);
CREATE INDEX material_class_class_idx ON material_class (class_group_id, material_id);

CREATE TRIGGER timeline_milestone_set_updated_at
BEFORE UPDATE ON timeline_milestone
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER material_set_updated_at
BEFORE UPDATE ON material
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
