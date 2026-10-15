ALTER TABLE activity_question
  ADD CONSTRAINT activity_question_activity_id_unique
    UNIQUE (activity_id, id);

CREATE TABLE activity_form_question_mapping (
  activity_id uuid NOT NULL REFERENCES activity_publication(activity_id) ON DELETE RESTRICT,
  question_id uuid NOT NULL,
  google_item_id varchar(255) NOT NULL,
  google_question_id varchar(255) NOT NULL,
  question_position smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_id, question_id),
  CONSTRAINT activity_form_question_item_unique
    UNIQUE (activity_id, google_item_id),
  CONSTRAINT activity_form_question_external_unique
    UNIQUE (activity_id, google_question_id),
  CONSTRAINT activity_form_question_position_unique
    UNIQUE (activity_id, question_position),
  CONSTRAINT activity_form_question_position_nonnegative
    CHECK (question_position >= 0),
  CONSTRAINT activity_form_question_owned_question
    FOREIGN KEY (activity_id, question_id)
    REFERENCES activity_question(activity_id, id) ON DELETE RESTRICT
);

CREATE TRIGGER activity_form_question_mapping_set_updated_at
BEFORE UPDATE ON activity_form_question_mapping
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
