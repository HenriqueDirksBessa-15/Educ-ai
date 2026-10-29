-- Importação de alunos por planilha: matrícula por turma e e-mail opcional.
ALTER TABLE student ALTER COLUMN email DROP NOT NULL;

ALTER TABLE enrollment
  ADD COLUMN registration_number varchar(40),
  ADD CONSTRAINT enrollment_registration_not_blank
    CHECK (registration_number IS NULL OR btrim(registration_number) <> '');

CREATE UNIQUE INDEX enrollment_registration_unique
  ON enrollment (class_group_id, lower(registration_number))
  WHERE registration_number IS NOT NULL;
