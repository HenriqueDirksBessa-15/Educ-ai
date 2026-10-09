CREATE TYPE classroom_sync_status AS ENUM ('never', 'active', 'failed');

ALTER TABLE class_group
  ADD COLUMN general_notice text,
  ADD COLUMN sync_status classroom_sync_status NOT NULL DEFAULT 'never',
  ADD COLUMN last_synced_at timestamptz,
  ADD COLUMN sync_error text;

ALTER TABLE student
  ADD COLUMN origin record_origin NOT NULL DEFAULT 'local',
  ADD COLUMN is_inconsistent boolean NOT NULL DEFAULT false,
  ADD COLUMN inconsistency_reason text;

ALTER TABLE enrollment
  ADD COLUMN last_synced_at timestamptz,
  ADD COLUMN validation_note text;

CREATE INDEX student_origin_idx ON student (origin, is_inconsistent);
CREATE INDEX enrollment_class_status_idx ON enrollment (class_group_id, status, updated_at DESC);
CREATE INDEX class_group_sync_idx ON class_group (professor_id, sync_status, last_synced_at DESC);
