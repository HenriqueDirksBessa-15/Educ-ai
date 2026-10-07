CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE notification_preference AS ENUM ('visual', 'email', 'both');
CREATE TYPE record_origin AS ENUM ('local', 'google', 'spreadsheet', 'access_code');
CREATE TYPE enrollment_status AS ENUM ('active', 'restricted', 'pending');
CREATE TYPE integration_service AS ENUM ('google_oauth', 'google_classroom', 'google_forms', 'openai');
CREATE TYPE integration_availability AS ENUM ('active', 'inactive');

CREATE TABLE professor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_subject text UNIQUE,
  email citext NOT NULL UNIQUE,
  display_name varchar(100) NOT NULL,
  profile_image_url text,
  notification_preference notification_preference NOT NULL DEFAULT 'visual',
  is_fixture boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT professor_display_name_not_blank CHECK (btrim(display_name) <> '')
);

CREATE TABLE curriculum_area (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  source_label text NOT NULL,
  is_fixture boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT curriculum_area_source_unique UNIQUE (name, source_label),
  CONSTRAINT curriculum_area_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT curriculum_area_source_not_blank CHECK (btrim(source_label) <> '')
);

CREATE TABLE syllabus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_area_id uuid NOT NULL REFERENCES curriculum_area(id) ON DELETE RESTRICT,
  curricular_component varchar(100) NOT NULL,
  school_year varchar(20) NOT NULL,
  description text NOT NULL,
  source_label text NOT NULL,
  is_fixture boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT syllabus_reference_unique UNIQUE (
    curriculum_area_id,
    curricular_component,
    school_year,
    source_label
  ),
  CONSTRAINT syllabus_component_not_blank CHECK (btrim(curricular_component) <> ''),
  CONSTRAINT syllabus_year_not_blank CHECK (btrim(school_year) <> ''),
  CONSTRAINT syllabus_description_not_blank CHECK (btrim(description) <> '')
);

CREATE TABLE bncc_skill (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  syllabus_id uuid NOT NULL REFERENCES syllabus(id) ON DELETE RESTRICT,
  code varchar(30) NOT NULL UNIQUE,
  thematic_unit varchar(150),
  knowledge_object varchar(200) NOT NULL,
  description text NOT NULL,
  source_label text NOT NULL,
  is_official boolean NOT NULL DEFAULT false,
  is_fixture boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bncc_skill_code_not_blank CHECK (btrim(code) <> ''),
  CONSTRAINT bncc_skill_knowledge_not_blank CHECK (btrim(knowledge_object) <> ''),
  CONSTRAINT bncc_skill_description_not_blank CHECK (btrim(description) <> '')
);

CREATE TABLE class_group (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid NOT NULL REFERENCES professor(id) ON DELETE RESTRICT,
  google_classroom_id text UNIQUE,
  name varchar(100) NOT NULL,
  description text,
  school_year varchar(20) NOT NULL,
  local_access_code citext NOT NULL UNIQUE,
  origin record_origin NOT NULL DEFAULT 'local',
  is_fixture boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT class_group_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT class_group_year_not_blank CHECK (btrim(school_year) <> ''),
  CONSTRAINT class_group_code_not_blank CHECK (btrim(local_access_code::text) <> ''),
  CONSTRAINT class_group_origin CHECK (origin IN ('local', 'google'))
);

CREATE TABLE student (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_subject text UNIQUE,
  name varchar(100) NOT NULL,
  email citext NOT NULL UNIQUE,
  is_fixture boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_name_not_blank CHECK (btrim(name) <> '')
);

CREATE TABLE enrollment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_group_id uuid NOT NULL REFERENCES class_group(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES student(id) ON DELETE RESTRICT,
  status enrollment_status NOT NULL DEFAULT 'active',
  origin record_origin NOT NULL,
  external_enrollment_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enrollment_student_per_class_unique UNIQUE (class_group_id, student_id)
);

CREATE TABLE integration_status (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  service integration_service NOT NULL,
  status integration_availability NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  error_code varchar(80),
  error_message text,
  is_fixture boolean NOT NULL DEFAULT false,
  CONSTRAINT integration_active_without_error CHECK (
    status = 'inactive' OR (error_code IS NULL AND error_message IS NULL)
  )
);

CREATE INDEX class_group_professor_id_idx ON class_group (professor_id);
CREATE INDEX syllabus_curriculum_area_id_idx ON syllabus (curriculum_area_id);
CREATE INDEX syllabus_lookup_idx ON syllabus (curricular_component, school_year);
CREATE INDEX bncc_skill_syllabus_id_idx ON bncc_skill (syllabus_id);
CREATE INDEX enrollment_class_group_id_idx ON enrollment (class_group_id);
CREATE INDEX enrollment_student_id_idx ON enrollment (student_id);
CREATE INDEX enrollment_status_idx ON enrollment (class_group_id, status);
CREATE UNIQUE INDEX enrollment_external_per_class_unique
  ON enrollment (class_group_id, external_enrollment_id)
  WHERE external_enrollment_id IS NOT NULL;
CREATE INDEX integration_status_latest_idx ON integration_status (service, checked_at DESC, id DESC);

CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER professor_set_updated_at
BEFORE UPDATE ON professor
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER curriculum_area_set_updated_at
BEFORE UPDATE ON curriculum_area
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER syllabus_set_updated_at
BEFORE UPDATE ON syllabus
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER bncc_skill_set_updated_at
BEFORE UPDATE ON bncc_skill
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER class_group_set_updated_at
BEFORE UPDATE ON class_group
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER student_set_updated_at
BEFORE UPDATE ON student
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER enrollment_set_updated_at
BEFORE UPDATE ON enrollment
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
