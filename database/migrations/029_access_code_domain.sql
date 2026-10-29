-- Entrada por código: e-mail fora do domínio da turma fica pendente de
-- validação. Sem domínio configurado, vale o domínio do e-mail do professor.
ALTER TABLE class_group
  ADD COLUMN allowed_email_domain citext,
  ADD CONSTRAINT class_group_email_domain_format CHECK (
    allowed_email_domain IS NULL
    OR allowed_email_domain::text ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'
  );
