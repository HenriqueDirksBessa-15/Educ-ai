CREATE TYPE education_stage AS ENUM (
  'early_childhood',
  'elementary_1',
  'elementary_2',
  'high_school'
);

CREATE TABLE class_curriculum_profile (
  class_group_id uuid PRIMARY KEY REFERENCES class_group(id) ON DELETE CASCADE,
  education_stage education_stage NOT NULL,
  school_year varchar(20) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT class_curriculum_year_not_blank CHECK (btrim(school_year) <> '')
);

CREATE TABLE class_curriculum_component (
  class_group_id uuid NOT NULL REFERENCES class_curriculum_profile(class_group_id) ON DELETE CASCADE,
  curricular_component varchar(100) NOT NULL,
  PRIMARY KEY (class_group_id, curricular_component),
  CONSTRAINT class_curriculum_component_not_blank CHECK (btrim(curricular_component) <> '')
);

CREATE INDEX class_curriculum_component_lookup_idx
  ON class_curriculum_component (curricular_component, class_group_id);

CREATE TRIGGER class_curriculum_profile_set_updated_at
BEFORE UPDATE ON class_curriculum_profile
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
