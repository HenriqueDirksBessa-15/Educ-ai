CREATE TYPE feedback_scope AS ENUM ('individual', 'global');
CREATE TYPE feedback_status AS ENUM ('draft', 'generated', 'reviewed', 'sent', 'deleted');
CREATE TYPE feedback_origin AS ENUM ('manual', 'fixture', 'openai');
CREATE TYPE feedback_generation_status AS ENUM ('succeeded', 'failed');
CREATE TYPE feedback_history_action AS ENUM (
  'created', 'ai_suggestion', 'ai_failure', 'teacher_revision',
  'teacher_edit', 'sent', 'deleted'
);
CREATE TYPE feedback_history_origin AS ENUM ('teacher', 'fixture', 'openai', 'system');
CREATE TYPE notification_recipient_kind AS ENUM ('student', 'class_group');
CREATE TYPE notification_channel AS ENUM ('google_classroom', 'email');
CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed');

CREATE TABLE feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid NOT NULL REFERENCES professor(id) ON DELETE RESTRICT,
  scope feedback_scope NOT NULL,
  submission_id uuid REFERENCES activity_submission(id) ON DELETE RESTRICT,
  student_id uuid REFERENCES student(id) ON DELETE RESTRICT,
  activity_id uuid REFERENCES activity(id) ON DELETE RESTRICT,
  class_group_id uuid REFERENCES class_group(id) ON DELETE RESTRICT,
  title varchar(160) NOT NULL,
  content text NOT NULL,
  teacher_observation text,
  origin feedback_origin NOT NULL DEFAULT 'manual',
  status feedback_status NOT NULL DEFAULT 'draft',
  editable_until timestamptz NOT NULL,
  sent_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT feedback_content_not_blank CHECK (btrim(content) <> ''),
  CONSTRAINT feedback_scope_shape CHECK (
    (scope = 'individual' AND submission_id IS NOT NULL AND student_id IS NOT NULL
      AND activity_id IS NOT NULL AND class_group_id IS NULL)
    OR (scope = 'global' AND submission_id IS NULL AND student_id IS NULL
      AND activity_id IS NULL AND class_group_id IS NOT NULL)
  ),
  CONSTRAINT feedback_status_dates CHECK (
    (status = 'sent' AND sent_at IS NOT NULL AND deleted_at IS NULL)
    OR (status = 'deleted' AND deleted_at IS NOT NULL)
    OR (status IN ('draft', 'generated', 'reviewed')
      AND sent_at IS NULL AND deleted_at IS NULL)
  )
);

CREATE TABLE feedback_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES feedback(id) ON DELETE RESTRICT,
  label varchar(160) NOT NULL,
  url text NOT NULL,
  position smallint NOT NULL,
  CONSTRAINT feedback_link_position_unique UNIQUE (feedback_id, position),
  CONSTRAINT feedback_link_label_not_blank CHECK (btrim(label) <> ''),
  CONSTRAINT feedback_link_url_not_blank CHECK (btrim(url) <> '')
);

CREATE TABLE feedback_attachment (
  feedback_id uuid NOT NULL REFERENCES feedback(id) ON DELETE RESTRICT,
  material_id uuid NOT NULL REFERENCES material(id) ON DELETE RESTRICT,
  PRIMARY KEY (feedback_id, material_id)
);

CREATE TABLE feedback_generation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES feedback(id) ON DELETE RESTRICT,
  version integer NOT NULL,
  model varchar(120) NOT NULL,
  origin feedback_origin NOT NULL,
  status feedback_generation_status NOT NULL,
  prompt_context jsonb NOT NULL,
  suggestion jsonb,
  error_code varchar(120),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_generation_version_unique UNIQUE (feedback_id, version),
  CONSTRAINT feedback_generation_result CHECK (
    (status = 'succeeded' AND suggestion IS NOT NULL AND error_code IS NULL)
    OR (status = 'failed' AND suggestion IS NULL AND error_code IS NOT NULL)
  ),
  CONSTRAINT feedback_generation_origin CHECK (origin IN ('fixture', 'openai'))
);

CREATE TABLE feedback_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES feedback(id) ON DELETE RESTRICT,
  version integer NOT NULL,
  action feedback_history_action NOT NULL,
  origin feedback_history_origin NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_history_version_unique UNIQUE (feedback_id, version)
);

CREATE TABLE notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL UNIQUE REFERENCES feedback(id) ON DELETE RESTRICT,
  recipient_kind notification_recipient_kind NOT NULL,
  student_id uuid REFERENCES student(id) ON DELETE RESTRICT,
  class_group_id uuid REFERENCES class_group(id) ON DELETE RESTRICT,
  channel notification_channel NOT NULL,
  status notification_status NOT NULL DEFAULT 'pending',
  error_code varchar(120),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT notification_recipient_shape CHECK (
    (recipient_kind = 'student' AND student_id IS NOT NULL AND class_group_id IS NULL)
    OR (recipient_kind = 'class_group' AND student_id IS NULL AND class_group_id IS NOT NULL)
  )
);

CREATE INDEX feedback_professor_status_idx
  ON feedback (professor_id, status, created_at DESC);
CREATE INDEX feedback_student_idx ON feedback (student_id, created_at DESC)
  WHERE student_id IS NOT NULL;
CREATE INDEX feedback_class_idx ON feedback (class_group_id, created_at DESC)
  WHERE class_group_id IS NOT NULL;
CREATE INDEX feedback_generation_latest_idx
  ON feedback_generation (feedback_id, version DESC);
CREATE INDEX feedback_history_feedback_idx ON feedback_history (feedback_id, version);
CREATE INDEX notification_outbox_status_idx ON notification_outbox (status, created_at);

CREATE TRIGGER feedback_set_updated_at
BEFORE UPDATE ON feedback
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE FUNCTION protect_feedback_history()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'feedback history is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER feedback_history_immutable
BEFORE UPDATE OR DELETE ON feedback_history
FOR EACH ROW EXECUTE FUNCTION protect_feedback_history();
