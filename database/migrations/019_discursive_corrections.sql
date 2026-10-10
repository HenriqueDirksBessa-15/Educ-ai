CREATE TYPE submission_correction_status AS ENUM (
  'pending', 'suggested', 'manual_required', 'reviewed', 'approved', 'released'
);
CREATE TYPE classroom_return_status AS ENUM (
  'pending', 'not_available', 'returned', 'failed'
);
CREATE TYPE correction_history_action AS ENUM (
  'ai_suggestion', 'ai_failure', 'teacher_revision', 'approval',
  'release', 'release_failure'
);
CREATE TYPE correction_history_origin AS ENUM ('fixture', 'openai', 'teacher', 'system');

CREATE TYPE activity_answer_status_v2 AS ENUM (
  'graded', 'pending_discursive', 'teacher_reviewed', 'manual_review_required'
);

ALTER TABLE activity_submission
  ADD COLUMN correction_status submission_correction_status NOT NULL DEFAULT 'pending',
  ADD COLUMN teacher_comment text,
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN released_at timestamptz,
  ADD COLUMN classroom_return_status classroom_return_status NOT NULL DEFAULT 'pending',
  ADD COLUMN classroom_return_error_code varchar(120);

ALTER TABLE activity_submission_answer
  DROP CONSTRAINT activity_submission_answer_shape,
  ALTER COLUMN status TYPE activity_answer_status_v2 USING status::text::activity_answer_status_v2,
  ADD COLUMN suggested_points_awarded numeric(8,2),
  ADD COLUMN suggested_comment text,
  ADD COLUMN suggestion_requires_review boolean,
  ADD COLUMN teacher_comment text,
  ADD CONSTRAINT activity_submission_answer_shape CHECK (
    (status = 'graded' AND question_id IS NOT NULL AND is_correct IS NOT NULL
      AND points_awarded IS NOT NULL AND review_reason IS NULL)
    OR (status = 'pending_discursive' AND question_id IS NOT NULL
      AND is_correct IS NULL AND points_awarded IS NULL AND review_reason IS NULL)
    OR (status = 'teacher_reviewed' AND question_id IS NOT NULL
      AND is_correct IS NULL AND points_awarded IS NOT NULL AND review_reason IS NULL
      AND teacher_comment IS NOT NULL)
    OR (status = 'manual_review_required' AND is_correct IS NULL
      AND points_awarded IS NULL AND review_reason IS NOT NULL)
  ),
  ADD CONSTRAINT activity_submission_answer_suggestion_shape CHECK (
    (suggested_points_awarded IS NULL AND suggested_comment IS NULL
      AND suggestion_requires_review IS NULL)
    OR (suggested_points_awarded IS NOT NULL AND suggested_points_awarded >= 0
      AND suggested_comment IS NOT NULL AND suggestion_requires_review IS NOT NULL)
  );

DROP TYPE activity_answer_status;
ALTER TYPE activity_answer_status_v2 RENAME TO activity_answer_status;

CREATE TABLE activity_correction_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES activity_submission(id) ON DELETE RESTRICT,
  answer_id uuid REFERENCES activity_submission_answer(id) ON DELETE RESTRICT,
  version integer NOT NULL,
  action correction_history_action NOT NULL,
  origin correction_history_origin NOT NULL,
  model varchar(120),
  points_awarded numeric(8,2),
  grade numeric(4,2),
  comment text,
  requires_review boolean,
  error_code varchar(120),
  prompt_context jsonb,
  snapshot jsonb NOT NULL,
  professor_id uuid REFERENCES professor(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_correction_history_version_unique UNIQUE (submission_id, version),
  CONSTRAINT activity_correction_history_grade_valid CHECK (grade BETWEEN 0 AND 10),
  CONSTRAINT activity_correction_history_points_valid CHECK (
    points_awarded IS NULL OR points_awarded >= 0
  )
);

CREATE INDEX activity_correction_history_submission_idx
  ON activity_correction_history (submission_id, version);
CREATE INDEX activity_submission_correction_status_idx
  ON activity_submission (activity_id, correction_status, updated_at DESC);

CREATE FUNCTION protect_activity_correction_history()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'activity correction history is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER activity_correction_history_immutable
BEFORE UPDATE OR DELETE ON activity_correction_history
FOR EACH ROW EXECUTE FUNCTION protect_activity_correction_history();
