CREATE TYPE lesson_plan_status AS ENUM ('draft', 'generated', 'reviewed', 'approved');
CREATE TYPE lesson_plan_generation_origin AS ENUM ('fixture', 'openai');
CREATE TYPE lesson_plan_generation_status AS ENUM ('succeeded', 'failed');

ALTER TABLE lesson_plan
  ADD COLUMN status lesson_plan_status NOT NULL DEFAULT 'draft',
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN approved_at timestamptz;

ALTER TABLE lesson_plan_revision
  ADD COLUMN origin varchar(40) NOT NULL DEFAULT 'manual',
  ADD COLUMN model varchar(120),
  ADD COLUMN generation_id uuid;

CREATE TABLE lesson_plan_generation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_plan_id uuid NOT NULL REFERENCES lesson_plan(id) ON DELETE RESTRICT,
  version integer NOT NULL,
  model varchar(120) NOT NULL,
  origin lesson_plan_generation_origin NOT NULL,
  status lesson_plan_generation_status NOT NULL,
  prompt_context jsonb NOT NULL,
  suggestion jsonb,
  error_code varchar(100),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lesson_plan_generation_version_unique UNIQUE (lesson_plan_id, version),
  CONSTRAINT lesson_plan_generation_result CHECK (
    (status = 'succeeded' AND suggestion IS NOT NULL AND error_code IS NULL)
    OR (status = 'failed' AND suggestion IS NULL AND error_code IS NOT NULL)
  )
);

ALTER TABLE lesson_plan_revision
  ADD CONSTRAINT lesson_plan_revision_generation_fk
  FOREIGN KEY (generation_id) REFERENCES lesson_plan_generation(id) ON DELETE RESTRICT;

CREATE INDEX lesson_plan_generation_latest_idx
  ON lesson_plan_generation (lesson_plan_id, version DESC);
CREATE INDEX lesson_plan_status_idx
  ON lesson_plan (professor_id, status, updated_at DESC);
