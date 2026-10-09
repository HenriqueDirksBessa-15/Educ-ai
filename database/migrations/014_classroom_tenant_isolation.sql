ALTER TABLE class_group
  DROP CONSTRAINT class_group_google_classroom_id_key;

ALTER TABLE class_group
  ADD CONSTRAINT class_group_professor_google_classroom_unique
  UNIQUE (professor_id, google_classroom_id);
