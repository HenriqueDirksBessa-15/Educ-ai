ALTER TABLE activity_question
  DROP CONSTRAINT activity_question_position_unique,
  ADD CONSTRAINT activity_question_position_unique
    UNIQUE (activity_id, position) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE activity_alternative
  DROP CONSTRAINT activity_alternative_pkey,
  ADD CONSTRAINT activity_alternative_pkey
    PRIMARY KEY (question_id, position) DEFERRABLE INITIALLY DEFERRED;
