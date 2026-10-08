CREATE TYPE curriculum_load_status AS ENUM ('applied', 'failed');

CREATE TABLE curriculum_load (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_label text NOT NULL,
  source_version varchar(80) NOT NULL,
  source_uri text,
  checksum varchar(128) NOT NULL,
  status curriculum_load_status NOT NULL,
  error_code varchar(80),
  error_message text,
  is_fixture boolean NOT NULL DEFAULT false,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT curriculum_load_source_not_blank CHECK (btrim(source_label) <> ''),
  CONSTRAINT curriculum_load_version_not_blank CHECK (btrim(source_version) <> ''),
  CONSTRAINT curriculum_load_checksum_not_blank CHECK (btrim(checksum) <> ''),
  CONSTRAINT curriculum_load_status_error CHECK (
    status = 'applied' OR error_code IS NOT NULL
  ),
  CONSTRAINT curriculum_load_version_checksum_unique
    UNIQUE (source_label, source_version, checksum)
);

ALTER TABLE curriculum_area
  ADD COLUMN curriculum_load_id uuid REFERENCES curriculum_load(id) ON DELETE SET NULL;
ALTER TABLE syllabus
  ADD COLUMN curriculum_load_id uuid REFERENCES curriculum_load(id) ON DELETE SET NULL;
ALTER TABLE bncc_skill
  ADD COLUMN curriculum_load_id uuid REFERENCES curriculum_load(id) ON DELETE SET NULL;

CREATE TABLE curriculum_change (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  curriculum_load_id uuid NOT NULL REFERENCES curriculum_load(id) ON DELETE RESTRICT,
  entity_type varchar(40) NOT NULL,
  entity_id uuid NOT NULL,
  operation varchar(20) NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT curriculum_change_entity_not_blank CHECK (btrim(entity_type) <> ''),
  CONSTRAINT curriculum_change_operation CHECK (operation IN ('insert', 'update')),
  CONSTRAINT curriculum_change_unique UNIQUE (
    curriculum_load_id, entity_type, entity_id, operation
  )
);

CREATE INDEX curriculum_load_latest_idx
  ON curriculum_load (source_label, loaded_at DESC, id DESC);
CREATE INDEX curriculum_area_load_idx ON curriculum_area (curriculum_load_id);
CREATE INDEX syllabus_load_idx ON syllabus (curriculum_load_id);
CREATE INDEX bncc_skill_load_idx ON bncc_skill (curriculum_load_id);
CREATE INDEX curriculum_change_entity_idx
  ON curriculum_change (entity_type, entity_id, changed_at DESC);
