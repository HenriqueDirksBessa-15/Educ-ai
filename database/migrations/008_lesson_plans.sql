CREATE TABLE lesson_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid NOT NULL REFERENCES professor(id) ON DELETE RESTRICT,
  title varchar(160) NOT NULL,
  curricular_component varchar(100) NOT NULL,
  school_year varchar(20) NOT NULL,
  objectives text NOT NULL,
  contents text NOT NULL,
  methodology text NOT NULL,
  evaluation_strategy text NOT NULL,
  syllabus_id uuid REFERENCES syllabus(id) ON DELETE RESTRICT,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lesson_plan_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT lesson_plan_component_not_blank CHECK (btrim(curricular_component) <> ''),
  CONSTRAINT lesson_plan_year_not_blank CHECK (btrim(school_year) <> ''),
  CONSTRAINT lesson_plan_objectives_not_blank CHECK (btrim(objectives) <> ''),
  CONSTRAINT lesson_plan_contents_not_blank CHECK (btrim(contents) <> ''),
  CONSTRAINT lesson_plan_methodology_not_blank CHECK (btrim(methodology) <> ''),
  CONSTRAINT lesson_plan_evaluation_not_blank CHECK (btrim(evaluation_strategy) <> '')
);

CREATE TABLE lesson_plan_class (
  lesson_plan_id uuid NOT NULL REFERENCES lesson_plan(id) ON DELETE RESTRICT,
  class_group_id uuid NOT NULL REFERENCES class_group(id) ON DELETE RESTRICT,
  PRIMARY KEY (lesson_plan_id, class_group_id)
);

CREATE TABLE lesson_plan_bncc_skill (
  lesson_plan_id uuid NOT NULL REFERENCES lesson_plan(id) ON DELETE RESTRICT,
  bncc_skill_id uuid NOT NULL REFERENCES bncc_skill(id) ON DELETE RESTRICT,
  PRIMARY KEY (lesson_plan_id, bncc_skill_id)
);

CREATE TABLE lesson_plan_material (
  lesson_plan_id uuid NOT NULL REFERENCES lesson_plan(id) ON DELETE RESTRICT,
  material_id uuid NOT NULL REFERENCES material(id) ON DELETE RESTRICT,
  PRIMARY KEY (lesson_plan_id, material_id)
);

CREATE TABLE lesson_plan_revision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_plan_id uuid NOT NULL REFERENCES lesson_plan(id) ON DELETE RESTRICT,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lesson_plan_revision_version_unique UNIQUE (lesson_plan_id, version)
);

-- Activities from later stages register their published usage here. Until then,
-- plans remain editable and this boundary prevents structural edits after use.
CREATE TABLE published_lesson_plan_link (
  lesson_plan_id uuid PRIMARY KEY REFERENCES lesson_plan(id) ON DELETE RESTRICT
);

CREATE INDEX lesson_plan_professor_archived_idx
  ON lesson_plan (professor_id, archived_at, updated_at DESC);
CREATE INDEX lesson_plan_class_class_idx
  ON lesson_plan_class (class_group_id, lesson_plan_id);
CREATE INDEX lesson_plan_revision_plan_idx
  ON lesson_plan_revision (lesson_plan_id, version DESC);

CREATE TRIGGER lesson_plan_set_updated_at
BEFORE UPDATE ON lesson_plan
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
