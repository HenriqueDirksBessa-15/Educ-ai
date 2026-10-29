-- Turmas com conteúdo pedagógico são arquivadas em vez de excluídas; turmas
-- importadas do Google saem da lista local sem tocar no Classroom.
ALTER TABLE class_group ADD COLUMN archived_at timestamptz;

CREATE INDEX class_group_professor_active_idx
  ON class_group (professor_id, name) WHERE archived_at IS NULL;
