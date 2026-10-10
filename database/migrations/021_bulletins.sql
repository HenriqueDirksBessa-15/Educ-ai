CREATE TYPE bulletin_period_type AS ENUM (
  'monthly', 'bimonthly', 'quarterly', 'annual', 'custom'
);
CREATE TYPE bulletin_status AS ENUM ('generated', 'pending', 'sent', 'failed');
CREATE TYPE bulletin_delivery_status AS ENUM ('pending', 'sent', 'failed');

CREATE TABLE bulletin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid NOT NULL REFERENCES professor(id) ON DELETE RESTRICT,
  class_group_id uuid NOT NULL REFERENCES class_group(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES student(id) ON DELETE RESTRICT,
  period_type bulletin_period_type NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  title varchar(180) NOT NULL,
  teacher_comment text,
  average numeric(4,2) NOT NULL,
  snapshot jsonb NOT NULL,
  pdf_data bytea NOT NULL,
  pdf_sha256 char(64) NOT NULL,
  status bulletin_status NOT NULL DEFAULT 'generated',
  last_error_code varchar(120),
  generated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT bulletin_period_valid CHECK (period_start <= period_end),
  CONSTRAINT bulletin_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT bulletin_average_valid CHECK (average BETWEEN 0 AND 10),
  CONSTRAINT bulletin_pdf_not_empty CHECK (octet_length(pdf_data) > 0),
  CONSTRAINT bulletin_status_valid CHECK (
    (status = 'sent' AND sent_at IS NOT NULL AND last_error_code IS NULL)
    OR (status = 'failed' AND sent_at IS NULL AND last_error_code IS NOT NULL)
    OR (status IN ('generated', 'pending') AND sent_at IS NULL AND last_error_code IS NULL)
  )
);

CREATE TABLE bulletin_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bulletin_id uuid NOT NULL REFERENCES bulletin(id) ON DELETE RESTRICT,
  attempt_number integer NOT NULL,
  recipient_email citext NOT NULL,
  status bulletin_delivery_status NOT NULL DEFAULT 'pending',
  error_code varchar(120),
  attempted_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT bulletin_delivery_attempt_unique UNIQUE (bulletin_id, attempt_number),
  CONSTRAINT bulletin_delivery_attempt_positive CHECK (attempt_number > 0),
  CONSTRAINT bulletin_delivery_result_valid CHECK (
    (status = 'pending' AND completed_at IS NULL AND error_code IS NULL)
    OR (status = 'sent' AND completed_at IS NOT NULL AND error_code IS NULL)
    OR (status = 'failed' AND completed_at IS NOT NULL AND error_code IS NOT NULL)
  )
);

CREATE INDEX bulletin_professor_generated_idx
  ON bulletin (professor_id, generated_at DESC);
CREATE INDEX bulletin_student_period_idx
  ON bulletin (student_id, period_start, period_end);
CREATE INDEX bulletin_delivery_bulletin_idx
  ON bulletin_delivery (bulletin_id, attempt_number DESC);

CREATE FUNCTION protect_bulletin_snapshot()
RETURNS trigger AS $$
BEGIN
  IF NEW.professor_id IS DISTINCT FROM OLD.professor_id
    OR NEW.class_group_id IS DISTINCT FROM OLD.class_group_id
    OR NEW.student_id IS DISTINCT FROM OLD.student_id
    OR NEW.period_type IS DISTINCT FROM OLD.period_type
    OR NEW.period_start IS DISTINCT FROM OLD.period_start
    OR NEW.period_end IS DISTINCT FROM OLD.period_end
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.teacher_comment IS DISTINCT FROM OLD.teacher_comment
    OR NEW.average IS DISTINCT FROM OLD.average
    OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
    OR NEW.pdf_data IS DISTINCT FROM OLD.pdf_data
    OR NEW.pdf_sha256 IS DISTINCT FROM OLD.pdf_sha256
    OR NEW.generated_at IS DISTINCT FROM OLD.generated_at
  THEN
    RAISE EXCEPTION 'bulletin historical copy is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bulletin_snapshot_immutable
BEFORE UPDATE ON bulletin
FOR EACH ROW EXECUTE FUNCTION protect_bulletin_snapshot();

CREATE FUNCTION protect_completed_bulletin_delivery()
RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'completed bulletin delivery is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bulletin_delivery_terminal_immutable
BEFORE UPDATE ON bulletin_delivery
FOR EACH ROW EXECUTE FUNCTION protect_completed_bulletin_delivery();
