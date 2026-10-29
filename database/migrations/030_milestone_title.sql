-- Marco da linha do tempo ganha título; os antigos herdam o começo da descrição.
ALTER TABLE timeline_milestone ADD COLUMN title varchar(120);

UPDATE timeline_milestone SET title = left(description, 120) WHERE title IS NULL;

ALTER TABLE timeline_milestone
  ALTER COLUMN title SET NOT NULL,
  ADD CONSTRAINT timeline_milestone_title_not_blank CHECK (btrim(title) <> '');
