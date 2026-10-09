CREATE TYPE activity_difficulty AS ENUM ('easy', 'medium', 'hard');
CREATE TYPE activity_generation_origin AS ENUM ('fixture', 'openai');
CREATE TYPE activity_generation_status AS ENUM ('succeeded', 'failed');
CREATE TYPE activity_generation_review_status AS ENUM ('generated', 'reviewed', 'approved');
CREATE TYPE activity_publication_status AS ENUM (
  'pending', 'creating_form', 'distributing', 'published', 'failed',
  'reconciliation_required'
);
CREATE TYPE activity_distribution_status AS ENUM ('pending', 'published', 'failed');
CREATE TYPE activity_collection_status AS ENUM ('pending', 'running', 'completed', 'failed');

ALTER TABLE activity
  ADD COLUMN difficulty activity_difficulty NOT NULL DEFAULT 'medium';

CREATE TABLE activity_generation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES activity(id) ON DELETE RESTRICT,
  version integer NOT NULL,
  model varchar(120) NOT NULL,
  origin activity_generation_origin NOT NULL,
  status activity_generation_status NOT NULL,
  review_status activity_generation_review_status,
  prompt_context jsonb NOT NULL,
  suggestion jsonb,
  error_code varchar(100),
  reviewed_suggestion jsonb,
  reviewed_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_generation_version_unique UNIQUE (activity_id, version),
  CONSTRAINT activity_generation_result CHECK (
    (status = 'succeeded' AND suggestion IS NOT NULL AND error_code IS NULL
      AND review_status IS NOT NULL)
    OR (status = 'failed' AND suggestion IS NULL AND error_code IS NOT NULL
      AND review_status IS NULL)
  ),
  CONSTRAINT activity_generation_review_dates CHECK (
    (review_status = 'generated' AND reviewed_at IS NULL AND approved_at IS NULL)
    OR (review_status = 'reviewed' AND reviewed_at IS NOT NULL AND approved_at IS NULL)
    OR (review_status = 'approved' AND reviewed_at IS NOT NULL AND approved_at IS NOT NULL)
    OR review_status IS NULL
  )
);

CREATE TABLE activity_publication (
  activity_id uuid PRIMARY KEY REFERENCES activity(id) ON DELETE RESTRICT,
  generation_id uuid REFERENCES activity_generation(id) ON DELETE RESTRICT,
  status activity_publication_status NOT NULL DEFAULT 'pending',
  google_form_id varchar(255) UNIQUE,
  responder_uri text,
  error_code varchar(100),
  attempt_count integer NOT NULL DEFAULT 0,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_publication_attempt_nonnegative CHECK (attempt_count >= 0),
  CONSTRAINT activity_publication_form_pair CHECK (
    (google_form_id IS NULL AND responder_uri IS NULL)
    OR (google_form_id IS NOT NULL AND responder_uri IS NOT NULL)
  )
);

CREATE TABLE activity_classroom_distribution (
  activity_id uuid NOT NULL REFERENCES activity(id) ON DELETE RESTRICT,
  class_group_id uuid NOT NULL REFERENCES class_group(id) ON DELETE RESTRICT,
  google_classroom_id varchar(255),
  google_course_work_id varchar(255),
  alternate_link text,
  status activity_distribution_status NOT NULL DEFAULT 'pending',
  error_code varchar(100),
  attempt_count integer NOT NULL DEFAULT 0,
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_id, class_group_id),
  CONSTRAINT activity_distribution_external_unique
    UNIQUE (google_classroom_id, google_course_work_id),
  CONSTRAINT activity_distribution_attempt_nonnegative CHECK (attempt_count >= 0)
);

CREATE TABLE activity_collection_job (
  activity_id uuid PRIMARY KEY REFERENCES activity(id) ON DELETE RESTRICT,
  scheduled_at timestamptz NOT NULL,
  status activity_collection_status NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  last_error_code varchar(100),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_collection_attempt_nonnegative CHECK (attempt_count >= 0)
);

CREATE INDEX activity_generation_latest_idx
  ON activity_generation (activity_id, version DESC);
CREATE INDEX activity_publication_status_idx
  ON activity_publication (status, updated_at);
CREATE INDEX activity_distribution_status_idx
  ON activity_classroom_distribution (status, updated_at);
CREATE INDEX activity_collection_due_idx
  ON activity_collection_job (status, scheduled_at);

CREATE TRIGGER activity_publication_set_updated_at
BEFORE UPDATE ON activity_publication
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER activity_distribution_set_updated_at
BEFORE UPDATE ON activity_classroom_distribution
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER activity_collection_set_updated_at
BEFORE UPDATE ON activity_collection_job
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
