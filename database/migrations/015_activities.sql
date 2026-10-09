CREATE TYPE activity_status AS ENUM ('draft', 'published', 'finished');
CREATE TYPE activity_type AS ENUM ('objective', 'discursive', 'mixed');
CREATE TYPE activity_question_kind AS ENUM ('objective', 'discursive');
CREATE TYPE activity_late_mode AS ENUM ('blocked', 'allowed_with_penalty');

CREATE TABLE activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid NOT NULL REFERENCES professor(id) ON DELETE RESTRICT,
  lesson_plan_id uuid NOT NULL REFERENCES lesson_plan(id) ON DELETE RESTRICT,
  title varchar(160) NOT NULL,
  description text NOT NULL,
  type activity_type NOT NULL,
  due_at timestamptz NOT NULL,
  late_mode activity_late_mode NOT NULL,
  late_penalty_percent smallint,
  status activity_status NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  finished_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT activity_description_not_blank CHECK (btrim(description) <> ''),
  CONSTRAINT activity_late_policy_valid CHECK (
    (late_mode = 'blocked' AND late_penalty_percent IS NULL)
    OR
    (late_mode = 'allowed_with_penalty' AND late_penalty_percent BETWEEN 0 AND 100)
  ),
  CONSTRAINT activity_status_dates_valid CHECK (
    (status = 'draft' AND published_at IS NULL AND finished_at IS NULL)
    OR
    (status = 'published' AND published_at IS NOT NULL AND finished_at IS NULL)
    OR
    (status = 'finished' AND published_at IS NOT NULL AND finished_at IS NOT NULL)
  )
);

CREATE TABLE activity_question (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES activity(id) ON DELETE CASCADE,
  position smallint NOT NULL,
  kind activity_question_kind NOT NULL,
  prompt text NOT NULL,
  points numeric(8,2) NOT NULL,
  target_answer text,
  criteria text,
  correct_alternative_index smallint,
  CONSTRAINT activity_question_position_unique UNIQUE (activity_id, position),
  CONSTRAINT activity_question_prompt_not_blank CHECK (btrim(prompt) <> ''),
  CONSTRAINT activity_question_points_positive CHECK (points > 0),
  CONSTRAINT activity_question_shape_valid CHECK (
    (kind = 'objective' AND target_answer IS NULL AND criteria IS NULL
      AND correct_alternative_index IS NOT NULL)
    OR
    (kind = 'discursive' AND target_answer IS NOT NULL AND criteria IS NOT NULL
      AND correct_alternative_index IS NULL)
  )
);

CREATE TABLE activity_alternative (
  question_id uuid NOT NULL REFERENCES activity_question(id) ON DELETE CASCADE,
  position smallint NOT NULL,
  text text NOT NULL,
  PRIMARY KEY (question_id, position),
  CONSTRAINT activity_alternative_text_not_blank CHECK (btrim(text) <> '')
);

-- A tabela será preenchida no Dia 10. Sua presença desde já torna explícita a
-- regra de arquivamento e evita exclusão destrutiva de atividades respondidas.
CREATE TABLE activity_response (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES activity(id) ON DELETE RESTRICT,
  external_student_id varchar(255) NOT NULL,
  submitted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_response_student_unique UNIQUE (activity_id, external_student_id)
);

CREATE FUNCTION protect_published_activity_structure()
RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'draft' AND (
    NEW.lesson_plan_id IS DISTINCT FROM OLD.lesson_plan_id
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.type IS DISTINCT FROM OLD.type
    OR NEW.due_at IS DISTINCT FROM OLD.due_at
    OR NEW.late_mode IS DISTINCT FROM OLD.late_mode
    OR NEW.late_penalty_percent IS DISTINCT FROM OLD.late_penalty_percent
  ) THEN
    RAISE EXCEPTION 'published activity structure is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER activity_protect_published_structure
BEFORE UPDATE ON activity
FOR EACH ROW EXECUTE FUNCTION protect_published_activity_structure();

CREATE FUNCTION protect_published_activity_questions()
RETURNS trigger AS $$
DECLARE
  current_activity_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    current_activity_id := OLD.activity_id;
  ELSE
    current_activity_id := NEW.activity_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM activity
    WHERE id = current_activity_id AND status <> 'draft'
  ) THEN
    RAISE EXCEPTION 'published activity questions are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER activity_question_protect_published
BEFORE INSERT OR UPDATE OR DELETE ON activity_question
FOR EACH ROW EXECUTE FUNCTION protect_published_activity_questions();

CREATE FUNCTION protect_published_activity_alternatives()
RETURNS trigger AS $$
DECLARE
  current_question_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    current_question_id := OLD.question_id;
  ELSE
    current_question_id := NEW.question_id;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM activity_question question
    JOIN activity ON activity.id = question.activity_id
    WHERE question.id = current_question_id AND activity.status <> 'draft'
  ) THEN
    RAISE EXCEPTION 'published activity alternatives are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER activity_alternative_protect_published
BEFORE INSERT OR UPDATE OR DELETE ON activity_alternative
FOR EACH ROW EXECUTE FUNCTION protect_published_activity_alternatives();

CREATE INDEX activity_professor_status_idx
  ON activity (professor_id, archived_at, status, updated_at DESC);
CREATE INDEX activity_question_activity_idx
  ON activity_question (activity_id, position);
CREATE INDEX activity_response_activity_idx
  ON activity_response (activity_id, submitted_at DESC);

CREATE TRIGGER activity_set_updated_at
BEFORE UPDATE ON activity
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
