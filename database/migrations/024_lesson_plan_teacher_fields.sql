ALTER TABLE lesson_plan
  ADD COLUMN duration_minutes integer,
  ADD COLUMN reference_notes text,
  ADD CONSTRAINT lesson_plan_duration_range CHECK (
    duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 600
  );
