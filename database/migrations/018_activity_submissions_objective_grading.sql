CREATE TYPE activity_submission_status AS ENUM (
  'collected', 'objective_graded', 'manual_review_required'
);
CREATE TYPE activity_answer_status AS ENUM (
  'graded', 'pending_discursive', 'manual_review_required'
);
CREATE TYPE activity_collection_run_status AS ENUM ('running', 'completed', 'failed');

CREATE TABLE activity_submission (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES activity(id) ON DELETE RESTRICT,
  student_id uuid REFERENCES student(id) ON DELETE RESTRICT,
  external_response_id varchar(255) NOT NULL,
  respondent_email citext,
  submitted_at timestamptz NOT NULL,
  status activity_submission_status NOT NULL DEFAULT 'collected',
  manual_review_reason varchar(120),
  objective_points_awarded numeric(8,2) NOT NULL DEFAULT 0,
  objective_points_possible numeric(8,2) NOT NULL DEFAULT 0,
  grade numeric(4,2),
  raw_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_submission_external_unique
    UNIQUE (activity_id, external_response_id),
  CONSTRAINT activity_submission_points_valid CHECK (
    objective_points_awarded >= 0
    AND objective_points_possible >= 0
    AND objective_points_awarded <= objective_points_possible
  ),
  CONSTRAINT activity_submission_grade_valid CHECK (grade BETWEEN 0 AND 10),
  CONSTRAINT activity_submission_review_reason CHECK (
    (status = 'manual_review_required' AND manual_review_reason IS NOT NULL)
    OR (status <> 'manual_review_required' AND manual_review_reason IS NULL)
  )
);

CREATE TABLE activity_submission_answer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES activity_submission(id) ON DELETE CASCADE,
  question_id uuid REFERENCES activity_question(id) ON DELETE RESTRICT,
  external_question_id varchar(255) NOT NULL,
  question_position smallint,
  answer_text text,
  status activity_answer_status NOT NULL,
  is_correct boolean,
  points_awarded numeric(8,2),
  review_reason varchar(120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_submission_answer_external_unique
    UNIQUE (submission_id, external_question_id),
  CONSTRAINT activity_submission_answer_points_valid CHECK (
    points_awarded IS NULL OR points_awarded >= 0
  ),
  CONSTRAINT activity_submission_answer_shape CHECK (
    (status = 'graded' AND question_id IS NOT NULL AND is_correct IS NOT NULL
      AND points_awarded IS NOT NULL AND review_reason IS NULL)
    OR (status = 'pending_discursive' AND question_id IS NOT NULL
      AND is_correct IS NULL AND points_awarded IS NULL AND review_reason IS NULL)
    OR (status = 'manual_review_required' AND is_correct IS NULL
      AND points_awarded IS NULL AND review_reason IS NOT NULL)
  )
);

CREATE TABLE activity_collection_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES activity(id) ON DELETE RESTRICT,
  professor_id uuid NOT NULL REFERENCES professor(id) ON DELETE RESTRICT,
  status activity_collection_run_status NOT NULL DEFAULT 'running',
  received_count integer NOT NULL DEFAULT 0,
  created_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  manual_review_count integer NOT NULL DEFAULT 0,
  error_code varchar(120),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT activity_collection_run_counts_valid CHECK (
    received_count >= 0 AND created_count >= 0
    AND updated_count >= 0 AND manual_review_count >= 0
  ),
  CONSTRAINT activity_collection_run_result_valid CHECK (
    (status = 'running' AND completed_at IS NULL AND error_code IS NULL)
    OR (status = 'completed' AND completed_at IS NOT NULL AND error_code IS NULL)
    OR (status = 'failed' AND completed_at IS NOT NULL AND error_code IS NOT NULL)
  )
);

CREATE INDEX activity_submission_activity_idx
  ON activity_submission (activity_id, submitted_at DESC);
CREATE INDEX activity_submission_student_idx
  ON activity_submission (student_id, submitted_at DESC)
  WHERE student_id IS NOT NULL;
CREATE INDEX activity_submission_status_idx
  ON activity_submission (activity_id, status, updated_at DESC);
CREATE INDEX activity_submission_answer_submission_idx
  ON activity_submission_answer (submission_id, question_position);
CREATE INDEX activity_collection_run_activity_idx
  ON activity_collection_run (activity_id, started_at DESC);

CREATE TRIGGER activity_submission_set_updated_at
BEFORE UPDATE ON activity_submission
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER activity_submission_answer_set_updated_at
BEFORE UPDATE ON activity_submission_answer
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
